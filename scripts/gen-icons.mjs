#!/usr/bin/env node
/**
 * 生成内联图标 —— 从 lucide-static 取 SVG，烧成 data URI，输出到 src/constants/icons.ts。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = resolve(ROOT, 'node_modules/lucide-static/icons');
const OUT_FILE = resolve(ROOT, 'src/constants/icons.ts');

/**
 * 色板。取值必须与 src/styles/tokens/_color.scss 的同名变量一致 —— 这里只能写十六进制，
 * 因为 CSS 变量传不进 <image>。改色值两处都要动，注释是给下一个人看的路标。
 *
 * 全部是实色：SVG 的 stroke-opacity 跟 rgba 一样会被合成到背景上，
 * 合成结果随背景变 —— 同一个图标压在玻璃卡上和压在白底上会变成两个颜色。
 */
const COLORS = {
  ink: '#000000', // $fish-ink
  muted: '#3f3f45', // $fish-muted（secondaryLabel）
  muted60: '#5b5b60', // $fish-muted-60（tertiaryLabel）
  blue: '#0f66d6', // $fish-blue
  blue600: '#0062cc', // $fish-blue-600
  success: '#34c759', // $fish-success
  destructive: '#ff3b30', // $fish-destructive
  onAccent: '#ffffff', // 主色按钮上的前景色
};

/**
 * 清单：每个图标只列它真正在用的那一两个配色，不铺满色板。
 *
 * 数量刻意压着不加 —— 图标一多，页面就从「读数据」滑向「看图标」。
 * 这里每个条目要么替掉了手搓的字形（↻、自绘的定位针），要么给一行只有
 * 文字标签的指标配了个锚点，要么是把一段文字按钮换成了图标（地图 toolbar
 * 上的定位键）。其余地方不该加。
 */
const ICONS = [
  // —— 首屏 ——
  { name: 'map-pin', color: 'muted', use: '实况地点' },
  { name: 'rotate-cw', color: 'muted', use: '刷新天气与指数' },
  { name: 'fish', color: 'success', use: '鱼口概率标记' },
  { name: 'message-square', color: 'onAccent', use: '反馈按钮' },
  { name: 'navigation', color: 'onAccent', use: '钓点导航按钮' },
  { name: 'sparkles', color: 'blue600', use: 'AI 建议入口' },
  { name: 'chevron-down', color: 'muted60', use: '首屏「往下看」的提示箭头 / 头图地点标签的展开箭头' },
  // —— 数据页卡标题 ——
  // 标题行上的图标跟标题文字同色（ink）：一行里图标与文字分两个颜色，
  // 视线上就有两个焦点，标题反而被图标压过去。
  { name: 'clock', color: 'ink', use: '「未来 24 小时」卡标题' },
  { name: 'calendar-days', color: 'ink', use: '「天气预报」卡标题' },
  { name: 'sun-moon', color: 'ink', use: '「日照与月相」卡标题' },
  { name: 'waves', color: 'ink', use: '「潮汐预报」卡标题' },
  // —— 天气页头图 ——
  // 头图上的图标一律压白：头图整体压深面，深墨图标压在上面读不出来。
  { name: 'map-pin', color: 'onAccent', use: '头图 · 地点标记' },
  // 地点标签这一枚要**实心**：它压在玻璃胶囊上，描边图钉在小尺寸下会读成一团糊。
  // 实心版把中间那个圆挖空成洞，洞里透出胶囊底色（见 punchHoles）。
  { name: 'map-pin', color: 'ink', filled: true, use: '头图 · 地点标签的图钉（实心）' },
  { name: 'rotate-cw', color: 'onAccent', use: '头图 · 刷新键' },
  { name: 'sparkles', color: 'onAccent', use: '头图 · 渔碌建议入口' },
  { name: 'fish', color: 'onAccent', use: '头图 · 鱼口概率标记' },
  { name: 'chevron-right', color: 'onAccent', use: '头图 · 「看构成」箭头' },
  // —— 地图 toolbar ——
  // 卫星与路况是**两个独立开关**，各自要「开」与「关」两个色值：
  // 图标是颜色烤死的 data URI，状态只能靠换一份色值来表达。
  { name: 'earth', color: 'muted', use: '卫星底图键（关）' },
  { name: 'earth', color: 'blue', use: '卫星底图键（开）' },
  { name: 'road', color: 'muted', use: '路况键（关）' },
  { name: 'road', color: 'blue', use: '路况键（开）' },
  // 定位键：常态用箭头（navigation），失败态换成「定位已关」的图钉（map-pin-off）压灰。
  // 两个图形的差别就是「有没有定位」本身，不用红色报警 —— 这一列里红色还担着
  // 别的含义，染红了反而读不出到底是在说定位还是在说别的错。
  { name: 'navigation', color: 'ink', use: '地图定位（常态）' },
  { name: 'map-pin-off', color: 'muted', use: '定位键（定位失败或权限未开）' },
  // —— 我的页 ——
  { name: 'chevron-right', color: 'muted60', use: '条目右侧的展开箭头' },
  { name: 'user', color: 'muted60', use: '资料编辑抽屉里的头像占位' },
  { name: 'user', color: 'onAccent', use: '深色锚面上的头像占位' },
  { name: 'log-out', color: 'destructive', use: '退出登录' },
  // 「我的」页的行首图标。四个行首图标统一烤成蓝色 ——
  // 一行里图标与文字不同色，就有两个焦点了（与上面「更多」那两行同一条规则）。
  // 行首图标是这一行的**起点**，颜色统一才不会互相抢。
  { name: 'pencil', color: 'blue', use: '「我的」页「编辑资料」行的行首图标' },
  { name: 'map-pin', color: 'blue', use: '「我的」页「我的钓点」行的行首图标' },
  { name: 'info', color: 'blue', use: '「我的」页「关于渔碌」行的行首图标' },
  // 头像右下角的相机角标：白字压在品牌蓝的圆上。
  // 角标是「点这里能换头像」的**唯一提示** —— 头像本身长得跟一张照片一样，
  // 没有角标就没人知道它是可点的。
  { name: 'camera', color: 'onAccent', use: '头像右下角「换头像」的相机角标' },
  // 「更多」那两行的动作标记。两个图标都烤成蓝色 ——
  // 同一张卡里一个蓝一个灰，一行里就有两个焦点了
  // （与钓点详情页页脚「图标与文字同色」同一条规则）。
  { name: 'share-2', color: 'blue', use: '分享入口（钓点详情页、「我的」页）' },
  { name: 'message-square', color: 'blue', use: '「我的」页「联系客服」入口' },
  // —— 关于页 ——
  { name: 'chevron-left', color: 'blue', use: '子页导航栏的返回按钮' },
  // —— 钓点详情页 ——
  { name: 'chevron-left', color: 'onAccent', use: '钓点详情页压在头图上的返回按钮' },
  { name: 'share-2', color: 'onAccent', use: '钓点详情页压在头图上的分享入口' },
  // 页脚那两个入口：一个是读者操作（灰），一个是作者操作（主色）。
  // 颜色跟着各自那行文字走 —— 图标与文字不同色，一行里就有两个焦点了。
  { name: 'message-square', color: 'muted', use: '钓点详情页「信息有误」入口' },
  { name: 'pencil', color: 'blue600', use: '钓点详情页「编辑这条钓点」入口' },
  // —— 分享浮层 ——
  { name: 'x', color: 'muted60', use: '分享浮层的关闭按钮' },
  // —— 钓点页 ——
  { name: 'plus', color: 'ink', use: '地图工具条上的投稿键' },
  // —— 钓点照片选择器 ——
  { name: 'plus', color: 'muted', use: '照片选择器的添加格子' },
  { name: 'x', color: 'onAccent', use: '照片缩略图上的删除角标' },
  // —— 记一笔页的渔获步进 ——
  // 减号压灰、加号压蓝：减号是「退回一步」，加号是「再要一条」，
  // 一个是收的动作一个是给的动作，不该同色。
  { name: 'minus', color: 'muted', use: '渔获数量的减号' },
  { name: 'plus', color: 'blue', use: '渔获数量的加号' },
  // —— 记录页 ——
  // 底部「记一笔」是实心主色按钮，加号压在它上面，得是白的。
  // 不烤这一档的话 icon() 会退回 muted，灰加号压在蓝底上像画错了。
  { name: 'plus', color: 'onAccent', use: '记录页底部「记一笔」按钮' },
];

