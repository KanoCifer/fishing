<template>
  <view class="tide-chart">
    <!--
      顶部读数。

      为什么放顶部而不是图下方：这张图**没有纵轴刻度**了（见下面
      「潮高（m）」那个标签的解释）。纵轴是绝对量的读数出口，
      去掉之后「此刻多少米」在图上就没有对应的位置 ——
      顶部这一块就是它的位置。

      涨落状态是本地算出来的，不是后端给的字段：后端只给逐时潮高和潮汐表，
      「比上一小时高了还是低了」在本地比一下就有了。
    -->
    <view v-if="hasNow" class="tide-chart__head">
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

    <!--
      量纲标签。

      纵轴刻度整列去掉之后，「这张图的纵轴是什么」就没有别的出口了 ——
      这个标签就是那个出口。它必须在图**外面**（DOM 里）而不是画在 canvas 上：
      canvas 里画字只能用硬编码色值和 px 字号，跟令牌层对不上；
      放在 DOM 里就能直接吃样式层的字阶与颜色。
    -->
    <text class="tide-chart__axis-label">潮高（m）</text>

    <!--
      canvas 的宽高必须是确定的数值，不能用百分比：
      小程序端拿不到百分比的实际尺寸，会画成 0 宽。
      另：display: block 写在样式里，否则微信端 canvas 是 inline 元素，尺寸计算会偏。
      数值在 setup 里就算好绑定（cssWidthPx/cssHeightPx），不是 onMounted 里补的 ——
      少一次「先空串渲染、再补值」的往返，节点首帧就带着确定宽高。
    -->
    <!--
      绘图区。静态层在下、动态层在上，两块画布叠在一起。

      为什么拆两层：网格线、时间刻度和极值标注是**死的**（数据没变就不变），
      曲线、面积、标线则每一帧都在变。单画布每帧都要 clearRect 再整张重画，
      那十来个刻度数字就被重画了四十多遍 —— 文字光栅化是 canvas 里最贵的一档。
      拆成两层之后，刻度只画一次，动画帧只清空上层画曲线。

      两块画布的 CSS 尺寸完全一致、绝对定位在同一个原点，所以两层像素对齐，
      不会错位。触摸事件挂在上层（下面那层被上层整个盖住，收不到事件）。
    -->
    <view class="tide-chart__plot" :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }">
      <canvas
        :id="baseCanvasId"
        type="2d"
        class="tide-chart__canvas tide-chart__canvas--base"
        :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }"
      />
      <canvas
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
/**
 * TideChart —— 逐时潮高曲线。
 *
 * 版式（对着参考稿排的）：
 *   顶部   当前潮高（大字） + 当前时刻 + 涨落状态
 *   图上   虚线网格（**没有纵轴刻度**）+ 平滑曲线 + 面积 + 极值标注 + 「现在」标线
 *   底部   时间刻度
 *
 * 纵轴刻度去掉之后，潮高这个绝对量就只能落在**图上**读 ——
 * 所以每个关键点（当前时刻、每天的极值）都在曲线上直接标出数值，
 * 而不是让人去轴上找。
 */
import { onPageShow } from '@dcloudio/uni-app';
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { buildCurve, buildPolyline, clipCurve, headX, type CurvePoint, type CurveSegment } from '@/utils/curve';
import { axisScale } from '@/utils/chartAxis';
import { CANVAS_FONT_STACK, setCanvasFont, withAlpha } from '@/utils/canvas';
import { createSelectorQuery } from '@/utils/selectorQuery';
import { windowMetrics } from '@/composables/windowMetrics';

import Chip from '../Chip/Chip.vue';

/**
 * `fields({ node: true })` 返回的 canvas 节点没有官方类型，按用到的成员局部声明。
 */
interface CanvasNode2D {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  /** 基础库 2.7.0+ 由 canvas 节点提供（type="2d" 本身要求 2.9.0+，所以一定在） */
  requestAnimationFrame(cb: () => CanvasFrameCallback | void): number;
  cancelAnimationFrame(requestId: number): void;
}

type CanvasFrameCallback = () => void;

