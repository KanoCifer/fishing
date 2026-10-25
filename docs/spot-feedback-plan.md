# 钓点纠错反馈 —— 实施规划

> 这份文档是**规划**，不是实现。代码还没动，实施时按这里的清单逐条落地。
> 关联：钓点域后端在 `../Server-Go`，管理员后台在 `../kanocifer-chat-frontend`。

## 实施进度

| 阶段                                                                    | 状态                                                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| ① Go：model + AutoMigrate + DTO + errs + 上传通道加 `feedback`          | ✅ 已完成（`../Server-Go`，四道关全绿）                                       |
| ② Go：repository + service + handler + 路由 + 单测                      | ✅ 已完成（`../Server-Go`，四道关全绿）                                       |
| ③ 小程序：api + types + constants + 上传类型 + 页面 + 组件 + 详情页入口 | ✅ 已完成（`fishing`，type-check / lint 退出码 0）                            |
| ④ 文档同步：`docs/architecture.md` 两处                                 | ✅ 已完成（端点表加三行 + 「已知缺口」写明「不公开」是刻意设计）              |
| ⑤ Web 后台：gateway + 视图（含配图展示）                                | ✅ 已完成（`../kanocifer-chat-frontend`，type-check / lint / test:unit 全绿） |

阶段 ① 的落地位置：

- `internal/model/fishing_spot_feedback.go` —— 主表 + 图片从表 + 类型/状态常量与校验
- `internal/db/db.go` —— AutoMigrate 列表加两张表
- `internal/dto/fish.go` —— 四个 DTO（请求 / 出参 / 管理员列表查询 / 处理请求）
- `internal/domain/fish/errs/errs.go` —— 错误码
- `internal/service/upload/image_service.go` —— `UploadFeedbackImage` + `OwnsFeedbackImage`（形状 / 归属 / 存在三道校验）
- `internal/handler/upload_handler.go` —— `type` 白名单加 `feedback` + 分发
- 单测：model（常量与 schema）、upload service（路径归属）、handler（分发与白名单）

阶段 ② 的落地位置：

- `internal/repository/postgres/fishing_spot_feedback.go` —— `Create`（主表与配图同事务）/
  `ListByAdmin`（状态、类型、关键词、分页）/ `GetByPublicID` / `UpdateStatus` / `HasOpenFeedback`
- `internal/service/fishing/feedback.go` —— `FeedbackService`：提交校验、查重、配图归属校验、
  管理员队列、状态流转
- `internal/service/fishing/feedback_convert.go` —— model → 出参
- `internal/handler/fish_feedback_handler.go` —— 三个端点 + 路由挂载
- `internal/app/appstate.go` —— 组合根接线（`fishFeedbackSvc`）
- `internal/router/router.go` —— 挂 `FishFeedbackHandler`
- `internal/router/router_test.go` —— 路由表指纹基线更新（118 条）
- 单测：repository / service / handler 三层

⚠️ 实现时相对本规划的三处调整：

1. **错误码从 7 个增加到 9 个** —— 补了 `ErrFeedbackNoteRequired`（判定不属实必须写理由）
   与 `ErrFeedbackStatusTransition`（状态流转不合法，与「状态值不认识」分开）。
2. **「位置不对」的新坐标改为可选** —— 原本要求成对必填。实际场景里
   「我也不知道具体在哪，但这地方明显不对」也是有效反馈，强制填坐标会把它挡在门外。
   现在的规则是：**只给一个要拒、给了越界要拒，两个都给或不都给都行**。
3. **提交成功的响应返回完整反馈对象**（而不是原计划里那个精简的确认体）——
   同一个 DTO 服务于提交与管理员队列，少一个结构体；返回的是提交者自己的数据，不外泄任何东西。

阶段 ③ 的落地位置（由子 Worker 实施，已复核）：

- `src/types/fishing.ts` —— `FishingSpotFeedbackType` / `Payload` / `Status` / `Reporter` / `FishingSpotFeedback`
- `src/api/fishing.ts` —— `fishingSpotFeedbackApi.submit`（**只有这一个方法**，没有 list/get）
- `src/api/upload.ts` —— `UploadType` 加 `'feedback'`
- `src/components/SpotImagePicker/SpotImagePicker.vue` —— 加 `type?: UploadType` prop 并透传
- `src/constants/spot-feedback.ts` —— 文案唯一出处（**不含任何状态词** —— 有了就说明有人给反馈加了不该有的可见性）
- `src/components/SpotFeedbackForm/SpotFeedbackForm.vue` —— 表单组件（类型、条件修正值、说明、配图）
- `src/pages/spot-feedback/index.vue` —— 独立分包页面
- `src/pages/spot-detail/index.vue` —— 正文末尾的「信息有误？提交反馈」入口
- `src/pages.json` —— 新增分包 `pages/spot-feedback`

阶段 ③ 的两处实施调整：

1. **收费方式的文案统一到钓点那一份** —— 原本在 `constants/spot-feedback.ts` 里另起了一张
   free/paid/unknown 对照表（措辞用「不清楚」）。那是同一组取值的第二张表：后端哪天加了第四个取值，
   只改一处就会出现「详情页能选、反馈页不能选」。现在改成从 `FISHING_SPOT_FEE_LABELS` 取文案，
   顺序写死 free / paid / unknown。
2. **400 的详细原因在 toast 里会被微信截断** —— 后端给的是
   `invalid_feedback_payload: 反馈说明需 5-500 字…`，前半截是给日志看的机器码，
   前端剥掉前缀只留人话那半截。剩下的仍然可能超出 toast 字数上限。

