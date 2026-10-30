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
 * 把一个 ISO 时间戳（带时区）转成设备本地的「HH:mm」。
 *
 * 与 `formatTimeOfDay` 的区别在**换不换算**：
 * 那一处处理的是后端给的**墙上时间**（`2026-10-17T14:00+08:00` 里的 14:00
 * 就是要显示的 14:00，不换算）；这里处理的是**绝对时刻** —— 用户在 21:30
 * 记的一笔，显示时应当换算到他自己的本地时间，而不是 UTC 的 13:30。
 */
export function formatLocalTimeOfDay(value: string | null | undefined): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 「今天」的日历日 —— 按 **+08:00** 算。
 *
 * 为什么不是设备本地时区：服务端判定「这条记录是不是今天」用的就是 +08:00
 * （中国自 1991 年起不用夏令时，固定 +08:00 与 Asia/Shanghai 等价），
 * 前后端必须认同一个日子 —— 两边算法不一样时，设备不在 +08 的用户
 * 提交会被 400 拒掉，而那条记录本身没有毛病。
 *
 * 这个 app 的气象数据（和风天气、海洋预报台潮汐站）本来就只覆盖中国，
 * 记录的日子跟着中国的日历走是自洽的。
 *
 * 实现上先把时刻整体挪 8 小时，再取 UTC 字段 —— 挪完之后
 * UTC 的年月日就是东八区的年月日。
 */
export function logDateKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * 「本月」的月份 —— 同样按 +08:00 算，理由见 `logDateKey`。
 */
export function logMonthKey(date: Date = new Date()): string {
  return logDateKey(date).slice(0, 7);
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
 * 把后端 fxTime 截成「小时键」，形如 `2026-10-26T01`（13 位）。
 *
 * 注意是 13 位而不是 14 位 —— 第 14 位是分钟冒号，
 * 拿 14 位去和 13 位的字符串比，长度都不等，永远不相等。
 * 这一层的截法只此一份，需要小时粒度对齐的地方都用它。
 */
export function fxHourKey(fxTime: string): string {
  return fxTime.slice(0, 13);
}

/**
 * 把后端 fxTime 截成「分钟键」，形如 `2026-10-26T01:20`（16 位）。
 *
 * 需要区分同一小时内先后顺序时用它（潮时表里一天有好几条潮时）。
 * 同样是切字符串，不 new Date()，理由同 parseFxTime。
 */
export function fxMinuteKey(fxTime: string): string {
  return fxTime.slice(0, 16);
}

/**
 * 设备当前本地时刻的小时键 / 分钟键，格式与上面两个对齐。
 *
 * 和 fxHourKey / fxMinuteKey 成对使用：一边是后端字符串切出来的墙上时间，
 * 一边是设备本地时间切出来的墙上时间 —— 两边都不换算时区，
 * 所以设备时区与后端 +08:00 不一致时会有偏差，那是设计上的取舍，
 * 不是 bug；真机在小程序里默认跟随系统时区。
 */
export function localHourKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}`;
}

export function localMinuteKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localHourKey(date)}:${pad(date.getMinutes())}`;
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
