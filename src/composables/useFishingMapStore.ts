/**
 * 钓点图状态 —— 全局单例。
 *
 * 从源项目 zustand store 迁过来。选 `reactive` 单例而不是每个组件 `ref` 一份：
 * 天气、潮汐、钓点三块数据的消费方分散在地图、面板、详情页多个层级，
 * 要的是"同一份数据只有一份"，让它们各自 ref 迟早会各拉各的接口。
 *
 * 本期不含路线规划状态（routeMapStore）和 AI 分析状态（AnalysisContext），
 * 对应功能已确认不做。
 */

import { reactive } from 'vue'

import { ApiError } from '@/api/client'
import { fishingApi, fishingSpotApi, type LngLat } from '@/api/fishing'
import {
  toMapMarkers,
  type FishingIndexData,
  type MapMarker,
  type TideData,
  type WeatherDay,
  type WeatherHourly,
  type WeatherIndex,
  type WeatherNow,
} from '@/types/fishing'
import { formatCompactDate } from '@/utils/date'

/** 潮汐可选港口。code 是国家海洋预报台的站点编号 */
export const HARBOR_OPTIONS = [
  { code: 'P2352', name: '黄埔港' },
  { code: 'P2932', name: '舢舨洲' },
  { code: 'P2299', name: '南沙港' },
  { code: 'P2474', name: '海沁' },
  { code: 'P2609', name: '东沙' },
] as const

/** 天气指数的默认中心（广州珠江口），定位成功前先用它出数据 */
export const MAP_CENTER: LngLat = [113.389549, 23.050067]

/** toast 标题超长会被截断成省略号，反而看不出是哪条错了 */
const TOAST_TITLE_MAX = 14

function notifyError(message: string): void {
  uni.showToast({
    title: message.length > TOAST_TITLE_MAX
      ? `${message.slice(0, TOAST_TITLE_MAX)}…`
      : message,
    icon: 'none',
    duration: 2500,
  })
}

interface FishingMapState {
  // 天气（来自 fishing/index enriched 响应）
  liveWeather: WeatherNow | null
  forecasts: WeatherDay[]
  weatherHourly: WeatherHourly[]
  locationName: string
  weatherLoading: boolean
  weatherError: string
  /**
   * 生活指数。enriched 响应不含这一项，恒为空数组，
   * UI 按空态渲染 —— 别在别处假设它有值。
   */
  weatherIndices: WeatherIndex[]

  // 潮汐（随 enriched 响应一并带回）
  tideData: TideData | null

  // 潮汐面板：港口和日期可选，单独取数
  panelTideData: TideData | null
  panelTideSpotName: string
  tideLoading: boolean
  selectedHarbor: string
  selectedDate: string

  // 钓鱼指数
  indexData: FishingIndexData | null
  indexLoading: boolean
  indexError: string

  // 钓点标记
  markers: MapMarker[]
  spotsLoading: boolean
  spotsError: string

  /**
   * 当前选中的钓点。
   *
   * 放 store 而不是地图页的局部 state：选中动作发生在钓点页（点 marker），
   * 消费方却是数据页的钓鱼反馈表单，两边跨页了。跨页只能靠 URL 传，
   * 而 URL 带 marker 还得额外处理刷新和失效，不如共享状态直接。
   */
  selectedMarker: MapMarker | null
}

const state = reactive<FishingMapState>({
  liveWeather: null,
  forecasts: [],
  weatherHourly: [],
  locationName: '',
  weatherLoading: false,
  weatherError: '',
  weatherIndices: [],

  tideData: null,

  panelTideData: null,
  panelTideSpotName: HARBOR_OPTIONS[0].name,
  tideLoading: false,
  selectedHarbor: HARBOR_OPTIONS[0].code,
  selectedDate: formatCompactDate(),

  indexData: null,
  indexLoading: false,
  indexError: '',

  markers: [],
  spotsLoading: false,
  spotsError: '',

  selectedMarker: null,
})

/**
 * 拉钓鱼指数（enriched=true 附带天气和潮汐）。
 *
 * 定位到位后重新调一次，中心点那次的结果会被覆盖。
 */
async function fetchWeatherAndFishing(location: LngLat): Promise<void> {
  state.weatherLoading = true
  state.indexLoading = true
  state.weatherError = ''
  state.indexError = ''

  try {
    const data = await fishingApi.getFishingIndex(location, true)
    const now = data.current_weather ?? null
    const nameFromEnriched = data.location_name?.trim()

    state.liveWeather = now
    state.forecasts = data.forecasts ?? []
    state.weatherHourly = data.hourly_weather?.hourly ?? []
    state.locationName =
      nameFromEnriched || (now?.text ? '当前位置' : '钓鱼地点')
    state.tideData = data.tide_data ?? null
    state.indexData = data

    state.weatherLoading = false
    state.indexLoading = false
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取数据失败'
    notifyError(message)
    state.weatherError = message
    state.indexError = message
    state.weatherLoading = false
    state.indexLoading = false
  }
}

/** 拉面板潮汐。不传参数时沿用当前选中的港口和日期 */
async function fetchPanelTide(
  harbor?: string,
  date?: string,
): Promise<void> {
  const harborToUse = harbor ?? state.selectedHarbor
  const dateToUse = date ?? state.selectedDate

  state.tideLoading = true
  try {
    const data = await fishingApi.getTideData({
      harbor: harborToUse,
      date: dateToUse,
    })
    const harborOption = HARBOR_OPTIONS.find((o) => o.code === harborToUse)

    state.panelTideData = data
    state.panelTideSpotName = harborOption?.name ?? HARBOR_OPTIONS[0].name
    state.tideLoading = false
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取潮汐信息失败'
    notifyError(message)
    state.tideLoading = false
  }
}

function setSelectedHarbor(harbor: string): void {
  state.selectedHarbor = harbor
  void fetchPanelTide(harbor, state.selectedDate)
}

function setSelectedDate(date: string): void {
  state.selectedDate = date
  void fetchPanelTide(state.selectedHarbor, date)
}

/** 拉钓点列表并转成地图标记 */
async function fetchSpots(): Promise<void> {
  state.spotsLoading = true
  state.spotsError = ''

  try {
    const spots = await fishingSpotApi.list()
    state.markers = toMapMarkers(spots)
    state.spotsLoading = false
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载钓点失败'
    notifyError(message)
    state.spotsError = message
    state.spotsLoading = false
  }
}

/**
 * 改标记。支持传新数组或 updater 函数 ——
 * 钓点编辑/删除后要按 id 局部换掉一条，直接给整个数组等于把对象引用换掉，
 * 地图层会收到一次全量 diff 重渲染。
 */
function setMarkers(
  updater: MapMarker[] | ((prev: MapMarker[]) => MapMarker[]),
): void {
  state.markers =
    typeof updater === 'function'
      ? updater(state.markers)
      : updater
}

/**
 * 记录当前选中的钓点（点 marker 时调用），传 null 表示取消选中。
 *
 * 与 setMarkers 分开而不是合成一个，是因为选中态只改一个引用，
 * 不该顺带触发地图标记的全量 diff。
 */
function setSelectedMarker(marker: MapMarker | null): void {
  state.selectedMarker = marker
}

/** 把网络层错误转成可展示文案，页面里不用重复判断 ApiError */
export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export function useFishingMapStore() {
  return {
    state,
    fetchWeatherAndFishing,
    fetchPanelTide,
    setSelectedHarbor,
    setSelectedDate,
    fetchSpots,
    setMarkers,
    setSelectedMarker,
  }
}
