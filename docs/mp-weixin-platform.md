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

⚠️ `getLocation` 是隐私接口，`src/manifest.json` 的 `mp-weixin.requiredPrivateInfos` 必须声明它，否则真机上调用直接被拒：`getLocation:fail the api need to be declared in the requiredPrivateInfos field in app.json`。没声明的表现是：开发者工具里正常，真机一点就失败，连授权弹窗都不弹。

**先问授权状态，再调 getLocation。** 微信的 `getSetting` 能读出 `scope.userLocation` 的三档：

| 值            | 含义                    | 该做什么                       |
| ------------- | ----------------------- | ------------------------------ |
| `true`        | 已授权                  | 直接调 `getLocation`           |
| `false`       | 用户明确拒绝过          | 微信不会再弹窗，只能去设置页   |
| `undefined`   | 从没问过                | 调 `getLocation`，它会弹授权窗 |

区分这三档是为了两件事：一是「明确拒绝」和「从没问过」在界面上要给的引导完全不同（前者去设置页，后者直接弹窗），只靠 `getLocation` 的 `fail` 回调区分不出来；二是用户拒绝之后微信不会再弹权限窗，反复调只是反复失败。

被拒之后 store 里 `locationDenied` 记住这件事，定位键据此带去设置页。其余失败（系统定位没开、网络差）记在 `locationError` 里 —— 它们能靠重试解决，跳设置页没用。

### 选点

```ts
uni.chooseLocation({ success: (res) => res.longitude / res.latitude });
```

新建钓点页用它选位置。选的是**微信自己那张地图** —— 搜索、定位、路网都在，用户在自己认得的地方点一下，比我们再画一张地图准得多。

- 回来的坐标是 **GCJ-02**，和小程序 `<map>`、和后端存的 `location` 同一套，不用再换算
- `location` 要的是 `[lng, lat]`，**经度在前**。写反了不会报错，只会落到地球另一侧
- `res.address` 直接就是后端 `address` 字段要的东西，不用自己拼
- 用户主动取消走 `fail` 回调，`errMsg` 里带 `cancel` —— 那是正常操作，别弹「失败」

⚠️ `chooseLocation` 属于隐私接口，`src/manifest.json` 的 `mp-weixin.requiredPrivateInfos` 必须声明它，否则真机上调用直接被拒。没声明的表现是：开发者工具里正常，真机一点就失败。

## 选图与上传

```ts
uni.chooseMedia({ count, mediaType: ['image'], sizeType: ['compressed'] });
```

钓点照片用它选图。`chooseMedia` 是微信现在的接口（`chooseImage` 已在废弃流程里），能一次多选、能指定只选图片、能指定压缩。

- 选**压缩版**（`sizeType: compressed`）：钓点照片是给人看现场的样子，不是当素材用的；原图动辄几 MB，弱网下传得等到用户放弃
- 回来的 `tempFilePath` 是**临时路径**，1–5 分钟就失效 —— 复制和上传必须当场合做完
- 微信靠**文件扩展名**推 multipart part 的 Content-Type。扩展名不在白名单（jpeg / png / gif / webp）时服务端回 400，所以 `api/upload` 的 `resolveUploadPath` 会先把文件复制成 `.jpg` 再传
- `uni.chooseMedia` **不在** `requiredPrivateInfos` 里 —— 读相册不需要在 manifest 声明，隐私授权由微信自带的弹窗处理

上传走 `uni.uploadFile`（不是 `uni.request`）：multipart 要用前者。表单字段名固定 `file`，用途走 `type` 字段 —— 写错字段名服务端回 400「未收到上传文件」。

⚠️ 上传用的是 **uploadFile 合法域名**，跟 request / downloadFile 又是三份独立的名单。

## 登录

`wx.login` 拿 code → 传给服务端 → 服务端换 openid 并**自动建号**。前端没有「注册」分支。

