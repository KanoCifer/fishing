<template>
  <view class="minutely">
    <view class="minutely__head">
      <view class="minutely__left">
        <image class="minutely__icon" :src="rainBowDataUrl" />
        <text class="minutely__title">分钟级降水</text>
      </view>

      <view v-if="showTotal" class="minutely__total">
        <view class="minutely__total-row">
          <text class="minutely__total-value">{{ totalText }}</text>
          <text class="minutely__total-unit">毫米</text>
        </view>
        <text class="minutely__total-caption">{{ spanText }}累计</text>
      </view>
    </view>

    <!--
      上游那句话。

      它是结论不是注脚，所以给正文的字阶 —— 压成灰色小字就成了一句
      容易被划过去的补充说明，而它恰恰是这张卡最该被先读到的内容。
    -->
    <text v-if="summaryText" class="minutely__summary">{{ summaryText }}</text>

    <!-- 骨架块。玻璃面上的骨架用 $fish-surface，跟同页其它卡同一档深浅 -->
    <view v-if="loading && !hasData" class="minutely__skeleton" />

    <view v-else-if="hasData" class="minutely__body">
      <!--
        干态：整段无降水的空态。

        雨幕全平 —— 图上不该再画一排 0 高度的柱子（那看着像一排没画完的柱子），
        也不该写一句话（上游已经给过结论）。这里给的是一条平线：
        每格一个点，一格一格都在，高度全是 0。

        为什么是点而不是实线：柱阵是按格画的，平线也是按格画的，
        读者一眼能对上「一格一点」；一条实线读不出格数，也读不出这是量出来的。
      -->
      <view v-if="isDry" class="minutely__dry">
        <view v-for="bucket in curtain.buckets" :key="bucket.index" class="minutely__dry-dot" />
      </view>

      <!--
        雨幕。

        柱高按绝对量程算（见 utils/precip 的 SCALE_MAX_5MIN），图上不标毫米数：
        柱高本身已经说清了雨有多大，左边再挂一列数字只是把同一件事说两遍。
        横向那两条虚线是量程参考线（中雨上限 / 大雨上限），给的是相对参照。
      -->
      <view
        v-else
        class="minutely__plot"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchCancel"
      >
        <view v-for="line in refLines" :key="line.pct" class="minutely__refline" :style="{ bottom: line.pct + '%' }" />

        <!--
          游标：竖着的一根细线，落在被读到的那一格上。

          它不是压在图上的牌 —— 牌会盖住旁边的柱，眼睛先落在牌上，
          得再往下找才落到它说的那一格。这根线不挡任何东西，
          只是把「下面那个数说的是哪一格」画出来。
        -->
        <view v-if="cursorPct !== null" class="minutely__cursor" :style="{ left: cursorPct + '%' }" />

        <view :id="bandId" class="minutely__band">
          <view v-for="bucket in curtain.buckets" :key="bucket.index" class="minutely__col">
            <view class="minutely__bar" :class="barClass(bucket)" :style="barStyle(bucket)" />
          </view>
        </view>
      </view>

      <view class="minutely__ticks">
        <text
          v-for="tick in curtain.ticks"
          :key="tick.offset"
          class="minutely__tick"
          :class="['minutely__tick--' + tick.anchor, { 'minutely__tick--now': tick.offset === 0 }]"
          :style="{ left: tick.leftPct + '%' }"
        >
          {{ tick.label }}
        </text>
      </view>

      <!--
        读数行：雨强档 + 峰值或者被点选的那一格。

        常态读峰值 —— 峰值是这张卡最该被读到的一格，不该要用户点一下才看得到。
        点了别的格就改读那一格。

        干态没有这一行：整段都是 0，图上那条平线已经说完了。
      -->
      <view v-if="!isDry" class="minutely__reading">
        <view v-if="badge" class="minutely__badge">
          <image class="minutely__badge-icon" :src="badge.icon" />
          <text class="minutely__badge-text">{{ badge.label }}</text>
        </view>

        <text class="minutely__reading-text">{{ readingText }}</text>
      </view>

      <!--
        色卡。干态没有：没有雨就没有档位要解释。
      -->
      <view v-if="!isDry" class="minutely__legend">
        <view
          v-for="(level, index) in legendLevels"
          :key="level.key"
          class="minutely__legend-chip"
          :class="{ 'minutely__legend-chip--last': index === legendLevels.length - 1 }"
        >
          <view class="minutely__swatch" :class="'minutely__swatch--' + level.key" />
          <text class="minutely__legend-label">{{ level.label }}</text>
        </view>
      </view>
    </view>

    <text v-else class="minutely__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue';

