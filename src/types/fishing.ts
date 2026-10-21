/**
 * 钓点域类型 —— 从源项目 `@readinglist/types/fishing` 裁剪而来。
 *
 * 裁剪原则：类型名和字段名一律保持与后端 DTO 一致，不改名。
 * 一旦本地叫法跟后端对不上，排查问题时会先怀疑类型而不是怀疑字段名，白花半天。
 *
 * 数据来源：和风天气 API（天气）+ 国家海洋预报台（潮汐）+ 后端 fishing_index 接口。
 * 单一真源在后端，本文件只描述网络层数据，不夹带 view 派生字段。
 */

// ---------------------------------------------------------------------------
// 钓点 DTO
// ---------------------------------------------------------------------------

/**
 * 钓点水体类型 —— 与 go-backend `document.Kind*` 常量共用同一组字面量。
 * 三值封闭：新增类型须同步后端校验枚举。
 */
export type FishingSpotKind = 'lake' | 'river' | 'reservoir';

/** 有序全集 —— kind 过滤 chips 按此顺序渲染 */
export const FISHING_SPOT_KINDS: readonly FishingSpotKind[] = ['lake', 'river', 'reservoir'] as const;

/** 中文展示 label —— UI 层唯一文案来源，勿在组件内内联硬编码 */
export const FISHING_SPOT_KIND_LABELS: Readonly<Record<FishingSpotKind, string>> = {
  lake: '湖泊',
  river: '溪流·江',
  reservoir: '水库',
};

export interface FishingSpot {
  id: string;
  name: string;
  description: string;
  /** [lng, lat]，GCJ-02 */
  location: [number, number];
  /**
   * 水体类型。
   *
   * 可选且可空：后端序列化时对 nullable 字段用了 omitempty，值为 null 时整个字段
   * 不会被发出来（实测 `GET /v3/fish/spots` 的返回对象只有 id / name / description /
   * location / tags / rating / images 七个键）。遗留行经迁移按名字启发式回填，
   * 没匹配上的就是缺这个字段，UI 按未分类渲染。
   *
   * 别把它当必填 —— 真按必填写，map 上按 kind 上色的逻辑会在第一条数据上就崩。
   */
  kind?: FishingSpotKind | null;
  tags: string[];
  rating: number;
  images: string[];
  created_at?: string;
  updated_at?: string;
}

/** 钓点业务字段（location 除外）—— MapMarker.extraData 的精确类型 */
export type SpotDetail = Omit<FishingSpot, 'location'>;

/**
 * 创建钓点载荷。name / location / kind 必填（后端 oneof 校验），其余可选。
 */
export interface CreateFishingSpotPayload {
  name: string;
  /** [lng, lat] */
  location: [number, number];
  kind: FishingSpotKind;
  description?: string;
  tags?: string[];
  rating?: number;
  images?: string[];
}

/** 更新钓点载荷。全字段可选：未传 = 不动，传了 = 显式覆盖。 */
export type UpdateFishingSpotPayload = Partial<CreateFishingSpotPayload>;

// ---------------------------------------------------------------------------
// 地图标记
// ---------------------------------------------------------------------------

/**
 * 地图标记点 DTO —— 不耦合任何地图 SDK。
 *
 * 和源项目的差异：砍掉了 `content`（marker HTML 字符串）和 `offset`（像素偏移）。
 * 那两个字段是高德 JS API 独有的 —— 小程序 `<map>` 的 marker 只接受 `iconPath`
 * 图片路径，塞不进 HTML。marker 图标怎么生成由地图层负责，这里只保留业务数据。
 */
export interface MapMarker {
  /** [lng, lat]，GCJ-02 */
  position: [number, number];
  /** 水体类型 —— 标记配色 / 过滤的唯一依据，故提升到顶层而非只藏在 extraData 里 */
  kind: FishingSpotKind | null;
  /** 钓点业务数据，缺省时说明这条 marker 不是从钓点列表来的（如用户当前位置） */
  extraData?: SpotDetail;
}

/**
 * FishingSpot DTO → MapMarker。
 * location 拆成 position，kind 提升到顶层，其余字段收进 extraData。
 *
 * 后端可能整条不发 `kind`（见 FishingSpot.kind 注释），这里归一成 null ——
 * MapMarker.kind 的契约是「一定有值，为 null 表示未分类」，
 * 让消费方区分 undefined 和 null 没有意义，只会在每个上色分支里多判一次。
 *
 * 纯函数、无副作用。
 */
export function toMapMarker(spot: FishingSpot): MapMarker {
  const { location, ...rest } = spot;
  return {
    position: location,
    kind: spot.kind ?? null,
    extraData: rest,
  };
}

