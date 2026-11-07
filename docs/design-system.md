# 设计系统

界面是**材质系统**加**动效系统**，落在小程序的能力边界内：没有弹簧引擎、没有 `backdrop-filter` 保证、没有 `prefers-reduced-motion`。真源 `src/styles/tokens/`。

## 令牌

- `src/uni.scss` **只有一行** `@use '@/styles/tokens/_index.scss' as *;` —— **不能再有变量声明**。
- 数值来源：**iOS App 设计速查表**（SF Pro）。字阶、文字色、间距、图标尺寸、按钮规格都从那里来。
- 令牌按主题分文件：`platform / color / type / space / control / depth / material / motion / layout / card`。
- **深浅两套值在 `src/styles/theme.scss`**：随主题变的那族令牌在 `_color.scss` 里写成 `var(--fish-ink, #000000)`，名字不变，实现换成 CSS 变量 → 770 处调用点一行没改。两套值集中在 theme.scss 的 `page, .page` 作用域里，靠 `@media (prefers-color-scheme: dark)` 翻。
- **颜色必须从令牌层取**：`scripts/check-hardcoded-colors.mjs` 扫源码，令牌层之外的硬编码色值一律失败（确属固定色的，在行尾标 `/* color-allow: 理由 */`）。

## 卡片

四个 mixin 在 `_card.scss`：`fish-card`、`fish-card-head`、`fish-card-title`、`fish-card-meta`。

## 材质与深度

- **圆角是轮廓，阴影是厚度**；**层次靠面，不靠描边**
- **锚面** `fish-anchor-face` 铺到屏幕顶承担当屏主语。**纸面** `fish-sheet` 从锚面下缘长出来、下面内容落在它上面，压住 60rpx，投影深蓝不是黑。

## 排版

- 字阶**不可拆**（字号 + 字重 + 字距 + 行高），mixin 拼错一级在编译期 `@error`。
- 三档正文级 + 一档主角数字：**18/22**（标题）、**16/20**（正文）、**14/18**（辅助），display 32pt 只给主角数字（它不是文字）。
- **字重只有 Regular 400 与 Medium 500** —— 速查表里 SF Pro 给的就是这两档，标题靠 Medium 与 Regular 拉开，不靠更重的字重。
- **字重是字阶之外唯一可调的一维**：要「正文尺寸但加重」写 `fish-type(body, 500)`，不要为此另开一级字号。
- 文字色两档：**#000000**（默认）、**#666666**（subtle）。中间还留着 `$fish-muted` 一档 secondary，速查表没覆盖。

## 控件

- **图标**：图标按**它旁边的字**配，不按统一档位套 ——
  导航图标 24pt（`$fish-icon-nav`，导航栏里那些）、
  图标键里的图形 20pt（`$fish-icon-key`）、
  标题行的前置图标 20pt（`$fish-icon-title`）、
  列表行的前置图标 28pt（`$fish-icon-list`，速查表里的列表图标）、
  徽标图标 16pt（`$fish-icon-badge`）。
  判据：图标比它标的字大，读的人先看见图标，「这一段叫什么」反而成了第二眼的事。
- **按钮**：高 44pt、横向留白 16pt（`fish-button`）；文字自己裹一层 4pt 留白（`fish-button-label`），文字与图标之间**不留缝**（`fish-button-content`）—— 图标是文字的一部分。
- **列表行**：上下 12pt、左右 20pt（`fish-list-row`）。装列表行的卡片用 `fish-list-card`：横向留白交给行，标题行用同一档内缩，于是整张卡的内容对齐在同一条竖线上。
- 地图工具条是压在原生 map 上的控件，按钮尺寸另有一套，不走图标分档（见 FullscreenMap）。

## 反馈

- **按下即反馈**：`:active` 在 touchstart 触发；按下 100ms、回弹 260ms 靠两条 transition 的时长差实现，**两处必须都写**。

### 触觉

`uni.vibrateShort` 收在 `src/utils/haptics.ts` 一处。**判据只有一条：结果会不会在一两秒内从屏幕上消失。** 吸附 `light`、成功 `medium`、失败 `heavy`。

## 动效

- **曲线即弹簧**：没有弹簧引擎，只能近似成 cubic-bezier；`$fish-spring` 临界阻尼，末端减速不回头。**落位只动 `transform`+`opacity`**，`enterDelay(index)` 步长 60ms、**第 9 项封顶**。
- **交叉淡入**（同一位置换内容）：两态叠在同一个格子里，旧态淡出、新态淡入，160ms `$fish-dur-cross`、位移 4rpx。mixin `fish-cross-in`（新态，挂载即播）与 `fish-cross-out`（旧态，类一切就淡）；骨架摘除时机在 `composables/useCrossFade`。

