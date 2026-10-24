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
 * 钓点水体类型 —— 与 go-backend `model.FishingSpotKind*` 常量共用同一组字面量。
 * 八值封闭：新增类型须同步后端校验枚举（dto 的 oneof 标签 + IsValidFishingSpotKind）。
 *
 * 分组只是给人看的，代码不区分 —— kind 是扁平字符串，没有层级，筛选就是等值匹配：
 *
 *   自然：lake / river / reservoir
 *   人工与半自然：pond
 *   海水：sea / bay / estuary
 *   经营：fishing_ground（钓场 —— 它是经营形态而非水体类型，见下）
 *
 * 钓场按 kind 处理是有意为之，不是分类学上的偷懒：用户找钓位时想的是「附近有哪些钓场」，
 * 而不是「附近有哪些水体、其中哪些在经营」。而 kind 字段本来就是宽松的地点标签 ——
 * river 的 label 就是「溪流·江」，把江河溪流打包了。
 */
export type FishingSpotKind = 'lake' | 'river' | 'reservoir' | 'pond' | 'sea' | 'bay' | 'estuary' | 'fishing_ground';

/**
 * 有序全集 —— kind 过滤 chips 按此顺序渲染。
 *
 * 顺序按「先自然、后海水、最后经营」排：钓鱼的人按场景找钓位，
 * 湖泊河流水库在最前，钓场这类经营场地在最后。
 */
export const FISHING_SPOT_KINDS: readonly FishingSpotKind[] = [
  'lake',
  'river',
  'reservoir',
  'pond',
  'sea',
  'bay',
  'estuary',
  'fishing_ground',
] as const;

/** 中文展示 label —— UI 层唯一文案来源，勿在组件内内联硬编码 */
export const FISHING_SPOT_KIND_LABELS: Readonly<Record<FishingSpotKind, string>> = {
  lake: '湖泊',
  river: '溪流·江',
  reservoir: '水库',
  pond: '池塘·野塘',
  sea: '海洋·近海',
  bay: '海湾',
  estuary: '河口',
  fishing_ground: '钓场',
};

/** 未分类 —— 后端 omitempty 把 kind 整个省略了（见 FishingSpot.kind 注释） */
export const FISHING_SPOT_KIND_UNKNOWN_LABEL = '未分类';

/**
 * 收费情况 —— 与后端 `dto.FishingSpotRequest.FeeType` 的 oneof 校验同集合。
 * 三值封闭：free / paid / unknown。
 */
export type FishingSpotFeeType = 'free' | 'paid' | 'unknown';

/** 道路情况 —— 后端 oneof 校验同集合：good / fair / bad / unknown */
export type FishingSpotRoadCondition = 'good' | 'fair' | 'bad' | 'unknown';

/** 能否车到水边 —— 后端 oneof 校验同集合：yes / no / unknown */
export type FishingSpotCarAccess = 'yes' | 'no' | 'unknown';

/** 审核状态 —— 与后端 `model.FishingSpotStatus` 同集合。公开列表里恒为 approved */
export type FishingSpotStatus = 'pending' | 'approved' | 'rejected';

/**
 * 审核状态 label —— 「我的钓点」页的徽标。
 *
 * 三个状态与上面那个类型一一对应。措辞按「作者看到的是什么」来定：
 * rejected 说的是「未通过」而不是「被拒绝」—— 用户还要能改完再交，
 * 「被拒绝」听起来像这件事到此为止了。
 */
export const FISHING_SPOT_STATUS_LABELS: Readonly<Record<FishingSpotStatus, string>> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
};

export const FISHING_SPOT_FEE_LABELS: Readonly<Record<FishingSpotFeeType, string>> = {
  free: '免费',
  paid: '收费',
  unknown: '未知',
};

export const FISHING_SPOT_ROAD_LABELS: Readonly<Record<FishingSpotRoadCondition, string>> = {
  good: '好 · 全程公路',
  fair: '一般 · 部分土路',
  bad: '差 · 需徒步',
  unknown: '未知',
};

export const FISHING_SPOT_CAR_LABELS: Readonly<Record<FishingSpotCarAccess, string>> = {
  yes: '能',
  no: '车到不了',
  unknown: '未知',
};

/**
 * 收费 label。`fee_type` 是 paid 时把金额带上。
 *
 * 认不出的值一律按 unknown 兜底 —— 遗留行从 Mongo 迁过来时这几个字段可能是空串，
 * 而空串不在 oneof 的三值里，不兜底就会在界面上留一个空白格。
 */
export function fishingSpotFeeLabel(fee: string | null | undefined, amount?: number | null): string {
  const key = (fee ?? 'unknown') as FishingSpotFeeType;
  if (key === 'paid') {
    return amount !== null && amount !== undefined ? `收费 ¥${amount}` : '收费';
  }
  return FISHING_SPOT_FEE_LABELS[key] ?? FISHING_SPOT_FEE_LABELS.unknown;
}

/** 道路情况 label */
export function fishingSpotRoadLabel(road: string | null | undefined): string {
  const key = (road ?? 'unknown') as FishingSpotRoadCondition;
  return FISHING_SPOT_ROAD_LABELS[key] ?? FISHING_SPOT_ROAD_LABELS.unknown;
}

