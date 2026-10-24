/**
 * 和风天气新一代 → 视图模型 的归一。
 *
 * 为什么有这一层：和风新一代接口（/weather/v1/*）把数值和单位拆开
 * （`{ value, unit }`）、把风向风速嵌套成对象、湿度和云量给 [0,1] 的比例，
 * 一天还拆成白天 / 夜间两段。而组件（WeatherCard / VerdictOverview / WeekStrip …）
 * 和 AI 分析载荷要的一直是「扁平 + 全字符串」的视图模型。
 *
 * 换算全在这一处做，store 边界调用一次，组件和 AI 载荷一行都不用改 ——
 * 后端 `app/schemas/aiagent.py` 认的仍是 `liveWeather.temp` 这种扁平字段。
 *
 * 只认新版。旧一代（v7 的扁平字符串 + `current.now` / `daily.daily` 包装）
 * 不再解析：留着兼容分支只会把「形状不对」变成静默的空值，
 * 而不是一眼可见的问题 —— 形状错了就该响。
 *
 * 换算口径（与后端专家模型、姊妹实现 kanocifer-chat-frontend 保持一致）：
 * - 温度 / 体感 / 降水 / 气压 / 露点 → 数值字符串（最多 1 位小数）
 * - humidity / cloudCover            → [0,1] 比例 × 100
 * - wind.speed / windGust            → m/s → km/h（视图模型口径是 km/h）
 * - precipitation.probability        → [0,1] 比例 × 100
 * - visibility                       → m → km
 * - wind.direction.compass           → 16 方位代码 → 中文风向
 * - astro.moonPhase                  → 'waxing-gibbous' → '盈凸月'
 * - uvIndex                          → 原样透传（上游给的就是整数档位）
 * - daily                            → 拆 daytime / nighttime 两段
 */

import { parseFxTime } from '@/utils/date';
import type {
  WeatherCurrentV1,
  WeatherDailyBlockV1,
  WeatherDay,
  WeatherDayV1,
  WeatherHourly,
  WeatherHourlyBlockV1,
  WeatherHourlyV1,
  WeatherIndex,
  WeatherNow,
} from '@/types/fishing';

// ---------------------------------------------------------------------------
// 基础取值
// ---------------------------------------------------------------------------

/**
 * 数值 → 展示字符串：最多 1 位小数，去掉尾随 0。
 *
 * 29 → "29"，32.6 → "32.6"，29.04 → "29"。
 * 取不到值时给空串而不是 "NaN" —— 模板里拼出来就是 "NaN°"，比空着更糟。
 *
 * 精度受浮点表示限制：32.55 在 IEEE754 里是 32.549999…，toFixed(1) 给 "32.5"。
 * 这是 toFixed 的行为，不是这里多舍了 —— 显示精度到 0.1°C，差这 0.05°C 没有意义。
 */
