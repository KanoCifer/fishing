/**
 * 钓点图状态 —— Pinia 全局单例。
 */

import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';

import { fishingApi, fishingSpotApi, type LngLat } from '@/api/fishing';
import {
  toMapMarkers,
  type CreateFishingSpotPayload,
  type UpdateFishingSpotPayload,
  type FishingIndexData,
  type FishingSpot,
  type MapMarker,
  type MinutelyForecast,
  type TideData,
  type TideStation,
  type WeatherDay,
  type WeatherHourly,
  type WeatherIndex,
  type WeatherNow,
} from '@/types/fishing';
import { formatCompactDate } from '@/utils/date';
import { tideDateKey } from '@/utils/tide';
import { normalizeMinutely, normalizeWeatherIndices, normalizeWeatherPayload } from '@/utils/weather-normalize';

/** 潮汐可选港口。code 是国家海洋预报台的站点编号 */
export const HARBOR_OPTIONS = [
  { code: 'P2352', name: '黄埔港' },
  { code: 'P2932', name: '舢舨洲' },
  { code: 'P2299', name: '南沙港' },
  { code: 'P2474', name: '海沁' },
  { code: 'P2609', name: '东沙' },
] as const;

export const MAP_CENTER: LngLat = [113.389549, 23.050067];

/**
 * 潮汐站分段控件的格数上限。
 *
 * 控件是等宽的，5 格是现在的版式。挤到 6 格的话每格只剩一百来 rpx，
 * 「黄浦公园」这种四字站名会跟旁边的贴在一起 —— 固定端口让出最后一格。
 */
const TIDE_STATION_SLOTS = 5;

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
 */
function locationKey(location: LngLat): string {
  return `${location[0].toFixed(2)},${location[1].toFixed(2)}`;
}

/**
 * 定位授权状态。
 * - granted 已授权，getLocation 直接给坐标
 * - denied  用户明确拒绝过，微信不会再弹权限窗，只剩设置页一条路
 * - unset   从没问过（第一次进小程序就是这个），getLocation 会弹授权窗
 */
type LocationAuth = 'granted' | 'denied' | 'unset';

function queryLocationAuth(): Promise<LocationAuth> {
  return new Promise((resolve) => {
    uni.getSetting({
      success: (res) => {
        const granted = res.authSetting?.['scope.userLocation'];
        resolve(granted === true ? 'granted' : granted === false ? 'denied' : 'unset');
      },
      fail: () => resolve('unset'),
    });
  });
}

/** 从回调的 errMsg 里取出原因文字，微信给的是字符串 */
function readErrMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'errMsg' in err) {
    return String((err as { errMsg?: unknown }).errMsg ?? '');
  }
  return '';
}

/**
 * 把定位失败翻译成一句能照着做的话。
 *
 * 不给原始 errMsg：那串英文对用户没用（"getLocation:fail system permission denied"），
 * 用户需要知道的是「该开什么」。文案短到能塞进一个 toast。
 */
function describeLocationError(errMsg: string): string {
  if (/system permission denied/i.test(errMsg)) return '请开启手机定位服务';
  if (/privacy|requiredPrivateInfos/i.test(errMsg)) return '定位未获授权';
  if (/timeout/i.test(errMsg)) return '定位超时，请重试';
  return '定位失败，请重试';
}

