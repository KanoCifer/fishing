/**
 * 钓鱼日志的类型 —— 与服务端 `dto.FishingLog*` 一一对应。
 *
 * 为什么另起一个文件而不并进 `types/fishing.ts`：
 * `types/fishing.ts` 里是**接口返回的东西**（天气、潮汐、鱼口概率、钓点），
 * 而钓鱼日志是**用户自己写的数据**（渔获、钓法、图片、备注）——
 * 后者的服务端契约长什么样，跟鱼口概率那条链路没有一点关系，
 * 混在一起会让「哪些字段是后端给的、哪些是用户填的」这条界线糊掉。
 *
 * 另一层原因是归属：钓鱼日志有归属人（`user_id` 由后端从会话取，
 * 不从请求体传），而现有的 `FishingRecord`（残差模型的训练集）没有 ——
 * 两套东西连"一条记录属于谁"的答案都不一样。
 */

/**
 * 一条渔获 —— 一次出行可能钓到好几种鱼。
 *
 * 鱼种存**中文名**，不存学名 id：清单外的鱼（鲈鲌、翘嘴、鳜鱼之外的杂鱼）
 * 用户也得能记下来，而服务端没有鱼种分类表可用（前端那份 23 条鱼种
 * 是图鉴素材，不是记录该用的词表）。
 */
export interface FishingLogCatch {
  /** 鱼种名，用户手输或从快选里挑 */
  species: string;
  /** 数量 */
  quantity: number;
}

/**
 * 天气快照 —— 记下这条日志那一刻的天气。
 *
 * 字段名与后端 `dto.FishingRecordRequest` 的天气九项**逐字相同**：
 * 两处派生逻辑共用一份（见 `utils/feedback.ts`），
 * 键名不一样的话同一份天气就会有两个口径，以后没法横向比对。
 */
export interface FishingLogWeather {
  temperature?: number;
  humidity?: number;
  pressure?: number;
  wind_speed?: number;
  precipitation?: number;
  indices?: number;
  tide_level?: number;
  tide_type?: string;
  tide_range?: number;
  hours_to_next_tide?: number;
}

/**
 * 提交一条日志的载荷。
 *
 * `catches` 为空 = 这是一条**打卡**记录（当天去了，空军也认）。
 * `images` 与渔获无关 —— 打卡也可以带图（当天没钓到鱼，晒一张日落照）。
 */
export interface CreateFishingLogPayload {
  /** 本地日历日 `YYYY-MM-DD`。服务端只收今天 */
  log_date: string;
  /** 开始时间，RFC3339 */
  started_at: string;
  /** 关联的钓点 id，没有关联时留空 */
  location_id?: string;
  location_name?: string;
  longitude?: number;
  latitude?: number;
  catches: FishingLogCatch[];
  /** 钓法：路亚 / 手竿 / 台钓 …，可多选 */
  methods: string[];
  /** 图片相对路径（上传响应的 filename），最多 3 张 */
  images: string[];
  weather?: FishingLogWeather;
  remark?: string;
}

/** 创建结果。`created` 为 false 表示当天已有空打卡记录，这次是幂等命中 */
export interface CreateFishingLogResponse {
  log_id: string;
  log_date: string;
  created: boolean;
}

/** 一条日志 */
export interface FishingLog {
  log_id: string;
  log_date: string;
  started_at: string;
  location_id?: string;
  location_name?: string;
  longitude?: number;
  latitude?: number;
  catches: FishingLogCatch[];
  methods: string[];
  images: string[];
  weather?: FishingLogWeather;
  remark?: string;
  created_at?: string;
}

/**
 * 统计。
 *
 * `checkin_days` 与 `catch_days` 是两个数：打卡是「我去了」，
 * 渔获是「我钓到了」。空打卡只进前者。
 */
export interface FishingLogStats {
  /** 全历史有记录的天数 */
  checkin_days: number;
  /** 全历史有渔获的天数 */
  catch_days: number;
  /** 当前连续天数。今天还没打卡不算断 */
  current_streak: number;
  /** 历史最长连续天数 */
  longest_streak: number;
}
