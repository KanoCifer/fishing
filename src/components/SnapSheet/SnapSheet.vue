<template>
  <view v-if="rendered" :key="cycle" class="snap-sheet">
    <!--
      遮罩。

      catchtap / catchtouchmove：遮罩是全屏的，落在它上面的手势只属于这个浮层。
      用 catch 截住，背后的页面才收不到 —— 否则在遮罩上随手一划，背后的列表
      会跟着滚，背后的地图会跟着平移。

      这里挡的是 WebView 层的事件。地图是原生组件，同层渲染下它的原生手势
      不受这层拦截影响，那一半靠地图自身的 interactive 关掉，
      见 FullscreenMap 的 interactive。
    -->
    <view
      class="snap-sheet__mask"
      :class="{ 'snap-sheet__mask--out': closing }"
      @tap.stop="onMaskTap"
      @touchmove.stop="swallowGesture"
    />
    <!--
      面板。

      catchtap / catchtouchmove：浮层里的手势不外泄。touchmove 这一层还兼着
      截断 scroll-view 冒泡到页面的路径 —— 面板内滑到底继续划，背景页不再跟着滚。
    -->
    <view
      class="snap-sheet__panel"
      :class="{
        'snap-sheet__panel--out': closing,
        'snap-sheet__panel--preparing': preparing,
        'snap-sheet__panel--dragging': dragging,
      }"
      :style="panelStyle"
      @tap.stop="swallowGesture"
      @touchmove.stop="swallowGesture"
    >
      <!--
        拖拽把手：只有这一条区域响应拖拽。

        四个事件全用 catch：拖拽是这一处的独占手势，一旦冒泡出去，
        背后的页面会跟着滚、背后的地图会跟着动。
      -->
      <view
        class="snap-sheet__handle"
        @touchstart.stop="onTouchStart"
        @touchmove.stop="onTouchMove"
        @touchend.stop="onTouchEnd"
        @touchcancel.stop="onTouchEnd"
      >
        <view class="snap-sheet__handle-bar" />
      </view>

      <!-- 头部 -->
      <view
        v-if="$slots.header"
        ref="headerRef"
        class="snap-sheet__header snap-sheet__enter"
        :style="{ animationDelay: enterDelay(CONTENT_BASE) }"
      >
        <slot name="header" />
      </view>
      <scroll-view class="snap-sheet__body" scroll-y :style="bodyStyle">
        <!--
          正文包一层，是给 fitContent 量的。

          面板高度要按内容算，就得知道正文有多高。而 slot 进来的是各页面
          自己的根节点，样式各不相同，没有一个统一的类可以量 ——
          包一层才有固定的盒子可量。

          这一层也是内容落位的第一段（正文）。落位动的是 transform，
          不改布局高度 —— 量出来的高度和最终的高度是同一个。
        -->
        <view
          class="snap-sheet__body-inner snap-sheet__enter"
          :style="{ animationDelay: enterDelay(CONTENT_BASE + 1) }"
        >
          <slot />
        </view>
      </scroll-view>

      <!--
        底部动作区（可选）。

        某些浮层的动作不该跟着正文滚 —— 「保存到相册」「发送给朋友」
        这种按钮是浮层的一部分，正文滚走了它还得在原处。
        用插槽而不是让页面自己塞进正文，是因为正文是滚动区，
        塞进去的按钮会跟着滚走，还得自己再补一遍定位。
      -->
      <view
        v-if="$slots.footer"
        ref="footerRef"
        class="snap-sheet__footer snap-sheet__enter"
        :style="{ animationDelay: enterDelay(CONTENT_BASE + 2) }"
      >
        <slot name="footer" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onUnmounted, ref, watch } from 'vue';

import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { haptic } from '@/utils/haptics';
import { enterDelay } from '@/utils/motion';
import { createSelectorQuery } from '@/utils/selectorQuery';

interface Props {
  open: boolean;
  /** 档位，按从小到大排列，单位 vh（视口高度的百分比） */
  snapPoints?: readonly number[];
  /** 初始档位下标 */
  initialSnap?: number;
  /** 是否显示遮罩 */
  mask?: boolean;
  /** 点击遮罩是否关闭 */
  maskClosable?: boolean;
  /** 最小高度（px），防止拖到负 */
  minHeight?: number;
  /** 最大高度占比（视口高度的比例），留出顶部导航的空间 */
  maxHeightRatio?: number;
  /**
   * 面板高度按内容算，而不是按视口百分比。
   *
   * 内容短的浮层（分享海报、确认框）用百分比高度，正文与底部动作区之间
   * 会空出一大片 —— 空白把动作推远，看着像动作掉到了屏幕底下。
   * 开了这个，面板高度 = 把手 + 头部 + 正文 + 底部动作区：正文多高，面板就多高。
   */
  fitContent?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  snapPoints: () => [],
  initialSnap: 0,
  mask: true,
  maskClosable: true,
  minHeight: 120,
  maxHeightRatio: 0.95,
  fitContent: false,
});