import { useConditionsStore } from '@/stores/conditions';
import type { MinutelyBucket } from '@/types/fishing';
import {
  buildMinutelyCurtain,
  offsetLabel,
  precipLevelIcon,
  precipLevelLabel,
  PRECIP_LEGEND_LEVELS,
  PRECIP_REF_PCTS,
} from '@/utils/precip';
import { createSelectorQuery } from '@/utils/selectorQuery';
import { rainBowSvg } from '@/constants/otherIcon';
import { svgToDataUrl } from '@/utils/svg';

const rainBowDataUrl = computed(() => svgToDataUrl(rainBowSvg));

const conditionsStore = useConditionsStore();

const instance = getCurrentInstance()!;
/** 柱阵的节点 id。同一页里这张卡可能不止一份，id 得唯一 */
const bandId = `minutely-band-${Math.random().toString(36).slice(2, 8)}`;

const points = computed(() => conditionsStore.minutelyForecast?.points ?? []);

const summary = computed(() => conditionsStore.minutelyForecast?.summary ?? '');

/** 换算成「雨幕」的窗口模型。取数在 store，换算在 utils，这里只管画 */
const curtain = computed(() => buildMinutelyCurtain(points.value));

/** 色卡上的四档 */
const legendLevels = PRECIP_LEGEND_LEVELS;

/**
 * 有没有可画的东西。
 *
 * 「上游给了格子」不等于「有格子能画」：整段窗口都可能是空串，
 * 那时候这张卡该说「暂无数据」，而不是画一排空柱子。
 */
const hasData = computed(() => curtain.value.buckets.some((bucket) => bucket.value !== null));

const loading = computed(() => conditionsStore.minutelyLoading);

/** 窗口内累计降水。格式化在脚本里做，模板里只写数 */
const totalText = computed(() => curtain.value.total.toFixed(2));

/**
 * 窗口跨度的人话（「2 小时」）。
 *
 * 标题行右侧那行小字要写「2小时累计」，跨度是算出来的：
 * 上游给几格就是几分钟，不写死 2 小时 —— 窗口短了这句话就是假的。
 */
