# store/util 解耦重构 —— 决策日志

审查对象：`src/stores/`、`src/utils/`。

## 结论

store/util 里 30 处「同一件事有两份实现」收成单一真源；1033 行的 `fishingMap` 拆成三个 store；死代码与没人用的导出清掉；三处守卫失效的 bug 修掉。

行为保持不变 —— 有意改掉的地方只有下面「行为变化」一节列的那些。

## 新增的单一真源

| 文件 | 承担 |
| --- | --- |
| `src/utils/geo.ts` | 坐标串（两位小数）。请求参数与缓存键共用 |
| `src/utils/number.ts` | 数值字段收口：字符串/数字/null/空串 → `number \| null` |
| `src/utils/singleFlight.ts` | in-flight 守卫。同 key 复用、不同 key 作废旧的 |
| `src/utils/toast.ts` | toast 唯一出入口。标题截断只此一处 |
| `src/types/view.ts` | 视图派生类型（Tone / Level / WeatherGroup / ForecastDay …） |

## 一、隐藏耦合（代码里看不出，得读实现才发现）

### 1. 坐标串三份实现

`api/fishing.ts` 的 `toLocationParam()`、`stores/fishingMap.ts` 的 `locationKey()`，以及文档里写的「toLocationParam() 唯一出处」—— 文档说唯一，代码有两份。

**改法**：新建 `utils/geo.ts` 的 `locationKey()`；api 与两个新 store 都用它。文档同步改成 `locationKey()`。

### 2. 潮汐平潮阈值三处、两个值

`utils/tide.ts` 的 `trendOf()` 用 0.005、`tideTrend()` 用 0.01、`components/TideChart/TideChart.vue` 用 0.005。

同一个物理量（相邻两小时的潮高差，米）在两处算法不同：钓点详情页写「退潮中」、曲线顶标「涨潮中」。

**改法**：`utils/tide.ts` 收敛成 `tideTrendOfDelta(delta)` + `FLAT_DELTA_M = 0.005`，三处统一走它。

### 3. 雨强分档阈值写两遍

`utils/weather.ts` 的 `precipLevel()` 用 2.5 / 8 / 16（mm/h），`utils/precip.ts` 的 `LEVELS` 用 2.5/12、8/12、16/12（5 分钟折算）。

**改法**：`utils/precip.ts` 的 `RAIN_LEVELS` 存 mm/h 原值，分钟图从它折算成 5 分钟量纲。实况卡改调 `rainLevelOf()`。

### 4. easeOutCubic 两份

`utils/motion.ts` 有一份导出，`utils/chartCanvas.ts` 的 `createEntryAnimator` 里内联 `1 - Math.pow(1 - t, 3)`。

**改法**：chartCanvas 改用 motion 的。

### 5. canvas 色板与 SCSS 令牌漂移

`utils/chartPalette.ts` 的 `tide: '#0f66d6'` 注释标着 `$fish-tide`，而 `_color.scss` 里 `$fish-tide: #007aff`。同文件的 `metricPrecip` 用的是 `#007aff`。

**改法**：潮汐色改回 `#007aff`。

### 6. 天气码两张表

`ICON_RANGES`（管图标）与 `WEATHER_GROUP_RANGES`（管外观组）覆盖的码空间不完全一致：改一处要改两处，漏一处就出现「有配色没图标」。

**改法**：合成 `WEATHER_CODE_RANGES` 一张表，每行同时带 icon slug 与外观组。

### 7. 等级词两张表

`TONE_BY_LEVEL` 与 `VERDICT_BY_LEVEL` 是同一批等级词的两个维度。加一个等级要改两处。

**改法**：合成 `LEVEL_META`，一行同时带 tone 与 verdict。

### 8. minutesOfDay 两份

`utils/weather-normalize.ts` 自己写了一份，`utils/date.ts` 也导出了一份。

**改法**：前者改用后者的（后者多做了小时/分钟范围校验）。

