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
import type { WeatherGroup } from '@/types/view';

/** 地点标签选点失败时的说法 */
export const HERO_PICK_FAILED = '选点失败，请重试';

/** 弧形表的边长与线宽（rpx） */
export const HERO_GAUGE_SIZE = 300;
export const HERO_GAUGE_STROKE = 25;

/** 头图在 CDN 上的目录 */
const HERO_IMAGE_DIR = `${ENV.cdnBaseUrl}/weather`;

/**
 * 头图版本号，落在文件名里。
 *
 * CDN 与客户端都按 URL 缓存 —— 换图不换名，旧图会一直发下去，
 * 改文件内容对两边都没用。版本号是唯一可靠的破缓存手段。
 *
 * 换图时 +1，并同步改 scripts/optimize-assets.py 里那四张的文件名。
 */
const HERO_IMAGE_VERSION = 'v2';

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

/**
 * 天色 → 头图地址。
 *
 * 与 heroImageUrl 分开是因为有第二条取图路径：夜间模式下不用当前天色，
 * 直接指定某一张（见 WeatherHero 里的 sky）。
 */
export function heroImageUrlBySky(sky: HeroSky): string {
  return `${HERO_IMAGE_DIR}/hero-${sky}-${HERO_IMAGE_VERSION}.jpg`;
}

/** 天气外观组 → 头图地址 */
export function heroImageUrl(group: WeatherGroup): string {
  return heroImageUrlBySky(heroSky(group));
}

/**
 * 鱼口概率色阶（弧形表的值弧）。
 *
 * 红 → 黄 → 绿：概率由低到高。
 *
 * 色阶是**按量程位置**取的 —— 值落在量程的哪一段，弧上那一段就是那个颜色。
 * 所以弧尖那一段的颜色直接说明概率落在哪一档：40 分是橙，70 分是黄绿，
 * 90 分是绿。不用再回头去看数字。
 *
 * 原来这弧是按等级词涂一整条（绿/蓝/橙/红/灰），颜色跟着 level 走 ——
 * 同一个词在两个页面上必须是同一个颜色，可这条弧画的是 0–100 的数，
 * 跟着词走就丢了数：分数从 62 涨到 68，弧一点没变。
 *
 * 这三个值是 canvas 颜色的**唯一出处** —— canvas 2d 不解析 SCSS 变量与
 * CSS 变量，SCSS 侧不抄它们（抄一份只会让人以为改那里就能改到 canvas）。
 * 红与绿跟语义色同值（$fish-destructive / $fish-success），黄是日照色那一档。
 */
export const HERO_GAUGE_STOPS: readonly string[] = [
  '#ff3b30', // = $fish-destructive
  '#ffd60a', // = $fish-sun-soft
  '#34c759', // = $fish-success
];

/**
 * 四种天色的兜底渐变。
 *
 * 头图在 CDN 上（图片加载的那一瞬会先露出这一层），
 * 所以它得跟图片是同一种天 —— 图与渐变分属两处时，
 * 加载完成的瞬间会闪一下别的颜色。
 *
 * 它跟天色映射、图片地址、版本号放在同一个文件里，是同一个决定的三个部分：
 * 「此刻是什么天」由这一份说了算。
 */
export const HERO_SKY_GRADIENTS: Readonly<Record<HeroSky, string>> = {
  sunny: 'linear-gradient(180deg, #bfe0f2 0%, #e7f3f6 46%, #7fd3d8 100%)',
  cloudy: 'linear-gradient(180deg, #9db6cc 0%, #cfd9e6 42%, #6d8fa8 100%)',
  rain: 'linear-gradient(180deg, #59697a 0%, #93a3ae 48%, #45535e 100%)',
  night: 'linear-gradient(180deg, #0a1a33 0%, #16365e 50%, #060f1e 100%)',
};
