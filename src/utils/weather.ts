/**
 * 天气图标与外观组的映射 —— 天气码只有这一张表。
 *
 * 用 Meteocons 的彩色 SVG（烧成 data URI）而不是 emoji：
 * - emoji 由系统字形渲染，iOS 走 Apple Color Emoji、安卓走 Noto Color Emoji，
 *   同一段代码两端长相不同，且 `⛅` / `⛈️` 这类带变体选择符的字形在部分机型上
 *   会掉色或缺字。
 * - SVG 是矢量：逐时预报那 24 个格子、当前天气的大图标、月相是三种尺寸，
 *   同一份数据缩放过去不糊；PNG 进去就把尺寸定死了。
 * - 数据 URI 跟着代码包走：零网络请求、零加载延迟，野外弱网下也是立刻出图。
 *
 * 判据从「按 `text` 中文描述做子串匹配」换成「按 `icon` 字段的数字编码」：
 * 多一层关键词表就多一处会错的地方，而且那种表看不出覆盖是否完整。
 * 这里用区间表，不在表内的码统一落到兜底云。
 *
 * 图标名取自 `@meteocons/svg-static` 的文件名，与
 * `src/constants/weatherIcons.ts` 里生成的数据 URI 一一对应 ——
 * 那边少一个名字，这里就引用不到，那一格会退化成兜底云。
 */

import { WEATHER_ICON_FALLBACK, WEATHER_ICONS, type WeatherIconSlug } from '@/constants/weatherIcons';
import type { WeatherDay } from '@/types/fishing';
import type { ForecastDay, Label, Level, PressureLabel, PressureTone, Tone, WeatherGroup } from '@/types/view';

import { toFiniteNumber } from './number';
import { rainLevelOf } from './precip';

// ---------------------------------------------------------------------------
// 天气码
// ---------------------------------------------------------------------------

/**
 * 和风天气码 → 图标 + 外观组。
 *
 * **按区间归组，不按码名归组。** 和风改过码名：400 这一段在不同版本里是
 * 「雪 / 小雪 / 中雪」的不同排法。按名字建一张映射表，换个版本就对不上；
 * 按区间走则与名字无关。
 *
 * 一张表同时给图标与外观组：以前分成两张，两张认不出的码只要差一格，
 * 同一个天气就会「有配色没图标」或者「有图标没配色」。
 *
 * 区间取自 SUPPORTED_RANGES —— 字体子集里存在的码（68 个，与和风官方码表一致）。
 */
const WEATHER_CODE_RANGES: ReadonlyArray<readonly [number, number, WeatherIconSlug, WeatherGroup]> = [
  [100, 100, 'clear-day', 'sunny'], // 晴（昼）
  [101, 101, 'cloudy', 'cloudy'], // 多云
  [102, 103, 'partly-cloudy-day', 'cloudy'], // 少云 / 晴间多云
  [104, 104, 'overcast', 'overcast'], // 阴
  [150, 150, 'clear-night', 'night'], // 晴（夜）
  [151, 151, 'cloudy', 'night'], // 多云（夜）
  [152, 153, 'partly-cloudy-night', 'night'], // 少云 / 晴间多云（夜）
  [300, 300, 'rain', 'rain'], // 阵雨
  [301, 301, 'drizzle', 'rain'], // 小雨
  [302, 305, 'rain', 'rain'], // 中雨 ~ 特大暴雨
  [306, 306, 'hail', 'rain'], // 阵雨伴有冰雹
  [307, 312, 'rain', 'rain'], // 小阵雨 ~ 特大暴雨
  [313, 313, 'thunderstorms', 'rain'], // 雷阵雨
  [314, 314, 'thunderstorms-hail', 'rain'], // 雷阵雨伴有冰雹
  [315, 318, 'thunderstorms', 'rain'], // 雷阵雨
  [350, 351, 'rain', 'rain'], // 阵雨 / 小到中雨
  [399, 399, 'rain', 'rain'], // 雨
  [400, 403, 'snow', 'snow'], // 小雪 ~ 暴雪
  [404, 406, 'sleet', 'sleet'], // 雨夹雪 / 雨雪天气 / 阵雨夹雪
  [407, 410, 'snow', 'snow'], // 阵雪 ~ 大到暴雪
  [499, 499, 'snow', 'snow'], // 雪
  [500, 500, 'mist', 'dust'], // 薄雾
  [501, 501, 'fog', 'dust'], // 雾
  [502, 502, 'haze', 'dust'], // 霾
  [503, 504, 'dust', 'dust'], // 扬沙 / 浮尘
  [507, 509, 'dust', 'dust'], // 沙尘暴 ~ 特强沙尘暴
  [510, 510, 'fog', 'dust'], // 浓雾
  [511, 511, 'haze', 'dust'], // 中重度霾
  [512, 512, 'fog', 'dust'], // 大雾
  [513, 513, 'haze', 'dust'], // 霾
  [514, 515, 'dust', 'dust'], // 强浮尘 / 大浮尘
  [900, 900, 'sun-hot', 'hot'], // 热
  [901, 901, 'snowflake', 'cold'], // 冷
];