✅ 阶段 ③ 留的那个待人定的点已经定了：**详情页的「信息有误？」入口对属主本人也显示**。
属主同时会看到「编辑」和「提交反馈」两个入口 —— 纠错是读者操作没错，但属主同样可能是
发现信息被别人改错了的那个人；把入口藏起来只是让这条信息换条路走到管理员那里，
代价是多一层没人记得的流程。两行不在同一排（编辑居右、纠错居左），属主不会误读。

阶段 ⑤ 的落地位置（由子 Worker 实施，已复核）：

- `frontend/packages/types/src/fishing.ts` —— 反馈类型/状态/流转表 + label 表
  （流转表与后端 `feedbackStatusTransitions` 逐条对齐，终态返回空数组 → 终态条目不出处理按钮）
- `frontend/packages/api/src/gateways/fishingFeedback.ts` —— `fishingFeedbackGateway`
- `frontend/apps/vue-app/src/features/fishing/AdminSpotFeedbacksView.vue` —— 反馈队列视图
  （主从分栏；**修正值对比表**是核心 —— 「页面现状 vs 用户反馈」，
  页面现状要现取 `GET /v3/fish/spots/:id`，反馈 DTO 本身不带钓点当前值）
- `frontend/apps/vue-app/src/features/fishing/AdminFishingSpotsView.vue` —— 支持 `?spot=<id>` 预选，
  供「去钓点审核」跳转落到那一条（那条未必在当前页/当前筛选里）
- `frontend/apps/vue-app/src/router/index.ts` + `BasicNav.vue` —— 路由与导航入口
- 网关单测 4 个用例

阶段 ⑤ 的三点说明：

1. **采纳/已处理可以写可选备注** —— 后台的备注框三个动作共用：
   「不属实」必填（后端 `ErrFeedbackNoteRequired` 会拦），「已采纳 / 已处理」选填。
   选填且留空时沿用反馈上已有的那条 `review_note` ——
   后端是整列覆盖，发了空串会把管理员上次写的判断抹掉。
2. **队列默认筛「待处理」**，与钓点审核页默认筛「待审核」对齐。
3. **`lint:boundaries` 的 2 条报错是改动前就有的**（`features/noontool` 的两条，
   与本功能无关；改动前后违规清单逐字相同，已用 `git stash` 独立核实）。

### 全链路的验收状态

| 环节                                                 | 状态                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Go 四道关（build / test / gofmt / vet）              | ✅ 全绿                                                      |
| 真实 PostgreSQL 上的 AutoMigrate 与仓储往返          | ✅ 验过（schema、配图保序、过滤、查重、状态流转）            |
| 小程序 type-check / lint                             | ✅ 退出码 0                                                  |
| Web 后台 type-check / lint / test:unit（549 个用例） | ✅ 全绿                                                      |
| Web 后台 lint:boundaries                             | ⚠️ 2 条改动前就有的违规（`features/noontool`，与本功能无关） |
| 真机端到端（提交 → 后台处理）                        | ⬜ 未做 —— 需要真机与登录态，见 `/wechatide-skill`           |

### 真机端到端的验收清单（阶段 ⑥，待做）

1. 钓点详情页底部能看到「信息有误？提交反馈」。
2. 选「收费变更」，填金额与说明，提交成功 → toast「已提交，我们会核实」→ 回到详情页。
3. 带 3 张图提交：图传完后缩略图出现，提交成功；后台能看到这三张图，顺序与上传顺序一致。
4. 有图没传完时提交按钮禁用。
5. 详情页**看不到**任何反馈痕迹（不公开）。
6. 同一钓点再次提交 → 提示「你已提交过这条钓点的反馈」。
7. 管理员在后台看到这条反馈与配图，标记「已采纳」，状态落库（备注选填，写了就存、不写沿用旧的）。
8. 小程序端**没有**任何入口能看到反馈状态。

## 1. 目标与边界

**做什么**：用户在钓点详情页发现「这条钓点的信息不对」时，可以提交一条纠错反馈
（位置不对 / 已封闭 / 收费变更 / 信息有误 / 其他），附带文字说明、可选的结构化修正值，
以及最多 3 张现场照片。

**不做什么**（明确排除，避免实现期发散）：

- 反馈**不公开**。没有面向普通用户的读取端点，钓点详情页不展示反馈数与反馈内容。
- 没有「我的反馈」列表页，提交者**看不到自己反馈的状态**。
- 图片最多 3 张（压缩版）。不做视频、不做上传后的排序编辑。
- 管理员处理反馈**不自动改钓点**。反馈只是线索，改钓点仍在原有的后台编辑流程里做。
- 不改钓点的公开契约（`FishingSpotResponse` 一个字段都不动）。

## 2. 已对齐的决策

