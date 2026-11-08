/**
 * 潮汐曲线的数据管线 —— 首页那张卡与潮汐详情页画的是同一张图。
 *
 * 两边逐时序列的来源不同（首页取今日近站点，详情页取用户选的港口与日期），
 * 但「逐时序列 → 曲线点 / 刻度标签 / 现在线位置」这三步是同一套口径。
 * 以前两处各写一遍，其中一处改了「现在线怎么对齐」，另一处就默默对不上：
 * 同一个时刻，两张图上的竖线差一小时。
 *
 * 所以只有取数不同，其余全走这里。
 */
import { computed, type ComputedRef, type Ref } from 'vue';

import { fxHourKey, localHourKey, parseFxTime } from '@/utils/date';

interface TideHourPoint {
  fxTime: string;
  height: number | string;
}

export interface TideCurve {
  /** 曲线上的点 */
  points: ComputedRef<TideHourPoint[]>;
  /** X 轴刻度：每个点的时刻 */
  labels: ComputedRef<string[]>;
  /** 「现在」落在第几个点。-1 = 不在序列里 */
  nowIndex: ComputedRef<number>;
  /** 至少有一条数值可用的逐时记录才画曲线 */
  hasHourly: ComputedRef<boolean>;
}

export function useTideCurve(hourly: Ref<TideHourPoint[] | undefined>): TideCurve {
  const points = computed(() => hourly.value ?? []);

  const hasHourly = computed(() => points.value.length > 0);

  const labels = computed(() => points.value.map((point) => parseFxTime(point.fxTime)?.time ?? ''));

  /**
   * 当前时刻落在逐时序列里的下标，画「现在」竖线用。
   *
   * 比对的是小时键（`2026-10-17T14`），不 new Date()：
   * 后端 fxTime 自带 +08:00，转成 Date 会按设备时区重解释，
   * 开发者工具和真机时区不一致时整条标线会偏几小时，且只在真机复现。
   *
   * 逐时数据是整点（`...T14:00`），当前时刻是整点内（比如 14:23），
   * 所以按小时对齐，不去比分钟。
   */
  const nowIndex = computed(() => {
    const stamp = localHourKey();
    return points.value.findIndex((point) => fxHourKey(point.fxTime) === stamp);
  });

  return { points, labels, nowIndex, hasHourly };
}
