/**
 * 天文时段的计算 —— 夜钓窗口、白昼段、倒计时目标。
 *
 * 这一层全是纯计算：输入今天的日出日落与月出月落，输出「几点到几点」。
 * 组件只管把它画出来与读出来。
 *
 * 为什么要从组件里搬出来：这段逻辑有一百多行，写在组件里就成了组件的一部分 ——
 * 改一句算法要在一个几百行的文件里翻来翻去，而这段逻辑本身是可以单独
 * 推敲的（尤其夜钓窗口那个交集算法，见下面 nightWindows 的说明）。
 *
 * 时刻一律是**绝对分钟**：从今天零点起算，可以超过 1440（那是明天）。
 */
import { MINUTES_PER_DAY, minutesOfDay } from './date';

/**
 * 一段「天黑且月亮在天上」的时间。
 *
 * 两个条件缺一不可：月亮不在天上那截钓不到鱼，天亮那截也不是夜里。
 */
export interface AstroWindow {
  start: number;
  end: number;
  /** 窗口怎么开的：天黑 / 月出 */
  open: string;
  /** 窗口怎么关的：月落 / 天亮 */
  close: string;
}

/** 轨道上的一段 */
export interface AstroBand {
  cls: string;
  left: number;
  width: number;
}

/** 一个倒计时目标 */
export interface AstroTarget {
  key: string;
  /** 胶囊上的字 */
  label: string;
  /** 目标时刻：从今天零点起算的分钟数，可以大于 1440（那是明天） */
  at: number;
  /** 这一刻是什么：天黑 / 月落 / 日出 / 日落 */
  event: string;
}

/** 一天的天文时刻。只取算窗口与倒计时要用的那几项 */
export interface AstroDayTimes {
  /** 日出 */
  sunrise?: string;
  /** 日落 */
  sunset?: string;
  /** 民用暮光结束（天黑） */
  civilDusk?: string;
  /** 民用晨光开始（天亮） */
  civilDawn?: string;
  /** 月出 */
  moonrise?: string;
  /** 月落 */
  moonset?: string;
}

/**
 * 夜钓窗口 = 天黑 ∧ 月亮在天上。
 *
 * ⚠️ 不要按「天黑 → 月落」配对 —— 那是错的。
 * 月落若在天黑之前（残月常见：月亮后半夜升起、天黑前就落了），
 * 那一夜压根没有月亮在天上的时段，配出来的窗口既不是夜里也没有月。
 * 交集才是窗口：暗的那截 ∩ 月在天上的那截。
 */
export function nightWindows(today: AstroDayTimes | null, tomorrow: AstroDayTimes | null): AstroWindow[] {
  if (!today) return [];

  const moonrise = minutesOfDay(today.moonrise);
  const moonset = minutesOfDay(today.moonset);
  const dusk = minutesOfDay(today.civilDusk);
  const dawn = minutesOfDay(today.civilDawn);
  if (moonrise === null || moonset === null || dusk === null || dawn === null) return [];

  const tomorrowDawn = minutesOfDay(tomorrow?.civilDawn) ?? dawn;
  const tomorrowDusk = minutesOfDay(tomorrow?.civilDusk) ?? dusk;
  const tomorrowMoonrise = minutesOfDay(tomorrow?.moonrise);
  const tomorrowMoonset = minutesOfDay(tomorrow?.moonset);

  /**
   * 月亮在天上的那一段。
   *
   * s < r 表示今夜升起、明晨落下 —— 那一段跨零点。
   */
  const up = (start: number, end: number, offset: number) =>
    end > start
      ? { start: offset + start, end: offset + end }
      : { start: offset + start, end: offset + end + MINUTES_PER_DAY };

  const moonSpans = [
    up(moonrise, moonset, 0),
    // 上一段：它决定今天凌晨还亮不亮月亮
    moonset > moonrise
      ? { start: moonrise - MINUTES_PER_DAY, end: moonset - MINUTES_PER_DAY }
      : { start: moonrise - MINUTES_PER_DAY, end: moonset },
  ];
  if (tomorrowMoonrise !== null && tomorrowMoonset !== null) {
    moonSpans.push(up(tomorrowMoonrise, tomorrowMoonset, MINUTES_PER_DAY));
  }

  /** 天黑的那几段：昨夜剩下的、今夜、明夜 */
  const darkSpans = [
    { start: dusk - MINUTES_PER_DAY, end: dawn },
    { start: dusk, end: MINUTES_PER_DAY + tomorrowDawn },
    { start: MINUTES_PER_DAY + tomorrowDusk, end: MINUTES_PER_DAY * 2 + tomorrowDawn },
  ];

  const list: AstroWindow[] = [];

  for (const moon of moonSpans) {
    for (const dark of darkSpans) {
      const start = Math.max(moon.start, dark.start);
      const end = Math.min(moon.end, dark.end);
      if (start >= end) continue;

      list.push({
        start,
        end,
        // 交集的起点取两者里靠后的那个 —— 那才是窗口真正开的那一刻
        open: dark.start > moon.start ? '天黑' : '月出',
        close: moon.end < dark.end ? '月落' : '天亮',
      });
    }
  }

  list.sort((a, b) => a.start - b.start);
  return list;
}

