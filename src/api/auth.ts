/**
 * 账号网关 —— 微信登录、资料读取、token 续期、头像上传。
 *
 * 契约来源：`Server-Go/docs/api/wechat-mini-program-login.md`，
 * 服务端实现见 `internal/handler/weixin_handler.go` 与 `internal/handler/user_handler.go`。
 *
 * 三件小程序端必须显式处理、浏览器端看不见的事，都收在这一层：
 *
 * 1. **code 是一次性的**。`wx.login()` 拿到的 code 只能用一次、5 分钟过期。
 *    复用同一个 code 必然 401，所以拿到 401 要**重新取 code** 再试一次，
 *    而不是把同一个 code 再发一遍。
 * 2. **token 要自己存自己带**。小程序不管理 cookie，服务端下发的 HttpOnly
 *    refresh cookie 这边收不到，refresh token 必须自己放 Storage 里、放进请求体。
 * 3. **刷新会轮换 refresh token**。服务端每次刷新都换一枚新的，旧的立即失效。
 *    所以并发请求同时撞上 401 时，只允许有一个刷新在飞 —— 否则第二个拿着
 *    已作废的 refresh 去刷新，必然失败，整条链路就卡死了。
 */

import { ENV } from '@/config/env';
import type { AuthUser, SessionTokens, WechatLoginResponse } from '@/types/auth';
import {
  ApiError,
  STATUS_TEXT,
  clearSession,
  getRefreshToken,
  getToken,
  request,
  setRefreshToken,
  setToken,
  type ApiEnvelope,
} from './client';

/* ── 媒体地址 ─────────────────────────────────────────────────────────── */

/**
 * 媒体根地址。
 *
 * 服务端把上传目录挂在 `/v3/media` 下（见 `internal/router/router.go` 的
 * `r.Static("/v3/media", ...)`），和接口基址同源，所以从 ENV 拼而不是写死域名。
 */
const MEDIA_BASE = `${ENV.apiBaseUrl.replace(/\/+$/, '')}/v3/media/`;

/**
 * 相对路径 → 可直接放进 `<image src>` 的地址。
 *
 * 服务端回的 `photo` 是**相对路径**（如 `pics/42/xxx-256.jpg`），
 * 直接当 src 用会 404。已经带 http 前缀的原样返回。
 *
 * ⚠️ 部署提醒：小程序加载远程图片走的是 **downloadFile 合法域名**，
 * 跟 request / uploadFile 是三份独立的名单。头像要显示出来，
 * 微信公众平台的「服务器域名」里 downloadFile 也得填上这个 API 域名 ——
 * 只配 request 的话，登录和上传都正常，但头像永远是裂的。
 */