/** 批量 transform —— `fishingSpotApi.list()` 的结果直接喂给本函数 */
export function toMapMarkers(spots: FishingSpot[]): MapMarker[] {
  return spots.map(toMapMarker);
}

// ---------------------------------------------------------------------------
// 潮汐
// ---------------------------------------------------------------------------

export interface TideTableItem {
  fxTime: string;
  /** 后端返回数字或字符串，消费方一律过 Number() */
  height: number | string;
  /** H 高潮 / L 低潮 */
  type: 'H' | 'L';
}

export interface TideData {
  updateTime: string;
  tideTable: TideTableItem[];
  tideHourly: Array<{ fxTime: string; height: number | string }>;
}

/** v3 潮汐接口的包装层：data 内含缓存命中标记 */
export interface TideApiEnvelope {
  data: TideData;
  fromCache: boolean;
}

// ---------------------------------------------------------------------------
// 天气
// ---------------------------------------------------------------------------

/**
 * 天气**视图模型** —— 组件、store、AI 分析载荷用的都是这一套。
 *
 * 字段全是字符串（如 temp: "29"）：渲染时直接拼字符串，
 * 各消费点要什么精度自己转，免得某一处转了另一处没转，出错时找不到源头。
 *
 * 这不是上游的数据形状 —— 上游新一代是「数值 + 嵌套对象」，
 * wire 类型在文件下方，换算在 `src/utils/weather-normalize.ts`。
 */
export interface WeatherNow {
  obsTime: string;
  temp: string;
  feelsLike: string;
  icon: string;
  text: string;
  wind360: string;
  windDir: string;
  windScale: string;
  windSpeed: string;
  humidity: string;
  precip: string;
  pressure: string;
  vis: string;
  cloud: string;
  dew: string;
}

export interface WeatherHourly {
  fxTime: string;
  temp?: string;
  precip?: string;
  humidity?: string;
  pressure?: string;
  windDir?: string;
  windScale?: string;
  windSpeed?: string;
  text?: string;
  icon?: string;
}

export interface WeatherDay {
  fxDate: string;
  sunrise: string;
  sunset: string;
  moonrise: string;
  moonset: string;
  moonPhase: string;
  tempMax: string;
  tempMin: string;
  iconDay: string;
  textDay: string;
  iconNight: string;
  textNight: string;
  wind360Day: string;
  windDirDay: string;
  windScaleDay: string;
  windSpeedDay: string;
  wind360Night: string;
  windDirNight: string;
  windScaleNight: string;
  windSpeedNight: string;
  humidity: string;
  precip: string;
  pressure: string;
  vis: string;
  cloud: string;
  uvIndex: string;
}

/** 生活指数 —— `FishingIndexCard` 的指标列表数据源 */
export interface WeatherIndex {
  date: string;
  type: string;
  name: string;
  level: string;
  category: string;
  text: string;
}

// ---------------------------------------------------------------------------
// 天气 wire 类型（和风天气新一代 /weather/v1/*）
// ---------------------------------------------------------------------------

/**
 * 新一代和风天气的 wire 形状 —— 与上面的视图模型是两套东西，别混用。
 *
 * 新接口把数值和单位拆开（`{ value, unit }`）、把风向风速嵌套成对象，
 * 湿度和云量给的是 [0,1] 的比例，风速用 m/s、能见度用 m，
 * 一天还拆成白天 / 夜间两段，各自带一套天气和风。
 *
 * 视图模型是「给组件看的扁平字符串」，wire 是「接口给什么就是什么」。
 * 两者之间的换算集中在 `src/utils/weather-normalize.ts`，
 * 组件与 store 一律只碰视图模型。
 *
 * 字段一律可选：上游会缺字段（某时段无降水就没有 precipitation），
 * 按必填写会在真实响应上直接崩。
 */

/** 带单位的数值 —— 新接口的数值都是这个形状，不是裸数字 */
export interface WeatherMeasureV1 {
  value?: number;
  unit?: string;
}

/** 天气现象：中文描述 + 和风天气码 */
export interface WeatherConditionV1 {
  text?: string;
  code?: string;
}

/** 风：方向（角度 + 16 方位代码）、速度、风力等级 */
export interface WeatherWindV1 {
  direction?: { degree?: number; compass?: string };
  speed?: WeatherMeasureV1;
  scale?: number;
}

/** 降水：降水量、强度、降水概率、降水类型 */
export interface WeatherPrecipitationV1 {
  amount?: WeatherMeasureV1;
  intensity?: WeatherMeasureV1;
  probability?: number;
  type?: string;
}

