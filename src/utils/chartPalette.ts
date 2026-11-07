/**
 * canvas 的色板 —— 深浅两套。
 *
 * canvas 2d 不解析 SCSS 变量，也不解析 CSS 变量，只认 rgb/hex。
 * 所以 canvas 那些色值的**唯一出处就是这份文件** —— 令牌层不抄它们
 * （抄一份只会让人以为改那里就能改到 canvas）。
 *
 * 跟页面层的关系，逐档写在该档的注释里：
 *   · 与令牌层同一个语义档的，取值必须**等于**那个令牌；
 *   · canvas 独有的档（网格、游标、系列色），这里就是它的出处，
 *     令牌层没有、也不该有对应物。
 *
 * 为什么单独一个文件：图标侧由 gen-icons.mjs 管，页面侧由 theme.scss 管。
 * canvas 侧如果各写各的，三份色板迟早漂移 —— 同一张卡上的文字和曲线
 * 一个深一个浅，看起来就是「画错了」。
 *
 * 取色时机：**绘制时**取一次，不要在模块顶层缓存。
 * 主题变了要重画，重画时自然取到新的一份。
 */

import { isDarkTheme } from './theme';

export interface ChartPalette {
  /** 纵轴刻度文字。= $fish-muted / --fish-muted */
  yText: string;
  /** 横轴刻度文字。= $fish-muted-60 / --fish-muted-60 */
  xText: string;
  /** 内部网格线（潮汐图）。canvas 独有 */
  grid: string;
  /** 内部网格线（折线图，比潮汐图淡一档）。canvas 独有 */
  gridFaint: string;
  /** 底边基线。比内部网格重一档 */
  axis: string;
  /**
   * 「现在」这一格的参照线。
   *
   * 浅色档 = $fish-border；深色档比它重 —— 它标的是「读数指的是这一格」，
   * 是内容不是背景，跟发丝线不是同一档。
   */
  nowLine: string;
  /** 潮位曲线。= $fish-tide-ink（跟潮位读数同色） */
  tide: string;
  /** 折线图的系列色，按顺序取。canvas 独有 */
  series: readonly string[];
  /** 记录环的轨道。= $fish-surface */
  ringTrack: string;
  /**
   * 记录环的值弧。
   *
   * 浅色档 = $fish-blue；深色档 = --fish-blue-600（深色档）——
   * 值弧是压在深色面上的图形，填充档那一档压上去读不出来。
   */
  ringFill: string;
  /** 指标图：气温。= $fish-destructive */
  metricTemp: string;
  /** 指标图：降水。= $fish-tide-ink（深浅两套都跟潮位同色） */
  metricPrecip: string;
  /** 指标图：风速。canvas 独有 */
  metricWind: string;
  /** 数值标注的描边halo：卡片面色。描边与底色同色才等于没有描边 */
  halo: string;
  /** 选中点底下那圈底色：把点从线上「拔」出来的那个洞。必须等于卡片面色 */
  markerRing: string;
  /** 弧形表的轨道。压深色面，深浅两套同值 */
  gaugeTrack: string;
  /** 弧形表的值弧渐变起点。压深色面，深浅两套同值 */
  gaugeFrom: string;
  /** 弧形表的值弧渐变终点。压深色面，深浅两套同值 */
  gaugeTo: string;
}

/**
 * 浅色。
 *
 * 逐档标注它跟令牌层的关系：
 *   「= $fish-xxx」是同一个语义档，取值必须与那个令牌相等；
 *   「canvas 独有」这一组令牌层没有对应物，这里就是它的出处。
 */