/**
 * 返回的是**认得出的**那一条，不是原样透传：接口字段是 `string`（"104"），
 * 缺字段、空串、非数字、以及表里没有的新码都落空。
 * 和风明确说过天气现象与图标会持续新增 —— 新码来得比图标快，
 * 所以这一层必须自己兜住。
 */
function lookupWeatherCode(icon: string | undefined | null): { slug: WeatherIconSlug; group: WeatherGroup } | null {
  const n = Number(icon);
  if (!Number.isInteger(n)) return null;

  for (const [lo, hi, slug, group] of WEATHER_CODE_RANGES) {
    if (n >= lo && n <= hi) return { slug, group };
  }

  return null;
}

/** 天气码 → 图标数据 URI，给 `<image>` 的 src 用 */
export function weatherIconUri(icon: string | undefined | null): string {
  const slug = lookupWeatherCode(icon)?.slug ?? WEATHER_ICON_FALLBACK;
  return WEATHER_ICONS[slug];
}

/**
 * 和风 `icon` 字段 → 天气外观组。
 *
 * 认不出的码落「通用」组。通用样式不带天气色，但**读数照常显示** ——
 * 缺的是外观，不是数据（和风官方明说天气现象与图标会持续新增，
 * 每来一个新码就配一套颜色是配不完的）。
 *
 * 上游给 999（它自己说不知道）也是这一组。
 */
export function weatherGroup(icon: string | undefined | null): WeatherGroup {
  return lookupWeatherCode(icon)?.group ?? 'generic';
}

// ---------------------------------------------------------------------------
// 月相
// ---------------------------------------------------------------------------

/**
 * 月相代码 → Meteocons 月相图标名。
 *
 * 上游 `astro.moonPhase` 给的是英文代码（'waxing-gibbous'），
 * Meteocons 的月相图标用文件名（'moon-waxing-gibbous'）—— 8 个码一一对上，
 * 中间隔着一次查表。
 */
const MOON_PHASE_SLUGS: Readonly<Record<string, WeatherIconSlug>> = {
  'new-moon': 'moon-new',
  'waxing-crescent': 'moon-waxing-crescent',
  'first-quarter': 'moon-first-quarter',
  'waxing-gibbous': 'moon-waxing-gibbous',
  'full-moon': 'moon-full',
  'waning-gibbous': 'moon-waning-gibbous',
  'last-quarter': 'moon-last-quarter',
  'waning-crescent': 'moon-waning-crescent',
};

/**
 * 认不出的月相返回空串（不是兜底云）：兜底云是「天气未知」那个图形，
 * 拿来当「月相未知」会画出一朵云 —— 那一格本来就该空着。
 */
export function moonPhaseIconUri(phase: string | undefined | null): string {
  const code = (phase ?? '').trim().toLowerCase();
  const slug = MOON_PHASE_SLUGS[code];
  if (!slug) return '';
  return WEATHER_ICONS[slug];
}

// ---------------------------------------------------------------------------
// 钓鱼等级
// ---------------------------------------------------------------------------

