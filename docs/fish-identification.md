# 鱼种识别 —— 方案 A：视觉大模型 + 白名单约束

> 这份文档解决一个具体问题：**用户拍一张鱼的照片，怎么在这 22 个鱼种里认出是哪种**。
>
> 方案选择与横向对比见对话记录；这里只写选定方案的落地细节。
> 已确定的边界：**只认清单内的鱼，认不出就说认不出**，不猜、不扩编、不编特征。

---

## 0. 命名：一个必须先说清的坑

两个仓库里 `fish` 指的不是一回事：

| 仓库                      | `fish` 指的是                                            | 鱼种应该叫              |
| ------------------------- | -------------------------------------------------------- | ----------------------- |
| `fishing`（本仓库，前端） | **鱼种**（`src/types/fish.ts`）                          | `fish` / `species` 都行 |
| `Server-Go`（后端）       | **钓点**（`internal/service/fishing/`、`v3/fish/spots`） | **必须叫 `species`**    |

后端已有的 `internal/domain/fish/` 是**钓点**的错误码包，`v3/fish/*` 是钓点路由。
鱼种识别的新代码一律用 `species` 命名，否则半年后没人分得清 `fishH` 和 `speciesH`。

前端侧 `FishSpeciesId` 类型可以继续用（前端没有这个歧义）。

---

## 1. 整体链路

```
小程序选图/拍照
  └─ wx.compressImage（端侧压缩，长边 ≤1280）
      └─ uni.uploadFile → POST /v3/species/identify（multipart）
          └─ 后端：读入内存 → 压缩 → base64 data URL
              └─ 组装 prompt（白名单内联）→ 调视觉模型
                  └─ 解析 JSON → 三道闸校验 → 回填真值字段
                      └─ 计费结算 → 返回候选鱼种
```

**关键约束：识别用的图片全程不落盘。** 它是一次性输入，不是素材。
进了 `gallery/` 就是污染用户的图片墙，进了 CDN 就是把用户的钓获照公开可访问。

---

## 2. 后端实现

### 2.1 目录与命名

```
Server-Go/
├── internal/domain/species/
│   ├── catalog.go          # 鱼种清单（白名单真值）
│   └── catalog.json        # 由前端脚本产出，见 §2.2
├── internal/service/species/
│   ├── vision_provider.go  # 上游服务商参数（照 nomu/design_provider.go 的形状）
│   ├── vision_client.go    # 组包发送（chat/completions）
│   ├── prompt.go           # prompt 组装（含白名单内联）
│   ├── parse.go            # 响应解析 + 三道闸校验
│   └── species_service.go  # 编排：压缩 → 计费 → 调上游 → 解析 → 结算
└── internal/handler/species_handler.go
```

### 2.2 白名单：单一出处与防漂移

**鱼种清单现在的唯一出处是 `scripts/gen-fish-images.py` 的 `SPECIES` 列表**（本仓库）。
后端要拼 prompt，也需要这份清单 —— 于是出现"两份清单"的漂移风险。

第一版采取**脚本双产出 + 指纹校验**（改动小、不阻塞识别）：

1. `SPECIES` 每条新增一个 `confusable` 字段（易混提示），例如：

   ```python
   {"id": "carassius-auratus", "name": "鲫鱼", "latin": "Carassius auratus",
    "confusable": ["鲤鱼", "鳊鱼"],   # 照片里容易认错的近缘种
    ...}
   ```

   22 种里至少要标注的易混组：鲫鱼↔鲤鱼↔鳊鱼、鲢鱼↔鳙鱼、草鱼↔青鱼、
   马口鱼↔白条、鲶鱼↔黄颡鱼、红鳍东方鲀↔星点东方鲀。
   **没有易混提示，模型会把鲫鱼认成白条** —— 这是 22 种清单里最高频的错误类型。