/** 车到水边 label */
export function fishingSpotCarLabel(car: string | null | undefined): string {
  const key = (car ?? 'unknown') as FishingSpotCarAccess;
  return FISHING_SPOT_CAR_LABELS[key] ?? FISHING_SPOT_CAR_LABELS.unknown;
}

/**
 * 水体类型 label。
 *
 * 认不出的值一律按未分类兜底 —— 后端扩了枚举而前端还没跟上时，
 * 落成「未分类」比落成一个空白格好。
 *
 * 参数收 `string` 而不是 `FishingSpotKind`：后端发来的值编译器管不着
 * （接口数据不是联合类型就是联合类型），这里在运行时兜住。
 * 组件里别自己 `as FishingSpotKind` 再查表 —— 那个断言会骗过编译器，
 * 认不出的值就变成了 undefined。
 */
export function fishingSpotKindLabel(kind: string | null | undefined): string {
  return FISHING_SPOT_KIND_LABELS[kind as FishingSpotKind] ?? FISHING_SPOT_KIND_UNKNOWN_LABEL;
}

/**
 * 属主快照 —— 昵称与头像都存在钓点主表里（后端 fillOwner 冗余写入）。
 * 快照让钓点在作者注销后仍显示"谁分享的"，列表查询也不必 JOIN user/profile。
 */
export interface FishingSpotOwner {
  user_id: number;
  name: string;
  /** 头像 URL，omitempty —— 没设过头像时整个字段不发 */
  avatar?: string;
}

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
  /** 文字地址。后端 omitempty，没填就不发 */
  address?: string;
  /** 审核状态。公开接口恒为 approved，待审核 / 已驳回只有属主和管理员看得到 */
  status?: FishingSpotStatus;
  /** 审核备注 —— 管理员驳回时写给作者的原因 */
  review_note?: string;
  /** 归属。没有属主时为 nil，整个字段不发 */
  owner?: FishingSpotOwner | null;
  /** 收费情况 */
  fee_type?: FishingSpotFeeType;
  /** 收费金额（元）。只有 fee_type 为 paid 时才有值 */
  fee_amount?: number | null;
  /** 适合的钓法：路亚 / 手竿 / 夜钓 … */
  suitable_for?: string[];
  /** 道路情况 */
  road_condition?: FishingSpotRoadCondition;
  /** 能否车到水边 */
  car_access?: FishingSpotCarAccess;
  /** 开放时间，如"全天" / "06:00-18:00"。omitempty */
  opening_hours?: string;
  /** 参与评分人数 */
  rating_count?: number;
  /** 浏览量 */
  view_count?: number;
  /** 自由扩展位，后端原样透传展示 */
  meta?: Record<string, unknown> | null;
  /**
   * 与调用方当前位置的距离（公里）。
   *
   * **只有列表请求带了定位中心才有值** —— 后端在 ListSpots 里按 hasCenter 填它，
   * `GET /v3/fish/spots/{id}` 不填。所以详情页拿不到这个数，得自己算
   * （见 utils/spot-conditions 的 distanceKm，公式与后端 util.DistanceKm 一致）。
   */
  distance_km?: number | null;
  created_at?: string;
  updated_at?: string;
}

/** 钓点业务字段（location 除外）—— MapMarker.extraData 的精确类型 */
export type SpotDetail = Omit<FishingSpot, 'location'>;

/**
 * 创建钓点载荷。name / location / kind 必填（后端 oneof 校验），其余可选。
 *
 * 后端 `dto.FishingSpotRequest` 的字段全在这里，命名与后端一致。
 * 后面那几个 meta 字段（收费 / 道路 / 车到水边 / 开放时间）后端会做 oneof 校验，
 * 取值必须落在各自的枚举里 —— 空串会被后端归一成 `unknown`，不会报错。
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
  /** 文字地址。选点 API 会带回一个，可直接用 */
  address?: string;
  /** 收费情况 */
  fee_type?: FishingSpotFeeType;
  /** 收费金额（元）。只有 fee_type 为 paid 时才有值 */
  fee_amount?: number | null;
  /**
   * 适合的钓法。
   *
   * 存的是中文字面量（路亚 / 手竿 / 夜钓），不是代码 ——
   * 后端不校验取值，详情页（SpotDetailInfo）也是原样 join 出来给人看的。
   */
  suitable_for?: string[];
  /** 道路情况 */
  road_condition?: FishingSpotRoadCondition;
  /** 能否车到水边 */
  car_access?: FishingSpotCarAccess;
  /** 开放时间，如「全天」/「06:00-18:00」 */
  opening_hours?: string;
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
 * 天气**视图模型** —— 组件、store、AI 建议载荷用的都是这一套。
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
  /**
   * 阵风（口径同 windSpeed：km/h）。
   *
   * 钓鱼看的是阵风而不是持续风：竿子会不会被吹弯、鱼线会不会被拉出水面，
   * 决定的都是这一头。持续风小、阵风大的日子是「看着温和其实危险」的那种。
   */
  windGust: string;
  humidity: string;
  precip: string;
  /** 降水强度（mm/h）。降水量的「瞬时版」，雨 大不大看它 */
  precipIntensity: string;
  /** 降水类型代码（none / rain / snow / sleet / drizzle） */
  precipType: string;
  pressure: string;
  vis: string;
  cloud: string;
  dew: string;
  /** 紫外线指数 */
  uvIndex: string;
}

