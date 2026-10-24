# 微信小程序平台约束：运行时与界面

只有一个目标平台：mp-weixin（`componentFramework: glass-easel`）。这份文档讲平台给的
限制和它们的绕法。网络、权限与微信能力见 `docs/mp-weixin-network.md`；
包体与真机兼容见 `docs/mp-weixin-package.md`。

## 运行时

平台能力走 `uni.*`：

| 要做的       | 用这个                                              |
| ------------ | --------------------------------------------------- |
| 发请求       | `uni.request`                                       |
| 读存储       | `@/utils/storage` 的 `readStorage` / `writeStorage` |
| 定位         | `uni.getLocation`                                   |
| 窗口尺寸     | `uni.getWindowInfo()`                               |
| 胶囊按钮矩形 | `uni.getMenuButtonBoundingClientRect()`             |
| 加载网络字体 | `uni.loadFontFace`                                  |
| 选节点       | `@/utils/selectorQuery` 的 `createSelectorQuery`    |
| 取帧         | canvas 节点自带的 `requestAnimationFrame`           |

`getSystemInfoSync` 在微信端已废弃 —— 尺寸和 dpr 一律从 `getWindowInfo()` 取。

## 存储

读写 Storage 走 `@/utils/storage`，**不要直接调 `uni.getStorageSync`**。

小程序没有 localStorage，存储只能走 `uni.*Storage`，而每次读写都要穿过逻辑层与宿主之间的桥，比读一个普通属性贵得多。更贵的不是单次调用，是**同一个 key 被反复读**：一条带鉴权的请求链里，拼 header 读一遍 token、刷新守卫再读一遍 token、恢复会话还要再读一遍 —— 读出来的是同一个字符串，问的还是宿主里同一块存储。

`@/utils/storage` 给每个 key 留一份内存副本：第一次读真的落下去，之后都从副本取，写和删同时更新副本。副本和 Storage 不会不同步，因为**所有**写入都必须走这个模块 —— 项目里没有第二处直写 Storage 的地方（`pnpm lint` 的 `no-undef` 管不到这一层，新增直写时自己留意）。

同一份道理，`useViewport` / `useNavMetrics` 也是「算一次就缓存」：尺寸在一次启动内不变，存储在一次进程内也不该被反复读。

一条纪律：**改一个值必须整份写回去**。缓存里放的是整个值，就地改它既不会同步到 Storage，也不会更新缓存。

### 启动链路上一次同步 Storage 读都不该有

微信体检有一条「首屏渲染前多次调用同步 API」。判定范围比 `Sync` 后缀宽：
`uni.getWindowInfo()`、`uni.getMenuButtonBoundingClientRect()` 名字里没有 `Sync`，
但它们是同步的，会阻塞 JS 线程。启动阶段（`App.onLaunch` ~ 首页首屏渲染完成）
调用它们的次数会被记成一条未通过。

**启动期就要用的值走异步读。** `readStorageAsync` 用的是 `uni.getStorage`
（异步，不阻塞），配合 `api/client.ts` 的 `ensureTokensLoaded()`：
发请求前 await 一次，token 就进内存了。

⚠️ 改异步之后有配套纪律：**任何要拼 Authorization 的地方都得先
`await ensureTokensLoaded()`** —— 读回来之前 `getToken()` 返回空串，
带着空串发出去的请求会被服务端判成未登录。当前这几处都改了：
`api/client.ts` 的 `request`、`api/auth.ts` 的 `logout` 与 `uploadAvatar`、
`api/upload.ts` 的 `uploadImage`、`api/stream.ts` 的 SSE
（它的请求要等 token 读回来才发，所以 `streamSse` 把 `uni.request` 挪进了 `start()`）。

### `uni.getDeviceInfo()` 会顺带读一次同步 Storage

