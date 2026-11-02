#!/usr/bin/env node
/**
 * 生成天气图标 —— 从 @meteocons/svg-static 取 SVG，优化后烧成 data URI，
 * 输出到 src/constants/weatherIcons.ts。
 *
 * 为什么是 SVG data URI 而不是图标字体：
 * - 小程序端没有内联 SVG，WXML 不认 `<svg>` 标签；SVG 只有一种用法 ——
 *   转成 data URI 塞进 `<image>` 的 src（见 docs/mp-weixin-platform.md）。
 * - 同一个仓库里 lucide 图标已经是这么干的（scripts/gen-icons.mjs），
 *   走的是同一条路，不是新发明。
 * - Meteocons 的价值在于它的彩色：填充色、渐变、蒙版都是设计的一部分。
 *   烤成字体得压成单色，等于把它最认得出的那层抹掉。
 *
 * 为什么不是 PNG：PNG 进去就把尺寸定死了，逐时预报那 24 个格子只有一种尺寸，
 * 另两处（大图标、月相）要用另一档 —— 同一张 PNG 缩放过去在小尺寸上是糊的。
 * SVG 是矢量，缩放交给渲染器。
 *
 * 体积：27 个图标 ≈ 40 KB（base64 之前）。主包上限 2MB，
 * 这点体积换一套完整的天气图形，比再压一轮 hero 图划算。
 *
 * 用法：
 *   pnpm weather-icons
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = resolve(ROOT, 'node_modules/@meteocons/svg-static/fill');
const OUT_FILE = resolve(ROOT, 'src/constants/weatherIcons.ts');

/**
 * 图标清单。
 *
 * 只列真正会被画出来的那些 —— 每一个都在 `src/utils/weather.ts` 的
 * ICON_RANGES / MOON_PHASE_SLUGS 里有对应的和风天气码。
 * 清单与那两张表是配套的：这里多一个，那边没有码指向它，
 * 那个图标就白进包体；那边多一个，这里没有它，那一格就退化成兜底云。
 *
 * 名字是 @meteocons/svg-static 里的文件名（去 .svg），换图标就是换这里的名字。
 */
const ICONS = [
  // —— 晴与云 ——
  { slug: 'clear-day', use: '晴（昼）100' },
  { slug: 'clear-night', use: '晴（夜）150' },
  { slug: 'partly-cloudy-day', use: '少云 / 晴间多云 102、103' },
  { slug: 'partly-cloudy-night', use: '少云 / 晴间多云（夜）152、153' },
  { slug: 'cloudy', use: '多云 101、151；未知码的兜底' },
  { slug: 'overcast', use: '阴 104' },
  // —— 降水 ——
  { slug: 'drizzle', use: '小雨 301' },
  { slug: 'rain', use: '阵雨 ~ 暴雨 300、302-305、307-312、350、351、399' },
  { slug: 'sleet', use: '雨夹雪 404-406' },
  { slug: 'snow', use: '雪 400-403、407-410、499' },
  { slug: 'hail', use: '冰雹 306' },
  { slug: 'thunderstorms', use: '雷阵雨 313、315-318' },
  { slug: 'thunderstorms-hail', use: '雷阵雨伴有冰雹 314' },
  // —— 能见度 ——
  { slug: 'mist', use: '薄雾 500' },
  { slug: 'fog', use: '雾 501、510、512' },
  { slug: 'haze', use: '霾 502、511、513' },
  { slug: 'dust', use: '扬沙 / 沙尘暴 / 浮尘 503、504、507-509、514、515' },
  // —— 冷热 ——
  { slug: 'sun-hot', use: '热 900' },
  { slug: 'snowflake', use: '冷 901' },
  // —— 月相 ——
  { slug: 'moon-new', use: '新月' },
  { slug: 'moon-waxing-crescent', use: '蛾眉月' },
  { slug: 'moon-first-quarter', use: '上弦月' },
  { slug: 'moon-waxing-gibbous', use: '盈凸月' },
  { slug: 'moon-full', use: '满月' },
  { slug: 'moon-waning-gibbous', use: '亏凸月' },
  { slug: 'moon-last-quarter', use: '下弦月' },
  { slug: 'moon-waning-crescent', use: '残月' },
];

