/**
 * 潮汐图的绘图区几何与标注计算。
 *
 * 这里全是纯计算：输入数据与画布尺寸，输出「画什么、画在哪」。
 * 画布上怎么描是组件的事，坐标怎么算是这里的事 —— 两边分开，
 * 换画法不必重算坐标，重算坐标也不必碰画布。
 *
 * 与 LineChart 的对应部分（src/utils/lineChart.ts）是同一个层次的东西，
 * 两张图的坐标系不同，所以各算各的；曲线算法是共用的，在 utils/curve。
 */

import { axisScale } from './chartAxis';
import { setCanvasFont } from './canvas';

/**
 * 绘图区四周的留白（px）。
 *
 * 左右几乎贴边：曲线是这张图的主角，两边各留一截就把它挤窄了。
 * 上面留的那一截不是留白，是**给曲线上的数值标注用的**——
 * 标注画在极值点上方，没有这截就会顶出画布被切掉。
 */
export const PAD = { left: 2, right: 2, top: 22, bottom: 4 };

/** X 轴标签区的高度 */
export const AXIS_H = 26;

/** 时间刻度的字号（px）。测量与绘制要用同一个值 */
export const X_LABEL_SIZE = 11;

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
export function formatHeight(value: number | string | null | undefined): string {
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
export function parseHeight(value: number | string | null | undefined): number | null {
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
function cleanPoints(points: ReadonlyArray<{ height: number | string }>): { values: number[]; sourceIndex: number[] } {
  const values: number[] = [];
  const sourceIndex: number[] = [];
  points.forEach((point, index) => {
    const value = parseHeight(point.height);
    if (value === null) return;
    values.push(value);
    sourceIndex.push(index);
  });
  return { values, sourceIndex };
}

/**
 * 算几何，顺手把触摸换算要的两个值一起给出。
 *
 * 数据全脏时返回 null：那时没有可画的东西，几何也就没有意义。
 */
export function computeTideGeom(
  points: ReadonlyArray<{ height: number | string }>,
  size: { width: number; height: number },
): { geom: PlotGeom; plotLeft: number; pointGap: number } | null {
  const { values, sourceIndex } = cleanPoints(points);
  // 只有全是脏值才没得画；零星脏值上面已经滤掉了
  if (!values.length) return null;

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

  return {
    plotLeft: left,
    pointGap: gap,
    geom: { left, right, top, bottom, plotW, plotH, min, max, ticks: scale.ticks, len, gap, values, sourceIndex },
  };
}

/** 原始下标 → 清洗后序列里的位置。找不到返回 -1 */
export function positionOf(geom: PlotGeom | null, originalIndex: number): number {
  if (!geom || originalIndex < 0) return -1;
  return geom.sourceIndex.indexOf(originalIndex);
}

/** 位置 → 画布 x 坐标 */
export function indexToX(pos: number, g: PlotGeom): number {
  return g.len > 1 ? g.left + g.gap * pos : g.left + g.plotW / 2;
}

/** 潮高 → 画布 y 坐标 */
export function valueToY(value: number, g: PlotGeom): number {
  return g.bottom - ((value - g.min) / (g.max - g.min)) * g.plotH;
}

/**
 * 画在 X 轴上的时间标签。
 *
 * 位置是**清洗后序列**里的位置 —— 与曲线上的点一一对应，
 * 竖向网格线就画在这些标签的正上方。
 */
export interface AxisLabel {
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
function pickLabelPositions(g: PlotGeom, labels: readonly string[]): number[] {
  const positions: number[] = [];
  g.sourceIndex.forEach((original, pos) => {
    const label = labels[original] ?? '';
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
export function layoutAxisLabels(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  g: PlotGeom,
  labels: readonly string[],
): AxisLabel[] {
  const items: AxisLabel[] = [];
  for (const pos of pickLabelPositions(g, labels)) {
    const text = labels[g.sourceIndex[pos]] ?? '';
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
export interface ExtremumLabel {
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
export function layoutExtremumLabels(g: PlotGeom, nowIndex: number): ExtremumLabel[] {
  const out: ExtremumLabel[] = [];
  const now = positionOf(g, nowIndex);
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
