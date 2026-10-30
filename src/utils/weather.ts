/**
 * 天气图标映射。
 *
 * 用和风图标字体（qweather-icons 子集）而不是 emoji：
 * - emoji 由系统字形渲染，iOS 走 Apple Color Emoji、安卓走 Noto Color Emoji，
 *   同一段代码两端长相不同，且 `⛅` / `⛈️` 这类带变体选择符的字形在部分机型上
 *   会掉色或缺字；字体方案两端完全一致，还能跟着 `tone` 变色。
 * - 字体子集（68 字形 / base64 后 36 KB）内联在包里，零网络请求、零加载延迟，
 *   渲染由本地字形完成，不受弱网影响。
 *
 * 判据从「按 `text` 中文描述做子串匹配」换成「按 `icon` 字段的数字编码」：
 * 字体的 glyph 名与编码一一对应（`qi-104` → U+F105），多一层关键词表就多一处
 * 会错的地方，而且那种表看不出覆盖是否完整。这里用区间白名单，
 * 不在白名单内的码统一落到 999「未知」，从根上避免渲染出豆腐块。
 *
 * 白名单区间必须与 `src/styles/generated/qweather-icons.css` 的字体子集严格一致
 * —— 那边的区间由 `scripts/subset-qweather-icons.py` 生成，两边对不上就是豆腐块。
 */

import type { WeatherDay } from '@/types/fishing';

/** 兜底码：和风的「未知」字形，字体子集里保留着 */
export const FALLBACK_ICON_CODE = '999';

/**
 * 字体子集里存在的天气码区间。
 *
 * 只覆盖天气现象：不含预警(2xxx)、天文细节(1xxx)、彩色 fill 变体。
 * 月相(800-807)不在这里 —— 它走下面那张 MOON_PHASE_ICON_CODES 表。
 *
 * 与 `scripts/subset-qweather-icons.py` 的 RANGES 必须严格一致
 * （本表的并集 MOON_PHASE_ICON_CODES 的值域 = RANGES），
 * 不一致就是「字体里没有的字形」，那边会渲染出豆腐块。
 */
const SUPPORTED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [100, 104], // 白天：晴 / 多云 / 少云 / 晴间多云 / 阴
  [150, 153], // 夜间：晴夜 / 多云夜 / 少云夜 / 晴间多云夜（和风官方码表，文档 condition 表里没列）
  [300, 318], // 阵雨 ~ 特大暴雨
  [350, 351], // 小雨 / 中雨
  [399, 410], // 雨 / 雪 / 雨夹雪 / 暴雪
  [499, 504], // 雪 / 薄雾 / 雾 / 霾 / 扬沙 / 浮尘
  [507, 515], // 沙尘暴 / 浓雾 / 中重度霾 / 大雾
  [900, 901], // 热 / 冷
  [999, 999], // 未知
];

