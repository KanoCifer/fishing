/// <reference types="vite/client" />

declare module '*.vue' {
  import { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
/**
 * .env.* 中定义的变量类型声明
 * 读取方式：import.meta.env.VITE_APP_TITLE
 *
 * 注意：这些值会被编译进小程序包体，不要存放任何密钥。
 */
interface ImportMetaEnv {
  /** 环境标识：development / production */
  readonly VITE_APP_ENV: 'development' | 'production';
  /** 应用标题 */
  readonly VITE_APP_TITLE: string;
  /** 接口基址，需在微信后台配置为 request 合法域名 */
  readonly VITE_API_BASE_URL: string;
  /**
   * 和风天气图标字体的网络地址。
   *
   * 走 `wx.loadFontFace` 加载，这个域名必须在微信后台配成
   * **downloadFile 合法域名**，否则字体加载失败、天气图标全变豆腐块。
   */
  readonly VITE_QWEATHER_FONT_URL: string;
  /** 是否输出调试日志 */
  readonly VITE_ENABLE_LOG: string;
  /** 应用版本号，关于页显示。生产构建时由 .env.production 提供 */
  readonly VITE_YULU_VERSION?: string;
  /** uni-app 构建平台，例如 mp-weixin */
  readonly UNI_PLATFORM: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
