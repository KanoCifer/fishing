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
 * 接口基址只从 `ENV.apiBaseUrl` 读，不在调用点写死域名 —— 见 `src/config/env.ts`。
 */

import { ENV } from '@/config/env'

/** token 在本地存储中的键 */
const TOKEN_KEY = 'fishing_token'

/** 与源项目 apiClient 的 10s 对齐 */
const DEFAULT_TIMEOUT = 10000

/**
 * 后端统一响应信封。
 *
 * uni.request 的 success 回调把响应体塞在 `res.data`，但官方类型标成 `any`，
 * 这里按实际形状收窄后再往下传，不让 any 渗进业务代码。
 */
interface ApiEnvelope<T> {
  message?: string
  data: T
  code?: number
  errors?: Record<string, unknown>
}

/** HTTP 状态码 → 兜底文案。后端没给 message 时用 */
const STATUS_TEXT: Record<number, string> = {
  400: '请求参数有误',
  401: '登录状态已失效，请重新进入',
  403: '没有权限执行该操作',
  404: '请求的内容不存在',
  429: '操作太频繁，请稍后再试',
  500: '服务器开小差了，请稍后再试',
  502: '网关异常，请稍后再试',
  503: '服务暂不可用，请稍后再试',
  504: '网关超时，请稍后再试',
}

/**
 * 请求失败。
 *
 * `statusCode` 为 0 表示请求根本没到服务端（断网、超时、域名没配），
 * 和服务端返回的业务错误是两回事 —— 前者提示"检查网络"，后者提示具体问题。
 */
export class ApiError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

export function getToken(): string {
  try {
    const stored = uni.getStorageSync(TOKEN_KEY)
    return typeof stored === 'string' ? stored : ''
  } catch {
    return ''
  }
}

export function setToken(token: string): void {
  if (token) {
    uni.setStorageSync(TOKEN_KEY, token)
  } else {
    uni.removeStorageSync(TOKEN_KEY)
  }
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
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'

type QueryValue = string | number | boolean | undefined | null

export interface RequestOptions {
  /** 相对路径，不带基址，如 `v2/fishing/index` */
  url: string
  method?: HttpMethod
  /** 请求体。GET 时 uni 会把它拼到 query 上，所以 GET 的参数走 params 更清楚 */
  data?: Record<string, unknown>
  params?: Record<string, QueryValue>
  timeout?: number
}

/**
 * 拼查询串。
 * 空值（undefined / null / 空串）的键直接丢掉 —— 不丢的话会拼出 `enriched=undefined`，
 * 后端拿到的是字符串 "undefined"，不会报错但结果不对，是很难查的一类坑。
 */
function withQuery(url: string, params?: Record<string, QueryValue>): string {
  if (!params) return url

  const parts: string[] = []
  Object.keys(params).forEach((key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') return
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  })

  return parts.length > 0 ? `${url}?${parts.join('&')}` : url
}

/** 统一走这一层发请求。resolve 出去的是信封里的 `data`，调用点拿到的就是业务对象 */
export function request<T>(options: RequestOptions): Promise<T> {
  const {
    url,
    method = 'GET',
    data,
    params,
    timeout = DEFAULT_TIMEOUT,
  } = options

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = getToken()
  if (token) {
    header.Authorization = `Bearer ${token}`
  }

  const base = ENV.apiBaseUrl.replace(/\/+$/, '')
  const fullUrl = withQuery(`${base}/${url.replace(/^\/+/, '')}`, params)

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: fullUrl,
      method,
      data,
      header,
      timeout,
      // 显式指定，否则后端漏发 Content-Type 时拿到的是字符串，res.data.data 直接是 undefined
      dataType: 'json',
      success: (res) => {
        const envelope = res.data as ApiEnvelope<T> | undefined

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(envelope?.data as T)
          return
        }

        reject(
          new ApiError(
            envelope?.message ||
              STATUS_TEXT[res.statusCode] ||
              `请求失败（${res.statusCode}）`,
            res.statusCode,
          ),
        )
      },
      fail: (err) => {
        // fail 是网络层失败，压根没有 HTTP 响应体，errMsg 里没有可读的业务信息
        const message = /timeout/i.test(err.errMsg)
          ? '请求超时，请检查网络'
          : '网络异常，请检查网络连接'

        if (ENV.enableLog) {
          console.warn('[api] 请求未到达服务端', fullUrl, err.errMsg)
        }

        // statusCode 0：标记为"没到服务端"，调用方可据此区分提示文案
        reject(new ApiError(message, 0))
      },
    })
  })
}
