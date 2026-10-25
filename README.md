<div align="center">
  <img src="brand/yulu/yulu-logo-256.png" width="120" alt="渔碌 Logo" />
  <h1>渔碌</h1>
  <p>查潮汐、找钓点、看天气。</p>
</div>

<p align="center">
  <img src="src/pages/spot-detail/static/wxacode.png" width="220" alt="渔碌小程序码" />
</p>

<p align="center"><strong>微信扫码，进入「渔碌」小程序</strong></p>

---

## 这是什么

渔碌是一款面向钓友的微信小程序：查潮汐与天气、找并收藏钓点、看钓鱼指数，
钓点信息由用户自己添加与共享。

- **潮汐与天气**：来自和风天气，逐时预报、多日预报、潮汐曲线都在一个页面里。
- **钓鱼指数**：服务端按气象与潮汐要素加权算出的综合分，逐项构成可展开查看。
- **钓点地图**：微信原生 map 组件展示周边钓点，支持自建、编辑、分享钓点。
- **AI 天气解读**：SSE 流式返回，结论边生成边显示。
- **分享海报**：钓点详情页可生成带小程序码的海报。

## 技术栈

| 项目 | 选型 |
| --- | --- |
| 框架 | uni-app 3 + Vue 3 + TypeScript |
| 状态管理 | Pinia |
| 目标平台 | 微信小程序（`mp-weixin`） |
| 构建 | Vite 5 |
| 包管理 | pnpm |
| 格式化 / 校验 | oxfmt / oxlint + vue-tsc |

> 平台边界：小程序没有浏览器运行时，`document` / `window` / `localStorage` / `fetch` 一律不可用，
> 所有平台能力走 `uni.*` 命名空间。`pnpm lint` 的 `no-undef` 就是这条边界的静态版本。

## 快速开始

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发构建，产物在 dist/dev/mp-weixin/
pnpm build            # 生产构建 + 兼容性检查，产物在 dist/build/mp-weixin/
```

用微信开发者工具打开 `dist/dev/mp-weixin/` 目录即可预览。真机预览、编译与上传发布走
`/wechatide-skill` 技能，代码包体积与分包约束见 [代码包](docs/mp-weixin-package.md)。

提交前请依次跑完这两道关：

```bash
pnpm type-check
pnpm lint
```

## 环境变量

所有变量只从 `import.meta.env.VITE_*` 读取。复制 [.env.example](.env.example) 为 `.env.local` 后按需填写：

| 变量 | 作用 |
| --- | --- |
| `VITE_API_BASE_URL` | 接口基址，默认走 `@/config/env` 的默认值 |
| `VITE_QWEATHER_FONT_URL` | 和风天气图标字体地址，需在微信后台配为 downloadFile 合法域名 |
| `VITE_CDN_BASE_URL` | 静态资源 CDN 基址，同样需配合法域名 |

新增 `VITE_*` 变量时，记得同步把它加进 `vite.config.ts` 的 `envPrefix` 白名单 ——
那是白名单不是前缀，漏一个变量运行时就取到 `undefined` 且不报错。

## 目录结构

```
src/
├── api/          # 接口层：端点清单、鉴权与错误语义、401 静默刷新
├── components/   # 展示组件，只管渲染与交互
├── composables/  # 跨页面复用的组合式逻辑
├── config/       # 环境配置出口
├── constants/    # 文案与图标的唯一出处
├── pages/        # 页面；主包三页 + 五个分包
├── stores/       # Pinia：会话、地图与钓点数据
├── styles/       # tokens（手写）/ shared（手写）/ generated（脚本产出）
├── types/        # 类型定义
└── utils/        # 纯函数：换算、存储、绘图
```

## 文档

按「要做什么」找对应那一份：

| 要做什么 | 读哪份 |
| --- | --- |
| 改界面、加页面、加组件、调间距字号配色 | [设计系统](docs/design-system.md) |
| 接接口、改数据流、加字段、动 store | [架构](docs/architecture.md) |
| 碰 canvas / map / 字体 / 动画 / 自定义事件 / 窗口尺寸 | [小程序平台能力](docs/mp-weixin-platform.md) |
| 碰 SSE / 定位 / 选点 / 上传 / 分享 / 登录 / 域名与后台配置 | [网络与后台](docs/mp-weixin-network.md) |
| 动代码包：静态图、分包、包体大小 | [代码包](docs/mp-weixin-package.md) |
| 关心代码能不能商用、能不能改协议、素材能不能用 | [许可协议](docs/licensing.md) |

开发约定见 [AGENTS.md](AGENTS.md)。

## 许可与审查

**本仓库公开，目的是让使用者能审查这段代码做了什么、往服务端发了什么 ——
不是邀请闭源白嫖。**

代码采用 [GPL-3.0](LICENSE)（GNU General Public License v3，SPDX `GPL-3.0-only`）：

- 允许自由使用、修改、再分发，**包括商业使用**；
- 但**任何衍生作品必须同样以 GPL-3.0 发布并提供完整源码** —— 用了这份代码，就不能闭源卖；
- 含明确的专利授权（§11）与专利报复终止条款；
- 服务端不属于本仓库，不受本协议约束。

Copyright (c) 2026 Kuroome

## 数据来源与免责声明

- 天气实况、逐时预报、多日预报与潮汐数据来自**和风天气**，由渔碌服务端转发并做缓存。
- 钓鱼指数由服务端依据气象与潮汐要素加权计算得出，仅供参考，不作为渔获的保证。
- 钓点信息由用户自行添加与共享，平台不对其准确性、可达性与安全性作出保证。
- 本小程序提供的信息仅供垂钓活动参考，不作为航行、水上作业或任何安全决策的依据，
  实际水文与气象条件请以官方发布为准。

完整条款见小程序内「我的 → 关于渔碌」。
