# 微信小程序夜间模式

## 结论

两条腿并行，各管一段：

- **页面层**靠 `@media (prefers-color-scheme: dark)` + CSS 变量。令牌名不变，实现从字面量换成 `var(--fish-ink, #000000)`，深浅两套值集中在 `src/styles/theme.scss` → 770 处调用点一行没改。
- **canvas 与图标**靠 JS 侧的主题值。canvas 2d 不解析 `var()`，图标的色值烤在 data URI 里，两边都拿不到 CSS 变量。

触发方式只有一种：**跟随系统**。不做应用内手动切换 —— 手动切换要靠 JS 往根节点注入 class，首屏会闪一次白，而本项目第一屏就是天气页。

## 落地清单

| 文件 | 做什么 |
| --- | --- |
| `src/styles/theme.scss` | 深浅两套 CSS 变量。作用域 `page, .page` |
| `src/styles/tokens/_color.scss` | B 组令牌换成 `var()`；新增 `$fish-page-base-fade`、`$fish-map-panel`、`$fish-overlay` |
| `src/App.vue` | 全局 style 引入 theme.scss；`onLaunch` 里 `initTheme()` |
| `src/utils/theme.ts` | 主题真值（模块级 ref）+ `wx.onThemeChange` 监听 |
| `src/utils/chartPalette.ts` | canvas 色板，深浅两套。**canvas 色的原件**，SCSS 侧不抄 |
| `src/manifest.json` | `mp-weixin` 加 `darkmode: true` 与 `themeLocation: "theme.json"` |
| `src/theme.json` | 原生 UI 的深浅两套（窗口底色、下拉刷新文字色） |
| `src/pages.json` | `globalStyle` 改用 `@变量` 引用 theme.json |
| `scripts/gen-icons.mjs` | 每个语义档产出浅深两份，键加 `--dark` 后缀 |
| `scripts/tabbar-icons.py` | 把令牌层的色烤进底栏 PNG（只换色，不画图形），并派生深色一套 |
| `src/custom-tab-bar/index.wxss` | 底栏自带一套深色值（媒体查询），每一处注明对应哪个令牌 |
| `scripts/check-hardcoded-colors.mjs` | 令牌层之外的硬编码色值门禁 |

## 令牌分三组

| 组 | 成员 | 载体（原件） | 随主题变 |
| --- | --- | --- | --- |
| A 固定色 | `on-accent`、`on-dark`、`deep-*`、`sun`/`sun-soft`、语义实色、`gradient`、`rain-*`、`tide`、`guide`、`blue-on-dark`、`scrim`、`blue`（填充档） | SCSS 字面量（`_color.scss`） | 否 |
| B 表面与文字 | `ink`、`muted`、`muted-60`、`page`、`grouped`、`card-face`、`surface`、`fill`、`border`、`border-40`、`faint`、`glass`、`card-glass`、`glass-strong`、`glass-edge`、`glass-stroke`、`page-base`、`page-glow`（页面底那圈蓝调，令牌是 `$fish-page-bg`）、`dock-fade`、各 `tint`、各 `*-ink`、`photo-placeholder`、`map-panel`、`overlay`、`blue-600`（文字档）、`tide-ink` | CSS 变量（`theme.scss`） | 是 |
| C 图表与图标 | canvas 的网格线、基线、游标、坐标文字、系列色、量表色阶；图标的 8 个语义色档 | **JS 主题值**（`chartPalette.ts` / `gen-icons.mjs` / `constants/weatherHero.ts` 的量表色阶） | 是 |

C 组的原件在 JS 侧，**SCSS 侧不抄**。抄一份只会让人以为改那里就能改到 canvas ——
canvas 2d 不解析 SCSS 变量与 CSS 变量，它只认那份 TS 里的字面量。

**B 组是主战场。** 令牌名不变，实现换成 `var()`：

```scss
// _color.scss
$fish-ink: var(--fish-ink, #000000);   // 原来：#000000
```