const emit = defineEmits<{
  close: [];
}>();

const nav = useNavMetrics();
const instance = getCurrentInstance()!;

/**
 * 拖拽把手区实测高度（px）：上下 padding（24 + 12）+ 指示条 10 = 46rpx。
 *
 * 用 upx2px 现场换算而不是写死数字：这个值要参与滚动区高度的算式
 * （面板高 − 把手 − 头部），写死等于把样式里那串 padding 又抄了一份，
 * 以后改 padding 忘了回来改这里，滚动区就会凭空短一截或长一截。
 * 代价只有一次函数调用，换掉的是一整类「两处必须同时改」的坑。
 */
const HANDLE_HEIGHT = uni.upx2px(46);

const { windowHeight } = useViewport();

/** 面板最大可用高度：视口减去导航栏高度 */
const maxHeight = computed(() => windowHeight - nav.navBarBottom);

const snap = ref(props.initialSnap);

/** 当前高度（px）。拖拽中由手指直驱，抬手后吸附到档位 */
const heightPx = ref(0);

/** 拖拽中为 true，用于关掉 CSS transition，让高度跟手 */
const dragging = ref(false);

/** 头部实测高度（px）。无 header 时为 0 */
const headerHeight = ref(0);

/** 底部动作区实测高度（px）。无 footer 时为 0 */
const footerHeight = ref(0);

/** 正文内容实测高度（px）。fitContent 时面板高度按它算 */
const contentHeight = ref(0);

/**
 * 准备阶段：面板先量，再动。
 *
 * 测量的那几十毫秒里，面板不能带着缩放 —— 缩放会改盒子高度，
 * 量出来的正文高度就是假的，滚动区会凭空短一截。
 * 也不能已经滑进来了：那是内容定高的浮层，从估值高度长到真实高度，
 * 看着像自己弹了一下。
 *
 * 所以这段时间面板的入场动画按着不动，量完再放它入场。
 */
const preparing = ref(false);

/**
 * 测量兜底时限（ms）。
 *
 * 量高回不来时不能让面板一直藏着 —— 那等于浮层打不开，
 * 用户只能戳遮罩把它关掉。宁可先用估值高度出场。
 */
const PREPARE_TIMEOUT_MS = 400;

/** 兜底定时器。量回来了就撤掉 */
let prepareTimer: ReturnType<typeof setTimeout> | null = null;

function clearPrepareTimer(): void {
  if (prepareTimer !== null) {
    clearTimeout(prepareTimer);
    prepareTimer = null;
  }
}

/**
 * 量一次头部、正文、底部动作区。
 *
 * 三处都是 slot 进来的，内容高度不定（钓点详情有标题+日期，文档抽屉只有标题），
 * 写死常量必然对不上。用 SelectorQuery 量实际高度最稳。
 *
 * 一次查询量完而不是分三次：fitContent 下面板高度是三者的和，
 * 分三次量要等三个回调，落地高度会被改两次（先矮后高，浮层跳一下）。
 */
function measure(): void {
  createSelectorQuery(instance)
    .select('.snap-sheet__header')
    .boundingClientRect()
    .select('.snap-sheet__footer')
    .boundingClientRect()
    .select('.snap-sheet__body-inner')
    .boundingClientRect()
    .exec((res) => {
      const header = rectHeight(res[0]);
      const footer = rectHeight(res[1]);
      const content = rectHeight(res[2]);

      if (header > 0) headerHeight.value = header;
      if (footer > 0) footerHeight.value = footer;
      if (content > 0) contentHeight.value = content;

      // 内容定高的浮层：量完才知道自己该多高，这时候才把它放出来
      if (props.fitContent) {
        heightPx.value = snapToPx(snap.value);
      }

      // 量完了，放手让它入场
      clearPrepareTimer();
      preparing.value = false;
    });
}

/** 从选择器回调的结果里取高度。回调可能是单个矩形也可能是数组 */
function rectHeight(res: unknown): number {
  const rect = (Array.isArray(res) ? res[0] : res) as { height?: number } | null | undefined;
  return rect && typeof rect.height === 'number' ? rect.height : 0;
}

