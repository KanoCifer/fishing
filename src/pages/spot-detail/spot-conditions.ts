/**
 * 钓点详情的钓况展示模型。
 *
 * 上游只给数值：「30 ℃」「1006 hPa」「南风 3 级」「19:00 满潮」。
 * 界面上要的是另一层东西 —— 「偏热」「可接受」「涨潮中 · 2 小时 9 分后」。
 * 这一层是**钓鱼语境下的本地判断**，不是上游的字段，所以它必须写在这里，
 * 不能内联进组件：否则同一份数据在详情页和数据页会说出两套话，
 * 改阈值的时候也不知道要改几处。
 *
 * 分工：
 * - 天气三块（温压风）的**数值**来自 `utils/weather-normalize` 归一后的视图模型，
 *   这里只做「数值 → 评价」这一步；
 * - 气压沿用 `utils/weather` 已有的 pressureLevel —— 项目里对气压的
 *   分级口径只有那一处，详情页不另立一套；
 * - 潮汐的「挑下一个满潮」沿用 `utils/tide`，这里只把它变成一句人话。
 */

import { parseFxTime } from '@/utils/date';
import { nextHighTideItem, tideTrend } from '@/utils/tide';
import { num, pressureLevel } from '@/utils/weather';
import type { FishingIndexLevel, TideData, WeatherNow } from '@/types/fishing';

/** 钓况四格。key 固定，顺序即展示顺序 */
export type SpotConditionKey = 'pressure' | 'wind' | 'temp' | 'tide';

export interface SpotConditionCell {
  key: SpotConditionKey;
  label: string;
  /** 主数值。取不到时给 '--'，不留空 */
  value: string;
  /** 单位。跟在数值后面的小字，没有就空串 */
  unit: string;
  /** 一句话评价 */
  status: string;
}

// ---------------------------------------------------------------------------
// 评价规则
// ---------------------------------------------------------------------------

/**
 * 气温分级。
 *
 * 钓鱼看的是「人在水边站多久」：12 月的 8 ℃ 和 7 月的 28 ℃ 同样不难受，
 * 但 30 ℃ 以上的夏天中午是实打实待不住（暴晒 + 高湿 + 溶氧下降）。
 * 档位取的是体感舒适度那套通行分界，不做更细的切分 ——
 * 四个档已经能把「今天去不去」这件事说清楚，再细就是噪音。
 */
function tempGrade(temp: number): string {
  if (temp < 5) return '太冷';
  if (temp < 12) return '偏冷';
  if (temp < 18) return '凉爽';
  if (temp < 26) return '适宜';
  if (temp < 32) return '偏热';
  return '闷热';
}

/**
 * 风力分级。
 *
 * 按蒲福风力等级（上游给的 scale）切，不按 km/h 切 ——
 * 「3 级风」是所有人都懂的，「风速 16.2 km/h」没人有直觉。
 * 钓鱼真正怕的是大风把竿子吹弯、把线拉出水面，所以 5 级以上直接判「不宜」。
 */
function windGrade(scale: number): string {
  if (scale <= 2) return '可接受';
  if (scale <= 4) return '偏大';
  return '不宜';
}

/** 「无持续风向」「风向不定」这类不该跟等级拼在一起 */
const NO_DIRECTION = /不定|持续/;

/**
 * 风向全称 → 短名。
 *
 * 视图模型给的是「北偏东北风」这种全称（见 weather-normalize 的 windCompassToChinese），
 * 五个字塞进 2×2 网格的一格里会换行，把那一格拉成两行高、上下都不齐。
 *
 * 短名按 16 方位折成「东北风」这种三字说法 —— 钓鱼关心的是风从哪来，
 * 「东北风」和「北偏东北风」指的是同一个方向。
 */
const WIND_DIRECTION_SHORT: Readonly<Record<string, string>> = {
  北风: '北风',
  北偏东北风: '东北风',
  东北风: '东北风',
  东偏东北风: '东北风',
  东风: '东风',
  东偏东南风: '东南风',
  东南风: '东南风',
  南偏东南风: '东南风',
  南风: '南风',
  南偏西南风: '西南风',
  西南风: '西南风',
  西偏西南风: '西南风',
  西风: '西风',
  西偏西北风: '西北风',
  西北风: '西北风',
  北偏西北风: '西北风',
};

/** 风向短名。无持续风向给空串，认不出的全称原样返回 */
function shortDirection(dir: string): string {
  const trimmed = dir.trim();
  if (!trimmed || NO_DIRECTION.test(trimmed)) return '';
  return WIND_DIRECTION_SHORT[trimmed] ?? trimmed;
}

/**
 * 距下一次满潮还有多久（小时）。
 *
 * 用 `Date.parse` 而不是切字符串：fxTime 自带 +08:00 偏移，
 * 带偏移的字符串按绝对时刻解析，跨时区也对得上 —— 这是唯一需要真正做
 * 算术的地方（挑「哪个是下一个满潮」在 utils/tide 里，仍然只切字符串）。
 */
function hoursUntil(fxTime: string): number | null {
  const target = Date.parse(fxTime);
  if (!Number.isFinite(target)) return null;
  return (target - Date.now()) / 3_600_000;
}

