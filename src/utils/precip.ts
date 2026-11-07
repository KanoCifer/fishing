/**
 * 分钟级降水的展示换算。
 *
 * 上游给的是「每 5 分钟一格的累计降水量」序列，卡片要画的是一根根柱子：
 * 每格多高、属于哪一档雨强、这一格有没有数据。这些都是展示层的决定，
 * 放在这里而不是组件里 —— 组件只管把算好的形状画出来。
 *
 * 有一件事这里不做：**平滑**。上游给的是离散格，曲线等于替这串数据
 * 编了一段并不存在的连续性（雨是断续的）。所以换算只出柱高，不出控制点。
 */

import { WEATHER_ICONS, type WeatherIconSlug } from '@/constants/weatherIcons';
import type { MinutelyBucket, MinutelyCurtain, MinutelyPoint, MinutelyTick, PrecipLevel } from '@/types/fishing';
import type { Tone } from '@/types/view';

import { toFiniteNumber } from './number';

/**
 * 雨强分档 —— 1 小时雨强（mm/h）的唯一一份阈值表。
 *
 * 口径是**1 小时雨强**的通用分档：≤2.5 小雨 / 2.5~8 中雨 / 8~16 大雨 /
 * ≥16 暴雨（毫米/小时）。
 *
 * `from` 是该档的下限（含）。小雨从 0 起，但 0 本身不是雨 ——
 * 「这一格测到 0」单独归 none（见 precipLevelOf）。
 *
 * 这张表是雨强口径的唯一真源：实况卡（utils/weather 的 precipLevel）
 * 与分钟降水图说的是同一件事，两处各写一遍阈值迟早对不上。
 */
const RAIN_LEVELS: ReadonlyArray<{
  key: Exclude<PrecipLevel, 'none'>;
  label: string;
  /** 1 小时雨强（mm/h）的下限，含 */
  from: number;
  tone: Tone;
}> = [
  { key: 'light', label: '小雨', from: 0, tone: 'muted' },
  { key: 'medium', label: '中雨', from: 2.5, tone: 'warning' },
  { key: 'heavy', label: '大雨', from: 8, tone: 'warning' },
  { key: 'storm', label: '暴雨', from: 16, tone: 'destructive' },
];

/**
 * 1 小时雨强（mm/h）落在哪一档。
 *
 * 0 与负数不算雨，给 null —— 调用方自己决定「无降水」怎么写。
 */
export function rainLevelOf(intensity: number): { label: string; tone: Tone } | null {
  if (!Number.isFinite(intensity) || intensity <= 0) return null;

  let hit: (typeof RAIN_LEVELS)[number] | undefined;
  for (const level of RAIN_LEVELS) {
    if (intensity >= level.from) hit = level;
  }
  if (!hit) return null;

  return { label: hit.label, tone: hit.tone };
}

/**
 * 每格覆盖的分钟数。
 *
 * 上游的分钟降水就是 5 分钟一格，窗口跨度按这个算，
 * 免得格数与跨度各写一个 5。
 */
const BUCKET_MINUTES = 5;

/**
 * 折算成 1 小时雨强要乘的倍数。
 *
 * 上游量的是 5 分钟累计量，乘 12 才是等效的一小时雨强。
 * 表里的 from 因此是 0.21 / 0.67 / 1.33 这样的数，不是 2.5 / 8 / 16。
 */
const HOUR_SCALE = 60 / BUCKET_MINUTES;

/**
 * 5 分钟量纲下的档位线。阈值由上面那张表折算而来，不另写一份数。
 */
const LEVELS: ReadonlyArray<{ key: PrecipLevel; label: string; from: number }> = RAIN_LEVELS.map((level) => ({
  key: level.key,
  label: level.label,
  from: level.from / HOUR_SCALE,
}));

/** 大雨的下限（毫米/5 分钟）。图上 50% 那条档位线就是它 */
const heavyFrom = LEVELS.find((level) => level.key === 'heavy')?.from ?? 0;

/** 'none'（无降水）单独处理：它不是一个阈值，是「这一格测到 0」 */
const NONE_LABEL = '无降水';