/**
 * 面板高度（px）：把手 + 头部 + 正文 + 底部动作区。
 *
 * fitContent 用它 —— 内容有多高，面板就有多高。
 */
const fitHeight = computed(() => HANDLE_HEIGHT + headerHeight.value + contentHeight.value + footerHeight.value);

/**
 * 滚动区高度。
 *
 * 默认：面板高 − 把手 − 头部 − 底部动作区。
 * 底部动作区这一项不能少扣：它就贴在面板底边上，
 * 不扣的话正文底部那一截永远被它盖住 —— 而正文底部往往正是最该看见的内容。
 *
 * fitContent：正文的自然高度（量出来是多少就是多少）。
 * 量出来之前先给足空间 —— 量一个被裁过的盒子，量到的是裁后的高度。
 */
const bodyHeight = computed(() => {
  if (props.fitContent) {
    if (contentHeight.value === 0) return Math.max(0, maxHeight.value - HANDLE_HEIGHT);
    const room = Math.max(0, maxHeight.value - HANDLE_HEIGHT - headerHeight.value - footerHeight.value);
    return Math.min(contentHeight.value, room);
  }

  return Math.max(0, heightPx.value - HANDLE_HEIGHT - headerHeight.value - footerHeight.value);
});

// ── 出入场 ──
// 用 keyframes 而不是 transition：transition 需要"先渲染静止态、
// 再改值"才会补间，而 v-if 挂载的节点只有一次渲染机会，
// 直接赋终态不会补间。keyframes 由浏览器自己管起点，稳。
//
// 退场要等动画播完才能摘节点（见模板注释），小程序没有 transitionend，
// 只能自己计时 —— 时长必须和 CSS 里的 0.26s 对齐，改一处就得改另一处。

/** 退场时长（ms），与 CSS 中 snap-sheet-out 的时长保持一致 */
const EXIT_MS = 260;

/**
 * 内容落位的起点序号。
 *
 * 面板自己还要滑 $fish-dur-sheet 才到位，内容晚一拍开始落位：
 * 面板先落、内容再落，两层才有先后，不然整块一起动只剩一层。
 *
 * 序号走 enterDelay 的 60ms 步长（见 utils/motion）：4 → 240ms，
 * 头部、正文、底部动作依次往后挪一格。
 */
const CONTENT_BASE = 4;

/** 节点真实存在。open 只是意图，动画播完才落到这里 */
const rendered = ref(false);
/** 退场中：动画已触发、节点尚未卸载 */
const closing = ref(false);
/** 每次打开自增，作为 key 强制重建节点，保证入场动画重放 */
const cycle = ref(0);

/** 退场计时器。重新打开时必须清掉，否则旧定时器会提前把新节点摘掉 */
let exitTimer: ReturnType<typeof setTimeout> | null = null;

function clearExitTimer(): void {
  if (exitTimer !== null) {
    clearTimeout(exitTimer);
    exitTimer = null;
  }
}

onUnmounted(() => {
  clearExitTimer();
  clearPrepareTimer();
});

/** 档位 → px */
function snapToPx(index: number): number {
  // 内容定高的浮层没有档位：高度就是内容有多高
  if (props.fitContent) {
    return Math.max(props.minHeight, Math.min(maxHeight.value, fitHeight.value));
  }

  const ratio = props.snapPoints[index];
  if (ratio === undefined) return props.minHeight;

  const px = (ratio / 100) * windowHeight;
  return Math.max(props.minHeight, Math.min(maxHeight.value, px));
}

const panelStyle = computed(() => ({
  height: `${heightPx.value}px`,
  // 曲线与时长照抄令牌层 _motion.scss 的 $fish-spring / $fish-dur-base（行内 style 不走 SCSS，
  // 变量传不进来，只能写死并在注释里指回源头）。抬手吸附走临界阻尼、不回弹：
  // 档位切换是「落位」不是「甩过去」，加了过冲会读成弹了一下。
  // 内容定高时不过渡：高度只在量完那一下定一次，滑过去反而像自己长高了。
  transition: dragging.value || props.fitContent ? 'none' : 'height 280ms cubic-bezier(0.2, 0, 0, 1)',
}));

/** 滚动区的行内高度 */
const bodyStyle = computed(() => ({ height: `${bodyHeight.value}px` }));