这条最容易漏：uni 运行时的 `getDeviceInfo` / `getSystemInfo` / `getAppBaseInfo`
三个协议都会调 `useDeviceId()`，它内部是 `wx.getStorageSync('__DC_STAT_UUID')` ——
**一次同步 Storage 读**，而且发生在 App 启动阶段。

本项目踩到的具体位置是 `mp-html`：它的 `parser.js` 在**模块顶层**调
`uni.getDeviceInfo()`（为了判断是不是 iOS），而 mp-html 被打进
`common/vendor.js` —— App 一启动就执行。体检于是记了一条
「首屏渲染前多次调用同步 API」：`App` 上下文一次、`pages/fishing/index` 一次。

解法是打 pnpm 补丁（`patches/mp-html@2.5.2.patch`）：把 `system` 改成惰性取，
用到（`selectable === 'force'`）时才调。**升级 mp-html 时这个补丁要跟着重做** ——
pnpm 会在补丁打不上时直接报错，不会悄悄失效。

排查这类问题别只 grep `Sync`：同步 API 的判定范围是运行时的白名单，
第三方库在模块顶层调一次 `uni.getDeviceInfo()` 就够记一条。

## 高度

**`100vh` 把原生 tabBar 的高度也算进去了。** 本项目三个页签都是 tabBar 页，页面按 100vh 铺满的话，实际高度比「真正能显示的那部分」高出一个 tabBar（约 50px）—— 页面于是变成可滚动的：多出来的那一截就是用户能拖出去的范围。

在地图页上这个多出来的 50px 表现得很明显：双指在地图上滑动被 WebView 接管成页面滚动，整页跟着滑，地图被拖离原位；iOS 上还叠加一层橡皮筋回弹。

用 `uni.getWindowInfo().windowHeight` —— tabBar 页面上它不含 tabBar 高度。

```ts
const { windowHeight } = useViewport(); // @/composables/useViewport
```

全屏铺底的页面用它当 `height`；有内容要滚的页面用它当 `min-height`。

### 窗口快照：同步 API 只调一处

`uni.getWindowInfo()` 与 `uni.getMenuButtonBoundingClientRect()` 都是**同步 API**（名字里没有 `Sync`，但会阻塞 JS 线程），一次启动里各调一次就够。

两份缓存各切一把刀会漏：`useNavMetrics` 缓存胶囊矩形、`useViewport` 缓存窗口尺寸，
于是 `getWindowInfo` 被打了两遍，而两遍拿的是同一份数据。

**正确做法是共享一份快照**：`src/composables/windowMetrics.ts` 取一次，
`useNavMetrics` / `useViewport` / 三个图表组件全部从这一份读字段。

⚠️ 别为了「减少同步 API」把 `useNavMetrics` / `useViewport` 改成异步 ——
它们的返回值在 8 个页面里被消费，改形状等于改所有页面。要加字段就从快照上加。

## 导航栏

四个页面都配了 `navigationStyle: "custom"`，导航栏成了浮层，页面所有顶部内容都得自己让开。

```ts
const { navBarBottom, capsuleInsetRight, statusBarHeight } = useNavMetrics();
```

返回值单位统一是 **px** —— 来自运行时 API，和手写 rpx 不是同一套单位。rpx 间距要跟这些值相加，先过 `uni.upx2px()`。

导航栏是浮层（fixed），不在内容流里 —— 把它放在带 padding 的内容层**外面**，让位只由 `padding-top` 算一次。放进内容层里，导航栏会被顶到 `navBarBottom` 之下，返回键整整低了一个导航栏的高度。

胶囊矩形是微信小程序独有的 API，基础库 2.7.1 起提供。只有小程序端，不存在「拿不到胶囊」的运行环境，所以直接用。

## 选择器查询

用 `@/utils/selectorQuery` 的 `createSelectorQuery(instance)`。**不要直接写** `uni.createSelectorQuery().in(instance)`：

