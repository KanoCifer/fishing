/**
 * 钓鱼反馈的派生数据。
 *
 * 从源项目 `useFishingFeedback.ts` 迁来，职责不变：
 * 「哪些字段从 liveWeather 取、哪些从 tideTable 推、默认值是什么」集中在这里，
 * 表单组件只负责 UI 和提交，不做派生。
 *
 * 与源版本的关键差异：时间差不走 new Date()。
 * 源版 `deriveTideMeta` 用 `new Date(current.fxTime).getTime()` 求两潮时差，
 * 但后端 fxTime 自带 `+08:00`，new Date 会按运行设备时区重解释 ——
 * 两潮都是同一时区的字符串，时差本来不受影响，但设备时区不是 +08 时
 * 解析结果会整体平移，算出来的"距下一潮小时数"就偏了，而且只在真机复现。
 * 这里改成直接切字符串求分钟差，不做任何时区换算。
 */

import type { TideData } from '@/types/fishing'

/** 风力等级（1-3）：风速等级除以 3 向上取整再夹到 [1, 3] */
export function deriveWindLevel(windScale: string | number | undefined): number {
  const scale = Number(windScale) || 1
  return Math.min(3, Math.max(1, Math.ceil(scale / 3)))
}

export interface TideMeta {
  /** 当前潮位（米） */
  level: number
  /** 涨潮 / 退潮 */
  type?: '涨潮' | '退潮'
  /** 潮差（米） */
  range: number
  /** 距下一潮的小时数 */
  hoursToNext: number
}

/** 无潮汐数据时的兜底值，与源项目一致 */
const TIDE_FALLBACK: TideMeta = {
  level: 1.5,
  type: undefined,
  range: 1.5,
  hoursToNext: 3.0,
}

/**
 * 把 `2026-10-17T14:00+08:00` 换成「距 1970-01-01 的分钟数」。
 *
 * 用 Date.UTC 累加日历天数再减掉闰日修正 —— 不能用 `年*360 + 月*30` 这种
 * 粗略折算：相邻两条潮汐记录可能跨月甚至跨年（寒潮期间低潮间隔可达 400+ 小时），
 * 粗算出来的分钟差是错的，"距下一潮小时数"会离谱。
 *
 * Date.UTC 当纯日历运算用，不涉及时区：喂进去的全是数字，不含任何本地时间语义。
 */
function minutesSinceEpoch(fxTime: string): number | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(fxTime)
  if (!matched) return null

  const [, year, month, day, hour, minute] = matched.map(Number)
  const days = Date.UTC(year, month - 1, day) / (1000 * 60 * 60 * 24)
  return days * 24 * 60 + hour * 60 + minute
}

/**
 * 从潮汐表推算当前潮位 / 涨退 / 潮差 / 距下一潮小时数。
 *
 * 取表头两条：tideTable 是后端按时间排好的潮汐序列，
 * 第一条即当前潮位，第二条即下一潮。
 */
export function deriveTideMeta(tideData: TideData | null): TideMeta {
  const table = tideData?.tideTable
  if (!table || !table.length) return { ...TIDE_FALLBACK }

  const current = table[0]
  const next = table[1]

  const rawLevel = Number(current.height)
  const level = Number.isFinite(rawLevel) ? rawLevel : TIDE_FALLBACK.level

  // 表中 H=高潮（过后转退潮），L=低潮（过后转涨潮）
  const type: '涨潮' | '退潮' = current.type === 'H' ? '退潮' : '涨潮'

  if (!next) {
    return {
      level,
      type,
      range: TIDE_FALLBACK.range,
      hoursToNext: TIDE_FALLBACK.hoursToNext,
    }
  }

  const nextLevel = Number(next.height)
  const currentTime = minutesSinceEpoch(current.fxTime)
  const nextTime = minutesSinceEpoch(next.fxTime)

  const hoursToNext =
    currentTime !== null && nextTime !== null
      ? (nextTime - currentTime) / 60
      : TIDE_FALLBACK.hoursToNext

  return {
    level,
    type,
    range: Number.isFinite(nextLevel) ? Math.abs(nextLevel - level) : TIDE_FALLBACK.range,
    hoursToNext,
  }
}
