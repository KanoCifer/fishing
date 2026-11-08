# 微信小程序：代码包、静态资源与真机兼容

平台约束见 `docs/mp-weixin-platform.md`。

## 主包与分包

- 主包上限 2MB，静态图直接进包；三个 tab 页在主包，五个非 tab 页各一个分包（about / my-spots / spot-create / spot-detail / spot-edit）。实测主包 956KB —— 还剩近 1MB，但那是留给代码的，别拿它去装满幅图。
- 分包 root 就是页面目录，`path` 写 `index`，页面 URL 与分包前一致；分包能引用主包的一切，主包引用不了分包。
- 产物由脚本生成、**不手改**：`pnpm assets` + `npx oxfmt`；`wxacode.jpg`→`wxacode.png` 进 spot-detail 分包。
- `.DS_Store` 会被 uni 抄进代码包，`pnpm build` 末尾跑 `scripts/clean-dist.mjs`。

### 勋章素材：绿幕 → 透明 → WebP

`raw/A/*.jpg` → key-medals.py → `master/A/*.png` 母版 768px → `pnpm assets` → `src/static/medals/A/*.webp` 512px 带 alpha。

- 抠图用「绿超出量」（`绿通道 - max(红,蓝)`）不用 HSV 绿色区间：色相被明度牵着走。
- 生图三坑：模型不一定给纯绿幕（暗绿最坏，放宽容差会吃掉金属暗部）；别在图上写字；勋章不能有绿色。验收看白底与深底两种底色；三套候选只发一套（全进包 1.1MB）。

## 静态资源

- 占位插画与应用 logo 各只露一面 → 出 `scripts/assets/cdn/` 上传 `VITE_CDN_BASE_URL`；⚠️ `cdn.kanocifer.chat` 必须配 **downloadFile 合法域名**，否则 `<image>` 与海报 `canvas.createImage()` 拿不到图。
- 天气页背景是**渐变**（`HERO_BACKDROP_GRADIENTS`），不是图：十一档天色各一段，纯 CSS，没有网络请求，也不占代码包。原来那十一张竖版满幅天空照片（CDN 上的与 `scripts/assets/weather/` 里的源图）连同 `scripts/optimize-assets.py` 里那批 job 一并撤下了。
- 背景是**一段天色**：没有地平线、没有山、没有水 —— 天气页说的是「此刻这片天」，不是「某个地方的那张风景照」。
- 十一档共用一套骨架（178deg、六个色标、色标位置相同），深色在上、亮色在下 —— 换档换的是颜色，不是结构。

## 真机兼容

### JS 引擎：两端不是一套

- iOS 跑 JavaScriptCore，Android 跑微信打包的 V8：`Array.prototype.at`、`Object.hasOwn` 两端不一致。
- 补法：`src/utils/polyfills.ts` 补齐、`main.ts` 模块顶层装上。
- `$set`/`$delete` 曾为 mp-html v2 补过（它内部 `this.$set(this, 'nodes', …)`），mp-html 已换成原生 `rich-text`，这层兼容随之删掉 —— Vue 3 本来就不需要它。

### marked 里的 ES2018 正则：整包白屏的真凶（已修）

- 安卓整包白屏：`common/vendor.js` 解析失败；开发者工具看不出来 —— babel 覆盖 `??`、`?.`，**不覆盖正则 Unicode 属性转义（8 条）与命名捕获组（2 条）**。
- 修法 `pnpm patch marked@18.1.1`：8 条属性转义换显式字符范围，2 条命名捕获组换按反引号个数枚举；**替换必须保持组数一致**（`((?:…))`），组数一变 `\1` `\2` 整体错位。

### 图标少一档：src 收到 null，页面少一枚图标

- 症状：`property "src" received type-incompatible value: expected <String> but get null value` —— 只在渲染层冒出来，页面上看不出少了什么，只少一枚图标（渔获行的删除键）。
- 成因：`icon()` 的退档规则是「取不到就退回 muted」，但清单里不是每个图形都生成过 muted（清单只列真正在用的配色）。少一档时表里两边都查不到 → 返回 `undefined` → 进了 `<image>` 的 src。
- TypeScript 拦不住：`ICONS` 是 `as const` 的字面量表，取出来的类型是字符串不是 `string | undefined`，`??` 那一侧看着永远有值。
- 修法：`icon()` 现在一定返回字符串（原色 → muted → 同一图形的任一档 → 空串）；缺档位由 `pnpm check:icons` 在构建期拦住 —— 扫出所有字面量 `icon()` 调用，对照 `scripts/gen-icons.mjs` 生成好的表逐条核对，少一档就让构建失败。

### 渲染特性有下限

- WXSS 不支持新特性时那条声明被**直接丢掉**，静默失效：`@property` 注册（Safari 16.4/Chromium 85，流光每 3 秒跳一下）、flex `gap`（14.5/84）、`inset: 0` 简写（14.1/87）。
- 躲法：`gap`→用 margin；`inset: 0`→四边分别写（尤其 `z-index: -1` 装饰层）；`@property`→注册不了退成两段关键帧。

### backdrop-filter 的代价按元素面积算

- iOS 上是 CoreAnimation 的模糊，便宜；安卓（X5/Chromium）上是真的一遍模糊采样，**按元素面积收费**。
- 天气页整页是一层天色，每张卡各自糊自己底下那一块：六张卡 + 九块磁贴就是十五份模糊。磁贴那一档因此比卡面小（照片面上 `--fish-blur-tile` 14px，`--fish-blur` 24px）—— 九块小的叠起来比一块大的更贵。
- 一条硬规则：**同一块底不要糊两次。** 卡里再套一张玻璃面（卡中卡），里面那张糊的是外面那张已经糊过的结果，视觉收益为零，开销翻倍。所以卡片内部的元素（磁贴、分段轨道）只给面色与描边，不给模糊。
- 骨架层不给模糊：它自己带 opacity 过渡，过渡期间它是 backdrop root，磁贴采样不到照片，blur 根本没生效过 —— 等它不淡出直接被摘掉，模糊也只剩一层壳。占位块不需要。
- 祖先上不能挂 opacity 入场动画（见 `docs/design-system.md`「动效」里 backdrop-root 那条）：背景在卡片祖先外面，祖先内部是空的，底断了糊的就是一片空。

### WXSS 编译器认不出的选择器：整页空白

- 这条**硬失败**（上面三条静默失败）：选择器里有编译器不认的语法，那份 WXSS 编译不过，用它的页面白屏；踩到的是通配 `*`，只有微信开发者工具不认。
- 躲法：别用 `*`，给孩子节点加样式就给它自己的类；**怎么验**：`wechatide compile_wxss --file-path <相对路径>.wxss` 单文件编译。

父组件 scoped 标记落在组件宿主节点上，层叠上下文见 `docs/mp-weixin-platform.md`「组件宿主节点不吃动画」「transform 会创建层叠上下文」。
