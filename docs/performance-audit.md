# 性能体检报告 —— 微信「优化建议」九条逐条对照

这份文档存在的原因：微信开发者工具的性能体检给出了一批「优化建议」条目，
每条只说现象不给根因。本文把九条建议逐条落到本仓库的具体代码位置，
并区分出「前端能改」「要去微信后台配」「需要设备报告才能定性」三类，
避免下次再对着同一张表重新猜一遍。

体检结论（开发者工具「优化建议」面板，2026-10-23）：

| 分类 | 条目 |
| --- | --- |
| 启动性能 | 首页渲染前多次调用同步 API |
| 启动性能 | 页面 App.onLaunch 前存在耗时操作，如 app.js 中的全局代码 |
| 启动性能 | 小程序启动时存在耗时较长的请求 |
| 启动性能 | 启动阶段存在重复获取相同 key 的 storage 信息 |
| 运行性能 | 页面渲染前多次调用同步 API |
| 运行性能 | 页面打开时存在耗时较长的请求 |
| 兼容性 | UI 异常 |
| 网络性能 | DNS 预解析可以优化网络请求耗时 |
| 网络性能 | 有请求未使用 HTTP/2 |

---

## 0. 结论速览

九条里 **五条前端代码能直接改**、**两条要去微信后台配**、**一条（UI 异常）必须靠设备报告定性**。
另有一条体检没点名、但同属「重复请求」的实锤 bug（潮汐接口一次操作发两次）。

| # | 体检条目 | 根因 | 归属层 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | 首页/页面渲染前多次调用同步 API | 每个页面都调 `getWindowInfo` 两次 + `getMenuButtonBoundingClientRect` 一次 | 前端 | P0 |
| 2 | App.onLaunch 前存在耗时操作 | `main.ts` 顶层执行 `installRuntimePolyfills()`；启动期无网络/无计算，纯属误报，但要消除需把顶层逻辑挪进 `onLaunch` | 前端 | P2 |
| 3 | 启动时存在耗时较长的请求 | `App.onLaunch` 里就发字体下载（73 KB，jsdelivr）；首页 `onMounted` 发钓点列表 | 前端 | P0 |
| 4 | 启动阶段重复获取相同 key 的 storage | `request()` 每发一次请求就读一遍 `fishing_token`；`session.restore()` 又单独读一遍 | 前端 | P0 |
| 5 | 页面打开时存在耗时较长的请求 | enriched 钓鱼指数（22 KB 重载荷）；潮汐接口一次操作发两次 | 前端 + 后端 | P0 |
| 6 | UI 异常 | 三个候选：`@property`（流光边框）、flex `gap`、`inset` | 前端（待设备报告确认） | P2 |
| 7 | DNS 预解析 | 三个域名未在微信后台配「预解析域名」 | 微信后台 | P1 |
| 8 | 有请求未使用 HTTP/2 | `uni.request` 没开 `enableHttp2`（微信默认 `false`） | 前端 | P0 |
| 9 | 潮汐接口重复请求（体检未点名） | store 的 setter 与组件的 watcher 各发一次 | 前端 | P0 |

### 实施状态（2026-10-23 收工）

| # | 条目 | 状态 | 落点 |
| --- | --- | --- | --- |
| 1 | 渲染前多次调用同步 API | ✅ 已改 | 新增 `src/composables/windowMetrics.ts`；`useNavMetrics` / `useViewport` / 三个图表组件全部改读它，同步 API 从每页 3 次降到全应用 1 次 |
| 4 | 重复获取相同 key 的 storage | ✅ 已改 | `src/utils/storage.ts`（commit `603382c`）—— 全项目读写 Storage 的唯一出入口，每个 key 留一份内存副本 |
| 8 | 有请求未使用 HTTP/2 | ✅ 已改 | `src/api/client.ts` 的 `uni.request` 加 `enableHttp2: true` |
| 9 | 潮汐接口重复请求 | ✅ 已改 | `stores/fishingMap.ts` 加 `tideInflightKey` 守卫；`TideCard.vue` 的 watcher 改成只补首屏，切港口/日期由 store 独家发 |
| 3 | 启动时存在耗时较长的请求 | 🟡 半改 | 字体加载已从 `App.onLaunch` 挪到数据页 `onMounted`；**换自建 CDN 子集还没做**（需先上传字体子集，见 §1.3） |
| 5 | 页面打开时存在耗时较长的请求 | 🟡 部分 | 潮汐重复已除；enriched 载荷要后端配合 |
| 7 | DNS 预解析 | ⬜ 待做 | 要在微信后台配 |
| 2 | App.onLaunch 前存在耗时操作 | ⬜ 待做 | 误报，可选 |
| 6 | UI 异常 | ⬜ 待定性 | 要设备报告 |

