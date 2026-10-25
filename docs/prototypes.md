# 原型

`prototypes/` 是草稿区，**不进版本库**（`.gitignore` 里写着）。里面放的是「还没定下来的界面」：
一个自包含的 HTML 文件，手机框 + 切换条 + 说明面板，用来看排版、看状态、看这张卡跟邻居的关系。

现在有几份：`about-page.html` `analysis-sheet.html` `sheet-scale.html` `spot-detail.html`
`weather-card.html`（当前天气卡的三方向对比）。

**原型里定下来的东西必须落回来。** 原型不进版本库，半年后没人看得到它 ——
结论进 `docs/`，实现进 `src/`。原型文件本身不是交付物，是产生结论的过程。

## 怎么写

- **令牌抄 `src/styles/tokens/`，不另写一套。** 375pt 机型下 rpx / 2 = px；
  字阶 11 级照抄（字号 / 字重 / 字距 / 行高一组搬，不能拆开挑）。
- **图标用 `src/constants/icons.ts` 的生成物**（真实数据 URI），别手画 SVG。
  原型里可以直接引 `node_modules/` —— 和风图标字体在 `node_modules/qweather-icons/font/fonts/`，
  小程序里那份走 `wx.loadFontFace` 从 CDN 拉（见 `docs/mp-weixin-platform.md` 的「字体」），
  码位表是同一份 `src/styles/generated/qweather-icons.css`。
- **判断留在 CSS，脚本只切属性。** 状态用一个属性挂在容器上（`data-sky="rain"`），
  样式写 `[data-sky='rain'] .xxx {}`。脚本里一行样式都不写。
- **地址栏跟着状态走**（`?dir=b&sky=rain`）。说明面板换方向时高度会变，整页跟着重排，
  切换条上的按钮位置就跟着挪 —— 写进 URL 之后「你看看方向三在夜里的样子」是一条能直接发出去的链接。
- **手机框按窗口高度收**：`height: min(812px, calc(100vh - 176px))`。
  框被切掉一半就看不到「这张卡跟邻居的间距」了 —— 而间距正是原型要回答的问题。

## WXML 搬到 HTML 的三个坑

原型用 WXML 的标签名（`<view>` `<text>`）写成，好让结构能当组件的蓝本看。
浏览器不认这两个标签，于是有三个坑：

1. **`<text />` 在 HTML 里不闭合。** WXML 允许自闭合，HTML 解析器不认 ——
   `<text class="x" />` 之后的**所有内容**都会变成这个元素的子节点。
   原型里一律写 `<text ...></text>`。
   症状很像布局 bug：本来排在下面的一行字跑到了图标旁边去了。
2. **`<text>` / `<view>` 是未知标签，默认 `display: inline`。** 原型里补一条
   `view { display: block } text { display: inline }`，要竖排的 `<text>` 自己写 `display: block`
   （与组件里的写法一致，见 `AstroCard` 的 `.astro__slot-label`）。
3. **同一优先级下后写的赢。** 「默认隐藏 + 按状态显示」这种写法里，
   变体规则如果自己又写一遍 `display`，就把隐藏规则顶掉了 —— 三个状态一起露出来。
   变体只写自己的样式，显示与否一律由状态属性那一条决定。

## 其它两个容易踩的

- `offsetTop` 相对的是 `offsetParent`，**不是滚动容器**。滚动定位用 `getBoundingClientRect()` 的差值。
- 同一份数据要填进多处时，脚本里用 `querySelectorAll('.js-xxx')` 一次填完，
  别在每个方向各写一遍 —— 漏一处就是「切到方向二温度还是 31°」。

## 原型里不要做的事

- **不要在原型里解决真机问题。** 真机的取舍（性能、包体、字体加载、wxss 编译）要在
  `docs/mp-weixin-platform.md` 里查，浏览器里跑得通不代表小程序里跑得通。
- **不要把原型里验证过的结论直接抄进组件。** 组件要落在项目的那一层：
  取数在 store，接口形状在 api，展示模型的换算在 utils，组件只管渲染与交互。
