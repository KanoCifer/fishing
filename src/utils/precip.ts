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

  // 柱高按窗口峰值归一：最高的柱子顶到绘图区上沿
  const max = peak?.value ?? 0;
  for (const bucket of buckets) {
    bucket.heightPct = bucket.value === null || max <= 0 ? null : (bucket.value / max) * 100;
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
    // 每格覆盖 5 分钟，窗口跨度就是格数 × 5
    spanMinutes: buckets.length * 5,
    total,
    peak,
  };
}

/**
 * 窗口跨度 → 人话。
 *
 * 120 分钟说「2 小时」，45 分钟还是说「45 分钟」——
 * 一律换成小时会把「一小时的窗口」说成「0 小时」。
 */
export function formatSpan(spanMinutes: number): string {
  if (spanMinutes <= 0) return '';
  if (spanMinutes % 60 === 0) return `${spanMinutes / 60} 小时`;
  return `${spanMinutes} 分钟`;
}
