# 架构与数据流

改数据流、接接口、动 store。

## 分层

依赖单向向下；组件之间不互相 import，共享提到 store。

## 数据流

页面 → store → api → client.request → uni.request；client.ts 剥信封、挂 token，调用点拿到的就是业务对象。

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

in-flight 守卫挡并发；请求归 store 一家管。

## 两个 store

mySpots 与 markers 不能合并；selectedMarker 放 store。

## AI 流式

useFishingAnalysis 做 120ms 节流；思考通道结束≠正文结束。

## 组件边界

组件读 store 不互相 import；页面负责编排。

## 审核

审核在 Web 后台；驳回条目显示 review_note。

## 已知缺口

- ⚠️ **别把成功提示写成「已添加」**
- ⚠️ 别「顺手补一个查询端点」

## 约定细节

- 坐标序列化两位小数，toLocationParam() 唯一出处
- fxTime 截法只有一处：fxHourKey() 13 位 / fxMinuteKey() 16 位；⚠️ **别写 slice(0, 14)**

## 媒体

媒体路径一律是相对路径，显示前过 mediaUrl()；POST /v3/upload 的 multipart 字段 file + type，type 只认 blog/gallery/feedback/record/空串。

## 静态资源

见 docs/mp-weixin-package.md「静态资源」。
