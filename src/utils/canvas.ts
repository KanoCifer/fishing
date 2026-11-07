/**
 * canvas 侧的共用工具。
 *
 * 为什么单独一个文件：canvas 2d 不解析 SCSS 变量与 CSS 变量，字体栈和
 * 透明度都只能手写。手写一次就够 —— 散在三处各写一遍，改主题时一定会漏。
 *
 * 见 `docs/mp-weixin-platform.md` 的「canvas」一节。
 */

/**
 * 画布用的字体栈。
 *
 * 与 `src/styles/tokens/_type.scss` 的 `$fish-font` 是同一份字面量 ——
 * canvas 不解析 var()，只能手抄（跟色值同一个约定）。
 *
 * 为什么不能图省事写 `sans-serif`：**iOS 上裸 `sans-serif` 落到的是 Helvetica**，
 * `-apple-system` 才是 SF Pro。分数那个「78」用哪套字，一眼就看得出来。
 */
export const CANVAS_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif";

/**
 * 设字体。
 *
 * 只管字重与字号 —— 字距不在这里（canvas 的 ctx.letterSpacing 不是所有基础库都有，
 * 海报那边的字距是手算的，见 `src/pages/spot-detail/poster.ts` 的 trackGap）。
 */
export function setCanvasFont(ctx: CanvasRenderingContext2D, weight: number, size: number): void {
  ctx.font = `${weight} ${size}px ${CANVAS_FONT_STACK}`;
}

/**
 * 给颜色加透明度。
 *
 * 画布的渐变要的是 rgba，而系列色是 hex —— 硬编码每种颜色的三档透明度
 * 就成了第二份配色表，改色时一定会漏。这里从色值本身算出来。
 *
 * 只认 `#rgb` / `#rrggbb` / `rgb()` / `rgba()`：这四种是本项目会用到的写法
 * （令牌层与组件里的色值都是这几种）。认不出来的原样返回 —— 宁可画错一次，
 * 也不要悄悄算出一个错的颜色。
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseRgb(color);
  if (!rgb) return color.trim();
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/**
 * 颜色 → 三通道。认不出来的返回 null。
 *
 * 只认 `#rgb` / `#rrggbb` / `rgb()` / `rgba()`：这四种是本项目会用到的写法。
 */
function parseRgb(color: string): [number, number, number] | null {
  const value = color.trim();

  if (value.startsWith('#')) {
    const hex =
      value.length === 4
        ? value
            .slice(1)
            .split('')
            .map((c) => c + c)
            .join('')
        : value.slice(1);
    if (hex.length < 6) return null;
    const channels = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    if (channels.some((n) => !Number.isFinite(n))) return null;
    return [channels[0], channels[1], channels[2]];
  }

  const match = value.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const parts = match[1].split(',').map((s) => s.trim());
    if (parts.length < 3) return null;
    const channels = parts.slice(0, 3).map((s) => parseInt(s, 10));
    if (channels.some((n) => !Number.isFinite(n))) return null;
    return [channels[0], channels[1], channels[2]];
  }

  return null;
}

/**
 * 两色之间取中间色。t = 0 取 from，t = 1 取 to。
 *
 * 解析不出来的色值原样返回：宁可画错一次，也不要悄悄算出一个错的颜色。
 */
export function mixColor(from: string, to: string, t: number): string {
  const a = parseRgb(from);
  const b = parseRgb(to);
  if (!a || !b) return t < 0.5 ? from : to;

  const k = Math.min(1, Math.max(0, t));
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * k);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}
