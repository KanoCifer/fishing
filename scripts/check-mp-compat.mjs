/**
 * 扫构建产物里的 ES2018 正则语法（Unicode 属性转义、命名捕获组）。
 *
 * 为什么需要这道门禁：
 *
 * `\p{L}`、`(?<name>` 这类语法出现在**正则字面量**里，引擎不支持时报错发生在**解析期** ——
 * 整个 `common/vendor.js` 加载失败，表现是**整包白屏**，不是某个页面挂掉。
 *
 * 开发者工具里看不出来：微信开发者工具的「将 JS 代码编译成 ES5」用 babel 转换，
 * 覆盖 `??`、`?.` 这些常规语法，但不覆盖正则的这两个冷门插件。
 * 工具用较新的 V8，真机用微信客户端自带的引擎，两边不是一套。
 *
 * 历史上就栽在 marked 身上（8 条属性转义 + 2 条命名捕获组），
 * 所以现在用 `pnpm patch` 换成了 ES2017 兼容写法。
 * 但 patch 会随 marked 升级失效 —— 这道门禁就是失效时的报警器：
 * 让构建当场失败，比等真机白屏再回头查产物快得多。
 *
 * 用法：node scripts/check-mp-compat.mjs [目录]
 * 默认扫 dist/build/mp-weixin。
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** 默认要扫的目录。参数给了就只扫那一个。 */
const DEFAULT_TARGETS = ['dist/build/mp-weixin'];

/**
 * Unicode 属性转义。
 *
 * 只认这一条规则 —— 只查真踩到过的。
 * 产物里还有 `??`、`?.` 这些 ES2020 语法（uni-app 的 mp-weixin 产物默认保留现代语法，
 * 靠开发者工具的 babel 兜底），但那些是主流语法，babel 一定覆盖；
 * 正则插件才是例外，所以只有它炸过。
 */
const UNICODE_PROPERTY = /\\[pP]\{/;

/**
 * 命名捕获组（`(?<name>`）—— 同样是 ES2018，同样是解析期错误。
 *
 * lookbehind（`(?<=` / `(?<!`）不查：marked 里的 lookbehind 出现在
 * `new RegExp("(?<=1)(?<!1)" + e)` 这样的**字符串**里，外面包着 try/catch ——
 * 那是运行期探测，引擎不支持就自动走降级分支，不会解析失败。
 * 而命名捕获组是**正则字面量**，属于解析期错误。
 */
const NAMED_CAPTURE_GROUP = /\(\?<[A-Za-z_$][\w$]*>/;

/** 递归收集目录下的 .js 文件。 */
async function collectJs(dir) {
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
      files.push(...(await collectJs(full)));
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }

  return files;
}

const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TARGETS;

const offenders = [];

for (const target of targets) {
  const abs = resolve(ROOT, target);
  if (!existsSync(abs)) continue;

  for (const file of await collectJs(abs)) {
    const source = await readFile(file, 'utf-8');

    for (const rule of [UNICODE_PROPERTY, NAMED_CAPTURE_GROUP]) {
      const match = rule.exec(source);
      if (!match) continue;

      const at = source.indexOf(match[0]);
      const context = source.slice(Math.max(0, at - 40), at + 40).replace(/\s+/g, ' ');
      const relative = file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file;
      offenders.push({ file: relative, context, feature: match[0] });
    }
  }
}

if (offenders.length === 0) {
  console.log('兼容检查通过：产物里没有 ES2018 正则语法。');
  process.exit(0);
}

console.error('兼容检查失败：产物里有 ES2018 正则语法，部分安卓真机会整包白屏。');
for (const { file, context, feature } of offenders) {
  console.error(`  ${file}  ← ${feature}\n    …${context}…`);
}
console.error('');
console.error('修法见 docs/mp-weixin-package.md「marked 里的 ES2018 正则」一节。');
console.error('marked 升级后 patches/marked@18.1.1.patch 可能已失效，需要重新打。');
process.exit(1);
