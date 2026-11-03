<template>
  <view class="tide-chart">
    <view v-if="hasNow && showHead" class="tide-chart__head">
      <view class="tide-chart__head-main">
        <text class="tide-chart__head-label">当前潮高</text>
        <view class="tide-chart__head-value">
          <text class="tide-chart__head-number">{{ currentHeight }}</text>
          <text class="tide-chart__head-unit">m</text>
        </view>
      </view>

      <view class="tide-chart__head-side">
        <text class="tide-chart__head-time">{{ currentTime }}</text>
        <Chip v-if="trend" :tone="trend.tone" pill>{{ trend.text }}</Chip>
      </view>
    </view>

    <text class="tide-chart__axis-label">潮高（m）</text>

    <view class="tide-chart__plot" :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }">
      <canvas
        :id="baseCanvasId"
        type="2d"
        class="tide-chart__canvas tide-chart__canvas--base"
        :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }"
      />
      <canvas
        v-if="showTop"
        :id="canvasId"
        type="2d"
        class="tide-chart__canvas tide-chart__canvas--top"
        :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { onPageShow } from '@dcloudio/uni-app';
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { buildCurve, buildPolyline, clipCurve, headX, type CurvePoint, type CurveSegment } from '@/utils/curve';
import { CANVAS_FONT_STACK, setCanvasFont, withAlpha } from '@/utils/canvas';
import {
  X_LABEL_SIZE,
  computeTideGeom,
  formatHeight,
  indexToX,
  layoutAxisLabels,
  layoutExtremumLabels,
  parseHeight,
  positionOf,
  valueToY,
  type PlotGeom,
} from '@/utils/tideChart';
import {
  CHART_LINE_WIDTH,
  createCanvasLayer,
  createEntryAnimator,
  type CanvasMetrics,
  type EntryAnimator,
} from '@/utils/chartCanvas';
import { windowMetrics } from '@/composables/windowMetrics';
import { createIntersectionObserver } from '@/utils/intersection';
import Chip from '../Chip/Chip.vue';

interface Props {
  /** 逐时潮高，形如 [{ fxTime, height }] */
  points: ReadonlyArray<{ fxTime: string; height: number | string }>;
  /** X 轴时刻文案，长度须与 points 一致 */
  labels: readonly string[];
  /** 当前时刻在 points 中的下标，-1 表示不在范围内 */
  nowIndex?: number;
  /** 画布宽（rpx） */
  width?: number;
  /** 画布高（rpx） */
  height?: number;
  /** 数据切换时是否播放入场动画（首次出图始终直接展示，不播） */
  animate?: boolean;
  /** 入场时长（ms），仅数据切换的动画用 */
  duration?: number;
  /**
   * 是否把采样点连成平滑曲线。
   *
   * 逐时潮高本身是连续变化的，直线连接会在拐点处留下折角，
   * 看着像潮水在跳。平滑用单调三次插值，曲线不会冲出采样点范围 ——
   * 潮高越出上下界会画到坐标轴外面去。
   */
  smooth?: boolean;
  /**
   * 要不要画顶部那块读数（当前潮高 + 时刻 + 涨落状态）。
   *
   * 潮汐详情页把读数单独做了一块更大的：那里的读数是主角，
   * 由组件再画一份就成了同一件事说两遍。
   */
  showHead?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  nowIndex: -1,
  /**
   * 画布宽（rpx）：750 − 页面留白 32rpx × 2 − 卡片内边距 28rpx × 2。
   * 跟 MetricChart 的 CHART_WIDTH 是同一个数 —— 两张图要一样宽，
   * 摆在同一列里才不会一个胖一个瘦。
   */
  width: 630,
  height: 400,
  animate: true,
  duration: 1000,
  smooth: true,
  showHead: true,
});

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
// canvasId 必须页面内唯一，同一页面可能画多个图
const canvasId = `tide-chart-${uid}`;
/** 静态层画布（网格 + 刻度）。id 也要页面内唯一 */
const baseCanvasId = `tide-chart-base-${uid}`;

/**
 * 画布的 CSS 尺寸（px）。
 *
 * rpx 只对样式有效，canvas 内部坐标和位图尺寸都得用 px。
 *
 * 在 setup 里就算好直接绑定，而不是 onMounted 里算完再写进 ref —— 少一次
 * 「先空串渲染、再补值」的往返，节点首帧就带着确定宽高。
 */