/**
 * 路径数据里的数字压到两位小数。
 *
 * 128 网格上的坐标两位小数是 0.01 单位 —— 比一根头发丝细得多，
 * 而图标在 40rpx 上显示时一格是 0.32 单位。压到两位看不出差别，
 * 但路径数据能短三成，整个图标集就是十几 KB 的差别。
 */
function compactPath(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!tokens) return d;

  let out = '';
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      out += token;
      continue;
    }
    const n = Math.round(Number(token) * 100) / 100;
    if (out && !/[A-Za-z]$/.test(out)) out += ' ';
    out += formatNumber(n);
  }
  return out;
}

/** 数字压到最短写法：整数不带小数点，小数去掉前导 0 与尾随 0 */
function formatNumber(n) {
  if (Number.isInteger(n)) return String(n);
  return String(n)
    .replace(/^0\./, '.')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}

/**
 * 拆掉不带 mask 的 <g> 包裹。
 *
 * 按嵌套逐层拆：先拆最内层（内容里不再有 <g>），拆完外层就成了最内层。
 * 一上来就把所有 <g> 连同 </g> 一起删掉是不行的 ——
 * 带着 mask 的那一组必须留着，蒙版是挂在这一组上的，
 * 拆了就等于把太阳从云后面放出来；而只留开始标签不留结束标签，
 * 出来的 XML 还不合法，渲染器直接报错。
 */
function unwrapGroups(svg) {
  let out = svg;
  for (let round = 0; round < 20; round += 1) {
    const before = out;
    out = out.replace(/<g(?![^>]*\bmask=)[^>]*>((?:(?!<\/?g[\s>])[\s\S])*?)<\/g>/g, (_, inner) => inner);
    if (out === before) break;
  }
  return out;
}

/**
 * 结构校验：标签必须配对。
 *
 * 生成物坏了不会当场报错 —— 它是一段 base64 字符串，谁也不会去读它 ——
 * 直到某天图标在真机上不显示，才知道是这里少了一个结束标签。
 * 所以在这里当场把结构验一遍：标签栈空到底、根节点是 svg，才算过。
 */
function assertWellFormed(svg, label) {
  const stack = [];
  for (const token of svg.match(/<[^>]+>/g) ?? []) {
    if (token.startsWith('<?') || token.startsWith('<!')) continue;
    if (token.endsWith('/>')) continue;
    const name = /^<\/?([a-zA-Z][\w:-]*)/.exec(token)?.[1];
    if (!name) continue;
    if (token.startsWith('</')) {
      const open = stack.pop();
      if (open !== name) {
        throw new Error(`${label}: 标签不配对 —— </${name}> 对上的却是 ${open ?? '（空）'}`);
      }
    } else {
      stack.push(name);
    }
  }
  if (stack.length) throw new Error(`${label}: 有标签没闭合 —— ${stack.join(' > ')}`);
}

/**
 * 色板替换。
 *
 * Meteocons 的 `fill` 风格是给深色天空做的：云是接近白的浅色（#E6EFFC、
 * 渐变顶 #F3F7FE），压在白卡片上等于没画 —— 云只剩几滴雨挂在半空。
 *
 * 这一层把「浅到看不见」的那几档换成中调，其余原样保留：
 * 太阳的黄、雨的蓝、闪电的橙、月亮的青都是 Meteocons 认得出的那层，不动。
 * 换掉的只是「在白底上读不出来」的那层 —— 换个底色就得重新配一次。
 *
 * 替换只认写死的这几个色值：图标改版换了色，这一层自动失效，
 * 不会悄悄把新配色按老映射改掉。
 */