兜底值必须写：变量作用域万一没生效，退回当前浅色值，界面难看但读得出来。反过来（只写变量不写兜底）会得到透明文字与透明背景。

选择器用 `page, .page`，不用 `:root` —— 小程序没有 `:root`（页面根不是 document，是 page 节点）。

## 深色值

深色不是把浅色反过来。深色有自己的表面关系：页面底接近纯黑，卡片面抬高一档，玻璃面从「半透明白」改成「半透明深」，发丝线从黑 29% 透明度改成白 16%。

**两套值与它们的对度校验都记在 `src/styles/theme.scss` 的注释里** —— 那是这些值的原件。
这个文档不再抄一份：抄一份，theme.scss 改了这里就成了陈旧数据。

一句话记住：发丝线与填充装饰层只有 1.2:1 到 1.6:1 —— 它们不承担可读性，
靠面的明度差分层。这与「层次靠面，不靠描边」一致。

材质那一族在深色下各自要翻：玻璃面从半透明白改成半透明深，浮在内容之上的玻璃条（顶栏、导航条、提交条）跟着改成半透明深，顶边高光从白 85% 降到白 14%，**外圈那道描边从白 92% 降到白 8%** —— 浅色下这圈白几乎看不见，它起的作用是「玻璃边缘不糊进背景」；深色下白 92% 压在一张深色卡上就是一圈亮白框。

## 头图：夜间模式下恒为夜

天气页的头图是整屏最大的一块面 —— 一张浅色的照片压在深色页面上，整页的观感就被它拉浅，深色模式等于白做。

所以深色下 `sky` 恒为 `night`：图片换成 `hero-night-v2.jpg`，兜底渐变也跟着走 `hero--night`（那张渐变本来就是深色的，图片加载的那一瞬不会闪白）。图片与渐变永远同源，不会出现「夜图配晴色渐变」的错配。

读的是 `src/utils/theme.ts` 的主题真值，不是系统的 `prefers-color-scheme` —— 那边只管 WXSS，这里要的是「现在是不是深色」这个判断，好让图片与渐变一起翻。

图片在 CDN 上（`hero-night-v2.jpg` 已在 CDN，`scripts/optimize-assets.py` 里那四条 job 之一），换图不用动代码包。

## 五个硬骨头的处理

### canvas 不解析 CSS 变量

色板集中在 `src/utils/chartPalette.ts`，深浅两套。canvas 侧从那里取，取色时机是**绘制时** —— 模块顶层缓存会把颜色锁死在首次取到的那一套。

主题变了要重画：TideChart、LineChart、RecordRing 各挂一个 `watch(themeMode)`，重画走的是「作废画布层 → 重新取节点 → 再画」那条路（`useCanvasPageShow`）。往死 ctx 上画是原生崩溃，不是 JS 异常。

### 图标颜色烤死在 data URI

图标清单写的是语义档（ink / muted / muted60 / blue / blue600 / success / destructive / onAccent），不是具体色值 —— 这一条是深色模式能零改动铺开的前提。

`gen-icons.mjs` 为每个语义档产出浅深两份，键如 `map-pin__ink` 与 `map-pin__ink--dark`。`icon()` 内部按当前主题选档，200 多处调用点零改动。

代价：`constants/icons.ts` 36K → 64K。

**深色下只留亮档品牌蓝**：浅色下「文字专用档」更深（`#0062cc`）、填充档是品牌本色，
深色下反过来 —— 填充档压在深色面上读不出来，所以图标那一档取亮档。
深色下 `blue` 与 `blue600` 同值（都是 `--fish-blue-600` 的深色档）。

### 自定义底栏不在 page 作用域内

`src/custom-tab-bar/` 不经 uni-app 编译，拿不到 SCSS 令牌，也继承不到 page 上的 CSS 变量。底栏自带一套深色值：WXSS 里写 `@media (prefers-color-scheme: dark)` 块，图标另出深色 PNG。

底栏图标的未选中色是 `#666666`（`$fish-muted-60`），压在深色底上几乎不可见 —— 必须出深色版。

