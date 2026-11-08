/**
 * 表面图标 —— 同一枚图标在两种表面上各用哪一档。
 *
 * 图标的色值烤在 data URI 里，CSS 变量与 opacity 都改不动它（见 utils/theme 的说明），
 * 所以「照片面上压白、普通页面上压深墨」这条规则只能落在 JS 里。
 *
 * 这条规则以前每个组件各写一遍三元（surface === 'photo' ? ... : ...），
 * 同一个图形抄六遍。改一次配色要改六处，漏一处就是一枚图标在照片上糊掉。
 *
 * 档位写成字面量：门禁（scripts/check-icons.mjs）只查得出字面量的档位，
 * 用变量拼出来的那一档查不到，图标就悄悄没了。
 *
 * 表面只有两半，CSS 那半是模板里的 .on-photo，JS 那半是这个 composable ——
 * 挂的时候两半要写在同一个地方（见 src/pages/data/index.vue）。
 */
import { computed } from 'vue';

import { icon } from '@/constants/icons';

import { useSurface } from './useSurface';

/**
 * 天气页这一组图标。
 *
 * 每项两个档位：普通面与照片面。
 *
 * 「普通面」不是一律 muted —— 潮汐卡入口那个箭头是 muted60：
 * 它是「进详情」的提示，比标题图标更轻一档（与别处的列表箭头同一档）。
 */
export function useSurfaceIcons() {
  const surface = useSurface();
  const photo = surface === 'photo';

  return {
    /** 「未来 24 小时」卡标题 */
    clock: computed(() => (photo ? icon('clock', 'onPhoto') : icon('clock', 'muted'))),
    /** 「天气预报」卡标题 */
    calendarDays: computed(() => (photo ? icon('calendar-days', 'onPhoto') : icon('calendar-days', 'muted'))),
    /** 「日照与月相」卡标题 */
    sunMoon: computed(() => (photo ? icon('sun-moon', 'onPhoto') : icon('sun-moon', 'muted'))),
    /** 「潮汐预报」卡标题 */
    waves: computed(() => (photo ? icon('waves', 'onPhoto') : icon('waves', 'muted'))),
    /** 「潮汐预报」卡入口箭头 */
    chevronRight: computed(() => (photo ? icon('chevron-right', 'onPhoto') : icon('chevron-right', 'muted60'))),

    /* 实况读数的九枚磁贴图标。标识用的图标压 muted，不做状态信号 */

    /** 相对湿度 */
    droplet: computed(() => (photo ? icon('droplet', 'onPhoto') : icon('droplet', 'muted'))),
    /** 气压 */
    gauge: computed(() => (photo ? icon('gauge', 'onPhoto') : icon('gauge', 'muted'))),
    /** 能见度 */
    eye: computed(() => (photo ? icon('eye', 'onPhoto') : icon('eye', 'muted'))),
    /** 风 */
    compass: computed(() => (photo ? icon('compass', 'onPhoto') : icon('compass', 'muted'))),
    /** 阵风 */
    wind: computed(() => (photo ? icon('wind', 'onPhoto') : icon('wind', 'muted'))),
    /** 降水 */
    umbrella: computed(() => (photo ? icon('umbrella', 'onPhoto') : icon('umbrella', 'muted'))),
    /** 云量 */
    cloud: computed(() => (photo ? icon('cloud', 'onPhoto') : icon('cloud', 'muted'))),
    /** 紫外线 */
    sun: computed(() => (photo ? icon('sun', 'onPhoto') : icon('sun', 'muted'))),
    /** 露点 */
    thermometer: computed(() => (photo ? icon('thermometer', 'onPhoto') : icon('thermometer', 'muted'))),
  };
}