/**
 * 同一批等级词，两个维度放一张表：以前分成 `TONE_BY_LEVEL` 与
 * `VERDICT_BY_LEVEL` 两张，加一个等级词要改两处，漏一处就出现
 * 「颜色说有戏、结论说别去」。
 *
 * 色调那条色阶是五档，从好到差：**绿 → 蓝 → 橙 → 红 → 灰**。
 *
 * 为什么中间那档是蓝、不是黑：这条色阶要同时管两件事 —— 等级词（文字）
 * 和仪表弧（图形）。黑色当一档等于「没有颜色」：弧画出来是黑的，读的人
 * 拿不到任何颜色信号，只能回头去读那两个字；而这块弧本来就是整张卡上
 * 唯一的图形信号，一黑就把这个位置浪费掉了。
 *
 * 蓝正好卡在绿和橙中间，也正是这套设计的主色，插进色阶里不突兀。
 *
 * 用 CSS class 名而不是具体色值，组件里直接拼 class —— 小程序 scss 不支持
 * 运行时生成色值，而 class 拼接是静态可分析的。
 */
const LEVEL_META: Readonly<Record<string, { tone: Tone; verdict: string }>> = {
  极好: { tone: 'success', verdict: '今日爆护级别' },
  爆护: { tone: 'success', verdict: '今日爆护' },
  好: { tone: 'blue', verdict: '今日宜出钓' },
  一般: { tone: 'warning', verdict: '今日可一试' },
  差: { tone: 'destructive', verdict: '今日不宜出钓' },
  空军: { tone: 'muted', verdict: '今日恐空军' },
};

/** 等级词 → 语义色调 */
export function levelTone(level: string | undefined): Tone {
  if (!level) return 'muted';
  return LEVEL_META[level]?.tone ?? 'muted';
}

/**
 * 等级 → 一句话结论。把「数值」翻译成「该不该去」，是这块 UI 的落点。
 *
 * 走的是后端给的官方指数时以官方那条为准（见 pages/spot-detail/spot-conditions），
 * 这里是官方那条还没到时的兜底。
 */
export function levelVerdict(level: string | undefined): string {
  if (!level) return '鱼口概率计算中';
  return LEVEL_META[level]?.verdict ?? '鱼口概率计算中';
}

// ---------------------------------------------------------------------------
// 气压
// ---------------------------------------------------------------------------

/**
 * 气压分级。钓鱼上气压是核心变量之一：气压回升鱼口变好，
 * 持续走低通常意味着要空军。
 *
 * 只用到色阶里的四档 —— 气压没有「好」这一说，
 * 所以不套钓鱼等级那套 Tone，收窄成自己的子集。
 */
export function pressureLevel(pressure: number): {
  label: PressureLabel;
  tone: PressureTone;
} {
  if (pressure < 1000) return { label: '偏低', tone: 'warning' };
  if (pressure < 1020) return { label: '正常', tone: 'success' };
  if (pressure < 1030) return { label: '偏高', tone: 'warning' };
  return { label: '很高', tone: 'destructive' };
}

// ---------------------------------------------------------------------------
// 紫外线
// ---------------------------------------------------------------------------

/**
 * 档位切法和气象行业一致：0–2 弱、3–5 中等、6–7 强、8–10 很强、11 以上极强。
 * 钓鱼的人在这头站一整天，紫外线是「能待多久」的硬约束 ——
 * 指数 8 意味着不涂防晒两小时就会晒伤，比「晴不晴」更能左右出钓时间。
 */
export function uvLevel(uv: number): { label: string; tone: Tone } {
  if (uv < 3) return { label: '弱', tone: 'success' };
  if (uv < 6) return { label: '中等', tone: 'blue' };
  if (uv < 8) return { label: '强', tone: 'warning' };
  if (uv < 11) return { label: '很强', tone: 'destructive' };
  return { label: '极强', tone: 'destructive' };
}

// ---------------------------------------------------------------------------
// 降水
// ---------------------------------------------------------------------------

/**
 * 和风给的是英文代码（'rain' / 'snow' / 'sleet' / 'drizzle'）。
 * 认不出的代码原样返回 —— 宁可给个英文代码，也别让那一格空着。
 */