watch(
  () => props.open,
  (open) => {
    // 上一次关闭的退场定时器还挂着的话，必须先撤。
    // 否则「关一半又开」会被旧定时器把刚建好的节点摘掉。
    clearExitTimer();

    if (open) {
      snap.value = props.initialSnap;
      heightPx.value = snapToPx(props.initialSnap);
      rendered.value = true;
      closing.value = false;
      cycle.value += 1;
      // 先量再动：量完之前入场动画按着不动
      preparing.value = true;
      // 量不回来也得让它出来：兜底时限一到就放手
      clearPrepareTimer();
      prepareTimer = setTimeout(() => {
        prepareTimer = null;
        preparing.value = false;
      }, PREPARE_TIMEOUT_MS);
      // 等面板真渲染出来再量头部、正文与底部动作区 —— 此刻节点还没进 DOM，量了也是 0
      void nextTick().then(() => {
        measure();
      });
      return;
    }

    // 关闭：先播退场，播完再摘节点。已关闭状态下重复触发直接跳过，
    // 免得连点两次遮罩排出多个定时器。
    if (!rendered.value) return;
    closing.value = true;
    // 量高度还没完就被关掉：先把它放出来，不然退场动画演给空气看
    clearPrepareTimer();
    preparing.value = false;
    exitTimer = setTimeout(() => {
      rendered.value = false;
      closing.value = false;
      exitTimer = null;
    }, EXIT_MS);
  },
  { immediate: true },
);

watch(snap, (index) => {
  // 拖拽中不跟随 snap 改高度 —— 高度此刻归手指管
  if (dragging.value) return;
  heightPx.value = snapToPx(index);
});

// ── 拖拽 ──

/**
 * 空处理：把浮层内的手势截在这里。
 *
 * mp-weixin 的 catch 事件必须挂一个函数，函数本身做什么无所谓 ——
 * 起作用的是 catch 前缀：事件不再往上冒泡，背后的页面也就收不到这次滑动/点击。
 *
 * 面板上挂它不会影响面板内 scroll-view 滚动：scroll-view 是区域滚动，
 * 自己的滚动由组件自己处理，catch 只断冒泡，不取消这次滚动。
 * 但面板上只挂 touchmove、不碰 touchstart —— catchtouchstart 会把
 * scroll-view 的手势一起抢走，滚动就废了。
 */
function swallowGesture(): void {}

/** 拖拽起点：手指 Y + 起始高度 */
let startY = 0;
let startHeight = 0;
/** 手指走了多远（px，向上为正）。内容定高的浮层高度不跟手走，判断手势只能看它 */
let dragDelta = 0;
/** 上一次 move 的位置和时间，用来算瞬时速度 */
let lastMoveY = 0;
let lastMoveTime = 0;
let velocity = 0;

const DRAG_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 500;

function onTouchStart(e: TouchEvent) {
  // 退场动画播到一半时不接受拖拽：此刻定时器随时会把节点摘掉，
  // 手势改再多的 heightPx 也是白改。
  if (closing.value) return;

  const touch = e.touches[0];
  if (!touch) return;

  startY = touch.clientY;
  startHeight = heightPx.value;
  dragDelta = 0;
  lastMoveY = touch.clientY;
  lastMoveTime = Date.now();
  velocity = 0;
  dragging.value = true;
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;

  // 手指上移为正
  dragDelta = startY - touch.clientY;

  // 内容定高的浮层不改高度：它的高度是内容决定的，拖不出下一档
  if (!props.fitContent) {
    const next = Math.max(props.minHeight, Math.min(maxHeight.value, startHeight + dragDelta));
    heightPx.value = next;
  }

  // 瞬时速度（px/s）。取最近一次 move 的差值，不做平滑 ——
  // 松手前那一下的手势方向才是用户意图
  const dt = (Date.now() - lastMoveTime) / 1000;
  if (dt > 0) {
    velocity = (lastMoveY - touch.clientY) / dt;
  }
  lastMoveY = touch.clientY;
  lastMoveTime = Date.now();
}

/**
 * 换档。档位真的变了才给一次轻震。
 *
 * 震的是「面板落到新的一档」这个物理结果：手已经离开屏幕，
 * 这一下只靠眼睛盯高度变化容易读漏。
 *
 * 档位没变不震（拖到顶又弹回原档）—— 那是回弹，不是落位。
 */
function moveSnapTo(index: number): void {
  const next = Math.min(props.snapPoints.length - 1, Math.max(0, index));
  if (next === snap.value) return;
  snap.value = next;
  haptic('light');
}