### 动画定义放哪

- **变量和 mixin** → `src/styles/tokens/`；**`@keyframes` 和 `@property`** → `App.vue` 的 `<style>`（全局一份）。流光的 `--fish-flow-angle` 必须是注册过的 `@property <angle>`。

## 手势与浮层

浮层统一用 `SnapSheet` 容器，六处共用。**1:1 跟手**：拖拽期间必须关掉 CSS transition。**松手判定**：位置阈值 80px 与速度阈值 500px/s 二者取其一即触发。

## 页面骨架

| 页面                       | 骨架                         |
| -------------------------- | ---------------------------- |
| 数据、我的、关于、我的钓点 | 环境色底 + 分区版式 + 玻璃卡 |
| 钓点创建、钓点编辑         | 环境色底 + 表单流            |
| 钓点详情                   | 照片压顶 + 底栏浮在内容上    |
| 记录                       | 满幅头图 + 玻璃卡 + 横滑条   |

**新页面照抄这几页的骨架** —— 漏改一处就「一页冷、一页暖」。环境色底**不放全局 `page`**（还要给 tabBar 切换与地图边缘兜底）。

- **首屏定高**：概览取 `windowHeight`，**不用 `100vh`**（`100vh` 是屏幕高，会多出一截可滚动范围）。自定义底栏是浮层、`windowHeight` 里含它 —— tab 页的底部用 `fish-tabbar-inset` 让开。**钓点详情**：一屏定内容，头图 280pt，描述限两行，结论前置。**记录页**：满幅头图 + 日历索引。**我的页**：身份卡 + 两组出口。
- **分区**：左右缩进 32rpx，分区之间 56rpx（28pt），同段内两张卡之间 32rpx，标签到它下面那组内容 24rpx（12pt）；分区间距由页面给，组件不再自带 margin-top。

### 一件事只说一遍

**同一件事在一屏里说两次，等于一次都没说。** 判据：**把这一屏的文字念出来，同一个事实出现两次，删到只剩一次** —— 交给「本来就该说这件事的东西」。

**谁来说，事先分好：**

| 事实             | 归谁说   | 长什么样                         |
| ---------------- | -------- | -------------------------------- |
| 现在什么状态     | 状态控件 | 一枚胶囊 / 一枚徽章，只报状态    |
| 现在能做什么     | 按钮     | 文案就是动词：生成 / 停止 / 重来 |
| 还没发生、占着位 | 占位文案 | 一句**问句**，不是操作说明       |

占位文案不能是操作说明；状态徽章和按钮文案重复时删徽章。

## 图标

图标是 `scripts/gen-icons.mjs` 生成的数据 URI；WXML 不认 `<svg>`，`currentColor` 不继承，颜色必须在生成时烤死。

## 单位

**rpx** 是设计稿尺寸（1pt = 2rpx），**px** 是运行时量出来的尺寸；相加先过 `uni.upx2px()`。

## 现状缺口与待办

1. **浮层退场期间不接手势。** 改：退场可打断，别等播完才摘节点。
2. **拖拽到边界是硬夹。** `heightPx` 被 `Math.min`/`Math.max` 夹住。改：超界按比例衰减（Apple 的渐进阻力）。
3. **松手不做动量投影。** 改：用速度投影出落点再吸附最近档。
4. **抬手不交接速度。** 改：得走 WXS 或 `this.animate` 视图层路径。
5. **触觉只覆盖了少数落点。** 改：先不动。
6. **只有临界阻尼一种手感。** 曲线里没有过冲的一档。改：加一条低阻尼曲线，**只用在有惯性手势之后**。
7. **拖拽全在逻辑层。** 改：真要更跟手迁到 WXS；先不做。
8. **降级开关盖不住浮层自己的关键帧。** `$fish-motion` 置 false 后页面不演了，`SnapSheet` 的面板关键帧没跟着关。改：关键帧与退场时长挂到 `$fish-motion` 下。
9. **降级开关盖不住数字滚动。** 概览的分数是滚出来的（`utils/motion.ts` 的 `createCountUp`）；`$fish-motion` 置 false 后页面不演了数字还在演。改：开关搬到 SCSS 与 JS 都读得到的地方；代价是构建链改造，先不做。

## 参考

- 平台坑位：`docs/mp-weixin-platform.md`；偏好 `/apple-design` skill
