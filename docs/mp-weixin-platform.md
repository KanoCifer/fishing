# 微信小程序平台约束：运行时与界面

只有 mp-weixin 一个平台。网络见 `docs/mp-weixin-network.md`、`docs/mp-weixin-package.md`。

## 运行时与存储

- 平台能力走 `uni.*`（`getSystemInfoSync` 已废弃）；存储走 `@/utils/storage`，**改一个值必须整份写回去**。
- 启动链路不该有同步 Storage 读；取值走 `readStorageAsync` + `ensureTokensLoaded()`；⚠️ 拼 `Authorization` 前必须 `await ensureTokensLoaded()`，否则带空串的请求被判成未登录。

## WXSS 的选择器

- **不认属性名选择器（`[...]`）**：不报错、不白屏，规则都不匹配，切样式只能走 class。`scripts/check-mp-compat.mjs` 扫产物，发现即构建失败。

## 高度

- **`100vh` 把原生 tabBar 高度也算进去了** → 用 `uni.getWindowInfo().windowHeight`。快照 `src/composables/windowMetrics.ts`；⚠️ 别把 `useNavMetrics` / `useViewport` 改异步。

## 测量：先量后动

- `boundingClientRect` 带 `transform` 时量的不是布局尺寸 → 动画按住不动（`--preparing`）量完再撤；量高回不来要兜底（400ms）。

## 原生弹窗与触觉

- `showModal` 的 `confirmText`/`cancelText` **最多 4 字符，超了静默失败**。
- `vibrateShort` 的 `type` 微信必填但 uni 类型声明没有。

## canvas

- **WXML 不认 `<svg>` 标签**：画图走 canvas 2d；SVG 只能转 data URI 进 `<image>`。
- **canvas 2d 不解析 `var()`**：色值硬编码，对齐 `_color.scss`（`$fish-tide`）；字体抄 `$fish-font`。
- **导出用的画布位图按设计分辨率铺**；`createImage()` 只认网络地址与 base64 Data URI。

## 图标

- Meteocons 彩色 SVG 烧成 data URI：**零网络请求、不占 downloadFile 域名名额**。PNG 进去就把尺寸定死。
- 换图标改清单重跑 `pnpm weather-icons`；**Meteocons 原版的云是浅色**（`#E6EFFC`）。

## 原生 map

- `<map>` 层级最高，**遮罩拦不住它的手势**：浮层打开时关掉地图手势。**卫星与路况是两个独立开关**。
- `latitude`/`longitude`/`scale` 受控：写回三个值一起写；**`causedBy === 'update'` 要丢**。中心点在 `detail.centerLocation`，不在 `detail` 顶层。

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