function onTouchEnd() {
  if (!dragging.value) return;
  dragging.value = false;

  // 内容定高的浮层高度不跟手走，判断手势只能看手指走了多远
  const delta = props.fitContent ? dragDelta : heightPx.value - startHeight;

  if (delta < -DRAG_THRESHOLD || velocity < -VELOCITY_THRESHOLD) {
    // 往下拖：已在最小档就关闭，否则收缩一档
    // 内容定高的浮层只有一档，往下拖就是关掉
    if (props.fitContent || snap.value === 0) {
      emit('close');
      return;
    }
    moveSnapTo(snap.value - 1);
    return;
  }

  if (delta > DRAG_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
    // 内容定高的浮层没有下一档，往上拖无处可去
    if (props.fitContent) return;
    moveSnapTo(snap.value + 1);
    return;
  }

  // 不到阈值：watch(snap) 不触发（snap 没变），手动弹回当前档
  heightPx.value = snapToPx(snap.value);
}

function onMaskTap() {
  if (props.maskClosable) emit('close');
}
</script>

<style lang="scss" scoped>
.snap-sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
}

.snap-sheet__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: $fish-scrim;
  animation: snap-mask-in $fish-dur-base $fish-ease-out both;
}

/* 退场遮罩：比面板早收，让面板滑落时背景已经暗回去 */
.snap-sheet__mask--out {
  animation: snap-mask-out 260ms $fish-ease-in both;
}

.snap-sheet__panel {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top-left-radius: $fish-radius-sheet;
  border-top-right-radius: $fish-radius-sheet;
  background-color: $fish-page;
  /*
   * 投影让面板从地图上"浮起"。
   * 背后是原生 map，投影是唯一能表达高度的手段（没有 backdrop-filter 兜底），
   * 所以这一层要比普通卡片重：向上扩散的范围更大、衰减更慢。
   */
  box-shadow: 0 -8rpx 40rpx rgba(0, 0, 0, 0.16);
  /*
   * transform-origin 钉在底边。
   *
   * 入场末尾要越过落点一点再落定（弹簧感），缩放过冲时底边必须留在屏幕上：
   * 以中心为原点的话，面板会离地，屏幕底下露出一条缝。
   * 钉在底边之后，越过的是上沿 —— 读作「它被顶过头了一点」，不是「它飘了一下」。
   */
  transform-origin: bottom center;
  /*
   * 入场：从底部下方滑上来，越过一点，落定。
   *
   * 这里动 transform 而不是 height：入场是瞬时的一次性动画，
   * 不像拖拽那样每帧都在变 height，中间高度跳来跳去会很难看。
   * 面板始终贴底，滑入过程中露出的是地图，本来就该露。
   *
   * 时长用 $fish-dur-sheet（600ms）：面板是一次性位移，观众全程盯着它，
   * 800ms 那条是给「内容慢慢就位」用的，套在这里等于让人多等半秒。
   */
  animation: snap-panel-in $fish-dur-sheet both;
}

/* 退场：原路滑回底部。260ms 必须与脚本里的 EXIT_MS 一致 */
.snap-sheet__panel--out {
  animation: snap-panel-out 260ms $fish-ease-in both;
}

/*
 * 拖拽期间去掉投影。
 *
 * 投影是 40rpx 的大模糊。面板跟手时高度每一帧都在变，投影就得每一帧重新光栅化 ——
 * 这是整个拖拽过程里最贵的一笔重绘（大模糊阴影比改个高度贵得多）。
 * 而投影本来就是「浮在地图上」的高度提示，拖拽的那几百毫秒里它基本看不出来。
 * 松手后立刻回来。
 */
.snap-sheet__panel--dragging {
  box-shadow: none;
}

/*
 * 准备阶段的浮层：先量，再动。
 *
 * 测量的那几十毫秒里，面板不能带缩放 —— 缩放会改盒子高度，
 * 量出来的正文高度就是假的，滚动区会凭空短一截。
 * 所以这段时间入场动画先按住（animation: none），量到的就是真的。
 *
 * 也不能让它已经滑进来：内容定高的浮层在量之前只有估值高度，
 * 那一下会从矮长到高，看着像自己弹了一下。
 *
 * 用 opacity 而不是 visibility：元素照样参与布局、照样量得到高度，
 * 只是不画出来；visibility: hidden 在部分内核上不参与命中测试，
 * 这里还要 pointer-events: none 让这一帧的点击穿透到遮罩。
 *
 * 量完、--preparing 摘掉，入场动画才从头播。切换那一帧不会闪出面板：
 * 入场动画的 from 帧也是 opacity: 0，摘掉遮罩的那一刻它还是透明的。
 */
