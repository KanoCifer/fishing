/**
 * 潮汐的派生计算 —— 潮汐面板复用哪一份、钓点详情的钓况格怎么挑高潮，
 * 都从这里取值。逻辑放一处，免得各处各写一遍「怎么从 tideTable 里挑出高潮」，
 * 将来后端改字段时只改这里。
 *
 * 和 TideChart 里只做像素换算不同，这里产出的是文案，
 * 消费方直接放进界面，所以取值口径必须统一：无法解析时返回 null，
 * 由调用方决定显示「--」还是整块不渲染 —— 不要在这里编一个假的 0。
 */

import { fxHourKey, fxMinuteKey, localHourKey, localMinuteKey, minuteStamp, parseFxTime } from '@/utils/date';
import type { TideData, TideTableItem } from '@/types/fishing';

/**
 * 此刻之后的第一个高潮条目（原始条目）。
 *
 * 「怎么从 tideTable 里挑出下一个满潮」只此一处：钓点详情的钓况格拿它算
 * 「还有几小时到满潮」。挑法散开写，后端哪天改了 tideTable 的结构，
 * 漏改的那处就会静默给出另一个高潮。
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

/**
 * 潮汐表里的一次极值 —— 时刻与潮高。
 *
 * 时刻用后端给的墙上时间原样显示（不换算到设备时区，理由见 parseFxTime）。
 */
export interface TideExtreme {
  /** 时刻，`HH:mm` */
  time: string;
  /** 潮高（米） */
  height: number;
}

/**
 * 取潮汐表里最高的一次高潮 / 最低的一次低潮。
 *
 * 「怎么从 tideTable 里挑出高潮」只此一处：首页卡片、潮汐详情页、
 * 钓点详情的钓况格都从这里取，免得各处各写一遍挑法，
 * 后端哪天改了 tideTable 的结构，漏改的那处就会静默给出另一个数。
 */
function extremeTide(tide: TideData | null | undefined, type: 'H' | 'L', pick: 'max' | 'min'): TideExtreme | null {
  const table = (tide?.tideTable ?? []).filter((item: TideTableItem) => item.type === type);
  if (!table.length) return null;

  const best = table.reduce((prev, curr) => {
    const prevValue = Number(prev.height);
    const currValue = Number(curr.height);
    return (pick === 'max' ? currValue > prevValue : currValue < prevValue) ? curr : prev;
  });

  const height = Number(best.height);
  if (!Number.isFinite(height)) return null;

  return {
    time: parseFxTime(best.fxTime)?.time ?? '--',
    height,
  };
}

/** 潮汐表里最高的一次高潮 */
export function highestHighTide(tide: TideData | null | undefined): TideExtreme | null {
  return extremeTide(tide, 'H', 'max');
}

/** 潮汐表里最低的一次低潮 */
export function lowestLowTide(tide: TideData | null | undefined): TideExtreme | null {
  return extremeTide(tide, 'L', 'min');
}

/**
 * 当日潮差（米）—— 最高潮高减最低潮高。
 *
 * 潮差决定这一天的潮水流速快慢：大潮差潮水急、小潮差潮水缓。
 * 取不到极值时给 null，不编一个 0 —— 0 潮差会被读成「一点不流」。
 */
export function tideRange(tide: TideData | null | undefined): number | null {
  const high = highestHighTide(tide);
  const low = lowestLowTide(tide);
  if (!high || !low) return null;
  return high.height - low.height;
}

/**
 * 下一个潮时 —— 高潮或低潮里离此刻最近的那一个。
 */
export interface TideEvent {
  /** H 高潮 / L 低潮 */
  type: 'H' | 'L';
  /** 时刻，`HH:mm` */
  time: string;
  /** 潮高（米） */
  height: number;
  /** 距此刻多少分钟 */
  minutesToNext: number;
}

