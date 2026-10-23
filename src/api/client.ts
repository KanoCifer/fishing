/**
 * 网络层 —— uni.request 封装。
 *
 * 存在的意义不是"包一层"，而是收掉三件在小程序端必须显式处理、浏览器端看不见的事：
 *
 * 1. 响应信封。后端统一返回 `{ message, data }`，每个调用点自己剥 data 会漏。
 * 2. 错误语义。uni.request 的 `fail` 回调和 HTTP 4xx/5xx 走的是两条完全不同的分支，
 *    不合并的话每个调用点都得写两遍错误处理。
 * 3. 鉴权头。小程序没有 cookie，token 只能自己存自己带。
 *
 * 第四件也收在这里：**401 静默刷新**（见下方 withSession）。它属于传输层 ——
 * 撞上 401 就该自己处理掉，而不是让每个调用点各写一遍「刷新 → 重试」。
 *
 * 接口基址只从 `ENV.apiBaseUrl` 读，不在调用点写死域名 —— 见 `src/config/env.ts`。
 */

import { ENV } from '@/config/env';
import type { SessionTokens } from '@/types/auth';
import { readStorage, removeStorage, writeStorage } from '@/utils/storage';

/** access token 在本地存储中的键 */
const TOKEN_KEY = 'fishing_token';

/** refresh token 在本地存储中的键 */
const REFRESH_TOKEN_KEY = 'fishing_refresh_token';

/** 与源项目 apiClient 的 10s 对齐 */
const DEFAULT_TIMEOUT = 10000;

/**
 * 后端统一响应信封。
 *
 * uni.request 的 success 回调把响应体塞在 `res.data`，但官方类型标成 `any`，
 * 这里按实际形状收窄后再往下传，不让 any 渗进业务代码。
 */
export interface ApiEnvelope<T> {
  message?: string;
  data: T;
  code?: number;
  errors?: Record<string, unknown>;
}

/** HTTP 状态码 → 兜底文案。后端没给 message 时用 */
export const STATUS_TEXT: Record<number, string> = {
  400: '请求参数有误',
  401: '登录状态已失效，请重新进入',
  403: '没有权限执行该操作',
  404: '请求的内容不存在',
  429: '操作太频繁，请稍后再试',
  500: '服务器开小差了，请稍后再试',
  502: '网关异常，请稍后再试',
  503: '服务暂不可用，请稍后再试',
  504: '网关超时，请稍后再试',
};

/**
 * 请求失败。
 *
 * `statusCode` 为 0 表示请求根本没到服务端（断网、超时、域名没配），
 * 和服务端返回的业务错误是两回事 —— 前者提示"检查网络"，后者提示具体问题。
 */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * 取 access token。
 *
 * 走 `@/utils/storage` 而不是直接 `uni.getStorageSync`：
 * 拼 header、刷新守卫、恢复会话都要读它，一条链上会读好几遍同一个 key，
 * 缓存里留着那份就够了（见 storage.ts 的注释）。
 */
export function getToken(): string {
  const stored = readStorage(TOKEN_KEY);
  return typeof stored === 'string' ? stored : '';
}

export function setToken(token: string): void {
  if (token) {
    writeStorage(TOKEN_KEY, token);
  } else {
    removeStorage(TOKEN_KEY);
  }
}

/**
 * 取 refresh token。
 *
 * 小程序端 `wx.request` 不管理 cookie，服务端下发的 HttpOnly cookie 这边收不到，
 * 所以 refresh token 必须自己存在 Storage 里 —— 服务端的刷新接口是
 * 「body 优先、cookie 回退」，body 里必须带上它。
 */
export function getRefreshToken(): string {
  const stored = readStorage(REFRESH_TOKEN_KEY);
  return typeof stored === 'string' ? stored : '';
}

export function setRefreshToken(token: string): void {
  if (token) {
    writeStorage(REFRESH_TOKEN_KEY, token);
  } else {
    removeStorage(REFRESH_TOKEN_KEY);
  }
}

/**
 * 清掉整个会话。
 *
 * 两个 token 一起清 —— 只清 access 会留下一枚 refresh，下次进小程序会拿着
 * 一枚可能已被服务端轮换掉的 refresh 去刷新，然后卡在「刷新失败」上。
 */
