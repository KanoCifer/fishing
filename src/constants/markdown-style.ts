/**
 * Markdown 渲染的标签默认样式。
 *
 * 为什么样式在这里而不是 SCSS：
 * rich-text 内部节点的 class 只有「包含它的那个自定义组件」的 WXSS 才吃得到，
 * 而 MarkdownView 的样式是 scoped 的（编译成 data-v 类），rich-text 内部的节点
 * 没有这个类，匹配不上。唯一不依赖选择器命中的入口是节点自己的内联 style。
 *
 * 所以这些值必须和 `src/styles/tokens/_color.scss` 的同名变量一致，理由和
 * `scripts/gen-icons.mjs` 的色板一样：CSS 变量传不进这里，只能写死十六进制。
 * 改色值两处都要动。
 *
 * 单位统一用 rpx：这是设计稿尺寸（750rpx = 屏宽），与项目其余部分一致。
 * 但 rpx 只在 WXSS 里有效 —— nodes 的内联 style 不走 WXSS 编译，rpx 写进去
 * 是不生效的无效值。所以下面存的是 rpx，渲染时统一换算成 px（见 markdownNodes.ts）。
 */

/** 弱化文字色。对应 _color.scss 的 $fish-muted-60 一档（iOS secondaryLabel）。 */
const MUTED = 'rgba(60, 60, 67, 0.6)';
/** 分隔线色。 */
const BORDER = 'rgba(60, 60, 67, 0.18)';
/** 链接与强调色。对应 $fish-blue-600。 */
const ACCENT = '#0062cc';
/** 代码底色。对应 $fish-fill 一档。 */
const CODE_BG = 'rgba(120, 120, 128, 0.12)';

/**
 * 正文样式。
 *
 * 行高 1.6 是为中文调的：中文方块字没有天然的升降部留白，
 * 行高低于 1.5 上下两行会贴在一起。
 */
const BODY = 'font-size: 28rpx; line-height: 1.6; color: #000000;';

/**
 * 标签默认样式表。
 *
 * 只列 AI 建议里真会出现的标签。表格也列了 —— rich-text 的 nodes 数组支持
 * table/thead/tbody/tr/th/td（受信任的 HTML 节点），所以表格照常渲染。
 */
export const MARKDOWN_TAG_STYLE: Record<string, string> = {
  p: BODY,

  // 标题：AI 输出里 h1/h2 用得多，h3 往下压到正文大小
  h1: 'font-size: 40rpx; line-height: 1.35; font-weight: 700; color: #000000; margin: 24rpx 0 12rpx 0;',
  h2: 'font-size: 36rpx; line-height: 1.4; font-weight: 600; color: #000000; margin: 20rpx 0 10rpx 0;',
  h3: 'font-size: 32rpx; line-height: 1.4; font-weight: 600; color: #000000; margin: 16rpx 0 8rpx 0;',
  h4: 'font-size: 28rpx; line-height: 1.4; font-weight: 600; color: #000000; margin: 16rpx 0 8rpx 0;',

  strong: 'font-weight: 600; color: #000000;',
  em: 'font-style: italic; color: #000000;',
  del: `text-decoration: line-through; color: ${MUTED};`,

  // 行内码：底色用次级填充，和代码块区分开
  code: `font-family: Menlo, Consolas, monospace; font-size: 28rpx; background-color: ${CODE_BG}; padding: 2rpx 8rpx; border-radius: 6rpx;`,

  // 代码块：整块底色 + 左侧竖线，读起来是「一段引文」而不是正文
  pre: `font-family: Menlo, Consolas, monospace; font-size: 24rpx; line-height: 1.5; background-color: ${CODE_BG}; padding: 20rpx 24rpx; border-radius: 12rpx; margin: 16rpx 0; border-left: 4rpx solid ${BORDER};`,

  blockquote: `color: ${MUTED}; border-left: 4rpx solid ${BORDER}; padding-left: 20rpx; margin: 16rpx 0;`,

  a: `color: ${ACCENT}; text-decoration: none;`,

  ul: 'margin: 12rpx 0; padding-left: 40rpx;',
  ol: 'margin: 12rpx 0; padding-left: 40rpx;',
  li: 'line-height: 1.6; margin: 6rpx 0;',

  hr: `border-top: 1rpx solid ${BORDER}; margin: 24rpx 0;`,

  // 表格：AI 基本不产出，但 rich-text 支持这些标签，照列免得真出现时挤成一团
  table: 'width: 100%; border-collapse: collapse; margin: 16rpx 0; font-size: 28rpx;',
  th: `font-weight: 600; border: 1rpx solid ${BORDER}; padding: 12rpx 16rpx;`,
  td: `border: 1rpx solid ${BORDER}; padding: 12rpx 16rpx;`,
};

/**
 * rpx → px。
 *
 * uni.upx2px 按当前屏幕宽度换算（750rpx = 屏宽），与 WXSS 里 rpx 的行为一致。
 */
function upx(rpx: number): number {
  return uni.upx2px(rpx);
}

/**
 * 把一段 CSS 声明里的 rpx 全部换成 px。
 *
 * 只认「数字 + rpx」这一种形态（可带小数、可带负号），
 * 不会碰颜色值、font-family 或其他单位。
 */
function rpxToPx(declarations: string): string {
  return declarations.replace(/(-?\d*\.?\d+)rpx/g, (_, value: string) => `${upx(Number(value))}px`);
}

/**
 * 换算后的样式表（rpx 已变 px）。
 *
 * 只算一次 —— 这张表是静态的，而 upx2px 要问一次屏幕尺寸。
 * 惰性求值：这个模块在 App 启动时就会被 import，那时不该同步问屏幕。
 */
let pxStyleCache: Record<string, string> | null = null;

/**
 * 取换算成 px 的标签样式表。
 *
 * 渲染时才调用（见 markdownNodes.ts），不在模块顶层求值 ——
 * 顶层求值等于在 App 启动阶段同步问一次屏幕尺寸。
 */
export function markdownTagStylePx(): Record<string, string> {
  if (!pxStyleCache) {
    pxStyleCache = {};
    for (const [tag, declarations] of Object.entries(MARKDOWN_TAG_STYLE)) {
      pxStyleCache[tag] = rpxToPx(declarations);
    }
  }
  return pxStyleCache;
}
