# fishing

uni-app + Vue 3 + TypeScript，**只有微信小程序（mp-weixin）一个目标平台**。没有 H5、没有 App、没有其他小程序端，构建目标写死在 `package.json` 的 `dev` / `build` 上（都带 `-p mp-weixin`）。

**不要写浏览器 API**。小程序逻辑层没有 `window`、没有 DOM、没有全局 `requestAnimationFrame`，任何"在浏览器里这么写就对了"的直觉在这里都会变成运行时崩溃，且 `vue-tsc` 查不出来——类型定义来自 DOM lib，静态门禁全程放行。写之前先问：这个 API 在小程序端叫什么、谁来提供。真出过事的例子见 `docs/miniprogram-gotchas.md`「Canvas 2d 绘制」里的 `requestAnimationFrame`。

同理，不要为了"顺便兼容"写平台兑底分支。没有第二个端，兑底就是死代码，只会让后来的人以为还有别的运行环境。

## 命令

- `pnpm type-check` — `vue-tsc --noEmit`，唯一的静态门禁，覆盖 `src/**/*.vue`，当前零报错。
- `pnpm build` — 产物落在 `dist/build/mp-weixin`，微信开发者工具「导入项目」指向这个目录，不是项目根目录。

## 平台分支：先认领，再动手

小程序的坑按能力分簇，各簇验证手段不同。动到哪一簇，先读完那一簇再写：

- **原生组件层级**（`map` / `video` / 浮层压不住）→ `docs/miniprogram-gotchas.md`「原生组件层级」
- **Canvas 2d 绘制**（图表 / 自绘 / 手写签名）→ 同文件「Canvas 2d 绘制」
- **定位与授权**（`getLocation` / 权限弹窗 / 定位飘了）→ 同文件「定位与授权」
- **网络与登录态**（`uni.request` / 上传 / 登录）→ 同文件「网络与登录态」
- **包体与性能**（加依赖 / 加图片 / 页面变多）→ 同文件「包体与性能」
- **发布与提审**（换域名 / 填 AppID / 上传）→ 同文件「发布前」

拿不准就按簇猜一个先读。漏掉的簇通常以"开发者工具里好好的"形式回来找你。

## 硬约束

这些每条改动都受约束：

- **尺寸一律手写 rpx**。`manifest.json` 的 `transformPx: false` 关闭了 px→rpx 自动换算，px 不会被转换。
- **环境变量只从 `src/config/env.ts` 读**。那里做了一次类型收窄，各处直接 `import.meta.env.VITE_XXX` 就绕过了收窄。
- **`.env.*` 里只放可公开的值**。这些值会被编译进小程序包体，用户能解出来。密钥和 token 留服务端。
- **事件绑定用 `@tap`**。
- **组件一律 `<script setup lang="ts">` + `scoped` + BEM 命名**（`.block__element`）。
- **平台回调没有官方类型时，写局部 `interface`**，不要 `any`。`defineEmits` 的 payload 类型就是这么定的。
- **注释写「为什么」，尤其是平台限制处**。现有代码在每处小程序坑上都留了原因注释，接上下文时保持这个密度。

## 工作流

1. **认领分支**：列出这次改动触及的平台能力，逐个指到 `miniprogram-gotchas.md` 的具体小节。
   *完成判据*：每个触及的能力都有对应小节，没有遗漏项。

2. **实现**：按小节约束写。
   *完成判据*：`pnpm type-check` 退出码 0。

3. **构建**：`pnpm build`。
   *完成判据*：`dist/build/mp-weixin` 生成，无编译告警。

4. **验证**：微信开发者工具导入产物，跑一遍实际交互路径。
   *完成判据*：每条交互路径都有一次真实操作记录；没验的部分显式说明，不含糊带过。触及**定位、授权、原生组件层级、分享、支付**的改动还要真机验证——而 `src/manifest.json` 的 AppID 现在是空的，真机调试做不了，先填上。

5. **交付**：说清三件事——改了哪些平台能力、哪些结论只在开发者工具成立、上线前微信后台还有什么待办。
   *完成判据*：读者不翻 diff 就能列出后台待办清单。

## 代码约定

- 组件 `src/components/<Name>/<Name>.vue`，页面 `src/pages/<name>/index.vue`
- 路径别名 `@/` → `src/`
- 样式变量直接用 `src/uni.scss` 的 `$uni-*`，无需 import
- 样式值用 rem/px 时留意 `transformPx: false`（见硬约束）