/** 时长 → 人话。不足一小时只报分钟，超过一小时才带小时 */
function waitText(hours: number | null): string {
  if (hours === null) return '时刻待定';
  if (hours <= 0) return '正在满潮';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分后`;
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes === 0 ? `${whole} 小时后` : `${whole} 小时 ${minutes} 分后`;
}

// ---------------------------------------------------------------------------
// 钓况四格
// ---------------------------------------------------------------------------

/**
 * 四格钓况。
 *
 * 顺序固定：气压 → 风力 → 气温 → 潮汐。
 * 前三格是「此刻的天气」，第四格是「下一次满潮」—— 时间轴上往后看的那一件。
 *
 * 取不到值时 value 给 '--'、status 给一句说明，不留空格：
 * 空着的格子会被读成「这个数据没有意义」，写清楚「暂无」才是同一件事。
 */
export function buildConditionCells(now: WeatherNow | null, tide: TideData | null): SpotConditionCell[] {
  const pressure = now ? num(now.pressure) : null;
  const temp = now ? num(now.temp) : null;
  const scale = now ? num(now.windScale) : null;

  const high = nextHighTideItem(tide);
  const trend = tideTrend(tide);
  const trendText = trend === 'rising' ? '涨潮中' : trend === 'falling' ? '退潮中' : '平潮';

  /*
   * 风力的评价行：方向 + 风力档位。
   *
   * 主数值只给等级数 —— 风向全称有五个字，跟数字挤在一格里会换行，
   * 把那一格拉成两行高、上下都不齐。方向挪到下面这行，跟档位一起读。
   */
  const windDir = now ? shortDirection(now.windDir) : '';
  const windStatus = scale === null ? '暂无风况' : windDir ? `${windDir} · ${windGrade(scale)}` : windGrade(scale);

  return [
    {
      key: 'pressure',
      label: '气压',
      value: pressure === null ? '--' : String(pressure),
      unit: 'hPa',
      status: pressure === null ? '暂无气压' : pressureLevel(pressure).label,
    },
    {
      key: 'wind',
      label: '风力',
      value: scale === null ? '--' : String(scale),
      unit: scale === null ? '' : '级',
      status: windStatus,
    },
    {
      key: 'temp',
      label: '气温',
      value: temp === null ? '--' : String(temp),
      unit: '℃',
      status: temp === null ? '暂无气温' : tempGrade(temp),
    },
    {
      key: 'tide',
      label: '潮汐',
      value: high ? (parseFxTime(high.fxTime)?.time ?? '--') : '--',
      unit: '',
      status: high ? `${trendText} · ${waitText(hoursUntil(high.fxTime))}` : '暂无潮汐',
    },
  ];
}

// ---------------------------------------------------------------------------
// 等级 → 适宜度
// ---------------------------------------------------------------------------

/**
 * 钓鱼等级 → 适宜度。
 *
 * 后端的 level 是「好 / 一般 / 差 / 空军」这套鱼口评级，
 * 界面上要的是「这个钓点现在值不值得去」—— 同一件事的两种说法。
 * 放在这儿是因为它跟四格评价是同一类东西：本地判断，不是上游字段。
 */
const SUITABILITY_TEXT: Readonly<Record<string, string>> = {
  极好: '很适宜',
  爆护: '很适宜',
  好: '较适宜',
  一般: '一般',
  差: '不宜',
  空军: '空军',
};

/** 适宜度徽标的色调档位。徽标是淡底 + 深字，小字才压得住 */
export type SuitabilityTone = 'ok' | 'warn' | 'bad';

const SUITABILITY_TONE: Readonly<Record<string, SuitabilityTone>> = {
  极好: 'ok',
  爆护: 'ok',
  好: 'ok',
  一般: 'warn',
  差: 'warn',
  空军: 'bad',
};

export function suitabilityText(level: FishingIndexLevel | string | undefined): string {
  return SUITABILITY_TEXT[level ?? ''] ?? '待定';
}

export function suitabilityTone(level: FishingIndexLevel | string | undefined): SuitabilityTone {
  return SUITABILITY_TONE[level ?? ''] ?? 'warn';
}

// ---------------------------------------------------------------------------
// 距离
// ---------------------------------------------------------------------------

/**
 * 地球平均半径（公里）。与后端 `util.EarthRadiusKm` 一致。
 */
const EARTH_RADIUS_KM = 6371;

/**
 * 两点间的大圆距离（公里）。
 *
 * 公式与后端 `util.DistanceKm` 逐项对齐（Haversine，R = 6371），
 * 半径取同一个值是有意的：列表页显示的距离是后端算的，
 * 详情页这一个是自己算的 —— 两处算法不一致的话，同一个钓点
 * 会在两个页面上显示两个距离，那种不一致比算得不准更难解释。
 */
export function distanceKm(from: [number, number], to: [number, number]): number {
  const toRad = Math.PI / 180;
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;

  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const lat1Rad = lat1 * toRad;
  const lat2Rad = lat2 * toRad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/** 距离 → 展示字符串 */
export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '距离未知';
  return `${km.toFixed(1)} km`;
}