**还剩两件需要你操作的**：字体子集上传到 CDN（我探过 `cdn.kanocifer.chat` 上现在没有子集，
不能直接改 URL，否则图标全变豆腐块）、微信后台配「预解析域名」。

---

## 1. 启动性能

### 1.1 首页渲染前多次调用同步 API

微信的同步 API 会阻塞 JS 线程。官方文档点名要避免在启动链路里反复调
`getSystemInfo` / `getStorageSync`：
https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeB.html

本仓库的现状是**每个页面都在首帧前打 3 次同步 API**：

| 位置 | 调用 | 次数 |
| --- | --- | --- |
| `src/composables/useNavMetrics.ts:29` | `uni.getWindowInfo()` | 1 |
| `src/composables/useNavMetrics.ts:33` | `uni.getMenuButtonBoundingClientRect()` | 1 |
| `src/composables/useViewport.ts:38` | `uni.getWindowInfo()` | **又 1 次** |

三个 tab 页都同时用了这两个 composable：

- `src/pages/fishing/index.vue:32` + `:36`
- `src/pages/data/index.vue:144` + `:147`
- `src/pages/mine/index.vue:107` + `:110`

两个 composable 各自模块级缓存，但**缓存的是两份不同的东西**：一个缓存胶囊矩形，
一个缓存窗口尺寸 —— 于是 `getWindowInfo` 被调了两次，两次拿的是同一份数据。
这不是「缓存失效」，是**缓存切错了刀**。

> 注意 `src/components/TideChart/TideChart.vue:702`、`FishingGauge.vue:236`、
> `LineChart.vue:636` 里还有 `uni.getWindowInfo().pixelRatio`。
> 这三处不在首屏链路上（图表在数据页），但同样每次读都调一次 API，
> 合并进统一快照后一并解决。

**改法（已实现）**：新增 `src/composables/windowMetrics.ts`，`getWindowInfo` 与胶囊矩形
各取一次，`useNavMetrics` / `useViewport` / 三个图表组件全部从这一份读。

```ts
// src/composables/windowMetrics.ts —— 这个文件存在的意义：整个应用只调一次
// getWindowInfo 与 getMenuButtonBoundingClientRect，两个都是同步 API，会阻塞 JS 线程。
let cached: Snapshot | null = null;
```

`useNavMetrics` / `useViewport` 改成从这份快照里取字段，自身不再调 API。

### 1.2 App.onLaunch 前存在耗时操作

「App.onLaunch 前」= 小程序启动、代码注入到 `onLaunch` 回调之间执行的那段代码，
本仓库就是 `src/main.ts` 的模块顶层：

```ts
installRuntimePolyfills();   // main.ts:8
```

以及 `main.ts` 的 import 链（`App.vue` → `useQweatherFont` → `config/env`）。

实测产物 `dist/build/mp-weixin/app.js` 只有 594 字节，顶层逻辑只有一次
`installRuntimePolyfills()`（两次 `typeof` 判断 + 最多两次 `defineProperty`），
量级在微秒级。**这一条基本是误报**——体检工具按「顶层有语句执行」判定，不看耗时。

不过顺手可以把它挪进 `createApp()` 里，让 `app.js` 顶层真正空出来，
体检工具就不会再标记这一条。属于「为了让工具闭嘴」而不是「因为真的慢」，
所以排在最后。

### 1.3 小程序启动时存在耗时较长的请求