| 决策项       | 结论                                                                              | 理由                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 功能形态     | **纠错举报**（信息有误），不是点评墙、不是现场实况                                | 现有 `v2/fishing/feedback`（爆护/空军）是钓鱼体验校准，不带文字也不带图，跟「这条钓点写错了」是两件事                                               |
| 接口归属     | 新开 `v3/fish/spots/:id/feedback`，**不动** `v2/fishing/feedback`                 | 语义独立；旧端点在 Python 侧还接着模型校准，混在一起两边都难维护                                                                                    |
| 可见性       | 仅管理员可见；提交者无查询入口                                                    | 反馈未核实就公开会变成对钓点的舆论场；未核实的内容也不该影响钓点的公开数据                                                                          |
| 数据落地     | Go 后端 PostgreSQL，与 `fishing_spot` 同库                                        | 钓点域自闭环。反馈要挂钓点上，跨服务取数据等于复制一份快照                                                                                          |
| 管理员处理   | 只改反馈状态，钓点另外手动改                                                      | 「一键修正」要新写一套带校验的写路径 + 变更记录，收益不抵复杂度                                                                                     |
| 处理备注     | 「不属实」必填理由；「已采纳 / 已处理」选填                                       | 否定一条反馈而不说理由，提交者无从判断自己错在哪；肯定的那两个状态只是留痕，写不写都不影响结论                                                      |
| 入口对属主   | 属主本人也看得到纠错入口                                                          | 属主同样可能是发现信息被改错了的那个人；藏起来只是让这条信息换条路走到管理员那里                                                                    |
| 反馈载荷     | 类型 + 文字说明 + 可选结构化修正值（新收费 / 新坐标 / 新名称）+ 可选图片（≤3 张） | 纯文字要管理员自己猜；结构化值让「收费改了」这类反馈能直接落到字段上；现场照片是纠错最硬的证据                                                      |
| 反馈图片存哪 | 独立目录 `feedback/{userID}/`，走**公开静态**媒体地址（uuid 文件名不可枚举）      | `/v3/media` 是整目录零鉴权静态挂载；后台 `<img>` 带不了 Authorization 头，要真正私密得先引入签名 URL 机制（本仓库没有）。目录隔离是为将来收紧留口子 |

## 3. 全景

```
小程序 钓点详情页 ──「信息有误？」──▶ pages/spot-feedback（独立分包）
                                          │
                                          ├─ uni.chooseLocation（选新位置，复用现成模式）
                                          ├─ uni.chooseMedia → POST /v3/upload（type=feedback）
                                          │     └─ 返回相对路径 feedback/{userID}/{uuid}.jpg
                                          ▼
                              POST /v3/fish/spots/:id/feedback   （需登录）
                                          │   payload 带 images: ["feedback/12/a.jpg", ...]
                                          ▼
                    Go: fishing.FishFeedbackHandler → fishing.FeedbackService
                                          ▼
                    PG: fishing_spot_feedback（新增表）
                        fishing_spot_feedback_image（新增从表，保序）
                                          ▲
                                          │  GET /v3/fish/feedback/admin
                                          │  PUT /v3/fish/feedback/:id/status
                    Web 后台 AdminFishingSpotsView（管理员看队列与处理，缩略图用 mediaUrl）
```

**先传图、后提交** —— 与新建钓点页同一套顺序：图片传完拿到服务端相对路径，
连同反馈表单一起提交。表单在有图没传完时不允许提交（`uploading` 状态）。

反馈**没有任何公开读路径**。写完即静默 —— 用户提交完只看到一句「已提交，我们会核实」。

## 4. 后端（`../Server-Go`）

### 4.1 数据模型

新文件 `internal/model/fishing_spot_feedback.go` —— 主表 `fishing_spot_feedback`
与图片从表 `fishing_spot_feedback_image` 放在一起，与 `fishing_spot.go` 的做法一致。

```go
// 反馈类型 —— 与前端 @/constants/spot-feedback 的类型表同集合。
const (
    FishingSpotFeedbackTypeLocationWrong = "location_wrong" // 位置不对
    FishingSpotFeedbackTypeClosed       = "closed"          // 已封闭 / 已禁钓
    FishingSpotFeedbackTypeFeeWrong     = "fee_wrong"        // 收费变更
    FishingSpotFeedbackTypeInfoStale    = "info_stale"       // 信息过期 / 描述有误
    FishingSpotFeedbackTypeOther        = "other"            // 其他
)

// 反馈处理状态。
const (
    FishingSpotFeedbackStatusPending   = "pending"   // 待处理（初始）
    FishingSpotFeedbackStatusAccepted  = "accepted"  // 已采纳：反馈属实，钓点待改
    FishingSpotFeedbackStatusResolved  = "resolved"  // 已处理：钓点已改
    FishingSpotFeedbackStatusDismissed = "dismissed" // 不属实
)

type FishingSpotFeedback struct {
    ID uint `gorm:"primaryKey;autoIncrement"`

    // PublicID 对外唯一标识 —— 沿用钓点的做法（UUID，不外泄自增 ID）。
    PublicID string `gorm:"size:40;uniqueIndex;not null"`

    // 指向钓点。SpotPublicID 是对外 ID，SpotID 是内部自增 ID。
    // 不建外键：钓点被物理删除时不牵连反馈 —— 反馈是历史记录，不是钓点的附属行。
    SpotPublicID string  `gorm:"size:40;index;not null"`
    SpotID       *uint   `gorm:"index"`
    SpotName     string  `gorm:"size:100"` // 冗余快照：钓点改名或被删后，管理员还看得到反馈指向哪个点

    // 提交人。ID 指向 user.id，昵称与头像是写入时的快照。
    ReporterID     uint   `gorm:"index;not null"`
    ReporterName   string `gorm:"size:50"`
    ReporterAvatar string `gorm:"size:500"`

    Type        string `gorm:"size:30;not null;index"`
    Description string `gorm:"type:text"`

    // 结构化修正值。按 Type 至多一个字段有值，其余留空。
    CorrectedFeeType     string   `gorm:"size:20"`              // free / paid / unknown
    CorrectedFeeAmount   *float64 `gorm:"type:double precision"` // CorrectedFeeType=paid 时有值
    CorrectedName        string   `gorm:"size:100"`             // 建议的新名称
    CorrectedLongitude   *float64 `gorm:"type:double precision"` // 新位置（经度在前）
    CorrectedLatitude    *float64 `gorm:"type:double precision"`

    // 处理状态。
    Status     string     `gorm:"size:20;not null;default:pending;index"`
    ReviewerID *uint      `gorm:"index"`
    ReviewedAt *time.Time
    ReviewNote string     `gorm:"size:500"`

    CreatedAt time.Time `gorm:"index"`
    UpdatedAt time.Time
}

// FishingSpotFeedbackImage 反馈图片从表。
//
// 图片要保序 —— 用户上传的顺序就是管理员看的顺序，所以用从表而不是 JSONB，
// 与钓点的 fishing_spot_image 同一套做法。
type FishingSpotFeedbackImage struct {
    ID        uint   `gorm:"primaryKey;autoIncrement"`
    FeedbackID uint  `gorm:"not null;index:idx_fishing_spot_feedback_image_fb_id,priority:1"`
    URL       string `gorm:"size:500;not null"`
    SortOrder int    `gorm:"default:0"`
}

func (FishingSpotFeedbackImage) TableName() string { return "fishing_spot_feedback_image" }
```