const spanText = computed(() => {
  const minutes = curtain.value.spanMinutes;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}小时`;
  return `${minutes}分钟`;
});

/**
 * 横向参考线：量程档位线。
 *
 * 两条线对应雨强的档位边界（中雨上限 / 大雨上限），画的是**相对**高度，
 * 不标毫米数 —— 左边挂一列数字就得同时解释两把尺子，读者反而读不清。
 * 0 那条是柱阵自己的基线（实线），这里只画虚的。
 */
const refLines = PRECIP_REF_PCTS.map((pct) => ({ pct }));

/**
 * 空态文案分两种：取不到（多为境外坐标，上游没覆盖）和拿到了但没数据。
 */
const emptyText = computed(() =>
  conditionsStore.minutelyError ? '分钟降水暂时取不到，其余天气数据不受影响' : '这个窗口内没有降水记录',
);

/** 选中的格子序号。没选中时为 null */
const selected = ref<number | null>(null);

/**
 * 数据换了就把选择清掉。
 *
 * 下标是这一份数据里的下标，新一份数据的第 12 格可能完全不是同一段时间 ——
 * 留着旧下标，读数会指在一格不相干的数据上。
 */
watch(
  () => conditionsStore.minutelyForecast,
  () => {
    selected.value = null;
  },
);

/* ===========================================================================
   触摸读数
   =========================================================================== */

/**
 * 柱阵在**视口**里的位置。
 *
 * 触摸换算要用：touches[0].clientX 是视口坐标，而「手指落在第几格」要靠
 * 横向落在第几个等分算出来 —— 两者之间差的就是这个左边距和这段宽度。
 * 少了左边距，选中的格子会整体偏右一个绘图区的宽度。
 *
 * 只记横向：页面纵向滚动不改变 left，滚动不会让读数指错格子。
 *
 * width 同时也是绘图区的宽度（柱阵是绘图区里 left:0/right:0 铺满的那层）。
 *
 * 用 ref 而不是普通变量：读数的位置要靠它算，量回来的值得能触发重算。
 */
const bandBox = ref({ left: 0, width: 0 });

/**
 * 量一次柱阵的位置。
 *
 * 柱阵是 flex 等分的，宽度跟着卡片走，所以卡片一换行（横竖屏、数据重排）
 * 就得重量。这里在两个时机量：柱阵第一次出现（数据到达），
 * 以及手势开始（用户真的要指了）—— 后者顺带把换行后的新位置补上。
 */
function measureBand(): void {
  createSelectorQuery(instance)
    .select(`#${bandId}`)
    .boundingClientRect()
    .exec((res) => {
      const rect = (Array.isArray(res?.[0]) ? res?.[0][0] : res?.[0]) as { left?: number; width?: number } | undefined;
      if (typeof rect?.left !== 'number' || typeof rect?.width !== 'number') return;
      bandBox.value = { left: rect.left, width: rect.width };
    });
}

/** 柱阵出现之后量一次（数据是异步到的，挂载时图上还没有柱子） */
watch(hasData, () => {
  nextTick(measureBand);
});

onMounted(() => {
  nextTick(measureBand);
});

/**
 * 横向坐标 → 格子下标。
 *
 * 格子等宽（flex: 1），所以就是「落在第几个等分里」。
 *
 * 手指落在图外就钉到最近的一格：拖着划出图的边缘时读数不该凭空消失，
 * 边缘那几格正是「雨什么时候停」的答案所在。
 */
function pickIndex(clientX: number): number | null {
  const count = curtain.value.buckets.length;
  const { left, width } = bandBox.value;
  if (count === 0 || width <= 0) return null;

  const x = clientX - left;
  if (x <= 0) return 0;
  if (x >= width) return count - 1;
  return Math.min(count - 1, Math.floor((x / width) * count));
}

/**
 * 游标的横坐标（百分比）。
 *
 * 落在被选中那一格的**中心**：线压在格子的正中，跟手指落点对得上；
 * 压在格子边上会让人以为读的是隔壁那格。
 */
const cursorPct = computed(() => {
  if (selected.value === null) return null;
  const count = curtain.value.buckets.length;
  if (count === 0) return null;
  return ((selected.value + 0.5) / count) * 100;
});

/**
 * 手势状态。
 *
 * 一次手势要分清三种情况：
 * - **点了一下**：读它压着的那一格；点在已选中的那一格上就是取消读数。
 * - **横向划过**：读数跟着手指一格一格走。
 * - **纵向滑动**：用户在滚页面，读数一个字都不该动。
 *
 * 方向在越过 slop 的第一次移动上判定一次就锁定：判定之前不动读数
 * （还不知道这是划还是滚），判定之后不再改判（半路改判会让读数跳）。
 */
let gestureStartX = 0;
let gestureStartY = 0;
/** 手指按下时落在哪一格 */
let gestureStartIndex: number | null = null;
/** 手势开始前选中的是哪一格（用来分辨「再点一次」） */
let gestureStartSelected: number | null = null;
/** 方向判没判 */
let gestureDecided = false;
/** 判定的结果：横向划过才动读数 */
let gestureScrubbing = false;

/**
 * 判定「动了一下」的位移门槛（px）。
 *
 * 8px 是手指的正常抖动量级：小于它的位移当作没动，
 * 于是「点一下」和「轻轻蹭一下」不会被当成划过。
 */
const TOUCH_SLOP = 8;

