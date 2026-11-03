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

import type { MinutelyBucket, MinutelyCurtain, MinutelyPoint, MinutelyTick, PrecipLevel } from '@/types/fishing';

import { num } from './weather';

/**
 * 雨强分档。
 *
 * 口径是**1 小时雨强**的通用分档：≤2.5 小雨 / 2.5~8 中雨 / 8~16 大雨 /
 * ≥16 暴雨（毫米/小时）。
 *
 * 上游量的是 5 分钟累计量，所以阈值除以 12 —— 5 分钟下的量乘 12 才是
 * 等效的一小时雨强。表里的 from 因此是 0.21 / 0.67 / 1.33 这样的数，
 * 不是 2.5 / 8 / 16。
 */
const LEVELS: ReadonlyArray<{ key: PrecipLevel; label: string; from: number }> = [
  { key: 'light', label: '小雨', from: 0 },
  { key: 'medium', label: '中雨', from: 2.5 / 12 },
  { key: 'heavy', label: '大雨', from: 8 / 12 },
  { key: 'storm', label: '暴雨', from: 16 / 12 },
];

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
 *
 * 和上面那张档位表是同一套口径（表里 storm.from = 16/12），
 * 改档位阈值时这里要一起改。
 */
/**
 * 每格覆盖的分钟数。
 *
 * 上游的分钟降水就是 5 分钟一格，窗口跨度按这个算，
 * 免得格数与跨度各写一个 5。
 */
const BUCKET_MINUTES = 5;

const SCALE_MAX_5MIN = 16 / 12;

/**
 * 柱高量程的上沿（毫米/5 分钟）。
 *
 * 导出给组件用：绘图区的高度换算成毫米，就靠这一个数。
 * 组件自己另写一份的话，两边迟早对不上 —— 图上标 2.0 毫米，
 * 柱子却按 1.33 毫米画，读数就成了假话。
 */
export const PRECIP_SCALE_MAX = SCALE_MAX_5MIN;

/**
 * 纵轴刻度（毫米/5 分钟）。
 *
 * 为什么是这三个数而不是「等分三份」：刻度要落在
 * 读者能对上的整数上。0 / 0.7 / 1.3 是量程 1.33 的自然档，
 * 而 1.33 这个数本身是暴雨下限（16 毫米/小时 ÷ 12），
 * 读者在色卡那一档见过它。
 */
export const PRECIP_AXIS_TICKS: ReadonlyArray<number> = [0, 0.7, 1.3];

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
export function precipLevelOf(value: number | null): PrecipLevel | null {
  if (value === null) return null;
  if (value <= 0) return 'none';

  let hit: PrecipLevel = 'light';
  for (const level of LEVELS) {
    if (value >= level.from) hit = level.key;
  }
  return hit;
}

/** 档位 → 档位名 */
export function precipLevelLabel(level: PrecipLevel): string {
  if (level === 'none') return NONE_LABEL;
  return LEVELS.find((item) => item.key === level)?.label ?? '';
}

/**
 * 横轴上出刻度的那几个时刻。
 *
 * 写「现在 / 20 分钟 / 60 分钟 / 100 分钟」而不是钟点 ——
 * 用户问的是「雨什么时候到」，不是「几点到」。
 *
 * 这几个位置**不等距**（间隔 20、40、40 分钟），所以刻度按格子的位置摆，
 * 不是按等距步长切的。窗口不够长时，落在窗口外的刻度自然不出现。
 */
const TICK_OFFSETS = [0, 20, 60, 100];

/**
 * 把上游的点序列换算成「雨幕」这张图的窗口模型。
 *
 * 空串（没有数据）与 "0.00"（测到没下雨）在这里就分开了：
 * 前者 value 为 null、heightPct 为 null，不参与累计也不参与峰值 ——
 * 当成 0 会在图上长出一段并不存在的降水。
 */
export function buildMinutelyCurtain(points: MinutelyPoint[]): MinutelyCurtain {
  const buckets: MinutelyBucket[] = points.map((point, index) => {
    const value = num(point.precip);
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

  const ticks: MinutelyTick[] = [];
  buckets.forEach((bucket, index) => {
    if (!TICK_OFFSETS.includes(bucket.offset)) return;

    // 刻度落在它所指的**那一格的中心**，不是那一格的起点
    const center = ((index + 0.5) / buckets.length) * 100;
    const isFirst = index === 0;
    ticks.push({
      offset: bucket.offset,
      label: bucket.offset === 0 ? '现在' : `${bucket.offset}分钟`,
      leftPct: isFirst ? 0 : center,
      anchor: isFirst ? 'start' : center > 88 ? 'end' : 'mid',
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
