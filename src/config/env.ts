/**
 * 环境配置统一出口
 *
 * 所有环境变量只能通过 import.meta.env 读取（小程序端没有 process.env），
 * 并在此处做一次类型收窄，避免各处散落着字符串比较。
 */

const env = import.meta.env;

/**
 * 静态资源 CDN 的默认基址。
 *
 * 为什么静态图要往 CDN 上搬：`src/static` 下的文件是**代码包的一部分**，
 * 跟着每个用户下载 —— 占位插画一张 158KB，主包上限 2MB，
 * 而它只在「这条钓点没有照片」时才出现，绝大多数会话根本用不上。
 * 搬到 CDN 之后，它不进包，只有真要用到的那一次会话才去拉。
 *
 * 同样有默认值：`.env.production` 是被 gitignore 的，
 * 只认环境变量的话，别人 clone 下来做生产构建会拿到空串。
 *
 * ⚠️ 这个域名必须在微信后台配成 **downloadFile 合法域名** ——
 * `<image>` 的网络图和 `canvas.createImage()` 的网络 src 都走这份名单，
 * 没配就是头图位置一块空白、海报上那块封面画不出来。
 */
const DEFAULT_CDN_BASE_URL = 'https://cdn.kanocifer.chat/yulu';

export const ENV = {
  /** 环境标识：development / production */
  appEnv: env.VITE_APP_ENV,
  /** 应用标题 */
  title: env.VITE_APP_TITLE,
  /** 接口基址，需在微信后台配置为 request 合法域名 */
  apiBaseUrl: env.VITE_API_BASE_URL,
  /**
   * 静态资源 CDN 基址。末尾不带斜杠，拼路径时自己加。
   *
   * 需在微信后台配置为 downloadFile 合法域名。
   */
  cdnBaseUrl: (env.VITE_CDN_BASE_URL || DEFAULT_CDN_BASE_URL).replace(/\/+$/, ''),
  /** 是否输出调试日志 */
  enableLog: env.VITE_ENABLE_LOG === 'true',
  /** 构建目标平台，例如 mp-weixin */
  platform: env.UNI_PLATFORM,
} as const;

/** 是否为生产构建 */
export const isProd = ENV.appEnv === 'production';

if (ENV.enableLog) {
  console.log(`[env] ${ENV.appEnv} → ${ENV.platform}, api: ${ENV.apiBaseUrl}`);
}
