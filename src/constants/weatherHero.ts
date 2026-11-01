/**
 * 天气页头图（hero）—— 尺寸、天色映射与等级措辞。
 *
 * 这一层只放「与数据无关」的东西：组件里拿到的都是算好的值，
 * 模板不再做判断，改动也只落在这一个文件里。
 *
 * 头图本身在 CDN 上（不进代码包 —— 主包余量放不下四张图，
 * 见 scripts/optimize-assets.py 里那四条 job）。
 */

import { ENV } from '@/config/env';
import type { Tone, WeatherGroup } from '@/utils/weather';

/** 弧形表的边长与线宽（rpx） */
export const HERO_GAUGE_SIZE = 360;
export const HERO_GAUGE_STROKE = 22;

/** 头图在 CDN 上的目录 */
const HERO_IMAGE_DIR = `${ENV.cdnBaseUrl}/weather`;

/**
 * 头图只有四种天色。
 *
 * 雪、雨夹雪、雾霾、扬沙、高温、严寒与未知都落回「多云」那张 ——
 * 那是中性的一天，不该被说成什么特别的天。分组口径与 utils/weather 的
 * weatherGroup 一致（那十种外观组），这里只把十种收到四种画面上。
 */
export type HeroSky = 'sunny' | 'cloudy' | 'rain' | 'night';

const SKY_BY_GROUP: Readonly<Record<WeatherGroup, HeroSky>> = {
  sunny: 'sunny',
  cloudy: 'cloudy',
  night: 'night',
  rain: 'rain',
  snow: 'cloudy',
  sleet: 'cloudy',
  dust: 'cloudy',
  hot: 'cloudy',
  cold: 'cloudy',
  generic: 'cloudy',
};

/** 天气外观组 → 天色 */
export function heroSky(group: WeatherGroup): HeroSky {
  return SKY_BY_GROUP[group];
}

/** 天气外观组 → 头图地址 */
export function heroImageUrl(group: WeatherGroup): string {
  return `${HERO_IMAGE_DIR}/hero-${heroSky(group)}.jpg`;
}

/**
 * 暗天：夜与雨。
 *
 * 暗天上压白字、压深面；亮天（晴、多云及落回多云的那几组）压深墨、压白面。
 * 同一页两套，不给每种天气各写一份规则。
 */
export function heroDarkSky(group: WeatherGroup): boolean {
  const sky = heroSky(group);
  return sky === 'night' || sky === 'rain';
}

/**
 * 等级色（弧形表用）。
 *
 * ⚠️ 这些值必须与 src/styles/tokens/_color.scss 的同名档位一致 ——
 * canvas 2d 不解析 SCSS 变量，两边只能手工对齐（改色时一起改）。
 *
 * 用的是**填充档**（亮的那一档）：弧是图形信号，要从画面里跳出来；
 * 等级词的深档是给文字用的，两档不是一回事。
 */
export const HERO_TONE_FILL: Readonly<Record<Tone, string>> = {
  success: '#34c759', // $fish-success
  blue: '#0f66d6', // $fish-blue
  warning: '#ff9500', // $fish-warning
  destructive: '#ff3b30', // $fish-destructive
  muted: '#8e8e93', // $fish-muted-fill
};
