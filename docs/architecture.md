# 架构与数据流

## 分层

```
pages/         编排：取数、状态、版式
components/    渲染与交互，不自己取数
composables/   跨组件复用的逻辑（视口、导航栏尺寸、字体、SSE 状态机）
stores/        Pinia 单例：跨页共享的状态
api/           网络层：端点清单的唯一出处
utils/         无状态纯函数
types/         共享类型
constants/     文案与生成物
```

依赖方向单向向下。**组件之间不互相 import** —— 需要共享就提到 store 或 composable。

## 数据流

```
页面 onMounted / onPageShow
  → store 的动作（ensureWeatherAndFishing / fetchSpots / restore）
    → api 模块（fishingApi / fishingSpotApi / streamWeatherAnalysis）
      → client.request → uni.request
        → 后端 { message, data } 信封
```

`client.ts` 负责剥信封、合并 HTTP 错误与网络错误、挂 token。**调用点拿到的就是业务对象**，不用自己剥 `data`。

## 唯一出处

| 要改什么            | 去哪                                                                |
| ------------------- | ------------------------------------------------------------------- |
| 接口端点            | `src/api/fishing.ts`、`src/api/ai.ts`、`src/api/auth.ts`、`src/api/upload.ts` |
| 请求基址 / 环境变量 | `src/config/env.ts`                                                 |
| 类型                | `src/types/fishing.ts`、`src/types/auth.ts`                         |
| 文案                | `src/constants/`（about / spot-create / my-spots）                 |
| 色值 / 字阶         | `src/styles/tokens/`                                                |
| 图标                | `scripts/gen-icons.mjs`                                             |

## 端点清单

| 端点                      | 方法               | 用途                                                       |
| ------------------------- | ------------------ | ---------------------------------------------------------- |
| `v2/fishing/index`        | GET                | 钓鱼指数；`enriched=true` 时附带天气、预报、潮汐、生活指数 |
| `v2/fishing/feedback`     | POST               | 提交钓鱼反馈                                               |
| `v2/fishing/stats`        | GET                | 钓鱼记录统计                                               |
| `v3/weather/tide`         | GET                | 潮汐（按港口 + 日期）                                      |
| `v3/fish/spots`           | GET / POST         | 钓点列表 / 创建                                            |
| `v3/fish/spots/mine`      | GET                | 我提交的钓点（含待审核 / 已驳回）                          |
| `v3/fish/spots/:id`       | GET / PUT / DELETE | 钓点详情 / 更新 / 删除                                     |
| `v2/llm/weather-analysis` | POST（SSE）        | AI 钓鱼分析                                                |
| `v3/auth/wechat/login`    | POST               | 微信登录（服务端自动建号）                                 |
| `v3/refresh-token`        | POST               | 刷新 token                                                 |
| `v3/me`                   | GET                | 当前用户                                                   |
| `v3/logout`               | POST               | 退出登录                                                   |
| `v3/upload-pic`           | POST               | 头像上传                                                   |
| `v3/upload`               | POST               | 图片上传（multipart：`file` + `type`）                      |

**取天气只有一条路**：`v2/fishing/index` 的 enriched 响应。旧实现并发调 `weather/full` + `fishing/index`，会导致后端对同一 location 取数两次，已废弃。

## 坐标

- `[经度, 纬度]` —— 经度在前。写反了会定位到地球另一侧，但不报错
- 两位小数是**后端的缓存与降级粒度** —— 不要为了「更精确」改成 `toFixed(6)`，位数变了后端缓存全部 miss
- store 用 `locationKey()`（两位小数）比对，同一个坐标就是同一份数据。原地挪几十米不该发请求，换了城市才该重取

## 归一

上游（和风新一代接口）给的是「数值 + 嵌套对象」，组件和 AI 分析载荷要的是**扁平视图模型**。换算全在 `src/utils/weather-normalize.ts` 里做，**在 store 边界调一次**。

组件一行都不用改，后端 `app/schemas/aiagent.py` 认的字段形状也就没变。上游换接口格式时，只改这一个文件。

## 守卫

几个 in-flight 守卫，同一个道理 —— 同一份数据不该被两个调用方各拉一次：

| 守卫             | 位置                          | 挡的是什么                                                                     |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `locatePending`  | `stores/fishingMap`           | 并发定位。两次定位会弹两次权限窗，拿到两个略有差异的点，表现为「地点名闪一下」 |
| `inflightKey`    | `stores/fishingMap`           | 同一坐标并发取数。两个响应互相覆盖，地点名闪一下                               |
| `restorePending` | `stores/session`              | 并发恢复会话                                                                   |
| `inflight`       | `composables/useQweatherFont` | 并发加载字体                                                                   |

## 两个 store

**`fishingMap`** —— 用户坐标、天气、潮汐、钓鱼指数、钓点标记、当前选中的钓点、我提交的钓点。

`mySpots`（我提交的）和 `markers`（地图上的）是**两份不同的数据**，不能合成一份：公开列表只放已过审的，`mySpots` 含待审核和已驳回。合成一份的话，待审核那条会在地图上显示出来 —— 它还没过审。

