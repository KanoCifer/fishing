# 微信小程序：网络、权限与微信能力

跨网络、跨权限、跨系统能力的调用各有各的绕法，这份文档讲这些绕法。
平台侧的通用约束（存储、高度、canvas、动画、事件）见 `docs/mp-weixin-platform.md`。

## 请求的两个开关

- **`enableHttp2` 默认是 `false`。** 服务端支持 HTTP/2 不等于客户端会用 ——
  微信的「高性能模式」会自动开 h2/h3，但官方写明「暂仅支持 Android，iOS/PC 端
  设置该参数后会使用原 request 模块」。所以 iOS 上不显式写 `enableHttp2: true`，
  所有请求都走 HTTP/1.1。`src/api/client.ts` 已经显式开了，**只有它能开** ——
  SSE 走 chunked，而 HTTP/2 协议禁止 chunked（见下面「SSE 流式」）。
- **`defer` 在微信端不生效。** `@dcloudio/types` 的
  `UniNamespace.RequestOptions` 里有 `defer?: boolean`，注释写着「控制当前请求是否
  延时至首屏内容渲染后发送」—— 那是**百度智能小程序**的能力，微信的 `wx.request`
  参数表里没有它。别拿它当首屏优化手段。

## 启动阶段别发请求

微信体检有一条「小程序启动时存在耗时较长的请求」。它看的是**请求发起时刻**
落在启动阶段（`App.onLaunch` ~ 首页首屏渲染完成）里、且耗时够长的那些。

两条规矩：

1. **首屏渲染完成之后再取数。** `onReady` 是「页面初次渲染完成」，
   在它里面发就已经晚于首屏；再让开一个宏任务（`setTimeout(..., 0)`），
   就确定不在启动阶段里了。地图页的钓点列表就是这么发的 ——
   地图先出来、点后补上，用户完全无感。
2. **不要给不显示这些数据的页面发重请求。** map store 里曾经有个
   「坐标变了就重取指数」的 watch，于是地图页一进页面、定位一回来，
   就发出一条全应用最重的 `GET /v2/fishing/index?...&enriched=true`
   （实测 TTFB 200~390 ms，响应 22 KB）—— 而**地图页一个像素都不显示它**：
   钓鱼指数、天气、潮汐只有数据页那三张卡在用。
   取数归数据页自己管（`ensureWeatherAndFishing` 每次都比一遍坐标）。

服务端侧的数也记在这儿：`GET /v3/fish/spots` 响应 16.5 KB，
EdgeOne 上带 `cache-control: public, max-age=300`，命中时 TTFB 100 ms 上下，
未命中要回源；`GET /v2/fishing/index?enriched=true` **没有** `Cache-Control`，
每次都是 MISS，TTFB 180~390 ms —— 想让它快，得在服务端补缓存头。

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

| 值          | 含义           | 该做什么                       |
| ----------- | -------------- | ------------------------------ |
| `true`      | 已授权         | 直接调 `getLocation`           |
| `false`     | 用户明确拒绝过 | 微信不会再弹窗，只能去设置页   |
| `undefined` | 从没问过       | 调 `getLocation`，它会弹授权窗 |

区分这三档是为了两件事：一是「明确拒绝」和「从没问过」在界面上要给的引导完全不同（前者去设置页，后者直接弹窗），只靠 `getLocation` 的 `fail` 回调区分不出来；二是用户拒绝之后微信不会再弹权限窗，反复调只是反复失败。

被拒之后 store 里 `locationDenied` 记住这件事，定位键据此带去设置页。其余失败（系统定位没开、网络差）记在 `locationError` 里 —— 它们能靠重试解决，跳设置页没用。

### 选点

```ts
uni.chooseLocation({ success: (res) => res.longitude / res.latitude });
```

新建钓点页用它选位置。选的是**微信自己那张地图** —— 搜索、定位、路网都在，用户在自己认得的地方点一下，比我们再画一张地图准得多。

- 回来的坐标是 **GCJ-02**，和小程序 `<map>`、和后端存的 `location` 同一套，不用再换算；经度在前
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

上传走 `uni.uploadFile`（不是 `uni.request`）：multipart 要用前者。表单字段名与用途取值见 `docs/architecture.md` 的「媒体」 —— 写错字段名服务端回 400「未收到上传文件」。

⚠️ 上传用的是 **uploadFile 合法域名**，跟 request / downloadFile 又是三份独立的名单。

## 分享

钓点详情页的分享走两条路：海报存相册、转发给好友。碰分享先读这一节。

### 转发面板只能由按钮唤起

`onShareAppMessage` 只是**提供内容**，不是入口。微信的转发面板只有一条入口：
`<button open-type="share">`。页面自己没有任何 API 能打开它。

所以分享浮层里那颗「发给朋友」必须是原生 `button`，不能用 `view` + `@tap` 顶替
—— 项目里其余地方都用 `view`，这一处是例外，代价是原生 button 的默认样式
（灰底、边框、字号、内边距、`::after` 那条边）要一条条清掉。

### 胶囊菜单的项要显式开

`uni.showShareMenu({ menus: [...] })` 决定胶囊菜单里有哪些项。
不显式开就只有转发；`shareTimeline`（朋友圈）要单独列进去才会出现。

这一版分享**不做朋友圈**，所以 `menus` 只列 `shareAppMessage` ——
留着朋友圈只会多一个走不通的出口（朋友圈那条路还有一条硬限制：页面发不了朋友圈，
只能由用户从胶囊菜单点，见下）。

### 朋友圈页面发不了

微信不允许页面自己打开朋友圈面板，只能由用户从右上角胶囊菜单发起。
这是平台限制，绕不过去 —— 任何「一键分享到朋友圈」的按钮在微信里都是假的。

### 卡片封面按 5:4 裁