refresh token 必须自己存 —— 小程序端 `wx.request` 不管理 cookie，服务端下发的 HttpOnly cookie 收不到。所以服务端的刷新接口是「body 优先、cookie 回退」，body 里必须带上它。

两个 token 要**一起清**：只清 access 会留下一枚 refresh，下次进小程序会拿着可能已被服务端轮换掉的 refresh 去刷新，然后卡在「刷新失败」上。

头像：`chooseAvatar` 给的是临时路径，1–5 分钟就失效。选到就传，不等用户点保存。

## 自定义事件不能与原生事件同名

小程序的 `bind` 系列属性绑在**自定义组件**上时，如果事件名正好是原生事件名，微信会让它同时接住两条路：

1. 组件内部 `triggerEvent` 派发的一条（Vue 的 `emit` 在小程序端就是这么实现的）
2. 组件内部原生事件冒泡出组件边界的一条

同一个监听器被打两次。踩过的两处：

| 组件                | 事件名         | 现象                                                     |
| ------------------- | -------------- | -------------------------------------------------------- |
| `FormRow`           | `tap`          | 点一次「位置」栏弹出**两个**选点页                       |
| `FullscreenMap`     | `markertap`    | 点一个 marker **push 两层**钓点详情页，返回要点两次      |

`FullscreenMap` 那处尤其阴：`<map>` 的 `markertap` 被 uni-app 编译成**冒泡版**的 `bindmarkertap`，原生事件会冒泡出组件，父组件上的 `@markertap` 照收不误。

**规则：自定义事件的驼峰或加后缀。** 小程序的原生事件名全是全小写（`tap` / `markertap` / `regionchange` / `change`），所以 `select` / `markerTap` / `regionChange` 这类名字天然不冲突。uni-app 编译后是 `bindmarkerTap` 这种带大写的属性名，微信不会拿它去匹配原生事件。

判断某个自定义事件名安不安全的办法：看组件**内部**有没有同名原生事件会冒泡到根节点。

- `FormRow` 内部根节点有 `@tap` → 自定义事件不能叫 `tap`
- `ChoiceChips` 内部只有 `@tap`，它 emit 的是 `change` → `change` 安全（内部不产生原生 `change`）

## Vue 3 兼容层

`main.ts` 里补了 `$set` / `$delete` 两个实例方法 —— Vue 3 删掉了它们，而 mp-html v2 还在用（`setContent` 里的 `this.$set(this, 'nodes', …)` 是它的主路径）。不补这一层，mp-html 第一次渲染就抛 `this.$set is not a function`，白屏。

补法是对的：Vue 3 的响应式基于 Proxy，给对象加新属性本来就能被追踪到，`$set` 退化成一次普通赋值即可，语义与 Vue 2 的实现一致。

## 微信后台配置

| 项                    | 值                      | 不配的后果                     |
| --------------------- | ----------------------- | ------------------------------ |
| request 合法域名      | `VITE_API_BASE_URL`     | 所有接口失败                   |
| downloadFile 合法域名 | 图标字体域名 + API 域名 | 天气图标是豆腐块，照片全是裂的 |
| uploadFile 合法域名   | `VITE_API_BASE_URL`     | 照片传不上去                   |
| `scope.userLocation`  | 见 `src/manifest.json`  | 定位键无反应                   |
| `scope.userInfo`      | 见 `src/manifest.json`  | 头像昵称取不到                 |

其他 manifest 设置：`lazyCodeLoading: requiredComponents`、`optimization.subPackages: true`、`urlCheck: false`（开发期）、`transformPx: false`（rpx 不转 px）。

`requiredPrivateInfos` 声明了要走隐私接口的 API（当前是 `getLocation` 和 `chooseLocation`）。这一项开发者工具里不校验 —— 漏了只有真机才炸，见上面「定位」「选点」两节。改完 manifest 要重新编译，微信开发者工具不会热更新 `app.json`。

## 真机预览

用 `/wechatide-skill` 走微信开发者工具的编译、预览、上传流程。
