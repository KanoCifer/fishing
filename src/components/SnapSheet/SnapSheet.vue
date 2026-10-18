<template>
  <!--
    节点是否渲染由 rendered 管，而不是 props.open。

    v-if 直接绑 open 的话，open 一变 false 节点立刻被卸载，
    退场动画还没来得及播就被拆掉了。所以 open 只作为"意图"，
    真正摘节点交给退场动画播完的 rendered。
    :key 让每次打开都是全新节点，入场 keyframes 必定重放，
    否则「关一半又立刻开」会沿用上一次跑完的动画态。
  -->
  <view v-if="rendered" :key="cycle" class="snap-sheet">
    <!-- 遮罩 -->
    <view class="snap-sheet__mask" :class="{ 'snap-sheet__mask--out': closing }" @tap="onMaskTap" />

    <!--
      面板本体。

      底边锚定在底部，只改 height 让它向上生长 —— 如果改 translateY，
      面板会整体下移露出下面的地图，那正是源项目注释里要避开的行为。

      但出入场动画用 translateY 是安全的：此刻 height 已经是最终值，
      translateY 只是个过渡期的视觉偏移，不是用来表示高度的，
      面板仍是"贴在底边、就地滑入"，不会露出地图。
    -->
    <view class="snap-sheet__panel" :class="{ 'snap-sheet__panel--out': closing }" :style="panelStyle">
      <!-- 拖拽把手：只有这一条区域响应拖拽 -->
      <view
        class="snap-sheet__handle"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view class="snap-sheet__handle-bar" />
      </view>

      <!-- 头部 -->
      <view v-if="$slots.header" ref="headerRef" class="snap-sheet__header">
        <slot name="header" />
      </view>

      <!--
        内容：独立滚动，不受拖拽影响。

        scroll-view 必须有确定高度 —— 小程序端它算不出 flex 父容器给的剩余高度，
        用 flex: 1 会得到 0 高度，内容既不滚动也看不见。所以按
        「面板高 − 把手 − 头部实测高」算好后直接绑定。
      -->
      <scroll-view class="snap-sheet__body" scroll-y :style="{ height: bodyHeight + 'px' }">
        <slot />
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SnapSheet —— iOS 风格多档底部抽屉。
 *
 * 对应源项目 SnapSheet.tsx。拖拽物理（阈值 + 速度判定 + 档位吸附）整体照搬，
 * 实现从 framer-motion 换成原生 touch 事件：
 * 小程序逻辑层没有 PointerEvent，也没有 requestAnimationFrame，
 * 手写 touchstart/touchmove/touchend 是这里唯一可行的路。
 *
 * 与源版本的差异：
 * - 无 backdrop 模糊。源版用 `backdrop-blur-[2px]`，小程序端毛玻璃只能靠
 *   `-webkit-backdrop-filter`；而遮罩背后是原生 map 的纹理，
 *   模糊大半张地图代价高、收益低，改成纯色半透明遮罩
 * - 无吸附的 spring 动画。档位切换直接落值：
 *   CSS transition 作用在 height 上能做过渡，但拖拽过程中每帧都在改 height，
 *   transition 会让面板"追不上手指"。改成拖拽跟手、抬手后过渡
 * - 出入场保留源版的动画语义，但换成 CSS keyframes（见模板与样式注释）：
 *   入场从底部滑入并轻微淡入，退场原路滑回，退场播完才摘节点
 * - 无 Esc 键关闭（触屏端无键盘）、无 lockScroll（scroll-view 自带滚动锁）
 */
import { computed, getCurrentInstance, nextTick, onUnmounted, ref, watch } from 'vue';

import { useNavMetrics } from '@/composables/useNavMetrics';

interface Props {
  open: boolean;
  /** 档位，按从小到大排列，单位 vh（视口高度的百分比） */
  snapPoints: readonly number[];
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
}

const props = withDefaults(defineProps<Props>(), {
  initialSnap: 0,
  mask: true,
  maskClosable: true,
  minHeight: 120,
  maxHeightRatio: 0.95,
});