2. 脚本多写一份 `Server-Go/internal/domain/species/catalog.json`：

   ```json
   {
     "version": "2026-10-26",
     "fingerprint": "sha256:9f2c...",
     "species": [
       { "id": "carassius-auratus", "name": "鲫鱼", "scientific": "Carassius auratus", "confusable": ["鲤鱼", "鳊鱼"] }
     ]
   }
   ```

3. `fingerprint` = 对 `(id, name, scientific)` 序列按 id 排序后取 sha256。
   前端 `src/constants/fish-images.ts` 生成时也写入同一个指纹，
   后端启动时校验自己这份与预期一致 —— **两份清单不同步时在启动日志里报错，而不是在识别结果里出错**。

> **下一步（不是第一版）**：鱼种卡最终要展示分布、钓法、食用风险，这些是**数据**不是素材，
> 该由后端持有并通过 `GET /v3/species` 提供，前端退化成渲染方。
> 到那时把清单迁进后端、`catalog.json` 变成接口返回，迁移成本才划算。
> 现在迁，等于为了跑通识别先做一次数据搬家。

### 2.3 VisionProvider：照出图的形状，但另起一套

`internal/service/nomu/design_provider.go` 已经给出了服务商抽象的正确形状
（换服务商 = 换一份 `Provider` 值，编排不变）。视觉理解**另起一套**，不复用：

```go
// internal/service/species/vision_provider.go

// VisionProvider 一个视觉理解服务商的接入参数。
//
// 为什么不上 design.Provider：出图与视觉理解的协议形态不同 ——
// 出图是扁平 JSON 字段，视觉理解是 messages 数组 + 多模态 content。
// 硬塞进 design_provider 会让两边互相拖累。
type VisionProvider struct {
    // Name 服务商标识，用于日志与模型路由（"ark" / "qwen" / "openai"）。
    Name string
    // BaseURL 根地址，如 "https://ark.cn-beijing.volces.com/api/v3"
    BaseURL string
    // ChatPath 对话端点路径，默认 "/chat/completions"
    ChatPath string
    // APIKey 上游密钥
    APIKey string
    // AuthScheme 鉴权头前缀，默认 "Bearer"
    AuthScheme string
    // Models 展示名 → 上游模型 ID + 计费档位
    Models map[string]ModelSpec
    // DefaultModel Models 的 key，Model 为空时的兜底（应为成本低档）
    DefaultModel string
}
```

**第一版只实现 OpenAI 兼容一种组包**（方舟的 `api/v3/chat/completions` 就是这个形态）。
不预支 `Protocol` 分派 —— 等真要接协议不同的上游时再加，
路径照 `design_provider.go` 的演进方式（先单协议，后按 `Protocol` 分派）。

### 2.4 图片怎么传给模型

**用 base64 data URL，不用公网 URL。**

```
data:image/jpeg;base64,{...}
```

理由不是省一次回环，而是**隐私**：用户的钓获照不该变成一个任何人可访问的 URL。
base64 的 33% 膨胀用压缩解决：

| 约束 | 值                         | 理由                                                         |
| ---- | -------------------------- | ------------------------------------------------------------ |
| 长边 | ≤ 1280px                   | 视觉模型在 1024~1536 区间性价比最好，再大只烧 token 不涨精度 |
| 体积 | ≤ 1.5MB（base64 后 ≤ 2MB） | 上游请求体上限与后端内存占用                                 |
| 格式 | JPEG                       | 微信拍照产物本来就是 JPEG                                    |
| 质量 | ~82                        | 鱼体斑纹是判别特征，压太低会丢特征                           |

压缩逻辑：`nomu/design_image.go` 里已有 `compressImages`（给参考图用的，
预算 2048px/6MB）。**复用它**，只是预算不同 —— 建议把它抽到
`internal/infra/imageproc`，两个调用方各自传预算。不要复制一份。

### 2.5 Prompt：整个方案的成败在这

