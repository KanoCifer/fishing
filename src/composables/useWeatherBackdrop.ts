import { computed } from 'vue';

import { HERO_BACKDROP_GRADIENTS, type HeroBackdrop } from '@/constants/weatherHero';
import { useConditionsStore } from '@/stores/conditions';
import { isDarkTheme } from '@/utils/theme';
import { weatherGroup } from '@/utils/weather';

/**
 * 天气页的背景档位 —— 「此刻是什么天」由这一份说了算。
 *
 * 页面背景与顶部头图读的是同一个档位：一段天色铺在页面底层，
 * 顶部读数压在上面，两处得是同一种天。
 *
 * 深色模式下档位恒为 night：一段浅色的天压在深色页面上，
 * 整页的观感就被它拉浅，深色模式等于白做。读的是主题真值
 * （src/utils/theme.ts），不是系统的 prefers-color-scheme ——
 * 那边只管 WXSS，这里要的是「现在是不是深色」这个判断，
 * 好让天色一起翻。
 */
export function useWeatherBackdrop() {
  const conditionsStore = useConditionsStore();

  /** 当前天气落在哪一组外观上（十一种，见 utils/weather） */
  const group = computed(() => weatherGroup(conditionsStore.liveWeather?.icon));

  /** 背景档位 */
  const backdrop = computed<HeroBackdrop>(() => (isDarkTheme() ? 'night' : group.value));

  return {
    /** 背景：那一档的天色渐变。整页底色就是它 */
    gradient: computed(() => HERO_BACKDROP_GRADIENTS[backdrop.value]),
  };
}