export function clearSession(): void {
  removeStorage(TOKEN_KEY);
  removeStorage(REFRESH_TOKEN_KEY);
}

/**
 * 小程序端能发出去的 HTTP 方法。
 *
 * 这不是随手抄的类型定义，是微信的硬限制：`wx.request` 的 method 合法值只有
 * OPTIONS / GET / HEAD / POST / PUT / DELETE / TRACE / CONNECT，**没有 PATCH**
 * （微信开放文档 wx.request → method → 合法值）。
 *
 * 浏览器端 axios 能发 PATCH，小程序端发不出去。看到后端有 PATCH 路由时，
 * 先想清楚这条能不能在小程序里被调用，再照着写。
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';

/** query 参数值 */
export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  /** 相对路径，不带基址，如 `v2/fishing/index` */
  url: string;
  method?: HttpMethod;
  /** 请求体。GET 时 uni 会把它拼到 query 上，所以 GET 的参数走 params 更清楚 */
  data?: Record<string, unknown>;
  params?: Record<string, QueryValue>;
  timeout?: number;
}

/**
 * 拼查询串。
 * 空值（undefined / null / 空串）的键直接丢掉 —— 不丢的话会拼出 `enriched=undefined`，
 * 后端拿到的是字符串 "undefined"，不会报错但结果不对，是很难查的一类坑。
 */
export function withQuery(url: string, params?: Record<string, QueryValue>): string {
  if (!params) return url;

  const parts: string[] = [];
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null || value === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });

  return parts.length > 0 ? `${url}?${parts.join('&')}` : url;
}

/** 统一走这一层发请求。resolve 出去的是信封里的 `data`，调用点拿到的就是业务对象 */
export function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, params, timeout = DEFAULT_TIMEOUT } = options;

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  const base = ENV.apiBaseUrl.replace(/\/+$/, '');
  const fullUrl = withQuery(`${base}/${url.replace(/^\/+/, '')}`, params);

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: fullUrl,
      method,
      data,
      header,
      timeout,
      // 显式指定，否则后端漏发 Content-Type 时拿到的是字符串，res.data.data 直接是 undefined
      dataType: 'json',
      // 微信的 enableHttp2 默认是 **false** —— 服务端支持 h2 不等于客户端会用。
      // 微信的「高性能模式」虽然会自动开 h2/h3，但官方写明只 Android 生效，
      // iOS 仍走 HTTP/1.1（基础库 3.5.0 起 Android 默认开，iOS 暂无支持）。
      // 这里显式打开，iOS 才用得上 h2 —— 多路复用省掉每次请求的握手与队头阻塞。
      //
      // ⚠️ 只有本文件的请求能开。`api/stream.ts` 的 SSE 走 chunked 传输编码，
      // 而 HTTP/2 协议禁止 chunked，那边已经显式写了 `enableHttp2: false` —— 别把这行复制过去。
      enableHttp2: true,
      success: (res) => {
        const envelope = res.data as ApiEnvelope<T> | undefined;

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(envelope?.data as T);
          return;
        }

        reject(
          new ApiError(
            envelope?.message || STATUS_TEXT[res.statusCode] || `请求失败（${res.statusCode}）`,
            res.statusCode,
          ),
        );
      },
      fail: (err) => {
        // fail 是网络层失败，压根没有 HTTP 响应体，errMsg 里没有可读的业务信息
        const message = /timeout/i.test(err.errMsg) ? '请求超时，请检查网络' : '网络异常，请检查网络连接';

        if (ENV.enableLog) {
          console.warn('[api] 请求未到达服务端', fullUrl, err.errMsg);
        }

        // statusCode 0：标记为"没到服务端"，调用方可据此区分提示文案
        reject(new ApiError(message, 0));
      },
    });
  });
}

/* ── token 续期 ─────────────────────────────────────────────────────────── */

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
 *
 * 写操作（新建钓点、上传图片）都要走这里：access token 是最容易过期的一枚，
 * 裸调 request 的话一次过期就变成用户眼前的失败。
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