const PRECIP_TYPE_CN: Readonly<Record<string, string>> = {
  none: '无',
  rain: '雨',
  snow: '雪',
  sleet: '雨夹雪',
  drizzle: '毛毛雨',
};

export function precipTypeCn(type: string | undefined | null): string {
  const code = (type ?? '').trim().toLowerCase();
  if (!code) return '';
  return PRECIP_TYPE_CN[code] ?? code;
}

/**
 * 雨的部分走 `utils/precip` 的雨强表 —— 实况卡与分钟降水图说的是同一件事，
 * 两处各写一遍阈值迟早对不上。
 *
 * 雪与雨夹雪另给词 —— 它们的量级与雨不可比，
 * 拿雨强的线去判雪的大小会判出一个没意义的档。
 *
 * 色调说的是「还能不能钓」：中雨以上雨大到人待不住，
 * 对钓鱼的人是最该知道的一档。
 */
export function precipLevel(intensity: number | null, type: string | undefined): Level {
  const cn = precipTypeCn(type);

  if (cn === '毛毛雨') return { label: '毛毛雨', tone: 'muted' };
  if (cn === '雨夹雪') return { label: '雨夹雪', tone: 'muted' };

  if (cn === '雪') {
    if (intensity === null) return { label: '雪', tone: 'muted' };
    if (intensity < 1.5) return { label: '小雪', tone: 'muted' };
    if (intensity < 4) return { label: '中雪', tone: 'muted' };
    return { label: '大雪', tone: 'warning' };
  }

  if (intensity === null) return { label: '无降水', tone: 'muted' };
  return rainLevelOf(intensity) ?? { label: '无降水', tone: 'muted' };
}

// ---------------------------------------------------------------------------
// 实况读数的档位词
//
// 这些词回答的是同一个问题：这一格读数**怎么样**。
// 数值给的是「是多少」，档位词给的是「该不该在意」——
// 两个都摆，读者才不用自己拿量程去换算。
// ---------------------------------------------------------------------------

/**
 * 相对湿度 → 干爽程度。
 *
 * 40 与 70 两道线：40 以下空气干（皮肤、嘴唇难受），
 * 70 以上闷（汗不容易蒸发，体感温度高于实测）。
 */
export function humidityLevel(humidity: number): Level {
  if (humidity < 40) return { label: '干燥', tone: 'muted' };
  if (humidity <= 70) return { label: '舒适', tone: 'success' };
  return { label: '潮湿', tone: 'muted' };
}

/**
 * 能见度 → 优 / 良 / 差。
 *
 * 10km 以上是晴天该有的样子；4km 以下是雾、雨雪或夜色里的水面 ——
 * 钓鱼的人在这种能见度下看不见浮漂，也看不见对面的人。
 */
export function visibilityLevel(vis: number): Level {
  if (vis >= 10) return { label: '优', tone: 'success' };
  if (vis >= 4) return { label: '良', tone: 'muted' };
  return { label: '差', tone: 'warning' };
}

/**
 * 云量 → 晴 / 少云 / 多云 / 阴。
 *
 * 20 / 50 / 80 三道线，与气象上的云量分级一致：
 * 晴（≤20）少云（≤50）多云（≤80）阴。
 *
 * 不给色调：云量不是好坏，是天色。阴天未必比晴天差 ——
 * 对钓鱼来说阴天常常更好口，给它一个色阶等于替用户下了一个不该下的判断。
 */
export function cloudLevel(cloud: number): Label {
  if (cloud <= 20) return { label: '晴' };
  if (cloud <= 50) return { label: '少云' };
  if (cloud <= 80) return { label: '多云' };
  return { label: '阴' };
}

/**
 * 风速（持续风与阵风共用）→ 微风 / 和风 / 强风 / 大风。
 *
 * 按 m/s 分档，界线取蒲福风级的整数级。
 * 阵风单列一档是因为它跟持续风不是一件事：
 * 持续风 2 m/s 而阵风 12 m/s 的日子，竿子会被吹弯。
 */
