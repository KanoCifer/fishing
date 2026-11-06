/**
 * 门禁：字面量的 icon() 调用必须有精确的配色档位。
 *
 * 为什么需要这道门禁：
 *
 * icon() 的退档规则是「取不到就退回 muted」。但清单里并不是每个图形都生成过 muted
 * —— 清单只列真正在用的配色。于是少一档时，图标表里两处都查不到，icon() 返回
 * undefined，undefined 进了 <image> 的 src，小程序在渲染期报：
 *
 *   property src received type-incompatible value: expected <String> but get null value
 *
 * 这个错只在渲染层冒出来，页面上看不出少了什么 —— 一枚渔获行的删除键就这么没了。
 * TypeScript 也拦不住：ICONS 是 as const 的字面量表，取出来的类型是字符串，
 * 不是 string | undefined，?? 那一侧看着永远有值。
 *
 * 所以门禁放在构建期：扫出所有字面量调用，对照生成好的图标表逐条核对，
 * 少一档就让构建失败，而不是等真机上少一枚图标。
 *
 * 用法：node scripts/check-icons.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const ICONS_FILE = join(SRC, 'constants', 'icons.ts');

/** 图标调用：图形名是字面量，配色是任意表达式 */
const CALL = /(?<![A-Za-z0-9_$])icon\(\s*'([a-z0-9-]+)'\s*,\s*([^)]*?)\s*\)/g;

/** 表达式里的字符串字面量 */
const QUOTED = /'([A-Za-z0-9]+)'/g;

/** 图标表里的键，形如 name__color: */
const KEY = /^\s*'?([a-z0-9-]+__[A-Za-z0-9]+)'?:\s*$/gm;

/** 递归收集目录下的源文件 */
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
    } else if (entry.name.endsWith('.vue') || entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }

  return files;
}

/** 读出图标表里已有的键 */
async function readKeys() {
  const source = await readFile(ICONS_FILE, 'utf-8');
  const keys = new Set();

  for (const match of source.matchAll(KEY)) {
    keys.add(match[1]);
  }

  return keys;
}

if (!existsSync(ICONS_FILE)) {
  console.error('图标表不在 src/constants/icons.ts —— 先跑 pnpm icons 生成。');
  process.exit(1);
}

const keys = await readKeys();
const shapes = new Set([...keys].map((key) => key.split('__')[0]));

const offenders = [];
const seen = new Set();
let checked = 0;

for (const file of await collect(SRC)) {
  const source = await readFile(file, 'utf-8');

  for (const match of source.matchAll(CALL)) {
    const name = match[1];
    const colors = [...match[2].matchAll(QUOTED)].map((item) => item[1]);

    // 配色是变量：静态查不了，跳过
    if (colors.length === 0) continue;

    const line = source.slice(0, match.index).split('\n').length;
    const where = relative(ROOT, file);

    if (!shapes.has(name)) {
      offenders.push({ where, line, name, color: null });
      continue;
    }

    for (const color of colors) {
      if (keys.has(name + '__' + color)) continue;

      const key = where + ':' + line + ' ' + name + '__' + color;
      if (seen.has(key)) continue;
      seen.add(key);

      offenders.push({ where, line, name, color });
    }

    checked += 1;
  }
}

if (offenders.length === 0) {
  console.log('图标检查通过：' + checked + ' 处字面量调用都有精确的配色档位。');
  process.exit(0);
}

for (const item of offenders) {
  console.error('  ' + item.where + ':' + item.line + '  icon(' + item.name + ', ' + (item.color ?? '...') + ')  ← 缺 ' + item.name + '__' + (item.color ?? '*'));
}

console.error('');
console.error('修法：在 scripts/gen-icons.mjs 的清单里补上这一档，然后跑 pnpm icons。');
console.error('清单里少一档，icon() 会退档 —— 退到头就返回空串，那枚图标就没了。');
console.error('');
console.error('兼容检查失败：上面这些调用的配色档位不存在。');
process.exit(1);
