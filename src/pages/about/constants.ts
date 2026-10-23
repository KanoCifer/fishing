/**
 * 关于页的常量 —— 只放这一页用得着的那些。
 *
 * 为什么地址不写在组件里：地址会变（换 CDN 域名、换文件名），
 * 而组件只该管渲染。改地址的人不该先打开组件去找一行字符串。
 */

import { ENV } from '@/config/env';

/**
 * 应用图标（走 CDN）。
 *
 * **为什么不在代码包里**：`src/static/` 下的文件跟着每个用户下载，
 * 而 logo 只在关于页顶部露一次面 —— 绝大多数会话压根不会打开那一页。
 * 15KB 换一次按需请求，划算。
 *
 * ⚠️ CDN 域名必须在微信后台配成 **downloadFile 合法域名**，
 * 没配就是关于页顶部空一块（`<image>` 拉不到图，不报错，只是白）。
 *
 * 源图在 `scripts/assets/logo.png`，产物由 `pnpm assets` 出到 CDN 暂存区
 * （`scripts/assets/cdn/`），再上传到 `VITE_CDN_BASE_URL` 下 ——
 * 换格式之前先读 `scripts/optimize-assets.py` 里的理由。
 */
export const APP_LOGO = `${ENV.cdnBaseUrl}/logo.webp`;
