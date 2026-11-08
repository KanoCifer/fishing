/**
 * 单位换算 —— 气象读数里那几处换算的唯一出处。
 *
 * 为什么值得单独一份：风速在两个方向上各写一遍常数，
 * 一处是「m/s → km/h」（取数归一），一处是「km/h → m/s」（界面显示）。
 * 两处各写一遍 3.6，改了一处忘了另一处，风速就会差三倍多 ——
 * 而 3.6 与 11.4 在竿子上的分量完全不同，读错等于读错天。
 */

/** 1 m/s = 3.6 km/h */
export const KMH_PER_MS = 3.6;

/** 1 mph = 1.609344 km/h */
export const KMH_PER_MPH = 1.609344;

/** m/s → km/h */
export function msToKmh(ms: number): number {
  return ms * KMH_PER_MS;
}

/** km/h → m/s */
export function kmhToMs(kmh: number): number {
  return kmh / KMH_PER_MS;
}

/** mph → km/h */
export function mphToKmh(mph: number): number {
  return mph * KMH_PER_MPH;
}
