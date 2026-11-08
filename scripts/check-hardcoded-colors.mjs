#!/usr/bin/env node
/**
 * 门禁：令牌层之外不许出现硬编码色值。
 *
 * 为什么需要这道门禁：
 *
 * 夜间模式是靠**一处**翻色实现的 —— src/styles/theme.scss 里的两套 CSS 变量，
 * 令牌层的 `$fish-ink` 之类的名字在 770 处调用点里一个都没改。
 *
 * 这件事成立的前提是：所有颜色都从令牌层取。
 * 谁在组件里手写了一个 `#3f3f45`，那一处就永远停在浅色 ——
 * 深色模式下它要么看不清，要么跟周围对不上，而且没有任何报错。
 *
 * 比「难看」更糟的是这种色值会悄悄扩散：一处硬编码抄到三处，
 * 改的时候只改一处，最后谁也说不清哪一处才是准的。
 *
 * 两种豁免：
 *   · 文件级 —— ALLOW 名单里的文件整体放行，每条都写了为什么。
 *   · 行级   —— 行尾（或声明前一行）带 `color-allow` 标记的那条声明放行。
 *               标记要带理由，写给下一个人看。
 *
 * 用法：node scripts/check-hardcoded-colors.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

/**
 * 允许出现色值字面量的文件。
 *
 * 每一条都要能答出「为什么这里不能走令牌」。
 */
const ALLOW = [
  {
    file: 'src/styles/theme.scss',
    why: '深浅两套令牌值就在这儿 —— 它就是那一份',
  },
  {
    file: 'src/styles/tokens/_color.scss',
    why: '令牌层的字面量。随主题变的那族已经换成 var()，剩下的是固定色',
  },
  {
    file: 'src/styles/tokens/_depth.scss',
    why: '阴影令牌。阴影在深色下本来就失效，靠面的明度差分层',
  },
  {
    file: 'src/styles/tokens/_material.scss',
    why: '材质 mixin 里压深色面的固定高光（深色面本来就不随主题变）',
  },
  {
    file: 'src/styles/tokens/_motion.scss',
    why: '流光按钮的渐变色，品牌固定色',
  },
  {
    file: 'src/utils/chartPalette.ts',
    why: 'canvas 色板。canvas 2d 不解析 var()，浅色/深色/照片面三套只能手写',
  },
  {
    file: 'src/constants/icons.ts',
    why: '生成物（scripts/gen-icons.mjs）。图标是烤进 data URI 的',
  },
  {
    file: 'src/constants/weatherIcons.ts',
    why: '生成物（scripts/gen-meteocons-icons.mjs）',
  },
  {
    file: 'src/constants/otherIcon.ts',
    why: '生成物（scripts/gen-meteocons-icons.mjs）',
  },
  {
    file: 'src/constants/markdown-style.ts',
    why: '分享出去的富文本内联样式。分享出去的内容固定浅色，不随本机主题变',
  },
  {
    file: 'src/pages/spot-detail/poster.ts',
    why: '分享海报。理由同上：分享出去的内容固定品牌观感',
  },
  {
    file: 'src/custom-tab-bar/index.wxss',
    why: '自定义底栏是原生组件，不经 uni-app 编译，拿不到 SCSS 令牌。它自带一套深色值',
  },
  {
    file: 'src/components/RecordHero/RecordHero.vue',
    why: '压在照片上的压暗层。照片不随主题变，这一层也不变',
  },
  {
    file: 'src/components/RecordHeroBand/RecordHeroBand.vue',
    why: '压在照片上的字与描边',
  },
  {
    file: 'src/components/RecordTripRail/RecordTripRail.vue',
    why: '压在照片上的字与压暗层',
  },
  {
    file: 'src/components/UserCard/UserCard.vue',
    why: '深色锚面上的头像环与白字',
  },
  {
    file: 'src/components/ImagePicker/ImagePicker.vue',
    why: '照片上的遮罩层',
  },
  {
    file: 'src/constants/weatherHero.ts',
    why: '十一档天色渐变。头图整页的天色由这一份说了算，它就是那一份',
  },
  {
    file: 'src/constants/weatherTemp.ts',
    why: '温度色阶。同一张头图上用',
  },
];

const ALLOW_SET = new Set(ALLOW.map((item) => item.file));

/** 十六进制色值：#rgb / #rgba / #rrggbb / #rrggbbaa */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** rgb() / rgba() 字面量 */
const RGB = /\brgba?\(\s*([^)]*)\)/g;

/** 递归收集源码文件 */
async function collect(dir) {
  const files = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(full)));
    } else if (/\.(vue|ts|scss|js|wxss)$/.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

/**
 * 一行里出现的色值。
 *
 * 注释里的色值不算 —— 注释里写「与 $fish-ink 对齐」是给人看的。
 */
function colorsIn(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '');

  const hits = [];

  for (const match of stripped.matchAll(HEX)) {
    hits.push(match[0]);
  }

  for (const match of stripped.matchAll(RGB)) {
    const inner = match[1];
    // 里面带变量或引号的不是字面量（SCSS 的 rgba($x, .5) 在令牌层才合法）
    if (inner.includes('$') || inner.includes('var(')) continue;
    hits.push(match[0]);
  }

  return hits;
}

/**
 * 逐行扫一个文件。
 *
 * color-allow 标记的豁免范围：从标记所在行起，到这条声明结束（分号）为止。
 * 这样多行声明（渐变）只要在第一行标一次就行。
 */
function scanFile(rel, source) {
  const original = source.split('\n');

  /*
   * 块注释要整份剥掉，但行号不能变。
   *
   * 逐行剥会漏掉多行块注释的中间几行 —— 那几行里的色值是注释里的说明文字，
   * 不是代码。所以这里先把块注释的内容清空（只留换行），行号对得上。
   */
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, '')).split('\n');

  const offenders = [];
  let exempt = false;

  original.forEach((line, index) => {
    if (line.includes('color-allow')) {
      exempt = true;
    }

    const hits = colorsIn(stripped[index] ?? '');
    if (hits.length && !exempt) {
      offenders.push({
        where: rel,
        line: index + 1,
        colors: [...new Set(hits)],
        text: line.trim().slice(0, 90),
      });
    }

    if (exempt && line.includes(';')) {
      exempt = false;
    }
  });

  return offenders;
}

const offenders = [];
let checked = 0;

for (const file of await collect(SRC)) {
  const rel = relative(ROOT, file);
  if (ALLOW_SET.has(rel)) continue;

  const source = await readFile(file, 'utf-8');
  checked += 1;
  offenders.push(...scanFile(rel, source));
}

if (offenders.length === 0) {
  console.log(`色值检查通过：${checked} 个文件里没有令牌层之外的硬编码色值。`);
  process.exit(0);
}

for (const item of offenders) {
  console.error(`  ${item.where}:${item.line}  ${item.colors.join(' ')}\n    …${item.text}…`);
}

console.error('');
console.error('修法：颜色从令牌层取。');
console.error('  · 页面与组件里写 $fish-xxx（SCSS 变量）—— 随主题变的那族已经接好 CSS 变量。');
console.error('  · canvas 里写 src/utils/chartPalette.ts 里的色板项。');
console.error('  · 这一处确实该是固定色（压在照片上、阴影、图表语义色），');
console.error('    在行尾标 /* color-allow: 理由 */，理由要写给下一个人看。');
console.error('  · 整份文件都这样，加进 ALLOW 并写清为什么。');
console.error('');
console.error('色值检查失败：上面这些色值不会跟着主题翻。');
process.exit(1);