/**
 * SelectorQuery 里取出来的 canvas 节点，以及它相对视口的左边距。
 *
 * 官方 `fields` 回调的类型是 `NodeInfo`，但它里面没有 `node` 字段
 * （node 在 `NodeCallbackResult` 里，官方把它标成了 any），而 `NodeInfo` 本身
 * 在应用代码里也无法按名引用 —— 它在未导出的 `UniNamespace` 内。
 * 所以这里按实际用到的成员自己声明，值在回调里收窄一次。
 *
 * 宽高不取自查询结果：那是布局测量值，画布尺寸由 rpx 自己算，见 cssWidthPx。
 */
interface CanvasQueryResult {
  node?: CanvasNode2D;
  left?: number;
}

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
  duration: 700,
  smooth: true,
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

const sizeRef = ref<{ width: number; height: number } | null>(null);
/** 动态层 ctx：曲线、面积、标线，每帧重画 */
const ctxRef = ref<CanvasRenderingContext2D | null>(null);
/** 静态层 ctx：网格与刻度，只在几何变了时重画一次 */
const baseCtxRef = ref<CanvasRenderingContext2D | null>(null);
const dprRef = ref(1);

/** 画布节点，帧调度要用它自带的方法。不进模板也不需要响应式 */
let canvasNode: CanvasNode2D | null = null;
let rafId = 0;

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
 * 画布在**视口**里的左边距。
 *
 * 触摸换算必须先减掉它：touches[0].clientX 是视口坐标，而 plotLeft /
 * pointGap 是画布坐标。之前直接拿 clientX 去减画布坐标，整条曲线的取值
 * 都偏右了整整一个画布宽度 —— 贴着右端按，选中的却是倒数第二三个点。
 * （这里一度被当成「LineChart 的折算范本」写在注释里，其实两个都错。）
 *
 * 只测一次：画布是定宽块、在卡片里横向居中，位置不会变。
 * 每次 touchmove 都走一遍 SelectorQuery 得不偿失。
 */
let canvasLeft = 0;

/** 入场动画进度 0→1 */
let progress = 1;

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

/**
 * 绘图区四周的留白（px）。
 *
 * 左右几乎贴边：曲线是这张图的主角，两边各留一截就把它挤窄了。
 * 上面留的那一截不是留白，是**给曲线上的数值标注用的**——
 * 标注画在极值点上方，没有这截就会顶出画布被切掉。
 */
const PAD = { left: 2, right: 2, top: 22, bottom: 4 };
/** X 轴标签区的高度 */
const AXIS_H = 26;
/** 曲线线宽。与 LineChart 同一档，两张图才是一套东西 */
const LINE_WIDTH = 2.5;
/** 网格虚线的节奏 */
const GRID_DASH = [4, 4];

/** 时间刻度的字号（px） */
const X_LABEL_SIZE = 11;
/** 曲线上数值标注的字号（px）。比时间刻度大一号 —— 它是读数，时间只是语境 */
const VALUE_LABEL_SIZE = 12;
/**
 * 两个数值标注之间的最小水平间距（px）。
 *
 * 太近会叠在一起，两串数字糊成一团就等于没标。
 */
const MIN_LABEL_GAP = 40;
/**
 * 极值的最小显著度（m）。
 *
 * 逐时潮高里偶尔有一两个点的抖动，标出来是图上多一个孤零零的数字，
 * 没有信息量 —— 5cm 以下的变化不算一个极值。
 */
const MIN_PROMINENCE = 0.05;

/**
 * 数据本身的取值域：向上/向下取整到 0.1。
 *
 * 这一步只管「数据大概在什么范围」；刻度怎么落在整数上由 axisScale 决定 ——
 * 两者分开，是为了这里不必关心标签好不好看。
 */
function niceBounds(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 1 };

  let lo = Math.min(...values);
  let hi = Math.max(...values);

  // 潮差通常不到 1m，直接取整会把曲线压成一条直线，拉开一档看得清起伏
  const span = hi - lo;
  if (span < 0.5) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }

  lo = Math.floor(lo * 10) / 10;
  hi = Math.ceil(hi * 10) / 10;
  return { min: lo, max: hi === lo ? lo + 1 : hi };
}

