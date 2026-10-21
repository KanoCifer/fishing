# 设计系统

渔碌的界面是一套**材质系统**，不是一套配色。这份文档讲怎么在这套系统里加东西而不走样。

## 四件事同时成立

1. **材质分层。** 页面底是 systemGroupedBackground 的浅灰，卡片浮在上面 —— 靠**面**分层，不靠描边和阴影。Apple 的 inset-grouped 列表就是这个结构。
2. **发丝分隔线。** iOS separator 是 0.33pt，`$fish-border` 用 1rpx 就是那个量级。这套观感里最容易被忽略的一环，也是「重描边」最刺眼的原因。
3. **字阶。** 11 级固定字号，每级自带字重、字距、行高三件套。字号一变、字距不变，就是「Material 味」的来源。
4. **按下即反馈。** 可点的东西在**手指落下**那一帧就要有反应，不是抬手之后。见 `fish-press`。

## 令牌

全部在 `src/uni.scss`，按「颜色 / 字阶 / 间距 / 圆角 / 阴影 / 动效」分组。改那里就是改全项目。

这是**编译期常量**而不是 CSS 变量：canvas 2d 不解析 `var()`，只认 rgb/hex（见 `TideChart` 注释）；小程序端也没有 MutationObserver 监听主题切换。主题在编译期定死。

**canvas 侧的硬编码色值要手工与 `uni.scss` 保持一致** —— `$fish-tide`、`$fish-temp` 就是给这件事留的锚点。改了 uni.scss 里的色，canvas 里那几处也要跟着改。

## 字阶

```scss
@include fish-type(headline); // 分区标题
@include fish-type(body); // 正文
@include fish-type(caption2); // 落款
```

字阶是一组不可拆的决策（字号 + 字重 + 字距 + 行高），拆成四个变量之后每个组件都会各写各的，早晚错配。所以用 mixin：拼错一级会在编译期 `@error`，不会悄悄降级成一段没有字距的裸字号。

可选级别：`large-title` `title1` `title2` `title3` `headline` `body` `callout` `subhead` `footnote` `caption` `caption2`。

**只给文字用。** 图标字形（和风天气图标、★、✕）不要套 —— 字形没有排版语义，套上去会把行高顶到 1.25，在字形下面多留一截空白，把整行格子往下坠；字重和字距加在字形上更是无效代码。字形只写 `font-size` + `line-height: 1`。

## 材质

```scss
@include fish-glass; // 玻璃卡：半透明底 + 顶边高光 + 多层阴影
@include fish-glass-blur; // 只给「底下有内容在动」的面
```

`fish-glass` 刻意**不写** `backdrop-filter`：

- 静态卡片背后是平滑渐变，模糊一个平滑渐变，结果几乎和没模糊一样
- 每块 `backdrop-filter` 都是一个独立合成层，滚动时要重新糊一遍。数据页一次屏里有七八块，滚动帧率会被它拖垮

真正需要模糊的只有「底下有内容在动」的面（目前是常驻结论条）。模糊是**增强不是依赖**：WXSS 不保证支持，老基础库上这条声明会被直接丢掉 —— 所以每块玻璃面都自带半透明底色 + 顶边高光 + 多层阴影，层次靠阴影兜底，不靠模糊兜底。

## 页面骨架

三页（数据、我的、关于）是同一个 app 的三面，共用同一套骨架：

- 环境色底 → `<PageBackdrop />`（固定在视口上，不随内容滚走）
- 分区版式 → `uni.scss` 的 `fish-section` / `fish-eyebrow` / `fish-foot`
- 玻璃卡 → `fish-glass`

**新页面照抄这三页的骨架，不要另起一套。** 各写一份的话，改一次色要记得改两处，漏一处就出现「一页冷、一页暖」这种没法一眼说清、但一眼能看出的怪。

环境色底**不放在全局 `page` 底色上** —— 全局底色还得给 tabBar 切换时露出的那一帧兜底，也给钓点页的原生地图边缘兜底；一旦全局换成渐变，地图边缘会跟着染上颜色。渐层只属于「有内容的页面」，所以它是一个可以按页放下的元素。

### 分区

```vue
<view class="sect">
  <text class="sect__title" :style="{ animationDelay: enterDelay(0) }">天气</text>

  <LifeIndexCard class="sect__card" :style="{ animationDelay: enterDelay(0) }" />
  <MetricChart class="sect__card" :style="{ animationDelay: enterDelay(1) }" />
</view>
```

```scss
.sect {
  @include fish-section;
}
```

三条定死了「页面怎么分块」：分区自己左右缩进 32rpx（留白是页面级的，不留在各张卡里）；分区之间 40rpx（跨段是分组，比同段并列大一档）；同段内两张卡之间 32rpx。