function resetGesture(): void {
  gestureStartIndex = null;
  gestureStartSelected = null;
  gestureDecided = false;
  gestureScrubbing = false;
}

/**
 * 手指落下。
 *
 * 这里只记位置，不动读数：手指刚落、还没动，此刻还不知道用户是要读这一格
 * 还是要滚页面 —— 先改了读数，滚页面时读数就跟着乱跳。
 */
function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;

  // 顺手补量：卡片换行后位置变了，这一量就把它带回来
  measureBand();

  gestureStartX = touch.clientX;
  gestureStartY = touch.clientY;
  gestureStartSelected = selected.value;
  gestureStartIndex = pickIndex(touch.clientX);
  gestureDecided = false;
  gestureScrubbing = false;
}

/**
 * 手指移动。
 *
 * 横向位移明显大于纵向位移 → 用户在划图，读数跟着换格；
 * 纵向位移更大 → 用户在滚页面，这次手势不碰读数。
 */
function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;

  if (!gestureDecided) {
    const dx = touch.clientX - gestureStartX;
    const dy = touch.clientY - gestureStartY;

    // 还没动过：先攒着
    if (Math.abs(dx) < TOUCH_SLOP && Math.abs(dy) < TOUCH_SLOP) return;

    gestureDecided = true;
    gestureScrubbing = Math.abs(dx) > Math.abs(dy);
    if (!gestureScrubbing) return;
  } else if (!gestureScrubbing) {
    return;
  }

  const index = pickIndex(touch.clientX);
  if (index === null) return;

  selected.value = index;
}

/**
 * 抬手。
 *
 * - 手势没被判成划过（手指基本没动）→ 是一次「点」：读它压着的那一格；
 *   点在已选中的那一格上就取消读数，回到常态。
 * - 划过 → 保留最后读到的那格。抬手正是要读数的时刻，一抬手数字就没了，
 *   等于逼用户用一根手指同时看和记。
 */
function onTouchEnd() {
  if (!gestureDecided && gestureStartIndex !== null) {
    selected.value = gestureStartSelected === gestureStartIndex ? null : gestureStartIndex;
  }
  resetGesture();
}

/** 手势被系统打断（来电、页面切走）：保留当前读数，只把手势状态清掉 */
function onTouchCancel() {
  resetGesture();
}

/**
 * 峰值格。
 *
 * 峰值是 0 时不算峰值 —— 整段都是 0 的话「峰值」是句废话，
 * 读者要的「无雨」由那条平线自己说。
 */
const peak = computed(() => {
  const bucket = curtain.value.peak;
  if (!bucket || bucket.value === null || bucket.value <= 0) return null;
  return bucket;
});

/**
 * 读数读哪一格。
 *
 * 常态读峰值：峰值是这张卡最该被读到的一格，不该要用户点一下才看得到。
 * 点了别的格就改读那一格。
 */
const readoutBucket = computed(() => {
  if (selected.value === null) return peak.value;
  return curtain.value.buckets[selected.value] ?? null;
});

/**
 * 读数行上的一句话。
 *
 * 常态：「峰值 · 20 分钟后 · 0.35 毫米」。
 * 点选态：「35 分钟后 · 0.12 毫米」（那一格是峰值时才标峰值）。
 *
 * 干态没有这一行：整段都是 0，平线已经把这句话说完了。
 */
const readingText = computed(() => {
  const bucket = readoutBucket.value;
  if (!bucket || bucket.value === null) return '';

  const when = offsetLabel(bucket.offset);
  const isPeak = selected.value === null;
  const amount = `${bucket.value.toFixed(2)} 毫米`;
  return isPeak ? `峰值 · ${when} · ${amount}` : `${when} · ${amount}`;
});

/**
 * 雨强徽标。
 *
 * 报的是**读数那一格**的雨强档：常态是峰值档，点选后是那一格的档。
 *
 * 0 雨（那一格测到没下雨）不画徽标：「无降水」是结论句已经说过的话，
 * 这里再说一遍就是同一句话说两遍。
 */