要点：

- **修正值是「建议」不是「补丁」**。后端只校验取值合法并原样存下，改不改由管理员决定。
- **`SpotName` 是快照**。反馈挂了三个月之后钓点可能改名，管理员看到的应该是提交当时的指向。
- **图片存服务端相对路径**（如 `feedback/12/a1b2.jpg`），不存带 `/v3/media/` 前缀的 url，
  更不存完整域名 —— 理由见 `docs/architecture.md` 的「媒体」一节。

### 4.2 状态机

```
        提交
         ↓
    ┌─────────┐  采纳（属实，待改）  ┌──────────┐
    │ pending │ ──────────────────▶ │ accepted │ ─┐
    └─────────┘                     └──────────┘  │ 改完钓点
         │                                │         ▼
         │ 不属实                          └─────▶ ┌──────────┐
         ▼                                          │ resolved │
    ┌───────────┐                                   └──────────┘
    │ dismissed │
    └───────────┘
```

- `accepted → resolved` 是管理员手工推进的 —— 后端不监听钓点变更去自动改状态，那会让「反馈状态」和「钓点现状」耦在一起。
- `resolved` 与 `dismissed` 都是**终态**，不可再改。一条反馈要么被处理掉了，要么被否掉了 —— 再改回去会让「这条到底算不算已处理」没有答案。
- 允许的流转只有：`pending → accepted / resolved / dismissed`、`accepted → resolved / dismissed`。
  其余（含退回 `pending`）一律 `ErrFeedbackStatusTransition`。
- 状态名沿用钓点审核那套 `pending / approved / rejected` 的直白风格，不搞 `CLOSED` 这类企业词。

### 4.3 端点契约

全部挂在 `internal/router/router.go` 的 `/v3` 组下。

#### ① 提交反馈 `POST /v3/fish/spots/:id/feedback`

需登录。路径参数 `:id` 是钓点的 public id。

请求体：

```json
{
  "type": "fee_wrong",
  "description": "上周去已经改成收费 30 元/天，页面上还写着免费。",
  "images": ["feedback/12/9f8e7d6c.jpg"],
  "corrected_fee_type": "paid",
  "corrected_fee_amount": 30,
  "corrected_name": "",
  "corrected_longitude": null,
  "corrected_latitude": null
}
```

- `type` 必填，`oneof=location_wrong closed fee_wrong info_stale other`。
- `description` 必填，5–500 字（service 层再校一次，binding 层的 `max` 对中文按字符数算够用）。
- 修正值按 `type` 校验：`fee_wrong` 时 `corrected_fee_type` 必填、`corrected_fee_amount` 在 `corrected_fee_type=paid` 时必填且 ≥ 0；`location_wrong` 时经纬度**成对**出现且都非 nil，落在合法区间内。
- 坐标是 **GCJ-02、经度在前**，与 `fishing_spot.location` 同一套，不做换算。
- `images` 可选，最多 3 条。每条必须是**服务端相对路径且形如
  `feedback/{提交人自己的 userID}/{uuid}.{ext}`**：
  - 前缀必须是 `feedback/` —— 没有这条校验，用户就能把 `gallery/…` 之类别的目录塞进来，
    反馈记录就成了往任意媒体路径写引用的口子。
  - 第二段必须是**提交人自己的 userID** —— 否则等于可以引用别人传过的图。
  - 文件名只允许 uuid 与白名单扩展名（jpg / jpeg / png / gif / webp），不含 `..` 与分隔符。
  - 后端还要确认文件**确实存在** —— 否则用户能引用一个从没上传过的路径，
    管理员点开就是 404。存在性检查由上传服务提供（它才有 `UploadDir`），
    以最小接口注入 FeedbackService，别让 service 去读全局 `config.Cfg`。

  存进从表时按数组顺序写 `sort_order`。

响应体（**200** —— 全仓的 `response.Success` 都发 200，钓点创建也是 200，
本仓没有 201 的先例，小程序端也别按 201 写判断）：

```json
{
  "id": "f3a…",
  "spot_id": "b7e…",
  "spot_name": "雁田水库",
  "type": "fee_wrong",
  "description": "上周去已经改成收费 30 元/天，页面上还写着免费。",
  "images": ["feedback/12/9f8e7d6c.jpg"],
  "corrected_fee_type": "paid",
  "corrected_fee_amount": 30,
  "status": "pending",
  "review_note": "",
  "reporter": { "user_id": 12, "name": "钓鱼佬" },
  "created_at": "2026-10-25T09:12:33Z",
  "updated_at": "2026-10-25T09:12:33Z"
}
```