三条硬约束：**白名单**（只能选清单内的）、**结构化输出**（固定 JSON）、**认不出就说认不出**。

System prompt 草案：

```
你是常见鱼类的鉴定助手。用户上传的照片可能是钓获照、鱼篓里的活鱼、
市场照或钓点现场照，背景杂乱、可能模糊、可能有鱼钩和鱼线。

只能从下面这份清单里选鱼种，一个都不能加、不能改名、不能给清单外的学名：
<清单>
{id} | {中文名} | {学名} | 易混：{易混种，没有就写"无"}

输出严格 JSON，不要任何额外文字或 markdown 代码块：
{
  "candidates": [
    {"id": "<清单里的 id>", "confidence": 0.0-1.0,
     "features": ["<3-5 个短语：这张图上看到的判别特征>"]}
  ],
  "verdict": "identified" | "uncertain" | "not_in_list",
  "reason": "<一句话>"
}

规则：
- candidates 按置信度降序，最多 3 个。
- 只在清单内选择。看不清、不是鱼、或明显是清单外的鱼 →
  verdict="not_in_list"，candidates 为空数组，reason 说明像什么。
- 拿不准就给低 confidence 和多个候选，不要硬给一个高分。
- features 只写这张图上真的看到的（体形、鳍形、斑纹、体色、口型、须），
  不要写教科书里的典型特征。用户要的是"这张图的依据"，不是物种百科。
```

**为什么 features 这条要写死**：模型很爱补全"鲫鱼有须无须"这类教科书知识，
写出来的判别特征和照片对不上，用户一比对就发现被骗。特征词是这份结果里
唯一有信息量的部分，必须来自图。

### 2.6 响应解析：三道闸

模型输出不能直接信。三道闸依次过：