/** 字体子集里是否存在该码 */
function isSupportedCode(n: number): boolean {
  return SUPPORTED_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

/**
 * 和风 `icon` 字段 → 字体 class 后缀。
 *
 * 返回的是**受支持的**编码，不是原样透传：接口字段是 `string`（"104"），
 * 缺字段、空串、非数字、以及字体里没有的新码都会落到 999。
 * 和风明确说过天气现象与图标会持续新增，所以在渲染前必须过这道白名单 ——
 * 未知 class 不会被静默忽略，而是照实画出一个豆腐块。
 */
export function weatherIconCode(icon: string | undefined | null): string {
  if (icon === undefined || icon === null || icon === '') return FALLBACK_ICON_CODE;

  const n = Number(icon);
  if (!Number.isInteger(n) || !isSupportedCode(n)) return FALLBACK_ICON_CODE;

  return String(n);
}

/** 天气码 → 图标 class，如 `qi qi-104` */
export function weatherIconClass(icon: string | undefined | null): string {
  return `qi qi-${weatherIconCode(icon)}`;
}

// ---------------------------------------------------------------------------
// 天气外观组
// ---------------------------------------------------------------------------

/**
 * 天气外观组。
 *
 * 六十多个码在界面上只表现十种「看天」的印象 —— 同一组共用一套渐变与字色。
 *
 * 组名同时是**样式的一部分**：`CurrentWeather` 组件把它拼成 class 修饰符
 * （`current-weather--rain`），组件样式里同名的那条规则给出那套配色。
 * 两边靠组名对上，所以组名改一处要改两处 —— 拼错组名的表现是「这一组没有专属颜色」
 * （落回通用样式），不会白屏。
 *
 * 对应的配色见 `src/components/CurrentWeather/CurrentWeather.vue` 的 `--weather-*` 变量。
 */
export type WeatherGroup =
  | 'sunny'
  | 'cloudy'
  | 'night'
  | 'rain'
  | 'snow'
  | 'sleet'
  | 'dust'
  | 'hot'
  | 'cold'
  | 'generic';

/**
 * 码区间 → 外观组。
 *
 * **按区间归组，不按码名归组。** 和风改过码名：400 这一段在不同版本里是
 * 「雪 / 小雪 / 中雪」的不同排法。按名字建一张映射表，换个版本就对不上；
 * 按区间走则与名字无关。
 *
 * 区间取自 SUPPORTED_RANGES —— 字体子集里存在的码（68 个，与和风官方码表一致）。
 */
const WEATHER_GROUP_RANGES: ReadonlyArray<readonly [number, number, WeatherGroup]> = [
  [100, 100, 'sunny'], // 晴
  [101, 104, 'cloudy'], // 多云 / 少云 / 晴间多云 / 阴
  [150, 153, 'night'], // 夜间四类（晴夜 / 多云夜 / 少云夜 / 晴间多云夜）
  [300, 318, 'rain'], // 阵雨 ~ 特大暴雨
  [350, 351, 'rain'], // 小雨 / 中雨
  [399, 399, 'rain'], // 雨
  [400, 403, 'snow'], // 小雪 / 中雪 / 大雪 / 暴雪
  [404, 406, 'sleet'], // 雨夹雪 / 雨雪天气 / 阵雨夹雪
  [407, 410, 'snow'], // 阵雪 / 小到中雪 / 中到大雪 / 大到暴雪
  [499, 499, 'snow'], // 雪
  [500, 504, 'dust'], // 薄雾 / 雾 / 霾 / 扬沙 / 浮尘
  [507, 515, 'dust'], // 沙尘暴 / 浓雾 / 霾 / 大雾
  [900, 900, 'hot'], // 热
  [901, 901, 'cold'], // 冷
];

/**
 * 和风 `icon` 字段 → 外观组。
 *
 * 认不出的码落「通用」组。通用样式不带天气色，但**读数照常显示** ——
 * 缺的是外观，不是数据（和风官方明说天气现象与图标会持续新增，
 * 每来一个新码就配一套颜色是配不完的）。
 *
 * 上游给 999（它自己说不知道）也是这一组。
 */
export function weatherGroup(icon: string | undefined | null): WeatherGroup {
  const n = Number(icon);
  if (!Number.isInteger(n)) return 'generic';

  for (const [lo, hi, group] of WEATHER_GROUP_RANGES) {
    if (n >= lo && n <= hi) return group;
  }

  return 'generic';
}

// ---------------------------------------------------------------------------
// 月相
// ---------------------------------------------------------------------------

/**
 * 月相代码 → 和风月相图标码。
 *
 * 表来自和风官方《moon-phases.csv》：月相图标是 800-807 这一段，
 * API 的 `astro.moonPhase` 给的是英文代码（'waxing-gibbous'），
 * 两者要靠这张表对起来。官方表里还有南北半球两套（北半球亮面在右，
 * 南半球相反），这里取**北半球**那套 —— 本项目的用户都在北半球。
 *
 * 值域 800-807 必须在字体子集里，见 `scripts/subset-qweather-icons.py` 的 RANGES。
 */
const MOON_PHASE_ICON_CODES: Readonly<Record<string, string>> = {
  'new-moon': '800',
  'waxing-crescent': '801',
  'first-quarter': '802',
  'waxing-gibbous': '803',
  'full-moon': '804',
  'waning-gibbous': '805',
  'last-quarter': '806',
  'waning-crescent': '807',
};

/**
 * 月相 → 字体 class，如 `qi qi-803`。
 *
 * 认不出的月相返回空串（不是 999）：999 是「天气未知」那个字形，
 * 拿来当「月相未知」会画出一朵云 —— 那一格本来就该空着。
 */
export function moonPhaseIconClass(phase: string | undefined | null): string {
  const code = (phase ?? '').trim().toLowerCase();
  const icon = MOON_PHASE_ICON_CODES[code];
  if (!icon) return '';
  return `qi qi-${icon}`;
}

// ---------------------------------------------------------------------------
// 语义状态色
// ---------------------------------------------------------------------------

/**
 * 钓鱼等级 → 语义色调。
 *
 * 这条色阶是五档，从好到差：**绿 → 蓝 → 橙 → 红 → 灰**。
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
export type Tone = 'success' | 'blue' | 'warning' | 'destructive' | 'muted';

const TONE_BY_LEVEL: Readonly<Record<string, Tone>> = {
  极好: 'success',
  爆护: 'success',
  好: 'blue',
  一般: 'warning',
  差: 'destructive',
  空军: 'muted',
};

export function levelTone(level: string | undefined): Tone {
  if (!level) return 'muted';
  return TONE_BY_LEVEL[level] ?? 'muted';
}

/** 等级 → 一句话结论。把"数值"翻译成"该不该去"，是这块 UI 的落点 */
const VERDICT_BY_LEVEL: Readonly<Record<string, string>> = {
  极好: '今日爆护级别',
  爆护: '今日爆护',
  好: '今日宜出钓',
  一般: '今日可一试',
  差: '今日不宜出钓',
  空军: '今日恐空军',
};

export function levelVerdict(level: string | undefined): string {
  if (!level) return '鱼口概率计算中';
  return VERDICT_BY_LEVEL[level] ?? '鱼口概率计算中';
}

// ---------------------------------------------------------------------------
// 气压
// ---------------------------------------------------------------------------

export type PressureLabel = '偏低' | '正常' | '偏高' | '很高';

/**
 * 气压只用到色阶里的四档 —— 气压没有「好」这一说，
 * 所以不套钓鱼等级那套 Tone，收窄成自己的子集。
 */
export type PressureTone = 'success' | 'warning' | 'destructive' | 'muted';

/**
 * 气压分级。钓鱼上气压是核心变量之一：
 * 气压回升鱼口变好，持续走低通常意味着要空军。
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

/**
 * 和风的数值字段全是字符串（temp: "29"），消费点按需转。
 *
 * NaN 会一路渗进模板渲染成 "NaN°"，所以这里给个兜底：
 * 转不动时返回 null，让调用方走"暂无数据"分支。
 */
export function num(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// 紫外线
// ---------------------------------------------------------------------------

/**
 * 紫外线分级。
 *
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
 * 降水类型代码 → 中文。
 *
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

// ---------------------------------------------------------------------------
// 官方生活指数
// ---------------------------------------------------------------------------

/**
 * 官方生活指数的档位 → 色调。
 *
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

/**
 * 预报日 → 展示模型。
 *
 * 高低温是数字而不是字符串：两张卡都要拿它拼「°」和比大小，
 * 换算留在这一层，换完就是能直接显示的数。
 */
export interface ForecastDay {
  fxDate: string;
  max: number;
  min: number;
  /** 白天时段的天气码 */
  icon: string;
  /** 降水概率文案。概率为 0 时是空串 —— 整排都不下雨却每行都写「0%」是噪音 */
  probText: string;
}

/** 取数阶段的形状：高低温还没排除空值 */
interface ForecastDayRaw {
  fxDate: string;
  max: number | null;
  min: number | null;
  icon: string;
  probText: string;
}

/**
 * 有效的预报日。
 *
 * 只留高低温都有值的那几天 —— 缺一个读数的那天占一行，那一行就只剩半个信息。
 *
 * 为什么收在这里而不是两张卡各判一次：
 * 两张卡都要说「今天」，而「今天」不是接口的第一条 —— 头一天要是脏数据
 * 整条被丢掉，剩下的第一行才是今天。各判各的，早晚出现一张卡说今天、
 * 另一张卡说昨天。
 */
export function forecastDays(days: WeatherDay[]): ForecastDay[] {
  const rows: ForecastDayRaw[] = days.map((day) => {
    const prob = num(day.precipProbability);

    return {
      fxDate: day.fxDate,
      max: num(day.tempMax),
      min: num(day.tempMin),
      icon: day.iconDay,
      probText: prob !== null && prob > 0 ? `${prob}%` : '',
    };
  });

  return rows.filter((day): day is ForecastDay => day.max !== null && day.min !== null);
}