回给提交方的都是他自己提交的东西，不外泄任何信息。

#### ② 管理员队列 `GET /v3/fish/feedback/admin`

需登录 + admin。查询参数：`status`（空=全部）、`type`、`keyword`（钓点名或反馈正文模糊搜）、
`page`（从 1 起）、`page_size`（默认 50，上限 200）。

响应体：分页列表，元素含反馈全量字段 + 钓点名 + 提交人快照 + 图片相对路径数组
（管理员端拼 `mediaUrl` 展示缩略图，顺序即上传顺序）。

**缓存头 `no-store`** —— 队列是活的，缓存一次等于给管理员看一份过期快照
（与 `GET /v3/fish/spots/admin` 同一个理由，见 `fish_handler.go` 的注释）。

#### ③ 处理反馈 `PUT /v3/fish/feedback/:id/status`

需登录 + admin。请求体：

```json
{ "status": "accepted", "note": "属实，已安排改收费" }
```

- `status` 只能是 `accepted / resolved / dismissed`，不能是 `pending`（不能把已处理的退回待处理）。
- `note` 可选，但 `dismissed` 时必填 —— 与钓点驳回必须写理由是同一条规矩：
  没有理由的不采纳等于让提交者猜自己错在哪。

响应：`{ "message": "ok", "data": null }`。

> **为什么用 PUT 而不是 PATCH**：微信小程序的 `wx.request` 合法方法里没有 PATCH。
> 这个端点只给 Web 后台用，但沿用 PUT 能让两端行为一致，也避免以后小程序端要读状态时踩坑。

#### 刻意不提供的端点

- ❌ `GET /v3/fish/spots/:id/feedback` —— 反馈不公开。任何按钓点查反馈的端点都是泄露面。
- ❌ `GET /v3/fish/feedback/mine` —— 提交者不需要看状态，管理端之外没有第二个读者。

这两个「没有」要在 handler 的注释里写清楚原因，否则后人「顺手补一个」的概率很高。

### 4.4 错误码

加进 `internal/domain/fish/errs/errs.go`（沿用 `apierr.New(status, msg)`）：

| 变量                          | 状态码 | 场景                                                                         |
| ----------------------------- | ------ | ---------------------------------------------------------------------------- |
| `ErrInvalidFeedbackType`      | 400    | 类型不在枚举内                                                               |
| `ErrInvalidFeedbackStatus`    | 400    | 处理状态不在枚举内                                                           |
| `ErrInvalidFeedbackPayload`   | 400    | 说明字数越界，或修正值与类型对不上（如 `fee_wrong` 缺金额）                  |
| `ErrInvalidFeedbackImage`     | 400    | 图片路径不合法（缺 `feedback/` 前缀、不是自己的文件、超出 3 张、文件不存在） |
| `ErrFeedbackNoteRequired`     | 400    | 判定不属实（dismissed）却没写理由                                            |
| `ErrFeedbackStatusTransition` | 400    | 状态流转不合法（退回待处理、改终态）                                         |
| `ErrFeedbackNotFound`         | 404    | 反馈不存在                                                                   |
| `ErrFeedbackForbidden`        | 403    | 非管理员碰管理端点                                                           |
| `ErrDuplicateFeedback`        | 409    | 同一用户对同一钓点已有未处理反馈                                             |

`ErrDuplicateFeedback` 是**防刷的主闸**：同一用户对同一钓点存在 `pending` 或 `accepted` 的反馈时，
再提交直接拒。错误文案要讲人话：「你已提交过这条钓点的反馈，管理员处理中」。

### 4.5 改动清单（Go）

