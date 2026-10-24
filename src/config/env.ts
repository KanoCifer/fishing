/**
 * 环境配置统一出口
 *
 * 所有环境变量只能通过 import.meta.env 读取（小程序端没有 process.env），
 * 并在此处做一次类型收窄，避免各处散落着字符串比较。
 */

const env = import.meta.env;

/**
 * 和风天气图标字体的默认地址。
 *
 * 为什么要有默认值而不是只靠环境变量：`.env.production` 是被 gitignore 的
 * （见 .gitignore 末行），所以别人 clone 下来做生产构建时，那里根本没有这个变量 ——
 * 只认环境变量的话，那份构建出来的包会一个图标都画不出来。
 *
 * 默认值指向自建 CDN（`cdn.kanocifer.chat`）而不是 jsdelivr：静态图已经在用这个
 * 域名，它必然已在微信后台配成 downloadFile 合法域名，字体换过去是零配置成本；
 * jsdelivr 则要单独占一次合法域名名额 + 一个预解析名额，而预解析总共只给 5 个。
 */
const DEFAULT_QWEATHER_FONT_URL = 'https://cdn.kanocifer.chat/qweather-icons.woff';

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
   * 和风天气图标字体的网络地址。
   *
   * 走 `wx.loadFontFace` 加载，所以这个域名必须在微信后台配成
   * **downloadFile 合法域名**，否则字体加载失败、页面上所有天气图标变成豆腐块。
   *
   * 默认值是自建 CDN 上的全量字体（WOFF，73 KB，与 `qweather-icons@1.8.0` 字节一致）。
   * 还没换子集：`scripts/subset-qweather-icons.py --ttf-out` 能导 27 KB 子集，
   * 野外弱网下这个差值是实打实的首屏等待，但换文件必须重算码位映射表。
   */
  qweatherFontUrl: env.VITE_QWEATHER_FONT_URL || DEFAULT_QWEATHER_FONT_URL,
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