const COLOR_MAP = {
  '#F3F7FE': '#D2E3F7', // 云渐变顶
  '#E6EFFC': '#A8C7EC', // 云身与云描边
  '#E2E8F0': '#A3B4C9', // 霾 / 雾的横线
  '#D6DFE9': '#9BAFC5', // 浅灰蓝
  '#B0BCCD': '#7A90A8', // 灰蓝点缀
};

function recolor(svg) {
  return svg.replace(
    /(fill|stroke|stop-color)="(#[0-9A-Fa-f]{6})"/g,
    (match, attr, hex) => `${attr}="${COLOR_MAP[hex.toUpperCase()] ?? hex}"`,
  );
}

/**
 * SVG 瘦身。
 *
 * 五件事，每一件都只动「渲染结果看不出来」的部分：
 * 1. 删掉整张画布的 clipPath —— viewBox 本来就裁，剪一次是白剪。
 * 2. 删掉没有被 url(#...) 引用的 id —— 引用得到的那几个（渐变、蒙版）留着。
 * 3. 拆掉不带 mask 的 <g> 包裹 —— 带 mask 的必须留着，
 *    蒙版是挂在这一组上的，拆了就等于把太阳从云后面放出来。
 * 4. 路径数据里的数字压到两位小数。
 * 5. 换掉浅到看不见的那几档色（见 COLOR_MAP）。
 */
function optimizeSvg(raw) {
  let svg = raw;

  svg = svg.replace(/<clipPath\b[^>]*>[\s\S]*?<\/clipPath>/g, '');
  svg = svg.replace(/\s*clip-path="url\(#[^)]*\)"/g, '');

  const referenced = new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]));
  svg = svg.replace(/\s+id="([^"]+)"/g, (match, id) => (referenced.has(id) ? match : ''));

  svg = unwrapGroups(svg);

  svg = svg.replace(/(?<![a-zA-Z])d="([^"]*)"/g, (_, d) => `d="${compactPath(d)}"`);

  svg = recolor(svg);

  return svg
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** SVG → data URI。base64 之前的部分别留换行 —— 生成物要人肉也能读得下去 */
function toDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function main() {
  const entries = ICONS.map(({ slug, use }) => {
    const raw = readFileSync(resolve(ICON_DIR, `${slug}.svg`), 'utf8');
    const svg = optimizeSvg(raw);
    assertWellFormed(svg, slug);
    return { slug, use, svg, uri: toDataUri(svg) };
  });

  const rawBytes = entries.reduce((sum, e) => sum + Buffer.byteLength(e.svg), 0);
  const uriBytes = entries.reduce((sum, e) => sum + Buffer.byteLength(e.uri), 0);

  const lines = [
    '/**',
    ' * 天气图标 —— 由 scripts/gen-meteocons-icons.mjs 从 @meteocons/svg-static 生成，不要手改。',
    ' *',
    ' * 用法见 @/utils/weather 的注释。改图标回去跑 `pnpm weather-icons`，这里只保存生成结果。',
    ' *',
    ' * 图标本体来自 Meteocons（https://github.com/basmilius/meteocons），MIT 许可。',
    ' */',
    '',
    '/** Meteocons 图标名。取值与 @meteocons/svg-static 的文件名一致 */',
    'export type WeatherIconSlug =',
    ...entries.map((e) => `  | '${e.slug}'`),
    ';',
    '',
    '/** 已生成的图标数据 URI，键为图标名 */',
    'export const WEATHER_ICONS = {',
    ...entries.map((e) => `  /** ${e.use} */\n  '${e.slug}':\n    '${e.uri}',`),
    '} as const;',
    '',
    '/** 兜底图标名。认不出的天气码落在这里 —— 图标认不出是一回事，不能没有 */',
    "export const WEATHER_ICON_FALLBACK: WeatherIconSlug = 'cloudy';",
    '',
  ];

  writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  console.log(
    `生成 ${entries.length} 个图标 | SVG ${(rawBytes / 1024).toFixed(1)} KB | data URI ${(uriBytes / 1024).toFixed(1)} KB → ${OUT_FILE}`,
  );
}

main();
