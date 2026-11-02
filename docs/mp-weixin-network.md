# 微信小程序：网络、权限与微信能力

平台约束见 `docs/mp-weixin-platform.md`。

## 请求的两个开关

- `enableHttp2` 默认 `false`；`defer` 微信端不生效。

## 启动阶段别发请求

首屏渲染后再取数：`onReady` + `setTimeout(..., 0)`；不显示数据的页面别发重请求。

## SSE 流式

无回调只得 Promise，拿不到 task 挂不上 `onChunkReceived`；超 60s 腰斩。

```ts
{ dataType: 'text', responseType: 'arraybuffer', enableChunked: true, enableHttp2: false, timeout: 5 * 60 * 1000 }
```

- `onChunkReceived` 须在拿到 task 后挂；服务端要 `text/event-stream`。

## 定位

- 必须 gcj02；`getLocation`/`chooseLocation` 须在 `requiredPrivateInfos` 声明。

### 选点

- `chooseLocation` 坐标 GCJ-02，`res.address`即后端 `address`。

## 选图与上传

- `chooseMedia` 压缩版；`tempFilePath` 1–5 分钟失效；扩展名非 jpeg/png/gif/webp 回 400。

## 分享

### 转发面板只能由按钮唤起

- `onShareAppMessage` 只给内容；转发面板只有 `<button open-type="share">` 入口。

## 登录

- `wx.login` 拿 code 换 openid 自动建号；refresh token 自存，两 token 一起清。

## 联系客服

- 客服会话靠原生 `<button open-type="contact">` 唤起；⚠️ 后台「客服反馈→客服人员」在线。

## 隐私协议

- `wx.openPrivacyContract` 跳后台；uni 没这接口只能走 `wx.*`；2.32.3 起才有，先探 typeof。

## 微信后台配置

| 项 | 值 | 不配 |
| --- | --- | --- |
| request 域名 | `VITE_API_BASE_URL` | 全失败 |
| downloadFile 域名 | API+CDN(`VITE_CDN_BASE_URL` 主机名) | 照片裂 |
| uploadFile 域名 | `VITE_API_BASE_URL` | 传不上 |
| 预解析域名≤5 | `api.kanocifer.chat`、`cdn.kanocifer.chat` | 冷启慢 |
| scope.userLocation/scope.userInfo | `manifest.json` | 定位空 |

⚠️ 三份域名名单互相独立，填一份不等于另两份生效；`requiredPrivateInfos` 漏了真机才炸。