/**
 * 此刻之后的第一个潮时（高潮或低潮）。
 *
 * 跟 nextHighTideItem 分开：那一处只找高潮，是给钓点详情的钓况格用的；
 * 这一处高潮低潮都算，是给「距下一潮」这句提示用的。
 */
export function nextTideEvent(tide: TideData | null | undefined): TideEvent | null {
  const table = tide?.tideTable ?? [];
  if (!table.length) return null;

  const now = minuteStamp(localMinuteKey());
  if (now === null) return null;

  const upcoming = table
    .filter((item) => (minuteStamp(fxMinuteKey(item.fxTime)) ?? -1) >= now)
    .sort((a, b) => a.fxTime.localeCompare(b.fxTime))[0];
  if (!upcoming) return null;

  const stamp = minuteStamp(fxMinuteKey(upcoming.fxTime));
  const height = Number(upcoming.height);

  return {
    type: upcoming.type,
    time: parseFxTime(upcoming.fxTime)?.time ?? '--',
    height: Number.isFinite(height) ? height : 0,
    minutesToNext: stamp === null ? 0 : stamp - now,
  };
}

/**
 * 此刻的潮位与涨退速率。
 *
 * 逐时序列给的是整点的潮高，两点之间按直线插值 —— 潮水在整点之间是连续
 * 变化的，插出来的值与真实潮位的误差在厘米级，够用。
 *
 * 速率取相邻两点的差（米/小时）：潮高是米，速率是米每小时，
 * 一个说「现在多高」，一个说「变得多快」。
 */
export interface TideNow {
  /** 当前潮位（米） */
  level: number;
  /** 涨退速率（米/小时）。正为涨，负为退 */
  rate: number;
  /** 涨落方向 */
  trend: TideTrend;
}

/**
 * 此刻的潮位 / 速率 / 方向。
 *
 * 现在这一刻不在逐时序列里时给 null —— 比如看的是别的日期，
 * 或者数据缺了当前这一小时。这时候界面该显示的是别的东西，
 * 不是一份编出来的读数。
 */
export function deriveTideNow(tide: TideData | null | undefined): TideNow | null {
  const hourly = tide?.tideHourly ?? [];
  if (!hourly.length) return null;

  const stamp = localHourKey();
  const index = hourly.findIndex((point) => fxHourKey(point.fxTime) === stamp);
  if (index < 0) return null;

  const current = Number(hourly[index].height);
  if (!Number.isFinite(current)) return null;

  const prev = index > 0 ? Number(hourly[index - 1].height) : NaN;
  const next = index + 1 < hourly.length ? Number(hourly[index + 1].height) : NaN;

  /*
   * 速率按「比上一小时高了多少」算 —— 与 TideChart 顶部的涨落状态同一口径。
   * 同一个数不能两处算法不一样：卡片写「退潮中 -0.24 m/h」而曲线标着
   * 「涨潮中」，读的人得自己判断该信哪个。
   *
   * 一天的第一个点没有上一小时，退到下一小时。
   * 宁可给一个方向，也不给 0 —— 0 会读成「潮水停了」。
   */
  const rate = Number.isFinite(prev) ? current - prev : Number.isFinite(next) ? next - current : NaN;
  if (!Number.isFinite(rate)) return null;

  /*
   * 潮位取这一小时的采样值，不在小时内插值。
   * 曲线在这一刻标的就是这个数：卡片写 1.42、曲线标 1.48，
   * 同一件事说了两遍还不一样，比少写一个数更糟。
   */
  return { level: current, rate, trend: trendOf(rate) };
}

/**
 * 涨落方向。速率小于 0.5cm/h 视为平潮 —— 与 TideChart 的阈值一致，
 * 在这个尺度上那点波动是平的，让界面跟着抖没有意义。
 */
function trendOf(rate: number): TideTrend {
  if (Math.abs(rate) < 0.005) return 'flat';
  return rate > 0 ? 'rising' : 'falling';
}