/**
 * 柱高量程的上沿：暴雨的下限（1 小时 16 毫米 → 5 分钟 1.333 毫米）。
 *
 * 为什么是**绝对**量程，不能按窗口峰值归一：按峰值归一时，
 * 一整段小雨的窗口里最强的那一格也顶到 100% —— 柱子高度就不再说「雨有多大」，
 * 只说「这一格是这段里最强的」。小雨铺满整张图，看着像大雨。
 *
 * 上沿取暴雨下限而不是大雨下限：这样每一档雨强在图上占一段互不重叠的高度区间
 * （小雨 ≤16%、中雨 ≤50%、大雨 ≤100%），高度和颜色说的是同一件事，
 * 不会出现一根中雨柱顶到顶。
 */
const SCALE_MAX_5MIN = (RAIN_LEVELS.find((level) => level.key === 'storm')?.from ?? 16) / HOUR_SCALE;

/**
 * 图上那两条横向参考线（占绘图区高度的百分比）。
 *
 * 图上不标毫米数 —— 柱子本身已经说清雨有多大，左边再挂一列数字
 * 就是把同一件事说两遍。但线得留着：它是**相对**参照，
 * 读者一眼能看出「这根柱到顶了」「才到一半」。
 *
 * 为什么是这两条：50% 是中雨的上限（再高就是大雨），100% 是大雨的上限
 * （再高就是暴雨），与柱子用的是同一把绝对量程（见 SCALE_MAX_5MIN）。
 * 阈值改了这里跟着改 —— 参考线和色卡必须说同一件事。
 *
 * 这两条不是网格：网格是背景（$fish-grid 那一档），参考线是读者要拿来
 * 比柱高的东西，淡到看不见就等于没画。所以组件里按参考线的重量画。
 */
export const PRECIP_REF_PCTS: ReadonlyArray<number> = [100, (heavyFrom / SCALE_MAX_5MIN) * 100];

/**
 * 雨强档 → 图标数据 URI。
 *
 * 用 Meteocons 的彩色图标（见 @/constants/weatherIcons）：这一族图形本来就是
 * 「雨有多强」的语义，描边图标画不出档位之间的差别。
 */
const LEVEL_ICONS: Record<PrecipLevel, WeatherIconSlug> = {
  none: 'clear-day',
  light: 'drizzle',
  medium: 'rain',
  heavy: 'rain',
  storm: 'thunderstorms',
};

/** 雨强档 → 图标，给 `<image>` 的 src 用 */
export function precipLevelIcon(level: PrecipLevel): string {
  return WEATHER_ICONS[LEVEL_ICONS[level]];
}

/**
 * 有雨时的最低柱高（占绘图区的百分比）。
 *
 * 绝对量程下很小的一格降水算出来可能只有 1% —— 画出来是一根发丝，
 * 看不见就等于这一格没有数据。只要测到有雨，图上就得看得见它。
 *
 * 5% 在 224rpx 的绘图区里是 11rpx，够粗；也明显高于「测到 0」那根 6rpx 的短柱。
 *
 * 为什么不再高一点：下限是给「测到但很小」的雨兜底的，兜得太高，
 * 一整段小雨的窗口会被压成一行等高的短柱 —— 坡度没了，只剩一排一样的柱子。
 */
const MIN_HEIGHT_PCT = 5;

/**
 * 色卡上要列的档位。
 *
 * 不列「无降水」：没下雨的那一格画出来是一根极淡的短柱，
 * 与「无数据」的虚线空框长得不一样，读者不需要再给一根灰柱配一个图例。
 */
export const PRECIP_LEGEND_LEVELS: ReadonlyArray<{ key: PrecipLevel; label: string }> = LEVELS.map((level) => ({
  key: level.key,
  label: level.label,
}));

/** 一个数值落在哪一档。null（没有数据）不参与分档 */
function precipLevelOf(value: number | null): PrecipLevel | null {
  if (value === null) return null;
  if (value <= 0) return 'none';

  let hit: PrecipLevel = 'light';
  for (const level of LEVELS) {
    if (value >= level.from) hit = level.key;
  }
  return hit;
}

export function precipLevelLabel(level: PrecipLevel): string {
  if (level === 'none') return NONE_LABEL;
  return LEVELS.find((item) => item.key === level)?.label ?? '';
}

