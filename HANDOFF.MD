# HANDOFF —— 接手这个仓库之前先读这里

这份文件存在的意义：把「查过但容易再踩」的坑记下来，
省得下一个人重新查一遍微信文档、重新被同一处代码骗一次。

---

## 微信小程序性能体检的条目到底在说什么

2026-10-23 收到开发者工具的「优化建议」九条，逐条查完后的口径记录在
`docs/performance-audit.md`。下面只记「容易记错的判断」。

**同步 API 的判定范围比想象中宽。** 官方文档说「绝大多数同步 API 会以 `Sync` 结尾，
但有部分特例，比如 `getSystemInfo`」—— `uni.getWindowInfo()` 和
`uni.getMenuButtonBoundingClientRect()` 都属于这一类：名字里没有 `Sync`，
但是同步的，会阻塞 JS 线程。排查时别只 grep `Sync`。

**`wx.request` 的 `enableHttp2` 默认是 `false`。** 服务端支持 HTTP/2 不等于
客户端会用 —— 微信的「高性能模式」会自动开 h2/h3，但官方写明
**「暂仅支持 Android，iOS/PC 端设置该参数后会使用原 request 模块」**。
所以 iOS 上不显式写 `enableHttp2: true`，所有请求都走 HTTP/1.1。

**HTTP/2 与 SSE 互斥。** HTTP/2 协议禁止 `Transfer-Encoding: chunked`，
而 `src/api/stream.ts` 的 SSE 正是靠 chunked + `proxy_buffering off`。
**给 `api/stream.ts` 的 `uni.request` 补 `enableHttp2` 会直接打断流**，
而这个字段加在 `api/client.ts` 里是安全的。两条都在同一份代码里，别顺手统一。

**`defer`（延迟请求）在微信端不生效。** `@dcloudio/types` 的
`UniNamespace.RequestOptions` 里有 `defer?: boolean`，注释写着
「控制当前请求是否延时至首屏内容渲染后发送」—— 但那是**百度智能小程序**的能力。
微信的 `wx.request` 参数表里没有 `defer`。别拿它当首屏优化手段。

**DNS 预解析是后台配置，不在代码里。** 位置：小程序后台 - 开发 - 开发设置 -
服务器域名（和合法域名同一页），无需协议头，最多 5 个。
它是**启动时**提前解析业务域名，收益主要在弱网冷启。

**「UI 异常」是兼容性条目，只给现象不给机型。** 必须拿到体检报告详情链接
或多机型真机复现才能定性。代码里能筛出的候选：`@property`（iOS < 16.4 /
Chromium < 85 不支持，自定义属性变离散插值）、flex `gap`（Safari < 14.5 不支持，
声明被丢掉 → 间距全没）、`inset` 简写（Safari < 14.1 不支持）。

**「App.onLaunch 前存在耗时操作」基本是误报。** 那指的是启动到 `onLaunch`
之间执行的模块顶层代码。本仓库顶层只有一次 `installRuntimePolyfills()`，
产物 `app.js` 共 594 字节 —— 工具按「顶层有语句执行」判定，不看耗时。
真要消掉这条只能把顶层语句挪进 `createApp()`，属于让工具闭嘴，不是真的慢。

---

## 仓库里已经踩过、不要再踩的

**`vite.config.ts` 的 `envPrefix` 是白名单，不是前缀。** 少写一个变量，
`import.meta.env.XXX` 就是 `undefined`，**不报错**。已踩过一次：
`VITE_CDN_BASE_URL` 漏在白名单外，导致 `.env.production` 里改 CDN 地址不生效，
而 `src/config/env.ts` 的默认值恰好一样，所以完全看不出来。
加 `.env.*` 变量时记得同步加这里。

**别为了「减少同步 API」去改 `useNavMetrics` / `useViewport` 的接口形状。**
这两个 composable 的返回值在 8 个页面里被消费，改成异步会让所有页面都改。
正确做法是加一个共享快照模块，让它们从同一份数据里取字段。

**同步 API 只有一处该调。** `uni.getWindowInfo()` 与
`uni.getMenuButtonBoundingClientRect()` 都写进 `src/composables/windowMetrics.ts`，
别的文件一律从 `windowMetrics()` 读。两个 API 都是同步的（uni 的 mp-weixin 运行时
把它们写进了 `SYNC_API_RE` 白名单），多调一次就是多阻塞一次 JS 线程。
同理，**Storage 的读写只有 `src/utils/storage.ts` 一处**，它给每个 key 留了一份内存副本；
不要再写 `uni.getStorageSync`。

**潮汐接口曾经一次操作发两次。** `stores/fishingMap.ts` 的 `setSelectedHarbor`
自己发一次，`components/TideCard/TideCard.vue` 的 `watch` 又发一次完全相同 URL 的请求。
**请求归 store 一家管，组件不要重复触发** —— 这是本仓库的通用约定，
不是只有潮汐这一处要注意。现在有两道锁：`fetchPanelTide` 里的 `tideInflightKey`
守卫（同一组参数在飞就不发第二个），加上职责划分（组件只在「还没有数据」时补首屏）。

**图标字体是按需加载的，不在启动阶段。** 73 KB 走网络，挂在 `App.onLaunch` 上就是
一条冷启动长请求（微信体检会记一条「小程序启动时存在耗时较长的请求」）。
现在是数据页 `onMounted` 触发 `loadQweatherIconFont()`，消费它的三张卡
（`HourlyWeather` / `WeekStrip` / `AstroCard`）都有 `v-if="qweatherFontReady"` 兜底。
⚠️ 字体子集还没上传到 `cdn.kanocifer.chat` —— 现在仍指向 jsdelivr 的全量字体。
换之前先确认子集文件真的在 CDN 上，否则图标全变豆腐块。

**`<map show-location>` 和 `uni.getLocation` 会各要一次位置。**
`components/FullscreenMap/FullscreenMap.vue` 的 `show-location` 默认 `true`，
原生地图自己定位一次；组件 `onMounted` 又调 `mapStore.locateUser()` 一次。
权限弹窗只弹一次，但会拿到两个略有差异的坐标，表现为「地点名闪一下」。
位置只留 store 一条路径 —— 这条还没改，因为关掉 `show-location` 会去掉地图上的蓝点，
属于产品决策。

**`uni.getWindowInfo().pixelRatio` 在三处图表组件里是现调的**
（`TideChart.vue:702`、`FishingGauge.vue:236`、`LineChart.vue:636`）。
不在首屏链路上，但同样每次读都调一次 API。

---

## 这个项目的硬约束（改之前先确认没踩）

- 平台只有 `mp-weixin`。平台能力一律 `uni.*` 命名空间。
- 后端在 `../Server-Go`（主）和 `../Server-Py`。
- 唯一出处：端点 `src/api/`、类型 `src/types/`、色值字阶 `src/styles/tokens/`、
  文案 `src/constants/about.ts`、图标 `scripts/gen-icons.mjs`。
- 接口基址只从 `@/config/env` 读，不在调用点写死域名。
- 环境变量只读 `import.meta.env.VITE_*`。
- 坐标是 `[经度, 纬度]`，经度在前。
- 运行时尺寸用 px，设计稿尺寸用 rpx，相加先过 `uni.upx2px()`。
- 收尾必须 `pnpm type-check` 与 `pnpm lint` 退出码 0；
  格式化只对自己动过的文件跑 `npx oxfmt <文件>`（全量 `pnpm format` 会带出无关 diff）。
- 本仓库没有测试套件，type-check 与 lint 是仅有的把关。
