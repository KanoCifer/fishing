/**
 * 视图派生类型 —— 算完之后界面拿到的东西长什么样。
 *
 * 与 types/fishing.ts 的分工：那里描述后端给什么（网络层形状），
 * 这里描述算完之后界面拿到什么（派生形状）。
 *
 * 这一层单独成文件，是为了让 utils（转换逻辑）与 constants（文案与映射）
 * 都只依赖 types，彼此不依赖 ——
 * 以前 Tone / Level / WeatherGroup 定义在 utils/weather.ts，
 * 而 constants/weatherHero.ts 要从那里 import 类型，
 * 结果 constants ↔ utils 形成了循环。
 */

/**
 * 语义色调。
 *
 * 用 class 名而不是具体色值：组件里直接拼 class，
 * 小程序 scss 不支持运行时生成色值，而 class 拼接是静态可分析的。
 */
export type Tone = 'success' | 'blue' | 'warning' | 'destructive' | 'muted';

/**
 * 一档读数：档位词 + 色调。
 *
 * 数值给的是「是多少」，档位词给的是「这一档怎么样」——
 * 两个都摆，读者才不用自己拿量程去换算。
 */
export interface Level {
  /** 档位词 */
  label: string;
  /** 色调 */
  tone: Tone;
}

/**
 * 只有档位词的读数。
 *
 * 有些维度没有好坏之分 —— 云量就是：阴天未必比晴天差，
 * 对钓鱼来说阴天常常更好口。给这类读数套一条色阶，
 * 等于替用户下了一个不该下的判断，所以它们不给色调。
 */
export interface Label {
  /** 档位词 */
  label: string;
}

/**
 * 天气外观组 —— 六十多个码在界面上只表现十种「看天」的印象，
 * 同一组共用一套天色。
 *
 * 组名同时是**样式的一部分**：头图组件（WeatherHero）拿它换算天色
 * （heroSky()，见 constants/weatherHero.ts），再拼成 class 修饰符
 * （hero--rain），组件样式里同名的那条规则给出那套画面。
 */
export type WeatherGroup =
  | 'sunny'
  | 'cloudy'
  | 'night'
  | 'rain'
  | 'snow'
  | 'sleet'
  | 'dust'
  | 'hot'
  | 'cold'
  | 'generic';

/** 气压档位词 */
export type PressureLabel = '偏低' | '正常' | '偏高' | '很高';

/**
 * 气压色调。
 *
 * 气压只用到色阶里的四档 —— 气压没有「好」这一说，
 * 所以不套钓鱼等级那套 Tone，收窄成自己的子集。
 */
export type PressureTone = 'success' | 'warning' | 'destructive' | 'muted';

/**
 * 预报日。
 *
 * 高低温是数字而不是字符串：两张卡都要拿它拼「°」和比大小，
 * 换算留在 utils/weather 的 forecastDays，换完就是能直接显示的数。
 */
export interface ForecastDay {
  /** 日期，YYYY-MM-DD */
  fxDate: string;
  /** 最高温（°C） */
  max: number;
  /** 最低温（°C） */
  min: number;
  /** 白天时段的天气码 */
  icon: string;
  /** 白天时段的降水概率，0–100。0 是有效值，不是缺失 */
  prob: number;
}