.snap-sheet__panel--preparing {
  opacity: 0;
  pointer-events: none;
  animation: none;
}

/*
 * 浮层内内容的落位。
 *
 * 头部、正文、底部动作各晚一格落下来（延迟走行内 animation-delay，
 * 见脚本里的 CONTENT_BASE）。幅度比页面内的小：面板本身在滑，
 * 内容再大幅上移就是两层位移叠在一起。
 */
.snap-sheet__enter {
  @include fish-enter-sheet;
}

/*
 * 测量窗口里，内容回到「没动画」的样子。
 *
 * 量的是头部、正文、底部动作区这三个盒子，它们身上带着落位动画。
 * 落位只动 opacity 和位移，尺寸不变，量到的仍是布局高度 ——
 * 但让它们在测量时回到常态（可见、不带 transform）最稳：
 * 量到的就是最终布局，量完动画再从头播。
 *
 * 摘掉 --preparing 的那一刻面板也是透明的（入场动画的 from 帧是 opacity: 0），
 * 所以内容在那一瞬「显形又隐去」看不见。
 */
.snap-sheet__panel--preparing .snap-sheet__enter {
  opacity: 1;
  transform: none;
  animation: none;
}

/*
 * 拖拽把手。
 * HANDLE_HEIGHT 是脚本里按这套 padding + 指示条高度算出来的常量（54px），
 * 改这里的 padding 必须回去同步那个数，否则滚动区会算错高度。
 */
.snap-sheet__handle {
  padding: 24rpx 40rpx 12rpx;
  flex-shrink: 0;
}

/* 抓握条：36pt × 5pt，是 iOS sheet 的标准把手尺寸 */
.snap-sheet__handle-bar {
  width: 72rpx;
  height: 10rpx;
  margin: 0 auto;
  border-radius: $fish-radius-pill;
  background-color: $fish-faint;
}

.snap-sheet__header {
  flex-shrink: 0;
}

/*
 * 高度由脚本算好后绑定，见模板注释。
 * flex-shrink: 0 —— 内容超高时不让 flex 把滚动区压扁，否则又滚不动。
 */
.snap-sheet__body {
  width: 100%;
  flex-shrink: 0;
}

/*
 * 正文包的那一层。
 *
 * display: flow-root 是为了不跟子元素的外边距合并 ——
 * 合并掉的外边距不在这一层的盒子里，量出来的正文高度就会短一截。
 * 老内核不认这个值，退回 block，行为退回原样，不会出事。
 */
.snap-sheet__body-inner {
  display: flow-root;
}

/*
 * 底部动作区。
 *
 * 贴在面板底边，不跟着正文滚。flex-shrink: 0 与滚动区同理 ——
 * 它一被压扁，按钮就贴到 home indicator 上去了。
 */
.snap-sheet__footer {
  flex-shrink: 0;
}

@keyframes snap-mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes snap-mask-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/**
 * 入场：滑上来 → 越过一点 → 落定。
 *
 * 分三段而不是一条曲线：弹簧的「过冲再回落」得自己写出来。
 * 一条 cubic-bezier 的过冲是按比例作用于所有属性的 —— 面板位移按自身高度算，
 * 缩放只有 2%，同一个过冲比例会让面板离地 1%，屏幕底下露出一条缝。
 * 所以行程和回摆分开写，各自配一条曲线。
 *
 * translateY 用百分比，锚的是面板自身高度，
 * 所以不管当前档位多高，起点都在「刚好完全藏在屏幕下方」，
 * 不会出现矮面板只滑一半就露底的情况。
 *
 * scale 收到 0.98 而不是 0.9：底边钉住不动，只让上沿微微前倾，
 * 缩太狠会看出面板在「变小」。
 */
@keyframes snap-panel-in {
  0% {
    opacity: 0;
    transform: translateY(100%) scale(0.98);
    /* 行程：末端加速后急停 */
    animation-timing-function: $fish-ease-out;
  }

  70% {
    opacity: 1;
    /* 越过一点：底边钉在屏幕上，越过的是上沿 */
    transform: translateY(0) scale(1.002);
    /* 回摆：临界阻尼，不来回弹 */
    animation-timing-function: $fish-spring;
  }

  86% {
    transform: translateY(0);
    animation-timing-function: $fish-ease-out;
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes snap-panel-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(100%) scale(0.98);
  }
}
</style>