/**
 * 把 lucide 的 SVG 改成能进 <image> 的形态。
 *
 * 四件事：
 * 1. 删掉 width/height —— 尺寸交给 CSS 的 .icon-* 规则，这样同一个图标
 *    在 24rpx 和 40rpx 下都是同一份数据，不会存两份尺寸。
 * 2. currentColor 换成具体色值，理由见文件头。
 * 3. 去掉 class —— class 在 <image> 里不起作用，留着只是误导。
 * 4. filled 的那一档换填充（见 punchHoles）。
 */
function toInlineSvg(raw, color, filled = false) {
  let svg = raw
    // lucide 每份文件头部都带一条 license 注释，ISC 要求署名，保留
    .replace(/<svg\s+class="[^"]*"\s+/, '<svg ')
    .replace(/\s*width="24"/, '')
    .replace(/\s*height="24"/, '');

  if (filled) {
    // 实心版：整张图填色，描边取消。
    svg = svg.replace('fill="none"', `fill="${color}"`).replace('stroke="currentColor"', 'stroke="none"');
    return punchHoles(svg).trim();
  }

  svg = svg.replace('stroke="currentColor"', `stroke="${color}"`);
  return svg.trim();
}

/**
 * 把 <circle> 挖成洞。
 *
 * lucide 的图形全是描边的；实心图形里那个圆要读成「中间透出底色的一圈」，
 * 不是实心的点。做法：圆转成同一段 path 里的子路径，再用 evenodd 填 ——
 * 外圈实心，圈里透空。
 *
 * 只处理「一条 path + 若干圆」的图形（lucide 的 map-pin 正是这种）：
 * 圆并进第一条 path，其余 path 原样保留。
 */
function punchHoles(svg) {
  const holes = [...svg.matchAll(/<circle\s+([^>]*?)\/>/g)]
    .map(([, attrs]) => {
      const num = (name) => Number(new RegExp(`${name}="(-?[\\d.]+)"`).exec(attrs)?.[1]);
      const [cx, cy, r] = [num('cx'), num('cy'), num('r')];
      if (![cx, cy, r].every(Number.isFinite)) return '';
      // 从最左点起，两段半圆合成一个整圆
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
    })
    .join('');

  if (!holes) return svg;

  return svg
    .replace(/<circle\s+[^>]*?\/>/g, '')
    .replace(/<path\s+d="([^"]+)"/, `<path fill-rule="evenodd" d="$1${holes}"`);
}

/** 压成一行，base64 之前的部分别留换行 —— 生成物要人肉也能读得下去 */
function toDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function main() {
  const colorNames = Object.keys(COLORS);
  const entries = ICONS.map(({ name, color, use, filled }) => {
    const raw = readFileSync(resolve(ICON_DIR, `${name}.svg`), 'utf8');
    const svg = toInlineSvg(raw, COLORS[color], filled);
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
    '/** 图标名与颜色档位。取值与令牌层 _color.scss 的同名变量一致 */',
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
