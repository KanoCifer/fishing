/**
 * 环境配置统一出口
 *
 * 所有环境变量只能通过 import.meta.env 读取（小程序端没有 process.env），
 * 并在此处做一次类型收窄，避免各处散落着字符串比较。
 */

const env = import.meta.env

export const ENV = {
  /** 环境标识：development / production */
  appEnv: env.VITE_APP_ENV,
  /** 应用标题 */
  title: env.VITE_APP_TITLE,
  /** 接口基址，需在微信后台配置为 request 合法域名 */
  apiBaseUrl: env.VITE_API_BASE_URL,
  /** 是否输出调试日志 */
  enableLog: env.VITE_ENABLE_LOG === 'true',
  /** 构建目标平台，例如 mp-weixin */
  platform: env.UNI_PLATFORM,
} as const

/** 是否为生产构建 */
export const isProd = ENV.appEnv === 'production'

if (ENV.enableLog) {
  console.log(`[env] ${ENV.appEnv} → ${ENV.platform}, api: ${ENV.apiBaseUrl}`)
}