分区用 flex 列而不是块级流：块级流会做外边距合并，两层留白叠在一起时算出来的数不是写下的那个数。

**分区间距由页面给，组件不再自带 margin-top。** 区块之间怎么分开是页面的版式决定，不是各组件自己的事。

### 落款

```vue
<text class="data__foot">数据来自和风天气 · 渔碌服务端</text>
```

```scss
.data__foot {
  @include fish-foot;
}
```

### 一页一件事

一个页面只回答一个问题。数据页给结论，我的页给身份，关于页给应用 —— 一个页面同时回答两个，两件事互相稀释。

### 浮层

浮层统一用 `SnapSheet` 容器。钓点详情、钓鱼反馈、资料编辑、AI 分析、协议文档抽屉五处共用同一个，才谈得上「同一个手势、同一种落位」。`SnapSheet` 只提供容器，标题区归页面。

## 动效

| mixin                | 用在哪                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `fish-enter($delay)` | 内容落位。骨架换实数据、分段切换时用                                                              |
| `fish-press($scale)` | 可点元素。手指落下就缩，抬手回弹                                                                  |
| `fish-press-dim`     | 分段控件 / 选项组。iOS segmented 按下是变暗不是缩小 —— 缩小会让选中块位置跳一下，读起来像换了一项 |
| `fish-flow`          | 流光按钮 —— AI 分析（`AIButton`、`FishingAnalysisSheet`）                                         |

**落位**只动 `transform` 和 `opacity` —— 这两条在小程序里走合成，不触发布局重排。换成 `top` / `height`，一屏四个分区一起动时每个兄弟节点都要跟着重排一次，掉帧几乎全出在这里。

位移刻意压得很小：`$fish-enter-y` 是 16rpx（8pt）+ 260ms 读作「本来就在这」，幅度再大就读作「飞进来了」，注意力被动画抢走，反而比不做更难读。

逐项延迟用 `enterDelay(index)`（`@/utils/motion`），步长 60ms、第 8 项封顶。逐时预报 24 项不封顶的话，最后一项要等 1.44s —— 那已经不是入场动画，是加载动画：用户等的是内容，不是等动画。

**降级开关在编译期**：`uni.scss` 的 `$fish-motion` 置 false 后 `fish-enter` 一段不生成，界面直接以终态呈现。WXSS 没有开放 `prefers-reduced-motion`，逻辑层也没有对应的系统 API —— 写一条不生效的媒体查询进去只会造成「已经处理过了」的错觉。

### 动画定义放哪

- **变量和 mixin** → `uni.scss`（要靠它拿值）
- **`@keyframes` 和 `@property`** → `App.vue` 的 `<style>`（全局一份）

`uni.scss` 会被每个用到它的组件各注入一份，写在那里的 `@keyframes` 会跟着复制十几遍同一个动画定义。

流光的 `--fish-flow-angle` 必须是注册过的 `@property <angle>`，否则关键帧对它只能离散插值，在 0deg 和 360deg 之间硬跳一次 —— 而这两端的 conic 渐变完全相同，等于流光根本不动，只是每 3 秒闪一下。

## 图标

图标是 `scripts/gen-icons.mjs` 从 lucide-static 生成的数据 URI，`src/constants/icons.ts` 是它的生成物。

小程序端不能把 `<svg>` 内联进 WXML（渲染层不认），能落地的只有 `<image src="data:image/svg+xml;base64,…">`。这条路上的 SVG 是当图片渲染的，**拿不到页面的 CSS 上下文，`currentColor` 不继承** —— 所以颜色必须在生成时烤死。这也是为什么 `gen-icons.mjs` 里那套色板要手工跟 `uni.scss` 对齐：CSS 变量传不进 `<image>`。

改图标：改 `scripts/gen-icons.mjs` 的 `ICONS` 清单 → `pnpm icons` → `pnpm type-check`。

清单刻意压着不加 —— 图标一多，页面就从「读数据」滑向「看图标」。

## 文案

文案在 `src/constants/about.ts`，页面里只有排版和交互。改文案改那个文件。

免责与协议三段是**初稿，不是法务稿** —— 上线前让法务过一遍，尤其是「用户协议」与「隐私政策」两篇。

## 单位

- **rpx** —— 设计稿尺寸。1pt = 2rpx（750 设计稿在 375pt 机型上）
- **px** —— 运行时量出来的尺寸（`useViewport` / `useNavMetrics`）

两者相加先过 `uni.upx2px()`。换算细节见 `docs/mp-weixin-platform.md`。

## 参考

- 偏好 `/apple-design` skill
- 令牌真源：`src/uni.scss`
- 图标真源：`scripts/gen-icons.mjs`
- 文案真源：`src/constants/about.ts`
