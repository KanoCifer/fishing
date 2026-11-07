/**
 * 折线图的绘图区几何与刻度计算。
 *
 * 与 utils/tideChart 是同一层次的东西：坐标怎么算是这里的事，
 * 画布上怎么描是组件的事。两张图的坐标系不同，所以各算各的；
 * 曲线算法是共用的，在 utils/curve。
 */

import { axisScale, formatTick, type AxisScale } from './chartAxis';
import { CANVAS_FONT_STACK } from './canvas';

/** 绘图区的内边距。右边留得多一点：最后一个 X 标签不要贴着边 */
export const PAD = { right: 12, top: 14, bottom: 6 };
/** X 轴标签区的高度 */
export const AXIS_H = 24;
/** Y 轴刻度与绘图区之间的间距 */
export const GUTTER_GAP = 10;

/**
 * 数值格式。跟 Y 轴刻度用同一套：四舍五入到 `precision` 位小数，再按整数输出。
 *
 * 小数位由调用方给（默认一位）。分钟级降水要两位 ——
 * 0.15 毫米和 0.04 毫米在一位数下都会变成「0」或「0.2」，
 * 那正是这张图要说清楚的差别。
 */
export function formatValue(value: unknown, precision: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const factor = 10 ** precision;
  return String(Math.round(value * factor) / factor);
}

/**
 * 把一条系列拆成若干「连续有值的段」。
 *
 * 脏值（null / NaN）不能当 0 画 —— 那会在图上凭空长出一段落到零点的曲线，
 * 而图不会说谎，看的人只能信。断开的段各自成线，中间留白。
 */
export function splitRuns(data: ReadonlyArray<number | null>): { index: number; value: number }[][] {
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
export function finiteValues(series: ReadonlyArray<{ data: ReadonlyArray<number | null> }>): number[] {
  const values: number[] = [];
  for (const s of series) {
    for (const v of s.data) {
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
  }
  return values;
}

/**
 * 请求的取值域（**未**对齐到网格）。
 *
 * 对齐交给 axisScale：网格与边界必须一起定，只定其一就会出现半个格。
 *
 * 只给下界时，上界跟着数据走。原先这里用 niceMax 把最大值向上取整，
 * 22~31℃ 的气温曲线会被顶到 0~50 轴的最上面两成 —— 七天的起伏看着像一条直线。
 */
function axisRequest(
  series: ReadonlyArray<{ data: ReadonlyArray<number | null> }>,
  min?: number,
  max?: number,
): { min: number; max: number } {
  const values = finiteValues(series);
  if (!values.length) return { min: 0, max: 1 };
  const dataMax = Math.max(...values);

  if (min !== undefined && max !== undefined) {
    return { min, max: Math.max(max, min + 1) };
  }
  if (min !== undefined) {
    return { min, max: Math.max(dataMax, min + 1) };
  }
  return { min: 0, max: Math.max(dataMax, 1) };
}

/** 量一段文字的宽度（px）。用来把标签摆在该摆的位置上 */
export function measureText(ctx: CanvasRenderingContext2D, text: string, size: number): number {
  ctx.save();
  ctx.font = `${size}px ${CANVAS_FONT_STACK}`;
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

/**
 * 传了 yTicks 就用它：等级线的位置本来就不等距，而且轴上不该出现具体数字。
 * 落在取值域外的刻度不画 —— 画出去就成了轴外的一条线。
 *
 * 不传就按 axisScale 的等距刻度来，标签是格式化后的数字。
 */
function buildTicks(
  scale: AxisScale,
  yTicks?: ReadonlyArray<{ value: number; label: string }>,
): { value: number; label: string }[] {
  if (yTicks?.length) {
    return yTicks
      .filter((tick) => tick.value >= scale.min - 1e-9 && tick.value <= scale.max + 1e-9)
      .map((tick) => ({ value: tick.value, label: tick.label }));
  }
  return scale.ticks.map((value) => ({ value, label: formatTick(value) }));
}

/**
 * 绘图区几何。两层画布共用同一份 —— 静态层画网格、动态层画曲线，
 * 两者必须落在同一套坐标上，否则刻度和曲线会错开。
 */
export interface PlotGeom {
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

/** 算几何所需的输入 */
export interface LineGeomInput {
  /** 各系列的原始数值 */
  series: ReadonlyArray<{ data: ReadonlyArray<number | null> }>;
  /** 采样点数量 */
  len: number;
  /** 纵轴下界 */
  min?: number;
  /** 纵轴上界 */
  max?: number;
  /** 自定义纵轴刻度 */
  yTicks?: ReadonlyArray<{ value: number; label: string }>;
  /** X 轴每隔几个点画一个标签 */
  labelStep?: number;
  /** 量一段文字的宽度。用来定左边距 */
  measure(text: string): number;
}

/**
 * 算几何，顺手把触摸换算要的两个值一起给出。
 *
 * plotLeft / plotWidth 是从这份几何里取的，所以每次几何变了
 * （换数据、改纵轴上下界）都要跟着更新，否则选点会按旧的间距算。
 */
export function computeLineGeom(
  input: LineGeomInput,
  size: { width: number; height: number },
): { geom: PlotGeom; plotLeft: number; plotWidth: number } {
  const request = axisRequest(input.series, input.min, input.max);
  const scale = axisScale(request.min, request.max, 4);

  /**
   * 左边距由**实测的最宽刻度标签**决定，不写死。
   *
   * 写死的那一版在标签变宽时会把刻度文字顶出画布。
   * 量不到文字（画布还没初始化）时用一档经验值兜底 ——
   * 那时图还没画出来，几何只是先占个位，初始化时会重算。
   */
  const ticks = buildTicks(scale, input.yTicks);
  let gutter = 0;
  for (const tick of ticks) {
    const width = input.measure(tick.label);
    if (width > gutter) gutter = width;
  }
  const left = (gutter || 24) + GUTTER_GAP;

  const { width, height } = size;
  const top = PAD.top;
  const right = width - PAD.right;
  const bottom = height - AXIS_H - PAD.bottom;
  const plotW = Math.max(1, right - left);
  const plotH = Math.max(1, bottom - top);

  const len = input.len;

  return {
    plotLeft: left,
    plotWidth: plotW,
    geom: {
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
      stride: Math.max(1, input.labelStep ?? (len > 8 ? 2 : 1)),
    },
  };
}