1. uni 的 `.in()` 内部读的是 `component.$scope`。传 Vue 内部实例时 `$scope` 取不到，会退化成一份字段全是 undefined 的 mock，作用域等于没限定
2. glass-easel 下 `wx.createSelectorQuery()` 走兼容层，比实例上的 `createSelectorQuery()` 慢一截 —— 微信官方适配指引把这条列为「应尽量使用后者」

## 测量与动画互斥：先量后动

`SelectorQuery.boundingClientRect()` 量的是**当下**那个盒子。元素身上带着 `transform` 时，量到的就不是它的布局尺寸 —— 面板入场动画里有 `scale`，量出来的高度会按缩放比例缩水，滚动区就凭空短一截（内容被底部动作区盖住一截）。

所以顺序要反过来：**先量，再动**。

`SnapSheet` 现在的做法：

1. 面板挂上去，但入场动画按住不动（`--preparing`：`animation: none` + `opacity: 0`）
2. `nextTick` 之后量头部、正文、底部动作区
3. 量完撤掉 `--preparing`，动画从头播

顺带两条：

- 测量窗口里**不要用位移把元素挪出屏幕**。位移不改尺寸，量到的仍然是真高度；但节点离屏会不会影响查询结果，不值得赌 —— 靠 `opacity: 0` 藏起来就够。
- 量高回不来要有兜底。回调不回来时面板会一直停在「藏着」的状态，等于浮层打不开。`SnapSheet` 给的是 400ms 兜底：宁可先用估值高度出场。

## canvas

- **小程序端没有内联 SVG —— WXML 不认 `<svg>` 标签。** 想画环、画路径、画图表，一律走 canvas 2d。
  （浏览器原型里用 SVG 画的效果很好，但那份代码落不回 `src/`：原型目录 `prototypes/` 不进版本库，
  能留到仓库里的只有这条结论本身。）
  SVG 只有一种用法：转成 data URI 塞进 `<image>` 的 `src`，当作一张静态图显示 ——
  但那样就动不了，`<image>` 里没法逐帧改。
- **canvas 2d 不解析 `var()`**，只认 rgb/hex。所以主题是编译期常量，canvas 侧色值硬编码，**要与令牌层 `src/styles/tokens/_color.scss` 手工保持一致**（`$fish-tide`、`$fish-temp` 是锚点）
- **canvas 的字体族要抄 `$fish-font`**，不能写裸 `sans-serif` —— iOS 上 `sans-serif` 落到的是 Helvetica，`-apple-system` 才是 SF Pro（见 `src/utils/poster.ts` 的 `FONT_STACK`）
- dpr 从 `uni.getWindowInfo().pixelRatio` 取
- 画布尺寸先 `uni.upx2px()` 换算成 px
- **逻辑层没有全局 rAF**，取帧走 canvas 节点自带的 `requestAnimationFrame`（基础库 2.7.0+），见 `LineChart` 顶部的类型声明
- **要导出成文件的画布，位图按设计分辨率铺，显示尺寸交给 CSS。** 按「CSS 尺寸 × dpr」铺位图，导出时就得把它放大回设计尺寸 —— 存下来的是放大件，字和码都糊
- **`createImage()` 的 src 只认网络地址与 base64 Data URI**（基础库 2.11.0 起）。代码包里的本地文件不在承诺里，要先 `getFileSystemManager().readFile({ encoding: 'base64' })` 读出来再给画布（见 `src/utils/canvasImage.ts`）
- **SVG data URI 在 `<image>` 里能显示，但 canvas 的 `createImage()` 吃它没保证** —— canvas 里要图标就用路径画（见 `src/utils/poster.ts` 的 `mapPin`）

## 字体

图标字体走 `wx.loadFontFace` 网络加载：

