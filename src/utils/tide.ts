/**
 * 潮汐的派生计算 —— 结论头和 TideCard 都要读同一张潮汐表，
 * 逻辑放一处，免得两处各写一遍「怎么从 tideTable 里挑出高潮」，
 * 将来后端改字段时只改这里。
 *
 * 和 TideChart 里只做像素换算不同，这里产出的是文案，
 * 消费方直接放进界面，所以取值口径必须统一：无法解析时返回 null，
 * 由调用方决定显示「--」还是整块不渲染 —— 不要在这里编一个假的 0。
 */

import { fxMinuteKey, localMinuteKey, parseFxTime } from '@/utils/date';
import type { TideData, TideTableItem } from '@/types/fishing';

export interface TideExtreme {
  /** 形如 15:20，取不到时 '--' */
  time: string;
  /** 形如 2.40（m），取不到时 '--' */
  height: string;
}

/** 后端 height 字段是数字或字符串，消费前一律过 Number() */
function formatHeight(raw: number | string | undefined): string {
  const value = Number(raw);
  return Number.isFinite(value) ? value.toFixed(2) : '--';
}

/**
 * 此刻之后的第一个高潮条目（原始条目）。
 *
 * 「怎么从 tideTable 里挑出下一个满潮」只此一处：nextHighTide 拿它拼展示值，
 * 钓点详情的钓况格拿它算「还有几小时到满潮」。两处各挑一遍的话，
 * 后端哪天改了 tideTable 的结构，漏改的那处就会静默给出另一个高潮。
 */
export function nextHighTideItem(tide: TideData | null | undefined): TideTableItem | null {
  const table = tide?.tideTable ?? [];
  if (!table.length) return null;

  // 潮时表带分钟（`15:20`），比到分钟才分得清同一小时内先后
  const stamp = localMinuteKey();

  const upcoming = table
    .filter((item) => item.type === 'H' && fxMinuteKey(item.fxTime) >= stamp)
    .sort((a, b) => a.fxTime.localeCompare(b.fxTime))[0];

  return upcoming ?? null;
}

/**
 * 此刻之后的第一个高潮。
 *
 * 比对用的是 fxTime 字符串的前 16 位（`2026-10-18T15:20`），不 new Date()：
 * 后端 fxTime 自带 +08:00，转成 Date 会按设备时区重解释，
 * 开发者工具和真机时区不一致时整条判断会偏几小时，且只在真机复现。
 */
export function nextHighTide(tide: TideData | null | undefined): TideExtreme | null {
  const upcoming = nextHighTideItem(tide);
  if (!upcoming) return null;
  return { time: parseFxTime(upcoming.fxTime)?.time ?? '--', height: formatHeight(upcoming.height) };
}

/** 涨落方向。只有两个点以上才判断得出来 */
export type TideTrend = 'rising' | 'falling' | 'flat';

/**
 * 这份潮汐覆盖的日期（`YYYYMMDD`）。取不到时给空串。
 *
 * 上游按**站点当地日期**返回一天的逐时潮高，后端 full 端点取的是站点当地今天。
 * 取逐时首条的 fxTime 前 10 位再拼成紧凑日期 —— 不 new Date()，
 * 理由同文件头：fxTime 自带 +08:00，转成 Date 会按设备时区重解释。
 *
 * 用途：判断「full 端点那份潮汐」能不能直接给潮汐面板用 ——
 * 站对得上、日期也对得上，就不用再打一次接口。
 */
export function tideDateKey(tide: TideData | null | undefined): string {
  const fxTime = tide?.tideHourly?.[0]?.fxTime ?? tide?.tideTable?.[0]?.fxTime ?? '';
  const day = fxTime.slice(0, 10);
  if (day.length !== 10) return '';
  return `${day.slice(0, 4)}${day.slice(5, 7)}${day.slice(8, 10)}`;
}

/**
 * 当前是涨潮还是退潮。
 *
 * 取逐时序列末尾两个有效点比大小，而不是拿整条曲线拟合 ——
 * 结论头要的是「此刻」，末尾两点正好是此刻。
 */
export function tideTrend(tide: TideData | null | undefined): TideTrend | null {
  const hourly = (tide?.tideHourly ?? [])
    .map((point) => Number(point.height))
    .filter((value) => Number.isFinite(value));

  if (hourly.length < 2) return null;

  const diff = hourly[hourly.length - 1] - hourly[hourly.length - 2];
  // 小于 1cm 的波动在这个尺度上就是平的，别让界面跟着抖
  if (Math.abs(diff) < 0.01) return 'flat';
  return diff > 0 ? 'rising' : 'falling';
}
