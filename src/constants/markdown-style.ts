/**
 * Markdown 渲染的标签默认样式。
 *
 * 为什么样式写在 TS 里而不是 SCSS：
 * mp-html 把内容渲染在它自己的组件内部，页面里写的 scoped 样式够不着那些节点；
 * 它自己的 WXSS 又排在后面，改不动。唯一可靠的入口是 `tag-style` 属性 ——
 * 它被拼进每个节点的 style 里（内联样式，优先级最高）。
 *
 * 所以这些值必须和 `src/styles/tokens/_color.scss` 的同名变量一致，理由和
 * `scripts/gen-icons.mjs` 的色板一样：CSS 变量传不进这里，只能写死十六进制。
 * 改色值两处都要动。
 *
 * 单位统一用 rpx：小程序里 rpx 会按屏幕宽度换算，750rpx = 屏宽。
 */

const INK = '#000000';
const MUTED = 'rgba(60, 60, 67, 0.6)';
const BORDER = 'rgba(60, 60, 67, 0.18)';
const ACCENT = '#0062cc';
const CODE_BG = 'rgba(120, 120, 128, 0.12)';

/**
 * 正文行高 1.6 是为中文调的：中文方块字没有天然的升降部留白，
 * 行高低于 1.5 上下两行会贴在一起。
 */
const BODY = 'font-size: 28rpx; line-height: 1.6; color: #000000;';

/**
 * mp-html 的标签默认样式表。
 *
 * 只列 AI 分析里真会出现的标签。表格和图片不列 —— 钓鱼建议里基本不产出，
 * 真出现了就是 mp-html 的默认样式，不会塌。
 */
export const MARKDOWN_TAG_STYLE: Record<string, string> = {
  p: BODY,

  // 标题：AI 输出里 h1/h2 用得多，h3 往下压到正文大小
  h1: 'font-size: 36rpx; line-height: 1.35; font-weight: 700; color: #000000; margin: 24rpx 0 12rpx;',
  h2: 'font-size: 32rpx; line-height: 1.4; font-weight: 600; color: #000000; margin: 20rpx 0 10rpx;',
  h3: 'font-size: 30rpx; line-height: 1.4; font-weight: 600; color: #000000; margin: 16rpx 0 8rpx;',
  h4: 'font-size: 28rpx; line-height: 1.4; font-weight: 600; color: #000000; margin: 16rpx 0 8rpx;',

  strong: 'font-weight: 600; color: #000000;',
  em: 'font-style: italic; color: #000000;',
  del: 'text-decoration: line-through; color: rgba(60, 60, 67, 0.6);',

  // 行内码：底色用次级填充，和代码块区分开
  code: `font-family: Menlo, Consolas, monospace; font-size: 26rpx; background-color: ${CODE_BG}; padding: 2rpx 8rpx; border-radius: 6rpx;`,

  // 代码块：整块底色 + 左侧竖线，读起来是「一段引文」而不是正文
  pre: `font-family: Menlo, Consolas, monospace; font-size: 24rpx; line-height: 1.5; background-color: ${CODE_BG}; padding: 20rpx 24rpx; border-radius: 12rpx; margin: 16rpx 0; border-left: 4rpx solid ${BORDER};`,

  blockquote: `color: ${MUTED}; border-left: 4rpx solid ${BORDER}; padding-left: 20rpx; margin: 16rpx 0;`,

  a: `color: ${ACCENT}; text-decoration: none;`,

  ul: 'margin: 12rpx 0; padding-left: 40rpx;',
  ol: 'margin: 12rpx 0; padding-left: 40rpx;',
  li: 'line-height: 1.6; margin: 6rpx 0;',

  hr: `border-top: 1rpx solid ${BORDER}; margin: 24rpx 0;`,

  // 表格：AI 基本不产出，但列出来免得真出现时挤成一团
  table: 'width: 100%; border-collapse: collapse; margin: 16rpx 0; font-size: 26rpx;',
  th: 'font-weight: 600; border: 1rpx solid rgba(60, 60, 67, 0.18); padding: 12rpx 16rpx;',
  td: 'border: 1rpx solid rgba(60, 60, 67, 0.18); padding: 12rpx 16rpx;',
};