- 字体域名必须在微信后台配成 **downloadFile 合法域名**，否则加载失败，页面上所有天气图标变成豆腐块（私用区位码位在系统字体里没有对应字形）
- 字体托管在**自建 CDN**（`cdn.kanocifer.chat/qweather-icons.woff`），和静态图同一域名 —— 合法域名与预解析名额都是共用的，少一个域名就少一份配置
- **换字体文件必须连码位映射表一起重算**：`src/styles/generated/qweather-icons.css` 的「码 → 私用区位」是和风自己定的，不是顺序排的。换一份字体、只改 URL，图标就会变成豆腐块。重算走 `scripts/subset-qweather-icons.py`（断言会当场炸）
- 主包里只留「码 → 字形」的映射规则（`src/styles/generated/qweather-icons.css`，4 KB）。字体本体不再 base64 内联（那版是 40 KB）
- 字体族名必须与 css 里 `.qi` 的 `font-family` 完全一致：`qweather-icons`
- `global: true` —— 图标散在好几个页面里，逐页注册会漏
- `desc` 三项都要给，uni 的类型里 `variant` 是必填的（微信文档说它可选）
- `success` 不代表字体真的加载上了，要看 `res.status === 'loaded'`
- 加载失败不致命：读数全是文字，图标没了照样能读。所以只记状态，不弹 toast 打扰用户
- 状态是模块级单例 ref —— 小程序所有页面共用一份逻辑层，组件 import 到的都是同一个 ref
- **加载时机是数据页 `onMounted`，不是 `App.onLaunch`** —— 73 KB 走网络，挂在启动链路上就是一条冷启动长请求。三张消费它的卡（`HourlyWeather` / `WeekStrip` / `AstroCard`）都有 `v-if="qweatherFontReady"` 兜底，字体晚到不会出豆腐块

## 原生 map

`<map>` 是原生组件，层级最高 —— **遮罩拦不住它的手势**。

浮层打开时要把地图的手势关掉，否则拖抽屉时背后的地图会跟着动：

```vue
<FullscreenMap :interactive="!spotDetailOpen" />
```

`interactive` 控制 `enable-zoom` 和 `enable-scroll`。

地图铺满整屏时高度由脚本绑定 `windowHeight`，不用 `100vh` —— 理由见上面「高度」。

### 底图：卫星与路况是两个独立开关

`enable-satellite` 和 `enable-traffic` **可以同时为真**，原生地图会画成「卫星影像上叠一层实时路况」。
它们不是互斥的档位 —— 把两者合成一个枚举，就等于把这个组合从界面上拿掉了，
而「开着卫星图看路况」是常事。

工具条因此是两枚独立开关键（各自有开 / 关两态），不是一个循环切档的键。

### 视口与 regionchange

缩放卡顿、地图回弹这两件事，同一个根因：**`latitude` / `longitude` / `scale` 是受控属性，
微信收到 setData 时会拿属性里的中心重新定位。** 手势还在进行时写回这三个值，
写进去的是「手指刚按下那一刻的位置」，而地图已经挪远了 —— 地图被按回去，
手指和地图互相拉扯，缩放就卡、就会弹。

- **手势进行中一个 patch 都不能有。** 事件来了只记下地图此刻的位置，等手势停了再一次性写回
  （`FullscreenMap` 里是攒着 + 200ms 防抖）。写回一次就是一次 setData，事件来一次写一次就成风暴
- **写回的值要全量同步。** 三个值必须一起写：少一个就会弹回中心（只改 `scale` 而
  `latitude` / `longitude` 留着旧值，微信照样按旧中心重新定位）
- **写回之后受控属性要贴着地图的真实视口。** 这是防回弹的根据：之后任何一次 patch
  传下去的都是「本来就在的位置」，等于没动
- **`causedBy === 'update'` 的事件要丢。** 那是地图被 setData 挪动之后回报的回声，
  不丢就绕成 `regionchange → 写回 → setData → 又 regionchange` 的死循环
  （电脑端表现成地图一直转圈重载）
- **比对阈值按缩放层级换算成一个像素**（`360 / (256 * 2^scale)`）。定得太小的话，
  地图每次回报都被判成「用户又挪了地图」，循环停不下来
