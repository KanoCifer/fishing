# 渔碌

uni-app + Vue 3 + TypeScript 的微信小程序，用 `pnpm`，构建产物在 `dist/build/mp-weixin/`

## 平台边界

只有一个目标平台：mp-weixin。平台能力一律走 `uni.*` 命名空间 —— `uni.request`、`uni.getWindowInfo`、`uni.getLocation`、`uni.loadFontFace`，小程序没有浏览器运行时

**后端服务项目在 `../Server-Go`、`../Server-Py`。**

## 深入

按「要做什么」找对应那一份，不要通读：

| 要做什么                                                              | 读哪份                       |
| --------------------------------------------------------------------- | ---------------------------- |
| 改界面、加页面、加组件、调间距字号配色                                | `docs/design-system.md`      |
| 接接口、改数据流、加字段、动 store                                    | `docs/architecture.md`       |
| 碰 canvas / map / 字体 / 动画 / 自定义事件 / 窗口尺寸                 | `docs/mp-weixin-platform.md` |
| 碰 SSE / 定位 / 选点 / 上传 / 分享 / 登录 / 隐私协议 / 域名与后台配置 | `docs/mp-weixin-network.md`  |
| 动代码包：静态图、分包、包体大小；真机引擎与依赖兼容                  | `docs/mp-weixin-package.md`  |
| 做成就/勋章素材：生图、绿幕抠图、产物体积                            | `docs/mp-weixin-package.md`  |
| 真机预览、编译、上传发布                                              | `/wechatide-skill`           |
