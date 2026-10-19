/**
 * 钓点图状态 —— Pinia 全局单例。
 *
 * 从源项目 zustand store 迁过来，先落在 `reactive` 单例上，现在换成 Pinia。
 * 天气、潮汐、钓点三块数据的消费方分散在地图、面板、详情页多个层级，
 * 要的是"同一份数据只有一份"，让它们各自 ref 迟早会各拉各的接口。
 *
 * 选 setup store 而不是 options store，是因为这里有三样东西天生属于闭包：
 * 两个 in-flight 守卫（locatePending / inflightKey）和一个坐标 watch。
 * setup store 里它们就是普通局部变量，作用域跟着 store 实例走 ——
 * 不用再靠"模块级变量 + 只有一份的约定"来维持唯一性。
 *
 * 小程序端每个页面是独立的 Vue 实例，但都挂在 main.ts 那个 app 上
 * （uni 的 $createComponent 最终取的是 getApp().$vm），
 * 所以 pinia 装在 main.ts 就是全应用一份，跨页共享没问题。
 *
 * 本期不含路线规划状态（routeMapStore）和 AI 分析状态（AnalysisContext），
 * 对应功能已确认不做。
 */

import { ref, watch } from 'vue';
import { defineStore } from 'pinia';

import { fishingApi, fishingSpotApi, type LngLat } from '@/api/fishing';
import {
  toMapMarkers,
  type FishingIndexData,
  type MapMarker,
  type TideData,
  type WeatherDay,
  type WeatherHourly,
  type WeatherIndex,
  type WeatherNow,
} from '@/types/fishing';
import { formatCompactDate } from '@/utils/date';

/** 潮汐可选港口。code 是国家海洋预报台的站点编号 */
export const HARBOR_OPTIONS = [
  { code: 'P2352', name: '黄埔港' },
  { code: 'P2932', name: '舢舨洲' },
  { code: 'P2299', name: '南沙港' },
  { code: 'P2474', name: '海沁' },
  { code: 'P2609', name: '东沙' },
] as const;

/** 天气指数的默认中心（广州珠江口），定位成功前先用它出数据 */
export const MAP_CENTER: LngLat = [113.389549, 23.050067];

/** toast 标题超长会被截断成省略号，反而看不出是哪条错了 */
const TOAST_TITLE_MAX = 14;

function notifyError(message: string): void {
  uni.showToast({
    title: message.length > TOAST_TITLE_MAX ? `${message.slice(0, TOAST_TITLE_MAX)}…` : message,
    icon: 'none',
    duration: 2500,
  });
}

/**
 * 坐标的缓存键。
 *
 * 精度与接口参数一致（两位小数）：后端按这个粒度做缓存与降级，
 * 挪几十米在它看来就是同一个点，不该为这个发一次请求。
 */
function locationKey(location: LngLat): string {
  return `${location[0].toFixed(2)},${location[1].toFixed(2)}`;
}

