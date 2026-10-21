# 渔碌

uni-app + Vue 3 + TypeScript 的微信小程序，用 `pnpm`。

## 平台边界

只有一个目标平台：mp-weixin。

平台能力一律走 `uni.*` 命名空间 —— `uni.request`、`uni.getWindowInfo`、`uni.getLocation`、`uni.loadFontFace`。小程序没有浏览器运行时（`document`、`window`、`localStorage`、`fetch`、全局 `requestAnimationFrame` 都不存在）；需要这类能力时，先查 `docs/mp-weixin-platform.md` 里的替代路径。
## 命令

| 做什么   | 跑什么                                                                               |
| -------- | ------------------------------------------------------------------------------------ |
| 开发     | `pnpm dev`                                                                           |
| 构建     | `pnpm build` → 产物在 `dist/build/mp-weixin/`（`pnpm dev` 在 `dist/dev/mp-weixin/`） |
| 类型检查 | `pnpm type-check`                                                                    |
| 格式化   | `npx oxfmt <自己改动的文件>` —— 只格式化动过的那些                                   |
| 改图标   | 改 `scripts/gen-icons.mjs` 的清单 → `pnpm icons` → `pnpm type-check`                 |

自动校验只有 `pnpm type-check` 一项 —— 本仓库没有测试套件，所以它是唯一的把关。改动收尾必须跑它，退出码 0 才算过。

`pnpm format` 是 `oxfmt .`，扫全仓库。仓库里有几处既有格式漂移（`src/uni.scss`、`src/utils/selectorQuery.ts`、`tsconfig.json`、`src/styles/qweather-icons.css`、`src/components/FullscreenMap/FullscreenMap.vue`），全量跑会产出一堆与本次改动无关的 diff —— 只对自己动过的文件跑 `npx oxfmt`。

## 约定

- 组件 `src/components/<Name>/<Name>.vue`，页面 `src/pages/<name>/index.vue`
- 文件头一句话说明「这个文件为什么存在」，决策理由写进注释。中文注释解释为什么，不复述代码
- **唯一出处**：端点清单在 `src/api/`，类型在 `src/types/`，色值与字阶在 `src/uni.scss`，文案在 `src/constants/about.ts`，图标在 `scripts/gen-icons.mjs`。要改就去那个出处改，不在别处抄一份
- 接口基址只从 `@/config/env` 读，不在调用点写死域名
- 环境变量只读 `import.meta.env.VITE_*`（小程序端没有 `process.env`）
- 运行时量出来的尺寸用 px，设计稿尺寸用 rpx；两者相加先过 `uni.upx2px()`
- 坐标是 `[经度, 纬度]`，经度在前

## 改动工作流

1. **先看邻居。** 这个项目的约定靠模仿维持，不靠文档描述。改一个组件前读同目录的相邻组件和 `src/uni.scss` 对应段落。完成标志：能说出新代码要跟哪一个现有模式对齐。
2. **落在正确的层。** 组件只管渲染与交互，取数在 store，接口形状在 api，展示模型的换算在 utils。
3. **格式化。** `npx oxfmt <改动的文件>`，只动自己动过的那些。
4. **过类型检查。** `pnpm type-check` 退出码 0、没有新错误才算过 —— 这是最后一道关，跑在格式化之后，验的是最终状态。改动若涉及生成物，先 `pnpm icons`。

## 深入

按「要做什么」找对应那一份，不要通读：

| 要做什么                                                  | 读哪份                       |
| --------------------------------------------------------- | ---------------------------- |
| 改界面、加页面、加组件、调间距字号配色                    | `docs/design-system.md`      |
| 接接口、改数据流、加字段、动 store                        | `docs/architecture.md`       |
| 碰 map / canvas / 字体 / SSE / 定位 / 登录 / 微信后台配置 | `docs/mp-weixin-platform.md` |
| 真机预览、编译、上传发布                                  | `/wechatide-skill`           |
