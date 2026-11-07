# 架构与数据流

改数据流、接接口、动 store。

## 分层

依赖单向向下；组件之间不互相 import，共享提到 store。

```
pages / components → stores → api → client.request → uni.request
                         ↓
                      utils（纯函数：换算、口径、文案）
```

types 与 constants 是叶子：utils 可以依赖它们，它们不反过来依赖 utils。

## store

| store                | 管什么                                                      |
| -------------------- | ----------------------------------------------------------- |
| `useLocationStore`   | 定位：userLocation / manualLocation / 授权状态 / locateUser |
| `useConditionsStore` | 渔况：鱼口概率、天气、分钟降水、潮汐                        |
| `useSpotStore`       | 钓点：markers、mySpots、selectedMarker                      |
| `useSessionStore`    | 登录态                                                      |
| `useFishingLogStore` | 钓鱼日志                                                    |

依赖方向只有一条：conditions → location。spots 不依赖别的 store。
组件读 store 不互相 import；页面负责编排。

## 单一真源

同一件事只有一处实现。改口径只改这一处。

- **坐标串**：`utils/geo.ts` 的 `locationKey()`（两位小数）。请求参数与缓存键共用它。
- **天气码**：`utils/weather.ts` 的 `WEATHER_CODE_RANGES` —— 一张表同时给图标与外观组。
- **雨强**：`utils/precip.ts` 的 `RAIN_LEVELS`（1 小时雨强 mm/h）。分钟降水按 5 分钟折算，不再另写阈值。
- **钓鱼等级**：`utils/weather.ts` 的 `LEVEL_META` —— tone 与 verdict 同一张表。
- **缓动**：`utils/motion.ts` 的 `easeOutCubic`。
- **toast**：`utils/toast.ts` 的 `showToast()` —— 标题截断只此一处（14 字）。
- **错误文案**：`utils/error.ts` —— `toErrorMessage()` / `fetchErrorMessage()` / `loginErrorMessage()`。
- **内存副本**：`utils/storage.ts`。api/client 不再自留 token 副本。
- **视图派生类型**：`src/types/view.ts`（Tone / Level / WeatherGroup / ForecastDay …）。

## 端点清单

v2/fishing/index、v3/fish/records、v3/fish/spots、v3/fish/logs。

## 钓鱼记录 ≠ 钓鱼反馈

钓鱼反馈写匿名表 fishing_record，钓鱼记录写 fishing_log；训练样本必须同分布，不共用一张表。

- 已登录先写记录再写反馈，失败不回滚记录；未登录只剩反馈。
- 只支持今天：log_date 须为服务端当天，否则 400。
- 打卡是派生状态：空渔获 = 当天打卡，每天最多一条。
- 地点只能选点：没选点就不带位置。

## 坐标

两位小数，勿改 toFixed(6)；手动挑的点 > 定位 > 默认中心。

## 归一

换算在 weather-normalize.ts，store 边界调一次。

## 天气码归组

- 按区间归组，不按码名
- 未覆盖的码走通用样式：拿掉天气的颜色，不动天气的信息
- ⚠️ 空态不是加载态 —— 加载判定要算进 locating；别把后端原文摆到卡上
- ⚠️ 「今天」只有一个出处

## 守卫

in-flight 守卫用 `utils/singleFlight.ts`。key 是「这一轮是什么」：坐标、月份、港口+日期。

- 同 key 在飞 → 复用那一个 Promise，不发第二条
- 换 key → 另一轮，旧的响应回来时 `isCurrent(key)` 为 false，丢掉
- `restart()` 才是「无视在飞、重发一次」，只有用户主动刷新用

请求归 store 一家管。

## 组件边界

组件读 store 不互相 import；页面负责编排。

## AI 流式

useFishingAnalysis 做 120ms 节流；思考通道结束≠正文结束。

## 审核

审核在 Web 后台；驳回条目显示 review_note。

## 已知缺口

- ⚠️ **别把成功提示写成「已添加」**
- ⚠️ 别「顺手补一个查询端点」

## 约定细节

- 坐标序列化两位小数，`locationKey()` 唯一出处
- fxTime 截法只有一处：fxHourKey() 13 位 / fxMinuteKey() 16 位；⚠️ **别写 slice(0, 14)**
- 数值字段统一过 `utils/number.ts` 的 `toFiniteNumber()`：空值给 null，不给 0

## 媒体

媒体路径一律是相对路径，显示前过 mediaUrl()；POST /v3/upload 的 multipart 字段 file + type，type 只认 blog/gallery/feedback/record/空串。

## 静态资源

见 docs/mp-weixin-package.md「静态资源」。
