# 微信小程序平台约束：运行时与界面

只有 mp-weixin 一个平台。网络见 `docs/mp-weixin-network.md`、`docs/mp-weixin-package.md`。

## 运行时与存储

- 平台能力走 `uni.*`（`getSystemInfoSync` 已废弃）；存储走 `@/utils/storage`，**改一个值必须整份写回去**。
- 启动链路不该有同步 Storage 读；取值走 `readStorageAsync` + `ensureTokensLoaded()`；⚠️ 拼 `Authorization` 前必须 `await ensureTokensLoaded()`，否则带空串的请求被判成未登录。

## WXSS 的选择器

- **不认属性名选择器（`[...]`）**：不报错、不白屏，规则都不匹配，切样式只能走 class。`scripts/check-mp-compat.mjs` 扫产物，发现即构建失败。

## WXSS 的值

- **`env()` 不能与长度直接相加**：SCSS 会把它当字符串接起来 —— `160rpx + env(safe-area-inset-bottom)` 编译成 `160rpxenv(safe-area-inset-bottom)`，整条声明无效。不报错、只是不生效 → 要相加就套 `calc()`。

## 夜间模式

- **WXSS 支持 `@media (prefers-color-scheme: dark)`，且不受 `app.json` 的 `darkmode` 开关影响** —— 官方文档明写。页面层的深浅两套靠它切，开关只管 JS 侧。
- **`darkmode: true` 才带来 JS 侧的主题值**：声明后 `getAppBaseInfo` 才返回 `theme`（light / dark），`wx.onThemeChange` 才触发。canvas 与图标拿不到 CSS 变量，只能靠这一条。
- **`uni.onThemeChange` 在 mp-weixin 的运行时里没有实现**（类型里有，`@dcloudio/uni-mp-weixin/dist` 里查不到）→ 要调 `wx.onThemeChange`，并自己声明窄类型（见 `src/utils/theme.ts`）。
- **小程序没有 `:root`**：变量定义在 `page, .page` 上。`page` 覆盖整棵页面树，`.page` 是给不在这个作用域里的内容准备的兜底类。
- **CSS 变量要带兜底值**（`var(--fish-ink, #000000)`）：作用域万一没生效，退回浅色 —— 界面难看，但读得出来。只写变量不写兜底会得到透明文字与透明背景。
- **`theme.json` 走的是另一条路**：只服务原生 UI（导航栏、tabBar、下拉刷新背景），管不了页面内的 WXSS。`pages.json` 的 `globalStyle` 用 `@变量` 引用它，`manifest.json` 里要配 `darkmode` 与 `themeLocation`。
- **canvas 2d 不解析 `var()`**：canvas 的色板另走 JS 主题值，见 `src/utils/chartPalette.ts`；主题变了要重画（复用 `useCanvasPageShow` 的重取节点机制）。
- **`src/custom-tab-bar/` 拿不到 page 的 CSS 变量**：底栏自带一套深色值（WXSS 媒体查询 + 深色 PNG）。

## 高度

- **`100vh` 是屏幕高** → 用 `uni.getWindowInfo().windowHeight`。快照 `src/composables/windowMetrics.ts`；⚠️ 别把 `useNavMetrics` / `useViewport` 改异步。
- **自定义底栏是浮层，`windowHeight` 里含它**：底栏浮在内容上，可用高度不会替它让出来 —— 要让开得由页面自己补（见下面「底栏」那节）。

## 测量：先量后动

- `boundingClientRect` 带 `transform` 时量的不是布局尺寸 → 动画按住不动（`--preparing`）量完再撤；量高回不来要兜底（400ms）。

## 原生弹窗与触觉

- `showModal` 的 `confirmText`/`cancelText` **最多 4 字符，超了静默失败**。
- `vibrateShort` 的 `type` 微信必填但 uni 类型声明没有。

## 版本更新

- **更新管理只在正式版生效**：开发版、体验版里 `wx.getUpdateManager` 的回调不触发 —— 开发阶段看不到弹窗是正常的。
- **只在冷启动时问一次版本**：没有「立即检查更新」这个 API，检测必须挂在 `App.onLaunch`（见 `src/utils/update.ts`）。
- 新包是后台悄悄下载的，`onUpdateReady` 回调时已下好；`applyUpdate` 重启并杀掉当前会话。
- `showModal` 的 `confirmText`/`cancelText` 仍受 4 字符限制。

## canvas

