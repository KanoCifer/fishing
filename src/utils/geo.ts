/**
 * 坐标序列化 —— 两位小数的坐标串，全项目唯一一份。
 *
 * 为什么是两位小数：这是后端的约定（也是刻意的位置模糊），
 * 后端按两位小数做缓存和降级。不要为了「更精确」改成 toFixed(6) ——
 * 位数变了后端缓存全部 miss。
 *
 * 它同时是两样东西，所以必须只有一份实现：
 *
 * - **请求参数**：`GET /v2/fishing/index?location=113.39,23.05`
 * - **缓存键**：判断「现在这份数据是不是这个地点的」
 *
 * 两份实现一旦漂移，缓存键与请求参数就指着两个不同的地点 ——
 * 界面显示的是新地点的数据，取回来的却是旧地点的。
 */

import type { LngLat } from '@/types/fishing';

export function locationKey(location: LngLat): string {
  return `${location[0].toFixed(2)},${location[1].toFixed(2)}`;
}
