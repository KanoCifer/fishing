/**
 * 温度色阶 —— 一条横条上「冷 → 热」的颜色映射。
 *
 * 色阶与 SCSS 里的令牌是同一件事的两处落点：这里给的是**逐段的锚点**
 * （canvas / 渐变串要按温度插值，SCSS 变量给不了连续值），
 * 与 canvas 那一侧取色（utils/chartPalette.ts）同一套路。
 *
 * 色相跨蓝 → 青 → 黄 → 橙 → 红，**跳过绿色**：这套设计里绿色是
 * 「好」的意思（钓鱼等级、降水分档），拿它当温度中段会跟语义撞车。
 */
export interface TempStop {
  /** 温度（°C） */
  t: number;
  /** 十六进制色 */
  c: string;
}

/** 色阶锚点。由冷到热 */
export const TEMP_SCALE_STOPS: readonly TempStop[] = [
  { t: -20, c: '#3f7ae0' },
  { t: 4, c: '#58a6f0' },
  { t: 12, c: '#a8d8f0' },
  { t: 16, c: '#ffe6a0' },
  { t: 22, c: '#ffc65c' },
  { t: 28, c: '#ff9f43' },
  { t: 34, c: '#ff4d3d' },
  { t: 40, c: '#e0342a' },
];

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** 两个十六进制色之间线性插值 */
function mix(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const channel = (i: number): string =>
    Math.round(a[i] + (b[i] - a[i]) * ratio)
      .toString(16)
      .padStart(2, '0');

  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * 温度 → 颜色。
 *
 * 落在锚点之间就插值，落在两端之外就取端点色。
 */
export function tempColor(temp: number): string {
  const stops = TEMP_SCALE_STOPS;

  if (temp <= stops[0].t) return stops[0].c;
  if (temp >= stops[stops.length - 1].t) return stops[stops.length - 1].c;

  for (let i = 0; i < stops.length - 1; i += 1) {
    const lo = stops[i];
    const hi = stops[i + 1];

    if (temp >= lo.t && temp <= hi.t) {
      return mix(lo.c, hi.c, (temp - lo.t) / (hi.t - lo.t));
    }
  }

  return stops[0].c;
}

/**
 * 一段温度区间 → CSS 渐变串。
 *
 * 渐变按**绝对温度**摆色标，不是按区间内的相对位置摆：
 * 一条 24°–28° 的暖色段跟一条 4°–8° 的冷色段，画出来就该一眼分得出冷暖。
 * 所以色标位置是锚点温度在 [lo, hi] 里的相对位置。
 *
 * `offset` 是「可见窗口左边那一截被移走了多少」：
 * 用在温度条上时，渐变层的宽度是整条轨道、却被左移了一段，
 * 于是它露出来的那一段正好是全局渐变里对应当天温度区间的那一段。
 * 不给这个偏移，露出来的颜色就会比真实温度偏冷一档。
 *
 * 两端补上窗口边界处的实际颜色：色阶的锚点未必落在区间内，
 * 不补的话整条渐变会从第一个锚点色开始，区间本身那部分颜色就丢了。
 */
export function tempGradient(lo: number, hi: number, offset = 0): string {
  const span = Math.max(hi - lo, 1);
  const parts: string[] = [`${tempColor(lo - offset * span)} 0%`];

  for (const stop of TEMP_SCALE_STOPS) {
    const pos = (stop.t - lo) / span + offset;
    if (pos <= 0 || pos >= 1) continue;
    parts.push(`${stop.c} ${(pos * 100).toFixed(2)}%`);
  }

  parts.push(`${tempColor(lo + (1 - offset) * span)} 100%`);

  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