const badge = computed(() => {
  const bucket = readoutBucket.value;
  if (!bucket || bucket.value === null || bucket.value <= 0) return null;

  const level = bucket.level ?? 'none';
  return { label: precipLevelLabel(level), icon: precipLevelIcon(level) };
});

/**
 * 整段没有降水。
 *
 * 这种窗口下每一格都是 0，图上只剩一排 0 高度的短柱。
 * 这时候图上**不再写一句话**：结论上游已经给过，
 * 那条平线也把这件事说清楚了，三处各说一句就是同一句话说三遍。图只管画。
 *
 * 要求每一格都测到（不能有空串）：有空串说明数据有缺口，
 * 那张图上就有一格「没测到」要说，不属于整段无雨。
 */
const isDry = computed(
  () => hasData.value && curtain.value.total === 0 && curtain.value.buckets.every((bucket) => bucket.value !== null),
);

/**
 * 标题行右侧的累计读数。
 *
 * 干态不显示：那个数是 0，与结论句说的是同一件事。
 */
const showTotal = computed(() => hasData.value && !isDry.value);

/**
 * 结论句。
 *
 * 上游给了就用上游的 —— 它比我们自己拼的准（它知道雨什么时候停）。
 * 上游没给时，干态自己补一句：这张卡不能只剩一条平线。
 */
const summaryText = computed(() => {
  if (summary.value) return summary.value;
  if (isDry.value) return `未来${spanText.value}无降水`;
  return '';
});

/**
 * 柱子属于哪一档 —— 决定它的颜色
 */
function barClass(bucket: MinutelyBucket): string {
  if (bucket.value === null) return 'minutely__bar--gap';

  const level = bucket.level ?? 'none';
  // 选中别格时，这一格不是主角，压暗一档（dim to focus）。
  const dim = selected.value !== null && selected.value !== bucket.index ? ' minutely__bar--dim' : '';
  return `minutely__bar--${level}${dim}`;
}

/**
 * 柱子的高度与入场延迟。
 *
 * 高度是百分比，基准是**柱阵**，不是整个绘图区。
 * 格子数是上游给的，写死在 CSS 里就得跟着上游改，所以落在行内样式里。
 */
function barStyle(bucket: MinutelyBucket): string {
  let height: string;
  if (bucket.value === null) {
    // 没有数据：整格画成虚线空框（见 .minutely__bar--gap）。
    // 框只到柱阵的 42%：满高的框在图上像一堵墙，比它承载的信息显眼得多。
    height = '42%';
  } else if (!bucket.heightPct) {
    // 测到 0 雨：留一根极短的淡柱。留这一根是为了跟「没有数据」区分开 ——
    // 0 高度是「这一格测过，是 0」，虚线空框是「这一格没测到」
    height = '6rpx';
  } else {
    height = `${bucket.heightPct}%`;
  }
  // 逐格错开入场：柱子从左到右立起来，像雨幕一档档拉开
  return `height: ${height}; animation-delay: ${bucket.index * 12}ms;`;
}
</script>

<style lang="scss" scoped>
.minutely {
  @include fish-card;
}

.minutely__head {
  @include fish-card-head;

  align-items: flex-start;
}

.minutely__left {
  display: flex;
  align-items: center;
}

.minutely__icon {
  width: 52rpx;
  height: 52rpx;
  margin-right: 10rpx;
}

.minutely__title {
  @include fish-card-title;
}

/*
 * 窗口累计降水。
 *
 * 原来这块是一整块读数面（渐变 + 64rpx 大数 + 底纹图），占半张卡的高度，
 * 说的却只是「这两小时一共下多少」这一个数。现在压成标题行右侧的一组小读数：
 * 数字给 body 字阶加粗（30rpx 上下），单位与跨度退到 caption 档。
 *
 * 跨度是算出来的（上游给几格就是几分钟），不写死 2 小时。
 */
.minutely__total {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: flex-end;
}

.minutely__total-row {
  display: flex;
  align-items: baseline;
}