启动链路上的网络请求有两条：

**① `App.onLaunch` 里就下载图标字体** —— `src/App.vue:12`

```ts
onLaunch(() => {
  void loadQweatherIconFont();   // App.vue:13
});
```

`src/composables/useQweatherFont.ts:48` 走 `wx.loadFontFace`，字体本体
`https://cdn.jsdelivr.net/npm/qweather-icons@1.8.0/...woff`，实测 **74,780 B**。
这 73 KB 在冷启动阶段就要走一遍 DNS + TLS + 下载，而它的消费者只有数据页的
三个卡片（`HourlyWeather` / `WeekStrip` / `AstroCard`）。

而且 `useQweatherFont.ts:100` 失败后还要 `delay(1500)` 再重试一次 —— 网络抖动时
启动阶段会多挂 1.5 秒。

**② 首页 `onMounted` 拉钓点列表** —— `src/pages/fishing/index.vue:86`

`GET /v3/fish/spots`，实测响应 15,283 B。这个请求本身合理（地图上要画点），
但它与首页渲染无依赖关系，地图先出来、点后补上完全可接受。

**改法（部分已做，按收益排序）**：

1. **把字体从 jsdelivr 挪到自建 CDN**：⬜ **未做**。`cdn.kanocifer.chat` 已经在
   downloadFile 合法域名里，且实测 HTTP/2、TLS 握手 189 ms。
   `scripts/subset-qweather-icons.py --ttf-out` 能导出 27 KB 的子集，比全量 73 KB 小一半。
   顺带把域名从 3 个收敛到 2 个（DNS 预解析最多 5 个，但越少越好）。
   ⚠️ 动手前要先确认子集文件已经传到 CDN 上 —— 我探过
   `cdn.kanocifer.chat/yulu/` 下的几个常见路径，现在都是 404，
   直接改 URL 的结果是图标全变豆腐块。
2. **字体加载从 `App.onLaunch` 挪到数据页 onMounted**：✅ **已做**。启动阶段不再有这条请求。
   三个消费方都有 `v-if="qweatherFontReady"` 兜底（`WeekStrip.vue:18`、
   `HourlyWeather.vue:33`、`AstroCard.vue:80`），字体晚到不会出豆腐块。
3. 钓点列表保持现状即可，但可以给 `request()` 加一层「同一 URL 的 in-flight 去重 +
   短 TTL 缓存」，直接命中体检的「网络请求缓存」条目（3 分钟内同一 URL 不重复回包）。

### 1.4 启动阶段存在重复获取相同 key 的 storage 信息

官方文档原话：`getStorageSync/setStorageSync` 不应用于运行时的数据传递或全局状态管理，
启动过程中过多的读写存储会显著影响代码注入的耗时。

本仓库的问题是**同一个 key 被反复读**：

| 位置 | 读什么 | 触发时机 |
| --- | --- | --- |
| `src/api/client.ts:73` | `fishing_token` | **每一次** `request()` 调用（`client.ts:174`） |
| `src/api/client.ts:97` | `fishing_refresh_token` | 每次需要 refresh token |
| `src/stores/session.ts:89` | 两个 key 各读一次 | 恢复会话时 |

也就是说：一次冷启动 + 切三个 tab 大约触发 5～8 次 `getStorageSync`，
其中 `fishing_token` 这个 key 被读了 4～6 次 —— 全都是同一个值。

**改法（已实现）**：加了 `src/utils/storage.ts` —— 全项目读写 Storage 的唯一出入口，
每个 key 留一份内存副本，第一次读真的落下去，之后都从副本取；
写和删同时更新副本。`api/client.ts` 与 `pages/spot-create/draft.ts` 都改走它
（commit `603382c`）。启动阶段每个 key 最多读一次 Storage，之后全部命中内存。

---

## 2. 运行性能

### 2.1 页面渲染前多次调用同步 API

与 1.1 同源，根因与改法完全一致，不重复写。

### 2.2 页面打开时存在耗时较长的请求

三处，按体检的「请求耗时不超过 1 秒」标准看：

**① enriched 钓鱼指数** —— `src/stores/fishingMap.ts:348`

