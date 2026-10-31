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

import type { FishingFeedbackLevel, FishingFeedbackPayload, TideData, WeatherIndex } from '@/types/fishing';
import type { FishingLogWeather } from '@/types/record';

/**
 * 和风官方钓鱼指数档位（1-3）：适宜=1 / 较适宜=2 / 不宜=3。
 *
 * 后端专家公式里的 w9 就是这个档位（`FishingExpertScorer.score_indices`），
 * 所以这里只能传官方钓鱼指数。早先这里传的是按风力等级推的
 * `deriveWindLevel` —— 语义错位：后端拿到的 w9 变成了风力等级，
 * 训练出来的残差模型在 w9 上学到的东西是错的。
 *
 * 认条目的口径与后端 `parse_index_level` 一致（name 为「钓鱼指数」或 type=4）。
 * 兜底与后端有一处**故意不同**：后端认不到官方条目时会退回第一条（可能是
 * 「穿衣指数」这种别的指数），前端不跟这个口径 —— 拿不到官方钓鱼指数就按
 * 中性档 2 处理，不拿别的指数冒充钓鱼指数。
 */
export function deriveFishingIndexLevel(indices: WeatherIndex[] | null | undefined): number {
  const entries = indices ?? [];
  const picked = entries.find((item) => item.name === '钓鱼指数' || item.type === '4');
  if (!picked) return 2;

  const level = Number(picked.level);
  if (!Number.isFinite(level)) return 2;
  return Math.min(3, Math.max(1, Math.round(level)));
}

export interface TideMeta {
  /** 当前潮位（米） */
  level: number;
  /** 涨潮 / 退潮 */
  type?: '涨潮' | '退潮';
  /** 潮差（米） */
  range: number;
  /** 距下一潮的小时数 */
  hoursToNext: number;
}

/** 无潮汐数据时的兜底值，与源项目一致 */
const TIDE_FALLBACK: TideMeta = {
  level: 1.5,
  type: undefined,
  range: 1.5,
  hoursToNext: 3.0,
};

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
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(fxTime);
  if (!matched) return null;

  const [, year, month, day, hour, minute] = matched.map(Number);
  const days = Date.UTC(year, month - 1, day) / (1000 * 60 * 60 * 24);
  return days * 24 * 60 + hour * 60 + minute;
}

/**
 * 从潮汐表推算当前潮位 / 涨退 / 潮差 / 距下一潮小时数。
 *
 * 取表头两条：tideTable 是后端按时间排好的潮汐序列，
 * 第一条即当前潮位，第二条即下一潮。
 */
export function deriveTideMeta(tideData: TideData | null): TideMeta {
  const table = tideData?.tideTable;
  if (!table || !table.length) return { ...TIDE_FALLBACK };

  const current = table[0];
  const next = table[1];

  const rawLevel = Number(current.height);
  const level = Number.isFinite(rawLevel) ? rawLevel : TIDE_FALLBACK.level;

  // 表中 H=高潮（过后转退潮），L=低潮（过后转涨潮）
  const type: '涨潮' | '退潮' = current.type === 'H' ? '退潮' : '涨潮';

  if (!next) {
    return {
      level,
      type,
      range: TIDE_FALLBACK.range,
      hoursToNext: TIDE_FALLBACK.hoursToNext,
    };
  }

  const nextLevel = Number(next.height);
  const currentTime = minutesSinceEpoch(current.fxTime);
  const nextTime = minutesSinceEpoch(next.fxTime);

  const hoursToNext =
    currentTime !== null && nextTime !== null ? (nextTime - currentTime) / 60 : TIDE_FALLBACK.hoursToNext;

  return {
    level,
    type,
    range: Number.isFinite(nextLevel) ? Math.abs(nextLevel - level) : TIDE_FALLBACK.range,
    hoursToNext,
  };
}

/**
 * 拼出鱼口反馈的提交载荷。
 *
 * 缺的气象项按后端的默认口径兜底（温度 20、湿度 50、气压 1013、风 0、
 * 降水 0、官方钓鱼指数 2、潮位 1.5、涨潮、潮差 1.5、距下一潮 3 小时）——
 * 与旧反馈表单一致：宁可给一个中性值，也不要让后端拿零值当真值算分
 * （气压 0 会把气压分项直接打成 0）。
 *
 * 天气快照优先用记录里那份 —— 用户手改过的那份才是「当时」的。
 */
export function buildFishingFeedbackPayload(input: {
  /** 用户选的那一档 */
  level: FishingFeedbackLevel;
  /** 钓点 id。没有关联钓点时传 'default' */
  locationId: string;
  /** 地点名 */
  locationName: string;
  /** 钓鱼时间，RFC3339 */
  fishingTime: string;
  /** 天气快照。整份缺字段就按上面的默认口径兜底 */
  weather?: FishingLogWeather | null;
}): FishingFeedbackPayload {
  const w = input.weather ?? {};

  return {
    location_id: input.locationId,
    location_name: input.locationName,
    fishing_time: input.fishingTime,
    feedback: input.level,

    temperature: finiteOr(w.temperature, 20),
    humidity: finiteOr(w.humidity, 50),
    pressure: finiteOr(w.pressure, 1013),
    wind_speed: finiteOr(w.wind_speed, 0),
    precipitation: finiteOr(w.precipitation, 0),
    indices: finiteOr(w.indices, 2),

    tide_level: finiteOr(w.tide_level, 1.5),
    tide_type: w.tide_type === '退潮' ? '退潮' : '涨潮',
    tide_range: finiteOr(w.tide_range, 1.5),
    hours_to_next_tide: finiteOr(w.hours_to_next_tide, 3),
  };
}

/**
 * 数字兜底。
 *
 * 用 `Number.isFinite` 而不是 `||`：0 对风速、降水、潮差都是合法值，
 * `||` 会把它们换成兜底值 —— 那等于往模型里塞一条假数据。
 */
function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}