export interface WeatherHourly {
  fxTime: string;
  temp?: string;
  /** 体感温度。盛夏的正午它能比实测高好几度，是「别出门」还是「能待住」的依据 */
  feelsLike?: string;
  precip?: string;
  /** 降水概率（0–100） */
  precipProbability?: string;
  humidity?: string;
  pressure?: string;
  windDir?: string;
  windScale?: string;
  windSpeed?: string;
  windGust?: string;
  text?: string;
  icon?: string;
  cloud?: string;
  vis?: string;
  dew?: string;
  uvIndex?: string;
}

export interface WeatherDay {
  fxDate: string;
  sunrise: string;
  sunset: string;
  /**
   * 民用晨昏始末。
   *
   * 天文晨光/航海晨光也在 wire 里，但钓鱼只关心「天亮到能看清水色」那一段 ——
   * 民用晨昏（太阳在地平线下 6°）正是那一刻。放到视图模型里的是这一档，
   * 更暗的两档留在线上，不占界面的位置。
   */
  civilDawn: string;
  civilDusk: string;
  /** 正午时刻 —— 一天里太阳最高点，也是最热的时候 */
  solarNoon: string;
  moonrise: string;
  moonset: string;
  /** 月亮过中天（最高）的时刻 */
  moonTransit: string;
  /** 月亮在正午时达到最高点的时刻 */
  moonUnderfoot: string;
  /**
   * 月相的中文名（'盈凸月'）。
   *
   * 展示用。图标另有其码，见 `moonPhaseCode`。
   */
  moonPhase: string;
  /**
   * 月相的原始代码（'waxing-gibbous'）。
   *
   * 保留上游原样，不在归一层里换成中文 —— 图标要靠它换算
   * （和风月相图标是 800-807 这一段，见 utils/weather 的 MOON_PHASE_ICON_CODES），
   * 一旦在这里换成中文，那张映射表就再也接不上了。
   */
  moonPhaseCode: string;
  tempMax: string;
  tempMin: string;
  /** 日均温。比「最高+最低÷2」准，日出日落之间的平均体感更贴近它 */
  tempAvg: string;
  iconDay: string;
  textDay: string;
  iconNight: string;
  textNight: string;
  wind360Day: string;
  windDirDay: string;
  windScaleDay: string;
  windSpeedDay: string;
  windGustDay: string;
  wind360Night: string;
  windDirNight: string;
  windScaleNight: string;
  windSpeedNight: string;
  windGustNight: string;
  humidity: string;
  precip: string;
  /** 白天时段的降水概率（0–100） */
  precipProbability: string;
  pressure: string;
  vis: string;
  cloud: string;
  /** 当日紫外线指数峰值 */
  uvIndexMax: string;
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
  /** 民用晨昏始末 */
  civilDawn?: string;
  civilDusk?: string;
  /** 航海晨昏始末 */
  nauticalDawn?: string;
  nauticalDusk?: string;
  /** 天文晨昏始末 */
  astronomicalDawn?: string;
  astronomicalDusk?: string;
  /** 正午 / 午夜 */
  solarNoon?: string;
  solarMidnight?: string;
  moonrise?: string;
  moonset?: string;
  /** 月过中天 */
  moonTransit?: string;
  /** 月在正午达到最高 */
  moonUnderfoot?: string;
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
// AI 建议
// ---------------------------------------------------------------------------

/**
 * AI 建议的输入载荷 —— 对应 `POST /v2/llm/weather-analysis` 的 `weather_data`。
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
  /**
   * 地点名称 —— **城市 + 区县**（如 "北京东城"、"杭州西湖"）。
   *
   * 后端走 Go 端 GeoAPI 城市检索（/geo/v2/city/lookup）拼好再透传：
   * 上游 `name` 是区县、`adm2` 是城市。早先这里给的是景点 POI 名，
   * 配的 `poiId` 已随 Go 端一起下线。
   */
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
 * FishingScores / AnalysisChunk —— 分数明细与分片类型，AI 建议链路用不到。
 * AI 建议的载荷见上面的 WeatherAnalysisPayload。
 *
 * RouteInfo / SecurityKeyResponse / RegeoResponseData / PoiItem —— 路线规划
 * 和高德 JS API 的产物，本期不做。相关端点 `v3/amap/security-key` 也不用接了：
 * 小程序端没有高德 JS SDK，不需要安全密钥。
 *
 * SpotPicture / SpotEditorDraft / SPOT_MAX_* —— 钓点编辑器的 view-model。
 * 小程序端的编辑器形态还没定（选图走 chooseImage + uploadFile 是另一套设计），
 * 等编辑器真要写时按实际需要加。
 */