- **迟到的定位结果不能覆盖用户手势。** `uni.getLocation` 是异步的，回来的那一瞬用户
  可能刚好拖开了地图；这时候把地图拉回定位点，就是在用户手指底下抢方向盘。
  定位键（用户明确按的）除外
- **改无关数据不会把地图属性带下去。** uni-app 的 mp-weixin 运行时按 key 差分，
  `setData` 只带变化的那几个键（编译产物里工具条的 class 与地图的经纬度是同一份
  data，但只会发变化的那个）。老的「改任何 data 地图就回弹」是 mpvue 时代
  整页 setData 的毛病，现在不成立 —— 别再按那个前提写代码

regionchange 的官方语义（微信 map 组件文档「regionchange 返回值」）：

```js
e = { causedBy, type, detail: { rotate, skew, scale, centerLocation, region } };
```

- 视野改变时触发两次，`type` 分别是 `begin`（开始）和 `end`（结束）；
  手势过程中它会连着来 —— 手每挪一下视野就是一次「改变」
- `causedBy` 在 `begin` 阶段是 `gesture`（手势触发）/ `update`（接口触发），
  在 `end` 阶段是 `drag`（拖动导致）/ `scale`（缩放导致）/ `update`（调用更新接口导致）
- 中心点在 `detail.centerLocation` 里，**不在 `detail` 顶层**。读顶层拿到的是
  `undefined`，经纬度压根没同步 —— 这正是弹回用户位置的直接原因

### MapContext 能做什么

想「用命令式 API 挪地图」之前先看清楚 mp-weixin 的 `MapContext` 有什么：
`getCenterLocation` / `getScale` / `getRegion` / `moveToLocation` / `includePoints` /
`translateMarker` / `addMarkers` … **没有 `setScale`，也没有「设置中心点」。**

- 想把地图挪到某个点，只能改绑定属性 —— `includePoints` 倒是能挪，但它自己决定缩放
  层级，语义不是「聚焦到某个点，缩放 16 级」
- `moveToLocation` 只能回当前定位点，且它挪完受控属性并不知道这件事，
  受控属性与地图对不上，下一次 patch 就把地图拽回去
- 所以「挪地图」一律改绑定属性；「读地图当前视口」才用 `MapContext`

## 自定义事件不能与原生事件同名

小程序的 `bind` 系列属性绑在**自定义组件**上时，如果事件名正好是原生事件名，微信会让它同时接住两条路：

1. 组件内部 `triggerEvent` 派发的一条（Vue 的 `emit` 在小程序端就是这么实现的）
2. 组件内部原生事件冒泡出组件边界的一条

同一个监听器被打两次。踩过的两处：

| 组件            | 事件名      | 现象                                                |
| --------------- | ----------- | --------------------------------------------------- |
| `FormRow`       | `tap`       | 点一次「位置」栏弹出**两个**选点页                  |
| `FullscreenMap` | `markertap` | 点一个 marker **push 两层**钓点详情页，返回要点两次 |

`FullscreenMap` 那处尤其阴：`<map>` 的 `markertap` 被 uni-app 编译成**冒泡版**的 `bindmarkertap`，原生事件会冒泡出组件，父组件上的 `@markertap` 照收不误。

**规则：自定义事件的驼峰或加后缀。** 小程序的原生事件名全是全小写（`tap` / `markertap` / `regionchange` / `change`），所以 `select` / `markerTap` / `regionChange` 这类名字天然不冲突。uni-app 编译后是 `bindmarkerTap` 这种带大写的属性名，微信不会拿它去匹配原生事件。

判断某个自定义事件名安不安全的办法：看组件**内部**有没有同名原生事件会冒泡到根节点。

- `FormRow` 内部根节点有 `@tap` → 自定义事件不能叫 `tap`
- `ChoiceChips` 内部只有 `@tap`，它 emit 的是 `change` → `change` 安全（内部不产生原生 `change`）

