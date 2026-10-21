/**
 * 媒体网关 —— 上传图片，以及把媒体相对路径拼成能加载的地址。
 *
 * 这两件事放在一个文件里，是因为它们是同一件事的两头：
 * 上传拿回来的是「相对路径」，显示时要把它变成「能加载的地址」。
 * 拆到两处，就容易出现「存的时候记了一种形态、读的时候按另一种形态拼」
 * 这种对不上的 bug —— 而且这种 bug 只在真机上显形。
 *
 * 服务端契约（`Server-Go/internal/handler/upload_handler.go`）：
 * - `POST /v3/upload`，multipart 字段 `file`（文件）+ `type`（用途）
 * - `type` 只认 `blog` / `gallery` / 空串（走 generic），其余一律 400
 * - 返回 `{ url: "/v3/media/" + rel, filename: rel }`
 *
 * ⚠️ **`url` 已经带了 `/v3/media/` 前缀，而 `mediaUrl()` 会再拼一次** ——
 * 存进数据的必须是 `filename`（rel 本身），用 `url` 会得到
 * `…/v3/media//v3/media/…` 这种双前缀地址。
 *
 * 为什么存相对路径而不是完整 URL：部署域名是客户端配置项
 * （见 `src/config/env.ts`），把域名烤进数据等于把一份部署拓扑写死进库里，
 * 换域名时所有已存的图片一起失效。服务端自己也是这么做的
 * （见 upload_handler 里 UploadDraftAsset 的注释）。
 */

import { ENV } from '@/config/env';
import { ApiError, STATUS_TEXT, getToken, withSession, type ApiEnvelope } from './client';

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
 * 服务端回的是**相对路径**（如 `gallery/42/xxx.jpg`），
 * 直接当 src 用会 404。已经带 http 前缀的原样返回。
 *
 * ⚠️ 部署提醒：小程序加载远程图片走的是 **downloadFile 合法域名**，
 * 跟 request / uploadFile 是三份独立的名单。钓点照片要显示出来，
 * 微信公众平台的「服务器域名」里 downloadFile 也得填上这个 API 域名 ——
 * 只配 request 的话，登录和上传都正常，但照片永远是裂的。
 */
export function mediaUrl(rel?: string): string {
  if (!rel) return '';
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${MEDIA_BASE}${rel.replace(/^\/+/, '')}`;
}

/* ── 上传 ─────────────────────────────────────────────────────────────── */

/**
 * 上传类型 —— 对应服务端 multipart 字段 `type`。
 *
 * `gallery` 会校验 Content-Type 白名单（jpeg / png / gif / webp / exif），
 * `generic` **只限大小不认类型**。用户选的是照片，认类型的那条路才对。
 */
export type UploadType = 'gallery' | 'blog' | 'generic';

/** 上传结果。字段名与服务端返回的一致 */
export interface UploadResult {
  /** 带 `/v3/media/` 前缀的相对地址。**别直接存进数据** —— 用 filename */
  url: string;
  /** 相对 UploadDir 的路径，`mediaUrl()` 吃这个 */
  filename: string;
}

/**
 * 服务端只认这几种图片类型。multipart part 的 Content-Type 是从**文件名
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
 * 拿不到本地持久化目录、或者这个基础库没有文件系统管理器，就放弃 —
 * 返回空串，调用方直接传原路径。照片能不能传上去，不该取决于这一段
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

    const dest = `${base}/upload-${Date.now()}.jpg`;

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
 * 选图 API 给的临时地址一般已经带 `.jpeg` 之类的扩展名，微信据此把
 * multipart part 的 Content-Type 设成 `image/jpeg`，服务端直接认。
 *
 * 但部分基础库版本会把临时文件送成 `application/octet-stream`，服务端不认
 * 就回 400「不支持的图片类型」。这种情况的成因是**文件名没有可识别的扩展名**
 * （微信靠扩展名推类型），所以扩展名不在白名单时，复制一份 `.jpg` 再传。
 *
 * ⚠️ 临时地址只有 1–5 分钟有效，复制和上传必须当场合做完，不能攒着。
 */
export async function resolveUploadPath(tempPath: string): Promise<string> {
  if (IMAGE_EXT.test(tempPath)) return tempPath;

  const copied = await copyAsJpg(tempPath);
  return copied || tempPath;
}

/**
 * 上传一张图片。
 *
 * 表单字段名固定是 `file`（写错服务端回 400「未收到上传文件」），
 * 用途走 `type` 字段。
 *
 * 返回的是**服务端相对路径**（`filename`），调用方自己决定怎么存 ——
 * 钓点存进 `images` 字段，渲染时过 `mediaUrl()`。
 */
export async function uploadImage(filePath: string, type: UploadType = 'gallery'): Promise<UploadResult> {
  const path = await resolveUploadPath(filePath);
  const base = ENV.apiBaseUrl.replace(/\/+$/, '');

  return withSession(
    () =>
      new Promise<UploadResult>((resolve, reject) => {
        uni.uploadFile({
          url: `${base}/v3/upload`,
          filePath: path,
          name: 'file',
          formData: { type },
          header: { Authorization: `Bearer ${getToken()}` },
          success: (res) => {
            let envelope: ApiEnvelope<UploadResult> | undefined;
            try {
              envelope = JSON.parse(res.data) as ApiEnvelope<UploadResult>;
            } catch {
              envelope = undefined;
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(envelope?.data as UploadResult);
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
