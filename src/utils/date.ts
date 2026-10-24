/**
 * 日期工具。
 *
 * 只有三个函数，却没引 dayjs：主包 2MB 上限，加一个日期库不划算，
 * 而这里要的也就是"今天是哪天"和"把后端时间戳拆成年月日"。
 *
 * 后端潮汐的 fxTime 形如 `2026-10-17T14:00+08:00` —— 带时区偏移，不能直接 `new Date()`
 * 后取本地字段（那会按运行设备的时区重解释，跨时区就对不上潮汐表了）。
 * 所以这里只做字符串切片，不做任何时区换算。
 */

/** 今天的日期，格式 `YYYYMMDD`，用作潮汐接口的 date 参数 */
export function formatCompactDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * 把后端带时区的时间串拆成展示用的月/日和时/分。
 *
 * 只切字符串不 new Date()：fxTime 自带 `+08:00`，一旦转成 Date 再取字段，
 * 得到的会是运行设备所在时区的时间。开发者工具和真机时区不一致时，
 * 潮汐表会整体偏几个小时，而且只在真机上复现。
 */
export function parseFxTime(fxTime: string): {
  date: string;
  time: string;
} | null {
  // 期望形如 2026-10-17T14:00+08:00 或 2026-10-17T14:00
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(fxTime);
  if (!matched) return null;

  const [, , month, day, hour, minute] = matched;
  return {
    date: `${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

/**
 * 把 `YYYY-MM-DD` 形式的日期切出 `MM-DD`，图表轴和预报行用。
 *
 * 后端 fxDate 形如 `2026-10-17`，不带时区，这里同样只切字符串。
 */
export function shortDate(fxDate: string): string {
  return fxDate.slice(5);
}

/**
 * 把带时区的时间串压成「月-日 时:分」。
 *
 * 和 parseFxTime 用同一套切法，不 new Date() —— 理由见那个函数的注释：
 * 换算成本地时区后，开发者工具和真机可能给出不同的读数。
 */
export function formatMoment(value: string | null | undefined): string {
  const parsed = parseFxTime(value ?? '');
  if (!parsed) return '';
  return `${parsed.date} ${parsed.time}`;
}

/**
 * 只取「HH:mm」。
 *
 * 给「这份数据是什么时候的」这类落款用：脚注要回答的是「几点钟更新的」，
 * 不是「哪天的几点」—— 日期在页面上已经处处都是（今天、这一周），
 * 再写一遍是噪音。数据可能来自昨天（缓存的潮汐表），但对用户来说
 * 「10:31 更新」已经够用。
 *
 * 同样只切字符串不 new Date()，理由与 formatMoment 一致。
 */
export function formatTimeOfDay(value: string | null | undefined): string {
  const parsed = parseFxTime(value ?? '');
  if (!parsed) return '';
  return parsed.time;
}

/**
 * 当前时刻，格式 `YYYY-MM-DD HH:mm:ss`。
 *
 * 送进 AI 建议载荷当时间戳用。后端只当字符串展示，不解析，
 * 所以这里给的是设备本地时间 —— 展示给用户看的，设备本地时间才是对的。
 */
export function formatDateTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * 草稿时间戳 → 「10-21 20:15」。
 *
 * 给「已恢复上次的草稿 · 保存于 …」那一条用。
 * 不带年份也不带秒：草稿要么是刚才写的，要么是上次的，
 * 两种情况下用户都不需要精确到秒 —— 写全了反而把那条提示撑得读不下去。
 */
export function formatShortMoment(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 「HH:MM」→ 当天第几分钟（0–1439）。取不到给 null。
 *
 * 日出日落、月出月落这些时刻都是「墙上时间」，日照时间轴要拿它在一天里的
 * 位置来定位标记，所以要一个连续量。这里同样只切字符串，不 new Date() ——
 * 理由跟上面那些函数一致：这些时刻自带 +08:00，换算到设备时区会整体平移。
 */
export function minutesOfDay(value: string | undefined | null): number | null {
  if (!value) return null;
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!matched) return null;

  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * 两个「HH:MM」时刻之间的时长，形如「11小时31分」。
 *
 * 结束早于开始时按跨零点补一整天 —— 白昼时长不会是负的，
 * 而「日落 18:19 → 民用晨昏 05:10」这种跨越零点的时段是真实存在的。
 */
export function durationBetween(start: string, end: string): string {
  const from = minutesOfDay(start);
  const to = minutesOfDay(end);
  if (from === null || to === null) return '';

  let diff = to - from;
  if (diff <= 0) diff += 24 * 60;

  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;

  if (hours === 0) return `${minutes}分`;
  if (minutes === 0) return `${hours}小时`;
  return `${hours}小时${minutes}分`;
}