## 组件宿主节点不吃动画

小程序的样式隔离（`styleIsolation`，默认 `isolated`）把「页面的样式」和「组件内部的节点」隔开了。
但真正咬人的不是隔开，是**宿主节点本身**：自定义组件在页面的 WXML 里就是一个标签
（`<spot-detail-head class="…" />`），页面样式能匹配到它，
**但挂在这个标签上的 `animation` 不会动。**

症状特别像「样式没生效」：类名写了，`animation` 也编译进 wxss 了，
`animation-delay` 的行内样式也在，唯独屏幕上纹丝不动。

**实测**（微信开发者工具 · iPhone 17 · glass-easel webview，2026-10）：

| 写法                                                 | 结果     |
| ---------------------------------------------------- | -------- |
| 页面里的普通 `<view>` + 页面 wxss 里的 `animation`   | 动       |
| 组件**内部**的节点 + 组件自己 wxss 里的 `animation`  | 动       |
| **组件标签**（宿主节点）+ 页面 wxss 里的 `animation` | **不动** |

第三行是坑：宿主节点上的 `class` 样式（背景、间距）是生效的，**只有动画不生效**。

**做法**：要动的是组件外面那一层 —— 在页面里给组件套一个普通 `<view>`，动画挂在这个 view 上。

```html
<!-- 不动：动画挂在组件标签上 -->
<SpotDetailHead class="spot-detail__enter" :style="{ animationDelay: enterDelay(1) }" />

<!-- 动：动画挂在普通 view 上 -->
<view class="spot-detail__enter" :style="{ animationDelay: enterDelay(1) }">
  <SpotDetailHead />
</view>
```

套层不改版式：里面是块级组件、外层也是块级 view，
组件根节点自己的上边距照样向上合并，间距一个字都不会变。

**这条现在不只是「动不起来」，而是「永久隐形」。**
入场动画的初始状态（`opacity: 0`）写在类上（见令牌层 `_motion.scss` 的 `fish-enter`），
类样式对宿主节点**是生效的** —— 所以宿主节点会拿到 `opacity: 0`，
而它的动画又不动，永远停在这个状态：内容不见了，而且没有任何报错提示。

也就是说：**凡是带入场动画的类，只能挂在普通 `<view>` 上**。
这条从「动画不生效」的坑升级成了「内容消失」的坑，症状更难查。

顺带记一条容易记错的：**`@keyframes` 写在 `app.wxss` 里，组件内部是可以用的**。
样式隔离挡的是「选择器匹配到组件内部的节点」，不是「关键帧的名字解析」。
所以 `fish-enter` / `fish-enter-media` 放在 App.vue 是安全的，
组件内部直接 `animation: fish-enter …` 就能用，不必每个组件再抄一份关键帧。

## 动画 API：别用 `uni.createAnimation`

本项目的动效一律走 CSS transition / `@keyframes`。小程序自带的 `uni.createAnimation`
（编译到 `wx.createAnimation`）有三条平台层面的限制。

**它是旧 API。** 微信文档原话：基础库 2.9.0 起支持 `this.animate`，
「用于代替旧的 wx.createAnimation，它具有更好的性能和更可控的接口」。
`createAnimation` 是被替代的那一个。

**它的 `timingFunction` 只有七个枚举值** —— `linear` / `ease` / `ease-in` /
`ease-in-out` / `ease-out` / `step-start` / `step-end`，
**不支持 cubic-bezier**。本项目的动效曲线全是自定的
（`$fish-ease-out`、`$fish-spring`，见 `src/styles/tokens/_motion.scss`），
一条都表达不出来。

**它要跨线传输。** `export()` 返回的是一个 `actions` 数组，
得从逻辑层 setData 到渲染层才生效；CSS 动画在视图层本地跑完，运行时零 JS 开销。
而且 `export()` **每次调用都会清空之前的动画队列**，重播得重新导一份。

