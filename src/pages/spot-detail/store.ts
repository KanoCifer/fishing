/**
 * 钓点详情状态 —— Pinia 全局单例。
 * 取数分两段是有意的：钓点本体先回来（名字、照片、地址、路况），
 * 钓况随后到。详情页的接口链路是「先要 id 才知道去哪儿取钓况」，
 * 串行躲不掉，但可以让用户先看见照片和名字，而不是对着一个空屏等两个往返。
 */

import { ref, shallowRef } from 'vue';
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
  /*
   * 下面四份是接口整份给回来的载荷，一律 shallowRef —— 理由与
   * stores/fishingMap.ts 里那份一样：ref 会把每个字段、每个嵌套对象
   * 都套一层 Proxy（逐时预报那种结构是几千个），而载荷永远整份替换，
   * 没人原地改字段。省掉的是代理的分配与 GC 压力。
   *
   * 前提同那边：改了字段页面不会更新，要改就重新赋一份回去。
   */

  /** 钓点本体。后端 `GET /v3/fish/spots/{id}` 的完整出参 */
  const spot = shallowRef<FishingSpot | null>(null);
  /** 钓况原始响应（鱼口概率、特征明细、逐时预报都在里面） */
  const index = shallowRef<FishingIndexData | null>(null);
  /** 归一后的实时天气。组件要的是扁平视图模型，不是上游的 wire 形状 */
  const now = shallowRef<WeatherNow | null>(null);
  /** 潮汐。港口由后端按坐标定，详情页不选港口（选港口是数据页潮汐面板的事） */
  const tide = shallowRef<TideData | null>(null);

  /** 钓点本体在飞 */
  const loading = ref(false);
  /** 钓况在飞。与本体分开：本体回来了就能看，钓况后到不影响阅读 */
  const conditionsLoading = ref(false);
  /**
   * 钓况取到的错误。
   *
   * 存下来而不是只弹一次 toast：钓况失败是**这一块内容缺失**，
   * 不是一次操作失败。toast 两秒半就没了，留下的只有一个空白的分区 ——
   * 用户不知道是没数据还是没取到。页面据此摆出「重新获取」，
   * 那一块自己站着，不占别人的位置。
   */
  const conditionsError = ref('');
  const error = ref('');
  /** 已经取过的是哪个钓点。同一个钓点二次进入不重复取数 */
  const loadedId = ref<string | null>(null);

  /**
   * 取钓况（按给定坐标）。
   *
   * 用 `fishingApi.getFishingIndex(location, true)` 而不是天气 + 潮汐两个接口：
   * 后端对同一 location 取数两次，鱼口概率自己内部还会再调一次 ——
   * 一次 enriched 拿全，省两轮往返。
   */
  async function loadConditions(location: [number, number]): Promise<void> {
    conditionsLoading.value = true;
    conditionsError.value = '';

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
      // 不弹 toast：错误落在页面上那一块里（见 conditionsError 的说明）。
      // 这里再弹一次，等于同一件事说两遍，而 toast 那遍先没。
      conditionsError.value = toErrorMessage(err, '获取钓况失败');
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

    /*
     * 换一条钓点时，先把上一条的钓况清掉。
     *
     * 留着的话，新钓点的名字会配着上一条的「爆护」摆出来 —— 那是在撒谎，
     * 而且比空着更糟：空着读得出「还没取到」，撒谎读不出来。
     */
    if (loadedId.value !== id) {
      index.value = null;
      now.value = null;
      tide.value = null;
      conditionsError.value = '';
    }

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
    conditionsError,
    error,
    loadedId,
    load,
    refreshConditions,
  };
});