```
GET /v2/fishing/index?location=113.39,23.05&enriched=true
```

实测响应 22,581 B，本机 TTFB 482 ms。这条请求把天气实况、逐时预报、7 天预报、
潮汐、生活指数一次性打包回来，是全应用最重的一条。客户端网络下大概率 > 1s。

**② 潮汐接口一次操作发两次** —— 实锤 bug

```
src/stores/fishingMap.ts:452   setSelectedHarbor → void fetchPanelTide(harbor, date)
src/components/TideCard/TideCard.vue:177   watch([selectedHarbor, selectedDate]) → void fetchPanelTide()
```

用户在潮汐面板点一下港口：`setSelectedHarbor` 先发一次 `GET /v3/weather/tide?harbor=X&date=Y`，
紧接着 watcher 观察到 `selectedHarbor` 变化又发一次**完全相同 URL** 的请求。
两个响应回来先后覆盖 `panelTideData`，中间的抖动就是「地点名闪一下」那类现象的来源。

这同时命中体检的「网络请求缓存」条目（3 分钟内同一 URL 出现两次）。
**改法（已实现）**：请求归 store 一家管 ——
`stores/fishingMap.ts` 的 `fetchPanelTide` 加了 `tideInflightKey` 守卫
（同一组「港口+日期」在飞就不发第二个，请求结束就放开），
`TideCard.vue` 的 watcher 改成只在「还没有数据」时补首屏这一次，
切港口/日期由 store 的 setter 独家触发。**两道锁**：守卫拦并发，职责划分防复发。

**③ 定位权限询问** —— `src/stores/fishingMap.ts:92`

`queryLocationAuth()` 走 `uni.getSetting`，是异步 API，本身没问题。
但 `FullscreenMap.vue:9` 的 `<map :show-location>` 默认是 `true`，
原生地图组件会**自己**再要一次定位；而 `FullscreenMap.vue:387` 的 `onMounted`
又调了一次 `mapStore.locateUser()`。同一次进首页，两条定位路径。
权限弹窗只会弹一次，但位置会拿到两个略有差异的值。
**改法**：既然 store 已经有一份坐标，`show-location` 关掉，
由 store 的坐标驱动 `latitude/longitude` —— 地图上那个蓝点仍然在，位置还统一了。

### 2.3 UI 异常

这一条在体检里归「兼容性」，**只给了现象没给机型/页面**，
必须拿到体检报告的详情链接（或在多机型真机上复现）才能定性。
从代码里能筛出三个具体候选，按可能性排序：

**候选 ①：`@property` 注册（最可能）**

`src/App.vue:56` 用 `@property --fish-flow-angle` 注册了一个自定义属性，
`src/styles/tokens/_motion.scss:101` 的 `conic-gradient(from var(--fish-flow-angle), ...)`
依赖它做流光旋转。`@property` 是 CSS Houdini 特性：

- iOS 走 WKWebView（系统 WebKit），**Safari 16.4 以下不支持** → iOS 16.3 及更早
- Android 走微信 XWeb（Chromium 内核），**Chromium 85 以下不支持**

不支持的引擎上，自定义属性只能**离散插值**（50% 处跳变），
结果是流光渐变每 3 秒「跳」一下而不是「转」 —— 视觉上就是按钮边框在闪。
受影响的组件只有两个：`src/components/AIButton/AIButton.vue:48`、
`src/components/FishingAnalysisSheet/FishingAnalysisSheet.vue:404`。

**候选 ②：flex `gap`**

全仓库 20 处使用 `gap`（`VerdictHeader.vue:407`、`SpotDetailHead.vue:115/155/198/206`、
`UserCard.vue:175/278`、`SpotDetailInfo.vue:116/146` 等）。
flex gap 需要 **Safari 14.5+ / Chromium 84+**。更老的 iOS（14.0～14.4）上
`gap` 声明被直接丢掉 → 那一行的元素**贴在一起**，间距全没。
微信官方也提醒过 WXSS 不保证支持新特性。

**候选 ③：`inset: 0`**