const cssWidthPx = computed(() => uni.upx2px(props.width));
const cssHeightPx = computed(() => uni.upx2px(props.height));

/** 画布尺寸快照。两层共用一份，两层才像素对齐 */
const sizeRef = ref<{ width: number; height: number } | null>(null);
const dprRef = ref(1);

/**
 * 两层画布。
 *
 * 静态层画网格与刻度，动态层画曲线、面积、标线。
 * 取节点、判空、重试都在 utils/chartCanvas 里，这里只管画什么。
 */
const baseLayer = createCanvasLayer({
  instance,
  id: baseCanvasId,
  metrics: layerMetrics,
  label: 'TideChart 静态层',
});
const topLayer = createCanvasLayer({
  instance,
  id: canvasId,
  metrics: layerMetrics,
  label: 'TideChart 动态层',
});

/** 入场动画。progress 0→1，动画帧回调里重画动态层 */
const animator: EntryAnimator = createEntryAnimator({
  getNode: () => topLayer.node,
  onFrame: () => draw(),
});

/**
 * 位图尺寸。dpr 从共享窗口快照取（getWindowInfo 是同步 API，不该现调）。
 */
function layerMetrics(): CanvasMetrics {
  const dpr = windowMetrics().pixelRatio;
  const width = cssWidthPx.value;
  const height = cssHeightPx.value;
  sizeRef.value = { width, height };
  dprRef.value = dpr;
  return { width, height, dpr };
}

/**
 * 当前选中的点（**原始下标**，不是清洗后的位置）。
 *
 * 用原始下标是因为外部（labels、points）都按原始下标索引；
 * 画的时候再换算成位置。两套下标混用过一次，
 * 表现是脏点出现后选中的点与标注的数字对不上。
 */
const activeIndex = ref(-1);

/**
 * 绘图区左边界与相邻点的像素间距，触摸换算要用。
 */
let plotLeft = 0;
let pointGap = 0;

/**
 * Canvas 色值。**必须与令牌层 _color.scss 的 $fish-* 令牌保持一致**。
 *
 * Canvas 2d 只能从 context 读色，解析不了 SCSS 变量和 CSS 变量，
 * 所以这里只能硬编码。改主题时令牌层 _color.scss 和这几行要一起改 ——
 * 漏改的话图表会和卡片配色对不上，而这种不一致在编译期完全看不出来。
 *
 * 网格线只有一档（发丝虚线）：纵轴刻度去掉之后，图上不再有两种线重，
 * 只靠虚线与实线（底边）区分层次。
 */
const TIDE_COLOR = '#0f66d6'; // $fish-tide（systemBlue）
const GRID_COLOR = 'rgba(60, 60, 67, 0.1)'; // $fish-grid（内部网格线）
const AXIS_COLOR = 'rgba(60, 60, 67, 0.18)'; // $fish-border-40（底边基线）
const X_TEXT_COLOR = '#5b5b60'; // $fish-muted-60（tertiaryLabel）
const NOW_LINE_COLOR = 'rgba(60, 60, 67, 0.32)'; // $fish-border（参照线）

/** 网格虚线的节奏 */
const GRID_DASH = [4, 4];
/** 曲线上数值标注的字号（px）。比时间刻度大一号 —— 它是读数，时间只是语境 */
const VALUE_LABEL_SIZE = 12;

/**
 * 画布内空态：数据全脏时给一行说明，别让用户对着空白猜。
 *
 * canvas 里画文字要注意 ctx.font 只认 px。
 */