/* tabular-nums：读数变的时候字宽不变，数字不会左右跳 */
.minutely__total-value {
  color: $fish-ink;
  @include fish-type(body, 700);
  @include numeric;
}

.minutely__total-unit {
  margin-left: 6rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

.minutely__total-caption {
  margin-top: 2rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 上游那句话。
 *
 * 它是结论不是注脚，所以给正文的字阶 —— 压成灰色小字就成了一句
 * 容易被划过去的补充说明，而它恰恰是这张卡最该被先读到的内容。
 */
.minutely__summary {
  display: block;
  margin-bottom: 20rpx;
  color: $fish-ink;
  @include fish-type(caption);
}

/* 骨架块。玻璃面上的骨架用 $fish-surface，跟同页其它卡同一档深浅 */
.minutely__skeleton {
  width: 100%;
  height: 200rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.minutely__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted-60;
  @include fish-type(body);
  text-align: center;
}

/* ===========================================================================
   干态：整段无降水的空态
   =========================================================================== */

/*
 * 一条平线。
 *
 * 面底是一层很淡的蓝（雨没有也要有一块面托着它，别让这条线飘在白卡上），
 * 点是按格画的：一格一点，高度全是 0 —— 与柱阵同一套语言，
 * 读者一眼能对上「一格一点」，也读得出格数。
 */
.minutely__dry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 96rpx;
  padding: 0 12rpx;
  border-radius: $fish-radius-xl;
  background: $fish-rain-flat;
}

.minutely__dry-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: rgba($fish-tide, 0.3);
}

/* ===========================================================================
   雨幕
   =========================================================================== */

/*
 * 绘图区。
 *
 * 高度就是柱阵的高度：读数行在图外，图里不再需要给浮标留位置。
 */
.minutely__plot {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 168rpx;
}

/*
 * 横向参考线（量程档位线）。
 *
 * 虚线而不是实线：它标的是「量程到哪儿了」，不是图框的一边。
 * 0 那条线由柱阵自己的基线承担（实线），这里只画虚的。
 *
 * 用 $fish-border 而不是网格那一档：这两条线是读者拿来比柱顶高度的，
 * 网格淡到等于没画。虚线 + 比基线重一档的线重，
 * 于是它既不跟柱子抢眼，也不是背景。
 */
.minutely__refline {
  position: absolute;
  right: 0;
  left: 0;
  border-top: 1rpx dashed $fish-border;
}

/*
 * 游标：被读到的那一格上的竖线。
 *
 * 细、深浅介于底色与柱子之间：够看清是哪一格，又不至于比柱子还抢眼。
 * 柱子压在它上面 —— 线在柱子后面走，所以它不挡数据。
 */
.minutely__cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2rpx;
  margin-left: -1rpx;
  border-radius: 1rpx;
  background-color: $fish-guide;
}

.minutely__band {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: flex-end;
  height: 168rpx;
  border-bottom: 1rpx solid $fish-border-40;
}

.minutely__col {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex: 1;
  height: 100%;
}

/*
 * 柱子。
 *
 * 浅底上不再需要那圈顶边高光：深底上要靠它把柱子从背景里「立」起来，
 * 浅底上柱子本来就是深色块，高光只会把它涂灰。
 */
.minutely__bar {
  width: 14rpx;
  border-radius: 6rpx 6rpx 0 0;
  transform-origin: bottom center;

  @if $fish-motion {
    animation: curtain-rise 300ms $fish-ease-out both;
  }
}

/*
 * 测到 0 雨的那一格。
 *
 * 用 $fish-rain-none（极淡的灰）而不是雨蓝：这一格不是雨，
 * 给它蓝会读成「很小的一点雨」。
 */
.minutely__bar--none {
  background-color: $fish-rain-none;
}

.minutely__bar--light {
  background-color: $fish-rain-light;
}

.minutely__bar--medium {
  background-color: $fish-rain-medium;
}

.minutely__bar--heavy {
  background-color: $fish-rain-heavy;
}

.minutely__bar--storm {
  background-color: $fish-rain-storm;
}

