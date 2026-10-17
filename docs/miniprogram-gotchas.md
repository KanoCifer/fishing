# 微信小程序平台分支

按能力分簇。改到哪一簇，读哪一簇——每簇的验证手段不同，别把一簇的结论套到另一簇上。

每条都带代码位置。先读示例再动手，比先踩坑再回头改快。

---

## 原生组件层级

**触发**：任何要浮在 `map` / `video` / 原生 `canvas` 上面的元素。

`map`、`video`、原生 `canvas` 是**原生组件**，走单独的一层渲染，普通组件的 `z-index` 对它们完全无效——把 `z-index` 调到 99999 也没用。

- 浮层用 `cover-view` / `cover-image`，这是唯一能压在原生组件上的写法。
- `cover-view` 的 CSS 能力极小：能用 `background-color`、`border-radius`、`padding`、`margin`、`color`、`text-align`、`display: flex` 和具体值的 `font-size`；用不了 `box-shadow`、`transform`、`animation`、渐变。
- `cover-view` 里只能再放 `cover-view` / `cover-image` / `button`。
- 事件绑 `@tap`。

想做成毛玻璃或带阴影的浮层，只能放弃 `cover-view` 覆盖，改成地图上钉 marker，或把地图区域让出一块再叠普通 `view`。

**示例**：`src/components/FullscreenMap/FullscreenMap.vue`、`src/pages/index/index.vue` 的 `.switcher`。

---

## Canvas 2d 绘制

**触发**：自绘图表、手写签名、自定义进度条。

- 用 `type="2d"` 的新接口，通过 `createSelectorQuery().in(instance).select('#id').fields({ node: true, size: true })` 拿到 `node`。老的 `wx.createCanvasContext` 已被新接口取代。
- **canvas 的宽高必须是具体数值**，百分比在真机上拿不到实际尺寸，会画成 0 宽。
- **rpx 只对样式有效**，canvas 内部坐标系是 px。props 用 rpx 声明，绘制前 `uni.upx2px()` 换算。
- **高分屏发虚**：位图尺寸按 dpr 放大，CSS 尺寸不变。
  ```
  canvas.width = item.width * dpr
  canvas.height = item.height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)   // 之后的绘制逻辑继续用 CSS 像素
  ctx.clearRect(0, 0, item.width, item.height)
  ```
- **缩放只能用 `setTransform`，不能用 `scale`**：`scale` 是往当前变换矩阵上**累乘**的，只有 `canvas.width` 被赋值那一次会重置矩阵。入场动画每帧重绘一次，每帧 `scale(dpr, dpr)` 就会叠成 `dpr^n`，第二帧起线条直接飞出画布。`setTransform` 是覆盖式，每帧幂等。
- **没有全局 `requestAnimationFrame`**：那是浏览器 API，小程序逻辑层连 `window` 都没有，照抄浏览器写法必崩 `requestAnimationFrame is not a function`（而且 `vue-tsc` 查不出来，DOM lib 里它是合法的）。`type="2d"` 的 canvas **节点自带** `requestAnimationFrame(cb) → requestId` 和 `cancelAnimationFrame(requestId)`（基础库 2.7.0+）。
  ```
  const id = canvas.requestAnimationFrame(tick)   // 注意是 canvas. 节点上的方法
  canvas.cancelAnimationFrame(id)                // 必须同一个节点取消
  ```
- **取帧和取消必须成对走同一个节点**：节点的 `requestId` 交给别处的 `cancelAnimationFrame` 会**静默失效**，不报错、循环也停不下来，页面反复进出就一直漏帧。
- **`requestAnimationFrame` 必须在 `onBeforeUnmount` 里取消**，否则页面反复进出会持续泄漏。
- **`uni.getSystemInfoSync()` 在微信端已废弃**，控制台每次告警，dpr 之类的字段改从 `uni.getWindowInfo()` 取（`pixelRatio` / `windowWidth` / `statusBarHeight` / `safeArea` 都在里面）。
- `display: block`，否则微信端 canvas 是 inline 元素，尺寸计算会偏。
- `canvasId` 必须全局唯一（同一个页面可能画多个图），随机后缀即可。
- 触摸换算：把绘图时的几何存下来，`e.touches[0].clientX` 减掉画布左边距，再除以点间距。

**示例**：`src/components/LineChart/LineChart.vue`（含 dpr、入场动画、触摸拾取的完整实现）。

---

## 定位与授权

**触发**：`uni.getLocation` / `chooseLocation` / 任何 `scope.*` 权限。

- **`type: 'gcj02'` 是硬要求**。小程序 `<map>` 用的是 GCJ-02 火星坐标系，传 `wgs84`（GPS 原始坐标）会偏移几百米——这是"定位飘了"最常见的原因。
- 权限要在 `src/manifest.json` 的 `mp-weixin.permission` 里写 `desc`，否则直接被拒，且用户看不到任何提示。
- 用户拒绝后小程序**不会再次弹窗**，只能引导去设置页：失败分支里调 `uni.openSetting`。
- **失败路径要有兜底**：保留默认坐标 + 界面提示，不要让用户对着空白地图猜。
- 开发者工具里定位要手动勾选「模拟定位」，不勾会一直失败。
- 真机调试需要真实 AppID；`appid` 为空时开发者工具能预览，真机调试和上传都做不了。

**示例**：`src/components/FullscreenMap/FullscreenMap.vue` 的 `locate()`。

---

## 网络与登录态

**触发**：`uni.request` / `uploadFile` / `downloadFile` / `socket` / 登录。

- **合法域名**要在微信公众平台后台逐类配置：request、socket、uploadFile、downloadFile 各一份，不是配一个就通用。
- `manifest.json` 里 `setting.urlCheck: false` **只在开发者工具里生效**，真机和体验版一律校验。开发期关掉只是图方便，不代表能带着它上线。
- 合法域名必须是 HTTPS，不能带端口号和路径。
- 小程序**没有 cookie**。登录走 `wx.login` 拿 code → 送服务端换 `openid` / `session_key`，token 自行存储并在每次请求的 header 里带上。
- 接口基址从 `src/config/env.ts` 的 `ENV.apiBaseUrl` 读，不要在调用点写死域名。

---

## 包体与性能

**触发**：新增依赖、加图片、页面变多。

- **主包上限 2MB**，整包（含分包）20MB。加一个图标库可能就吃掉几百 KB，先算再装。
- `lazyCodeLoading: requiredComponents` 已开，小程序只加载当前页面用到的组件。
- `optimization.subPackages: true` 已开，但 `src/pages.json` 还没定义分包。页面变多时按分包拆，主包只留 tabBar 页和公共组件。
- 图片优先放 CDN，`src/static` 只放必须打进包的小图。
- **`setData` 是小程序的性能瓶颈**：不要整对象下发改，传增量路径（`this.setData({ 'list[0].done': true })`），单次传输量控制在 64KB 以内。

---

## 发布前

**触发**：提审、上传体验版、改域名。

- `src/manifest.json` 的 `mp-weixin.appid` 必须是真实 AppID，填 `touristappid` 只能预览。
- 后台的 request 合法域名必须和 `VITE_API_BASE_URL` 对上，否则体验版直接白屏。
- `permission` 里的 `desc` 要写清具体用途，审核会看，写"用于获取您的位置信息"这种被驳回率高。
- 收集位置、手机号等需要在小程序管理后台声明隐私保护指引。
- 先跑体验版再提审——开发者工具过不代表体验版过，域名校验和授权弹窗只在真机/体验版才生效。
