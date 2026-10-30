#!/usr/bin/env node
/**
 * 生成 tabBar 图标 —— 从 lucide-static 取 SVG，烧成 PNG，写进 src/static/tabbar/。
 *
 * 为什么单独一个脚本，不并进 gen-icons.mjs：
 * 那一份产出的是**内联 SVG data URI**（`<image src>` 用），进的是代码包；
 * tabBar 的图标必须是**独立的 PNG 文件**（微信按文件路径读），走的是另一条路。
 * 两种产物、两种加载方式，混在一个脚本里只会让「跑哪个脚本产出什么」说不清。
 *
 * 为什么要补这个脚本：tabBar 的四个 PNG 之前是手工丢进仓库的二进制，
 * 仓库里没有它们的源 —— 想改一个图标只能拿别的工具重画。
 * 现在它们的出处在这里：改图标名 → 跑脚本 → 产物一起更新。
 *
 * 依赖 `rsvg-convert`（brew install librsvg）。没有它脚本会直接报错退出，
 * 而不是静默跳过 —— 产物缺一个图标，微信后台那条 tabBar 就会少一格。
 *
 * 用法：pnpm tabbar
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = resolve(ROOT, 'node_modules/lucide-static/icons');
const OUT_DIR = resolve(ROOT, 'src/static/tabbar');

/**
 * 尺寸。
 *
 * 微信官方建议 81×81。之前仓库里是混的（`spots`/`data` 72×72、`mine` 81×81），
 * 而微信按文件的原尺寸渲染 —— 尺寸不一样，四个页签的图标就大小不一。
 * 统一到 81。
 */
const SIZE = 81;

/**
 * 色值。必须与 pages.json 的 tabBar 配置一致：
 * `color` 是未选中态，`selectedColor` 是选中态。
 *
 * 这里写死十六进制，CSS 变量传不进 PNG。
 */
const COLORS = {
  normal: '#3C3C43',
  active: '#007AFF',
};

/**
 * 图标清单。
 *
 * `file` 是产物文件名（不带 -active），`name` 是 lucide 里的图标名。
 *
 * ⚠️ `mine` 不在这张表里：它的字形是**实心**的，与 lucide 的描边风格不是一套，
 * 仓库里也没有对应的源 SVG。硬塞进来只会把它改成描边版 —— 那是改一个现有页签
 * 的样子，不该由「补一个图标」这件事顺手做掉。
 */
const ICONS = [
  { file: 'spots', name: 'map' },
  { file: 'data', name: 'cloud' },
  { file: 'records', name: 'calendar-check' },
];

/** 确认 rsvg-convert 在 */
function ensureRenderer() {
  try {
    execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
  } catch {
    console.error('找不到 rsvg-convert。先装它：brew install librsvg');
    process.exit(1);
  }
}

/**
 * 渲染一个图标。
 *
 * lucide 的 SVG 里描边色是 `currentColor`，rsvg-convert 不认这个关键字，
 * 渲染出来是黑的 —— 所以先把颜色换成实际的十六进制值再送进去。
 */
function render(name, color, outFile) {
  const svg = readFileSync(resolve(ICON_DIR, `${name}.svg`), 'utf8').replaceAll('currentColor', color);
  const tmpSvg = resolve(OUT_DIR, `.${name}-${color.slice(1)}.svg`);

  writeFileSync(tmpSvg, svg);
  try {
    execFileSync('rsvg-convert', ['-w', String(SIZE), '-h', String(SIZE), tmpSvg, '-o', outFile]);
  } finally {
    execFileSync('rm', ['-f', tmpSvg]);
  }
}

ensureRenderer();
mkdirSync(OUT_DIR, { recursive: true });

for (const { file, name } of ICONS) {
  render(name, COLORS.normal, resolve(OUT_DIR, `${file}.png`));
  render(name, COLORS.active, resolve(OUT_DIR, `${file}-active.png`));
  console.log(`生成 ${file}.png / ${file}-active.png （${name}，${SIZE}×${SIZE}）`);
}
