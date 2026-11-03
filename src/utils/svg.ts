/**
 * SVG → data URL。
 *
 * 小程序没有 <svg> 标签（WXML 只认自己的组件，见 docs/mp-weixin-platform.md），
 * 矢量图要显示只有两条路：转成 data URL 塞进 <image>，或者烧成 PNG 文件。
 * 这个模块只做前一条 —— PNG 那条要落文件系统，不归这里管。
 *
 * 两种编码：
 *
 * - base64（默认）：URL 里只有 ASCII，属性引号、#、&、空格都不用操心。
 *   代价是体积约 4/3。
 * - percent-encoded：体积略小，但 SVG 里的 " 与 # 会被转义成 %xx，
 *   放进 CSS 的 url() 里还得再包一层引号，写错一处整张图就不显示。
 *
 * 为什么不调 uni.arrayBufferToBase64：为一个字符串绕一圈 ArrayBuffer 不划算，
 * 而且那 API 在各端行为不完全一致。这里手写一份纯函数，Node 里也能直接跑，
 * 输出与 Buffer.from(svg, 'utf8').toString('base64') 逐字节一致。
 *
 * 什么时候用哪个：
 *
 * - 静态图标 → 走 scripts/gen-icons.mjs 构建期烧好，别在运行时转。
 * - 运行时拼出来的 SVG（按数值改色、按进度改形状）→ 用这里的函数。
 */

/** base64 字母表 */
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 把字符串编成 UTF-8 字节序列 */
function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (const char of input) {
    let code = char.codePointAt(0)!;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

/** UTF-8 字节序列转 base64 */
function toBase64(input: string): string {
  const bytes = utf8Bytes(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0x3f];
  }
  return out;
}

/** 转义方式。base64 适合放进 <image src>；percent-encoded 适合放进 CSS url() */
export type SvgEncoding = 'base64' | 'percent';

/**
 * 把 SVG 源码转成 data URL。
 *
 * 传进来的必须是完整 SVG 源码（含 <svg> 根标签），不是 SVG 片段。
 *
 * @param svg SVG 源码
 * @param encoding 编码方式，默认 base64
 * @returns data URL，可直接作为 <image> 的 src
 */
export function svgToDataUrl(svg: string, encoding: SvgEncoding = 'base64'): string {
  if (!svg.includes('<svg')) {
    throw new Error('svgToDataUrl: 输入不是 SVG 源码');
  }
  if (encoding === 'percent') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/**
 * 把 SVG 里的 currentColor 换成具体色值。
 *
 * currentColor 在 <image> 里不成立 —— SVG 是独立文档，取不到外层的 color，
 * 结果就是渲染成黑色或直接不渲染。这里显式烤死颜色。
 *
 * @param svg SVG 源码
 * @param color 颜色值，如 '#0f66d6'
 */
export function applySvgColor(svg: string, color: string): string {
  return svg.replace(/currentColor/g, color);
}

/**
 * 去掉 SVG 的 width / height 属性，让尺寸交给 CSS。
 *
 * 同一份图标要同时用在小尺寸和大尺寸时，烤死的尺寸会让其中一边糊掉。
 * 去掉后 SVG 用 viewBox 自适应，缩放由外层控制。
 */
export function stripSvgSize(svg: string): string {
  return svg.replace(/\s(width|height)="[^"]*"/g, '');
}
