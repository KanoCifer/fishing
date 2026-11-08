/**
 * 天气页背景（backdrop）—— 背景天色与量表。
 *
 * 这一层只放「与数据无关」的东西：组件里拿到的都是算好的值，
 * 模板不再做判断，改动也只落在这一个文件里。
 *
 * 背景是渐变，不是图：没有网络请求，没有满幅图解码，换天色时也不闪。
 * 原来的十一张天空照片（CDN 上的与 scripts/assets/weather/ 里的源图）
 * 与那批 job 一并撤下了 —— 照片层要回来时从这一份重新配。
 */

import type { WeatherGroup } from '@/types/view';

/** 地点标签选点失败时的说法 */
export const HERO_PICK_FAILED = '选点失败，请重试';

/**
 * 鱼口概率环的边长与线宽（rpx）。
 *
 * 头图里那一圈是整圈的进度环（components/ProgressRing），
 * 不是弧形表 —— 弧形表留给了潮位那一块（components/TideGauge）。
 */
export const HERO_RING_SIZE = 156;
export const HERO_RING_STROKE = 16;

/**
 * 背景档位 = 天气外观组（十一种，见 utils/weather 的 weatherGroup）。
 *
 * 十一档各一段天色，一一对应，不做二次归并：阴、雨、雪、雾霾、高温、
 * 严寒各有各的天空，归到「多云」那段就是拿一段天说十一种天。
 *
 * 深色模式是另一条路径：那时不看当前天气，一律走 night（见 useWeatherBackdrop）。
 */
export type HeroBackdrop = WeatherGroup;

/**
 * 十一档天色的背景渐变。
 *
 * 整页底色由这一份说了算：照片撤下之后，渐变不再只是图片加载前的那层占位，
 * 它就是背景本身。
 *
 * 每一档都是**一段天空**：深色在上、亮色在下 —— 与原来那张天空图的光一致。
 * 十一种天色各有各的那一段：阴天是压实的灰，与多云的浅蓝不是一件事。
 * 背景不带具体景色（没有山、没有水、没有地平线）—— 天气页走的是
 * 「此刻这片天」，不是「某个地方的那张风景照」。
 *
 * 十一档共用一套骨架：178deg、六个色标、色标位置都一样
 * （0 / 20 / 42 / 62 / 78 / 100%）。同一套骨架是「同一种天」的前提 ——
 * 换档换的是颜色，不是结构。
 *
 * 顶部压得深：顶部的读数（温度、仪表、地点胶囊）是白字，底要够深才立得住。
 */
export const HERO_BACKDROP_GRADIENTS: Readonly<Record<HeroBackdrop, string>> = {
  sunny: 'linear-gradient(178deg, #0a1c3d 0%, #123a6b 20%, #1d5b91 42%, #2f7fb5 62%, #5aa8cf 78%, #8fc9dc 100%)',
  cloudy: 'linear-gradient(178deg, #131f33 0%, #22344e 20%, #36506f 42%, #50708f 62%, #7893ae 78%, #a5b9c9 100%)',
  overcast: 'linear-gradient(178deg, #16191d 0%, #262a2f 20%, #3a4046 42%, #535b63 62%, #717a83 78%, #99a2aa 100%)',
  night: 'linear-gradient(178deg, #02050c 0%, #050c1c 20%, #091529 42%, #0d2040 62%, #122c53 78%, #183a68 100%)',
  rain: 'linear-gradient(178deg, #0d141c 0%, #1a2734 20%, #2b3e4f 42%, #3f5769 62%, #5c7889 78%, #85a0b0 100%)',
  snow: 'linear-gradient(178deg, #1a2530 0%, #2c3b4a 20%, #43576a 42%, #62788c 62%, #8ba1b4 78%, #a9bcc9 100%)',
  sleet: 'linear-gradient(178deg, #121a24 0%, #1f2d3a 20%, #334756 42%, #4b6171 62%, #6a8191 78%, #8fa3b3 100%)',
  dust: 'linear-gradient(178deg, #241a11 0%, #332515 20%, #443320 42%, #56442c 62%, #6a5638 78%, #8a7150 100%)',
  hot: 'linear-gradient(178deg, #17233b 0%, #2a4062 20%, #43638a 42%, #6488ae 62%, #8fabc6 78%, #b6c4cd 100%)',
  cold: 'linear-gradient(178deg, #06131f 0%, #0b2437 20%, #11374f 42%, #164057 62%, #1c5b7d 78%, #2a7ba3 100%)',
  generic: 'linear-gradient(178deg, #0e161f 0%, #1b2836 20%, #2d3f50 42%, #455a6e 62%, #657d93 78%, #8fa4b8 100%)',
};