/**
 * 横轴刻度的步长（分钟）。
 *
 * 写「现在 / 30 分钟 / 60 分钟…」而不是钟点 —— 用户问的是
 * 「雨什么时候到」，不是「几点到」。
 *
 * 为什么是 30 而不是 20：刻度是标尺，标尺上的格子得放得下。
 * 「20分钟」这个标签在 caption 一档下宽约 90rpx，六七枚刻度就是 540~630rpx ——
 * 已经是卡片内容宽度，一枚压一枚。30 分钟一档只剩四枚，标签之间留得开。
 */
const TICK_STEP = 30;

/**
 * 把上游的点序列换算成「雨幕」这张图的窗口模型。
 *
 * 空串（没有数据）与 "0.00"（测到没下雨）在这里就分开了：
 * 前者 value 为 null、heightPct 为 null，不参与累计也不参与峰值 ——
 * 当成 0 会在图上长出一段并不存在的降水。
 */
export function buildMinutelyCurtain(points: MinutelyPoint[]): MinutelyCurtain {
  const buckets: MinutelyBucket[] = points.map((point, index) => {
    const value = toFiniteNumber(point.precip);
    return {
      index,
      offset: point.offset,
      value,
      level: precipLevelOf(value),
      heightPct: null,
    };
  });

  // 峰值只认有数的格子
  let peak: MinutelyBucket | null = null;
  for (const bucket of buckets) {
    if (bucket.value === null) continue;
    if (!peak || bucket.value > (peak.value ?? 0)) peak = bucket;
  }

  // 柱高按绝对量程算（见 SCALE_MAX_5MIN），不按窗口峰值归一
  for (const bucket of buckets) {
    if (bucket.value === null) {
      bucket.heightPct = null;
      continue;
    }

    if (bucket.value <= 0) {
      // 测到 0：不是雨。组件画一根极短的淡柱（0 高度与「没测到」必须长得不一样）
      bucket.heightPct = 0;
      continue;
    }

    const pct = (bucket.value / SCALE_MAX_5MIN) * 100;
    // 封顶在量程上沿，下限是「看得见」的那一档
    bucket.heightPct = Math.min(100, Math.max(MIN_HEIGHT_PCT, pct));
  }

  const total = buckets.reduce((sum, bucket) => sum + (bucket.value ?? 0), 0);

  //
  // 横轴刻度：每 30 分钟一枚（步长见 TICK_STEP）。
  //
  // 刻度落在它所指的**那一格的中心**，不是那一格的起点：格子的位置
  // 按下标等分，刻度不跟着等分，读者按刻度找那一格就会找偏。
  //
  // 为什么末尾不补一枚「120分钟」：窗口末尾这件事读数面上已经说了
  // （「未来2小时预计降水量」），这里再说一遍就是同一句话说两遍。
  const ticks: MinutelyTick[] = [];
  buckets.forEach((bucket, index) => {
    if (bucket.offset % TICK_STEP !== 0) return;

    const center = ((index + 0.5) / buckets.length) * 100;
    const isFirst = index === 0;
    ticks.push({
      offset: bucket.offset,
      label: bucket.offset === 0 ? '现在' : `${bucket.offset}分钟`,
      leftPct: isFirst ? 0 : center,
      anchor: isFirst ? 'start' : center > 84 ? 'end' : 'mid',
    });
  });

  return {
    buckets,
    ticks,
    // 每格覆盖 BUCKET_MINUTES 分钟，窗口跨度就是格数 × 每格长度
    spanMinutes: buckets.length * BUCKET_MINUTES,
    total,
    peak,
  };
}

/**
 * 分钟偏移 → 人话。
 *
 * 「现在」/「35 分钟后」/「1 小时 10 分后」。
 *
 * 为什么写「后」不写「+35 分钟」：带方向的那个字就是这句话的结论，
 * 读者先看时间再决定要不要算差。
 */
export function offsetLabel(offset: number): string {
  if (offset <= 0) return '现在';
  if (offset < 60) return `${offset} 分钟后`;
  const hours = Math.floor(offset / 60);
  const minutes = offset % 60;
  return minutes ? `${hours} 小时 ${minutes} 分后` : `${hours} 小时后`;
}
