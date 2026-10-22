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

import { ref, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';

import { fishingApi, fishingSpotApi, type LngLat } from '@/api/fishing';
import {
  toMapMarkers,
  type CreateFishingSpotPayload,
  type UpdateFishingSpotPayload,
  type FishingIndexData,
  type FishingSpot,
  type MapMarker,
  type TideData,
  type WeatherDay,
  type WeatherHourly,
  type WeatherIndex,
  type WeatherNow,
} from '@/types/fishing';
import { formatCompactDate } from '@/utils/date';
import { normalizeWeatherIndices, normalizeWeatherPayload } from '@/utils/weather-normalize';

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

/**
 * 定位授权状态。
 *
 * 三档刚好够用，不必更细：
 * - granted 已授权，getLocation 直接给坐标
 * - denied  用户明确拒绝过，微信不会再弹权限窗，只剩设置页一条路
 * - unset   从没问过（第一次进小程序就是这个），getLocation 会弹授权窗
 */
type LocationAuth = 'granted' | 'denied' | 'unset';

/**
 * 问微信当前的定位授权状态。
 *
 * 不靠 getLocation 的 errMsg 猜「是不是被拒了」—— 那些文案是微信的内部实现，
 * 换个基础库版本就变。这里读的是授权状态本身，语义稳定。
 *
 * 查不到就当没问过：让 getLocation 自己去弹窗，别在这儿替微信做决定。
 */
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
   * 定位键据此染红：按了没反应这件事必须看得见，
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
   * 生活指数（和风官方指数，含钓鱼指数）。
   *
   * 来自 enriched 响应的 `weather_indices`。这一项以前恒为空数组 ——
   * 那时后端根本没往外给，模型只能自己从温度气压反推，丢掉了
   * 「官方说今天适宜垂钓」这个最强的信号。
   */
  const weatherIndices = shallowRef<WeatherIndex[]>([]);

  // 潮汐（随 enriched 响应一并带回）
  const tideData = shallowRef<TideData | null>(null);

  // 潮汐面板：港口和日期可选，单独取数
  const panelTideData = shallowRef<TideData | null>(null);
  const panelTideSpotName = ref<string>(HARBOR_OPTIONS[0].name);
  const tideLoading = ref(false);
  const selectedHarbor = ref<string>(HARBOR_OPTIONS[0].code);
  const selectedDate = ref(formatCompactDate());

  // 钓鱼指数
  const indexData = shallowRef<FishingIndexData | null>(null);
  const indexLoading = ref(false);
  const indexError = ref('');

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
              // 被拒不是「出错」，是用户做了决定。图标染红，但别拿一句报错去打扰他
              locationError.value = '';
            } else {
              // 保留上一次的坐标，靠图标染红告诉用户「定位键按了没用」
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
   * 设置页里没开权限时用 —— 这时用户已经明确表态了，定位键就该一直留在染红状态，
   * 别让它看起来「点了没反应」。
   */
  function markLocationDenied(): void {
    locationDenied.value = true;
    locationError.value = '';
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

      /*
       * 归一放在 store 边界：上游换成了和风新一代（数值 + 嵌套对象），
       * 而组件和 AI 分析载荷要的一直是扁平的视图模型。
       * 换算全在 `utils/weather-normalize` 里做，这里只调一次 ——
       * 组件一行都不用改，后端 `app/schemas/aiagent.py` 认的字段形状也就没变。
       */
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
   */
  async function fetchMySpots(): Promise<void> {
    mySpotsLoading.value = true;
    mySpotsError.value = '';

    try {
      mySpots.value = await fishingSpotApi.listMine();
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载我的钓点失败';
      notifyError(message);
      mySpotsError.value = message;
    } finally {
      mySpotsLoading.value = false;
    }
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
    // 我提交的钓点
    mySpots,
    mySpotsLoading,
    mySpotsError,
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
    createSpot,
    updateSpot,
    fetchSpot,
    fetchMySpots,
    setSelectedMarker,
  };
});