/** 新版实时天气块 —— `enriched` 响应的 `current_weather` 就是它 */
export interface WeatherCurrentV1 {
  metadata?: { tag?: string; attributions?: string[] };
  condition?: WeatherConditionV1;
  temperature?: WeatherMeasureV1;
  feelsLike?: WeatherMeasureV1;
  /** [0,1] 的比例，0.53 = 53% */
  humidity?: number;
  wind?: WeatherWindV1;
  windGust?: WeatherMeasureV1;
  precipitation?: WeatherPrecipitationV1;
  pressure?: WeatherMeasureV1;
  visibility?: WeatherMeasureV1;
  dewPoint?: WeatherMeasureV1;
  /** [0,1] 的比例 */
  cloudCover?: number;
  uvIndex?: number;
}

/** 新版逐时条目 */
export interface WeatherHourlyV1 {
  forecastTime?: string;
  condition?: WeatherConditionV1;
  temperature?: WeatherMeasureV1;
  feelsLike?: WeatherMeasureV1;
  humidity?: number;
  wind?: WeatherWindV1;
  windGust?: WeatherMeasureV1;
  precipitation?: WeatherPrecipitationV1;
  pressure?: WeatherMeasureV1;
  visibility?: WeatherMeasureV1;
  dewPoint?: WeatherMeasureV1;
  cloudCover?: number;
  uvIndex?: number;
}

/** 新版逐时块 —— `enriched` 响应的 `hourly_weather` 就是它 */
export interface WeatherHourlyBlockV1 {
  metadata?: { tag?: string; attributions?: string[] };
  hours?: WeatherHourlyV1[];
}

/** 新版日预报里的白天 / 夜间时段 —— 两段结构同构 */
export interface WeatherDaySegmentV1 {
  forecastStartTime?: string;
  forecastEndTime?: string;
  condition?: WeatherConditionV1;
  temperatureMax?: WeatherMeasureV1;
  temperatureMin?: WeatherMeasureV1;
  humidity?: number;
  wind?: WeatherWindV1;
  windGustMax?: WeatherMeasureV1;
  precipitation?: WeatherPrecipitationV1;
  cloudCover?: number;
}

/** 天文现象 —— 日出日落、月相都在这里 */
export interface WeatherAstroV1 {
  sunrise?: string;
  sunset?: string;
  moonrise?: string;
  moonset?: string;
  /** 月相代码，如 'waxing-gibbous' */
  moonPhase?: string;
}

/** 新版日预报条目 */
export interface WeatherDayV1 {
  forecastStartTime?: string;
  forecastEndTime?: string;
  astro?: WeatherAstroV1;
  temperatureMax?: WeatherMeasureV1;
  temperatureMin?: WeatherMeasureV1;
  temperatureAvg?: WeatherMeasureV1;
  uvIndexMax?: number;
  daytime?: WeatherDaySegmentV1;
  nighttime?: WeatherDaySegmentV1;
}

/** 新版日预报块 */
export interface WeatherDailyBlockV1 {
  metadata?: { tag?: string; attributions?: string[] };
  days?: WeatherDayV1[];
}

// ---------------------------------------------------------------------------
// AI 分析
// ---------------------------------------------------------------------------

/**
 * AI 分析的输入载荷 —— 对应 `POST /v2/llm/weather-analysis` 的 `weather_data`。
 *
 * 字段名与后端 DTO 保持一致（见文件头的裁剪原则），不做本地改名。
 *
 * 这份载荷是「把已经拿到的数据换个形状送出去」，不重新取数 ——
 * 天气和潮汐都已经在 store 里了，再取一次是白花一次往返。
 */
export interface WeatherAnalysisPayload {
  liveWeather?: WeatherNow | null;
  forecasts?: WeatherDay[];
  tideData?: TideData | null;
  weatherIndices?: WeatherIndex[];
  fishingIndex?: FishingIndexData;
  locationName?: string;
  tideSpotName?: string;
  /** 生成时刻，字符串直传（后端不解析，只做展示） */
  generatedAt?: string;
}

// ---------------------------------------------------------------------------
// 钓鱼指数 / 反馈
// ---------------------------------------------------------------------------

export type FishingLevel = '爆护' | '好' | '一般' | '差' | '空军';
export type FishingIndexLevel = FishingLevel | '极好';
export type FishingFeedbackLevel = FishingLevel;

/**
 * `enriched=true` 时后端会顺带回传天气和潮汐数据，
 * 省掉一次 weather/full 请求 —— 后端对同一 location 重复取数。
 *
 * 天气三块是**和风新一代的 wire 形状**（数值 + 嵌套对象），
 * 不是视图模型 —— 组件要的是扁平字符串，归一在 store 边界做
 * （见 `src/utils/weather-normalize.ts`）。
 * 潮汐仍是 v7 的扁平结构，没换接口，不用归一。
 */
