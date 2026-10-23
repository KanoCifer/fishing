# 渔碌

uni-app + Vue 3 + TypeScript 的微信小程序，用 `pnpm`。脚本清单见 `package.json`；构建产物在 `dist/build/mp-weixin/`（`pnpm dev` 在 `dist/dev/mp-weixin/`）。

## 平台边界

只有一个目标平台：mp-weixin。平台能力一律走 `uni.*` 命名空间 —— `uni.request`、`uni.getWindowInfo`、`uni.getLocation`、`uni.loadFontFace`。小程序没有浏览器运行时（`document`、`window`、`localStorage`、`fetch`、全局 `requestAnimationFrame` 都不存在）。

`pnpm lint` 的 `no-undef` 只认 `uni.*`、定时器与 `console` 这几个全局，所以浏览器 API 写进来会直接报错 —— **这道 lint 就是平台边界的静态版本**。需要这类能力时，先查 `docs/mp-weixin-platform.md` 里的替代路径。

**后端服务项目在 `../Server-Go`、`../Server-Py`。**

## 约定

- 组件 `src/components/<Name>/<Name>.vue`，页面 `src/pages/<name>/index.vue`
- 文件头一句话说明「这个文件为什么存在」，决策理由写进注释。中文注释解释为什么，不复述代码
- **唯一出处**：端点清单在 `src/api/`，类型在 `src/types/`，样式令牌在 `src/styles/tokens/`，文案在 `src/constants/about.ts`，图标在 `scripts/gen-icons.mjs`。要改就去那个出处改，不在别处抄一份
- 接口基址只从 `@/config/env` 读，不在调用点写死域名
- 环境变量只读 `import.meta.env.VITE_*`（小程序端没有 `process.env`）；往 `.env.*` 加变量时要同步加 `vite.config.ts` 的 `envPrefix` 白名单 —— 那是白名单不是前缀，漏一个变量 `import.meta.env.XXX` 就是 `undefined`，且不报错
- 运行时量出来的尺寸用 px，设计稿尺寸用 rpx；两者相加先过 `uni.upx2px()`
- 坐标是 `[经度, 纬度]`，经度在前

## 改动的四步

1. **先看邻居。** 这个项目的约定靠模仿维持，不靠文档描述。改一个组件前读同目录的相邻组件和 `src/styles/tokens/` 对应段落。完成标志：能说出新代码要跟哪一个现有模式对齐。
2. **落在正确的层。** 组件只管渲染与交互，取数在 store，接口形状在 api，展示模型的换算在 utils。
3. **格式化。** `npx oxfmt <自己改动的文件>` —— 只格式化动过的那些。`pnpm format` 扫全仓库，会带出一堆与本次改动无关的 diff。
4. **过两道关。** `pnpm type-check` 与 `pnpm lint` 退出码 0、没有新错误才算过 —— 这两道关跑在格式化之后，验的是最终状态。本仓库没有测试套件，这两项是仅有的把关。

改生成物时先改源再跑脚本，产物不手改：图标改 `scripts/gen-icons.mjs` 的清单 → `pnpm icons`；静态图改 `scripts/assets/` 里的源图 → `pnpm assets`；和风图标字形表改 `scripts/subset-qweather-icons.py` → `src/styles/generated/qweather-icons.css`。

`src/styles/` 分三层：**`tokens/`**（令牌，手写，改一处全项目生效）、**`shared/`**（跨页共用的整页版式，手写）、**`generated/`**（脚本产出，勿手改）。跑完生成脚本还要补一次 `npx oxfmt` —— 脚本吐的是紧凑单行，仓库里存的是格式化后的版本。

## 深入

按「要做什么」找对应那一份，不要通读：

| 要做什么                                                   | 读哪份                       |
| ---------------------------------------------------------- | ---------------------------- |
| 改界面、加页面、加组件、调间距字号配色                     | `docs/design-system.md`      |
| 接接口、改数据流、加字段、动 store                         | `docs/architecture.md`       |
| 碰 canvas / map / 字体 / 动画 / 自定义事件 / 窗口尺寸      | `docs/mp-weixin-platform.md` |
| 碰 SSE / 定位 / 选点 / 上传 / 分享 / 登录 / 域名与后台配置 | `docs/mp-weixin-network.md`  |
| 动代码包：静态图、分包、包体大小；真机引擎与依赖兼容       | `docs/mp-weixin-package.md`  |
| 查性能体检条目、启动与网络开销、真机复测方法               | `docs/performance-audit.md`  |
| 真机预览、编译、上传发布                                   | `/wechatide-skill`           |