const emit = defineEmits<{
  (e: 'close'): void;
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

/** 头部实测高度（px）。无 header 时为 0 */
const headerHeight = ref(0);

/**
 * 量一次头部高度。
 *
 * header 是 slot 进来的，内容高度不定（钓点详情有标题+日期，特征详情只有标题），
 * 写死常量必然对不上。用 SelectorQuery 量实际高度最稳。
 */
function measureHeader(): void {
  if (!instance) return;

  uni
    .createSelectorQuery()
    .in(instance)
    .select('.snap-sheet__header')
    .boundingClientRect((res) => {
      // 回调可能是单个矩形也可能是数组，与 canvas fields 同理
      const rect = Array.isArray(res) ? res[0] : res;
      const height = rect && typeof rect.height === 'number' ? rect.height : 0;
      if (height > 0) headerHeight.value = height;
    })
    .exec();
}

/** 滚动区高度 = 面板高 − 把手 − 头部 */
const bodyHeight = computed(() => Math.max(0, heightPx.value - HANDLE_HEIGHT - headerHeight.value));

const snap = ref(props.initialSnap);

/** 当前高度（px）。拖拽中由手指直驱，抬手后吸附到档位 */
const heightPx = ref(0);

/** 拖拽中为 true，用于关掉 CSS transition，让高度跟手 */
const dragging = ref(false);

// ── 出入场 ──
//
// 用 keyframes 而不是 transition：transition 需要"先渲染静止态、
// 再改值"才会补间，而 v-if 挂载的节点只有一次渲染机会，
// 直接赋终态不会补间。keyframes 由浏览器自己管起点，稳。
//
// 退场要等动画播完才能摘节点（见模板注释），小程序没有 transitionend，
// 只能自己计时 —— 时长必须和 CSS 里的 0.26s 对齐，改一处就得改另一处。

/** 退场时长（ms），与 CSS 中 snap-sheet-out 的时长保持一致 */
const EXIT_MS = 260;

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

onUnmounted(clearExitTimer);

const windowHeight = uni.getWindowInfo().windowHeight;

/** 面板最大可用高度：视口减去导航栏高度 */
const maxHeight = computed(() => windowHeight - nav.navBarBottom);

/** 档位 → px */
function snapToPx(index: number): number {
  const ratio = props.snapPoints[index];
  if (ratio === undefined) return props.minHeight;

  const px = (ratio / 100) * windowHeight;
  return Math.max(props.minHeight, Math.min(maxHeight.value, px));
}

const panelStyle = computed(() => ({
  height: `${heightPx.value}px`,
  // 曲线与时长照抄 uni.scss 的 $fish-spring / $fish-dur-base（行内 style 不走 SCSS，
  // 变量传不进来，只能写死并在注释里指回源头）。抬手吸附走临界阻尼、不回弹：
  // 档位切换是「落位」不是「甩过去」，加了过冲会读成弹了一下。
  transition: dragging.value ? 'none' : 'height 280ms cubic-bezier(0.2, 0, 0, 1)',
}));

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
      // 等面板真渲染出来再量头部 —— 此刻节点还没进 DOM，量了也是 0
      void nextTick().then(measureHeader);
      return;
    }

    // 关闭：先播退场，播完再摘节点。已关闭状态下重复触发直接跳过，
    // 免得连点两次遮罩排出多个定时器。
    if (!rendered.value) return;
    closing.value = true;
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

/** 拖拽起点：手指 Y + 起始高度 */
let startY = 0;
let startHeight = 0;
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
  lastMoveY = touch.clientY;
  lastMoveTime = Date.now();
  velocity = 0;
  dragging.value = true;
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;

  // 手指上移为正
  const deltaY = startY - touch.clientY;
  const next = Math.max(props.minHeight, Math.min(maxHeight.value, startHeight + deltaY));
  heightPx.value = next;

  // 瞬时速度（px/s）。取最近一次 move 的差值，不做平滑 ——
  // 松手前那一下的手势方向才是用户意图
  const dt = (Date.now() - lastMoveTime) / 1000;
  if (dt > 0) {
    velocity = (lastMoveY - touch.clientY) / dt;
  }
  lastMoveY = touch.clientY;
  lastMoveTime = Date.now();
}

function onTouchEnd() {
  if (!dragging.value) return;
  dragging.value = false;

  const delta = heightPx.value - startHeight;

  if (delta < -DRAG_THRESHOLD || velocity < -VELOCITY_THRESHOLD) {
    // 往下拖：已在最小档就关闭，否则收缩一档
    if (snap.value === 0) {
      emit('close');
      return;
    }
    snap.value = Math.max(0, snap.value - 1);
    return;
  }

  if (delta > DRAG_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
    snap.value = Math.min(props.snapPoints.length - 1, snap.value + 1);
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
   * 入场：从底部下方滑上来，落位时归零 transform。
   *
   * 这里动 transform 而不是 height：入场是瞬时的一次性动画，
   * 不像拖拽那样每帧都在变 height，中间高度跳来跳去会很难看。
   * 面板始终贴底，滑入过程中露出的是地图，本来就该露。
   *
   * 曲线用 $fish-ease-out：末端加速后急停，是 iOS 呈现面板的形状。
   * 420ms 给了它足够的「被拿起来」的分量，再短就退化成淡入了。
   */
  animation: snap-panel-in $fish-dur-slow $fish-ease-out both;
}

/* 退场：原路滑回底部。260ms 必须与脚本里的 EXIT_MS 一致 */
.snap-sheet__panel--out {
  animation: snap-panel-out 260ms $fish-ease-in both;
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
  background-color: $fish-muted-60;
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
 * 入场：translateY 用百分比，锚的是面板自身高度，
 * 所以不管当前档位多高，起点都在「刚好完全藏在屏幕下方」，
 * 不会出现矮面板只滑一半就露底的情况。
 * scale 收到 0.98 而不是 0.9：底边钉住不动，只让上沿微微前倾，
 * 缩太狠会看出面板在「变小」。
 */
@keyframes snap-panel-in {
  from {
    opacity: 0;
    transform: translateY(100%) scale(0.98);
  }
  to {
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
