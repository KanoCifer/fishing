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
 * 和风天气的字段全部是字符串数值（如 temp: "29"）。
 * 这是上游的数据形状，不在这里转成 number —— 各消费点要什么精度自己转，
 * 免得某一处转了另一处没转，出错时找不到源头。
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
// 钓鱼指数 / 反馈
// ---------------------------------------------------------------------------

export type FishingLevel = '爆护' | '好' | '一般' | '差' | '空军';
export type FishingIndexLevel = FishingLevel | '极好';
export type FishingFeedbackLevel = FishingLevel;

/**
 * `enriched=true` 时后端会顺带回传天气和潮汐数据，
 * 省掉一次 weather/full 请求 —— 后端对同一 location 重复取数。
 */
export interface FishingIndexData {
  fishing_index: number;
  expert_score: number;
  residual: number;
  level: FishingIndexLevel;
  feature_breakdown: Record<string, number>;
  current_weather?: WeatherNow;
  forecasts?: WeatherDay[];
  location_name?: string;
  tide_data?: TideData;
  hourly_weather?: { hourly?: WeatherHourly[] };
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
 * WeatherAnalysisPayload / FishingScores / AnalysisChunk —— AI 分析链路，
 * 本期不做。
 *
 * RouteInfo / SecurityKeyResponse / RegeoResponseData / PoiItem —— 路线规划
 * 和高德 JS API 的产物，本期不做。相关端点 `v3/amap/security-key` 也不用接了：
 * 小程序端没有高德 JS SDK，不需要安全密钥。
 *
 * SpotPicture / SpotEditorDraft / SPOT_MAX_* —— 钓点编辑器的 view-model。
 * 小程序端的编辑器形态还没定（选图走 chooseImage + uploadFile 是另一套设计），
 * 等编辑器真要写时按实际需要加。
 */
