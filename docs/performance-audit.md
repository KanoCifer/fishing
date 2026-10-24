# 性能体检报告 —— 微信「优化建议」九条逐条对照

体检结论（开发者工具「优化建议」面板，2026-10-23，共两轮）。这份文档是**一次体检的记录**，不是常驻参考：
九条建议的根因与绕法已经写进各自的常驻文档，这里只留结论、实测数、状态与复测方法。

| 领域                               | 去哪                                          |
| ---------------------------------- | --------------------------------------------- |
| 同步 API 收敛、窗口快照            | `docs/mp-weixin-platform.md`「窗口快照」      |
| Storage 内存副本                   | `docs/mp-weixin-platform.md`「存储」          |
| 字体按需加载                       | `docs/mp-weixin-platform.md`「字体」          |
| `enableHttp2` 与 SSE 的互斥        | `docs/mp-weixin-network.md`「请求的两个开关」 |
| DNS 预解析、三份域名名单           | `docs/mp-weixin-network.md`「微信后台配置」   |
| 潮汐请求归 store 一家管            | `docs/architecture.md`「守卫」                |
| `envPrefix` 是白名单               | `AGENTS.md`「约定」                           |
| `@property` / `gap` / `inset` 门槛 | `docs/mp-weixin-package.md`「渲染特性有下限」 |

## 结论速览

九条里 **五条前端代码能直接改**、**两条要去微信后台配**、**一条（UI 异常）必须靠设备报告定性**。
另有一条体检没点名、但同属「重复请求」的实锤 bug（潮汐接口一次操作发两次）。

| #   | 体检条目                     | 根因                                             | 归属层                 | 优先级 | 状态      |
| --- | ---------------------------- | ------------------------------------------------ | ---------------------- | ------ | --------- |
| 1   | 页面渲染前多次调用同步 API   | 每个页面都调 `getWindowInfo` 两次 + 胶囊矩形一次 | 前端                   | P0     | ✅ 已改   |
| 2   | App.onLaunch 前存在耗时操作  | `main.ts` 顶层执行 `installRuntimePolyfills()`   | 前端                   | P2     | ⬜ 可选   |
| 3   | 启动时存在耗时较长的请求     | 字体下载 73 KB + 首页拉钓点列表                  | 前端                   | P0     | ✅ 已改   |
| 4   | 启动阶段重复获取相同 key     | `request()` 每发一次就读一遍 token               | 前端                   | P0     | ✅ 已改   |
| 5   | 页面打开时存在耗时较长的请求 | enriched 钓鱼指数 22 KB 重载荷                   | 前端 + 后端            | P0     | 🟡 部分   |
| 6   | UI 异常                      | 三个候选：`@property`、flex `gap`、`inset`       | 前端（待设备报告确认） | P2     | ⬜ 待定性 |
| 7   | DNS 预解析                   | 三个域名未在微信后台配「预解析域名」             | 微信后台               | P1     | ⬜ 待做   |
| 8   | 有请求未使用 HTTP/2          | `uni.request` 没开 `enableHttp2`（默认 false）   | 前端                   | P0     | ✅ 已改   |
| 9   | 潮汐接口重复请求（未点名）   | store 的 setter 与组件的 watcher 各发一次        | 前端                   | P0     | ✅ 已改   |

已改动的落点：

- **#1** 新增 `src/composables/windowMetrics.ts`；`useNavMetrics` / `useViewport` / 三个图表组件全部改读它，同步 API 从每页 3 次降到全应用 1 次
- **#4** `src/utils/storage.ts`（commit `603382c`）—— 全项目读写 Storage 的唯一出入口，每个 key 留一份内存副本
- **#8** `src/api/client.ts` 的 `uni.request` 加 `enableHttp2: true`（SSE 那边显式 `false`，别统一）
- **#9** `stores/fishingMap.ts` 加 `tideInflightKey` 守卫；`TideCard.vue` 的 watcher 改成只补首屏，切港口/日期由 store 独家发
- **#3** 字体加载已从 `App.onLaunch` 挪到数据页 `onMounted`

## 第二轮体检（2026-10-23 21:25）

