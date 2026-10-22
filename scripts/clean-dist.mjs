/**
 * 清掉构建产物里的 .DS_Store。
 *
 * 为什么需要：uni 把 `src/static` 整个目录抄进代码包，
 * Finder 在目录里留下的 .DS_Store 也就跟着进去了 ——
 * 那是 macOS 桌面上的目录元数据，对小程序毫无用处，
 * 却是实打实的包体重量，还会跟着每个用户的手机一起下载。
 *
 * 为什么不靠 .gitignore：.DS_Store 本来就被 git 忽略了，
 * 但构建不读 git —— 它读的是磁盘上的目录。
 *
 * 用法：node scripts/clean-dist.mjs [目录]
 * 默认清 dist/build/mp-weixin 与 dist/dev/mp-weixin。
 */

import { readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** 默认要清的目录。参数给了就只清那一个。 */
const DEFAULT_TARGETS = ['dist/build/mp-weixin', 'dist/dev/mp-weixin'];

/** 要删的文件名。 */
const JUNK = '.DS_Store';

/**
 * 递归找出一棵目录树里的 .DS_Store。
 *
 * 不用 glob —— 目录里可能有符号链接，跟着跑容易兜圈。
 */
async function findJunk(dir) {
  const found = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findJunk(full)));
    } else if (entry.name === JUNK) {
      found.push(full);
    }
  }

  return found;
}

async function clean(target) {
  const abs = resolve(ROOT, target);
  if (!existsSync(abs)) return 0;

  const junk = await findJunk(abs);
  for (const file of junk) {
    await rm(file, { force: true });
  }

  if (junk.length > 0) {
    const bytes = await Promise.all(
      junk.map(async (f) => {
        try {
          return (await stat(f)).size;
        } catch {
          return 0;
        }
      }),
    );
    const total = bytes.reduce((a, b) => a + b, 0);
    console.log(`  · ${target}：清掉 ${junk.length} 个 ${JUNK}（${(total / 1024).toFixed(0)} KB）`);
  }

  return junk.length;
}

const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TARGETS;

let total = 0;
for (const target of targets) {
  total += await clean(target);
}

console.log(total > 0 ? `清完了，共 ${total} 个 ${JUNK}。` : '没有要清的。');
