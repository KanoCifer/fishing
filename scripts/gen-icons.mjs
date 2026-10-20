#!/usr/bin/env node
/**
 * 生成内联图标 —— 从 lucide-static 取 SVG，烧成 data URI，输出到 src/constants/icons.ts。
 *
 * 为什么必须是脚本、而不是直接把 svg 引进项目：
 * 小程序端不能把 <svg> 内联进 WXML（渲染层不认），能落地的只有 WeatherHero
 * 里已经在用的那条路 —— <image src="data:image/svg+xml;base64,…">。这条路要手工
 * 维护两件很烦的事：每个图标一份 base64，以及每个图标一份颜色。
 *
 * 关键约束：<image> 里的 SVG 是当图片渲染的，拿不到页面的 CSS 上下文，
 * currentColor 不会继承。所以颜色必须在生成时烤死 —— 这就是下面每个条目
 * 都带一个 color 的原因。改一次 uni.scss 的色值，要回来重跑本脚本，
 * 和 scripts/tabbar-icons.py 一样，脚本是资产的唯一出处。
 *
 * 用法：pnpm icons
 * 生成后跑一次 type-check，确认 icons.ts 里的联合类型和清单对得上。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = resolve(ROOT, 'node_modules/lucide-static/icons');
const OUT_FILE = resolve(ROOT, 'src/constants/icons.ts');

/**
 * 色板。取值必须与 src/uni.scss 的同名变量一致 —— 这里只能写十六进制，
 * 因为 CSS 变量传不进 <image>。改色值两处都要动，注释是给下一个人看的路标。
 *
 * 注意 muted / muted60 落在 rgba(60, 60, 67, …) 上：它们在 svg 里拆成
 * 十六进制基底 + stroke-opacity 两部分表达（见 ALPHA），不是直接写 rgba。
 */
const COLORS = {
  ink: '#000000', // $fish-ink
  muted: '#3c3c43', // $fish-muted（secondaryLabel）
  muted60: '#3c3c43', // $fish-muted-60（tertiaryLabel），同色降透明度（见下方 alpha）
  blue: '#007aff', // $fish-blue
  blue600: '#0062cc', // $fish-blue-600
  success: '#34c759', // $fish-success
  destructive: '#ff3b30', // $fish-destructive
  onAccent: '#ffffff', // 主色按钮上的前景色
};

/** alpha > 1 的条目按半透明烘（muted60 这类 rgba 色值），其余烤成实色 */
const ALPHA = { muted: 0.6, muted60: 0.3 };

/**
 * 清单：每个图标只列它真正在用的那一两个配色，不铺满色板。
 *
 * 数量刻意压着不加 —— 图标一多，页面就从「读数据」滑向「看图标」。
 * 这里每个条目要么替掉了手搓的字形（↻、自绘的定位针），要么给一行只有
 * 文字标签的指标配了个锚点，要么是把一段文字按钮换成了图标（地图 toolbar
 * 上的定位键）。其余地方不该加。
 */
const ICONS = [
  // —— 结论头 ——
  { name: 'map-pin', color: 'muted', use: '实况地点' },
  { name: 'refresh-cw', color: 'muted', use: '刷新天气与指数' },
  { name: 'fish', color: 'success', use: '钓鱼指数标记' },
  { name: 'thermometer', color: 'destructive', use: '气温信号' },
  { name: 'waves', color: 'blue', use: '潮汐信号' },
  { name: 'wind', color: 'blue600', use: '风速信号' },
  { name: 'message-square', color: 'onAccent', use: '反馈按钮' },
  { name: 'navigation', color: 'onAccent', use: '钓点导航按钮' },
  { name: 'sparkles', color: 'blue600', use: 'AI 分析按钮' },
  // —— 地图 toolbar ——
  { name: 'layers', color: 'muted', use: '底图循环键' },
  { name: 'crosshair', color: 'ink', use: '地图定位' },
  { name: 'crosshair', color: 'destructive', use: '定位权限未开时的定位键' },
  // —— 我的页 ——
  { name: 'chevron-right', color: 'muted60', use: '条目右侧的展开箭头' },
  { name: 'user', color: 'muted60', use: '未登录时的头像占位' },
  { name: 'pencil', color: 'muted60', use: '编辑资料' },
  { name: 'log-out', color: 'destructive', use: '退出登录' },
  // —— 关于页 ——
  { name: 'chevron-left', color: 'blue', use: '子页导航栏的返回按钮' },
];