第一轮改完之后重新体检，**只剩两条未通过**。这一轮的两条都不是「第一轮没改干净」，
而是第一轮没暴露出来的两个新根因。

### 未通过 ①：首屏渲染前多次调用同步 API

体检给的调用明细：

| 页面                | 接口             | 调用次数 | 调用耗时 |
| ------------------- | ---------------- | -------- | -------- |
| App                 | `getStorageSync` | 1        | 1 ms     |
| pages/fishing/index | `getStorageSync` | 1        | 4 ms     |

两次调用，两处根因：

- **`pages/fishing/index` 那次是我们自己的。** `request()` 拼 header 时读
  `fishing_token`，走的是同步 `getStorageSync`。
  **改法**：token 改异步加载 —— `utils/storage.ts` 加 `readStorageAsync`
  （`uni.getStorage`，异步不阻塞），`api/client.ts` 用内存副本 +
  `ensureTokensLoaded()`，`request()` 在拼 header 前 await 一次。
  配套纪律：所有要拼 Authorization 的地方都要先 await（详见
  `docs/mp-weixin-platform.md`「存储」）。
- **`App` 那次是 mp-html 的。** uni 运行时的 `getDeviceInfo` 协议会调
  `useDeviceId()`，内部是 `wx.getStorageSync('__DC_STAT_UUID')` ——
  一次同步 Storage 读。mp-html 的 `parser.js` 在**模块顶层**调
  `uni.getDeviceInfo()`，而它被打进 `common/vendor.js`，App 一启动就执行。
  **改法**：打 pnpm 补丁 `patches/mp-html@2.5.2.patch`，把 `system` 改成惰性取。

现在首屏渲染前的同步 Storage 读是 **0 次**（`utils/storage.ts` 的同步
`readStorage` 只剩新建钓点页的草稿在用，不在启动链路上）。

### 未通过 ②：小程序启动时存在耗时较长的请求

体检给的两条（都在 `pages/fishing/index`）：

| 请求                                    | 请求耗时 | 调用总耗时 | TTFB   |
| --------------------------------------- | -------- | ---------- | ------ |
| `GET /v2/fishing/index?…&enriched=true` | 402 ms   | 453 ms     | 392 ms |
| `GET /v3/fish/spots`                    | 366 ms   | 377 ms     | 251 ms |

**根因 ①：地图页在拉一条它根本不显示的数据。**
`stores/fishingMap.ts` 里有个「坐标变了就重取指数」的 watch，于是地图页一进页面、
定位一回来，就发 `GET /v2/fishing/index?...&enriched=true` —— 全应用最重的一条
（22 KB，TTFB 180~390 ms）。而**地图页一个像素都不显示它**：钓鱼指数、天气、潮汐
只有数据页那三张卡在用。
**改法**：删掉那个 watch，取数归数据页自己管（`ensureWeatherAndFishing`
每次都比一遍当前坐标，坐标变了就重取；地图页改了坐标再切回数据页，
`onPageShow` 会触发它）。

**根因 ②：钓点列表在首屏渲染完成之前就发了。**
**改法**：从 `onMounted` 挪到 `onReady` + 让开一个宏任务。
地图先出来、点后补上，用户无感。

改完之后，**启动阶段一条网络请求都没有**。

### 这一轮顺手确认的服务端事实

| 端点                             | 缓存                                              | 实测 TTFB  |
| -------------------------------- | ------------------------------------------------- | ---------- |
| `GET /v3/fish/spots`             | `cache-control: public, max-age=300`，EdgeOne HIT | 104~238 ms |
| `GET /v2/fishing/index?enriched` | **没有** `Cache-Control`，每次 MISS               | 180~390 ms |

想让数据页那条 enriched 请求更快，得在服务端补缓存头（`Server-Py`
`app/api/v2/fishing.py`）。⚠️ 补之前先确认这个响应永远与用户无关 ——
它是按 location 算的，不含用户数据；哪天掺进用户相关字段就不能公开缓存了。

## 实测数据