**第一道 · JSON 抽取（容错）**
模型可能裹 ```json 代码块、可能前后带话。做法：
剥代码块包裹 → 找第一个 `{` → 扫描括号配平截出第一个完整 JSON 对象 → `json.Unmarshal`。
失败即视为上游异常（502），不猜。

**第二道 · schema 校验**

- `id` **必须在白名单内**，不在 → 丢弃该 candidate（不是改写，是丢弃）
- `confidence` 钳到 `[0,1]`，非法值丢弃该 candidate
- `candidates` 最多留 3 个
- `verdict` 只认三个枚举值，非法 → 降级为 `uncertain`

**第三道 · 字段回填（防幻觉的关键）**
模型只贡献 **`id`、`confidence`、`features`**。
展示用的 `name`、`scientific`、鱼种图、许可署名 —— **一律从后端清单反查**，
不采用模型给的任何名字。

> 模型把"鲫鱼"写成"鲫"、把学名写成 `Carassius auratus (Linnaeus, 1758)`、
> 把鲢鱼写成"白鲢"——这些都是常见输出形态。字段回填让这类错误**不可能出现在界面上**。

### 2.7 置信度 → 用户看到什么

| 条件                               | verdict       | 前端表现                 |
| ---------------------------------- | ------------- | ------------------------ |
| top1 ≥ 0.6 且 (top1 − top2) ≥ 0.15 | `identified`  | 单个鱼种卡 + 特征词      |
| top1 ≥ 0.6 但 top1 − top2 < 0.15   | `uncertain`   | 降级为多候选             |
| top1 < 0.6                         | `uncertain`   | 多候选 + "可能是"语气    |
| 无候选 / 清单外                    | `not_in_list` | "不认识这种鱼"+ 记录入口 |

**"不是这个"的纠错入口是必须的**，两个理由：一是诚实（用户比模型准），
二是它是 B2/自训的**标注数据来源**（见对话里的路线图）。
用户点掉一个错误候选，就等于给未来的自训模型打了一条标签。

### 2.8 计费接入

照 `design_generate` 的模式，`credit_price` 新增一行：

```go
// internal/model/credit.go
const (
    // SpeciesVariantArkVision 鱼种识别档位。
    SpeciesVariantArkVision = "ark:doubao-vision"
)

var creditPriceSeeds = []CreditPrice{
    // ...
    // 鱼种识别：按次定额（厘/次）。视觉模型单次输入固定、输出是短 JSON，
    // 成本波动小，定额够用。
    {Source: "species_identify", Variant: SpeciesVariantArkVision, UnitPrice: 5},
}
```

**为什么按次而不是按 token**：`credit_price` 的 `UnitPrice` 单位由 source 决定，
`TokenPricedSources` 集合内的 source 是"厘/1K tokens"，由 **Py 端**
`settle_by_tokens` 结算，Go 侧没有 token 用量结算机制。
视觉模型确实是 token 计价，但要在 Go 侧做 token 结算就得先实现
`settle_by_tokens` 的 Go 版 —— **第一版不做**。
按次定额：5 厘 = ¥0.05/次零售价，实际成本约 ¥0.005~0.02，毛利空间够。

**计费时序**（照 `design_service.go` 的 `Generate`，逐条对齐）：

1. `Router.Resolve(model)` → 得出服务商与计费档位
2. `credits.Preconsume(ctx, userID, "species_identify", variant, 1, bizID, nil)`
   —— 余额不足直接 402，**不调上游**。这同时是最有效的限流。
3. 调上游
4. 成功 → 不再动账（预扣 1 次就是实际 1 次）
5. 失败 → `defer` 里 `Refund`，用 `context.WithoutCancel(ctx)` + 10s 超时
   （客户端断开不该把退款一起取消掉）
6. 幂等键 = `Idempotency-Key` 头，缺省服务端 UUID。
   `Preconsume` 返回的 `created=false` 表示幂等命中，**这时失败不能退** ——
   首笔扣费可能已成功交付过，退了等于重放免单。

### 2.9 限流

```go
// internal/router/router.go
speciesIdentifyLimiter := middleware.NewRateLimiter(rdb, "species_identify", 10, time.Hour)
speciesH := handler.NewSpeciesHandler(state.SpeciesSvc())
speciesH.RegisterRoutes(v3, auth, speciesIdentifyLimiter.Middleware())
```

**10 次/小时/用户**：钓友一天认十条鱼顶天了，认一百条是在刷接口。
参照 `likeLimiter`（25/24h）的口径。

### 2.10 端点契约

```
POST /v3/species/identify
Content-Type: multipart/form-data
Authorization: Bearer <token>
Idempotency-Key: <uuid>

multipart 字段：
  file   图片文件（必填）
  hint   可选，用户补充描述（"约30cm，银白，桶里"）—— 会进 prompt
```

响应：

```json
{
  "message": "ok",
  "data": {
    "verdict": "identified",
    "candidates": [
      {
        "id": "carassius-auratus",
        "name": "鲫鱼",
        "scientific": "Carassius auratus",
        "confidence": 0.82,
        "features": ["体侧鳞片细密", "无明显斑纹", "背鳍短"]
      }
    ],
    "reason": "体侧鳞片细密、无明显斑纹，符合鲫鱼特征",
    "model": "doubao-vision-pro",
    "usage": { "prompt_tokens": 1024, "completion_tokens": 96, "total_tokens": 1120 }
  }
}
```

错误码：

| 码  | 含义                     | 前端处理                         |
| --- | ------------------------ | -------------------------------- |
| 400 | 图片缺失/格式不支持/超限 | 提示重拍或换图                   |
| 402 | 积分不足                 | 引导充值，**别用通用错误 toast** |
| 429 | 超出频率限制             | 提示稍后再试                     |
| 502 | 上游异常 / 响应无法解析  | 通用失败 + 可重试                |

### 2.11 不落盘 + 并发控制

识别图**不进任何目录**。multipart 读进内存 → 压缩 → base64 → 发上游 → 丢弃。

内存占用 = 并发数 × 单图 2MB，需要信号量限住：

```go
// 单图处理并发上限 4 —— 超出的请求排队等，不无限吃内存
sem := make(chan struct{}, 4)
```

上游调用的并发另算（带超时的 HTTP 调用会自己占用 goroutine）。

### 2.12 日志与隐私

```go
slog.InfoContext(ctx, "species identified",
    "user_id", userID, "model", model,
    "verdict", verdict, "confidence", topConfidence,
    "latency_ms", latency, "total_tokens", usage.TotalTokens)
```

**不打图片内容**（base64 更不能进日志）。要关联同一张图就打 sha256 前 8 位。

> ⚠️ **审核卡点**：照片要发给第三方 AI 服务处理，必须在小程序的
> **隐私保护指引**里声明，并把第三方（方舟/通义等）列进接收方清单。
> 这一条不给过，微信审核会直接驳回。项目的隐私协议流程见
> `docs/mp-weixin-network.md`。

---

## 3. 前端实现

### 3.1 新增 `src/api/species.ts`

```ts
export type SpeciesVerdict = 'identified' | 'uncertain' | 'not_in_list';

export interface SpeciesCandidate {
  id: FishSpeciesId;
  name: string;
  scientific: string;
  confidence: number;
  features: string[];
}

export interface IdentifyResult {
  verdict: SpeciesVerdict;
  candidates: SpeciesCandidate[];
  reason: string;
  model: string;
}

export function identifySpecies(
  filePath: string,
  options?: { hint?: string; idempotencyKey?: string },
): Promise<IdentifyResult>;
```

实现走 `uni.uploadFile`（**不能复用 `api/upload.ts` 的 `uploadImage`** ——
它把 url 与 `type` 字段写死了，识别端点不需要 `type`，需要 `hint`）。

**该改的地方**：把 `api/upload.ts` 里的上传动作抽成通用函数：

```ts
// api/upload.ts
export function uploadFileTo(
  url: string,
  opts: { filePath: string; formData?: Record<string, string>; header?: Record<string, string> },
): Promise<ApiEnvelope<T>>;
```

`uploadImage` 与 `identifySpecies` 共用它。两处共用一份上传逻辑，
避免"上传逻辑改了两边只改一边"。

### 3.2 端侧预处理

```ts
const res = await wx.chooseMedia({ sourceType: ['camera', 'album'], count: 1, mediaType: ['image'] });
// 压缩：减少上传体积，同时降 token
const compressed = await wx.compressImage({ src: res.tempFiles[0].tempFilePath, quality: 80, compressedWidth: 1280 });
```

⚠️ `compressedWidth` 在部分基础库版本上不生效，**必须能降级**：
压缩失败就用原图传，不要因为压缩失败整个识别流程挂掉。

### 3.3 页面与组件

新页面 `src/pages/species/index.vue`，入口挂在「我的」页或钓点详情的浮动入口。

组件（照 `src/components/` 的既有形状）：

```
src/components/SpeciesResultCard/SpeciesResultCard.vue   # 结果卡：鱼种图 + 名 + 置信度条 + 特征词
src/components/SpeciesCandidateChip/SpeciesCandidateChip.vue  # 候选 chip：多候选横排
```

鱼种卡渲染直接复用 `fishImageUrl(id)`（`src/constants/fish-images.ts`），
**署名必须一起显示**（`author` + `license`）—— Commons 的图多是 CC BY / CC BY-SA，
署名是许可条件。

⚠️ 鱼种图走 CDN → **微信后台 downloadFile 合法域名必须配**，
否则 `<image>` 拉不到图且**不报错**，只是空一块。已有提醒见 `api/upload.ts` 的注释。

### 3.4 设计约束

按项目设计系统（`docs/design-system.md`）与 MUI 原则：

- **不要**在鱼种卡下面再写一段"鲫鱼是鲤科鲤属的淡水鱼…" —— 布局做解释，不要文字
- 置信度用**条**不用百分比数字堆在标题旁边
- 不确定态（`uncertain`）不要用红色警告色，那是"还没定"不是"出错"；
  用中性色 + 多个候选并列
- `not_in_list` 才用一次性的说明文案，并且给"记一笔"的入口

---

## 4. 性能与成本验收

按 `AGENTS.md` 的要求，性能开销是设计与验收的一部分，不是事后优化：

| 指标         | 目标                         | 怎么测                                                 |
| ------------ | ---------------------------- | ------------------------------------------------------ |
| 端到端延迟   | P50 < 3s，P95 < 6s（含上传） | 服务端埋点 `latency_ms`                                |
| 单次上游成本 | < ¥0.02                      | 按 usage 折算，与 ¥0.05 零售价对照                     |
| 上传体积     | 压缩后 ≤ 300KB               | 端侧埋点                                               |
| 上游失败率   | < 2%（5xx + 超时）           | 服务端日志计数                                         |
| 识别准确率   | 回归集 top1 ≥ 80%            | 30~50 张真实钓获照，含全部易混组                       |
| uncertain 率 | 10%~25%                      | **太低说明模型在硬猜，太高说明白名单或 prompt 有问题** |

uncertain 率是个健康指标：它落在 10%~25% 说明模型在诚实表达不确定，
界面上的"可能是 A/B"才可信。

---

## 5. 落地顺序

| #   | 任务                                                             | 产出               |
| --- | ---------------------------------------------------------------- | ------------------ |
| 1   | `SPECIES` 加 `confusable` 字段；脚本双产出 `catalog.json` + 指纹 | 后端与前端清单同源 |
| 2   | `internal/domain/species` 加载与校验（指纹不匹配启动报错）       | 白名单真值         |
| 3   | `VisionProvider` + `VisionClient`                                | 上游接入           |
| 4   | `prompt.go` + `parse.go`（三道闸）                               | 识别质量           |
| 5   | `species_service.go`（压缩 → 计费 → 调用 → 解析 → 结算）         | 编排               |
| 6   | `species_handler.go` + 路由 + 限流 + `credit_price` seed         | 端点可用           |
| 7   | 前端 `api/species.ts` + 抽通用 `uploadFileTo`                    | 传输层             |
| 8   | 端侧压缩 + 页面 + 组件                                           | UI                 |
| 9   | 30~50 张真实照回归集 + 埋点                                      | 验收数据           |

---

## 6. 风险

| 风险       | 表现                         | 对策                                                      |
| ---------- | ---------------------------- | --------------------------------------------------------- |
| 模型硬猜   | 每次都高置信度给一个种       | 强制多候选 + `uncertain` 降级规则 + 回归集盯 uncertain 率 |
| 近缘种混淆 | 鲫鱼↔白条、鲢↔鳙             | 清单带易混提示；回归集必须覆盖每个易混组                  |
| 模型编特征 | 特征词是百科而非本图         | prompt 明写"只写图上看到的"；后端只信 id 与 features      |
| 清单漂移   | 后端白名单与前端鱼种卡对不上 | 指纹校验，启动即报                                        |
| 审核驳回   | 隐私指引没写第三方 AI        | 提前改隐私保护指引，列明接收方                            |
| 刷接口     | 脚本批量识别                 | 10 次/小时限流 + 预扣余额闸门                             |
| 上游涨价   | 单次成本超 ¥0.02             | 计费按次定额可独立调价；`credit_price` 改表数据即可       |

---

## 7. 待拍板

1. **积分定价**：5 厘/次（¥0.05）是否合适 —— 需要看真实上游账单再定
2. **是否强制登录**：扣积分就必须登录（`auth` 中间件）。匿名免费识别会被刷
3. **鱼种数据何时迁到后端**：识别上线后，鱼种卡要展示分布/钓法/食用风险时才划算
