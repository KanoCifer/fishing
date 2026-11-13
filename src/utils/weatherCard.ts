/**
 * 卡片天气态 —— 一段天气在这张卡上是什么样子。
 *
 * 两件事各自有主语，缺一不可：
 *   · 天色（sky）—— 这一天的天本身，是哪一段蓝/灰；
 *   · 待机动作（idle）—— 图标自己怎么动。
 *
 * 图标用 Meteocons 的彩色插画，不用描边字形：整页其它地方（逐时预报、
 * 多日预报、头图）都是这一批图标，卡片换成另一套反而像贴错了。
 */

import type { WeatherCodeIconSlug } from '@/constants/weatherIcons';

/**
 * 卡片天色。六档。
 *
 * 档名与 `tokens/_color.scss` 的 `$fish-card-sky` 是同一份清单的两面 ——
 * TS 读不到 Sass，Sass 读不到 TS，两边只能各写一份。
 * 加一档天色：这里加一项，那张表加一行。
 */
export type CardSky = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'night';

/**
 * 图标的待机动作。
 *
 * 每个值都要有对应的样式类（见 WeatherDaySwitcher 的 IDLE_CLASS 与它的样式）——
 * 多一个值而样式里没有那条，动画会静默消失。
 */
export type GlyphIdle = 'spin' | 'float' | 'flicker';

/**
 * 待机动作 → 样式类。
 *
 * 类名与 WeatherDaySwitcher 的样式一一对应 —— 多一个动作而样式里没有那条，
 * 动画会静默消失：编译不报错，界面上只是图标不转了。
 */
export const IDLE_CLASS: Record<GlyphIdle, string> = {
  spin: 'wxs__icon-img--spin',
  float: 'wxs__icon-img--float',
  flicker: 'wxs__icon-img--flicker',
};

export interface CardWeatherState {
  /** 天色 */
  sky: CardSky;
  /** 待机动作 */
  idle: GlyphIdle;
}

/**
 * 每一段天色自己的叠层。
 *
 * 雨丝与闪电跟着天色走，不跟着图标走：雷阵雨与普通阵雨在图标上分得开，
 * 在天上是一段天 —— 雨丝该在哪一段天里下，是天的事。
 */
export interface CardSkyLayer {
  /** 雨丝 */
  rain: boolean;
  /** 闪电 */
  flash: boolean;
}

export const CARD_SKIES: Record<CardSky, CardSkyLayer> = {
  clear: { rain: false, flash: false },
  cloudy: { rain: false, flash: false },
  rain: { rain: true, flash: false },
  storm: { rain: true, flash: true },
  snow: { rain: false, flash: false },
  night: { rain: false, flash: false },
};

/**
 * 每一枚图标在这张卡上的样子。
 *
 * 表是**完备**的：键就是全部天气图标名（Record 而不是 Partial），
 * 少给一枚定不下来，类型检查当场报 —— 漏掉的那一枚会落回兜底天色，
 * 而兜底天色读不出是什么天。
 */
const STATES: Record<WeatherCodeIconSlug, CardWeatherState> = {
  'clear-day': { sky: 'clear', idle: 'spin' },
  'sun-hot': { sky: 'clear', idle: 'float' },
  'partly-cloudy-day': { sky: 'clear', idle: 'float' },
  cloudy: { sky: 'cloudy', idle: 'float' },
  overcast: { sky: 'cloudy', idle: 'float' },
  'clear-night': { sky: 'night', idle: 'float' },
  'partly-cloudy-night': { sky: 'night', idle: 'float' },
  drizzle: { sky: 'rain', idle: 'float' },
  rain: { sky: 'rain', idle: 'float' },
  sleet: { sky: 'rain', idle: 'float' },
  hail: { sky: 'rain', idle: 'float' },
  snow: { sky: 'snow', idle: 'float' },
  snowflake: { sky: 'snow', idle: 'float' },
  thunderstorms: { sky: 'storm', idle: 'flicker' },
  'thunderstorms-hail': { sky: 'storm', idle: 'flicker' },
  mist: { sky: 'cloudy', idle: 'float' },
  fog: { sky: 'cloudy', idle: 'float' },
  haze: { sky: 'cloudy', idle: 'float' },
  dust: { sky: 'cloudy', idle: 'float' },
};

/** 图标名（Meteocons 字形）→ 卡片天气态 */
export function cardWeatherState(slug: WeatherCodeIconSlug): CardWeatherState {
  return STATES[slug];
}
