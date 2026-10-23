/**
 * 图表的取值域与刻度。
 *
 * 为什么单独抽出来：LineChart 与 TideChart 要画在同一套网格上，
 * 刻度算法只能有一份 —— 两处各写一遍，迟早一个用整数一个用半档，
 * 同一个应用里的两张图对不上。
 *
 * 核心的一条规矩：**轴上的刻度必须是整数（或十进制的整齐数）**。
 * 取值域 20~35 均分成四份是 31.25 / 27.5 / 23.75 ——
 * 这种标签在图上非常刺眼，而且用户没法把 23.75 和「五度一档」对上。
 */

/** 一套刻度方案 */
export interface AxisScale {
  /** 实际使用的下界 */
  min: number;
  /** 实际使用的上界 */
  max: number;
  /** 刻度间隔 */
  step: number;
  /** 刻度值（升序） */
  ticks: number[];
}

/**
 * 候选步长：1 / 2 / 5 × 10^k，覆盖跨度附近的几档。
 *
 * 只认这三档尾数：0.1 / 0.2 / 0.5 / 1 / 2 / 5 / 10 …
 * 别的（3 / 4 / 7）虽然也算整数，但凑不出「一档 5 度」这种用户心里有的数。
 */
function niceSteps(span: number): number[] {
  const steps: number[] = [];
  const from = Math.floor(Math.log10(Math.max(span, 1e-6) / 8));
  const to = Math.ceil(Math.log10(Math.max(span, 1e-6) * 2));
  for (let exp = from; exp <= to; exp++) {
    for (const mantissa of [1, 2, 5]) {
      const step = mantissa * Math.pow(10, exp);
      if (step > 0) steps.push(step);
    }
  }
  return steps.sort((a, b) => a - b);
}

/** 整除不到时的经典取整：把跨度切成 target 份，每份再取整到好看的档 */
function classicStep(span: number, target: number): number {
  const raw = span / target;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const f = raw / base;
  const m = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return m * base;
}

function gridTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

/**
 * 算一套刻度。
 *
 * 网格怎么定的：
 *   1. 候选步长取 1 / 2 / 5 × 10^k
 *   2. 每个候选都把上下界**向外**对齐到该步长的整数倍，
 *      刻度落在 0 / 5 / 10 / 15 这类绝对整数上
 *   3. 在候选里挑「格数接近目标、且对上下界改动最小」的那一个
 *
 * 为什么是向外对齐而不是往里收：往里收会把数据挤到画布边缘；
 * 向外对齐之后 20~35 仍是 20~35 —— 好看又不失真。
 *
 * @param target 期望的刻度格数。默认四格是图表里最常见的密度
 */
export function axisScale(lo: number, hi: number, target = 4): AxisScale {
  const span = hi - lo;
  if (!(span > 0)) return { min: lo, max: hi + 1, step: 1, ticks: [lo, hi + 1] };

  const candidates: (AxisScale & { count: number; expansion: number })[] = [];
  for (const step of niceSteps(span)) {
    const min = Math.floor(lo / step + 1e-9) * step;
    const max = Math.ceil(hi / step - 1e-9) * step;
    const count = Math.round((max - min) / step);
    // 网格线最多五条：再密图就成了格纸
    if (count < 1 || count > 5) continue;
    candidates.push({
      min,
      max,
      step,
      count,
      expansion: max - min - span,
      ticks: gridTicks(min, max, step),
    });
  }

  if (candidates.length) {
    candidates.sort((a, b) => Math.abs(a.count - target) - Math.abs(b.count - target) || a.expansion - b.expansion);
    const best = candidates[0];
    return { min: best.min, max: best.max, step: best.step, ticks: best.ticks };
  }

  // 没有能整除的步长：退回经典取整，上下界各推开不到一步
  const step = classicStep(span, target);
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  return { min, max, step, ticks: gridTicks(min, max, step) };
}

/**
 * 刻度标签的格式：一位小数，整数不带小数点。
 *
 * 为什么整数不带小数点：「35」比「35.0」干净，而 °C / mm / km/h 这些量纲
 * 的读数本来就不需要一位小数。
 */
export function formatTick(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return String(Math.round(value * 10) / 10);
}
