# 微信小程序平台约束

只有一个目标平台：mp-weixin（`componentFramework: glass-easel`）。这份文档讲平台给的限制和它们的绕法。

## 运行时

小程序**没有浏览器运行时**。`document`、`window`、`localStorage`、`sessionStorage`、`fetch`、全局 `requestAnimationFrame` 都不存在。

平台能力走 `uni.*`：

| 要做的       | 用这个                                           |
| ------------ | ------------------------------------------------ |
| 发请求       | `uni.request`                                    |
| 读存储       | `uni.getStorageSync` / `uni.setStorageSync`      |
| 定位         | `uni.getLocation`                                |
| 窗口尺寸     | `uni.getWindowInfo()`                            |
| 胶囊按钮矩形 | `uni.getMenuButtonBoundingClientRect()`          |
| 加载网络字体 | `uni.loadFontFace`                               |
| 选节点       | `@/utils/selectorQuery` 的 `createSelectorQuery` |
| 取帧         | canvas 节点自带的 `requestAnimationFrame`        |

`getSystemInfoSync` 在微信端已废弃 —— 尺寸和 dpr 一律从 `getWindowInfo()` 取。

## 高度

**`100vh` 把原生 tabBar 的高度也算进去了。** 本项目三个页签都是 tabBar 页，页面按 100vh 铺满的话，实际高度比「真正能显示的那部分」高出一个 tabBar（约 50px）—— 页面于是变成可滚动的：多出来的那一截就是用户能拖出去的范围。

在地图页上这个多出来的 50px 表现得很明显：双指在地图上滑动被 WebView 接管成页面滚动，整页跟着滑，地图被拖离原位；iOS 上还叠加一层橡皮筋回弹。

用 `uni.getWindowInfo().windowHeight` —— tabBar 页面上它不含 tabBar 高度。

```ts
const { windowHeight } = useViewport(); // @/composables/useViewport
```

全屏铺底的页面用它当 `height`；有内容要滚的页面用它当 `min-height`。

`useViewport` 和 `useNavMetrics` 都**算一次就缓存** —— 尺寸在一次启动内不变，不必反复调 API。

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

## canvas

- **canvas 2d 不解析 `var()`**，只认 rgb/hex。所以主题是编译期常量，canvas 侧色值硬编码，与令牌层 `src/styles/tokens/_color.scss` 手工保持一致（`$fish-tide`、`$fish-temp` 是锚点）
- dpr 从 `uni.getWindowInfo().pixelRatio` 取
- 画布尺寸先 `uni.upx2px()` 换算成 px
- **逻辑层没有全局 rAF**，取帧走 canvas 节点自带的 `requestAnimationFrame`（基础库 2.7.0+），见 `FishingGauge` 顶部的类型声明

## 原生 map

`<map>` 是原生组件，层级最高 —— **遮罩拦不住它的手势**。

浮层打开时要把地图的手势关掉，否则拖抽屉时背后的地图会跟着动：

```vue
<FullscreenMap :interactive="!spotDetailOpen" />
```

`interactive` 控制 `enable-zoom` 和 `enable-scroll`。

地图铺满整屏时高度由脚本绑定 `windowHeight`，不用 `100vh` —— 理由见上面「高度」。

## 字体

图标字体走 `wx.loadFontFace` 网络加载：

- 字体域名必须在微信后台配成 **downloadFile 合法域名**，否则加载失败，页面上所有天气图标变成豆腐块（私用区位码位在系统字体里没有对应字形）
- 主包里只留「码 → 字形」的映射规则（`src/styles/qweather-icons.css`，4 KB）。字体本体不再 base64 内联（那版是 40 KB）
- 字体族名必须与 css 里 `.qi` 的 `font-family` 完全一致：`qweather-icons`
- `global: true` —— 图标散在好几个页面里，逐页注册会漏
- `desc` 三项都要给，uni 的类型里 `variant` 是必填的（微信文档说它可选）
- `success` 不代表字体真的加载上了，要看 `res.status === 'loaded'`
- 加载失败不致命：读数全是文字，图标没了照样能读。所以只记状态，不弹 toast 打扰用户
- 状态是模块级单例 ref —— 小程序所有页面共用一份逻辑层，组件 import 到的都是同一个 ref