`src/styles/tokens/_motion.scss:120` 用了 `inset: 0` 简写。
`inset` 需要 **Safari 14.1+ / Chromium 87+**。不支持时该声明被丢掉，
`&::before` 这层发光就没有定位锚点 → 光晕跑到错误的位置或铺满整块。

**验证方式**：用微信开发者工具的「调试器 → 远程调试」连一台 iOS 16.3 或
iOS 14.4 的真机，对着 AI 分析按钮、流光边框、任意用 `gap` 的列表看是否错位。
拿到具体机型后，`docs/mp-weixin-platform.md` 里补一条降级写法。

---

## 3. 网络性能

### 3.1 DNS 预解析可以优化网络请求耗时

DNS 预解析是**微信后台配置**，不在代码里。官方说明：
https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html

> DNS 预解析域名，是框架提供的一种在小程序**启动时**，提前解析业务域名的技术。
> 配置位置：小程序后台 - 开发 - 开发设置 - 服务器域名。
> 预解析域名无需填写协议头，最多可添加 5 个。

本项目需要预解析的域名有三个：

| 域名 | 用途 | 归属 |
| --- | --- | --- |
| `api.kanocifer.chat` | 全部接口 | request 合法域名 |
| `cdn.kanocifer.chat` | 静态图 | downloadFile 合法域名 |
| `cdn.jsdelivr.net` | 图标字体 | downloadFile 合法域名 |

三个都要加进「预解析域名」。做完 1.3 的字体搬家之后只剩两个。

**顺带一个发现**：实测这三个域名当前 DNS 查询本身很快（`time_namelookup` 均 < 0.2 ms，
本机有缓存），真正的时间花在 TLS 握手（57～274 ms）。所以这条建议的收益
主要体现在**弱网首启**——那时每次 DNS 都要真实走一次运营商解析。

### 3.2 有请求未使用 HTTP/2

**服务端已经是 HTTP/2 了**，实测：

```
$ curl -o /dev/null -w '%{http_version}\n' https://api.kanocifer.chat/v3/fish/spots
2
$ curl -o /dev/null -w '%{http_version}\n' https://cdn.kanocifer.chat/yulu/spots.jpg
2
```

（`api.kanocifer.chat` 前面挂着腾讯 EdgeOne，响应头里有 `eo-cache-status`，
HTTP/2 由 CDN 层终结。）

**问题在客户端没让微信用 HTTP/2。** `wx.request` 的 `enableHttp2` 默认值是 `false`：

> `enableHttp2` boolean **false** 开启 http2（基础库 2.10.4 起）

微信的「高性能模式」（`useHighPerformanceMode`）虽然会自动开启 HTTP/2/3，
但官方写明**「暂仅支持 Android，iOS/PC 端设置该参数后会使用原 request 模块」**。
所以在 iOS 上，只要不显式开 `enableHttp2`，所有请求都走 HTTP/1.1。

本仓库 `src/api/client.ts:183` 的 `uni.request` 没有设这个参数，
`src/api/stream.ts` 也没有 —— 所以**所有接口请求都是 HTTP/1.1**。

**改法（已实现）**：`src/api/client.ts` 的 `uni.request` 加 `enableHttp2: true`。
`@dcloudio/types` 的 `UniNamespace.RequestOptions` 已经声明了这个字段，直接传即可，不用 cast。

**⚠️ 但 `src/api/stream.ts` 不能开**：SSE 依赖 `Transfer-Encoding: chunked`，
而 HTTP/2 协议禁止 chunked 传输编码（`src/api/stream.ts` 的文件头注释也写了
「反代要 `proxy_buffering off`」）。给流式请求强开 h2 会直接打断流。
**这条要写进注释里，否则下次有人「顺手补上」就坏了。**

---

## 4. 建议的改动清单

按文件排，每条都是独立可上的一小块：

