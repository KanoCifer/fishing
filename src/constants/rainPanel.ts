/**
 * 分钟级降水卡片的底纹图（走 CDN，不进代码包）。
 *
 * 这两张图不承载信息 —— 雨有多大由柱子说 —— 它们只给读数面一点天气的气氛：
 * 无雨是晴景，有雨是雨景。
 *
 * ⚠️ **CDN 域名必须在微信后台配成 downloadFile 合法域名**，
 * 没配的后果是底纹那块留一片纯渐变（不至于出错，只是少一层气氛）。
 *
 * 源图是 scripts/assets/weather/hero-{sunny,rain}-v2.jpg，产物由
 * `pnpm assets` 出到 CDN 暂存区（weather/panel-*-v1.jpg，各约 30KB），
 * 再上传到 `VITE_CDN_BASE_URL` 下 —— 为什么不直接用那两张 2MB 的头图，
 * 见 scripts/optimize-assets.py 里那两条 job 的理由。
 */

import { ENV } from '@/config/env';

const PANEL_IMAGE_DIR = `${ENV.cdnBaseUrl}/weather`;

/**
 * 底纹图地址。
 *
 * 干态（整段 0）用晴景：那张图本来就是好天气，读数是 0 也是好天气。
 * 有降水用雨景。
 */
export const RAIN_PANEL_BG = {
  /** 无降水 */
  dry: `${PANEL_IMAGE_DIR}/panel-sunny-v1.jpg`,
  /** 有降水 */
  wet: `${PANEL_IMAGE_DIR}/panel-rain-v1.jpg`,
} as const;