export function windLevel(speed: number): Level {
  if (speed < 3.4) return { label: '微风', tone: 'muted' };
  if (speed < 8) return { label: '和风', tone: 'muted' };
  if (speed < 13.9) return { label: '强风', tone: 'warning' };
  return { label: '大风', tone: 'destructive' };
}

/**
 * 露点 → 凉爽 / 舒适 / 偏闷 / 闷热。
 *
 * 露点是「汗会不会停下来」的读数：
 * 同样 30°，露点 12° 是能扛住的下午，露点 26° 是坐着都黏。
 */
export function dewLevel(dew: number): Level {
  if (dew < 10) return { label: '凉爽', tone: 'muted' };
  if (dew < 16) return { label: '舒适', tone: 'success' };
  if (dew < 21) return { label: '偏闷', tone: 'muted' };
  return { label: '闷热', tone: 'warning' };
}

// ---------------------------------------------------------------------------
// 官方生活指数
// ---------------------------------------------------------------------------

/**
 * 按档位文字分，不按 level 数字分：和风的 level 是它自己的编号，
 * 跟「适宜 / 较适宜 / 较不宜 / 不宜」不是一套顺序，凭数字猜迟早猜错。
 * 文字是给人看的口径，也是界面上真正要显示的那一份。
 */
export function indexCategoryTone(category: string | undefined | null): Tone {
  switch ((category ?? '').trim()) {
    case '适宜':
      return 'success';
    case '较适宜':
      return 'blue';
    case '较不宜':
      return 'warning';
    case '不宜':
      return 'destructive';
    default:
      return 'muted';
  }
}

// ---------------------------------------------------------------------------
// 预报日
// ---------------------------------------------------------------------------

/** 取数阶段的形状：高低温还没排除空值 */
interface ForecastDayRaw {
  fxDate: string;
  max: number | null;
  min: number | null;
  icon: string;
  prob: number;
}

/**
 * 只留高低温都有值的那几天 —— 缺一个读数的那天占一行，那一行就只剩半个信息。
 *
 * 为什么收在这里而不是两张卡各判一次：
 * 两张卡都要说「今天」，而「今天」不是接口的第一条 —— 头一天要是脏数据
 * 整条被丢掉，剩下的第一行才是今天。各判各的，早晚出现一张卡说今天、
 * 另一张卡说昨天。
 *
 * 高低温是数字而不是字符串：两张卡都要拿它拼「°」和比大小，
 * 换算留在这一层，换完就是能直接显示的数。取整也在这一层 ——
 * 预报给的是「22.6°」这样的读数，界面上要的是「23°」。
 * 小数对钓鱼的人没有意义（钓鱼的人看的是「今天冷不冷」，不是 0.4 度的差别），
 * 而多一位小数只会把两列数字挤在一起。
 */
export function forecastDays(days: WeatherDay[]): ForecastDay[] {
  const rows: ForecastDayRaw[] = days.map((day) => {
    const prob = toFiniteNumber(day.precipProbability);
    const max = toFiniteNumber(day.tempMax);
    const min = toFiniteNumber(day.tempMin);

    return {
      fxDate: day.fxDate,
      max: max === null ? null : Math.round(max),
      min: min === null ? null : Math.round(min),
      icon: day.iconDay,
      prob: prob !== null && prob > 0 ? prob : 0,
    };
  });

  return rows.filter((day): day is ForecastDay => day.max !== null && day.min !== null);
}

/**
 * 「今天」是哪一天 —— 唯一真源在 forecastDays，这里给出它的日期键。
 *
 * 返回的是归一后**第一行**的日期（fxDate），不是设备当前日期。
 *
 * 为什么不是设备日期：接口给的是「今天起」的序列，设备时区与后端 +08:00
 * 不一致时，设备日期可能落在序列之外 —— 那时「今天」就变成了「序列里的哪天」，
 * 两张卡会各说各的。走归一后的第一行，头图、多日预报、日照与月相说的
 * 是同一天。
 */
export function todayForecastDate(days: WeatherDay[]): string | null {
  return forecastDays(days)[0]?.fxDate ?? null;
}