| 文件                                                    | 动作 | 要点                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/model/fishing_spot_feedback.go`               | 新增 | 主表 + 图片从表（`FishingSpotFeedback` / `FishingSpotFeedbackImage`）+ 类型/状态常量 + `IsValidFishingSpotFeedbackType` / `IsValidFishingSpotFeedbackStatus`（照 `IsValidFishingSpotKind` 的写法）。**主表与从表放同一文件** —— 与 `fishing_spot.go` 把主表和 Tag/Image 从表放一起是同一套做法 |
| `internal/db/db.go`                                     | 改   | `AutoMigrate` 列表加 `&model.FishingSpotFeedback{}` 与 `&model.FishingSpotFeedbackImage{}`                                                                                                                                                                                                     |
| `internal/handler/upload_handler.go`                    | 改   | **上传类型白名单加 `feedback`** —— 现在只认 `blog` / `gallery` / 空串，发 `feedback` 会 400                                                                                                                                                                                                    |
| `internal/service/upload/image_service.go`              | 改   | 加 `UploadFeedbackImage`，落 `{UploadDir}/feedback/{userID}/{uuid}.{ext}`；另加一个「文件是否存在」的最小查询方法给反馈服务用                                                                                                                                                                  |
| `internal/dto/fish.go`                                  | 改   | 加 `FishingSpotFeedbackRequest`（含 `images []string`）/ `FishingSpotFeedbackResponse` / `FishingSpotFeedbackAdminListQuery` / `FishingSpotFeedbackReviewRequest`                                                                                                                              |
| `internal/repository/postgres/fishing_spot_feedback.go` | 新增 | `Create`（含图片同事务写从表）/ `ListByAdmin`（分页 + 状态/类型过滤）/ `GetByPublicID` / `UpdateStatus` / `HasOpenFeedback(userID, spotPublicID)` / `CountByStatus`                                                                                                                            |
| `internal/service/fishing/feedback.go`                  | 新增 | `FeedbackService`：提交（校验 + 查重 + 图片校验 + 落库）、管理员列表、处理状态流转                                                                                                                                                                                                             |
| `internal/handler/fish_feedback_handler.go`             | 新增 | 薄 handler：绑定参数、取操作者身份、转发 service、`respondErr` 出口                                                                                                                                                                                                                            |
| `internal/domain/fish/errs/errs.go`                     | 改   | 上表 7 个错误                                                                                                                                                                                                                                                                                  |
| `internal/app/appstate.go`                              | 改   | 构造 `FeedbackService`（组合根只在这里建 service）                                                                                                                                                                                                                                             |
| `internal/router/router.go`                             | 改   | 挂 `FishFeedbackHandler` 路由                                                                                                                                                                                                                                                                  |

**沿用的既有规矩**（`../Server-Go/AGENTS.md` 的红线）：

- handler → service → repository 三层，handler 不 import `internal/repository/*`。
- repo / service 方法第一个参数是 `ctx context.Context`。
- 响应走 `internal/response` 的 `{data, message}` 信封。
- 组合根在 `internal/app/appstate.go` 的 `NewAppState`。

### 4.6 后端单测清单

照 `internal/service/fishing/spot_write_test.go` 的写法（SQLite + AutoMigrate）：

- 类型枚举外的 `type` 被拒（400）。
- `description` 长度越界被拒（低于下限 / 高于上限）。
- `fee_wrong` 缺 `corrected_fee_amount` 被拒；`corrected_fee_type=paid` 金额为负被拒。
- `location_wrong` 只给经度不给纬度被拒；经纬度越界被拒。
- 对不存在的钓点提交反馈 → 404。
- 重复提交（已有 pending）→ 409。
- 管理员列表按 `status` / `type` 过滤正确，分页 `page_size` 上限生效。
- 非管理员调用管理端点 → 403。
- `PUT .../status` 置 `dismissed` 不带 `note` → 400。
- `PUT .../status` 传 `pending` → 400（不能退回待处理）。
- 图片：前缀不是 `feedback/` → 400；前缀对但 userID 不是提交人自己的 → 400；
  超过 3 张 → 400；路径指向不存在的文件 → 400。
- 上传通道：`type=feedback` 能传成并落在 `feedback/{userID}/`；
  `type` 为其它未知值仍然 400（白名单没被顺手放开）。

> 图片的「文件存在」检查走注入的最小接口，测试里用假实现即可 ——
> 不要为了它去写真实文件，service 单测不该碰磁盘。

验证命令（后端 AGENTS.md 的四道关）：

```bash
go build ./... && go test ./... && gofmt -l . && go vet ./...
```

## 5. 小程序（`fishing`）

### 5.1 入口

**位置**：钓点详情页正文末尾，「信息有误？提交反馈」一行，灰色小字，左对齐。

- 不放底部 Dock —— 那里是「导航」，是用户去那儿的唯一按钮，混进第二个动作会让主路径变钝。
- 不跟属主的「编辑」行放一起 —— 那是作者操作，纠错是读者操作，读者不该在同一排看到「编辑」这种与自己无关的动词。
  两行分列：编辑居右、纠错居左，各占一行。
- 整行可点，不做成小图标 —— 误触成本高（提交后没有撤销入口），所以做成明显的一行文字。
- **属主本人也看得到这一行** —— 属主同样可能是发现信息被改错了的那个人。

**不显示反馈状态**，提交完只有一句 toast（见 5.3）。

### 5.2 页面与分包

新增**独立分包** `pages/spot-feedback`：

- `pages.json` 加：

```json
{ "root": "pages/spot-feedback", "pages": [{ "path": "index", "style": { "navigationStyle": "custom" } }] }
```

- URL：`/pages/spot-feedback/index?id=<spotPublicId>`

**为什么不放进 `spot-detail` 分包**：分包之间不能互相引用资源（见 `docs/mp-weixin-package.md`）。
`pages/spot-detail/store.ts` 里的 `useSpotDetailStore` 属于那个分包，放新分包里引用不了。
新页面自己取数（一次 `fishingSpotApi.getByIdWithSession`），反而更符合
「页面负责编排取数、组件只管渲染」的分层（`docs/architecture.md`）。

- 新页面引用的组件（`SnapSheet` / `FormRow` / `Chip` 等）都在主包，分包能引用主包的一切，OK。

### 5.3 表单规则

页面 `pages/spot-feedback/index.vue`，表单部分抽成组件
`src/components/SpotFeedbackForm/SpotFeedbackForm.vue`（主包）—— 组件只管渲染与交互，
取数与提交由页面编排。

字段与规则：

| 字段   | 必填   | 说明                                                                     |
| ------ | ------ | ------------------------------------------------------------------------ |
| 类型   | 是     | 单选：`location_wrong` / `closed` / `fee_wrong` / `info_stale` / `other` |
| 说明   | 是     | 5–500 字，带字数计数                                                     |
| 图片   | 否     | 最多 3 张，压缩版                                                        |
| 修正值 | 按类型 | 见下                                                                     |

按类型的条件字段：

- `fee_wrong` → 收费方式（免费 / 收费 / 不清楚）+ 金额（仅「收费」时必填）
- `location_wrong` → 「地图选点」按钮 → `uni.chooseLocation`，回填地址与坐标
- `info_stale` → 建议的新名称（选填）
- `closed` / `other` → 无条件字段

**选点复用现成模式**：`uni.chooseLocation` 的用法、GCJ-02、经度在前、取消不报错、
`manifest.json` 已声明 `requiredPrivateInfos` —— 照 `src/pages/spot-create/index.vue`
里 `chooseLocation` 那段（连同它的注释）写，不要另发明一套。

**交互边界**：

- 进入页面先 `session.restore()`；未登录时显示引导登录的空态（照 `my-spots` 页那套），
  不把用户丢回上一页。
- 提交中禁用按钮，防连点。
- **有图还没传完时也不能提交** —— 提交出去的是相对路径，图没传完就拿不到路径。
  `SpotImagePicker` 的 `uploading` 事件就是干这个的（新建钓点页同款）。
- 提交成功 → toast「已提交，我们会核实」→ `navigateBack` 回详情页。
- 提交失败 → toast 讲清原因（用 `utils/error` 的 `toErrorMessage`）。
- **提交后不给「查看我的反馈」入口** —— 这是本次明确排除的功能。

### 5.4 前端改动清单

| 文件                                                   | 动作 | 要点                                                                                                  |
| ------------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------- |
| `src/pages/spot-feedback/index.vue`                    | 新增 | 页面：取钓点信息（对照当前收费/名称）、编排提交、toast 与返回                                         |
| `src/components/SpotFeedbackForm/SpotFeedbackForm.vue` | 新增 | 表单组件：类型单选、条件字段、说明输入、图片选择、校验与提交事件                                      |
| `src/constants/spot-feedback.ts`                       | 新增 | 文案唯一出处：类型 label、说明占位、按钮文案、错误文案、图片上限（3 张）                              |
| `src/types/fishing.ts`                                 | 改   | 加 `FishingSpotFeedbackType` / `FishingSpotFeedbackPayload`（含 `images`）/ `FishingSpotFeedback`     |
| `src/api/fishing.ts`                                   | 改   | 加 `fishingSpotFeedbackApi.submit(spotId, payload)`，走 `withSession`                                 |
| `src/api/upload.ts`                                    | 改   | `UploadType` 联合加 `'feedback'`                                                                      |
| `src/components/SpotImagePicker/SpotImagePicker.vue`   | 改   | 加 `type?: UploadType` prop（默认 `gallery`）并透传给 `uploadImage` —— **复用它，不要另抄一份选择器** |
| `src/pages/spot-detail/index.vue`                      | 改   | 正文末尾加「信息有误？」入口                                                                          |
| `src/pages.json`                                       | 改   | 新增分包                                                                                              |
| `docs/architecture.md`                                 | 改   | 端点清单补两行（实施时同步，见下）                                                                    |

约定提醒：

- **端点清单的唯一出处是 `src/api/fishing.ts`** —— 新端点加在那里，不要在页面里直接 `request`。
- **文案在 `src/constants/`**，不要把「位置不对」这种字面量写在组件里。
- 写操作走 `withSession`（`api/client.ts` 的 401 静默刷新），跟 `fishingSpotApi.create` 同款。
- **payload 里存的是服务端相对路径**（上传响应的 `filename`），不是 `url` ——
  `url` 已经带了 `/v3/media/` 前缀，再过一次 `mediaUrl()` 会变成双前缀地址（`api/upload.ts` 里有这个坑的注释）。
- **上传走 `uni.uploadFile`，不是 `uni.request`**（multipart 要用前者）。`uploadFile` 合法域名
  与 request / downloadFile 是三份独立名单 —— 钓点照片已经在用这条通道，域名配好了，不用新增。
- 选压缩版（`sizeType: compressed`）：现场照片是给人看证据的，不是当素材用的；
  原图动辄几 MB，弱网下传得等到用户放弃。`SpotImagePicker` 已经这么做了。
- 改完跑 `npx oxfmt <改动文件>`，再 `pnpm type-check` 与 `pnpm lint` —— 两道关是本仓库仅有的把关。

### 5.5 前端文档同步

实施时同步更新（**别留下旧契约**）：

- `docs/architecture.md` 的端点表加三行：
  - `v3/fish/spots/:id/feedback` · POST · 提交钓点纠错反馈（不公开）
  - `v3/fish/feedback/admin` · GET · 管理员看反馈队列（小程序不调）
  - `v3/fish/feedback/:id/status` · PUT · 管理员处理反馈（小程序不调）
- `docs/architecture.md` 的「已知缺口」一节：删掉不再成立的部分，
  补一句「钓点纠错反馈**不公开**，提交者看不到状态」——
  这是刻意设计，不是缺口，但要让后来人知道，免得「顺手补一个查询端点」。

## 6. 管理员侧（`../kanocifer-chat-frontend`，第三个仓库）

反馈要有人处理，后台没有视图的话这条链路是断的。

| 文件                                                                   | 动作                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `frontend/packages/types/src/fishing.ts`                               | 加反馈相关类型（与 Go DTO 对齐）                                                    |
| `frontend/packages/api/src/gateways/fishingSpot.ts`                    | 加 `fishingFeedbackGateway`（列表 / 处理）                                          |
| `frontend/apps/vue-app/src/features/fishing/AdminFishingSpotsView.vue` | 加「纠错反馈」分区：队列 + 状态筛选 + 处理（标记状态 + 备注）+ 跳到该钓点的编辑表单 |

反馈图在后台用缩略图展示（`mediaUrl` 拼地址，与钓点照片同一套）。

⚠️ 后台的 `<img>` 标签**带不了 Authorization 头** —— 这正是反馈图走公开静态地址的原因：
真要让图片只有管理员能看，得先把签名 URL 这套机制建起来（见 §9）。

后台这一摊**可以独立于小程序与 Go 后端排期**。先落 Go 后端（小程序能提交、管理员能拿到数据），
后台视图后接 —— 但别忘了，它不做这条链路就只剩一半。

## 7. 实施顺序

| 阶段 | 内容                                                                                 | 产出                                                   |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| ①    | Go：model（反馈表 + 图片从表）+ AutoMigrate + DTO + errs + **上传通道加 `feedback`** | 表建起来，类型常量与错误码就位，`type=feedback` 能传图 |
| ②    | Go：repository + service + handler + 路由 + 单测                                     | 三个端点可 curl 打通                                   |
| ③    | 小程序：api + types + constants + 上传类型 + 页面 + 组件 + 详情页入口                | 用户能提交（文字 + 修正值 + 图片）                     |
| ④    | 文档同步：`docs/architecture.md` 两处                                                | 契约与实现一致                                         |
| ⑤    | Web 后台：gateway + 视图（含配图展示）                                               | 管理员能看能处理                                       |

③ 与 ② 之间有契约依赖（③ 按 ② 的 DTO 写），别并行。③ 还依赖 ① 的上传通道 ——
`type=feedback` 没放开之前，前端传图会 400。

## 8. 验收标准

**Go 后端**：

```bash
cd ../Server-Go && go build ./... && go test ./... && gofmt -l . && go vet ./...
```

全绿，且 `gofmt -l .` 无输出。

**小程序**：

```bash
cd . && npx oxfmt <改动的文件> && pnpm type-check && pnpm lint
```

退出码 0，无新错误。

**端到端**（真机，见 `/wechatide-skill`）：

1. 钓点详情页底部能看到「信息有误？提交反馈」。
2. 选「收费变更」，填金额与说明，提交成功 → toast「已提交，我们会核实」→ 回到详情页。
3. **带 3 张图提交**：图传完后缩略图出现，提交成功；后台能看到这三张图，顺序与上传顺序一致。
4. **有图没传完时提交按钮禁用** —— 点不动。
5. 详情页**看不到**任何反馈痕迹（不公开）。
6. 同一钓点再次提交 → 提示「你已提交过这条钓点的反馈」。
7. `GET /v3/fish/spots/:id/feedback` 返回 404/405 —— **这个端点不存在**。
8. 管理员在后台看到这条反馈与配图，标记「已采纳」，状态落库。
9. 小程序端**没有**任何入口能看到反馈状态。
10. 拿一个**别人的** `feedback/{别的userID}/x.jpg` 路径提交 → 400。

## 9. 风险与坑位

| 坑                                   | 说明                                                                                   | 对策                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 分包间不能互相引用                   | 新页面若放在 `spot-detail` 分包外的目录，不能用它的 store                              | 独立分包，自己取数                                                                                                                |
| **上传类型白名单没放开**             | `POST /v3/upload` 的 `type` 现在只认 `blog` / `gallery` / 空串，发 `feedback` 直接 400 | 后端阶段 ① 就把 `feedback` 加进白名单，并写一条单测钉住「其它未知类型仍 400」                                                     |
| **反馈图可以引用别人的文件**         | 只校验「文件存在」不够 —— 用户能把 `feedback/{别人的userID}/x.jpg` 塞进 payload        | 三重校验：前缀必须是 `feedback/`、第二段必须是自己的 userID、文件确实存在                                                         |
| **临时路径会过期**                   | 选图给的临时地址只有 1–5 分钟有效                                                      | 当场传完，不攒着；`resolveUploadPath` 会把无扩展名的临时文件复制成 `.jpg` 再传                                                    |
| **孤儿文件**                         | 用户传了图却没提交反馈，文件留在磁盘上没人管                                           | 本期不做清理任务（现有 gallery 也一样）。要么记进「已知缺口」，要么加个按天清理的定时任务                                         |
| **图片 URL 一旦泄露即可访问**        | `/v3/media` 是零鉴权静态目录，`feedback/` 下的文件谁拿到地址谁能看                     | 目录隔离 + uuid 命名（不可枚举）+ 没有任何公开列表指向它。这是「不公开」承诺在图片上的**已知打折**，要真正私密得先建签名 URL 机制 |
| 后台 `<img>` 带不了 Authorization 头 | 想让反馈图只有管理员能看，不能靠登录态兜底                                             | 上一条的直接原因。要收紧就得先做签名 URL（query 串带签名与有效期），不是改个中间件就完事                                          |
| 「顺手补一个查询端点」               | 反馈不公开是刻意决定，不是遗漏                                                         | handler 注释写明理由；验收里显式查这个端点不存在                                                                                  |
| 坐标写反                             | 经度在前，反了不报错，只是定位到地球另一侧                                             | 沿用 `toLocationParam` / `chooseLocation` 的既有约定，修正值在 service 层再校一次区间                                             |
| 选点取消被当成失败                   | `chooseLocation` 的 `fail` 回调带 `cancel`                                             | 照 `spot-create` 的处理，取消静默返回                                                                                             |
| 同一个反馈重复提交                   | 用户连点或网络重试                                                                     | service 层查重 + 前端提交中禁用按钮，双保险                                                                                       |
| GORM 迁移                            | `AutoMigrate` 只加不改；新表是新增，无兼容问题                                         | `internal/db/db.go` 加两行即可                                                                                                    |
| 包体                                 | 新增一个分包不进主包 2MB                                                               | 独立分包，主包只多几 KB 的文案与常量                                                                                              |