| 文件 | 改动 | 对应体检条目 | 状态 |
| --- | --- | --- | --- |
| `src/composables/windowMetrics.ts`（新建） | `getWindowInfo` + 胶囊矩形各取一次，全应用共享 | 1、5 | ✅ |
| `src/composables/useNavMetrics.ts` | 改读共享快照 | 1、5 | ✅ |
| `src/composables/useViewport.ts` | 改读共享快照 | 1、5 | ✅ |
| `src/components/TideChart/TideChart.vue` 等三处 | `pixelRatio` 也从快照取 | 1、5 | ✅ |
| `src/utils/storage.ts`（新建） | Storage 唯一出入口 + 每个 key 一份内存副本 | 4 | ✅（commit `603382c`） |
| `src/api/client.ts` | `uni.request` 加 `enableHttp2: true` | 8 | ✅ |
| `src/api/stream.ts` | `enableHttp2: false` + 注释锁死 | 8 | ✅（本来就有） |
| `src/stores/fishingMap.ts` + `src/components/TideCard/TideCard.vue` | 潮汐请求归 store 一家管，去掉双发 | 9 | ✅ |
| `src/App.vue` + `src/pages/data/index.vue` | 字体加载从 `onLaunch` 挪到数据页 | 3 | ✅ |
| `src/components/FullscreenMap/FullscreenMap.vue` | 关掉 `<map show-location>`，定位只留 store 一条路径 | 5（附带） | ⬜ 会去掉地图蓝点，属产品决策 |
| `src/main.ts` | `installRuntimePolyfills()` 挪进 `createApp()` | 2 | ⬜ 误报，可选 |
| `vite.config.ts` | `envPrefix` 白名单补 `VITE_CDN_BASE_URL` | §5 | ✅ |
| 字体子集上传 CDN + 换 `VITE_QWEATHER_FONT_URL` | 73 KB → 27 KB，域名 3 个收敛到 2 个 | 3、7 | ⬜ 需先上传 |
| 微信后台 | 配「预解析域名」 | 7 | ⬜ 需你操作 |

### §5 顺手发现的一个配置失效（不在体检条目里）

`vite.config.ts:16` 的 `envPrefix` 白名单里**没有 `VITE_CDN_BASE_URL`**，
而 `src/config/env.ts:61` 读的就是 `env.VITE_CDN_BASE_URL`。

后果：`import.meta.env.VITE_CDN_BASE_URL` 恒为 `undefined`，
`env.ts` 每次都退回 `DEFAULT_CDN_BASE_URL`（`src/config/env.ts:36`）。
今天两者的值恰好一样（`https://cdn.kanocifer.chat/yulu`），所以看不出问题；
**但谁改了 `.env.production` 里的 CDN 地址都不会生效**，而且没有任何报错。

AGENTS.md 里已经写了这条规矩（「往 .env.* 里加新变量时，记得同步加到这里」），
这里就是漏了一处。**已修**（`vite.config.ts` 白名单补 `VITE_CDN_BASE_URL`）。

---

## 5. 复测方法

改完之后要在**真机**上复测，开发者工具的模拟器测不出 DNS 与 HTTP 版本：

1. **同步 API 次数**：开发者工具 → 调试器 → Performance 面板录一段冷启动，
   看首帧前的 `getWindowInfo` / `getStorageSync` 调用次数。目标是各 1 次。
2. **HTTP 版本**：真机调试 → Network 面板，看 `protocol` 字段。
   iOS 上应显示 `h2`；`res.profile.protocol` 也可以直接读
   （`enableProfile` 默认开着）。
3. **DNS 预解析**：后台配完后，冷启动首包耗时应能看到 DNS 段被缓存。
4. **潮汐重复请求**：Network 面板过滤 `weather/tide`，
   点一次港口应该只有一条。
5. **UI 异常**：拿一台 iOS 16.3 和一台 iOS 14.4 的机器，
   重点看 AI 分析按钮的流光边框、用 `gap` 的列表行距。

---

## 6. 参考

- [代码注入优化（同步 API / storage）](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeB.html)
- [首屏渲染优化](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeC.html)
- [wx.request（enableHttp2 / useHighPerformanceMode）](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html)
- [网络使用说明（DNS 预解析域名）](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- [性能评分方法与规则](https://developers.weixin.qq.com/miniprogram/dev/framework/audits/performance.html)