- **WXML 不认 `<svg>` 标签**：画图走 canvas 2d；SVG 只能转 data URI 进 `<image>`。
- **canvas 2d 不解析 `var()`**：色值硬编码，对齐 `_color.scss`（`$fish-tide`）；字体抄 `$fish-font`。
- **导出用的画布位图按设计分辨率铺**；`createImage()` 只认网络地址与 base64 Data URI。
- **`canvasToTempFilePath` 的 `x/y/width/height` 是画布元素的 CSS 坐标**，不是位图像素 → 画布的 `style` 尺寸要跟位图一致（`750px × 1000px`），裁切框写设计坐标才不出错。
- **同一块画布导出两次，两次写同一个临时文件**：后一次把前一次盖掉 → 要出两张图就备两块画布，别指望一块导出两遍。
- **`createImage()` 的图像对象跟着画布节点走**：另一块画布要用同一张图，得在它自己身上重新 `createImage()`。
- **页面隐藏期间画布节点会被回收**：缓存下来的 ctx 指向一块死画布，在它上面绘制是**原生崩溃**（小程序闪退），不是 JS 异常，开发者工具里看不出来 → 画布统一走 `utils/chartCanvas.ts` 的 `createCanvasLayer`，页面回前台时先 `reset()` 再重新取节点。
- **切 tab 就是「页面被隐藏」**：底栏一 `switchTab`，旧页的画布节点就被回收了。天气页有 `TideGauge` 与 `LineChart` 两块画布，回来时数据一刷新就往死画布上画 —— 这是 iPhone 上偶现闪退的主因。**回前台不能拿旧 ctx 补画一帧**，要作废重取。
- **子组件里的 `onShow` 也能收到页面显示**：uni-app 的 `onShow` 走 `injectHook`，页面类钩子（`isRootHook`）会挂到 `target.root`，也就是所属页面 → 组件里写和页面里写效果一样。统一用 `chartCanvas.ts` 的 `useCanvasPageShow(layers, redraw)`：层已就绪（可能有死 ctx）就作废重取，没就绪的不用管。
- **画布层 `reset()` 之后取消动画要认旧节点**：`createEntryAnimator` 记下排帧时那个节点再取消 —— 现去 `getNode()` 拿到的是新节点，不认识旧的 requestId，旧节点上那串帧就停不下来，会一直往死画布上排帧。

## 图标

- Meteocons 彩色 SVG 烧成 data URI：**零网络请求、不占 downloadFile 域名名额**。PNG 进去就把尺寸定死。
- 换图标改清单重跑 `pnpm weather-icons`；**Meteocons 原版的云是浅色**（`#E6EFFC`）。

## 原生 map

- `<map>` 层级最高，**遮罩拦不住它的手势**：浮层打开时关掉地图手势。**卫星与路况是两个独立开关**。
- `latitude`/`longitude`/`scale` 受控：写回三个值一起写；**`causedBy === 'update'` 要丢**。中心点在 `detail.centerLocation`，不在 `detail` 顶层。

## 底栏

- **底栏是自定义的**：`pages.json` 的 `tabBar.custom` 为 `true`，底栏由 `src/custom-tab-bar/` 提供。微信给每个 tab 页各建一个组件实例、实例之间不共享 data —— 选中态的真值放在**模块作用域**，以点击为主、路由反推兜底（见 `index.js` 的注释）。
- **`src/custom-tab-bar/` 不经 uni-app 编译**：原样拷到小程序代码根目录 → 只能写原生小程序语法（不能写 TS，不能用 `uni.*` 的 API）。
- **自定义底栏是 fixed 浮层，浮在内容上**：tab 页的可用高度里**不含**底栏（`windowHeight` 也不会替它让出来），页面底部必须自己让开 —— 用 `fish-tabbar-inset` mixin（`calc(底栏行高 + env(safe-area-inset-bottom))`）。
- **底栏高度是一套数**：WXSS 里 `.tabbar__row` 的行高 = 令牌层 `$fish-tabbar-height`。两处对不上就会「内容被切」或「底下多一截空白」。
- **`custom: true` 时 `pages.json` 的 `color` / `selectedColor` / `iconPath` 不参与渲染**，但仍要完整声明（少了会报错）—— 真正的配色在 WXSS 与 PNG 里。

## 自定义事件不能与原生事件同名

- 撞上原生事件名时 `triggerEvent` 与冒泡的原生事件接住同一个监听器，打两次。**规则：自定义事件用驼峰或加后缀**。

## 组件宿主节点不吃动画

- **挂在标签上的 `animation` 不动** → 套一层普通 `<view>`，动画挂这层上；入场动画的 `opacity: 0` 写在类上，现在是**「永久隐形」**。**带入场动画的类只能挂在普通 `<view>` 上。**

## transform 会创建层叠上下文：按一下，底色就没了

- `transform` 建立层叠上下文，绘制顺序：**自身背景 → 负 z-index 的子层 → 普通流内容**。**症状是「按下去才坏」。** 做法：**拆两层**，外壳持渐变与光晕、不带 transform。

## 动画 API 与性能

- `uni.createAnimation` 是旧 API：`timingFunction` 不支持 cubic-bezier；`export()` 每次清空队列。运行时关键帧用 `this.animate`。
- CSS 动画在视图层本地跑、运行时代价为零；canvas 每帧跨线开销。自查：不动 `left`/`top`/`width`/`height`。
- 例外：**底部浮层高度动画不能用 transform 代替**；**`animation-fill-mode` 用 `both`**；**展开收起可用 `grid-template-rows: 0fr → 1fr`**。

## WXS：目前用不上

- 跟手动画用 WXS，项目只有一处连续手势。