需要「关键帧由运行时算出来」（比如滚动驱动的进度动画）时，
对应物是 `this.animate` + `ScrollTimeline`（基础库 2.9.0+，**仅 WebView 渲染引擎支持**），
不是 `createAnimation`。

## 动画性能：自查线与两条例外

小程序的动效分两条线走，各有各的瓶颈：

- **视图层本地跑的 CSS 动画** —— transition / `@keyframes` 由渲染引擎直接执行，逻辑层不参与，运行时代价为零。这是本项目所有动效的默认路径。
- **逻辑层驱动的 canvas 绘制** —— 逻辑层算完坐标，命令跨线送到渲染层。每一帧都是一笔跨线开销，所以「每帧少画一点」比「动画短一点」值钱。

### 自查线

| 现象                                   | 判据                                              | 本项目的做法                                                               |
| -------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| 用 JS 逐帧改样式                       | 出现 `uni.createAnimation`，或在 rAF 里改响应式值 | 一律不用，见上一节                                                         |
| 动 `left` / `top` / `width` / `height` | 会触发 Layout，低端机必掉帧                       | 只动 `transform` / `opacity`；`fish-enter` 还带 `translateZ(0)` 强制合成层 |
| 滚动回调里高频写响应式值               | 每次写都是一次跨线 setData                        | 只写**布尔阈值**（`scrollTop > 8`），跨过阈值才触发一次渲染                |
| canvas 每帧整张重画                    | 死内容（网格、刻度）被重画了几十遍                | 静态层/动态层拆两块画布，刻度只画一次（`LineChart` / `TideChart`）         |
| 大模糊阴影叠在逐帧变化的元素上         | 阴影每帧重新光栅化，比改高度贵得多                | `SnapSheet` 拖拽期间去掉投影，松手回来                                     |

`will-change` 不加。WXSS 里它的收益不稳定，而长期挂着会占 GPU 内存；
`translateZ(0)` 已经够把动画元素抬到合成层。

### 两条例外

**一、底部浮层的高度动画不能用 transform 代替。**

通则是「别动 height」，但底部浮层是例外：面板贴底生长，动作区（按钮）在面板**底部**。
用 `translateY` 表达「面板变矮」的话，面板底边会跟着往下跑，按钮直接被顶出屏幕。
面板高度是语义本身（几个档位、每档多高），只能真的改 height。

代价是拖拽时每一帧都要重排面板的子树。所以能省的都省了：拖拽期间关掉 40rpx 的大模糊投影
（见上表），滚动区高度与面板高度同源，避免两处高度各算一遍。

**二、`animation-fill-mode` 用 `both` 不是偷懒。**

低端机上 `both` 偶尔会跳帧，但这里必须用它：入场动画带序号延迟，
延迟期间元素要停在 `opacity: 0`（不可见）。用 `none` 的话，延迟的那几百毫秒里
元素是**完全可见的**，然后突然又从 0 开始淡入 —— 闪一下再重来，比跳帧更难看。

### WXS：目前用不上

跟手动画（拖拽、滑块、滚动联动）在小程序里应该用 WXS，让事件在视图层处理、
直接改样式，完全绕过逻辑层通信。

本项目只有一处连续手势：`SnapSheet` 的浮层拖拽。它**确实每帧都在改高度**
（`heightPx` 跟着 `touchmove` 走），所以「拖到某一档、松手落位」这个说法只对
**松手之后**成立，拖拽过程本身是 1:1 跟手的（设计意图见 `docs/design-system.md`
的「手势与浮层」）。

之所以仍然不用 WXS：跨线传的是**一个数字**（高度），不是一帧一帧的样式，
拖拽区域又只在把手条上 —— 每帧一次 setData 的代价目前可以接受。

真要加更重的跟手动画（比如图表上可拖动的准星），先想清楚能不能用 WXS，
而不是在逻辑层 `setInterval` 里改 `style`。
