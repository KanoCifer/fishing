<template>
  <view class="line-chart">
    <!--
      绘图区。静态层在下、动态层在上，两块画布叠在一起。

      为什么拆两层：网格线和坐标刻度是**死的**（数据没变就不变），
      曲线、面积、准星则每一帧都在变。单画布每帧都要 clearRect 再整张重画，
      那十来个刻度数字就被重画了四十多遍 —— 文字光栅化是 canvas 里最贵的一档。
      拆成两层之后，刻度只画一次，动画帧只清空上层画曲线。

      两块画布的 CSS 尺寸完全一致、绝对定位在同一个原点，所以两层像素对齐，
      不会错位。触摸事件挂在上层（下面那层被上层整个盖住，收不到事件）。
    -->
    <view class="line-chart__plot" :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }">
      <canvas
        :id="baseCanvasId"
        type="2d"
        class="line-chart__canvas line-chart__canvas--base"
        :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }"
      />
      <canvas
        :id="canvasId"
        type="2d"
        class="line-chart__canvas line-chart__canvas--top"
        :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      />
    </view>

    <!--
      读数轨道。

      为什么是「轨道」而不是浮在曲线上的气泡：气泡要压在绘图区里，就得
      自己算翻转、自己算边界、自己算一个宽度上限（这一版的旧实现为了做
      边界收拢，把 120px 这个数同时写进了 CSS 和脚本两处）。轨道是图表
      下面的一条固定行，它不遮挡任何数据，也不需要任何落位逻辑 ——
      所有几何都在 CSS 里，写完了就不会再坏。

      两组内容叠在同一个格子里交叉淡入。用 position: absolute 叠过一版，
      结果常态那组一转绝对定位就退出了 flex 流，「当日概览」被挤走、
      布局塌掉；grid 叠同一个单元就没有这个问题。
    -->
    <view class="line-chart__rail">
      <!-- 常态：没有选中任何点时显示当日概览，而不是留一条空轨道 -->
      <view class="line-chart__slot" :class="{ 'line-chart__slot--idle': !isActive }">
        <text class="line-chart__rail-label">当日概览</text>
        <!--
          数字用墨色，「最高 / 最低」和单位退到次级 ——
          同一行里哪部分是读数、哪部分是限定词，版式自己说话。
        -->
        <view class="line-chart__stats">
          <view class="line-chart__stat">
            <text class="line-chart__stat-qualifier">最高</text>
            <text class="line-chart__stat-value">{{ summary.high }}</text>
            <text v-if="unit" class="line-chart__stat-unit">{{ unit }}</text>
            <text v-if="summary.highBand" class="line-chart__stat-band">{{ summary.highBand }}</text>
          </view>
          <view class="line-chart__stat">
            <text class="line-chart__stat-qualifier">最低</text>
            <text class="line-chart__stat-value">{{ summary.low }}</text>
            <text v-if="unit" class="line-chart__stat-unit">{{ unit }}</text>
            <text v-if="summary.lowBand" class="line-chart__stat-band">{{ summary.lowBand }}</text>
          </view>
        </view>
      </view>

      <!-- 激活：当前时刻的读数 -->
      <view class="line-chart__slot" :class="{ 'line-chart__slot--active': isActive }">
        <text class="line-chart__rail-label">{{ activeLabel }}</text>
        <view class="line-chart__rows">
          <view v-for="row in activeRows" :key="row.key" class="line-chart__row">
            <view class="line-chart__dot" :style="{ backgroundColor: row.color }" />
            <!-- 单系列时系列名是废话：标题上已经写着「气温 · 未来 24 小时」 -->
            <text v-if="isMultiSeries" class="line-chart__name">{{ row.name }}</text>
            <text class="line-chart__number">{{ row.text }}</text>
            <text v-if="unit" class="line-chart__unit">{{ unit }}</text>
            <text v-if="row.band" class="line-chart__band">{{ row.band }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { buildCurve, buildPolyline, clipCurve, type CurvePoint, type CurveSegment } from '@/utils/curve';
import { axisScale, formatTick, type AxisScale } from '@/utils/chartAxis';
import { CANVAS_FONT_STACK, withAlpha } from '@/utils/canvas';
import { createSelectorQuery } from '@/utils/selectorQuery';
import { windowMetrics } from '@/composables/windowMetrics';

interface Series {
  name: string;
  data: number[];
  color?: string;
}

/**
 * `fields({ node: true })` 返回的 canvas 节点没有官方类型，
 * 按实际用到的成员局部声明，不要 any。
 */
interface CanvasNode2D {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  /**
   * 基础库 2.7.0+ 由 canvas 节点提供的 rAF。
   * 本项目只有小程序端，`type="2d"` 本身就要求 2.9.0+，所以这两个方法一定在，
   * 直接声明为必需，不用再写 H5 的兑底分支。
   */
  requestAnimationFrame(cb: () => void): number;
  cancelAnimationFrame(requestId: number): void;
}

/** 轨道上的一行读数 */
interface ActiveRow {
  key: string;
  name: string;
  color: string;
  text: string;
  /** 分档名（如「中雨」）。没有分档表时为空串 */
  band: string;
}

/** 轨道常态的两个极值 */
interface Summary {
  high: string;
  low: string;
  /** 两个极值各自的分档名 */
  highBand: string;
  lowBand: string;
}

const props = withDefaults(
  defineProps<{
    categories: string[];
    series: Series[];
    /** 画布宽，单位 rpx */
    width?: number;
    /** 画布高，单位 rpx */
    height?: number;
    /**
     * 数值单位，显示在读数轨道上。
     *
     * 为什么不留在图表外面当脚注：脚注是「这张图是 °C」，
     * 轨道上跟数字挨着的是「这个点是 27.5 °C」。用户读的是后者。
     */
    unit?: string;
    /** 是否播放入场动画（逐段绘制） */
    animate?: boolean;
    /** 入场动画时长，毫秒 */
    duration?: number;
    /**
     * 纵轴下界。不传时从 0 起。
     *
     * 为什么需要：默认的「把最大值向上取整」会把 22~31℃ 的气温曲线顶到
     * 0~50 轴的最上面两成，7 天的起伏看着像一条直线。气温这类本身就在
     * 高位波动的量必须给一个贴近数据的下界才有信息量。
     */
    min?: number;
    /** 纵轴上界。不传时按数据自动取整 */
    max?: number;
    /**
     * X 轴每隔几个点画一个标签。不传时 8 个点以内全画、超过就隔一个画一个。
     * 点多且标签长（如 24 小时的时刻）时显式传 3~4，否则标签会糊成一片。
     */
    labelStep?: number;
    /**
     * X 轴要出标签的采样点下标。
     *
     * 传了就按这个集合画，位置是真的；不传时按 labelStep 的等距步长画。
     *
     * 用在哪：分钟降水的横轴是「现在 / 20 分钟 / 60 分钟 / 100 分钟」——
     * 这四个位置不等距（间隔 20、40、40 分钟），等距步长画不出这个。
     */
    labelIndices?: number[];
    /**
     * 自定义纵轴刻度（值 + 文字）。
     *
     * 传了就用它替代自动刻度：刻度值可以不等距，文字由调用方给。
     * 落在取值域外的刻度不画。
     *
     * 用在哪：分钟降水的纵轴是「小雨 / 中雨 / 大雨」这类等级线 ——
     * 等级的分界本来就不等距（2.5 / 8 / 16），而且轴上不该出现具体数字。
     */
    yTicks?: { value: number; label: string }[];
    /**
     * 读数的分档标签。
     *
     * 一张表：值落在哪一档就用哪一档的名字（表按 min 升序，落不进任何一档给空串）。
     *
     * 用在哪：分钟降水的读数要写成「0.18 mm/5m 中雨」。
     * 分档语义（小雨 / 中雨 / 大雨）留在调用方 —— 组件不知道雨是什么，
     * 它只管把这段字放在数值后面。
     */
    valueBands?: { min: number; label: string }[];
    /**
     * 是否把采样点连成平滑曲线。
     *
     * 默认开：逐时气温、风速这类连续量，直线连接会在拐点处留下折角，
     * 读起来像「数据在跳」；平滑之后拐点处是圆弧，更像连续变化的量。
     *
     * 走的是单调三次插值（Fritsch–Carlson），曲线不会冲出采样点的范围 ——
     * 降水量这种以 0 为底的量尤其需要：普通样条会插出负值，图上会多出一段
     * 并不存在的降水。
     */
    smooth?: boolean;
    /**
     * 读数的小数位。
     *
     * 默认一位：气温、风速、逐时降水这些量，一位小数够用。
     * 分钟级降水的量级在 0.0X~0.4 毫米，一位小数会把 0.15 毫米说成 0.2、
     * 把 0.04 毫米说成 0 —— 而那一档的差异正是这张图要说的事。
     */
    precision?: number;
  }>(),
  {
    width: 690,
    height: 360,
    unit: '',
    animate: true,
    duration: 700,
    smooth: true,
    precision: 1,
  },
);

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
const canvasId = `line-chart-${uid}`;
/** 静态层画布（网格 + 刻度）。id 也要页面内唯一 */
const baseCanvasId = `line-chart-base-${uid}`;

/**
 * 系列配色。取 iOS 系统色蓝、红、黄、绿、紫五色，顺序刻意从主色蓝起，
 * 让首条曲线与页面主题一致。
 *
 * 同样是 canvas 硬编码，改主题时要和令牌层 _color.scss 的 $fish-* 一起看。
 */
const PALETTE = ['#007aff', '#ff3b30', '#ffcc00', '#34c759', '#af52de'];

/**
 * 画布侧的色值。**必须与令牌层 _color.scss 保持一致**。
 *
 * Canvas 2d 只能从 context 读色，解析不了 SCSS 变量和 CSS 变量，
 * 所以这里只能硬编码。改主题时令牌层 _color.scss 和这几行要一起改 ——
 * 漏改的话图表会和卡片配色对不上，而这种不一致在编译期完全看不出来。
 *
 * 网格线分两档：内部发丝线几乎看不见，基线重一档。层次靠的是
 * 「基线重一档」，不是「线更多」—— 四条同重量的线加上顶边，
 * 图就框成了一个盒子，那是报表软件的做法。
 */
const GRID_COLOR = 'rgba(60, 60, 67, 0.08)'; // $fish-grid（内部网格线）
const AXIS_COLOR = 'rgba(60, 60, 67, 0.18)'; // $fish-border-40（基线）
const Y_TEXT_COLOR = '#3f3f45'; // $fish-muted（secondaryLabel）
const X_TEXT_COLOR = '#5b5b60'; // $fish-muted-60（tertiaryLabel）

/**
 * 画布的 CSS 尺寸（px）。
 *
 * rpx 只对样式有效，canvas 内部坐标和位图尺寸都得用 px。
 *
 * 在 setup 里算好直接绑定，而不是 onMounted 里写进 ref：少一次
 * 「先按空串渲染、再补值」的往返，节点首帧就带着确定宽高 ——
 * 首帧没有尺寸时布局测量会拿到 0，画布就再也画不出来了。
 */
const cssWidthPx = computed(() => uni.upx2px(props.width));
const cssHeightPx = computed(() => uni.upx2px(props.height));

/** 绘图用的像素尺寸。同样自己算，不问 SelectorQuery 要布局测量值 */
const sizeRef = ref<{ width: number; height: number } | null>(null);
/** 动态层 ctx：面积、曲线、数据点、准星，每帧重画 */
const ctxRef = ref<CanvasRenderingContext2D | null>(null);
/** 静态层 ctx：网格与刻度，只在几何变了时重画一次 */
const baseCtxRef = ref<CanvasRenderingContext2D | null>(null);
const dprRef = ref(1);
/**
 * canvas 节点，帧调度要用它自带的 requestAnimationFrame。
 * 不进模板也不需要响应式，普通变量即可。
 */
let canvasNode: CanvasNode2D | null = null;
let rafId = 0;

const activeIndex = ref(-1);
const isActive = computed(() => activeIndex.value >= 0);
const isMultiSeries = computed(() => props.series.length > 1);

/**
 * 绘图区相对画布左边的偏移与宽度，触摸换算要用。
 *
 * 之前连 Y 一起记在一个 geo 里，是因为旧的气泡要跟着数据点的 Y 走；
 * 轨道固定在图表下方、位置与数据无关，这两个值就是全部了。
 */
let plotLeft = 0;
let plotWidth = 0;

/**
 * 画布在**视口**里的左边距。
 *
 * 触摸换算必须先减掉它：touches[0].clientX 是视口坐标，而 plotLeft /
 * plotWidth 是画布坐标，两者差的就是这个值。之前直接拿 clientX 去减
 * 画布坐标，整条曲线的取值都偏右了整整一个画布宽度 —— 贴着右端按，
 * 选中的却是倒数第二三个点。
 *
 * 只测一次：画布是定宽块、在页面里横向居中，位置不会变。
 * 每次 touchmove 都走一遍 SelectorQuery 得不偿失。
 */
let canvasLeft = 0;

/** 入场动画进度 0→1 */
let progress = 1;

/** 绘图区的内边距。右边留得多一点：最后一个 X 标签不要贴着边 */
const PAD = { right: 12, top: 14, bottom: 6 };
/** X 轴标签区的高度 */
const AXIS_H = 24;
/** Y 轴刻度与绘图区之间的间距 */
const GUTTER_GAP = 10;
/**
 * 常态数据点的数量上限。
 *
 * 超过这个数就不画常态点：24 个点挤在 315px 上，每个点直径 6px、
 * 间距 12px，画出来是一串虚线而不是数据。选中点照画。
 */
const MARKER_LIMIT = 12;
/**
 * 曲线线宽。两张图用同一档，摆在同一列里才是一套东西。
 *
 * 3.5 不是随手加的：线压粗了，下面的面积才撑得住 —— 线是 2.5 的时候
 * 面积是一层薄雾，看不出是「曲线下面有东西」。
 */
const LINE_WIDTH = 3.5;
/**
 * 数据点半径。实心圆，和 iOS 图表一致。
 *
 * 比线宽的一半大一点：半径小于半条线宽的话，点就整个埋在线里，
 * 画出来只是一段粗线上的鼓包。
 */
const MARKER_RADIUS = 4;

/**
 * 数值格式。跟 Y 轴刻度用同一套：四舍五入到 `precision` 位小数，再按整数输出。
 *
 * 小数位由 props.precision 给（默认一位）。分钟级降水要两位 ——
 * 0.15 毫米和 0.04 毫米在一位数下都会变成「0」或「0.2」，
 * 那正是这张图要说清楚的差别。
 */
function formatValue(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const factor = 10 ** props.precision;
  return String(Math.round(value * factor) / factor);
}

/**
 * 把一条系列拆成若干「连续有值的段」。
 *
 * 脏值（null / NaN）不能当 0 画 —— 那会在图上凭空长出一段落到零点的曲线，
 * 而图不会说谎，看的人只能信。断开的段各自成线，中间留白。
 */
function splitRuns(data: number[]): { index: number; value: number }[][] {
  const runs: { index: number; value: number }[][] = [];
  let run: { index: number; value: number }[] = [];
  data.forEach((value, index) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      run.push({ index, value });
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

/** 所有系列里所有能用的数值 */
function finiteValues(): number[] {
  const values: number[] = [];
  for (const s of props.series) {
    for (const v of s.data) {
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
  }
  return values;
}

const activeLabel = computed(() => (activeIndex.value >= 0 ? (props.categories[activeIndex.value] ?? '') : ''));

/**
 * 分档表，按 min 升序。
 *
 * 排序放在这里做一次：调用方给的表不保证有序，而分档是「落在哪一档」，
 * 顺序错了会挑错档。
 */
const sortedBands = computed(() => [...(props.valueBands ?? [])].sort((a, b) => a.min - b.min));

/**
 * 某个值属于哪一档。
 *
 * 没有分档表、值不合法、落不进任何一档，都给空串 —— 那一段字就不出现。
 */
function bandLabel(value: number): string {
  if (!Number.isFinite(value)) return '';
  let hit = '';
  for (const band of sortedBands.value) {
    if (value < band.min) break;
    hit = band.label;
  }
  return hit;
}

const activeRows = computed<ActiveRow[]>(() => {
  const i = activeIndex.value;
  if (i < 0) return [];
  return props.series.map((s, si) => ({
    key: String(si),
    name: s.name,
    color: s.color || PALETTE[si % PALETTE.length],
    text: formatValue(s.data[i]),
    band: bandLabel(s.data[i]),
  }));
});

/**
 * 常态读数：当日最高 / 最低。
 *
 * 跨所有系列取极值。这只在**各系列同单位**时成立 —— 现在唯一的调用方
 * MetricChart 一次只画一条线，成立。将来若要多线共用一张图，这里得换成
 * 真正的图例（每系列一个小色块 + 当前值），而不是一句「最高 / 最低」。
 */
const summary = computed<Summary>(() => {
  const values = finiteValues();
  if (!values.length) return { high: '—', low: '—', highBand: '', lowBand: '' };
  const high = Math.max(...values);
  const low = Math.min(...values);
  return {
    high: formatValue(high),
    low: formatValue(low),
    highBand: bandLabel(high),
    lowBand: bandLabel(low),
  };
});

/**
 * 请求的取值域（**未**对齐到网格）。
 *
 * 对齐交给 axisScale：网格与边界必须一起定，只定其一就会出现半个格。
 *
 * 只给下界时，上界跟着数据走。原先这里用 niceMax 把最大值向上取整，
 * 22~31℃ 的气温曲线会被顶到 0~50 轴的最上面两成 —— 七天的起伏看着像一条直线。
 */
function axisRequest(): { min: number; max: number } {
  const values = finiteValues();
  if (!values.length) return { min: 0, max: 1 };
  const dataMax = Math.max(...values);

  if (props.min !== undefined && props.max !== undefined) {
    return { min: props.min, max: Math.max(props.max, props.min + 1) };
  }
  if (props.min !== undefined) {
    return { min: props.min, max: Math.max(dataMax, props.min + 1) };
  }
  return { min: 0, max: Math.max(dataMax, 1) };
}

/**
 * 描出一串曲线段。
 *
 * 只描线，不做算法：曲线怎么算出来的在 utils/curve，两张图共用那一份，
 * 这样曲线形状和动画头部必然一致。
 */
function traceSegments(ctx: CanvasRenderingContext2D, segments: CurveSegment[]): void {
  if (!segments.length) return;
  ctx.moveTo(segments[0].x0, segments[0].y0);
  for (const segment of segments) {
    ctx.bezierCurveTo(segment.cx1, segment.cy1, segment.cx2, segment.cy2, segment.x1, segment.y1);
  }
}

/** 量一段文字的宽度（px）。用来把标签摆在该摆的位置上 */
function measureText(ctx: CanvasRenderingContext2D, text: string, size: number): number {
  ctx.save();
  ctx.font = `${size}px ${CANVAS_FONT_STACK}`;
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

/**
 * 纵轴刻度。
 *
 * 传了 yTicks 就用它：等级线的位置本来就不等距，而且轴上不该出现具体数字。
 * 落在取值域外的刻度不画 —— 画出去就成了轴外的一条线。
 *
 * 不传就按 axisScale 的等距刻度来，标签是格式化后的数字。
 */
function buildTicks(scale: AxisScale): { value: number; label: string }[] {
  if (props.yTicks?.length) {
    return props.yTicks
      .filter((tick) => tick.value >= scale.min - 1e-9 && tick.value <= scale.max + 1e-9)
      .map((tick) => ({ value: tick.value, label: tick.label }));
  }
  return scale.ticks.map((value) => ({ value, label: formatTick(value) }));
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
  /** 纵轴跨度，至少 1，避免上下界相等时除零 */
  span: number;
  /** 刻度（升序）。label 是画在轴上的那行字 */
  ticks: { value: number; label: string }[];
  len: number;
  /** 相邻采样点的横向间距 */
  labelGap: number;
  /** X 轴标签每隔几个点画一个 */
  stride: number;
}

/**
 * 最近一次算出的几何。
 *
 * 数据没变就一直有效 —— 动画帧只重画动态层，不必每帧重算一遍轴范围。
 */
let geom: PlotGeom | null = null;

/**
 * 算几何，顺手把触摸换算要的两个值记下来。
 *
 * plotLeft / plotWidth 是从这份几何里取的，所以每次几何变了
 * （换数据、改纵轴上下界）都要跟着更新，否则选点会按旧的间距算。
 */
function computeGeom(): PlotGeom | null {
  const size = sizeRef.value;
  if (!size) return null;

  const request = axisRequest();
  const scale = axisScale(request.min, request.max, 4);

  /**
   * 左边距由**实测的最宽刻度标签**决定，不写死。
   *
   * 写死的那一版在标签变宽时会把刻度文字顶出画布。
   * 拿不到 ctx 时（画布还没初始化）用一档经验值兜底 ——
   * 那时图还没画出来，几何只是先占个位，initCanvas 里会重算。
   */
  const ctx = baseCtxRef.value;
  const ticks = buildTicks(scale);
  let gutter = 0;
  if (ctx) {
    for (const tick of ticks) {
      const width = measureText(ctx, tick.label, 11);
      if (width > gutter) gutter = width;
    }
  }
  const left = (gutter || 24) + GUTTER_GAP;

  const { width, height } = size;
  const top = PAD.top;
  const right = width - PAD.right;
  const bottom = height - AXIS_H - PAD.bottom;
  const plotW = Math.max(1, right - left);
  const plotH = Math.max(1, bottom - top);

  const len = props.categories.length;

  plotLeft = left;
  plotWidth = plotW;

  geom = {
    left,
    right,
    top,
    bottom,
    plotW,
    plotH,
    min: scale.min,
    max: scale.max,
    span: Math.max(1e-6, scale.max - scale.min),
    ticks,
    len,
    labelGap: len > 1 ? plotW / (len - 1) : 0,
    stride: Math.max(1, props.labelStep ?? (len > 8 ? 2 : 1)),
  };
  return geom;
}

/**
 * 静态层：网格 + 坐标刻度。
 *
 * 只在几何变了的时候画一次：换数据、改纵轴上下界、换标签间隔。
 * 动画帧不碰它 —— 那十来个刻度数字不必跟着曲线重画四十遍，
 * 而文字光栅化恰恰是 canvas 2d 里最贵的一档操作。
 */
function drawBase(): void {
  const ctx = baseCtxRef.value;
  const size = sizeRef.value;
  const g = geom;
  if (!ctx || !size || !g) return;

  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';

  g.ticks.forEach((tick, i) => {
    const y = Math.round(g.bottom - ((tick.value - g.min) / g.span) * g.plotH) + 0.5;
    const isBase = i === 0;
    /*
     * 顶边不画：一条顶线加上底边，图就框成了一个盒子。
     *
     * 判据是「这条线在不在顶边上」，不是「它是不是最后一条」——
     * 自定义刻度（等级线）的最后一条往往落在轴顶以下，那条线是要画的。
     * 自动刻度的最后一条正好落在轴顶（axisScale 的刻度到 max 为止），
     * 所以这条判据对老图表没有行为变化。
     */
    const isTop = y <= g.top + 0.5;

    if (!isTop) {
      ctx.strokeStyle = isBase ? AXIS_COLOR : GRID_COLOR;
      ctx.beginPath();
      ctx.moveTo(g.left, y);
      ctx.lineTo(g.right, y);
      ctx.stroke();
    }

    ctx.fillStyle = Y_TEXT_COLOR;
    ctx.font = `11px ${CANVAS_FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(tick.label, g.left - GUTTER_GAP, y);
  });

  // X 轴标签。比 Y 轴淡一档：它是语境，读的时候顺带扫过
  ctx.fillStyle = X_TEXT_COLOR;
  ctx.font = `10px ${CANVAS_FONT_STACK}`;
  ctx.textBaseline = 'top';
  // 指定了要出标签的下标就按它来（位置不等距），否则走等距步长
  const labelSet = props.labelIndices?.length ? new Set(props.labelIndices) : null;
  props.categories.forEach((c, i) => {
    if (labelSet ? !labelSet.has(i) : i % g.stride !== 0) return;
    const x = g.len > 1 ? g.left + g.labelGap * i : g.left + g.plotW / 2;
    const width = measureText(ctx, c, 10);
    // 贴边的标签改成靠边对齐，否则会被画布切掉一半
    if (x - width / 2 < 0) {
      ctx.textAlign = 'left';
      ctx.fillText(c, 0, g.bottom + 8);
    } else if (x + width / 2 > size.width) {
      ctx.textAlign = 'right';
      ctx.fillText(c, size.width, g.bottom + 8);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(c, x, g.bottom + 8);
    }
  });
}

/**
 * 画布内空态：数据全脏时给一行说明，别让用户对着空白猜。
 */
function drawEmptyHint(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = X_TEXT_COLOR;
  ctx.font = `12px ${CANVAS_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('暂无数据', width / 2, height / 2);
}

/**
 * 动态层：面积、曲线、数据点、准星。每帧重画。
 *
 * 网格和刻度在下面那层静态画布上，这里只管会动的东西。
 */
function draw() {
  const ctx = ctxRef.value;
  const size = sizeRef.value;
  if (!ctx || !size) return;

  const g = geom ?? computeGeom();
  if (!g) return;

  // setTransform 是覆盖式，scale 是累乘式：动画每帧都调 scale，矩阵会叠成 dpr^n，
  // 第二帧起线条就飞出画布。每帧重置一次矩阵，绘制逻辑继续用 CSS 像素。
  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  if (!finiteValues().length) {
    drawEmptyHint(ctx, size.width, size.height);
    return;
  }
  if (!g.len) return;

  const { left, top, bottom, plotW, plotH, min, span, len, labelGap } = g;
  const indexToX = (i: number) => (len > 1 ? left + labelGap * i : left + plotW / 2);
  const valueToY = (v: number) => bottom - ((v - min) / span) * plotH;

  // 入场动画的头部位置：全局一个 x，各段按它一起截
  const cutX = indexToX(progress * (len - 1));
  // 点多时不画常态数据点
  const showMarkers = len <= MARKER_LIMIT;
  // 多系列时面积压淡一档：几层半透明叠在一起会糊成一片
  const areaAlpha = props.series.length > 1 ? 0.15 : 0.3;

  props.series.forEach((s, si) => {
    const color = s.color || PALETTE[si % PALETTE.length];

    for (const run of splitRuns(s.data)) {
      const points: CurvePoint[] = run.map((r) => ({ x: indexToX(r.index), y: valueToY(r.value) }));
      if (points.length < 2) continue;

      const segments = clipCurve(props.smooth ? buildCurve(points) : buildPolyline(points), cutX);
      // 入场动画第一帧 progress=0，此时一段都还没画出来 —— 硬画会取到
      // undefined 的控制点，异常从 rAF 回调里抛出去会连带这一帧的绘制作废
      if (!segments.length) continue;

      /*
       * 面积：沿曲线走到底再回到底边闭合。竖直方向上浓下淡。
       *
       * 渐变的起点是**曲线自己的顶边**，不是绘图区的顶边。
       *
       * 按绘图区算的话，贴底的曲线（降水、零附近的气温）落在渐变
       * 已经很淡的那一段，取到的透明度接近 0 —— 面积画了等于没画。
       * 曲线有多高，面积就该从它那里开始往下淡。
       *
       * 起点钉在底边上方 1px：曲线正好压在底边时，起止点重合的渐变
       * 会整片按最后一个色标（透明）填，等于把面积抹掉。
       */
      let curveTop = bottom;
      for (const p of points) {
        if (p.y < curveTop) curveTop = p.y;
      }
      const gradient = ctx.createLinearGradient(0, Math.min(curveTop, bottom - 1), 0, bottom);
      gradient.addColorStop(0, withAlpha(color, areaAlpha));
      gradient.addColorStop(0.6, withAlpha(color, areaAlpha * 0.3));
      gradient.addColorStop(1, withAlpha(color, 0));

      ctx.beginPath();
      traceSegments(ctx, segments);
      ctx.lineTo(segments[segments.length - 1].x1, bottom);
      ctx.lineTo(segments[0].x0, bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // 曲线本体
      ctx.beginPath();
      traceSegments(ctx, segments);
      ctx.strokeStyle = color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      if (!showMarkers) continue;
      // 数据点：实心圆（iOS 图表的样子），不是白心描边圈。
      // 有选中点时把其余压到 0.32 —— 读数轨道的数字是给某一个点写的，
      // 眼睛却要在二十几个点里找哪一个是它，这是读数层最费劲的地方。
      for (const p of points) {
        if (p.x > cutX + 0.5) continue;
        const isActivePoint = p.x === indexToX(activeIndex.value);
        ctx.globalAlpha = activeIndex.value >= 0 && !isActivePoint ? 0.32 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, MARKER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  });

  // 准星：画在所有系列之后（它属于当前选中点，是这一次的焦点），
  // 但用低透明度，视觉上退到数据后面。
  if (activeIndex.value >= 0 && activeIndex.value < len) {
    const primary = props.series[0];
    const value = primary?.data?.[activeIndex.value];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const color = primary?.color || PALETTE[0];
      const x = Math.round(indexToX(activeIndex.value)) + 0.5;
      const y = Math.round(valueToY(value)) + 0.5;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();

      // 横向参考线：把选中的值对回 Y 轴。
      // 没有它，选中点的高度没有参照物 —— 竖线只说「什么时候」，
      // 横线才说「多少」。
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(g.left, y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();

      // 选中的点：底下圈白底把点从线上「拔」出来，上面点本色。
      // 没有底下那圈，准星交点上的点和线上其它点分不出主次。
      ctx.beginPath();
      ctx.arc(indexToX(activeIndex.value), valueToY(value), 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(indexToX(activeIndex.value), valueToY(value), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

/**
 * 拿节点的重试节奏（毫秒）。
 *
 * 为什么必须重试：同一页挂了多个图时，节点进入合成的时间会飘，
 * 第一次查不到就放弃的话，那张图会一直空白，且没有任何报错可查 ——
 * 只有切数据（触发重新挂载）才恢复。同一页三个图时这不是偶发，是常态。
 */
const INIT_RETRY_DELAYS = [0, 60, 120, 200, 300, 400, 600] as const;

/** 同时只允许一次初始化在飞，避免重试和数据变化叠在一起重复建 ctx */
let initializing = false;
let initialized = false;
/** 已经排到第几次重试 */
let retryIndex = 0;
let retryTimer = 0;

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = 0;
  }
}

function scheduleRetry(): void {
  const delay = INIT_RETRY_DELAYS[retryIndex];
  if (delay === undefined) {
    // 重试用尽还是拿不到节点，画布会一直空白。留一条 warn，
    // 下次再遇到空图能直接分清是「节点没进 DOM」还是「绘制逻辑出错」。
    console.warn(`[LineChart] 画布节点获取失败（已重试 ${INIT_RETRY_DELAYS.length} 次）：未查到 canvas 节点`);
    return;
  }
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = 0;
    void initCanvas();
  }, delay);
}

/**
 * 查 canvas 节点，同时量出它相对视口的左边距。
 *
 * 回调参数交给上下文推断、再在内部收窄：官方 `fields` 的回调类型是 NodeInfo，
 * 而 node 在 NodeCallbackResult 里（官方标成 any），NodeInfo 本身在应用代码里
 * 也无法按名引用。写法与 TideChart.queryCanvas 保持一致。
 *
 * 量不到矩形（left 为 undefined）时按 0 处理：这时取值会整体偏右，
 * 但总比拿 NaN 去算索引、把选中态彻底弄丢要好。
 */
function queryCanvas(): Promise<{ node: CanvasNode2D | null; left: number }> {
  return new Promise((resolve) => {
    createSelectorQuery(instance)
      .select(`#${canvasId}`)
      .fields({ node: true, rect: true }, (res) => {
        const item = Array.isArray(res) ? res[0] : res;
        const node = (item as { node?: unknown } | undefined)?.node;
        const left = (item as { left?: unknown } | undefined)?.left;
        resolve({
          node: typeof node === 'object' && node !== null ? (node as CanvasNode2D) : null,
          left: typeof left === 'number' && Number.isFinite(left) ? left : 0,
        });
      })
      .exec();
  });
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

async function initCanvas() {
  if (initializing || initialized) return;
  initializing = true;

  try {
    await nextTick();

    // 两块画布一起查。任一没查到都重试 —— 少一层的话静态层是空的，
    // 整张图会缺网格和刻度，而这种半残状态比全空白更难看出原因。
    const [{ node: canvas, left }, base] = await Promise.all([queryCanvas(), queryBaseCanvas()]);
    if (!canvas || !base) {
      scheduleRetry();
      return;
    }
    canvasLeft = left;

    const dpr = windowMetrics().pixelRatio;
    const width = cssWidthPx.value;
    const height = cssHeightPx.value;

    // 位图尺寸按 dpr 放大、CSS 尺寸不变，否则高分屏发虚。
    // 位图尺寸取整：小屏换算下来可能是小数，按整数给绘制无差。
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

    // 静态层先画：动态层每帧只清空自己，网格和刻度得先在下面等着。
    // 顺序不能反 —— 左边距要靠静态层的 ctx 实测刻度标签宽度，算不出来就没有几何。
    computeGeom();
    drawBase();

    if (props.animate) {
      play();
    } else {
      progress = 1;
      draw();
    }
  } finally {
    initializing = false;
  }
}

function cancelFrame() {
  if (canvasNode && rafId) {
    canvasNode.cancelAnimationFrame(rafId);
  }
  rafId = 0;
}

/**
 * 入场动画：逐帧推进 progress，让折线"画"出来。
 *
 * mp-weixin 逻辑层没有全局 requestAnimationFrame（那是浏览器 API，连 window 都没有），
 * 取帧走 canvas 节点自带的方法（基础库 2.7.0+），帧率跟随系统刷新、页面隐藏自动暂停。
 * 取消必须用同一个节点：节点的 requestId 交给别处的 cancelAnimationFrame 会静默失效，
 * 不报错、循环也停不下来，页面反复进出就一直漏帧。
 */
function play() {
  // watch 可能早于 SelectorQuery 回调触发，那时节点还没拿到，等 initCanvas 里再放
  if (!canvasNode) return;
  const node = canvasNode;
  cancelFrame();
  const duration = props.duration;
  const start = Date.now();
  progress = 0;
  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / duration);
    // easeOutCubic，末尾减速，比线性自然
    progress = 1 - Math.pow(1 - t, 3);
    draw();
    if (t < 1) {
      rafId = node.requestAnimationFrame(tick);
    } else {
      // t=1 时 progress 已经是 1，这一帧画完循环自然结束
      rafId = 0;
    }
  };
  rafId = node.requestAnimationFrame(tick);
}

onMounted(() => {
  // 尺寸在 setup 里就算好了，这里只管把节点拿到手
  void initCanvas();
});

// 数据变化时重播动画（除非显式关掉动画，那就直接画最终态）
// 纵轴上下界也要 watch：数据没变、只是把基线挪了（比如切了指标换量纲）时同样要重画
watch(
  () => [props.categories, props.series, props.min, props.max, props.labelStep, props.labelIndices, props.yTicks],
  () => {
    // 换数据后旧的选中点不再有意义，留着会显示另一组数据里的下标
    activeIndex.value = -1;
    // 轴范围、刻度都跟着数据变了：静态层得重画，
    // 否则刻度上还挂着上一组数据的数字。
    computeGeom();
    drawBase();
    if (props.animate) {
      play();
    } else {
      progress = 1;
      draw();
    }
  },
  { deep: true },
);

onBeforeUnmount(() => {
  cancelFrame();
  // 重试定时器也得停：节点已经没了，再重试只会白白查一个不存在的节点
  clearRetryTimer();
});

/**
 * 触摸换算。
 *
 * clientX 是**视口**坐标，plotLeft / plotWidth 是**画布**坐标，
 * 两者之间隔着画布自己的左边距 canvasLeft —— 不减它，整条曲线偏右一个画布宽。
 *
 * 选中后必须重绘：准星和选中点都画在 canvas 上，而 draw() 之前只在挂载和
 * 数据变化时跑，光改 activeIndex 的话轨道上的数字会变、图上却毫无反应。
 */
function pick(clientX: number) {
  const len = props.categories.length;
  if (!len || plotWidth <= 0) return;
  const gap = len > 1 ? plotWidth / (len - 1) : plotWidth;
  const x = clientX - canvasLeft - plotLeft;
  const rel = len > 1 ? x / gap : 0;
  const i = Math.round(rel);
  if (i < 0 || i >= len) {
    if (activeIndex.value !== -1) {
      activeIndex.value = -1;
      draw();
    }
    return;
  }
  if (i === activeIndex.value) return;
  activeIndex.value = i;
  draw();
}

function onTouchStart(e: any) {
  pick(e.touches[0].clientX);
}
function onTouchMove(e: any) {
  pick(e.touches[0].clientX);
}
function onTouchEnd() {
  // 保留选中态，方便用户看清数值。
  // 抬手就收是错的：抬手正是要读数的时刻，一抬手数字没了，
  // 等于逼用户用一根手指同时看和记。iOS 的 Health / Stocks 也是留着的。
  // 回到常态只需要切指标或重新挂载。
}
</script>

<style lang="scss" scoped>
.line-chart {
  position: relative;
}

/*
 * 绘图区。给一块确定尺寸的盒子，两层画布绝对定位叠在里面。
 *
 * 盒子自己有高度，下面的读数轨道才会被顶到正确的位置；
 * 两层画布不占流，只画在这同一块盒子里。
 */
.line-chart__plot {
  position: relative;
}

.line-chart__canvas {
  position: absolute;
  top: 0;
  left: 0;
  display: block; // 微信端必须是 block，否则 canvas 是 inline 元素，尺寸计算会偏
}

/*
 * 读数轨道。
 *
 * 用 $fish-fill 而不是卡片白底：这一节本身就直接坐在页面灰底上，
 * 给它一块白底会凭空多出一层「卡片里还有一块卡片」的套嵌感。
 * 轨道是 secondarySystemFill 这一档 —— 浅、有边界、不抢戏。
 */
.line-chart__rail {
  position: relative;
  overflow: hidden; // 切槽位时不至于溢到圆角外面
  height: 88rpx;
  margin-top: 12rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

/*
 * 两个状态叠在同一个格子里交叉淡入。
 *
 * 基态是「藏起来并下移 4rpx」，两个修饰类都是「显出来」。
 * 写成这样而不是给两个状态各写一套显隐，是因为两边的可见态完全相同 ——
 * 差异只在从哪个方向进来，由基态的位移天然承担。
 *
 * 位移只有 4rpx。再大就从「换了一组值」读作「飞进来了」，
 * 而且拖动的时候一直有东西在动，反而看不清当前读数。
 */
.line-chart__slot {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24rpx;
  opacity: 0;
  transform: translateY(4rpx);

  @if $fish-motion {
    transition:
      opacity $fish-dur-cross $fish-ease-out,
      transform $fish-dur-cross $fish-ease-out;
  }
}

.line-chart__slot--idle,
.line-chart__slot--active {
  opacity: 1;
  transform: translateY(0);
}

.line-chart__rail-label {
  color: $fish-muted;
  @include fish-type(caption);
}

/*
 * 常态读数的两个极值。
 *
 * 「最高 / 最低」和单位退到次级，数字用墨色 —— 同一行里哪部分是读数、
 * 哪部分是限定词，版式自己说话，不必再加一句说明。
 */
.line-chart__stats {
  display: flex;
  align-items: baseline;
}

.line-chart__stat + .line-chart__stat {
  margin-left: 24rpx;
}

.line-chart__stat-qualifier {
  margin-right: 8rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

.line-chart__stat-value {
  color: $fish-ink;
  @include fish-type(subhead);
  font-weight: 600;
}

.line-chart__stat-unit {
  margin-left: 2rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}

/* 分档名（小雨 / 中雨 / 大雨）。它跟在单位后面，是读数的定性说明 */
.line-chart__stat-band {
  margin-left: 8rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}

/* 不用 flex 的 gap：小程序的 flex gap 在低版本基础库上不生效，
   这里跟着全项目的做法走 margin */
.line-chart__rows {
  display: flex;
  align-items: baseline;
}

.line-chart__row {
  display: flex;
  align-items: baseline;
}

.line-chart__row + .line-chart__row {
  margin-left: 24rpx;
}

.line-chart__dot {
  align-self: center;
  width: 12rpx;
  height: 12rpx;
  margin-right: 10rpx;
  border-radius: 50%;
}

.line-chart__name {
  margin-right: 20rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

.line-chart__number {
  color: $fish-ink;
  @include fish-type(title3);
}

.line-chart__unit {
  margin-left: 6rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}

/* 分档名（小雨 / 中雨 / 大雨）。它跟在单位后面，是读数的定性说明 */
.line-chart__band {
  margin-left: 8rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}
</style>