export const useFishingMapStore = defineStore('fishingMap', () => {
  /**
   * 用户当前位置。
   *
   * 全应用唯一一份：地图的定位键、结论头的刷新键、数据页取数都读它。
   * null = 还没定位到（未授权 / 定位失败 / 还没定位完）。
   */
  const userLocation = ref<LngLat | null>(null);
  /**
   * 用户明确拒绝过定位授权。
   *
   * 只有这一种情况才值得引导去设置页 —— 微信在用户拒绝之后不会再弹权限窗，
   * 设置页是唯一能重来的路径。其余失败（系统定位没开、隐私协议没同意、网络差）
   * 都能靠重试解决，混进来会让定位键变成只会跳设置页的死键。
   */
  const locationDenied = ref(false);
  /**
   * 最近一次定位失败的说明。空串 = 没有失败。
   *
   * 定位键据此换成「定位已关」的图标：按了没反应这件事必须看得见，
   * 否则用户既不知道出了什么事，也不知道该重试还是该去设置。
   */
  const locationError = ref('');
  /** 正在定位。定位键与刷新键的转圈状态 */
  const locating = ref(false);
  /**
   * 当前 indexData 是按哪个坐标取的。
   *
   * 存的是两位小数的坐标串（与接口参数同精度）——坐标变了要重取，靠它比对。
   */
  const indexLocation = ref<string | null>(null);

  /*
   * 下面这些是**接口整份给回来的载荷**（天气、潮汐、指数、钓点列表），
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
  /**
   * 近站点到齐没有 —— 潮汐来源站是 enriched 响应里带的，
   * 响应回来之前不知道该按哪个站取潮汐。
   *
   * 失败也算「到齐」：enriched 挂了就没有近站点，面板要退到固定港口出图，
   * 不能一直挂着等一个不会来的响应。
   */
  const nearestStationResolved = ref(false);

  // 鱼口概率
  const indexData = shallowRef<FishingIndexData | null>(null);
  const indexLoading = ref(false);
  const indexError = ref('');

  const indexPending = ref(true);

  // 钓点标记
  const markers = shallowRef<MapMarker[]>([]);
  const spotsLoading = ref(false);
  const spotsError = ref('');

  /**
   * 我提交的钓点。
   *
   * 与 markers 分开存，因为它们是两份不同的数据：markers 是公开列表
   * （后端只放已过审的），这里是「我的」（含待审核、已驳回）。
   * 合成一份的话，待审核那条在地图上就会显示出来 —— 它还没过审。
   */
  const mySpots = shallowRef<FishingSpot[]>([]);
  const mySpotsLoading = ref(false);
  const mySpotsError = ref('');

  /**
   * 当前选中的钓点。
   *
   * 放 store 而不是地图页的局部 state：选中动作发生在钓点页（点 marker），
   * 消费方却是数据页的钓鱼反馈表单，两边跨页了。跨页只能靠 URL 传，
   * 而 URL 带 marker 还得额外处理刷新和失效，不如共享状态直接。
   */
  const selectedMarker = shallowRef<MapMarker | null>(null);

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

    const pending = (async (): Promise<LngLat | null> => {
      /*
       * 先问授权状态再调 getLocation。
       *
       * 顺序反了会踩两个坑：用户已经拒绝过时，getLocation 不会再弹窗，
       * 只会 fail 回来 —— 调它一百遍也是同一个结果，白白浪费一次交互；
       * 而「明确拒绝」和「从没问过」在界面上要给的引导完全不同，
       * 光看 getLocation 的失败回调区分不出来。
       */
      const auth = await queryLocationAuth();
      if (auth === 'denied') {
        locationDenied.value = true;
        locationError.value = '';
        return null;
      }

      return new Promise<LngLat | null>((resolve) => {
        uni.getLocation({
          // 必须是 gcj02 —— 小程序 <map> 组件用的是 GCJ-02 火星坐标系。
          // 传 wgs84（GPS 原始坐标）会偏移几百米，这是最常见的对不上问题。
          type: 'gcj02',
          success: (res) => {
            userLocation.value = [res.longitude, res.latitude];
            locationDenied.value = false;
            locationError.value = '';
            resolve(userLocation.value);
          },
          fail: async (err) => {
            /*
             * 到这一步授权是 granted 或 unset，仍然失败说明是别的原因。
             *
             * 唯一例外是用户在授权弹窗上点了「拒绝」—— 问授权时用户还没表态，
             * 那一刻拿到的还是 unset，得等弹窗关掉再问一次才准。
             */
            const errMsg = readErrMsg(err);
            const after = await queryLocationAuth();
            const denied = after === 'denied' || /auth deny|authorize:fail/i.test(errMsg);

            locationDenied.value = denied;
            if (denied) {
              // 被拒不是「出错」，是用户做了决定。图标换掉，但别拿一句报错去打扰他
              locationError.value = '';
            } else {
              // 保留上一次的坐标，靠图标换掉告诉用户「定位键按了没用」
              locationError.value = describeLocationError(errMsg);
              notifyError(locationError.value);
            }
            resolve(null);
          },
        });
      });
    })().finally(() => {
      locatePending = null;
      locating.value = false;
    });

    locatePending = pending;
    return pending;
  }

  /**
   * 标记定位不可用。
   *
   * 设置页里没开权限时用 —— 这时用户已经明确表态了，定位键就该一直留在「定位不可用」状态，
   * 别让它看起来「点了没反应」。
   */
  function markLocationDenied(): void {
    locationDenied.value = true;
    locationError.value = '';
  }

  /**
   * 拉鱼口概率（enriched=true 附带天气和潮汐）。
   *
   * 坐标默认取用户当前位置；还没定位到就用 MAP_CENTER 兜底（先给一份数据，
   * 定位到了再覆盖）。
   *
   * 同一坐标不并发两个请求：数据页的 onMounted 与 onPageShow 会在同一刻触发，
   * 两个响应回来会互相覆盖，页面上的地点名会闪一下。
   */
  let inflightKey: string | null = null;

  async function fetchWeatherAndFishing(location?: LngLat): Promise<void> {
    const target = location ?? userLocation.value ?? MAP_CENTER;
    const key = locationKey(target);

    if (key === inflightKey) return;

    // 位置变了，之前手动选的港口就作废 —— 那是给上一个地方选的。
    // 回到「按近站点」，近站点到了面板自己切过去。
    if (indexLocation.value && indexLocation.value !== key) {
      selectedHarbor.value = '';
    }

    // 新的一轮取数：近站点还没到齐
    nearestStationResolved.value = false;

    inflightKey = key;
    weatherLoading.value = true;
    indexLoading.value = true;
    weatherError.value = '';
    indexError.value = '';

    indexPending.value = false;

    try {
      const data = await fishingApi.getFishingIndex(target, true);

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
      const message = err instanceof Error ? err.message : '获取数据失败';
      notifyError(message);
      weatherError.value = message;
      indexError.value = message;
      // 失败也算近站点「到齐」—— 不会有更准的站了，面板退到固定港口出图
      nearestStationResolved.value = true;

      // enriched 挂了：近站点等不到，面板退到固定港口出图 ——
      // 别让潮汐图跟着天气一起空掉。
      if (pendingPanelTide) {
        void fetchPanelTide();
      }
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
   * 坐标变了则重取 —— 靠 `indexLocation` 与当前坐标的对比，
   * 所以「在地图页改了坐标再切回来」也会重新取到一份对的。
   *
   * 全应用只有这一条取数入口：地图页不碰它（那边根本不显示这些数据）。
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
   *
   * 分钟降水跟着一起刷：刷新键的语义是「把这里的数据更新一遍」，
   * 而分钟降水恰恰是最吃新鲜度的那一份（两小时的有效期、五分钟一更新）。
   * 两条并行发，不让这张卡排在 enriched 那条重请求后面干等。
   */
  async function refreshIndexData(): Promise<void> {
    const located = await locateUser(true);
    const target = located ?? userLocation.value ?? MAP_CENTER;

    await Promise.all([fetchWeatherAndFishing(target), fetchMinutely(target)]);
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
   * 分钟降水的有效期窗口。
   *
   * 上游每 5 分钟更新一次、服务端缓存 5 分钟 —— 与之对齐，
   * 早了拿到的还是同一份数据，晚了拿到的已经不是刚更新的那份。
   */
  const MINUTELY_TTL = 5 * 60 * 1000;

  /**
   * 分钟降水的 in-flight 守卫。
   *
   * 与天气那条同源：同一坐标在飞时不并发第二个 ——
   * 数据页的 onMounted 与 onPageShow 会在同一刻触发。
   */
  let minutelyInflightKey: string | null = null;

  /** 拉分钟级降水。不传参数时用当前坐标，没有就用默认中心 */
  async function fetchMinutely(location?: LngLat): Promise<void> {
    const target = location ?? userLocation.value ?? MAP_CENTER;
    const key = locationKey(target);

    if (key === minutelyInflightKey) return;

    minutelyInflightKey = key;
    minutelyLoading.value = true;
    minutelyError.value = '';
    // 记的是「最近一次尝试」，成功失败都记 —— 失败的那次也要挡住重试，
    // 否则境外坐标每切一次 tab 就重发一次注定失败的请求。
    minutelyLocation.value = key;
    minutelyFetchedAt.value = Date.now();

    try {
      const data = await fishingApi.getMinutely(target);

      minutelyForecast.value = normalizeMinutely(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取分钟降水失败';
      minutelyError.value = message;
      // 取不到就把旧数据清掉：留着一份几小时前的降水当「接下来的降水」是骗人
      minutelyForecast.value = null;
      /*
       * 这里不弹 toast。
       *
       * 分钟降水只覆盖中国区域，境外坐标必然取不到 —— 每次进页面都弹一次
       * 报错只是打扰，卡片里给出空态就够了。
       */
    } finally {
      if (minutelyInflightKey === key) minutelyInflightKey = null;
      minutelyLoading.value = false;
    }
  }

  /**
   * 数据页取分钟降水。
   *
   * 坐标没变且最近一次尝试还在 5 分钟内就不重取：切回 tab 不该每次都发请求，
   * 但这份数据过了 5 分钟就作废（上游每 5 分钟更新一次），
   * 所以不能像天气那样一直复用。
   */
  async function ensureMinutely(): Promise<void> {
    const located = await locateUser();
    const target = located ?? userLocation.value ?? MAP_CENTER;
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
   * 面板潮汐的 in-flight 守卫。
   *
   * 存在的理由：切港口时 store 的 setter 与组件的 watcher 都会发一次请求，
   * 同一个 URL 打两遍 —— 白费一个往返，两份响应还会先后覆盖面板，
   * 面板上的港口名会闪一下。
   *
   * 同一组「港口+日期」在飞时，后来者直接不发了。
   * 请求结束后守卫就放开，所以过一会儿再取同一组仍然会真的发出去。
   */
  let tideInflightKey: string | null = null;

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
    if (key === tideInflightKey) return;
    tideInflightKey = key;

    tideLoading.value = true;
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
      const message = err instanceof Error ? err.message : '获取潮汐信息失败';
      notifyError(message);
    } finally {
      if (tideInflightKey === key) tideInflightKey = null;
      tideLoading.value = false;
    }
  }

  function setSelectedHarbor(harbor: string): void {
    selectedHarbor.value = harbor;
    void fetchPanelTide(harbor, selectedDate.value);
  }

  function setSelectedDate(date: string): void {
    selectedDate.value = date;
    void fetchPanelTide(activeHarbor.value, date);
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
   * 提交新钓点。
   *
   * 提交成功**不等于**它已经公开：后端把普通用户的投稿置为 pending，
   * 公开列表只放已过审的条目。所以提交完它不会出现在地图上，
   * 只出现在「我的钓点」里，附带审核状态。
   *
   * 失败往上抛，不在这里弹 toast：提交失败时表单要留在原地、告诉用户哪一步没成，
   * 一个 toast 把上下文冲掉了。与 session.login 同策略。
   */
  async function createSpot(payload: CreateFishingSpotPayload): Promise<FishingSpot> {
    const created = await fishingSpotApi.create(payload);

    // 新提的排在最前：它是刚发生的，也是作者最想确认的那一条
    mySpots.value = [created, ...mySpots.value];

    return created;
  }

  /**
   * 拉我提交的钓点。
   *
   * 只有这个端点能看见待审核 / 已驳回的条目 —— 公开列表把 status 写死成 approved。
   *
   * silent = true 时不弹 toast：「我的」页只要一个数量，取不到就当没有，
   * 不必为一个附属信息打断用户（那一页自己会弹，理由见 fetchMySpots 的调用处）。
   */
  async function fetchMySpots(options?: { silent?: boolean }): Promise<void> {
    mySpotsLoading.value = true;
    mySpotsError.value = '';

    try {
      mySpots.value = await fishingSpotApi.listMine();
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载我的钓点失败';
      if (!options?.silent) notifyError(message);
      mySpotsError.value = message;
    } finally {
      mySpotsLoading.value = false;
    }
  }

  /**
   * 清掉我提交的钓点。
   *
   * 退出登录时调用：这些是上一个账号的数据。留着的话，
   * 登出之后「我的」页还会显示着别人的条数。
   */
  function clearMySpots(): void {
    mySpots.value = [];
    mySpotsError.value = '';
  }

  /**
   * 取单条钓点 —— 编辑页回填表单用。
   *
   * 走详情端点而不是从 mySpots 里找：mySpots 只装我提交的那些，
   * 而详情端点还认得「属主看自己待审的那条」这条路径。
   *
   * 用带会话的那个：access token 过期时它会先静默刷一次，
   * 否则属主打开自己待审的钓点只会看到「载入失败」。
   */
  async function fetchSpot(id: string): Promise<FishingSpot> {
    return fishingSpotApi.getByIdWithSession(id);
  }

  /**
   * 更新我提交的钓点。
   *
   * 保存完重新拉一次「我的钓点」：属主改一条没过审的钓点，
   * 后端把它退回 pending 并清掉审核备注 —— 列表里那条的状态变了，
   * 不重拉的话页面上还挂着旧状态，用户会以为没生效。
   */
  async function updateSpot(id: string, payload: UpdateFishingSpotPayload): Promise<void> {
    await fishingSpotApi.update(id, payload);
    await fetchMySpots();
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
    locationError,
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
    // 鱼口概率
    indexData,
    indexLoading,
    indexPending,
    indexError,
    // 钓点标记
    markers,
    spotsLoading,
    spotsError,
    // 我提交的钓点
    mySpots,
    mySpotsLoading,
    mySpotsError,
    clearMySpots,
    // 选中态
    selectedMarker,
    // 动作
    locateUser,
    markLocationDenied,
    fetchWeatherAndFishing,
    ensureWeatherAndFishing,
    refreshIndexData,
    fetchMinutely,
    ensureMinutely,
    fetchPanelTide,
    setSelectedHarbor,
    setSelectedDate,
    fetchSpots,
    createSpot,
    updateSpot,
    fetchSpot,
    fetchMySpots,
    setSelectedMarker,
  };
});