/**
 * 夜钓窗口这一项数到哪一刻。
 *
 * 窗口正开着 → 数到它关（还剩多久收竿）；
 * 窗口还没开 → 数到它开（还有多久能下水）。
 */
export function nightTarget(windows: AstroWindow[], now: number): AstroTarget | null {
  if (!windows.length) return null;

  const current = windows.find((item) => now >= item.start && now <= item.end);
  if (current) {
    return { key: 'night', label: '夜钓窗口', at: current.end, event: current.close };
  }

  const upcoming = windows.find((item) => item.start > now);
  if (!upcoming) return null;

  return { key: 'night', label: '夜钓窗口', at: upcoming.start, event: upcoming.open };
}

/**
 * 三个倒计时目标：夜钓窗口、日出、日落。
 *
 * 每个目标都是「从现在往后，下一次发生的那一刻」。
 * 晚上 8 点看「日出」，数的是明天早上那一次 —— 所以日出的时刻可能落在
 * 明天，具体是哪一天由说明行说了算。
 */
export function astroTargets(
  today: AstroDayTimes | null,
  tomorrow: AstroDayTimes | null,
  windows: AstroWindow[],
  now: number,
): AstroTarget[] {
  if (!today) return [];

  const sunrise = minutesOfDay(today.sunrise);
  const sunset = minutesOfDay(today.sunset);

  const tomorrowSunrise = minutesOfDay(tomorrow?.sunrise);
  const tomorrowSunset = minutesOfDay(tomorrow?.sunset);

  /**
   * 下一个「今天这个钟点」：今天的过了就取明天的。
   *
   * 两个来源都没有就返回 null —— 那一项不出现，
   * 不用别处的时刻凑一个出来。
   */
  const pick = (todayValue: number | null, tomorrowValue: number | null): number | null => {
    if (todayValue !== null && todayValue > now) return todayValue;
    if (tomorrowValue !== null) return MINUTES_PER_DAY + tomorrowValue;
    if (todayValue !== null) return MINUTES_PER_DAY + todayValue;
    return null;
  };

  const list: AstroTarget[] = [];

  // 夜钓窗口：数到下一个边界（窗口开 / 窗口关）
  const night = nightTarget(windows, now);
  if (night) list.push(night);

  const sunriseAt = pick(sunrise, tomorrowSunrise);
  if (sunriseAt !== null) list.push({ key: 'sunrise', label: '日出', at: sunriseAt, event: '日出' });

  const sunsetAt = pick(sunset, tomorrowSunset);
  if (sunsetAt !== null) list.push({ key: 'sunset', label: '日落', at: sunsetAt, event: '日落' });

  return list;
}

/**
 * 轨道上的两段。
 *
 * 白昼是日出到日落。冷色那些是夜钓窗口 —— 天黑且月亮在天上的那几段。
 * 窗口可能跨零点（夜里开始的窗口会在轨道上是两截：昨夜开的那截在早上，
 * 今夜开的那截在傍晚），所以冷色段不止一条。
 *
 * 轨道画的是一整天，所以只取落在今天这一天的部分。
 */
export function astroBands(today: AstroDayTimes | null, windows: AstroWindow[]): AstroBand[] {
  if (!today) return [];

  const list: AstroBand[] = [];
  const sunrise = minutesOfDay(today.sunrise);
  const sunset = minutesOfDay(today.sunset);

  if (sunrise !== null && sunset !== null && sunset > sunrise) {
    list.push({
      cls: 'astro__band--day',
      left: percentOf(sunrise),
      width: percentOf(sunset - sunrise),
    });
  }

  for (const item of windows) {
    const start = Math.max(item.start, 0);
    const end = Math.min(item.end, MINUTES_PER_DAY);
    if (end <= start) continue;

    list.push({ cls: 'astro__band--night', left: percentOf(start), width: percentOf(end - start) });
  }

  return list;
}

/** 分钟 → 占一天的百分比 */
export function percentOf(minutes: number): number {
  return (minutes / MINUTES_PER_DAY) * 100;
}

/** 时刻落在哪一天 */
export function dayWord(at: number): string {
  return Math.floor(at / MINUTES_PER_DAY) === 0 ? '今天' : '明天';
}

/** 时刻 → HH:mm */
export function clockText(at: number): string {
  const minutes = ((at % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
