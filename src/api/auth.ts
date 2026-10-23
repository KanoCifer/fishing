/**
 * 账号网关 —— 微信登录、资料读取、头像上传。
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
 *
 * 第 3 条那套刷新机制本身在 `api/client` 的 withSession 里 —— 那是传输层的事，
 * 不该由「账号」这个域来管。媒体上传与媒体地址同理，在 `api/upload`。
 */

import { ENV } from '@/config/env';
import type { AuthUser, WechatLoginResponse } from '@/types/auth';
import {
  ApiError,
  STATUS_TEXT,
  ensureTokensLoaded,
  getRefreshToken,
  getToken,
  request,
  withSession,
  type ApiEnvelope,
} from './client';
import { resolveUploadPath } from './upload';

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
 *
 * 先 await ensureTokensLoaded：refresh token 是从 Storage 异步读进内存的，
 * 刚启动还没读完时直接取会拿到空串，服务端就吊销不掉任何会话。
 */
export async function logout(): Promise<void> {
  await ensureTokensLoaded();

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
 * 上传头像。
 *
 * 表单字段名固定是 `image`（写错服务端回 400「未收到上传图片」）。
 * 成功返回**完整的用户字典**（含新的 photo），直接覆盖本地用户状态即可。
 *
 * 路径补扩展名那一步走 `api/upload` 的 resolveUploadPath —— 头像和照片
 * 是同一个问题：微信靠扩展名推 multipart part 的 Content-Type。
 */
export async function uploadAvatar(filePath: string): Promise<AuthUser> {
  // 同 logout：token 是异步读进内存的，上传前要确保已经读到
  await ensureTokensLoaded();

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