`selectedMarker` 放在 store 而不是地图页的局部 state：选中动作发生在钓点页，消费方却是数据页的钓鱼反馈表单 —— 跨页只能靠 URL 传，而 URL 带 marker 还得额外处理刷新和失效，不如共享状态直接。

选中态与标记集合是分开的两份，不是合成一个：选中只改一个引用，不该顺带触发地图标记的全量 diff。

**`session`** —— 当前用户、恢复会话、登录、写昵称、传头像、退出。

token 的存取在 `api/client.ts`，401 的静默刷新在 `api/auth.ts`，store 只管状态。

Pinia 装在 `main.ts`，全应用一份，跨页共享没问题 —— 小程序各页面是独立的 Vue 实例，但都挂在同一个 app 上。

选 setup store 而不是 options store：两个 store 里都有天生属于闭包的东西（in-flight 守卫、坐标 watch）。setup store 里它们就是普通局部变量，作用域跟着 store 实例走，不用靠「模块级变量 + 只有一份的约定」来维持唯一性。

## AI 流式

```
FishingAnalysisSheet
  → useFishingAnalysis（状态机 + 120ms 节流）
    → api/ai.streamWeatherAnalysis
      → api/stream.streamSse（协议层）
        → utils/sse（分帧解码）
```

- 节流在 `useFishingAnalysis` 里，不在组件里 —— 「多久刷一次」是数据到达节奏的事，和显示无关
- `stream.ts` 只吐协议层数据（`{ event, data, id, retry }`），data 的具体结构由调用方解析，这一层不做业务假设
- reasoning 与 content 两个通道各自攒着，等同一个定时器一起刷出去
- **思考通道结束不代表正文结束** —— 那时候正文一个字都还没来，只有正文通道的 `is_end` 才算答完
- 主动 `abort()` 不算失败，状态是 `stopped` 而不是 `error`，也不谎称生成完毕
- 发起新的一轮会先掐掉上一轮 —— 连点两次不该有两条流同时写同一个缓冲区

## 组件边界

- 组件读 store，不互相 import
- 页面负责编排：取数、开关浮层、把状态翻译给组件、把结果讲给用户听
- 文案在 `constants`，组件和页面都只管排版
- 浮层统一用 `SnapSheet` 容器

## 已知缺口

这几条是后端契约的现状。接回对应功能时先验：

- **钓点的编辑与删除没有 UI** —— `fishingSpotApi.update` / `remove` 端点留着但没有调用方（钓点详情面板只留了「导航」）。端点留着是因为它们是后端契约的记录，接回来时照单验一遍就能用
- **新建的钓点不会立刻出现在地图上** —— 后端把普通用户的投稿置为 `pending`，公开列表写死只放 `approved`（`ListSpots` 里 `Status: model.FishingSpotStatusApproved`）。所以提交成功只进 `mySpots`，要看到它得去「我的钓点」页看审核状态。**别把成功提示写成「已添加」** —— 用户回头在地图上找不到，会以为丢了
- **改不了昵称** —— 服务端没有独立的改昵称接口。`saveNickname` 的做法是重新走一次微信登录带上昵称，服务端只在「这个账号昵称为空」时写入。已有昵称时 store 拦下，不让用户白等一次网络往返
- **`weather_indices` 曾恒为空** —— 那时后端没往外给，模型只能自己从温度气压反推，丢掉了「官方说今天适宜垂钓」这个最强的信号。现已接通

## 约定细节

- **经纬度之外，坐标序列化也是两位小数**：`toLocationParam()` 是唯一出处
- **潮汐按港口 + 日期取**，港口是国家海洋预报台的站点编号（`HARBOR_OPTIONS`）
- **钓鱼反馈关联钓点 id**：用户在钓点页选了哪个点，切到数据页提交反馈就记到那个点头上；没选过是 `'default'`（后端约定）
- **钓点的写操作走 `withSession`** —— `request` 只负责发请求，401 它直接抛，不会去刷 token。刷新那件事在 `api/client` 的 `withSession` 里。写入类端点全都要求登录，token 恰好是最容易过期的一枚，所以这几个都要包
- **用户不能给自己的钓点打分** —— 新建时 `rating` 发 0（后端语义是「还没有评分」）。让作者自评会污染公开列表的均值

## 媒体

服务端返回的媒体路径一律是**相对路径**（如 `gallery/42/xxx.jpg`），显示前过 `api/upload` 的 `mediaUrl()` 拼成能加载的地址。已经是 `http` 开头的原样返回 —— 迁移过来的老数据可能是完整 URL。

**存进数据的必须是相对路径**，不是上传响应里的 `url`：那个字段已经带了 `/v3/media/` 前缀，再过一次 `mediaUrl()` 会变成双前缀地址；而完整 URL 则把部署域名烤进了库里，换域名时所有已存的图片一起失效。

上传端点 `POST /v3/upload` 的 multipart 字段是 `file`（文件）+ `type`（用途）。`type` 只认 `blog` / `gallery` / 空串，其余一律 400。**钓点照片走 `gallery`** —— 它会校验 Content-Type 白名单，`generic` 只限大小不认类型。

⚠️ 小程序加载远程图片走 **downloadFile 合法域名**，跟 request / uploadFile 是三份独立的名单。微信公众平台的「服务器域名」里三份都得填。