export interface FishingIndexData {
  fishing_index: number;
  expert_score: number;
  residual: number;
  level: FishingIndexLevel;
  feature_breakdown: Record<string, number>;
  /** 新版 current 块 */
  current_weather?: WeatherCurrentV1 | null;
  /** 新版日预报条目数组 */
  forecasts?: WeatherDayV1[] | null;
  location_name?: string;
  tide_data?: TideData;
  /** 新版逐时块 */
  hourly_weather?: WeatherHourlyBlockV1 | null;
  /**
   * 生活指数（和风 v7 `/v7/indices/1d` 的 daily 条目，原样透传）。
   *
   * 这一块官方至今没出新版，字段（date/type/name/level/category/text）本来就是
   * 扁平的，与视图模型 `WeatherIndex` 一一对应 —— 不需要换算，塞进 AI 载荷即可。
   *
   * 缺这一项不是「少块 UI」，是 AI 拿不到「官方说今天适宜垂钓」这个最强信号，
   * 只能自己从温度气压反推 —— 后端读入侧也是同样的口径。
   */
  weather_indices?: WeatherIndex[] | null;
}

/** 一项子特征的展示形态 —— 原始值 + 归一化后的相对水位 */
export interface FeatureTile {
  key: string;
  label: string;
  /** 后端原始值，量纲随子项而变（气温是 20、湿度是 80） */
  value: number;
  /** 0~100，相对本组内最大值的比例 */
  percent: number;
}

/**
 * `feature_breakdown` 的 key → 中文 label。
 *
 * 和 FISHING_SPOT_KIND_LABELS 一个道理：中文文案只在 types 里定义一次。
 * 特征明细面板和数据页的构成图都要展示这些 key，两边各写一张表，
 * 迟早会出现「面板改了、图没改」的不一致。
 */
export const FEATURE_BREAKDOWN_LABELS: Readonly<Record<string, string>> = {
  w1_temp: '气温',
  w2_humidity: '湿度',
  w3_pressure: '气压',
  w4_wind: '风速',
  w5_rain: '降水',
  w6_tide_rising: '涨潮',
  w7_hours_to_tide: '距潮',
  w8_tide_range: '潮差',
  w9_indices: '指数',
};

/**
 * 特征明细归一化。
 *
 * 为什么必须归一化：钓鱼指数是加权求和，各子项量纲不一（气温 20 和湿度 80 不能直接比），
 * 只有换成「本组内的相对水位」才能横向比较和上色。
 * 进度条分档和构成图的纵轴共用这一份算法，别在两处各算一遍。
 */
export function toFeatureTiles(breakdown: Record<string, number> | undefined): FeatureTile[] {
  const entries = Object.entries(breakdown ?? {});
  if (!entries.length) return [];

  // 一次算出最大值，避免每个 tile 里重算整组
  const max = Math.max(...entries.map(([, value]) => value));

  return entries.map(([key, value]) => ({
    key,
    // 后端加了新特征而这张表还没跟上时退回 key 本身，总好过渲染成空白
    label: FEATURE_BREAKDOWN_LABELS[key] ?? key,
    value,
    percent: max > 0 ? Math.round((value / max) * 100) : 50,
  }));
}

export interface FishingFeedbackPayload {
  location_id: string;
  location_name: string;
  fishing_time: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  wind_speed?: number;
  precipitation?: number;
  indices?: number;
  tide_level?: number;
  tide_type?: '涨潮' | '退潮';
  tide_range?: number;
  hours_to_next_tide?: number;
  feedback: FishingFeedbackLevel;
}

export interface FishingFeedbackResponse {
  success: boolean;
  record_id: string;
  expert_score: number;
  residual: number;
}

export interface FishingStats {
  total_records: number;
  latest_record_time: string | null;
}

/*
 * ── 裁掉的部分及原因 ────────────────────────────────────────────────
 *
 * WeatherFullResponse / WeatherForecastResponse / WeatherLiveResponse /
 * WeatherIndicesResponse —— v3/weather/full 的原始信封。本项目只用
 * `fishing/index?enriched=true` 一个入口取天气（信封里那份 indices 后端也不填），
 * 单独再调 weather/full 只会多一次后端往返。真要拆开调时再把这几个类型加回来。
 *
 * FishingScores / AnalysisChunk —— 分数明细与分片类型，AI 分析链路用不到。
 * AI 分析的载荷见上面的 WeatherAnalysisPayload。
 *
 * RouteInfo / SecurityKeyResponse / RegeoResponseData / PoiItem —— 路线规划
 * 和高德 JS API 的产物，本期不做。相关端点 `v3/amap/security-key` 也不用接了：
 * 小程序端没有高德 JS SDK，不需要安全密钥。
 *
 * SpotPicture / SpotEditorDraft / SPOT_MAX_* —— 钓点编辑器的 view-model。
 * 小程序端的编辑器形态还没定（选图走 chooseImage + uploadFile 是另一套设计），
 * 等编辑器真要写时按实际需要加。
 */