export function mediaUrl(rel?: string): string {
  if (!rel) return '';
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${MEDIA_BASE}${rel.replace(/^\/+/, '')}`;
}

/* ── 微信登录 ─────────────────────────────────────────────────────────── */

/**
 * 取一次性登录凭证。
 *
 * `uni.login` 在 mp-weixin 上就是 `wx.login`：不弹授权窗、不需要用户确认，
 * 静默拿一枚 code 换会话。这是微信小程序登录的标准姿势。
 *
 * 不传 provider：本项目只发微信小程序一个平台，微信里也只有一个登录提供方，
 * 传了只是多一个可能被校验的键。
 */
function loginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      success: (res) => {
        const code = res.code;
        if (!code) {
          reject(new ApiError('微信登录未返回凭证', 0));
          return;
        }
        resolve(code);
      },
      fail: () => reject(new ApiError('微信登录失败，请重试', 0)),
    });
  });
}

/**
 * 用一枚 code 换会话。
 *
 * 失败时把状态码原样抛出去：401 = code 无效 / 已用过 / 超时，
 * 429 = 触发限流，503 = 服务端没配 appid —— 三者的处置完全不同
 * （重试 / 退避 / 别重试），调用点要靠状态码分支。
 */
async function exchangeCode(code: string, nickname?: string): Promise<WechatLoginResponse> {
  const data: Record<string, unknown> = { code };
  // nickname 只在有值时带上。服务端对「昵称为空的老用户」忽略这个字段，
  // 对「没有昵称的新账号」才写入 —— 空串传过去和不传是同一件事，
  // 不传少一个字段，服务端的 max=200 校验也就少一个分支。
  if (nickname) data.nickname = nickname;

  return request<WechatLoginResponse>({
    url: 'v3/auth/wechat/login',
    method: 'POST',
    data,
  });
}

/**
 * 微信登录。
 *
 * 401 是唯一自动恢复的一类：code 一次性，重发同一个必然还是 401，
 * 所以重新取一枚 code 再试一次。
 *
 * 未注册的用户不需要先注册 —— 服务端在这次登录里自动建号。
 */
export async function wechatLogin(nickname?: string): Promise<WechatLoginResponse> {
  const code = await loginCode();

  try {
    return await exchangeCode(code, nickname);
  } catch (err) {
    if (!(err instanceof ApiError) || err.statusCode !== 401) throw err;

    const retryCode = await loginCode();
    return exchangeCode(retryCode, nickname);
  }
}

/* ── 错误文案 ─────────────────────────────────────────────────────────── */

/**
 * 登录失败时给用户看的文案。
 *
 * 分支的依据是**状态码**而不是 message —— 服务端的 message 随时可能改，
 * 而「这一类该怎么处置」是接口契约的一部分，不该跟着文案变：
 *
 * - 401：code 无效或已过期。已经自动重试过一次还是失败，换个说法让用户再点一次
 * - 429：触发频率限制。该退避，不该马上重试
 * - 502：微信侧繁忙。退避重试有用
 * - 503：服务端没配 appid/secret。**重试没用**，该说「功能没开放」
 */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.statusCode) {
      case 401:
        return '登录凭证已过期，请重试';
      case 429:
        return '操作太频繁，请稍后再试';
      case 502:
        return '微信服务繁忙，请稍后重试';
      case 503:
        return '微信登录暂未开放';
      default:
        return err.message;
    }
  }

  return err instanceof Error && err.message ? err.message : '登录失败，请重试';
}

/* ── token 续期 ───────────────────────────────────────────────────────── */

/**
 * 刷新中的那一次 Promise。
 *
 * 存在的理由是服务端**每次刷新都轮换 refresh token**，旧的立即失效。
 * 两个并发请求同时撞上 401，各自去刷新的话，第二个拿的是已经作废的那枚，
 * 会把整条链路卡死在这里。所以同一时刻只允许一个刷新在飞，后来者等它。
 */
let refreshPending: Promise<boolean> | null = null;

/**
 * 刷新 token。
 *
 * 成功就把两个 token 一起覆盖写 —— 只更新 access 会导致下次刷新失败，
 * 因为服务端比对的是 refresh 的**全值**。
 *
 * 失败则清掉整个会话：refresh 都换不动了，这一枚会话也就到头了，
 * 留着只会让下一次请求继续拿一枚过期 token 去撞 401。
 */
async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const data = await request<SessionTokens>({
      url: 'v3/refresh-token',
      method: 'POST',
      data: { refresh_token: refreshToken },
    });

    setToken(data.access_token);
    setRefreshToken(data.refresh_token);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

/**
 * 保证会话是新的。
 *
 * 已经在刷新中就直接等那一次，不并发第二个。
 */
function ensureFreshSession(): Promise<boolean> {
  if (refreshPending) return refreshPending;

  refreshPending = doRefresh().finally(() => {
    refreshPending = null;
  });

  return refreshPending;
}

/**
 * 带会话的请求：401 时静默刷新并重试一次。
 *
 * 只重试一次 —— 刷新之后还是 401，说明这枚会话真的不行了，
 * 再重试只是把同一个错误抛三遍。
 */
export async function withSession<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ApiError) || err.statusCode !== 401) throw err;
    if (!(await ensureFreshSession())) throw err;
    return fn();
  }
}

/* ── 资料 ─────────────────────────────────────────────────────────────── */

/** 取当前用户。响应与登录响应里的用户字典同形 */
export function getMe(): Promise<AuthUser> {
  return withSession(() => request<AuthUser>({ url: 'v3/me' }));
}

/**
 * 退出登录。
 *
 * refresh token 放在 body 里：服务端从这个值解析出会话 id 并吊销这一台设备。
 * 小程序端收不到 HttpOnly cookie，不放 body 服务端就不知道要吊销哪个会话。
 */
export function logout(): Promise<void> {
  return withSession(() =>
    request<void>({
      url: 'v3/logout',
      method: 'POST',
      data: { refresh_token: getRefreshToken() },
    }),
  );
}

/* ── 头像上传 ─────────────────────────────────────────────────────────── */

/**
 * 服务端只认这四种图片类型。multipart part 的 Content-Type 是从**文件名
 * 扩展名**推出来的，所以路径的扩展名必须落在这一档里。
 */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

/**
 * 小程序的本地持久化目录。
 *
 * 不同基础库把它挂在不同的地方，所以两处都探一下；都拿不到就返回空串，
 * 调用方据此放弃复制、直接传原路径（见 resolveUploadPath 的注释）。
 */
function userDataPath(): string {
  const uniEnv = (uni as unknown as { env?: { USER_DATA_PATH?: string } }).env;
  if (uniEnv?.USER_DATA_PATH) return uniEnv.USER_DATA_PATH;

  const wxApi = (globalThis as { wx?: { env?: { USER_DATA_PATH?: string } } }).wx;
  return wxApi?.env?.USER_DATA_PATH ?? '';
}

/**
 * 复制成 `.jpg` 结尾的临时文件。
 *
 * 拿不到本地持久化目录、或者这个基础库没有文件系统管理器，就放弃 ——
 * 返回空串，调用方直接传原路径。头像能不能传上去，不该取决于这一段
 * 兼容性代码能不能跑通。
 */
function copyAsJpg(tempPath: string): Promise<string> {
  const base = userDataPath();
  if (!base) return Promise.resolve('');

  const getFs = (uni as unknown as { getFileSystemManager?: () => unknown }).getFileSystemManager;
  if (typeof getFs !== 'function') return Promise.resolve('');

  return new Promise((resolve) => {
    let fs: {
      copyFile?: (option: Record<string, unknown>) => void;
    };
    try {
      fs = getFs.call(uni) as typeof fs;
    } catch {
      resolve('');
      return;
    }
    if (typeof fs?.copyFile !== 'function') {
      resolve('');
      return;
    }

    const dest = `${base}/avatar-${Date.now()}.jpg`;

    fs.copyFile({
      // 两套字段名都给：微信的 FileSystemManager 认 fromPath/toPath，
      // uni-app 的类型声明用的是 srcPath/destPath。多给的键会被忽略，
      // 少给的键会让复制静默失败 —— 宁可多给。
      fromPath: tempPath,
      toPath: dest,
      srcPath: tempPath,
      destPath: dest,
      success: () => resolve(dest),
      // 复制失败不致命：下面还有直接传原路径这一条路
      fail: () => resolve(''),
    });
  });
}

/**
 * 决定上传用哪个路径。
 *
 * `chooseAvatar` 给的临时地址一般已经带 `.jpeg` 之类的扩展名，微信据此把
 * multipart part 的 Content-Type 设成 `image/jpeg`，服务端直接认。
 *
 * 但部分基础库版本会把临时文件送成 `application/octet-stream`，服务端不认
 * 就回 400「不支持的图片类型」。这种情况的成因是**文件名没有可识别的扩展名**
 * （微信靠扩展名推类型），所以扩展名不在白名单时，复制一份 `.jpg` 再传。
 *
 * ⚠️ 临时地址只有 1–5 分钟有效，复制和上传必须当场合做完，不能攒着。
 */
async function resolveUploadPath(tempPath: string): Promise<string> {
  if (IMAGE_EXT.test(tempPath)) return tempPath;

  const copied = await copyAsJpg(tempPath);
  return copied || tempPath;
}

/**
 * 上传头像。
 *
 * 表单字段名固定是 `image`（写错服务端回 400「未收到上传图片」）。
 * 成功返回**完整的用户字典**（含新的 photo），直接覆盖本地用户状态即可。
 */
export async function uploadAvatar(filePath: string): Promise<AuthUser> {
  const path = await resolveUploadPath(filePath);
  const base = ENV.apiBaseUrl.replace(/\/+$/, '');

  return withSession(
    () =>
      new Promise<AuthUser>((resolve, reject) => {
        uni.uploadFile({
          url: `${base}/v3/upload-pic`,
          filePath: path,
          name: 'image',
          header: { Authorization: `Bearer ${getToken()}` },
          success: (res) => {
            let envelope: ApiEnvelope<AuthUser> | undefined;
            try {
              envelope = JSON.parse(res.data) as ApiEnvelope<AuthUser>;
            } catch {
              envelope = undefined;
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(envelope?.data as AuthUser);
              return;
            }

            reject(
              new ApiError(
                envelope?.message || STATUS_TEXT[res.statusCode] || `上传失败（${res.statusCode}）`,
                res.statusCode,
              ),
            );
          },
          fail: () => reject(new ApiError('网络异常，请检查网络连接', 0)),
        });
      }),
  );
}
