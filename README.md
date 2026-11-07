<div align="center">
  <img src="brand/yulu/yulu-logo-256.png" width="96" alt="渔碌 Logo" />
  <h1>渔碌 <sub>YULU</sub></h1>
  <p><b>查潮汐 · 找钓点 · 看天气</b><br />面向钓友的微信小程序 —— 出钓前的功课</p>
</div>

<div align="center">
  <img src="brand/yulu/yulu-cover-5x4.jpg" width="520" alt="渔碌 · 鱼口概率 / 潮汐曲线 / 逐时天气 / 钓点地图" />
</div>

<div align="center">

[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-mp--weixin-07C160.svg)](docs/mp-weixin-platform.md)
[![uni-app](https://img.shields.io/badge/uni--app-3.0-3EBEB8.svg)](https://uniapp.dcloud.net.cn/)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883.svg)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9-3178C6.svg)](https://www.typescriptlang.org/)
[![Pinia](https://img.shields.io/badge/Pinia-3-F9D145.svg)](https://pinia.vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)](https://vite.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-12-F69220.svg)](https://pnpm.io/)
[![Weather](https://img.shields.io/badge/weather-QWeather-4EA5F9.svg)](https://dev.qweather.com/)

</div>

---

## 📱 扫码体验

<p align="center">
  <img src="src/pages/spot-detail/static/wxacode.png" width="200" alt="渔碌小程序码" />
</p>

<p align="center"><strong>微信扫码，进入「渔碌」小程序</strong></p>

---

## 📖 目录

- [✨ 这是什么](#-这是什么)
- [🧰 技术栈](#-技术栈)
- [🚀 快速开始](#-快速开始)
- [🔧 环境变量](#-环境变量)
- [📂 目录结构](#-目录结构)
- [📚 文档](#-文档)
- [📜 许可与审查](#-许可与审查)
- [🌊 数据来源与免责声明](#-数据来源与免责声明)

---

## ✨ 这是什么

渔碌是一款面向钓友的微信小程序：查潮汐与天气、找并收藏钓点、看鱼口概率，钓点信息由用户自己添加与共享。

| 能力                 | 说明                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| **潮汐与天气**       | 来自和风天气，逐时预报、多日预报、潮汐曲线都在一个页面里                   |
| **鱼口概率**         | 服务端按气象与潮汐要素加权算出的综合分，逐项构成可展开查看                 |
| **钓点地图**         | 微信原生 map 组件展示周边钓点，支持自建、编辑、分享钓点                   |
| **AI 天气解读**      | SSE 流式返回，结论边生成边显示                                             |
| **分享海报**         | 钓点详情页可生成带小程序码的海报                                           |
| **渔获记录**         | 记录每一次出渔的渔获与条件，形成个人数据                                   |

---

## 🧰 技术栈

| 项目          | 选型                           |
| ------------- | ------------------------------ |
| 框架          | uni-app 3 + Vue 3 + TypeScript |
| 状态管理      | Pinia                          |
| 目标平台      | 微信小程序（`mp-weixin`）      |
| 构建          | Vite 5                         |
| 包管理        | pnpm                           |
| 格式化 / 校验 | oxfmt / oxlint + vue-tsc       |

> **平台边界**：小程序没有浏览器运行时，`document` / `window` / `localStorage` / `fetch` 一律不可用，
> 所有平台能力走 `uni.*` 命名空间。

---

## 🚀 快速开始

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发构建，产物在 dist/dev/mp-weixin/
pnpm build            # 生产构建 + 兼容性检查，产物在 dist/build/mp-weixin/
```

提交前请依次跑完这两道关：

```bash
pnpm type-check
pnpm lint
```

---

## 🔧 环境变量

| 变量                | 作用                                                      |
| ------------------- | --------------------------------------------------------- |
| `VITE_API_BASE_URL` | 接口基址，默认走 `@/config/env` 的默认值                  |
| `VITE_CDN_BASE_URL` | 静态资源 CDN 基址，需在微信后台配为 downloadFile 合法域名 |
| `VITE_YULU_VERSION` | 应用版本号，关于页显示，发布时与 `src/manifest.json` 的 versionName 一致 |

---

## 📂 目录结构

```
src/
├── api/          # 接口层：端点清单、鉴权与错误语义、401 静默刷新
├── components/   # 展示组件，只管渲染与交互
├── composables/  # 跨页面复用的组合式逻辑
├── config/       # 环境配置出口
├── constants/    # 文案与图标的唯一出处
├── pages/        # 页面；主包三页 + 五个分包
├── stores/       # Pinia：会话、地图与钓点数据
├── styles/       # 样式系统
├── types/        # 类型定义
└── utils/        # 纯函数：换算、存储、绘图
```

---

## 📚 文档

按「要做什么」找对应那一份：

| 要做什么                                                   | 读哪份                                       |
| ---------------------------------------------------------- | -------------------------------------------- |
| 改界面、加页面、加组件、调间距字号配色                     | [设计系统](docs/design-system.md)            |
| 接接口、改数据流、加字段、动 store                         | [架构](docs/architecture.md)                 |
| 碰 canvas / map / 字体 / 动画 / 自定义事件 / 窗口尺寸      | [小程序平台能力](docs/mp-weixin-platform.md) |
| 碰 SSE / 定位 / 选点 / 上传 / 分享 / 登录 / 域名与后台配置 | [网络与后台](docs/mp-weixin-network.md)      |
| 动代码包：分包、包体大小、静态图、勋章素材                 | [代码包](docs/mp-weixin-package.md)          |
| 做鱼种识别（拍照认鱼，方案尚未落地）                       | [鱼种识别](docs/fish-identification.md)      |

---

## 📜 许可与审查

代码采用 [GPL-3.0](LICENSE)（GNU General Public License v3，SPDX `GPL-3.0-only`）：

- 允许自由使用、修改、再分发，**包括商业使用**；
- 但**任何衍生作品必须同样以 GPL-3.0 发布并提供完整源码**；
- 含明确的专利授权（§11）与专利报复终止条款；
- 服务端不属于本仓库，不受本协议约束。

Copyright (c) 2026 Kuroome

---

## 🌊 数据来源与免责声明

- 天气实况、逐时预报、多日预报与潮汐数据来自**和风天气**，由渔碌服务端转发并做缓存。
- 鱼口概率由服务端依据气象与潮汐要素加权计算得出，仅供参考，不作为渔获的保证。
- 钓点信息由用户自行添加与共享，平台不对其准确性、可达性与安全性作出保证。
- 本小程序提供的信息仅供垂钓活动参考，不作为航行、水上作业或任何安全决策的依据，实际水文与气象条件请以官方发布为准。
- 垂钓活动请遵守当地法律法规，注意安全⚠️。

完整条款见小程序内「我的 → 关于渔碌」。