function fmtNum(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  const fixed = value.toFixed(1);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

/** 取「数值 + 单位」二元组里的数值 */
function measure(input: { value?: number } | undefined): number | undefined {
  const value = input?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 数字 → 字符串。0 是有效值，不能被当成缺失顶掉 */
function toStr(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return String(value);
}

/** [0,1] 比例 → 百分数（0.53 → 53） */
function ratioToPercent(ratio: number | undefined): number | undefined {
  if (ratio === undefined || !Number.isFinite(ratio)) return undefined;
  return Math.round(ratio * 100);
}

/**
 * 风速统一到 km/h。
 *
 * 视图模型的风速口径是 km/h：WeatherCard 按它除 3.6 显示 m/s，
 * 后端专家模型的特征也按 km/h 调参。这里按上游给的 unit 换算，
 * 上游哪天把默认单位换了也不会算错。
 */
function toKmh(value: number | undefined, unit: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const u = (unit ?? '').toLowerCase();
  if (u.includes('km/h')) return value;
  if (u.includes('mph')) return value * 1.609344;
  return value * 3.6;
}

/** 能见度统一到 km（上游给 m） */
function toKm(value: number | undefined, unit: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const u = (unit ?? '').toLowerCase();
  if (u.includes('km')) return value;
  return value / 1000;
}

/**
 * 完整时间戳 → 当天时刻（'2026-10-21T06:25+08:00' → '06:25'）。
 *
 * 视图模型里日出日落这一组字段原本就是时刻（'06:30'），日期由 fxDate 承担，
 * 保留完整时间戳会让 AI 载荷的格式和旧版对不上，日后直接展示还会变成一长串 ISO 串。
 * 只切字符串不 new Date()：时间戳自带 +08:00，换算成设备时区会平移。
 */
function toTimeOfDay(value: string | undefined): string {
  if (!value) return '';
  return parseFxTime(value)?.time ?? '';
}

// ---------------------------------------------------------------------------
// 方位 / 月相
// ---------------------------------------------------------------------------

/** 16 方位代码 → 中文风向 */
const WIND_COMPASS_CN: Readonly<Record<string, string>> = {
  n: '北风',
  nne: '北偏东北风',
  ne: '东北风',
  ene: '东偏东北风',
  e: '东风',
  ese: '东偏东南风',
  se: '东南风',
  sse: '南偏东南风',
  s: '南风',
  ssw: '南偏西南风',
  sw: '西南风',
  wsw: '西偏西南风',
  w: '西风',
  wnw: '西偏西北风',
  nw: '西北风',
  nnw: '北偏西北风',
  none: '无持续风向',
  vrb: '风向不定',
};

/** 16 方位代码，按角度每 22.5° 一档排列 */
const COMPASS_16 = [
  'n',
  'nne',
  'ne',
  'ene',
  'e',
  'ese',
  'se',
  'sse',
  's',
  'ssw',
  'sw',
  'wsw',
  'w',
  'wnw',
  'nw',
  'nnw',
] as const;

/**
 * 风向 → 中文。
 *
 * 上游给的是 16 方位代码（'nne'），视图模型要中文（'北偏东北风'）。
 * 代码缺失时按角度反推 —— 上游偶尔只给角度不给代码。
 */
export function windCompassToChinese(compass?: string, degree?: number): string {
  const code = (compass ?? '').trim().toLowerCase();
  if (code && WIND_COMPASS_CN[code]) return WIND_COMPASS_CN[code] ?? '';

  if (degree !== undefined && Number.isFinite(degree)) {
    const normalized = ((degree % 360) + 360) % 360;
    const index = Math.round(normalized / 22.5) % COMPASS_16.length;
    return WIND_COMPASS_CN[COMPASS_16[index] ?? 'n'] ?? '';
  }

  return '';
}

/** 月相代码 → 中文 */
const MOON_PHASE_CN: Readonly<Record<string, string>> = {
  'new-moon': '新月',
  'waxing-crescent': '蛾眉月',
  'first-quarter': '上弦月',
  'waxing-gibbous': '盈凸月',
  'full-moon': '满月',
  'waning-gibbous': '亏凸月',
  'last-quarter': '下弦月',
  'waning-crescent': '残月',
};

/**
 * 月相 → 中文。
 *
 * 上游给代码（'waxing-gibbous'），视图模型要中文（'盈凸月'）。
 * 认不出的代码原样返回 —— 宁可给个英文代码，也别让月相那一格空着。
 */
export function moonPhaseToChinese(phase?: string): string {
  const code = (phase ?? '').trim();
  if (!code) return '';
  return MOON_PHASE_CN[code.toLowerCase()] ?? code;
}

// ---------------------------------------------------------------------------
// 实时天气
// ---------------------------------------------------------------------------

/**
 * 新版 current 块 → 视图模型。
 *
 * `fallbackObsTime` 是观测时刻的兜底：新版 current 块**没有**观测时间字段
 * （旧的 obsTime 没了），整块里唯一带时刻的是逐时预报的首条 forecastTime。
 * 它是上游逐时序列的第一个整点（实测 13:15 取数时首条为 14:00，即下一个整点），
 * 语义上是「数据覆盖的第一小时」，比留空让 VerdictHeader 的「更新时间」整段消失要好。
 */
export function normalizeWeatherCurrent(
  block: WeatherCurrentV1 | null | undefined,
  fallbackObsTime = '',
): WeatherNow | null {
  if (!block) return null;

  const condition = block.condition;
  const wind = block.wind;
  const direction = wind?.direction;
  const speed = wind?.speed;
  const amount = block.precipitation?.amount;
  const visibility = block.visibility;

  return {
    obsTime: fallbackObsTime,
    temp: fmtNum(measure(block.temperature)),
    feelsLike: fmtNum(measure(block.feelsLike)),
    icon: condition?.code ?? '',
    text: condition?.text ?? '',
    wind360: toStr(direction?.degree),
    windDir: windCompassToChinese(direction?.compass, direction?.degree),
    windScale: toStr(wind?.scale),
    windSpeed: fmtNum(toKmh(measure(speed), speed?.unit)),
    windGust: fmtNum(toKmh(measure(block.windGust), block.windGust?.unit)),
    humidity: fmtNum(ratioToPercent(block.humidity)),
    precip: fmtNum(amount?.value),
    precipIntensity: fmtNum(measure(block.precipitation?.intensity)),
    precipType: block.precipitation?.type ?? '',
    pressure: fmtNum(measure(block.pressure)),
    vis: fmtNum(toKm(measure(visibility), visibility?.unit)),
    cloud: fmtNum(ratioToPercent(block.cloudCover)),
    dew: fmtNum(measure(block.dewPoint)),
    uvIndex: toStr(block.uvIndex),
  };
}

// ---------------------------------------------------------------------------
// 逐时预报
// ---------------------------------------------------------------------------

/** 取逐时条目数组。块形（`{ hours: [...] }`）和裸数组都认 */
function hourlyEntries(input: WeatherHourlyBlockV1 | WeatherHourlyV1[] | null | undefined): WeatherHourlyV1[] {
  if (Array.isArray(input)) return input;
  return input?.hours ?? [];
}

/** 新版逐时条目 → 视图模型 */
function normalizeHour(item: WeatherHourlyV1): WeatherHourly {
  const condition = item.condition;
  const wind = item.wind;
  const direction = wind?.direction;
  const speed = wind?.speed;

  return {
    fxTime: item.forecastTime ?? '',
    temp: fmtNum(measure(item.temperature)),
    feelsLike: fmtNum(measure(item.feelsLike)),
    precip: fmtNum(item.precipitation?.amount?.value),
    precipProbability: fmtNum(ratioToPercent(item.precipitation?.probability)),
    humidity: fmtNum(ratioToPercent(item.humidity)),
    pressure: fmtNum(measure(item.pressure)),
    windDir: windCompassToChinese(direction?.compass, direction?.degree),
    windScale: toStr(wind?.scale),
    windSpeed: fmtNum(toKmh(measure(speed), speed?.unit)),
    windGust: fmtNum(toKmh(measure(item.windGust), item.windGust?.unit)),
    text: condition?.text ?? '',
    icon: condition?.code ?? '',
    cloud: fmtNum(ratioToPercent(item.cloudCover)),
    vis: fmtNum(toKm(measure(item.visibility), item.visibility?.unit)),
    dew: fmtNum(measure(item.dewPoint)),
    uvIndex: toStr(item.uvIndex),
  };
}

/** 新版逐时块 → 视图模型数组 */
export function normalizeWeatherHourly(
  input: WeatherHourlyBlockV1 | WeatherHourlyV1[] | null | undefined,
): WeatherHourly[] {
  return hourlyEntries(input).map(normalizeHour);
}

// ---------------------------------------------------------------------------
// 每日预报
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

/**
 * 当天的日期。
 *
 * 取值都是带 +08:00 的完整时间戳，切前 10 位就是当地日期 ——
 * 不 new Date()，理由同 `utils/date.ts`：换算成设备时区会整体平移。
 */
function dayDate(
  day: WeatherDayV1,
  daytime: WeatherDayV1['daytime'],
  nighttime: WeatherDayV1['nighttime'],
  astro: WeatherDayV1['astro'],
): string {
  const candidates = [
    day.forecastStartTime,
    daytime?.forecastStartTime,
    nighttime?.forecastStartTime,
    astro?.sunrise,
    day.forecastEndTime,
  ];

  for (const candidate of candidates) {
    const matched = DATE_PATTERN.exec(candidate ?? '');
    if (matched) return matched[1] ?? '';
  }

  return '';
}

/**
 * 当天的气压与能见度 —— 从同一天的逐时数据取均值。
 *
 * 新版日预报块**不含**气压和能见度（上游 /weather/v1/daily 就没有这两项），
 * 旧一代日预报是有的，视图模型里这两个字段得留着。
 * 唯一的真实来源是逐时块里同一日期的那些小时 —— 按当天取均值，
 * 比编一个固定值诚实。该日没有逐时数据时留空（视模型允许空串）。
 */
function aggregateDayMetrics(fxDate: string, hours: WeatherHourlyV1[]): { pressure: string; vis: string } {
  if (!fxDate) return { pressure: '', vis: '' };

  const sameDay = hours.filter((hour) => (hour.forecastTime ?? '').startsWith(fxDate));
  if (!sameDay.length) return { pressure: '', vis: '' };

  const pressures = sameDay
    .map((hour) => measure(hour.pressure))
    .filter((value): value is number => value !== undefined);
  const visibilities = sameDay
    .map((hour) => toKm(measure(hour.visibility), hour.visibility?.unit))
    .filter((value): value is number => value !== undefined);

  const mean = (values: number[]): number | undefined =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

  return {
    pressure: fmtNum(mean(pressures)),
    vis: fmtNum(mean(visibilities)),
  };
}

/** 新版日预报条目 → 视图模型 */
function normalizeDay(day: WeatherDayV1, hours: WeatherHourlyV1[]): WeatherDay {
  const astro = day.astro;
  const daytime = day.daytime;
  const nighttime = day.nighttime;

  const dayWind = daytime?.wind;
  const nightWind = nighttime?.wind;
  const dayDirection = dayWind?.direction;
  const nightDirection = nightWind?.direction;
  const daySpeed = dayWind?.speed;
  const nightSpeed = nightWind?.speed;
  const dayCondition = daytime?.condition;
  const nightCondition = nighttime?.condition;

  // 全天高低温以日块为准；日块缺了才退到时段里取
  const tempMax = measure(day.temperatureMax) ?? measure(daytime?.temperatureMax) ?? measure(nighttime?.temperatureMax);
  const tempMin = measure(day.temperatureMin) ?? measure(daytime?.temperatureMin) ?? measure(nighttime?.temperatureMin);

  const fxDate = dayDate(day, daytime, nighttime, astro);
  const daily = aggregateDayMetrics(fxDate, hours);

  return {
    fxDate,
    sunrise: toTimeOfDay(astro?.sunrise),
    sunset: toTimeOfDay(astro?.sunset),
    civilDawn: toTimeOfDay(astro?.civilDawn),
    civilDusk: toTimeOfDay(astro?.civilDusk),
    solarNoon: toTimeOfDay(astro?.solarNoon),
    moonrise: toTimeOfDay(astro?.moonrise),
    moonset: toTimeOfDay(astro?.moonset),
    moonTransit: toTimeOfDay(astro?.moonTransit),
    moonUnderfoot: toTimeOfDay(astro?.moonUnderfoot),
    moonPhase: moonPhaseToChinese(astro?.moonPhase),
    moonPhaseCode: astro?.moonPhase ?? '',
    tempMax: fmtNum(tempMax),
    tempMin: fmtNum(tempMin),
    tempAvg: fmtNum(measure(day.temperatureAvg)),
    iconDay: dayCondition?.code ?? '',
    textDay: dayCondition?.text ?? '',
    iconNight: nightCondition?.code ?? '',
    textNight: nightCondition?.text ?? '',
    wind360Day: toStr(dayDirection?.degree),
    windDirDay: windCompassToChinese(dayDirection?.compass, dayDirection?.degree),
    windScaleDay: toStr(dayWind?.scale),
    windSpeedDay: fmtNum(toKmh(measure(daySpeed), daySpeed?.unit)),
    windGustDay: fmtNum(toKmh(measure(daytime?.windGustMax), daytime?.windGustMax?.unit)),
    wind360Night: toStr(nightDirection?.degree),
    windDirNight: windCompassToChinese(nightDirection?.compass, nightDirection?.degree),
    windScaleNight: toStr(nightWind?.scale),
    windSpeedNight: fmtNum(toKmh(measure(nightSpeed), nightSpeed?.unit)),
    windGustNight: fmtNum(toKmh(measure(nighttime?.windGustMax), nighttime?.windGustMax?.unit)),
    // 湿度 / 降水 / 云量以白天段为准（钓鱼看的就是白天），夜里没有就退到夜间段
    humidity: fmtNum(ratioToPercent(daytime?.humidity ?? nighttime?.humidity)),
    precip: fmtNum(daytime?.precipitation?.amount?.value ?? nighttime?.precipitation?.amount?.value),
    precipProbability: fmtNum(
      ratioToPercent(daytime?.precipitation?.probability ?? nighttime?.precipitation?.probability),
    ),
    pressure: daily.pressure,
    vis: daily.vis,
    cloud: fmtNum(ratioToPercent(daytime?.cloudCover ?? nighttime?.cloudCover)),
    uvIndexMax: toStr(day.uvIndexMax),
  };
}

/** 取日预报条目数组。块形（`{ days: [...] }`）和裸数组都认 */
function dailyEntries(input: WeatherDailyBlockV1 | WeatherDayV1[] | null | undefined): WeatherDayV1[] {
  if (Array.isArray(input)) return input;
  return input?.days ?? [];
}

/**
 * 新版日预报 → 视图模型数组。
 *
 * `hours` 是同一次响应里的逐时条目，气压和能见度要从那里取（见 `aggregateDayMetrics`）。
 */
export function normalizeWeatherDaily(
  input: WeatherDailyBlockV1 | WeatherDayV1[] | null | undefined,
  hours: WeatherHourlyV1[] = [],
): WeatherDay[] {
  return dailyEntries(input).map((day) => normalizeDay(day, hours));
}

// ---------------------------------------------------------------------------
// 生活指数（v7，尚无新版）
// ---------------------------------------------------------------------------

/**
 * 取字符串字段，数字也转成字符串。
 *
 * v7 给的是字符串（level: "3"），但同一字段别处可能给数字 —— 统一成字符串，
 * 免得 AI 载荷里 level 有时是 "3" 有时是 3，后端读入侧还得再判一次类型。
 */
function strField(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * 生活指数 → 视图模型数组。
 *
 * 和风生活指数至今只有 v7（`/v7/indices/1d`），没跟着天气接口换代 ——
 * 所以这一块的字段本来就是扁平的，与视图模型 `WeatherIndex` 一一对应，
 * 不像天气三块那样要换算。这里只做两件事：值统一成字符串、空条目丢掉。
 *
 * 丢掉空条目的理由跟后端一致：既没名称也没档位的条目对模型没有信息量，
 * 留着只会让提示词里多一行空壳。
 */
export function normalizeWeatherIndices(input: unknown): WeatherIndex[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item): WeatherIndex | null => {
      if (typeof item !== 'object' || item === null) return null;
      const row = item as Record<string, unknown>;
      const name = strField(row.name);
      const level = strField(row.level);
      if (!name && !level) return null;

      return {
        date: strField(row.date),
        type: strField(row.type),
        name,
        level,
        category: strField(row.category),
        text: strField(row.text),
      };
    })
    .filter((item): item is WeatherIndex => item !== null);
}

// ---------------------------------------------------------------------------
// 整包
// ---------------------------------------------------------------------------

/** 归一后的天气三块 —— store 直接用这三样填状态 */
export interface NormalizedWeather {
  now: WeatherNow | null;
  hourly: WeatherHourly[];
  daily: WeatherDay[];
}

/**
 * enriched 响应里的天气三块 → 视图模型。
 *
 * 三块的换算在这一处串起来，因为它们互相有依赖：
 * - current 没有观测时刻，要拿逐时首条的 forecastTime 兜底
 * - daily 的气压和能见度要从逐时里取
 *
 * 容器形态上，current 是块、daily 是数组、hourly 是带 hours 的块 ——
 * 数组和块两种形态都认，省得后端哪天换个包装方式前端就整块空掉。
 */
export function normalizeWeatherPayload(input: {
  current?: WeatherCurrentV1 | null;
  hourly?: WeatherHourlyBlockV1 | WeatherHourlyV1[] | null;
  daily?: WeatherDailyBlockV1 | WeatherDayV1[] | null;
}): NormalizedWeather {
  const rawHours = hourlyEntries(input.hourly);
  const hourly = rawHours.map(normalizeHour);
  const daily = dailyEntries(input.daily).map((day) => normalizeDay(day, rawHours));
  const now = normalizeWeatherCurrent(input.current, hourly[0]?.fxTime ?? '');

  return { now, hourly, daily };
}
