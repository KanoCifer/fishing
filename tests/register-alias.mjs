/**
 * 让 node 认得项目里的两种写法。
 *
 * 源码用 `@/xxx` 引用彼此、相对导入也不带扩展名 —— 那是 uni-app 编译时
 * 由 vite 解析的写法。node 直接跑 .ts 时两样都不认，这里补上：
 *
 *   `@/utils/weather` → `src/utils/weather.ts`
 *   `./number`        → `src/utils/number.ts`
 *
 * 用法：node --import ./tests/register-alias.mjs --test tests/
 */

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** 依次试这几个后缀 */
function withExtensions(base) {
  return [`${base}.ts`, `${base}/index.ts`];
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const base = resolvePath(SRC, specifier.slice(2));
      const found = withExtensions(base).find((path) => existsSync(path));

      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const parent = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
      const base = resolvePath(parent, specifier);

      if (!extname(base)) {
        const found = withExtensions(base).find((path) => existsSync(path));

        if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
