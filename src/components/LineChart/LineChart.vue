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
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { buildCurve, buildPolyline, clipCurve, type CurvePoint, type CurveSegment } from '@/utils/curve';
import { CANVAS_FONT_STACK, withAlpha } from '@/utils/canvas';
import { chartPalette } from '@/utils/chartPalette';
import { themeMode } from '@/utils/theme';
import {
  GUTTER_GAP,
  computeLineGeom,
  finiteValues,
  formatValue,
  measureText,
  splitRuns,
  type PlotGeom,
} from '@/utils/lineChart';
import {
  CHART_LINE_WIDTH,
  createCanvasLayer,
  createEntryAnimator,
  useCanvasPageShow,
  type CanvasMetrics,
  type EntryAnimator,
} from '@/utils/chartCanvas';
import { windowMetrics } from '@/composables/windowMetrics';

interface Series {
  name: string;
  data: number[];
  color?: string;
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
/**
 * 系列色。深浅两套由 utils/chartPalette 给 —— canvas 不解析 var()。
 *
 * 按序号取，序号越界就绕回去。
 */
function seriesColor(index: number): string {
  const series = chartPalette().series;
  return series[index % series.length];
}

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
/**
 * 色板。深浅两套由 utils/chartPalette 给 —— canvas 不解析 var()，
 * 只能手写两份（见 utils/canvas.ts 的说明）。
 */
const tone = () => chartPalette();

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
const dprRef = ref(1);

/**
 * 两层画布。
 *
 * 静态层画网格与刻度，动态层画面积、曲线、数据点、准星。
 * 取节点、判空、重试都在 utils/chartCanvas 里，这里只管画什么。
 */
const baseLayer = createCanvasLayer({
  instance,
  id: baseCanvasId,
  metrics: layerMetrics,
  label: 'LineChart 静态层',
});
const topLayer = createCanvasLayer({
  instance,
  id: canvasId,
  metrics: layerMetrics,
  label: 'LineChart 动态层',
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
 * 常态数据点的数量上限。
 *
 * 超过这个数就不画常态点：24 个点挤在 315px 上，每个点直径 6px、
 * 间距 12px，画出来是一串虚线而不是数据。选中点照画。
 */
const MARKER_LIMIT = 12;
/**
 * 数据点半径。实心圆，和 iOS 图表一致。
 *
 * 比线宽的一半大一点：半径小于半条线宽的话，点就整个埋在线里，
 * 画出来只是一段粗线上的鼓包。
 */
const MARKER_RADIUS = 4;

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
    color: s.color || seriesColor(si),
    text: formatValue(s.data[i], props.precision),
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
  const values = finiteValues(props.series);
  if (!values.length) return { high: '—', low: '—', highBand: '', lowBand: '' };
  const high = Math.max(...values);
  const low = Math.min(...values);
  return {
    high: formatValue(high, props.precision),
    low: formatValue(low, props.precision),
    highBand: bandLabel(high),
    lowBand: bandLabel(low),
  };
});

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

  const ctx = baseLayer.ctx;
  const result = computeLineGeom(
    {
      series: props.series,
      len: props.categories.length,
      min: props.min,
      max: props.max,
      yTicks: props.yTicks,
      labelStep: props.labelStep,
      // 拿不到 ctx 时（画布还没初始化）量不到字，用 0 兜底 ——
      // 那时图还没画出来，几何只是先占个位，初始化时会重算。
      measure: (text) => (ctx ? measureText(ctx, text, 11) : 0),
    },
    size,
  );