底栏的两枚图标（浅色 / 深色）同时挂在 wxml 里，由媒体查询决定露哪一枚。不在 JS 里换 src：底栏是原生组件，拿不到 uni 的主题真值，自己再探一次系统主题就多一份判断；媒体查询跟着系统走，页面与底栏是同一帧翻的。

### 原生控件与原生 map

- `<map>` 的底图不随系统主题变（原生组件只有浅色一份）。地图工具条那一块白面用 `$fish-map-panel` 令牌：深色下它得跟着翻成深面 —— 里面的图标是 ink 档，深色下是白的，白图标压在白面上就看不见了。
- 分享海报与 `constants/markdown-style.ts`（rich-text 内联样式）**保持浅色**：分享出去的内容固定品牌观感，不随本机主题变。

### 状态栏文字色

全部页面是 `navigationStyle: custom`，状态栏文字色由页面配置决定。`theme.json` 里给了 `navBgColor` 与 `navTxtStyle` 两套，但改状态栏文字色是运行时的事，微信没有对应的公开接口。真机上如果浅色页顶部黑字看不清，退路是让顶部统一铺深色锚面。

## 与原方案的三处偏差

1. **主题真值放在 `src/utils/theme.ts`，不是 pinia store。** 主题是设备状态不是服务端状态；更要紧的是 canvas 与图标是普通模块，拿不到 pinia 实例。真值放模块级 ref，组件用 `computed` 包一层。
2. **`uni.onThemeChange` 在 mp-weixin 的运行时里没有实现**（类型里有，`@dcloudio/uni-mp-weixin/dist` 里查不到，只有 uni-app-x 的 dist-x 有）→ 调 `wx.onThemeChange`，并自己声明窄类型。同类例外见 `src/utils/privacy.ts`。
3. **底栏图标的脚本与产物已经对不上。** 浅色那套的 spots / data 是设计稿导出的图形，脚本里还留着旧版的画法。所以脚本**只管换色，不画图形**：跑一次就把现成的 PNG 换成本次的令牌色，再从它派生深色那套。重画会把在用的图形换成旧版 —— 那是产品改动，不该由跑一次脚本顺手做掉。

## 未验证项

真机上要确认四件事（本次按决定跳过了这一步）：

1. WXSS 的 `var()` 在真机是否生效
2. `@media (prefers-color-scheme: dark)` 在真机是否生效
3. `darkmode: true` 后 `getAppBaseInfo().hostTheme` 是否返回 `dark`
4. `wx.onThemeChange` 是否触发

社区有 WXSS 里 CSS 变量真机失效的反馈，但多针对 `:root` —— 本方案用 `page`，风险面更窄；腾讯 TDesign 小程序组件库在生产里用 CSS 变量做深色模式，给的也是 `page, .page`。

兜底方案是「SCSS 双写 + class 变体」：每个用到颜色的地方写两遍。工作量约为 CSS 变量方案的 3 到 5 倍，且 `uni.scss` 只能有一行的既有约定会被打破。回滚成本可控 —— 令牌层那一句 `var()` 是集中在一处改的。

## 门禁

- `pnpm check:colors` —— 扫源码，令牌层之外的硬编码色值一律失败。确属固定色的（压在照片上的层、阴影、图表语义色、系统弹窗色）在行尾标 `/* color-allow: 理由 */`。
- `pnpm check:icons` —— 图标配色档位必须存在。深浅两套都要齐：`--dark` 后缀的键算在检查范围内。

## 参考

- 微信 DarkMode 适配指南：<https://developers.weixin.qq.com/miniprogram/dev/framework/ability/darkmode.html>
- 微信 `wx.onThemeChange`：<https://developers.weixin.qq.com/miniprogram/dev/api/base/app/app-event/wx.onThemeChange.html>
- uni-app DarkMode 适配指南：<https://uniapp.dcloud.net.cn/tutorial/darkmode>
- TDesign 小程序深色模式：<https://tdesign.tencent.com/miniprogram/dark-mode>
- 本仓库平台约束：`docs/mp-weixin-platform.md`
