/**
 * 渔况状态 —— 天气、降水、潮汐、鱼口概率。Pinia 全局单例。
 *
 * 这几样是一块屏幕上讲同一件事：**这个地方现在怎么样**。
 * 它们都由同一个 enriched 响应带回来，拆成四份取就会取四次，
 * 而且四份可能来自四个不同时刻 —— 卡片之间对不上，读者得自己猜。
 *
 * 所以它们合在一个 store 里，但取数只有一条：
 * `fetchWeatherAndFishing` 一次拿全，其余动作都从它派出去。
 *
 * 定位不在这里（见 stores/location），钓点也不在这里（见 stores/spots）。
 */

import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';

import { fishingApi } from '@/api/fishing';
import type {
  FishingIndexData,
  LngLat,
  MinutelyForecast,
  TideData,
  TideStation,
  WeatherDay,
  WeatherHourly,
  WeatherIndex,
  WeatherNow,
} from '@/types/fishing';
import { formatCompactDate } from '@/utils/date';
import { fetchErrorMessage, toErrorMessage } from '@/utils/error';
import { locationKey } from '@/utils/geo';
import { createSingleFlight } from '@/utils/singleFlight';
import { tideDateKey } from '@/utils/tide';
import { showToast } from '@/utils/toast';
import { normalizeMinutely, normalizeWeatherIndices, normalizeWeatherPayload } from '@/utils/weather-normalize';

import { MAP_CENTER, useLocationStore } from './location';

/** 潮汐可选港口。code 是国家海洋预报台的站点编号 */
const HARBOR_OPTIONS = [
  { code: 'P2352', name: '黄埔港' },
  { code: 'P2932', name: '舢舨洲' },
  { code: 'P2299', name: '南沙港' },
  { code: 'P2474', name: '海沁' },
  { code: 'P2609', name: '东沙' },
] as const;

/**
 * 潮汐站分段控件的格数上限。
 *
 * 控件是等宽的，5 格是现在的版式。挤到 6 格的话每格只剩一百来 rpx，
 * 「黄浦公园」这种四字站名会跟旁边的贴在一起 —— 固定端口让出最后一格。
 */
const TIDE_STATION_SLOTS = 5;

/**
 * 分钟降水的有效期窗口。
 *
 * 上游每 5 分钟更新一次、服务端缓存 5 分钟 —— 与之对齐，
 * 早了拿到的还是同一份数据，晚了拿到的已经不是刚更新的那份。
 */
const MINUTELY_TTL = 5 * 60 * 1000;