/**
 * 把 lucide 的 SVG 改成能进 <image> 的形态。
 *
 * 三件事：
 * 1. 删掉 width/height —— 尺寸交给 CSS 的 .icon-* 规则，这样同一个图标
 *    在 24rpx 和 40rpx 下都是同一份数据，不会存两份尺寸。
 * 2. currentColor 换成具体色值（含可选的 stroke-opacity），理由见文件头。
 * 3. 去掉 class —— class 在 <image> 里不起作用，留着只是误导。
 */
function toInlineSvg(raw, color, alpha) {
  let svg = raw
    // lucide 每份文件头部都带一条 license 注释，ISC 要求署名，保留
    .replace(/<svg\s+class="[^"]*"\s+/, '<svg ')
    .replace(/\s*width="24"/, '')
    .replace(/\s*height="24"/, '');

  const opacity = alpha === undefined ? '' : ` stroke-opacity="${alpha}"`;
  svg = svg.replace('stroke="currentColor"', `stroke="${color}"${opacity}`);
  return svg.trim();
}

/** 压成一行，base64 之前的部分别留换行 —— 生成物要人肉也能读得下去 */
function toDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function main() {
  const colorNames = Object.keys(COLORS);
  const entries = ICONS.map(({ name, color, use }) => {
    const raw = readFileSync(resolve(ICON_DIR, `${name}.svg`), 'utf8');
    const svg = toInlineSvg(raw, COLORS[color], ALPHA[color]);
    return { key: `${name}__${color}`, name, color, use, uri: toDataUri(svg) };
  });

  const nameUnion = [...new Set(entries.map((e) => e.name))].sort();
  const usedColors = colorNames.filter((c) => entries.some((e) => e.color === c));

  const lines = [
    '/**',
    ' * 内联图标 —— 由 scripts/gen-icons.mjs 从 lucide-static 生成，不要手改。',
    ' *',
    ' * 用法见 @/constants/icons 的注释。改图标或改色值都回去跑 `pnpm icons`，',
    ' * 这里只保存生成结果。',
    ' */',
    '',
    '/** 图标名与颜色档位。取值与 uni.scss 的同名变量一致 */',
    `export type IconName = ${nameUnion.map((n) => `'${n}'`).join(' | ')};`,
    `export type IconColor = ${usedColors.map((c) => `'${c}'`).join(' | ')};`,
    '',
    '/** 已生成的图标数据 URI，键为 `图标名__颜色档位` */',
    'export const ICONS = {',
    // base64 一行有近千字符，值单独换行，读起来和格式化后的结果一致
    ...entries.map((e) => `  /** ${e.use} */\n  '${e.key}':\n    '${e.uri}',`),
    '} as const;',
    '',
    '/**',
    ' * 取图标数据 URI，给 <image> 的 src 用。',
    ' *',
    ' * 没有对应配色时退回 muted —— 图标缺色最多是「不显眼」，',
    ' * 缺图标则整块内容塌掉，所以这里保底而不是抛错。',
    ' */',
    "export function icon(name: IconName, color: IconColor = 'muted'): string {",
    '  return ICONS[`${name}__${color}` as keyof typeof ICONS] ?? ICONS[`${name}__muted` as keyof typeof ICONS];',
    '}',
    '',
  ];

  writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  console.log(`生成 ${entries.length} 个图标（${nameUnion.length} 个图形 × ${usedColors.length} 个配色）→ ${OUT_FILE}`);
}

main();