function drawEmptyHint(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = X_TEXT_COLOR;
  ctx.font = `12px ${CANVAS_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('暂无潮位数据', width / 2, height / 2);
}

/* ── 顶部读数 ── */

/** 当前时刻落在数据范围内（今天的逐时潮高里） */
const hasNow = computed(() => props.nowIndex >= 0 && props.nowIndex < props.points.length);

/** 此刻的潮高 */
const currentHeight = computed(() => {
  if (!hasNow.value) return '—';
  return formatHeight(props.points[props.nowIndex].height);
});

/** 此刻的时刻（HH:mm） */
const currentTime = computed(() => {
  if (!hasNow.value) return '';
  return props.labels[props.nowIndex] ?? '';
});

/**
 * 涨落状态。
 *
 * 比的是「上一个小时」：涨落说的是此刻这一刻潮在往哪边走 ——
 * 刚涨到顶的那一刻还站在涨的那一侧，过了一小时才翻成退潮。
 * 已经是当天第一个点（没有上一小时）才退回比下一小时。
 */
const trend = computed<{ text: string; tone: 'ok' | 'accent' | 'default' } | null>(() => {
  if (!hasNow.value) return null;

  const index = props.nowIndex;
  const current = parseHeight(props.points[index].height);
  if (current === null) return null;

  const next = index + 1 < props.points.length ? parseHeight(props.points[index + 1].height) : null;
  const prev = index > 0 ? parseHeight(props.points[index - 1].height) : null;
  const reference = prev ?? next;
  if (reference === null) return null;

  const delta = current - reference;
  // 半厘米之内当作平潮：逐时数据的零头不值得为它换一个状态
  if (Math.abs(delta) < 0.005) return { text: '平潮', tone: 'default' };
  return delta > 0 ? { text: '涨潮中', tone: 'ok' } : { text: '退潮中', tone: 'accent' };
});

/**
 * 描出一串曲线段。
 *
 * 只描线，不做算法：曲线怎么算出来的在 utils/curve，两张图共用那一份，
 * 这样曲线形状和动画头部必然一致。这里重复这几行，是因为两张图各画各的
 * canvas，描线这件事本身没有值得抽出去的部分。
 */
function traceSegments(ctx: CanvasRenderingContext2D, segments: CurveSegment[]): void {
  if (!segments.length) return;
  ctx.moveTo(segments[0].x0, segments[0].y0);
  for (const segment of segments) {
    ctx.bezierCurveTo(segment.cx1, segment.cy1, segment.cx2, segment.cy2, segment.x1, segment.y1);
  }
}

/**
 * 最近一次算出的几何。
 *
 * 数据没变就一直有效 —— 动画帧只重画动态层，不必每帧重算一遍轴范围。
 * 数据全脏时它是 null：那时没有可画的东西，几何也就没有意义。
 */
let geom: PlotGeom | null = null;

/**
 * 算几何，顺手把触摸换算要的两个值记下来。
 *
 * plotLeft / pointGap 是从这份几何里取的，所以每次几何变了
 * （换港口、换日期、数据变脏）都要跟着更新，否则选点会按旧的间距算。
 */
function computeGeom(): PlotGeom | null {
  const size = sizeRef.value;
  if (!size) return null;

  const result = computeTideGeom(props.points, size);
  if (!result) {
    // 几何作废：上一轮的数据可能画过，触摸换算不能继续用旧的间距
    plotLeft = 0;
    pointGap = 0;
    geom = null;
    return null;
  }

  plotLeft = result.plotLeft;
  pointGap = result.pointGap;
  geom = result.geom;
  return geom;
}

/**
 * 静态层：网格 + 时间刻度 + 极值标注。
 *
 * 只在几何变了的时候画一次：换港口、换日期。
 * 动画帧不碰它 —— 那十来个刻度数字不必跟着曲线重画四十遍，
 * 而文字光栅化恰恰是 canvas 2d 里最贵的一档操作。
 */
function drawBase(): void {
  const ctx = baseLayer.ctx;
  const size = sizeRef.value;
  if (!ctx || !size) return;

  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  const g = geom;
  // 没几何（数据全脏）时静态层就是一块空白：上一轮的网格不能留着
  if (!g) return;

  ctx.lineWidth = 1;

  // 网格：横竖都虚线，底边单独一条实线。
  // 实线只有底边一条 —— 上下左右都框一道，图就成了一个盒子。
  ctx.setLineDash(GRID_DASH);
  ctx.strokeStyle = GRID_COLOR;

  g.ticks.forEach((value, i) => {
    // i === 0 是底边那一档（最小值），留给实线画
    if (i === 0) return;
    const y = Math.round(valueToY(value, g)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(g.left, y);
    ctx.lineTo(g.right, y);
    ctx.stroke();
  });

  const labels = layoutAxisLabels(ctx, size, g, props.labels);
  labels.forEach((label) => {
    const x = Math.round(label.x) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, g.top);
    ctx.lineTo(x, g.bottom);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // 底边基线
  ctx.strokeStyle = AXIS_COLOR;
  const baseY = Math.round(g.bottom) + 0.5;
  ctx.beginPath();
  ctx.moveTo(g.left, baseY);
  ctx.lineTo(g.right, baseY);
  ctx.stroke();

  // X 轴时刻
  ctx.fillStyle = X_TEXT_COLOR;
  setCanvasFont(ctx, 600, X_LABEL_SIZE);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  labels.forEach((label) => {
    ctx.fillText(label.text, label.x, g.bottom + 8);
  });

  // 极值标注：画在静态层。它们只跟着数据变，不跟着帧变。
  const extremes = layoutExtremumLabels(g, props.nowIndex);
  extremes.forEach((item) => {
    drawValueLabel(ctx, item.x, item.y, formatHeight(item.value));
  });
}

/**
 * 画一个标点：白底圈 + 潮蓝实心。
 *
 * 底下圈一圈白底把点从曲线和渐变上「拔」出来，
 * 没有它，处在渐变最浓处的那个点几乎看不见。
 */
/**
 * 画曲线上的数值标注。
 *
 * 底下垫一圈白描边（halo）：标注常常正压在网格线或标线上，
 * 不垫的话数字会被线穿过，读起来像划掉了一笔。
 */
function drawValueLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  const baseline = Math.max(VALUE_LABEL_SIZE, y - 8);
  setCanvasFont(ctx, 700, VALUE_LABEL_SIZE);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(text, x, baseline);
  ctx.fillStyle = TIDE_COLOR;
  ctx.fillText(text, x, baseline);
}

/**
 * 画一个标点：白底圈 + 潮蓝实心。
 *
 * 底下圈一圈白底把点从曲线和渐变上「拔」出来，
 * 没有它，处在渐变最浓处的那个点几乎看不见。
 */
function drawMarkerDot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = TIDE_COLOR;
  ctx.fill();
}

/**
 * 动态层：面积、曲线、标线与读数。每帧重画。
 *
 * 网格和刻度在下面那层静态画布上，这里只管会动的东西。
 */
function draw() {
  const ctx = topLayer.ctx;
  const size = sizeRef.value;
  if (!ctx || !size) return;

  // setTransform 覆盖式，scale 累乘式：动画每帧调 scale 会叠成 dpr^n，
  // 第二帧起曲线就飞出画布。每帧重置矩阵，后续绘制继续用 CSS 像素。
  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  const g = geom ?? computeGeom();
  if (!g) {
    // 数据全脏：图上没得画，只留一行说明
    drawEmptyHint(ctx, size.width, size.height);
    return;
  }

  const { left, top, bottom, plotH, len, values } = g;

  // 面积渐变（竖直方向：上浓下淡）。底色跟 TIDE_COLOR 同源，见上面「必须同步」的说明
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, withAlpha(TIDE_COLOR, 0.2));
  gradient.addColorStop(0.7, withAlpha(TIDE_COLOR, 0.04));
  gradient.addColorStop(1, withAlpha(TIDE_COLOR, 0));

  // 入场动画：只画到 progress 对应的位置，曲线像被"画"出来
  const cut = animator.progress * (len - 1);

  const points: CurvePoint[] = values.map((value, i) => ({
    x: indexToX(i, g),
    y: valueToY(value, g),
  }));

  // 平滑时是贝塞尔曲线，否则是直线。两者都是「一串段」，
  // 于是「画到哪里为止」只有一套算法（utils/curve 的 clipCurve）。
  const segments = clipCurve(props.smooth ? buildCurve(points) : buildPolyline(points), headX(points, cut));

  if (segments.length) {
    // 面积：沿曲线走到底再回到底边闭合
    ctx.beginPath();
    traceSegments(ctx, segments);
    ctx.lineTo(segments[segments.length - 1].x1, bottom);
    ctx.lineTo(segments[0].x0, bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // 曲线本体。
  //
  // segments 为空时直接跳过：入场动画第一帧 progress=0，此时头部还压在起点，
  // 一段都还没画出来 —— 硬画会取到 undefined 的控制点，异常从 rAF 回调里抛出去
  // 会连带这一帧的绘制一起作废，表现就是整张图一片空白，连网格线都没有，
  // 且控制台不报任何错。下一帧 progress>0 自然就画出来了。
  if (!segments.length) return;

  ctx.beginPath();
  traceSegments(ctx, segments);
  ctx.strokeStyle = TIDE_COLOR;
  ctx.lineWidth = CHART_LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // 「现在」标线：只在当前时刻落在数据范围内、且曲线已画完时画。
  //
  // 纵轴刻度去掉了，这根线是图上唯一标出「此刻在哪」的参照 ——
  // 读数在顶部，但位置得在图上找得到。
  const now = positionOf(g, props.nowIndex);
  if (now >= 0 && now < len && animator.progress >= 1) {
    const x = indexToX(now, g);
    const y = valueToY(values[now], g);

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = NOW_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, top);
    ctx.lineTo(Math.round(x) + 0.5, bottom);
    ctx.stroke();
    ctx.restore();

    drawMarkerDot(ctx, x, y);
    drawValueLabel(ctx, x, y, formatHeight(values[now]));
  }

  // 选中标记：竖线 + 点 + 数值。
  //
  // 必须重绘才能有：这些画在 canvas 上，而 draw() 平时只在挂载、数据变化、
  // 布局落定时跑。光改 activeIndex 的话顶部数字不会变、图却纹丝不动。
  //
  // 与上面那根参照线可以共存、语义也不同：「现在」是时间参照，
  // 选中是当前正在看的位置。两者可能重合，重合时只画一根。
  const selected = positionOf(g, activeIndex.value);
  if (selected >= 0 && selected < len && selected !== now && animator.progress >= 1) {
    const x = indexToX(selected, g);
    const y = valueToY(values[selected], g);

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = withAlpha(TIDE_COLOR, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, top);
    ctx.lineTo(Math.round(x) + 0.5, bottom);
    ctx.stroke();
    ctx.restore();

    drawMarkerDot(ctx, x, y);
    drawValueLabel(ctx, x, y, formatHeight(values[selected]));
  }
}

/**
 * 初始化画布。
 *
 * 宽高**不**从 SelectorQuery 要 —— 那是布局测量值，画布的 CSS 宽高
 * 本来就由我们按 rpx 算好绑在节点上，数值在手上，问布局是引入了一个
 * 既不必要又会失败的依赖。
 *
 * 拿不到节点时按 utils/chartCanvas 的重试节奏继续试，**不**一次就放弃：
 * 本组件挂在 TideCard 的 `v-else-if` 分支里，节点是在「数据到了、
 * 面板正在展开」那一刻创建的。面板展开带 0.28s 的高度过渡，节点和
 * 布局就绪的时间点会飘 —— 之前只重试 3 次（约 360ms）就永久放弃，
 * 放弃之后没有任何东西会再触发一次，图表就一直空白，只有切港口/日期
 * 触发重新挂载才恢复。数据变化时会把整条重试链重新武装一次。
 */

/**
 * 布局落定后补画。
 *
 * 画布建好时如果容器还在过渡、或节点还没进入合成，首帧会画上但不显示，
 * 而布局稳定之后小程序不会自己补画 —— 表现就是「进页面图表空白，
 * 点一下港口/日期才出来」。这几个时间点各补画一次，覆盖过渡结束
 * 和节点合成；补画直接落到最终态，不再重播入场动画。
 */
const SETTLE_REDRAW_DELAYS = [0, 320, 800] as const;

const settleTimers: number[] = [];

function clearSettleTimers(): void {
  while (settleTimers.length) {
    clearTimeout(settleTimers.pop()!);
  }
}

/** 布局落定后补画，见 SETTLE_REDRAW_DELAYS */
function scheduleSettleRedraw(): void {
  clearSettleTimers();
  for (const delay of SETTLE_REDRAW_DELAYS) {
    settleTimers.push(
      setTimeout(() => {
        if (!topLayer.ready) return;
        // 动画还在跑就别动 progress —— 补画不该把入场动画打断
        if (!animator.running) animator.progress = 1;
        draw();
      }, delay),
    );
  }
}

/* ── 视口可见性 ── */

/**
 * 动态层是否挂载。
 *
 * 曲线、面积、标线要等组件**完全**进入视口才画：
 * 画到一半的曲线在滚动中看得见，停下来还得重画一遍。
 *
 * 静态层（网格、时间刻度、极值标注）不归它管 —— 初始就画，不进观察。
 */
const showTop = ref(false);

/** 观察目标：组件根节点 */
const ROOT_SELECTOR = '.tide-chart';

let topObserver: WechatMiniprogram.IntersectionObserver | null = null;

/**
 * 动态层被摘掉（离开视口）时的清理。
 *
 * ctx 指向的是已经销毁的节点，留着只会画到一块死画布上。
 * 静态层不动 —— 它不随滚动变化，留着就行。
 *
 * 顺序要紧：先停动画（取消帧要拿节点），再丢节点。
 */
function resetTop(): void {
  animator.cancel();
  topLayer.reset();
  activeIndex.value = -1;
}

/**
 * 初始化静态层。
 *
 * 只做静态层的事：节点、尺寸、ctx、几何、网格与刻度。
 * 曲线是动态层的事，等完全进入视口再说。
 */
async function initBase(): Promise<void> {
  if (!await baseLayer.init()) return;

  // 静态层先画好：动态层就绪时直接叠上去
  computeGeom();
  drawBase();
}

/**
 * 初始化动态层。
 */
async function initTop(): Promise<void> {
  if (!showTop.value) return;
  if (!await topLayer.init()) return;

  scheduleSettleRedraw();

  // 静态层先在下面等着：网格和刻度得先落定
  computeGeom();
  drawBase();

  // 动态层挂上来的这一刻就是给用户看动画的时机：
  // 组件完全进入视口才挂这一层，曲线正好从左往右画出来。
  play();
}

/**
 * 挂观察器：只管动态层。
 *
 * 静态层初始就画，不进观察 —— 它不随滚动变化。
 * 动态层参照严格视口，完全进入才画曲线。
 *
 * 阈值里带上 0.5/1，是为了让「完全进入」这个状态变化也能收到回调 ——
 * 只挂 0 的话只有进出视口才回调，滚到一半停下时不会通知。
 */
function setupTopObserver(): boolean {
  const observer = createIntersectionObserver(instance, { thresholds: [0, 0.5, 1], initialRatio: 0, nativeMode: true });
  if (!observer) return false;

  topObserver = observer;
  observer.relativeToViewport().observe(ROOT_SELECTOR, (res) => {
    const rect = res.boundingClientRect;
    const winHeight = windowMetrics().windowHeight;
    // 元素比视口还高时永远进不了「完全进入」，上边缘进屏就算
    const fully = rect.height >= winHeight ? rect.top >= 0 : rect.top >= 0 && rect.bottom <= winHeight;

    if (fully) {
      if (!showTop.value) {
        showTop.value = true;
        void nextTick(() => {
          void initTop();
        });
      }
      return;
    }
    // 完全离开视口才收：滚到一半时曲线留着，别来回重画
    if (res.intersectionRatio === 0) {
      showTop.value = false;
      resetTop();
    }
  });
  return true;
}

/**
 * 画动态层：播入场动画，或者直接落到最终态。
 *
 * 取帧与取消帧都在 utils/chartCanvas 里：取消必须用同一个节点，
 * 把 requestId 交给别处的 cancelAnimationFrame 会静默失效。
 */
function play(): void {
  if (props.animate) {
    animator.play(props.duration);
    return;
  }
  animator.progress = 1;
  draw();
}

onMounted(() => {
  // 静态层初始就画：网格、时间刻度、极值标注不随滚动变化
  void initBase();

  // 观察器必须按原生组件实例建，作用域才落在组件内部 —— 页面级的观察器
  // 看不见自定义组件里的节点。取不到原生实例时就没有组件作用域的观察器，
  // 动态层直接画，别让图表永远空着。
  if (!setupTopObserver()) {
    showTop.value = true;
    void nextTick(() => {
      void initTop();
    });
  }
});

watch(
  () => [props.points, props.labels, props.nowIndex],
  () => {
    // 换数据后旧的选中下标不再有意义，留着会显示另一组数据里的点
    activeIndex.value = -1;

    // 轴范围和标签都跟着数据变了：静态层得重画，
    // 否则刻度上还挂着上一组数据的数字。
    if (baseLayer.ready) {
      computeGeom();
      drawBase();
    }

    // 画布还没拿到就先补拿。之前这里无条件走 play()，而画布没就绪时
    // 动画直接返回，等于白等 —— 数据变了但图表还是空的。
    if (!topLayer.ready) {
      void initTop();
      return;
    }

    scheduleSettleRedraw();
    computeGeom();

    // 换数据（切港口/日期）是用户主动操作，播入场动画
    play();
  },
  { deep: true },
);

/**
 * 页面回到前台时补画。
 *
 * 小程序切后台期间 rAF 会停，回来后不会自动续画 —— 曲线会停在半截，
 * 或者节点在后台被回收后彻底空白。这里直接补一帧最终态。
 */
onPageShow(() => {
  // 静态层也跟着数据走，回前台补一帧
  if (baseLayer.ready) drawBase();

  if (!topLayer.ready) {
    if (showTop.value) void initTop();
    return;
  }
  animator.progress = 1;
  draw();
});

// 页面反复进出会持续漏帧，不取消就一路漏下去；定时器同理
onBeforeUnmount(() => {
  animator.cancel();
  baseLayer.reset();
  topLayer.reset();
  clearSettleTimers();
  topObserver?.disconnect();
  topObserver = null;
});

/**
 * 触摸换算。
 *
 * clientX 是**视口**坐标，plotLeft / pointGap 是**画布**坐标，
 * 两者之间隔着画布自己的左边距（topLayer.left）—— 不减它，整条曲线偏右一个画布宽。
 *
 * 选中后必须重绘：标线和数值都画在 canvas 上，见 draw 里那段。
 */
function pick(clientX: number) {
  const g = geom;
  if (!g || !g.len || pointGap <= 0) return;

  const rel = (clientX - topLayer.left - plotLeft) / pointGap;
  const pos = Math.round(rel);
  if (pos < 0 || pos >= g.len) {
    if (activeIndex.value !== -1) {
      activeIndex.value = -1;
      draw();
    }
    return;
  }
  // 位置 → 原始下标：activeIndex 存的是原始下标，
  // 脏点被剔掉之后两者不再相等。
  const original = g.sourceIndex[pos];
  if (original === activeIndex.value) return;
  activeIndex.value = original;
  draw();
}

/**
 * 用 `@dcloudio/types` 声明的 TouchEvent，不另造局部 interface。
 */
function onTouchStart(e: TouchEvent) {
  pick(e.touches[0].clientX);
}

function onTouchMove(e: TouchEvent) {
  pick(e.touches[0].clientX);
}

function onTouchEnd() {
  // 保留选中态，方便用户看清数值。
  // 抬手就收是错的：抬手正是要读数的时刻，一抬手数字没了，
  // 等于逼用户用一根手指同时看和记。回到常态靠切港口/日期。
}
</script>

<style lang="scss" scoped>
.tide-chart {
  position: relative;
}

/*
 * 顶部读数区。
 *
 * 右列（时刻 + 徽章）与左列底对齐：数字的下沿和徽章的下沿齐平，
 * 两列才像并排的两块，而不是一个悬在半空的标签。
 */
.tide-chart__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.tide-chart__head-main {
  display: flex;
  flex-direction: column;
}

.tide-chart__head-label {
  color: $fish-muted;
  @include fish-type(caption);
  font-weight: 600;
}

.tide-chart__head-value {
  display: flex;
  align-items: baseline;
}

.tide-chart__head-number {
  color: $fish-ink;
  @include fish-type(display);
  @include numeric;
}

/* 单位退到次级：同一个数字，单位是限定词 */
.tide-chart__head-unit {
  margin-left: 8rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

.tide-chart__head-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.tide-chart__head-time {
  margin-bottom: 8rpx;
  color: $fish-muted-60;
  @include fish-type(body);
  font-weight: 600;
}

/*
 * 量纲标签。
 *
 * 纵轴刻度去掉之后，它是图上唯一说明「纵轴是什么」的东西，
 * 所以给它一点字重 —— 它是标题，不是脚注。
 */
.tide-chart__axis-label {
  display: block;
  margin-bottom: 8rpx;
  color: $fish-muted;
  @include fish-type(caption);
  font-weight: 600;
}

/*
 * 绘图区。给一块确定尺寸的盒子，两层画布绝对定位叠在里面。
 *
 * 盒子自己有高度，下面的内容才会被顶到正确的位置；
 * 两层画布不占流，只画在这同一块盒子里。
 */
.tide-chart__plot {
  position: relative;
}

.tide-chart__canvas {
  position: absolute;
  top: 0;
  left: 0;
  display: block; // 微信端必须是 block，否则 canvas 是 inline 元素，尺寸计算会偏
}
</style>