  plotLeft = result.plotLeft;
  plotWidth = result.plotWidth;
  geom = result.geom;
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
  const ctx = baseLayer.ctx;
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
      ctx.strokeStyle = isBase ? tone().axis : tone().gridFaint;
      ctx.beginPath();
      ctx.moveTo(g.left, y);
      ctx.lineTo(g.right, y);
      ctx.stroke();
    }

    ctx.fillStyle = tone().yText;
    ctx.font = `11px ${CANVAS_FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(tick.label, g.left - GUTTER_GAP, y);
  });

  // X 轴标签。比 Y 轴淡一档：它是语境，读的时候顺带扫过
  ctx.fillStyle = tone().xText;
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
  ctx.fillStyle = tone().xText;
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
  const ctx = topLayer.ctx;
  const size = sizeRef.value;
  if (!ctx || !size) return;

  const g = geom ?? computeGeom();
  if (!g) return;

  // setTransform 是覆盖式，scale 是累乘式：动画每帧都调 scale，矩阵会叠成 dpr^n，
  // 第二帧起线条就飞出画布。每帧重置一次矩阵，绘制逻辑继续用 CSS 像素。
  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  if (!finiteValues(props.series).length) {
    drawEmptyHint(ctx, size.width, size.height);
    return;
  }
  if (!g.len) return;

  const { left, top, bottom, plotW, plotH, min, span, len, labelGap } = g;
  const indexToX = (i: number) => (len > 1 ? left + labelGap * i : left + plotW / 2);
  const valueToY = (v: number) => bottom - ((v - min) / span) * plotH;

  // 入场动画的头部位置：全局一个 x，各段按它一起截
  const cutX = indexToX(animator.progress * (len - 1));
  // 点多时不画常态数据点
  const showMarkers = len <= MARKER_LIMIT;
  // 多系列时面积压淡一档：几层半透明叠在一起会糊成一片
  const areaAlpha = props.series.length > 1 ? 0.15 : 0.3;

  props.series.forEach((s, si) => {
    const color = s.color || seriesColor(si);

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
      ctx.lineWidth = CHART_LINE_WIDTH;
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
      const color = primary?.color || seriesColor(0);
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
      ctx.fillStyle = tone().markerRing;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(indexToX(activeIndex.value), valueToY(value), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

/**
 * 初始化两块画布。
 *
 * 两块都要就绪才算数：少一层的话静态层是空的，整张图会缺网格和刻度，
 * 而这种半残状态比全空白更难看出原因。取节点的时机飘了也不要紧 ——
 * 取节点与重试由 utils/chartCanvas 管。
 */
async function initCanvases(): Promise<void> {
  const [baseOk, topOk] = await Promise.all([baseLayer.init(), topLayer.init()]);
  if (!baseOk || !topOk) return;

  // 静态层先画：动态层每帧只清空自己，网格和刻度得先在下面等着。
  // 顺序不能反 —— 左边距要靠静态层的 ctx 实测刻度标签宽度，算不出来就没有几何。
  computeGeom();
  drawBase();

  play();
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

/**
 * 页面回前台：画布节点可能已被回收，缓存的 ctx 作废。
 *
 * 不作废就拿旧 ctx 补画一帧 —— 那是画到一块死画布上，原生崩溃
 * （小程序闪退），不是 JS 异常，开发者工具里看不出来。
 *
 * 天气页是底栏的第一个 tab，切走就会命中：节点被回收，回来再画就是死画布。
 */
useCanvasPageShow([baseLayer, topLayer], () => {
  void initCanvases();
});

onMounted(() => {
  // 尺寸在 setup 里就算好了，这里只管把节点拿到手
  void initCanvases();
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
    play();
  },
  { deep: true },
);

/**
 * 主题变了要重画。
 *
 * canvas 上的颜色是烤进去的，不像 WXSS 那样跟着媒体查询自动翻。
 * 网格、刻度、曲线、准星都要重来一遍。
 *
 * 不重播入场动画：切主题不是用户要看动画的时刻，直接落到最终态。
 */
watch(themeMode, () => {
  if (!baseLayer.ready || !topLayer.ready) return;
  computeGeom();
  drawBase();
  animator.cancel();
  animator.progress = 1;
  draw();
});

onBeforeUnmount(() => {
  animator.cancel();
  // 重试定时器也得停：节点已经没了，再重试只会白白查一个不存在的节点
  baseLayer.reset();
  topLayer.reset();
});

/**
 * 触摸换算。
 *
 * clientX 是**视口**坐标，plotLeft / plotWidth 是**画布**坐标，
 * 两者之间隔着画布自己的左边距（topLayer.left）—— 不减它，整条曲线偏右一个画布宽。
 *
 * 选中后必须重绘：准星和选中点都画在 canvas 上，而 draw() 之前只在挂载和
 * 数据变化时跑，光改 activeIndex 的话轨道上的数字会变、图上却毫无反应。
 */
function pick(clientX: number) {
  const len = props.categories.length;
  if (!len || plotWidth <= 0) return;
  const gap = len > 1 ? plotWidth / (len - 1) : plotWidth;
  const x = clientX - topLayer.left - plotLeft;
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
  @include fish-type(body);
  font-weight: 500;
}

.line-chart__stat-unit {
  margin-left: 2rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

/* 分档名（小雨 / 中雨 / 大雨）。它跟在单位后面，是读数的定性说明 */
.line-chart__stat-band {
  margin-left: 8rpx;
  color: $fish-muted;
  @include fish-type(caption);
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
  @include fish-type(title);
}

.line-chart__unit {
  margin-left: 6rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

/* 分档名（小雨 / 中雨 / 大雨）。它跟在单位后面，是读数的定性说明 */
.line-chart__band {
  margin-left: 8rpx;
  color: $fish-muted;
  @include fish-type(caption);
}
</style>