## SSE 流式

`uni.request` 不能直接当流用，三个绕不开的原因：

1. **不传回调就只给 Promise。** uni 的 promisify 包装只在传了 success/fail/complete 时才把 RequestTask 返回出来，不传就拿不到 task，挂不上 `onChunkReceived`，流式直接退化成一次性请求
2. **响应体不能按 JSON 解析。** `dataType: 'json'` 会让 wx 对整个响应体做一次 JSON.parse，而 SSE 的报文是 `data: {...}`，根本不是合法 JSON
3. **超时覆盖的是整段流。** wx.request 的 timeout 从发送到 complete 全程计时，大模型生成超过默认 60s 就会被腰斩

所以流式请求的参数是固定的：

```ts
{
  dataType: 'text',
  responseType: 'arraybuffer',
  enableChunked: true,
  enableHttp2: false,
  timeout: 5 * 60 * 1000,   // 默认 60s 会被腰斩
}
```

服务端要求：响应头 `Content-Type: text/event-stream` + `Transfer-Encoding: chunked`，反代（Nginx）要 `proxy_buffering off`，否则分块被缓存住，流式退化成一次性。

`onChunkReceived` 必须在拿到 task **之后**挂 —— 挂早了拿不到 task，挂晚了会漏掉前面的块。

服务端没开 chunked 时分块回调一次都不会触发，整段响应走 success —— 要把完整 body 补喂一次，不然这一轮会安静地什么都不吐。

## 定位

```ts
uni.getLocation({ type: 'gcj02' });
```

**必须是 gcj02** —— 小程序 `<map>` 组件用的是 GCJ-02 火星坐标系。传 wgs84（GPS 原始坐标）会偏移几百米，这是最常见的对不上问题。

全应用只有 `stores/fishingMap` 调 `uni.getLocation` 一处。地图的定位键、结论头的刷新键、数据页的取数共用它 —— 两处各调一次会弹两次权限窗，也会拿到两个略有差异的点。

定位被拒之后微信不会再弹权限窗，反复调只是反复失败。store 里 `locationDenied` 记住这件事。

## 登录

`wx.login` 拿 code → 传给服务端 → 服务端换 openid 并**自动建号**。前端没有「注册」分支。

refresh token 必须自己存 —— 小程序端 `wx.request` 不管理 cookie，服务端下发的 HttpOnly cookie 收不到。所以服务端的刷新接口是「body 优先、cookie 回退」，body 里必须带上它。

两个 token 要**一起清**：只清 access 会留下一枚 refresh，下次进小程序会拿着可能已被服务端轮换掉的 refresh 去刷新，然后卡在「刷新失败」上。

头像：`chooseAvatar` 给的是临时路径，1–5 分钟就失效。选到就传，不等用户点保存。

## Vue 3 兼容层

`main.ts` 里补了 `$set` / `$delete` 两个实例方法 —— Vue 3 删掉了它们，而 mp-html v2 还在用（`setContent` 里的 `this.$set(this, 'nodes', …)` 是它的主路径）。不补这一层，mp-html 第一次渲染就抛 `this.$set is not a function`，白屏。

补法是对的：Vue 3 的响应式基于 Proxy，给对象加新属性本来就能被追踪到，`$set` 退化成一次普通赋值即可，语义与 Vue 2 的实现一致。

## 微信后台配置

| 项                    | 值                     | 不配的后果         |
| --------------------- | ---------------------- | ------------------ |
| request 合法域名      | `VITE_API_BASE_URL`    | 所有接口失败       |
| downloadFile 合法域名 | 图标字体域名           | 天气图标全是豆腐块 |
| `scope.userLocation`  | 见 `src/manifest.json` | 定位键无反应       |
| `scope.userInfo`      | 见 `src/manifest.json` | 头像昵称取不到     |

其他 manifest 设置：`lazyCodeLoading: requiredComponents`、`optimization.subPackages: true`、`urlCheck: false`（开发期）、`transformPx: false`（rpx 不转 px）。

## 真机预览

用 `/wechatide-skill` 走微信开发者工具的编译、预览、上传流程。
