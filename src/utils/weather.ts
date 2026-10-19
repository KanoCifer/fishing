/**
 * 天气图标映射。
 *
 * 用和风图标字体（qweather-icons 子集）而不是 emoji：
 * - emoji 由系统字形渲染，iOS 走 Apple Color Emoji、安卓走 Noto Color Emoji，
 *   同一段代码两端长相不同，且 `⛅` / `⛈️` 这类带变体选择符的字形在部分机型上
 *   会掉色或缺字；字体方案两端完全一致，还能跟着 `tone` 变色。
 * - 字体子集（60 字形 / base64 后 35 KB）内联在包里，零网络请求、零加载延迟，
 *   渲染由本地字形完成，不受弱网影响。
 *
 * 判据从「按 `text` 中文描述做子串匹配」换成「按 `icon` 字段的数字编码」：
 * 字体的 glyph 名与编码一一对应（`qi-104` → U+F105），多一层关键词表就多一处
 * 会错的地方，而且那种表看不出覆盖是否完整。这里用区间白名单，
 * 不在白名单内的码统一落到 999「未知」，从根上避免渲染出豆腐块。
 *
 * 白名单区间必须与 `src/styles/qweather-icons.css` 的字体子集严格一致
 * —— 那边的区间由 `scripts/subset-qweather-icons.py` 生成，两边对不上就是豆腐块。
 */

/** 兜底码：和风的「未知」字形，字体子集里保留着 */
export const FALLBACK_ICON_CODE = '999';

/**
 * 字体子集里存在的天气码区间。
 *
 * 只覆盖天气现象：不含月相(1xxx)、预警(2xxx)、彩色 fill 变体。
 * 与 `scripts/subset-qweather-icons.py` 的 RANGES 一一对应，改一处必须改另一处。
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
  if (!level) return '钓鱼指数计算中';
  return VERDICT_BY_LEVEL[level] ?? '钓鱼指数计算中';
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