### 9. toast 三套写法并存

50 处裸 `uni.showToast`，外加 `stores/fishingMap.ts` 与 `pages/spot-detail/store.ts` 各抄了一份「标题超长截成省略号」的 `notifyError`。

**改法**：全部走 `utils/toast.ts` 的 `showToast()`；两份本地 `notifyError` 删掉。

### 10. 错误文案三套

`utils/error.ts` 的 `toErrorMessage`、`api/auth.ts` 的 `loginErrorMessage`、`stores/fishingMap.ts` 的 `describeFetchError`，三处各判一次。

**改法**：全部收进 `utils/error.ts` —— `toErrorMessage()` / `fetchErrorMessage()` / `loginErrorMessage()`。`api/auth.ts` 不再管文案。

### 11. 两层缓存

`api/client.ts` 自维护 `accessToken` / `refreshToken` / `tokensLoading`，`utils/storage.ts` 另有一层 `cache` Map。同一个值存在两个地方。

**改法**：值只存在 `utils/storage.ts` 的副本里；client 只记「读过了没有」这一个状态。异步读回值落副本时带**写入代数**守卫 —— 期间有人写过就不落，避免旧值盖新值。

### 12. session 里同一段逻辑写两遍

`login()` 与 `saveNickname()` 都在做「写两个 token + 覆盖 user」。

**改法**：合成 `applySession()`。

## 二、不必要耦合

### 13. fishingMap 1033 行管五件事

定位、天气、降水、潮汐、钓点塞在一个 store 里，28 个消费方里成员使用高度分散（`FeatureBreakdown.vue` 只用 `indexData`）。

**改法**：拆成三个 store ——

| store | 管什么 |
| --- | --- |
| `useLocationStore` | userLocation / manualLocation / 授权状态 / locateUser |
| `useConditionsStore` | 鱼口概率、天气、分钟降水、潮汐 |
| `useSpotStore` | markers、mySpots、selectedMarker |

依赖方向只有一条：conditions → location。spots 不依赖别的 store。

### 14. fetchSpot 只是转发

`stores/fishingMap.ts` 的 `fetchSpot()` 逐字转发 `fishingSpotApi.getByIdWithSession()`。

**改法**：删掉转发，`pages/spot-edit/index.vue` 直接调 api —— 与 `pages/spot-feedback`、`pages/record/create` 既有做法一致。

### 15. fetchMySpots 的 silent 参数只服务一处

`silent` 只被 `pages/mine/index.vue` 用到，而那一页要的只是一个数量。

**改法**：参数删掉。store 只写 `mySpotsError`，由页面决定说不说这句话 —— 「我的钓点」页说，「我的」页不说。

## 三、冗余

### 16-18. 零引用的死代码

`utils/canvas.ts` 的 `rampColor`、`utils/svg.ts` 的 `applySvgColor` 与 `stripSvgSize`、`utils/date.ts` 的 `formatMoment` —— 全项目 0 引用，删。

### 19-20. 内部专用导出收回

只在定义文件里被用的导出，改回非导出：

`normalizeWeatherHourly` / `normalizeWeatherDaily`（外部 0 引用，且 `normalizeWeatherPayload` 本来就在重复它们，改成复用）、`normalizeWeatherCurrent`、`windCompassToChinese`、`moonPhaseToChinese`、`weatherIconSlug`、`setThemeMode`、`niceBounds`、`cleanPoints`、`monotoneTangents`、`splitSegment`、`axisRequest`、`buildTicks`、`startAnimation`、`precipLevelOf`。

### 21. num → toFiniteNumber

`utils/weather.ts` 的 `num()` 与新写的 `utils/number.ts` 职责重叠。统一用后者（更明确：空值给 null，不给 0，NaN 不渗进模板）。

### 22. 视图类型下沉，解开 constants ↔ utils 环