/*
 * 选中别格时，这一格不是主角，压暗一档。
 *
 * 只压柱身不动高度：高度是数据，压高度等于改数据。
 * 压得比游标更深：被读到的那一格要一眼就认出来。
 */
.minutely__bar--dim {
  opacity: 0.4;

  @if $fish-motion {
    transition: opacity $fish-dur-cross $fish-ease-out;
  }
}

/*
 * 没有数据的那一格。
 *
 * 画成虚线空框，而不是一根 0 高度的柱子：0 高度是「这一格测到没下雨」，
 * 虚线空框是「这一格没测到」。两件事在图上必须长得不一样。
 */
.minutely__bar--gap {
  border: 1rpx dashed $fish-border-40;
  background-color: transparent;

  @if $fish-motion {
    animation-name: curtain-fade;
  }
}

/*
 * 横轴刻度。
 *
 * 刻度按各自那一格的位置摆（不等距），所以用绝对定位落在百分比上。
 */
.minutely__ticks {
  position: relative;
  height: 40rpx;
  margin-top: 8rpx;
}

.minutely__tick {
  position: absolute;
  top: 0;
  color: $fish-muted-60;
  @include fish-type(caption);
  white-space: nowrap;
}

/*
 * 「现在」是这条轴的原点，其余刻度都是从它往后数的。
 * 给它一档字重，读者才知道图是从哪儿开始读的。
 */
.minutely__tick--now {
  color: $fish-ink;
  font-weight: 500;
}

.minutely__tick--mid {
  transform: translateX(-50%);
}

.minutely__tick--end {
  transform: translateX(-100%);
}

/* ===========================================================================
   读数行
   =========================================================================== */

/*
 * 雨强档徽标 + 读数句。
 *
 * 徽标在左、读数在右：徽标是状态（那一格有多强），读数是量（哪一格、多少）。
 */
.minutely__reading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
}

/*
 * 徽标用淡蓝底 + 深蓝字：白卡上实底太重，半透明白底读不出是徽标。
 */
.minutely__badge {
  display: flex;
  align-items: center;
  padding: 4rpx 14rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent-tint;
}

.minutely__badge-icon {
  width: 28rpx;
  height: 28rpx;
  margin-right: 6rpx;
}

.minutely__badge-text {
  color: $fish-blue-600;
  @include fish-type(caption, 500);
}

.minutely__reading-text {
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* ===========================================================================
   色卡
   =========================================================================== */

/*
 * 色卡。
 *
 * 四枚色块挤一行放得下（窄机型上差一点），所以允许换行 ——
 * 挤成一排把字压小，不如换行。
 */
.minutely__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 16rpx;
  padding-top: 16rpx;
}

.minutely__legend-chip {
  display: flex;
  align-items: center;
  margin-right: 20rpx;
}

.minutely__legend-chip--last {
  margin-right: 0;
}

.minutely__swatch {
  width: 16rpx;
  height: 16rpx;
  margin-right: 8rpx;
  border-radius: 4rpx;
}

.minutely__swatch--none {
  background-color: $fish-rain-none;
}

.minutely__swatch--light {
  background-color: $fish-rain-light;
}

.minutely__swatch--medium {
  background-color: $fish-rain-medium;
}

.minutely__swatch--heavy {
  background-color: $fish-rain-heavy;
}

.minutely__swatch--storm {
  background-color: $fish-rain-storm;
}

.minutely__legend-label {
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* ===========================================================================
   入场
   =========================================================================== */

/*
 * 柱子从底边长上来。
 *
 * 只动 transform 与 opacity：这两条在小程序里走合成，不触发布局重排。
 *
 * 关键帧写在组件自己的样式里（SnapSheet 也是这么做的），不进 App.vue ——
 * 全局那份只放跨组件复用的动画。
 */
@keyframes curtain-rise {
  from {
    opacity: 0;
    transform: scaleY(0);
  }

  to {
    opacity: 1;
    transform: scaleY(1);
  }
}

/* 没有数据的那一格不生长，只淡入 —— 让「没数据」看起来是「这一格被跳过」 */
@keyframes curtain-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