/** 量一段文字的宽度（px） */
function measureText(ctx: CanvasRenderingContext2D, text: string, size: number, weight = 400): number {
  ctx.save();
  setCanvasFont(ctx, weight, size);
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

/**
 * 潮高文案。
 *
 * `height` 的后端类型是 `number | string`，实测会出现 `""` / `null`。
 * 这里必须逐个判空：直接 `Number(x)` 会把 `""` 和 `null` 都变成 0，
 * 读数上于是显示「0.00 m」——一个凭空长出来的、看着还挺可信的数字。
 * 脏值一律显示破折号，和图上「跳过该点」的处理保持一致。
 */
function formatHeight(value: number | string | null | undefined): string {
  const n = parseHeight(value);
  return n === null ? '—' : n.toFixed(2);
}

/**
 * 把后端给的潮高解析成一个能画的数，脏值给 null。
 *
 * 为什么不能直接 `Number(x)`：`Number('')` 和 `Number(null)` 都是 **0**，
 * 一个空字段会变成「潮高 0.00 m」—— 图上凭空多出一段贴着零的曲线，
 * 还会把取值域拉低、把刻度算歪。看着还挺可信的数字最坏。
 *
 * 所以先判空再转数，转完还要看是不是有限值。
 */
function parseHeight(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 把逐时潮高清洗成可绘制的数值序列，并记下每个值来自原始序列的哪个位置。
 *
 * 为什么必须清洗：后端 `height` 字段类型是 `number | string`，实测会出现
 * `""` / `null` 这类脏值。此前这里用 `values.some(...)` 一票否决 ——
 * 24 个点里任意一个是脏的就整张图不画，且没有任何提示，表现就是
 * 「潮汐卡片一片空白」。改为逐点剔除非有限值：脏点跳过、其余照常画，
 * 曲线最多短一截，而不会整张图消失。
 *
 * 顺带记下「位置 → 原始下标」：剔掉脏点之后位置与原始下标不再一一对应，
 * 而时间刻度、当前时刻、选中点都是按原始下标给的，不记这一笔就没法对回去。
 */
function cleanPoints(): { values: number[]; sourceIndex: number[] } {
  const values: number[] = [];
  const sourceIndex: number[] = [];
  props.points.forEach((point, index) => {
    const value = parseHeight(point.height);
    if (value === null) return;
    values.push(value);
    sourceIndex.push(index);
  });
  return { values, sourceIndex };
}

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
 * 绘图区几何。两层画布共用同一份 —— 静态层画网格、动态层画曲线，
 * 两者必须落在同一套坐标上，否则刻度和曲线会错开。
 */
interface PlotGeom {
  left: number;
  right: number;
  top: number;
  bottom: number;
  plotW: number;
  plotH: number;
  min: number;
  max: number;
  /** 刻度值（升序）。轴上的数字必须是整齐的档位 */
  ticks: number[];
  len: number;
  /** 相邻采样点的横向间距 */
  gap: number;
  /** 清洗后的潮高序列 */
  values: number[];
  /** 清洗后序列的每个位置来自原始序列的哪个下标 */
  sourceIndex: number[];
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

  const { values, sourceIndex } = cleanPoints();
  // 只有全是脏值才没得画；零星脏值上面已经滤掉了
  if (!values.length) {
    // 几何作废：上一轮的数据可能画过，触摸换算不能继续用旧的间距
    plotLeft = 0;
    pointGap = 0;
    geom = null;
    return null;
  }

  const { width, height } = size;
  const bounds = niceBounds(values);
  // 刻度对齐到整齐的档位：0 / 1 / 2 / 3，而不是 0.8 / 1.6 这种半档。
  // 三格就够：格数一多，图就成了格纸，曲线淹没在网格里。
  const scale = axisScale(bounds.min, bounds.max, 3);
  const min = scale.min;
  const max = scale.max;
  const len = values.length;

  const left = PAD.left;
  const right = width - PAD.right;
  const top = PAD.top;
  const bottom = height - AXIS_H - PAD.bottom;
  const plotW = Math.max(1, right - left);
  const plotH = Math.max(1, bottom - top);
  const gap = len > 1 ? plotW / (len - 1) : plotW;

  plotLeft = left;
  pointGap = gap;

  geom = { left, right, top, bottom, plotW, plotH, min, max, ticks: scale.ticks, len, gap, values, sourceIndex };
  return geom;
}

/** 原始下标 → 清洗后序列里的位置。找不到返回 -1 */
function positionOf(originalIndex: number): number {
  if (!geom || originalIndex < 0) return -1;
  return geom.sourceIndex.indexOf(originalIndex);
}

/** 位置 → 画布 x 坐标 */
function indexToX(pos: number, g: PlotGeom): number {
  return g.len > 1 ? g.left + g.gap * pos : g.left + g.plotW / 2;
}

/** 潮高 → 画布 y 坐标 */
function valueToY(value: number, g: PlotGeom): number {
  return g.bottom - ((value - g.min) / (g.max - g.min)) * g.plotH;
}

/**
 * 画在 X 轴上的时间标签。
 *
 * 位置是**清洗后序列**里的位置 —— 与曲线上的点一一对应，
 * 竖向网格线就画在这些标签的正上方。
 */
interface AxisLabel {
  pos: number;
  text: string;
  x: number;
}

/**
 * 选出画在 X 轴上的时刻。
 *
 * 规则：整点、且是 4 的倍数 —— 04:00 / 08:00 / 12:00 / 16:00 / 20:00。
 * 逐时数据有 24 个点，全画会糊成一片，四个小时一档刚好读得清。
 *
 * 标签不是 HH:mm（后端换了格式）时退回按步长取，保证轴上始终有刻度。
 */
function pickLabelPositions(g: PlotGeom): number[] {
  const positions: number[] = [];
  g.sourceIndex.forEach((original, pos) => {
    const label = props.labels[original] ?? '';
    const matched = /^(\d{1,2}):(\d{2})$/.exec(label);
    if (!matched) return;
    if (Number(matched[2]) !== 0) return;
    if (Number(matched[1]) % 4 !== 0) return;
    positions.push(pos);
  });
  if (positions.length >= 3) return positions;

  const step = Math.max(1, Math.ceil(g.len / 5));
  const fallback: number[] = [];
  for (let i = 0; i < g.len; i += step) fallback.push(i);
  return fallback;
}

/**
 * 排好版的 X 轴标签。
 */
function layoutAxisLabels(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  g: PlotGeom,
): AxisLabel[] {
  const items: AxisLabel[] = [];
  for (const pos of pickLabelPositions(g)) {
    const text = props.labels[g.sourceIndex[pos]] ?? '';
    if (!text) continue;
    const x = indexToX(pos, g);
    const half = measureText(ctx, text, X_LABEL_SIZE, 600) / 2;
    if (x - half < 0 || x + half > size.width) continue;
    items.push({ pos, text, x });
  }
  return items;
}

/**
 * 曲线上要标出数值的极值点。
 */
interface ExtremumLabel {
  pos: number;
  value: number;
  x: number;
  y: number;
}

/**
 * 找局部极值（局部高点与局部低点），并给出每个极值的「显著度」。
 *
 * 显著度 = 它与**相邻反向极值**的潮高差。
 *
 * 为什么不用紧挨着的那一个点：真实潮水的谷底常常是平的 ——
 * 连续两三个小时的潮高只差一两厘米，拿紧邻的点比，差值不到 1cm，
 * 一个真正的低潮就被当成抖动扔掉了。拿相邻的反向极值比，
 * 才对得上肉眼看到的那道起伏。
 *
 * 只认内点：序列两端没有两侧可比，判不出「高」还是「低」。
 */
function findExtrema(values: number[]): { pos: number; isMax: boolean; significance: number }[] {
  const raw: { pos: number; isMax: boolean }[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    const next = values[i + 1];
    if (cur > prev && cur >= next) raw.push({ pos: i, isMax: true });
    else if (cur < prev && cur <= next) raw.push({ pos: i, isMax: false });
  }

  return raw.map((item, index) => {
    let significance = Number.POSITIVE_INFINITY;
    for (const other of [raw[index - 1], raw[index + 1]]) {
      // 同向的极值比不出起伏（两个高点之间没有落差可言）
      if (!other || other.isMax === item.isMax) continue;
      const gap = Math.abs(values[item.pos] - values[other.pos]);
      if (gap < significance) significance = gap;
    }
    return { pos: item.pos, isMax: item.isMax, significance };
  });
}

/**
 * 极值标注的位置。
 *
 * 「现在」那个点不标：它自带一个标线和一个数值，两个标注重叠成一团。
 */
function layoutExtremumLabels(g: PlotGeom): ExtremumLabel[] {
  const out: ExtremumLabel[] = [];
  const now = positionOf(props.nowIndex);
  for (const item of findExtrema(g.values)) {
    // 起伏太小的不是极值，是逐时数据里的一个抖动
    if (item.significance < MIN_PROMINENCE) continue;
    // 「现在」那个点不标：它自带一个标线和一个数值，两个标注重叠成一团
    if (item.pos === now) continue;
    const pos = item.pos;
    const x = indexToX(pos, g);
    // 挨太近的两个标注会叠在一起
    if (out.length && x - out[out.length - 1].x < MIN_LABEL_GAP) continue;
    out.push({ pos, value: g.values[pos], x, y: valueToY(g.values[pos], g) });
  }
  return out;
}

/**
 * 静态层：网格 + 时间刻度 + 极值标注。
 *
 * 只在几何变了的时候画一次：换港口、换日期。
 * 动画帧不碰它 —— 那十来个刻度数字不必跟着曲线重画四十遍，
 * 而文字光栅化恰恰是 canvas 2d 里最贵的一档操作。
 */
function drawBase(): void {
  const ctx = baseCtxRef.value;
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

  const labels = layoutAxisLabels(ctx, size, g);
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
  const extremes = layoutExtremumLabels(g);
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
  const ctx = ctxRef.value;
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
  const cut = progress * (len - 1);

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
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // 「现在」标线：只在当前时刻落在数据范围内、且曲线已画完时画。
  //
  // 纵轴刻度去掉了，这根线是图上唯一标出「此刻在哪」的参照 ——
  // 读数在顶部，但位置得在图上找得到。
  const now = positionOf(props.nowIndex);
  if (now >= 0 && now < len && progress >= 1) {
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
  const selected = positionOf(activeIndex.value);
  if (selected >= 0 && selected < len && selected !== now && progress >= 1) {
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
 * 拿不到节点时按 INIT_RETRY_DELAYS 的节奏继续试，**不**一次就放弃：
 * 本组件挂在 TideCard 的 `v-else-if` 分支里，节点是在「数据到了、
 * 面板正在展开」那一刻创建的。面板展开带 0.28s 的高度过渡，节点和
 * 布局就绪的时间点会飘 —— 之前只重试 3 次（约 360ms）就永久放弃，
 * 放弃之后没有任何东西会再触发一次，图表就一直空白，只有切港口/日期
 * 触发重新挂载才恢复。数据变化时会把整条重试链重新武装一次。
 */
const INIT_RETRY_DELAYS = [0, 60, 120, 200, 300, 400, 600] as const;

/**
 * 布局落定后补画。
 *
 * 画布建好时如果容器还在过渡、或节点还没进入合成，首帧会画上但不显示，
 * 而布局稳定之后小程序不会自己补画 —— 表现就是「进页面图表空白，
 * 点一下港口/日期才出来」。这几个时间点各补画一次，覆盖过渡结束
 * 和节点合成；补画直接落到最终态，不再重播入场动画。
 */
const SETTLE_REDRAW_DELAYS = [0, 320, 800] as const;

/**
 * 取节点，顺便量出它相对视口的左边距（触摸换算要用，见 canvasLeft）。
 *
 * 量不到时按 0 处理：这时取值会整体偏右，但总比拿 NaN 去算下标、
 * 把选中态彻底弄丢要好。
 */
function queryCanvas(): Promise<CanvasQueryResult | null> {
  return new Promise((resolve) => {
    createSelectorQuery(instance)
      .select(`#${canvasId}`)
      .fields({ node: true, rect: true }, (res) => {
        const item = Array.isArray(res) ? res[0] : res;
        // node 在官方类型里是 any，这里收窄成本组件实际用到的形状；
        // 顺手做一次判空，省得把 undefined 交给后面 getContext
        const node = (item as { node?: unknown } | undefined)?.node;
        if (typeof node !== 'object' || node === null) {
          resolve(null);
          return;
        }
        const left = (item as { left?: unknown } | undefined)?.left;
        resolve({
          node: node as CanvasNode2D,
          left: typeof left === 'number' && Number.isFinite(left) ? left : 0,
        });
      })
      .exec();
  });
}

/** ctx 是否就绪。没就绪时 play()/draw() 都是空转，调用方要先看这个 */
let initialized = false;
/**
 * 是否已经出过「有数据的」图。
 *
 * 决定数据变化时是播入场动画还是直接出最终态：第一次拿到数据直接出图
 * （那一帧 progress=0，曲线还没画出来，用户看到的是一块空白等它慢慢画），
 * 之后切港口/日期才播动画。
 *
 * 只认「有数据」这一种出图：卡片先于潮位数据挂载，画布会先画一张空图
 * （画布被 v-show 藏着，看不见），那时如果就把标记置上，首屏真正出图时
 * 就会走动画路径，又变回空白等它慢慢画。
 */
let hasPaintedData = false;
/** 同时只允许一次初始化在飞，避免数据变化和重试叠在一起重复建 ctx */
let initializing = false;
/** 已经排到第几次重试 */
let retryIndex = 0;
let retryTimer = 0;
const settleTimers: number[] = [];

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = 0;
  }
}

function clearSettleTimers(): void {
  while (settleTimers.length) {
    clearTimeout(settleTimers.pop()!);
  }
}

function scheduleRetry(): void {
  const delay = INIT_RETRY_DELAYS[retryIndex];
  if (delay === undefined) {
    // 重试用尽还是拿不到节点，画布会一直空白。留一条 warn，
    // 下次再遇到空图能直接分清是「节点没进 DOM」还是「绘制逻辑出错」。
    console.warn(`[TideChart] 画布节点获取失败（已重试 ${INIT_RETRY_DELAYS.length} 次）：未查到 canvas 节点`);
    return;
  }
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = 0;
    void initCanvas();
  }, delay);
}

/** 布局落定后补画，见 SETTLE_REDRAW_DELAYS */
function scheduleSettleRedraw(): void {
  clearSettleTimers();
  for (const delay of SETTLE_REDRAW_DELAYS) {
    settleTimers.push(
      setTimeout(() => {
        if (!initialized) return;
        progress = 1;
        draw();
      }, delay),
    );
  }
}

/**
 * 查静态层画布节点。
 *
 * 静态层不参与触摸换算，只要 node —— 画布自己的宽高按 rpx 算，不必问布局。
 */
function queryBaseCanvas(): Promise<CanvasNode2D | null> {
  return new Promise((resolve) => {
    createSelectorQuery(instance)
      .select(`#${baseCanvasId}`)
      .fields({ node: true }, (res) => {
        const item = Array.isArray(res) ? res[0] : res;
        const node = (item as { node?: unknown } | undefined)?.node;
        resolve(typeof node === 'object' && node !== null ? (node as CanvasNode2D) : null);
      })
      .exec();
  });
}

async function initCanvas(): Promise<void> {
  if (initializing || initialized) return;
  initializing = true;

  try {
    await nextTick();

    // 两块画布一起查。任一没查到都重试 —— 少一层的话静态层是空的，
    // 整张图会缺网格和刻度，而这种半残状态比全空白更难看出原因。
    const [item, base] = await Promise.all([queryCanvas(), queryBaseCanvas()]);
    if (!item?.node || !base) {
      scheduleRetry();
      return;
    }

    const canvas = item.node;
    canvasLeft = item.left ?? 0;
    // dpr 从共享窗口快照取（getWindowInfo 是同步 API，不该现调）
    const dpr = windowMetrics().pixelRatio;
    const width = cssWidthPx.value;
    const height = cssHeightPx.value;

    // 按 dpr 放大位图尺寸，避免高分屏发虚；CSS 尺寸不变，由 rpx 决定。
    // 位图尺寸取整：小屏换算下来可能是小数（622rpx @414pt = 343.36），
    // 位图尺寸按整数给，绘制仍按 CSS 像素走 setTransform，肉眼无差。
    // 两层用同一套尺寸，两层才像素对齐。
    for (const node of [canvas, base]) {
      node.width = Math.round(width * dpr);
      node.height = Math.round(height * dpr);
    }

    sizeRef.value = { width, height };
    dprRef.value = dpr;
    ctxRef.value = canvas.getContext('2d');
    baseCtxRef.value = base.getContext('2d');
    canvasNode = canvas;
    initialized = true;
    clearRetryTimer();

    scheduleSettleRedraw();

    // 静态层先画：动态层每帧只清空自己，网格和刻度得先在下面等着
    computeGeom();
    drawBase();

    // 首帧直接出最终态，不播入场动画。
    //
    // 首次出图发生在「数据到位 + 面板正在展开」那一刻，动画的第一帧
    // progress=0、曲线还没画出来（见 draw 里 pathPoints 不足两点就 return
    // 的那段），用户看到的是一块空白等它慢慢画出来。切数据是用户主动
    // 操作，动画才有表达意义，所以动画只留给那一条路径。
    progress = 1;
    draw();
    if (props.points.length > 0) hasPaintedData = true;
  } finally {
    initializing = false;
  }
}

function cancelFrame() {
  // 必须同一个节点取消：把 requestId 交给别处的 cancelAnimationFrame 会静默失效
  if (canvasNode && rafId) {
    canvasNode.cancelAnimationFrame(rafId);
  }
  rafId = 0;
}

/**
 * 入场动画。
 *
 * mp-weixin 逻辑层没有全局 requestAnimationFrame（那是浏览器 API，连 window 都没有），
 * 取帧走 canvas 节点自带的方法，帧率跟随系统刷新、页面隐藏自动暂停。
 */
function play() {
  // watch 可能早于 SelectorQuery 回调触发，那时节点还没拿到，等 initCanvas 里再放
  if (!canvasNode) return;

  const node = canvasNode;
  cancelFrame();
  const start = Date.now();
  progress = 0;

  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / props.duration);
    // easeOutCubic，末尾减速，比线性自然
    progress = 1 - Math.pow(1 - t, 3);
    draw();
    if (t < 1) {
      rafId = node.requestAnimationFrame(tick);
    } else {
      rafId = 0;
    }
  };

  rafId = node.requestAnimationFrame(tick);
}