export const useFishingMapStore = defineStore('fishingMap', () => {
  /**
   * 用户当前位置。
   *
   * 全应用唯一一份：地图的定位键、结论头的刷新键、数据页取数都读它。
   * null = 还没定位到（未授权 / 定位失败 / 还没定位完）。
   */
  const userLocation = ref<LngLat | null>(null);
  /** 定位失败或权限被拒。地图的定位键据此染红 */
  const locationDenied = ref(false);
  /** 正在定位。定位键与刷新键的转圈状态 */
  const locating = ref(false);
  /**
   * 当前 indexData 是按哪个坐标取的。
   *
   * 存的是两位小数的坐标串（与接口参数同精度）——坐标变了要重取，靠它比对。
   */
  const indexLocation = ref<string | null>(null);

  // 天气（来自 fishing/index enriched 响应）
  const liveWeather = ref<WeatherNow | null>(null);
  const forecasts = ref<WeatherDay[]>([]);
  const weatherHourly = ref<WeatherHourly[]>([]);
  const locationName = ref('');
  const weatherLoading = ref(false);
  const weatherError = ref('');
  /**
   * 生活指数。enriched 响应不含这一项，恒为空数组，
   * UI 按空态渲染 —— 别在别处假设它有值。
   */
  const weatherIndices = ref<WeatherIndex[]>([]);

  // 潮汐（随 enriched 响应一并带回）
  const tideData = ref<TideData | null>(null);

  // 潮汐面板：港口和日期可选，单独取数
  const panelTideData = ref<TideData | null>(null);
  const panelTideSpotName = ref<string>(HARBOR_OPTIONS[0].name);
  const tideLoading = ref(false);
  const selectedHarbor = ref<string>(HARBOR_OPTIONS[0].code);
  const selectedDate = ref(formatCompactDate());

  // 钓鱼指数
  const indexData = ref<FishingIndexData | null>(null);
  const indexLoading = ref(false);
  const indexError = ref('');

  // 钓点标记
  const markers = ref<MapMarker[]>([]);
  const spotsLoading = ref(false);
  const spotsError = ref('');

  /**
   * 当前选中的钓点。
   *
   * 放 store 而不是地图页的局部 state：选中动作发生在钓点页（点 marker），
   * 消费方却是数据页的钓鱼反馈表单，两边跨页了。跨页只能靠 URL 传，
   * 而 URL 带 marker 还得额外处理刷新和失效，不如共享状态直接。
   */
  const selectedMarker = ref<MapMarker | null>(null);

  /**
   * 请求用户坐标。
   *
   * 全应用只有这一处调 uni.getLocation：地图的定位键、结论头的刷新键、
   * 数据页的取数共用它。两处各调一次会弹两次权限窗，也会拿到两个略有差异的点，
   * 页面上表现为「地点名闪一下」。
   *
   * force=true 时重新定位（用户主动按定位键或点了刷新）；
   * 否则已有坐标直接复用，定位失败过也不再重试 —— 微信在用户拒绝之后不会再弹
   * 权限窗，反复调只是反复失败。
   */
  let locatePending: Promise<LngLat | null> | null = null;

  async function locateUser(force = false): Promise<LngLat | null> {
    if (!force) {
      if (userLocation.value) return Promise.resolve(userLocation.value);
      if (locationDenied.value) return Promise.resolve(null);
    }
    // 已有请求在飞就等它，不并发第二个
    if (locatePending) return locatePending;

    locating.value = true;

    locatePending = new Promise<LngLat | null>((resolve) => {
      uni.getLocation({
        // 必须是 gcj02 —— 小程序 <map> 组件用的是 GCJ-02 火星坐标系。
        // 传 wgs84（GPS 原始坐标）会偏移几百米，这是最常见的对不上问题。
        type: 'gcj02',
        success: (res) => {
          userLocation.value = [res.longitude, res.latitude];
          locationDenied.value = false;
          resolve(userLocation.value);
        },
        fail: () => {
          // 授权被拒或系统定位不可用：保留上一次的坐标，靠图标染红告诉用户
          // 「定位键按了没用」。不在这里弹 openSetting —— 用户可能只是信号不好，
          // 上来就抢设置页很突兀，按键点一下再去。
          locationDenied.value = true;
          resolve(null);
        },
      });
    }).finally(() => {
      locatePending = null;
      locating.value = false;
    });

    return locatePending;
  }

  /**
   * 标记定位不可用。
   *
   * 设置页里没开权限时用 —— 这时用户已经明确表态了，定位键就该一直留在染红状态，
   * 别让它看起来「点了没反应」。
   */
  function markLocationDenied(): void {
    locationDenied.value = true;
  }

  /**
   * 拉钓鱼指数（enriched=true 附带天气和潮汐）。
   *
   * 坐标默认取用户当前位置；还没定位到就用 MAP_CENTER 兜底（先给一份数据，
   * 定位到了再覆盖）。
   *
   * 同一坐标不并发两个请求：数据页的取数和坐标变化的自动重取可能在同一刻触发，
   * 两个响应回来会互相覆盖，页面上的地点名会闪一下。
   */
  let inflightKey: string | null = null;

  async function fetchWeatherAndFishing(location?: LngLat): Promise<void> {
    const target = location ?? userLocation.value ?? MAP_CENTER;
    const key = locationKey(target);

    if (key === inflightKey) return;

    inflightKey = key;
    weatherLoading.value = true;
    indexLoading.value = true;
    weatherError.value = '';
    indexError.value = '';

    try {
      const data = await fishingApi.getFishingIndex(target, true);
      const now = data.current_weather ?? null;
      const nameFromEnriched = data.location_name?.trim();

      liveWeather.value = now;
      forecasts.value = data.forecasts ?? [];
      weatherHourly.value = data.hourly_weather?.hourly ?? [];
      locationName.value = nameFromEnriched || (now?.text ? '当前位置' : '钓鱼地点');
      tideData.value = data.tide_data ?? null;
      indexData.value = data;
      indexLocation.value = key;
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取数据失败';
      notifyError(message);
      weatherError.value = message;
      indexError.value = message;
    } finally {
      inflightKey = null;
      weatherLoading.value = false;
      indexLoading.value = false;
    }
  }

  /**
   * 数据页取数：定位 → 按用户坐标取。
   *
   * 已经有「当前坐标的那份」数据就不再取 —— 切回 tab 不该每次都发请求。
   * 坐标变了则重取（由下面的 watch 负责）。
   */
  async function ensureWeatherAndFishing(): Promise<void> {
    const located = await locateUser();
    const target = located ?? userLocation.value ?? MAP_CENTER;

    if (indexData.value && indexLocation.value === locationKey(target)) return;

    await fetchWeatherAndFishing(target);
  }

  /**
   * 刷新：重新定位再取数。
   *
   * 重新定位是有意义的 —— 用户可能已经换了个钓点，旧坐标拿到的天气不作数。
   * 定位失败就退回最后一次成功的坐标，再不行才用默认中心。
   */
  async function refreshIndexData(): Promise<void> {
    const located = await locateUser(true);
    await fetchWeatherAndFishing(located ?? userLocation.value ?? MAP_CENTER);
  }

  /**
   * 坐标变了就重取一次指数。
   *
   * 比较用接口同精度（两位小数）：在原地挪几十米不该发一次请求，
   * 换了城市才该重取 —— 换了地方，之前那份天气和指数都不作数了。
   *
   * 这个 watch 活在 store 的作用域里，pinia 实例不销毁它就一直有效，
   * 不依赖哪个组件挂载过。
   */
  watch(
    () => (userLocation.value ? locationKey(userLocation.value) : null),
    (next) => {
      if (!next) return;
      void fetchWeatherAndFishing();
    },
  );

  /** 拉面板潮汐。不传参数时沿用当前选中的港口和日期 */
  async function fetchPanelTide(harbor?: string, date?: string): Promise<void> {
    const harborToUse = harbor ?? selectedHarbor.value;
    const dateToUse = date ?? selectedDate.value;

    tideLoading.value = true;
    try {
      const data = await fishingApi.getTideData({
        harbor: harborToUse,
        date: dateToUse,
      });
      const harborOption = HARBOR_OPTIONS.find((o) => o.code === harborToUse);

      panelTideData.value = data;
      panelTideSpotName.value = harborOption?.name ?? HARBOR_OPTIONS[0].name;
      tideLoading.value = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取潮汐信息失败';
      notifyError(message);
      tideLoading.value = false;
    }
  }

  function setSelectedHarbor(harbor: string): void {
    selectedHarbor.value = harbor;
    void fetchPanelTide(harbor, selectedDate.value);
  }

  function setSelectedDate(date: string): void {
    selectedDate.value = date;
    void fetchPanelTide(selectedHarbor.value, date);
  }

  /** 拉钓点列表并转成地图标记 */
  async function fetchSpots(): Promise<void> {
    spotsLoading.value = true;
    spotsError.value = '';

    try {
      const spots = await fishingSpotApi.list();
      markers.value = toMapMarkers(spots);
      spotsLoading.value = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载钓点失败';
      notifyError(message);
      spotsError.value = message;
      spotsLoading.value = false;
    }
  }

  /**
   * 改标记。支持传新数组或 updater 函数 ——
   * 钓点编辑/删除后要按 id 局部换掉一条，直接给整个数组等于把对象引用换掉，
   * 地图层会收到一次全量 diff 重渲染。
   */
  function setMarkers(updater: MapMarker[] | ((prev: MapMarker[]) => MapMarker[])): void {
    markers.value = typeof updater === 'function' ? updater(markers.value) : updater;
  }

  /**
   * 记录当前选中的钓点（点 marker 时调用），传 null 表示取消选中。
   *
   * 与标记集合分开而不是合成一个，是因为选中态只改一个引用，
   * 不该顺带触发地图标记的全量 diff。
   */
  function setSelectedMarker(marker: MapMarker | null): void {
    selectedMarker.value = marker;
  }

  return {
    // 定位
    userLocation,
    locationDenied,
    locating,
    indexLocation,
    // 天气
    liveWeather,
    forecasts,
    weatherHourly,
    locationName,
    weatherLoading,
    weatherError,
    weatherIndices,
    // 潮汐
    tideData,
    panelTideData,
    panelTideSpotName,
    tideLoading,
    selectedHarbor,
    selectedDate,
    // 钓鱼指数
    indexData,
    indexLoading,
    indexError,
    // 钓点标记
    markers,
    spotsLoading,
    spotsError,
    // 选中态
    selectedMarker,
    // 动作
    locateUser,
    markLocationDenied,
    fetchWeatherAndFishing,
    ensureWeatherAndFishing,
    refreshIndexData,
    fetchPanelTide,
    setSelectedHarbor,
    setSelectedDate,
    fetchSpots,
    setMarkers,
    setSelectedMarker,
  };
});
