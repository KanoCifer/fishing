/**
 * 数值解析 —— 后端数值字段的两态收口。
 *
 * 和风的数值字段全是字符串（temp: "29"），潮高的后端类型是 number | string，
 * 别的接口还有 null 与空串。三种形状都要落到同一个问题：
 * 「这格到底有没有数」。
 *
 * 答案必须是 null 而不是 0：0 会被读成「实测是这个值」，
 * 而 NaN 渗进模板会渲染成 "NaN°" —— 一个看着还挺可信的数字最坏。
 * 调用方拿到 null 才知道要走空态分支。
 */

export function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