`Tone` / `Level` / `WeatherGroup` / `PressureLabel` / `PressureTone` / `ForecastDay` 原本定义在 `utils/weather.ts`，而 `constants/weatherHero.ts` 要 import 它的类型 —— 结果 constants ↔ utils 形成循环。

**改法**：下沉到 `src/types/view.ts`。types 与 constants 是叶子，utils 可以依赖它们，它们不反过来依赖 utils。

### 23. cloudLevel 的 tone 维度形同虚设

四档全返回 `tone: 'muted'`。类型上承诺了一个永远不变的值。

**改法**：改成返回 `Label`（只有档位词），`WeatherCard` 相应放宽类型。云量本来就不该有色阶 —— 阴天未必比晴天差。

## 四、特例与 bug

### 24. fishingLog.create() 上叠了两段矛盾的 JSDoc

第一段说「建完立刻把当月数据重取一遍」，第二段说「写完**不**在这里取数」。代码按第二段走。

**改法**：删掉第一段。

### 25. fishingLog 的 inflight 守卫形同虚设

`switchMonth()` 每次都带 `force: true`，直接覆盖 `inflight` 指针；而且先发的那条一结束就把指针清掉，后发的那条还在飞却已经没人守。

**改法**：改用 `utils/singleFlight.ts`，key 是月份。换月份即新一轮，旧的响应回来时 `isCurrent(key)` 为 false，丢掉。`switchMonth` 不再需要 force。

### 26. session.error 是死状态

只被写 `''`，从来没被读过。

**改法**：删。

### 27. session 四个没人用的导出

`restoring`、`hasAvatar`、`needsProfile`、`avatarUrl` 外部 0 引用（消费方自己算了一遍 `hasAvatar`）。

**改法**：删。`hasNickname` 内部还要用，保留但不再导出。

## 五、注释清理

删掉 39 处只复述标识符的摘要行（例如 `/** 步长。 */` 挂在 `const STEP = 60` 上、`/** 档位 → 档位名 */` 挂在 `precipLevelLabel` 上）。

保留全部讲「为什么」的段落 —— 外部约束、绕坑方案、为什么不能改、为什么是这个口径。

## 行为变化

有意改掉的，都在这里：

1. **潮汐平潮阈值 0.01 → 0.005 米**。钓点详情页的涨落标签与潮汐曲线顶的状态现在必然一致。
2. **`fetchMySpots` 失败不再由 store 弹 toast**。「我的钓点」页改为自己弹，「我的」页不弹（原先靠 `silent` 参数达到同样效果）。
3. **`utils/storage.ts` 的写/删无论宿主成功与否都更新内存副本**。宿主写失败只说明「这次没落盘」（重启后读回旧值），不说明「这一轮的值不算数」。原先 `api/client` 自留副本时就是这个行为。
4. **`readStorageAsync` 现在会落进内存副本**（带写入代数守卫，不会覆盖更新的值）。原先刻意不落，导致同一个 key 读两遍。
5. **canvas 潮汐曲线颜色 `#0f66d6` → `#007aff`**，对齐 `$fish-tide`。
6. **toast 标题统一截断在 14 字（含省略号）**。原先大部分调用点没有这层截断，交给微信自己截。
7. **`cloudLevel` 不再返回 tone**。

## 验证

改动前基线：type-check / lint 均通过。

改动后：

- `pnpm type-check`（vue-tsc --noEmit）—— 通过，无输出
- `pnpm lint`（oxlint）—— 通过，无 warning
- `pnpm build`（uni build -p mp-weixin）—— DONE Build complete.

残留引用清扫：

- `mapStore` / `useFishingMapStore` —— 0 处
- `toLocationParam` —— 0 处
- `uni.showToast` —— 只剩 `src/utils/toast.ts` 里的实现
- `TOAST_TITLE_MAX` / `notifyError` —— 0 处
- `rampColor` / `applySvgColor` / `stripSvgSize` / `formatMoment` —— 0 处