export const useConditionsStore = defineStore('conditions', () => {
  const locationStore = useLocationStore();

  /*
   * 下面这些是**接口整份给回来的载荷**（天气、潮汐、指数），
   * 一律用 shallowRef，不用 ref。
   *
   * 区别在哪儿：ref 会把对象**深度**变成响应式 —— 载荷里的每一个字段、
   * 每一个嵌套对象、每一个数组元素都套一层 Proxy。一次 enriched 响应里
   * 有 24 条逐时预报、7 天预报带各自的嵌套结构，代理层是几千个 Proxy 对象。
   * 它们在取数那一刻被创建出来，却几乎从不被单独改过 —— 载荷永远是整份替换
   * （`indexData.value = data`），没有一个字段是原地改的。
   *
   * shallowRef 只包一层：替换整份时照样触发更新（模板要的就是这个），
   * 但不为里面每个字段创建代理。少掉的是几千个 Proxy 的分配与 GC 压力。
   *
   * 前提是**没人原地改字段**。改了字段页面不会更新 —— 那是这个取舍的代价，
   * 所以本 store 里凡是载荷一律整份替换；要改内容就重新赋一份回去。
   */

  // 鱼口概率
  const indexData = shallowRef<FishingIndexData | null>(null);
  const indexLoading = ref(false);
  const indexError = ref('');
  /**
   * 当前 indexData 是按哪个坐标取的。
   *
   * 存的是两位小数的坐标串（与接口参数同精度）——坐标变了要重取，靠它比对。
   */
  const indexLocation = ref<string | null>(null);

  // 天气（来自 fishing/index enriched 响应）
  const liveWeather = shallowRef<WeatherNow | null>(null);
  const forecasts = shallowRef<WeatherDay[]>([]);
  const weatherHourly = shallowRef<WeatherHourly[]>([]);
  const locationName = ref('');
  const weatherLoading = ref(false);
  const weatherError = ref('');
  /**
   * 生活指数（和风官方指数，含官方钓鱼指数）。
   *
   * 来自 enriched 响应的 `weather_indices`。这一项以前恒为空数组 ——
   * 那时后端根本没往外给，模型只能自己从温度气压反推，丢掉了
   * 「官方说今天适宜垂钓」这个最强的信号。
   */
  const weatherIndices = shallowRef<WeatherIndex[]>([]);

  /*
   * 分钟级降水（未来 2 小时、每 5 分钟一条）。
   *
   * 它**不随 enriched 响应回来** —— 上游只覆盖中国区域，而 enriched 覆盖全球；
   * 把它塞进 enriched 就等于让境外用户每次都拿一份失败的响应。
   * 所以它单独一个端点、单独一份状态，失败也只坏这一张卡。
   */
  const minutelyForecast = shallowRef<MinutelyForecast | null>(null);
  const minutelyLoading = ref(false);
  const minutelyError = ref('');
  /** 最近一次取数是按哪个坐标发的（成功失败都记，与 indexLocation 同一套比对口径） */
  const minutelyLocation = ref<string | null>(null);
  /** 最近一次取数的时刻（毫秒）。用来判断要不要重取 */
  const minutelyFetchedAt = ref(0);

  // 潮汐（随 enriched 响应一并带回）
  const tideData = shallowRef<TideData | null>(null);
  /**
   * 潮汐来源站 —— `tideData` 这份潮汐来自哪个站。
   *
   * 后端按请求坐标查**最近**的潮汐站；附近没有潮汐站时退到兜底站，
   * 那条潮汐与用户所在地无关。
   */
  const tideStation = shallowRef<TideStation | null>(null);

  // 潮汐面板：港口和日期可选，单独取数
  const panelTideData = shallowRef<TideData | null>(null);
  const panelTideSpotName = ref<string>(HARBOR_OPTIONS[0].name);
  const tideLoading = ref(false);
  /**
   * 用户手动选的港口。空串 = 没选过，这时按近站点来。
   *
   * 分「自动」与「手动」两态，是为了让近站点晚到时能接管默认选择：
   * 用户已经明确选过港口，就别再替他改回去。
   */
  const selectedHarbor = ref<string>('');
  const selectedDate = ref(formatCompactDate());

  /*
   * 首页潮汐卡的数据：当前地点潮汐站的**今日**潮汐。
   *
   * 与面板潮汐（panelTideData）分两份，是因为两者答的不是同一个问题：
   * 面板答「这个港口这一天怎么样」（港口与日期由用户挑），
   * 首页答「我现在这片水的潮汐怎么样」（跟着用户所在地的站，只看今天）。
   * 合成一份就会出现「首页显示的是三天后某个港口的潮汐」。
   */
  const homeTideData = shallowRef<TideData | null>(null);
  /** 首页那张潮汐卡显示的站名 */
  const homeTideSpotName = ref('');
  /** 首页潮汐在取数中 */
  const homeTideLoading = ref(false);
  /**
   * 近站点到齐没有 —— 潮汐来源站是 enriched 响应里带的，
   * 响应回来之前不知道该按哪个站取潮汐。
   *
   * 失败也算「到齐」：enriched 挂了就没有近站点，面板要退到固定港口出图，
   * 不能一直挂着等一个不会来的响应。
   */
  const nearestStationResolved = ref(false);

  /* ── 取数 ──────────────────────────────────────────────────────────────── */

  /**
   * 拉鱼口概率（enriched=true 附带天气和潮汐）。
   *
   * 坐标默认取用户当前位置；还没定位到就用 MAP_CENTER 兜底（先给一份数据，
   * 定位到了再覆盖）。
   *
   * 同一坐标不并发两个请求：数据页的 onMounted 与 onPageShow 会在同一刻触发，
   * 两个响应回来会互相覆盖，页面上的地点名会闪一下。
   */
  const weatherFlight = createSingleFlight();

  async function fetchWeatherAndFishing(location?: LngLat): Promise<void> {
    const target = location ?? locationStore.userLocation ?? MAP_CENTER;
    const key = locationKey(target);

    // 同一坐标在飞：不并发第二个
    if (weatherFlight.busy && weatherFlight.latestKey === key) return;

    // 位置变了，之前手动选的港口就作废 —— 那是给上一个地方选的。
    // 回到「按近站点」，近站点到了面板自己切过去。
    if (indexLocation.value && indexLocation.value !== key) {
      selectedHarbor.value = '';
    }

    // 新的一轮取数：近站点还没到齐
    nearestStationResolved.value = false;

    weatherLoading.value = true;
    indexLoading.value = true;
    weatherError.value = '';
    indexError.value = '';

    await weatherFlight.run(key, async () => {
      try {
        const data = await fishingApi.getFishingIndex(target, true);

        /*
         * 期间又发了一轮（用户换了地点、或点了刷新）：这份是旧地点的，丢掉。
         *
         * 两个响应互相覆盖的话，地点名会闪一下 —— 用户刚挑完地方，
         * 标签又跳回上一个地名，等于没挑成。
         */
        if (!weatherFlight.isCurrent(key)) return;

        const { now, hourly, daily } = normalizeWeatherPayload({
          current: data.current_weather,
          hourly: data.hourly_weather,
          daily: data.forecasts,
        });
        const nameFromEnriched = data.location_name?.trim();

        liveWeather.value = now;
        forecasts.value = daily;
        weatherHourly.value = hourly;
        locationName.value = nameFromEnriched || (now?.text ? '当前位置' : '钓鱼地点');
        // 生活指数是 v7 结构（官方没出新版），字段与视图模型一致，只做取值规整。
        weatherIndices.value = normalizeWeatherIndices(data.weather_indices);
        tideData.value = data.tide_data ?? null;
        tideStation.value = data.tide_station ?? null;
        indexData.value = data;
        indexLocation.value = key;
        nearestStationResolved.value = true;

        /*
         * 近站点到了：面板按它取潮汐（今天这一档直接用 full 端点那份）。
         * 用户手动选过港口就不动 —— 那是他的选择，不替他改。
         */
        if (pendingPanelTide || !selectedHarbor.value) {
          void fetchPanelTide();
        }
      } catch (err) {
        /* 期间又有新一轮在跑：这份失败不算数 —— 新一轮自己会说话 */
        if (!weatherFlight.isCurrent(key)) return;

        /* 两处错误各带各的兜底：天气卡说的是天气，结论头说的是鱼口概率 */
        const networkMessage = fetchErrorMessage(err);
        const message = networkMessage || '服务暂时不可用，请稍后重试';
        showToast(message);
        weatherError.value = networkMessage || '天气取不到，请稍后重试';
        indexError.value = message;
        /* 机器文案不上屏，但也不丢 —— 留在控制台里查 */
        if (!networkMessage) console.warn('[conditions] 取数失败：', err);
        // 失败也算近站点「到齐」—— 不会有更准的站了，面板退到固定港口出图
        nearestStationResolved.value = true;

        // enriched 挂了：近站点等不到，面板退到固定港口出图 ——
        // 别让潮汐图跟着天气一起空掉。
        if (pendingPanelTide) {
          void fetchPanelTide();
        }
      } finally {
        /*
         * 只清自己那一份。
         *
         * 期间又有新一轮在跑的话，最新的那轮已经接管，
         * 这时候清掉它就把「同一坐标不并发」那道锁拆了，加载态也会提前熄掉。
         */
        if (weatherFlight.isCurrent(key)) {
          weatherLoading.value = false;
          indexLoading.value = false;
        }
      }
    });
  }

  /**
   * 数据页取数：定位 → 按用户坐标取。
   *
   * 已经有「当前坐标的那份」数据就不再取 —— 切回 tab 不该每次都发请求。
   * 坐标变了则重取 —— 靠 `indexLocation` 与当前坐标的对比，
   * 所以「在地图页改了坐标再切回来」也会重新取到一份对的。
   *
   * 全应用只有这一条取数入口：地图页不碰它（那边根本不显示这些数据）。
   */
  async function ensureWeatherAndFishing(): Promise<void> {
    /*
     * 用户挑过地点就看那个地方 —— 切 tab 回来不能又跳回定位。
     * 没挑过才去定位（定位要弹权限窗，不该白弹一次）。
     */
    const target =
      locationStore.manualLocation ?? (await locationStore.locateUser()) ?? locationStore.userLocation ?? MAP_CENTER;

    if (indexData.value && indexLocation.value === locationKey(target)) return;

    await fetchWeatherAndFishing(target);
  }

  /**
   * 刷新：重新定位再取数。
   *
   * 重新定位是有意义的 —— 用户可能已经换了个钓点，旧坐标拿到的天气不作数。
   * 定位失败就退回最后一次成功的坐标，再不行才用默认中心。
   *
   * 分钟降水跟着一起刷：刷新键的语义是「把这里的数据更新一遍」，
   * 而分钟降水恰恰是最吃新鲜度的那一份（两小时的有效期、五分钟一更新）。
   * 两条并行发，不让这张卡排在 enriched 那条重请求后面干等。
   */
  async function refreshIndexData(): Promise<void> {
    const located = await locationStore.locateUser(true);
    const target = located ?? locationStore.userLocation ?? MAP_CENTER;

    await Promise.all([fetchWeatherAndFishing(target), fetchMinutely(target)]);
  }

  /**
   * 换一个地方看：用户自己挑了一个点。
   *
   * 指数与分钟降水一起换 —— 这一屏讲的是同一个地方，
   * 只换一半的话，地点标签写着深圳、降水卡还画着广州。
   */
  async function pickManualLocation(location: LngLat): Promise<void> {
    locationStore.manualLocation = location;
    await Promise.all([fetchWeatherAndFishing(location), fetchMinutely(location)]);
  }

  /*
   * 分钟级降水。
   *
   * 为什么单独一套取数，不挂进 fetchWeatherAndFishing：
   * - 上游覆盖范围不同（分钟降水只覆盖中国区域，enriched 覆盖全球）；
   * - 过期速度不同（上游每 5 分钟更新一次，enriched 是小时级）；
   * - 失败代价不同（分钟降水取不到只是少一张卡，enriched 取不到是整页天气空掉）。
   */

  /**
   * 分钟降水的 in-flight 守卫。
   *
   * 与天气那条同源：同一坐标在飞时不并发第二个 ——
   * 数据页的 onMounted 与 onPageShow 会在同一刻触发。
   */
  const minutelyFlight = createSingleFlight();

  /** 拉分钟级降水。不传参数时用当前坐标，没有就用默认中心 */
  async function fetchMinutely(location?: LngLat): Promise<void> {
    const target = location ?? locationStore.userLocation ?? MAP_CENTER;
    const key = locationKey(target);

    // 同一坐标在飞：不并发第二个
    if (minutelyFlight.busy && minutelyFlight.latestKey === key) return;

    minutelyLoading.value = true;
    minutelyError.value = '';
    // 记的是「最近一次尝试」，成功失败都记 —— 失败的那次也要挡住重试，
    // 否则境外坐标每切一次 tab 就重发一次注定失败的请求。
    minutelyLocation.value = key;
    minutelyFetchedAt.value = Date.now();

    await minutelyFlight.run(key, async () => {
      try {
        const data = await fishingApi.getMinutely(target);

        // 期间又发了一轮：这份是旧地点的，丢掉（理由同 fetchWeatherAndFishing）
        if (!minutelyFlight.isCurrent(key)) return;

        minutelyForecast.value = normalizeMinutely(data);
      } catch (err) {
        if (!minutelyFlight.isCurrent(key)) return;

        minutelyError.value = toErrorMessage(err, '获取分钟降水失败');
        // 取不到就把旧数据清掉：留着一份几小时前的降水当「接下来的降水」是骗人
        minutelyForecast.value = null;
        /*
         * 这里不弹 toast。
         *
         * 分钟降水只覆盖中国区域，境外坐标必然取不到 —— 每次进页面都弹一次
         * 报错只是打扰，卡片里给出空态就够了。
         */
      } finally {
        if (minutelyFlight.isCurrent(key)) {
          minutelyLoading.value = false;
        }
      }
    });
  }

  /**
   * 数据页取分钟降水。
   *
   * 坐标没变且最近一次尝试还在 5 分钟内就不重取：切回 tab 不该每次都发请求，
   * 但这份数据过了 5 分钟就作废（上游每 5 分钟更新一次），
   * 所以不能像天气那样一直复用。
   */
  async function ensureMinutely(): Promise<void> {
    // 与指数那一路同一口径：用户挑过地点就按那个地点取
    const target =
      locationStore.manualLocation ?? (await locationStore.locateUser()) ?? locationStore.userLocation ?? MAP_CENTER;
    const key = locationKey(target);

    const fresh = Date.now() - minutelyFetchedAt.value <= MINUTELY_TTL;
    if (minutelyLocation.value === key && fresh) return;

    await fetchMinutely(target);
  }

  /*
   * 这里**没有**「坐标一变就自动重取指数」的 watch。
   *
   * 曾经有过一个，结果是：地图页一进页面、定位一回来，就发一条
   * `GET /v2/fishing/index?location=…&enriched=true` —— 这条请求是全应用最重的
   * 一条（实测 TTFB 200~390 ms，响应 22 KB），而**地图页一个像素都不显示它**：
   * 鱼口概率、天气、潮汐只有数据页那三张卡在用。
   * 微信体检因此记了一条「小程序启动时存在耗时较长的请求」。
   *
   * 取数归数据页自己管：`ensureWeatherAndFishing` 每次都会拿当前坐标
   * 跟 `indexLocation` 比一遍，坐标变了就重取。
   * 地图页改了坐标（点定位键）之后切回数据页，onPageShow 会触发它 ——
   * 这条路径本来就覆盖了「坐标变了要重取」，不需要一个全局 watch。
   */

  /**
   * 潮汐站候选：近站点排在最前，其余是固定的那几个港口。
   *
   * 近站点就是后端按坐标查到的那个（`tideStation`）—— 潮汐图优先渲染它，
   * 因为它是「用户所在地的潮汐」。同一个站已经在固定列表里就不重复列：
   * 列两遍，切过去拿到的还是同一段潮汐。
   */
  const tideStations = computed<ReadonlyArray<{ code: string; name: string }>>(() => {
    const nearest = tideStation.value;
    const fixed = HARBOR_OPTIONS.filter((option) => option.code !== nearest?.id);
    if (!nearest) return fixed;
    return [{ code: nearest.id, name: nearest.name }, ...fixed].slice(0, TIDE_STATION_SLOTS);
  });

  /**
   * 当前生效的站：手动选过用他选的，没选过用近站点，再没有就退到固定列表第一个。
   */
  const activeHarbor = computed(() => selectedHarbor.value || tideStation.value?.id || HARBOR_OPTIONS[0].code);

  /**
   * 面板取数挂起中 —— 近站点还没到，等它到了再取。
   *
   * 近站点是潮汐图的默认站。先按固定港口取一份再换过来，图会闪一下，
   * 而潮汐图就在数据页第一屏 —— 宁可晚一点出图，也不要先画错的那条。
   */
  let pendingPanelTide = false;

  /**
   * 面板潮汐的 in-flight 守卫。
   *
   * 存在的理由：切港口时 store 的 setter 与组件的 watcher 都会发一次请求，
   * 同一个 URL 打两遍 —— 白费一个往返，两份响应还会先后覆盖面板，
   * 面板上的港口名会闪一下。
   *
   * 同一组「港口+日期」在飞时，后来者直接不发了。
   * 请求结束后守卫就放开，所以过一会儿再取同一组仍然会真的发出去。
   */
  const panelTideFlight = createSingleFlight();

  /** 拉面板潮汐。不传参数时沿用当前生效的港口和日期 */
  async function fetchPanelTide(harbor?: string, date?: string): Promise<void> {
    const harborToUse = harbor ?? activeHarbor.value;
    const dateToUse = date ?? selectedDate.value;

    const nearest = tideStation.value;

    /*
     * 近站点 + 今天这一档：full 端点那份潮汐就是这个站这一天的，
     * 同一个上游、同一份数据 —— 直接用，再打一次接口是白花一个往返。
     */
    if (nearest && harborToUse === nearest.id && tideDateKey(tideData.value) === dateToUse) {
      panelTideData.value = tideData.value;
      panelTideSpotName.value = nearest.name;
      return;
    }

    /*
     * 近站点还没到：先不发。
     * 那时还不知道该按哪个站取，发出去的多半是固定港口的潮汐，
     * 近站点一到就得换，图会闪一下。挂起，等 enriched 回来再取。
     */
    if (!nearest && !nearestStationResolved.value && !selectedHarbor.value) {
      pendingPanelTide = true;
      return;
    }
    pendingPanelTide = false;

    const key = `${harborToUse}@${dateToUse}`;
    // 同一组「港口+日期」在飞：不并发第二个
    if (panelTideFlight.busy && panelTideFlight.latestKey === key) return;

    tideLoading.value = true;

    await panelTideFlight.run(key, async () => {
      try {
        const data = await fishingApi.getTideData({
          harbor: harborToUse,
          date: dateToUse,
        });
        // 响应回来时生效的站可能已经变了（近站点晚到 / 用户切了站）：
        // 这份数据是旧站的，扔掉 —— 否则图上画的和选中的是两回事。
        if (`${harborToUse}@${dateToUse}` !== `${activeHarbor.value}@${selectedDate.value}`) {
          return;
        }
        const station = tideStations.value.find((o) => o.code === harborToUse);

        panelTideData.value = data;
        // 站名从候选列表里查 —— 近站点不在固定列表里。查不到就退回收到的编号：
        // 总比安一个别的站名强。
        panelTideSpotName.value = station?.name ?? harborToUse;
      } catch (err) {
        showToast(toErrorMessage(err, '获取潮汐信息失败'));
      } finally {
        if (panelTideFlight.isCurrent(key)) {
          tideLoading.value = false;
        }
      }
    });
  }

  function setSelectedHarbor(harbor: string): void {
    selectedHarbor.value = harbor;
    void fetchPanelTide(harbor, selectedDate.value);
  }

  function setSelectedDate(date: string): void {
    selectedDate.value = date;
    void fetchPanelTide(activeHarbor.value, date);
  }

  /**
   * 首页潮汐卡取数。
   *
   * 近站点 + 今天这一档：enriched 带回的 tide_data 就是这一份，直接用 ——
   * 这张卡在数据页首屏，再打一次接口是白花一个往返。
   *
   * 没有近站点时退到固定港口的今日潮汐：宁可给一个别处的潮汐，
   * 也别让首页空着一张卡。取不到数不弹 toast —— 首页这块只是内容，
   * 潮汐详情页里还有一次真正的取数，弹两次是吵。
   */
  const homeTideFlight = createSingleFlight();

  async function ensureHomeTide(): Promise<void> {
    const today = formatCompactDate();
    const nearest = tideStation.value;

    if (nearest && tideDateKey(tideData.value) === today) {
      homeTideData.value = tideData.value;
      homeTideSpotName.value = nearest.name;
      return;
    }

    // 近站点还没到齐：等它。先按固定港口取一份再换过来，卡片会闪一下
    if (!nearestStationResolved.value) return;

    const harbor = nearest?.id ?? HARBOR_OPTIONS[0].code;
    const key = `${harbor}@${today}`;
    if (homeTideFlight.busy && homeTideFlight.latestKey === key) return;

    homeTideLoading.value = true;

    await homeTideFlight.run(key, async () => {
      try {
        const data = await fishingApi.getTideData({ harbor, date: today });
        homeTideData.value = data;
        homeTideSpotName.value = tideStations.value.find((o) => o.code === harbor)?.name ?? harbor;
      } catch {
        // 空态由界面处理
      } finally {
        if (homeTideFlight.isCurrent(key)) {
          homeTideLoading.value = false;
        }
      }
    });
  }

  return {
    // 鱼口概率
    indexData,
    indexLoading,
    indexError,
    indexLocation,
    // 天气
    liveWeather,
    forecasts,
    weatherHourly,
    locationName,
    weatherLoading,
    weatherError,
    weatherIndices,
    // 分钟级降水
    minutelyForecast,
    minutelyLoading,
    minutelyError,
    minutelyLocation,
    minutelyFetchedAt,
    // 潮汐
    tideData,
    tideStation,
    tideStations,
    activeHarbor,
    panelTideData,
    panelTideSpotName,
    tideLoading,
    selectedHarbor,
    selectedDate,
    homeTideData,
    homeTideSpotName,
    homeTideLoading,
    nearestStationResolved,
    // 动作
    fetchWeatherAndFishing,
    pickManualLocation,
    ensureWeatherAndFishing,
    refreshIndexData,
    fetchMinutely,
    ensureMinutely,
    fetchPanelTide,
    setSelectedHarbor,
    setSelectedDate,
    ensureHomeTide,
  };
});