onMounted(() => {
  void initCanvas();
});

watch(
  () => [props.points, props.labels, props.nowIndex],
  () => {
    // 换数据后旧的选中下标不再有意义，留着会显示另一组数据里的点
    activeIndex.value = -1;

    // 画布还没拿到就先补拿。之前这里无条件走 play()，而 play() 拿不到
    // 节点就直接 return，等于白等 —— 数据变了但图表还是空的。
    if (!initialized) {
      retryIndex = 0;
      void initCanvas();
      return;
    }

    scheduleSettleRedraw();

    // 轴范围和标签都跟着数据变了：静态层得重画，
    // 否则刻度上还挂着上一组数据的数字。
    computeGeom();
    drawBase();

    // 切港口/日期是用户主动操作，这里才播入场动画；
    // 第一次拿到数据（hasPainted 还没置位）直接出最终态。
    if (props.animate && hasPaintedData) {
      play();
    } else {
      progress = 1;
      draw();
      if (props.points.length > 0) hasPaintedData = true;
    }
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
  if (!initialized) {
    retryIndex = 0;
    void initCanvas();
    return;
  }
  progress = 1;
  draw();
});

// 页面反复进出会持续漏帧，不取消就一路漏下去；定时器同理
onBeforeUnmount(() => {
  cancelFrame();
  clearRetryTimer();
  clearSettleTimers();
});

/**
 * 触摸换算。
 *
 * clientX 是**视口**坐标，plotLeft / pointGap 是**画布**坐标，
 * 两者之间隔着画布自己的左边距 canvasLeft —— 不减它，整条曲线偏右一个画布宽。
 *
 * 选中后必须重绘：标线和数值都画在 canvas 上，见 draw 里那段。
 */
function pick(clientX: number) {
  const g = geom;
  if (!g || !g.len || pointGap <= 0) return;

  const rel = (clientX - canvasLeft - plotLeft) / pointGap;
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
  @include fish-type(large-title);
}

/* 单位退到次级：同一个数字，单位是限定词 */
.tide-chart__head-unit {
  margin-left: 8rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}

.tide-chart__head-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.tide-chart__head-time {
  margin-bottom: 8rpx;
  color: $fish-muted-60;
  @include fish-type(subhead);
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