const LIGHT: ChartPalette = {
  yText: '#3f3f45', // = $fish-muted
  xText: '#666666', // = $fish-muted-60
  // 内部网格线。canvas 独有：令牌层没有网格这一档，
  // 它是图内部的背景，不是界面上的发丝线。
  // 折线图（gridFaint）比潮汐图（grid）淡一档。
  grid: 'rgba(60, 60, 67, 0.1)',
  gridFaint: 'rgba(60, 60, 67, 0.08)',
  // 底边基线。比内部网格重一档 —— 一张图上同时有两种线重，
  // 层次靠的是「基线重一档」，不是「线更多」。
  axis: 'rgba(60, 60, 67, 0.18)', // 浅色下正好等于 $fish-border-40
  nowLine: 'rgba(60, 60, 67, 0.29)', // = $fish-border
  tide: '#007aff', // = $fish-tide-ink（潮位读数与潮位曲线同色）
  series: ['#007aff', '#ff3b30', '#ffcc00', '#34c759', '#af52de'], // canvas 独有
  ringTrack: 'rgba(120, 120, 128, 0.16)', // = $fish-surface
  ringFill: '#0f66d6', // = $fish-blue（浅色档的填充蓝）
  metricTemp: '#ff3b30', // = $fish-destructive
  metricPrecip: '#007aff', // = $fish-tide
  /**
   * 风速曲线。canvas 独有。
   *
   * 比 systemTeal 深一档：浅青 (#5ac8fa) 压在白卡上只有 1.9:1，
   * 低于「有意义图形 3:1」那条线，曲线细到几乎看不见；这一档对白卡 5.4:1。
   */
  metricWind: '#0e7490',
  halo: '#ffffff', // = $fish-card-face
  // 选中点底下那圈底色。跟 halo 同值 —— 它不是一圈白环，
  // 是把线从点底下「擦」出来的洞，所以必须等于卡片面色。
  markerRing: '#ffffff',
  // 弧形表压深色面，深色面不随主题变 —— 这三项两套同值
  gaugeTrack: 'rgba(255, 255, 255, 0.14)', // = $fish-deep-hairline
  gaugeFrom: '#4f8cff', // = $fish-blue-on-dark
  gaugeTo: '#82d4ff',
};

/**
 * 深色。
 *
 * 发丝线与网格从「黑 29% 透明度」翻成「白」——
 * 深色面上的线要靠反白才看得见，靠黑只会比背景更黑。
 * 文字档与令牌层的深色段一致（正文白、次级 #b8bcc4、辅助 #8e939c）。
 */
const DARK: ChartPalette = {
  yText: '#b8bcc4', // = --fish-muted
  xText: '#8e939c', // = --fish-muted-60
  // 深色下内部网格与基线都要比浅色重：底色本身就是黑的，
  // 同样一档的白透明度压上去比浅色那边更淡。
  // 两档的关系不变 —— 基线比网格重一档。
  // 这一族 canvas 独有：令牌层没有网格与基线这两档。
  grid: 'rgba(255, 255, 255, 0.12)',
  gridFaint: 'rgba(255, 255, 255, 0.1)',
  axis: 'rgba(255, 255, 255, 0.2)',
  // 游标比基线再重一档：它是内容，不是背景。
  nowLine: 'rgba(255, 255, 255, 0.38)',
  tide: '#4c9bff', // = --fish-tide-ink（深色档）
  series: ['#4c9bff', '#ff6961', '#ffd60a', '#3ddc84', '#c792ea'], // canvas 独有
  ringTrack: 'rgba(120, 120, 128, 0.24)', // = --fish-surface
  // 深色下用亮档：值弧是**压在深色面上的图形**，不是实心块 ——
  // 填充档 #0f66d6 压上去只有 3.2:1，而这一档是 6.29:1。
  ringFill: '#4c9bff',
  metricTemp: '#ff6961', // = --fish-destructive-ink
  metricPrecip: '#4c9bff', // = --fish-tide-ink（深色档）
  /**
   * 风速曲线。canvas 独有。
   *
   * 深色下必须翻亮：#0e7490 压在深色面上读不出来，
   * 这一档是它在深色面上的对应值。
   */
  metricWind: '#63c4de',
  halo: '#16181d', // = --fish-card-face
  // 跟 halo 同值（浅色那边也是）：它是擦掉线的那个洞，不是白环。
  markerRing: '#16181d',
  // 弧形表压深色面，而深色面不随主题变 —— 这三项两套同值
  gaugeTrack: 'rgba(255, 255, 255, 0.14)',
  gaugeFrom: '#4f8cff',
  gaugeTo: '#82d4ff',
};

/**
 * 当前主题的色板。
 *
 * 绘制时调用一次。模块顶层不要缓存 —— 缓存了就锁死在首次取到的那一套，
 * 主题切换后画出来的还是旧颜色。
 */
export function chartPalette(): ChartPalette {
  return isDarkTheme() ? DARK : LIGHT;
}