转发卡片的自定义图（`imageUrl`）按 **5:4** 显示，朋友圈按 1:1。
所以一张 3:4 的海报要先裁出中间那条 5:4 带再交出去；
裁切框与海报绘制共用同一个数（`src/constants/share.ts` 的 `POSTER`），
两处各写一个，版面一改就会错位。

`imageUrl` 支持本地临时路径 —— 海报画完用 `uni.canvasToTempFilePath` 导出来直接给它，
不必上传到服务器。

### 存相册要授权

`uni.saveImageToPhotosAlbum` 要 `scope.writePhotosAlbum`。先读
`uni.getSetting()`：用户明确拒绝过（`false`）时微信不会再弹窗，
只能 `uni.openSetting()` 引导去设置页；从没问过（`undefined`）直接调，
第一次会自己弹授权窗。这两件事在 `src/utils/album.ts` 里分开处理。

### 海报要现画

海报上的数（鱼口、地址、开放时间）前端手里就有，走服务端渲染要多一次往返，
不值当。所以用 canvas 2d 现画（`src/utils/poster.ts`）。

canvas 2d 的两个约束见 `docs/mp-weixin-platform.md` 的「canvas」一节：不解析 `var()`，
色值硬编码并与令牌层手工保持一致；**位图按海报的设计分辨率（750×1000）铺，
绘制也用设计坐标** —— 两套坐标是同一套，显示时由 CSS 缩到预览尺寸。

封面图是网络图，`canvas.createImage()` 自己拉 —— 域名要在微信后台的
**downloadFile 合法域名**里，否则那张照片永远不出来。

导出用 **PNG**（`src/constants/share.ts` 的 `POSTER_EXPORT.fileType`）：
海报上那块小程序码是黑白高对比的小图案，JPEG 一压就出振铃，糊了就扫不出来。

### 海报上的码

海报右下角现在放的是**一张固定的小程序码**（`src/static/wxacode.png`，
代码包内的文件，引用时写 `/static/...` 这个根路径）。

它是用 `getFileSystemManager()` 读成 base64 再喂给画布的（见
`docs/mp-weixin-platform.md` 的「canvas」一节）——
`createImage()` 直接吃代码包内的路径并不在官方承诺里。

**它是 PNG 不是 JPEG**：彩色的码（中间蓝鱼黄圈、右下角绿色微信角标），
JPEG 一压色度噪点就把边界糊了，而糊了就扫不出来。
源图在 `scripts/assets/wxacode.jpg`，产物是无损 PNG —— 见 `docs/mp-weixin-package.md`。

它扫出来落在**小程序入口**，不是直接落在某条钓点上 —— 一张静态码做不到按场景跳转。
要「扫了图就到这条钓点」，得后端按 scene 调 `getwxacodeunlimit` 出无限码，
那是接口层的另一件事（`PosterSpot.codeUrl` 那一格就是留给它的位置）。

码在海报上按 150/750 画 —— 落到手机上约 75pt，再小就扫不出来了。
画的时候**不裁圆角**：小程序码的定位图形贴着角上，裁一刀就毁了，
而扫不出来的时候没人会怀疑是海报被裁了。

## 登录

`wx.login` 拿 code → 传给服务端 → 服务端换 openid 并**自动建号**。前端没有「注册」分支。

refresh token 必须自己存 —— 小程序端 `wx.request` 不管理 cookie，服务端下发的 HttpOnly cookie 收不到。所以服务端的刷新接口是「body 优先、cookie 回退」，body 里必须带上它。

两个 token 要**一起清**：只清 access 会留下一枚 refresh，下次进小程序会拿着可能已被服务端轮换掉的 refresh 去刷新，然后卡在「刷新失败」上。

头像：`chooseAvatar` 给的是临时路径，1–5 分钟就失效。选到就传，不等用户点保存。

## 微信后台配置

| 项                    | 值                                                                     | 不配的后果                                             |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| request 合法域名      | `VITE_API_BASE_URL`                                                    | 所有接口失败                                           |
| downloadFile 合法域名 | 图标字体域名 + API 域名 + **CDN 域名**（`VITE_CDN_BASE_URL` 的主机名） | 天气图标是豆腐块，照片全是裂的；缺图占位插画也拉不下来 |
| uploadFile 合法域名   | `VITE_API_BASE_URL`                                                    | 照片传不上去                                           |
| 预解析域名            | `api.kanocifer.chat`、CDN 域名、字体域名                               | 弱网冷启时每次 DNS 都真走一次运营商解析                |
| `scope.userLocation`  | 见 `src/manifest.json`                                                 | 定位键无反应                                           |
| `scope.userInfo`      | 见 `src/manifest.json`                                                 | 头像昵称取不到                                         |

⚠️ 三份域名名单是**三份独立的表**，填一份不等于另外两份也生效。
CDN 域名（`cdn.kanocifer.chat`）是后加的 —— 它承接着从代码包里搬走的
静态图（见 `docs/mp-weixin-package.md`），漏配的话页面看着正常，只是缺图那一态
永远是一块空白。

**预解析域名是后台配置，不在代码里**：位置在同一页（开发 - 开发设置 - 服务器域名），
无需协议头，最多 5 个。它是**启动时**提前解析业务域名，收益主要在弱网冷启。

其他 manifest 设置：`lazyCodeLoading: requiredComponents`、`optimization.subPackages: true`、`urlCheck: false`（开发期）、`transformPx: false`（rpx 不转 px）。

`requiredPrivateInfos` 声明了要走隐私接口的 API（当前是 `getLocation` 和 `chooseLocation`）。这一项开发者工具里不校验 —— 漏了只有真机才炸，见上面「定位」「选点」两节。改完 manifest 要重新编译，微信开发者工具不会热更新 `app.json`。
