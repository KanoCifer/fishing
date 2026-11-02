# 微信小程序：代码包、静态资源与真机兼容

平台约束见 `docs/mp-weixin-platform.md`。

## 主包与分包

- 主包上限 2MB，静态图直接进包；三个 tab 页在主包，五个非 tab 页各一个分包（about / my-spots / spot-create / spot-detail / spot-edit）。
- 分包 root 就是页面目录，`path` 写 `index`，页面 URL 与分包前一致；分包能引用主包的一切，主包引用不了分包。
- 产物由脚本生成、**不手改**：`pnpm assets` + `npx oxfmt`；`wxacode.jpg`→`wxacode.png` 进 spot-detail 分包。
- `.DS_Store` 会被 uni 抄进代码包，`pnpm build` 末尾跑 `scripts/clean-dist.mjs`。

### 勋章素材：绿幕 → 透明 → WebP

`raw/A/*.jpg` → key-medals.py → `master/A/*.png` 母版 768px → `pnpm assets` → `src/static/medals/A/*.webp` 512px 带 alpha。

- 抠图用「绿超出量」（`绿通道 - max(红,蓝)`）不用 HSV 绿色区间：色相被明度牵着走。
- 生图三坑：模型不一定给纯绿幕（暗绿最坏，放宽容差会吃掉金属暗部）；别在图上写字；勋章不能有绿色。验收看白底与深底两种底色；三套候选只发一套（全进包 1.1MB）。

## 静态资源

- 占位插画与应用 logo 各只露一面 → 出 `scripts/assets/cdn/` 上传 `VITE_CDN_BASE_URL`；⚠️ `cdn.kanocifer.chat` 必须配 **downloadFile 合法域名**，否则 `<image>` 与海报 `canvas.createImage()` 拿不到图。
- ⚠️ 头图四张 21:9 横幅（3168×1344）也走 CDN，压进主包顶到 99%，**文件名带版本号**（`hero-sunny-v2.jpg`）；图没上传不是白板是那片天色。

## 真机兼容

### JS 引擎：两端不是一套

- iOS 跑 JavaScriptCore，Android 跑微信打包的 V8：`Array.prototype.at`、`Object.hasOwn` 两端不一致。
- 补法：`src/utils/polyfills.ts` 补齐、`main.ts` 模块顶层装上；同理补 `$set`/`$delete`（mp-html v2 在用），不补首渲白屏。

### marked 里的 ES2018 正则：整包白屏的真凶（已修）

- 安卓整包白屏：`common/vendor.js` 解析失败；开发者工具看不出来 —— babel 覆盖 `??`、`?.`，**不覆盖正则 Unicode 属性转义（8 条）与命名捕获组（2 条）**。
- 修法 `pnpm patch marked@18.1.1`：8 条属性转义换显式字符范围，2 条命名捕获组换按反引号个数枚举；**替换必须保持组数一致**（`((?:…))`），组数一变 `\1` `\2` 整体错位。

### 渲染特性有下限

- WXSS 不支持新特性时那条声明被**直接丢掉**，静默失效：`@property` 注册（Safari 16.4/Chromium 85，流光每 3 秒跳一下）、flex `gap`（14.5/84）、`inset: 0` 简写（14.1/87）。
- 躲法：`gap`→用 margin；`inset: 0`→四边分别写（尤其 `z-index: -1` 装饰层）；`@property`→注册不了退成两段关键帧。

### WXSS 编译器认不出的选择器：整页空白

- 这条**硬失败**（上面三条静默失败）：选择器里有编译器不认的语法，那份 WXSS 编译不过，用它的页面白屏；踩到的是通配 `*`，只有微信开发者工具不认。
- 躲法：别用 `*`，给孩子节点加样式就给它自己的类；**怎么验**：`wechatide compile_wxss --file-path <相对路径>.wxss` 单文件编译。

父组件 scoped 标记落在组件宿主节点上，层叠上下文见 `docs/mp-weixin-platform.md`「组件宿主节点不吃动画」「transform 会创建层叠上下文」。
