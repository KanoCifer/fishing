/**
 * 账号相关的类型 —— 与服务端 /v3 的用户字典一一对应。
 *
 * 字段名保持服务端的下划线写法（`is_admin`、`login_count`），不做驼峰转换：
 * 这些字典是服务端 `UserView.Render` 直接吐出来的，中间加一层改名会让
 * 「前端叫 A、后端叫 B」这件事藏在代码里，改一处就断一处。
 */

/**
 * 用户字典。
 *
 * 形状与密码登录、`GET /me`、`POST /upload-pic` 三个端点的响应完全一致 ——
 * 服务端三处都调同一个 `Render`，所以前端也只需要一个类型。
 *
 * 可选字段的由来：`Render` 只在值非空时才把键写进字典（见服务端
 * `internal/service/user/view.go`），所以 `photo` / `email` 这类键可能整个不存在，
 * 读的时候必须容错。
 */
export interface AuthUser {
  id: number;
  /** 服务端派生的账号名。微信登录时是 `wx_` + openid 哈希前 8 字节，不是用户的微信昵称 */
  username: string;
  /** 昵称。微信登录时由前端在登录请求里带上，服务端仅在昵称为空时才写入 */
  name: string;
  is_admin: boolean;
  login_count: number;
  active: boolean;
  has_passkey: boolean;
  github_bound: boolean;
  wechat_bound: boolean;
  /** 头像相对路径，如 `pics/42/xxx-256.jpg`；缺省是 `default.png` */
  photo?: string;
  email?: string;
  gender?: string;
  mobile?: string;
}

/** 一对 token。access 15 分钟，refresh 30 天 */
export interface SessionTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * 微信登录的响应。
 *
 * 服务端把用户字段和两个 token **铺平在 data 顶层**（不是嵌套在 user 里），
 * 所以这里是两个类型的交叉而不是一个嵌套结构。
 */
export type WechatLoginResponse = AuthUser & SessionTokens;