| 项                                | 数值                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| enriched 钓鱼指数响应             | 22,581 B，本机 TTFB 482 ms —— 全应用最重的一条                                     |
| 首页钓点列表响应                  | 15,283 B                                                                           |
| 图标字体本体                      | 74,780 B（自建 CDN `cdn.kanocifer.chat/qweather-icons.woff`）；`scripts/subset-qweather-icons.py --ttf-out` 能导 27 KB 子集 |
| `dist/build/mp-weixin/app.js`     | 594 B —— 顶层只有一次 `installRuntimePolyfills()`，量级微秒级                      |
| 冷启动 + 切三个 tab 的 storage 读 | 约 5～8 次 `getStorageSync`，其中 `fishing_token` 占 4～6 次                       |
| 三个域名的 DNS 查询               | `time_namelookup` 均 < 0.2 ms（本机有缓存）；时间花在 TLS 握手（57～274 ms）       |
| 服务端 HTTP 版本                  | 已是 HTTP/2（`api.kanocifer.chat` 前挂腾讯 EdgeOne，h2 在 CDN 层终结）             |
| 第二轮：首屏前的同步 Storage 读   | 2 次（App 1 + 地图页 1）→ 改后 0 次                                                |
| 第二轮：启动阶段的网络请求        | 2 条（enriched 402 ms / spots 366 ms）→ 改后 0 条                                  |

## 还没做完的

- **字体子集上传 CDN** —— 73 KB → 27 KB。字体本体已迁到自建 CDN `cdn.kanocifer.chat/qweather-icons.woff`（与静态图同域名，域名从 3 个收敛到 2 个，✅ 已完成）；剩下的是把**子集**文件传上去替掉全量。⚠️ 换文件必须同时重算 `src/styles/generated/qweather-icons.css` 的码位映射表（`scripts/subset-qweather-icons.py` 断言会当场炸），只换 URL 不同步映射表 = 图标全变豆腐块
- **微信后台配「预解析域名」** —— `api.kanocifer.chat`、`cdn.kanocifer.chat`、字体域名，最多 5 个
- **`<map show-location>` 关掉**，定位只留 store 一条路径 —— 会去掉地图上的蓝点，属产品决策
- **`installRuntimePolyfills()` 挪进 `createApp()`** —— 体检误报，属于「为了让工具闭嘴」
- **enriched 载荷瘦身 / 补缓存头** —— 要后端配合（`Server-Py`）。现在这条请求
  每次都是 CDN MISS、TTFB 180~390 ms；数据页打开时会等它

## 真机复测方法

开发者工具的模拟器测不出 DNS 与 HTTP 版本，改完之后要在**真机**上复测：

1. **同步 API 次数**：开发者工具 → 调试器 → Performance 面板录一段冷启动，看首帧前的 `getWindowInfo` / `getStorageSync` 调用次数。目标是各 1 次。第二轮之后 `getStorageSync` 的目标是 **0 次**。
2. **HTTP 版本**：真机调试 → Network 面板，看 `protocol` 字段。iOS 上应显示 `h2`；`res.profile.protocol` 也可以直接读（`enableProfile` 默认开着）。
3. **DNS 预解析**：后台配完后，冷启动首包耗时应能看到 DNS 段被缓存。
4. **潮汐重复请求**：Network 面板过滤 `weather/tide`，点一次港口应该只有一条。
5. **UI 异常**：拿一台 iOS 16.3 和一台 iOS 14.4 的机器，重点看 AI 分析按钮的流光边框、用 `gap` 的列表行距。候选与引擎门槛见 `docs/mp-weixin-package.md`「渲染特性有下限」。
6. **启动阶段的请求**：冷启动录一段 Performance，启动阶段应该一条网络请求都没有 —— 钓点列表在首屏渲染完成后才发，enriched 只在数据页打开时才发。

## 参考

- [代码注入优化（同步 API / storage）](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeB.html)
- [首屏渲染优化](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeC.html)
- [wx.request（enableHttp2 / useHighPerformanceMode）](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html)
- [网络使用说明（DNS 预解析域名）](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- [性能评分方法与规则](https://developers.weixin.qq.com/miniprogram/dev/framework/audits/performance.html)
