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
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * 把后端带时区的时间串拆成展示用的月/日和时/分。
 *
 * 只切字符串不 new Date()：fxTime 自带 `+08:00`，一旦转成 Date 再取字段，
 * 得到的会是运行设备所在时区的时间。开发者工具和真机时区不一致时，
 * 潮汐表会整体偏几个小时，而且只在真机上复现。
 */
export function parseFxTime(fxTime: string): {
  date: string
  time: string
} | null {
  // 期望形如 2026-10-17T14:00+08:00 或 2026-10-17T14:00
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(fxTime)
  if (!matched) return null

  const [, , month, day, hour, minute] = matched
  return {
    date: `${month}-${day}`,
    time: `${hour}:${minute}`,
  }
}

/**
 * 把 `YYYY-MM-DD` 形式的日期切出 `MM-DD`，图表轴和预报行用。
 *
 * 后端 fxDate 形如 `2026-10-17`，不带时区，这里同样只切字符串。
 */
export function shortDate(fxDate: string): string {
  return fxDate.slice(5)
}
