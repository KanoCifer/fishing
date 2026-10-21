/**
 * 钓点详情状态 —— Pinia 全局单例。
 *
 * 为什么单独一个 store，不并进 `fishingMap`：
 *
 * `fishingMap` 里那一份 `indexData` 是**用户当前位置**的天气与钓况，
 * 数据页、结论头、反馈表单都读它。钓点详情要的是**钓点自己那个坐标**的
 * 天气与潮汐 —— 钓点在哪，那里的风和水情才有意义。
 *
 * 两者要是挤在一个 store 里，详情页一取数就把用户那份覆盖了：
 * 数据页上的地点名会悄悄变成钓点所在的那个城市，天气也换成了钓点那边的。
 * 两份数据各有各的归属，就该各有各的 store。
 *
 * 取数分两段是有意的：钓点本体先回来（名字、照片、地址、路况），
 * 钓况随后到。详情页的接口链路是「先要 id 才知道去哪儿取钓况」，
 * 串行躲不掉，但可以让用户先看见照片和名字，而不是对着一个空屏等两个往返。
 */

import { ref } from 'vue';
import { defineStore } from 'pinia';

import { fishingApi, fishingSpotApi } from '@/api/fishing';
import { toErrorMessage } from '@/utils/error';
import { normalizeWeatherPayload } from '@/utils/weather-normalize';
import type { FishingIndexData, FishingSpot, TideData, WeatherNow } from '@/types/fishing';

/** toast 标题超长会被截成省略号，反而看不出是哪条错了 */
const TOAST_TITLE_MAX = 14;

function notifyError(message: string): void {
  uni.showToast({
    title: message.length > TOAST_TITLE_MAX ? `${message.slice(0, TOAST_TITLE_MAX)}…` : message,
    icon: 'none',
    duration: 2500,
  });
}

export const useSpotDetailStore = defineStore('spotDetail', () => {
  /** 钓点本体。后端 `GET /v3/fish/spots/{id}` 的完整出参 */
  const spot = ref<FishingSpot | null>(null);
  /** 钓况原始响应（钓鱼指数、特征明细、逐时预报都在里面） */
  const index = ref<FishingIndexData | null>(null);
  /** 归一后的实时天气。组件要的是扁平视图模型，不是上游的 wire 形状 */
  const now = ref<WeatherNow | null>(null);
  /** 潮汐。港口由后端按坐标定，详情页不选港口（选港口是数据页潮汐面板的事） */
  const tide = ref<TideData | null>(null);

  /** 钓点本体在飞 */
  const loading = ref(false);
  /** 钓况在飞。与本体分开：本体回来了就能看，钓况后到不影响阅读 */
  const conditionsLoading = ref(false);
  const error = ref('');
  /** 已经取过的是哪个钓点。同一个钓点二次进入不重复取数 */
  const loadedId = ref<string | null>(null);

  /**
   * 取钓况（按给定坐标）。
   *
   * 用 `fishingApi.getFishingIndex(location, true)` 而不是天气 + 潮汐两个接口：
   * 后端对同一 location 取数两次，钓鱼指数自己内部还会再调一次 ——
   * 一次 enriched 拿全，省两轮往返。
   */
  async function loadConditions(location: [number, number]): Promise<void> {
    conditionsLoading.value = true;

    try {
      const data = await fishingApi.getFishingIndex(location, true);

      index.value = data;

      // 归一放在 store 边界：上游换成了和风新一代（数值 + 嵌套对象），
      // 而组件要的一直是扁平的视图模型。换算全在 utils/weather-normalize 里做。
      const normalized = normalizeWeatherPayload({
        current: data.current_weather,
        hourly: data.hourly_weather,
        daily: data.forecasts,
      });

      now.value = normalized.now;
      tide.value = data.tide_data ?? null;
    } catch (err) {
      notifyError(toErrorMessage(err, '获取钓况失败'));
    } finally {
      conditionsLoading.value = false;
    }
  }

  /**
   * 载入一个钓点的详情。
   *
   * force=true 时无视缓存重取 —— 钓况是会变的（天气、潮汐都在动），
   * 同一个钓点隔一阵子再进来，该看到的是此刻的钓况，不是缓存里那一版。
   */
  async function load(id: string, force = false): Promise<void> {
    if (!force && loadedId.value === id && spot.value) return;

    loading.value = true;
    error.value = '';

    try {
      const detail = await fishingSpotApi.getById(id);
      spot.value = detail;
      loadedId.value = id;
    } catch (err) {
      const message = toErrorMessage(err, '加载钓点失败');
      error.value = message;
      notifyError(message);
      loading.value = false;
      return;
    }

    loading.value = false;

    // 钓况单独在飞，不 await —— 页面已经能看了，等它自己填进来。
    void loadConditions(spot.value.location);
  }

  /** 只重取钓况。钓点本体不会变，变的是天气和潮汐 */
  async function refreshConditions(): Promise<void> {
    if (!spot.value) return;
    await loadConditions(spot.value.location);
  }

  return {
    spot,
    index,
    now,
    tide,
    loading,
    conditionsLoading,
    error,
    loadedId,
    load,
    refreshConditions,
  };
});
