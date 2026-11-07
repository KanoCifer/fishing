/**
 * canvas 的色板 —— 深浅两套。
 *
 * canvas 2d 不解析 SCSS 变量，也不解析 CSS 变量，只认 rgb/hex。
 * 这是全项目唯一一处色值必须手写两份的地方
 * （另一个是分享海报，它固定浅色 —— 分享出去的内容不随本机主题变）。
 *
 * 取值与 src/styles/theme.scss 的深色段一一对应。
 * 浅色档是改造前就有的硬编码值，一个字没改；深色档是新值。
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
  /** 纵轴刻度文字 */
  yText: string;
  /** 横轴刻度文字 */
  xText: string;
  /** 内部网格线（潮汐图） */
  grid: string;
  /** 内部网格线（折线图，比潮汐图淡一档） */
  gridFaint: string;
  /** 底边基线 */
  axis: string;
  /** 「现在」这一格的参照线 */
  nowLine: string;
  /** 潮位曲线 */
  tide: string;
  /** 折线图的系列色，按顺序取 */
  series: readonly string[];
  /** 记录环的轨道 */
  ringTrack: string;
  /** 记录环的值弧 */
  ringFill: string;
  /** 指标图：气温 */
  metricTemp: string;
  /** 指标图：降水 */
  metricPrecip: string;
  /** 指标图：风速 */
  metricWind: string;
  /** 数值标注的描边halo：卡片面色。描边与底色同色才等于没有描边 */
  halo: string;
  /** 选中点底下那圈白底（把点从线上拔出来） */
  markerRing: string;
  /** 弧形表的轨道。压深色面，深浅两套同值 */
  gaugeTrack: string;
  /** 弧形表的值弧渐变起点。压深色面，深浅两套同值 */
  gaugeFrom: string;
  /** 弧形表的值弧渐变终点。压深色面，深浅两套同值 */
  gaugeTo: string;
}

/**
 * 浅色。全部是改造前那批硬编码值，一字未改。
 */
const LIGHT: ChartPalette = {
  yText: '#3f3f45', // $fish-muted
  xText: '#5b5b60', // $fish-muted-60
  grid: 'rgba(60, 60, 67, 0.1)', // $fish-grid
  gridFaint: 'rgba(60, 60, 67, 0.08)',
  axis: 'rgba(60, 60, 67, 0.18)', // $fish-border-40
  nowLine: 'rgba(60, 60, 67, 0.32)', // $fish-border
  tide: '#007aff', // $fish-tide
  series: ['#007aff', '#ff3b30', '#ffcc00', '#34c759', '#af52de'],
  ringTrack: 'rgba(120, 120, 128, 0.16)', // $fish-surface
  ringFill: '#0f66d6', // $fish-accent
  metricTemp: '#ff3b30', // $fish-temp
  metricPrecip: '#007aff', // $fish-tide 的蓝：水
  metricWind: '#0e7490', // $fish-wind-ink
  halo: '#ffffff', // $fish-card-face
  markerRing: '#ffffff',
  gaugeTrack: 'rgba(255, 255, 255, 0.14)',
  gaugeFrom: '#4f8cff',
  gaugeTo: '#82d4ff',
};

/**
 * 发丝线与网格从「黑 29% 透明度」翻成「白 16% 上下」——
 * 深色面上的线要靠反白才看得见，靠黑只会比背景更黑。
 * 文字档与令牌层的深色段一致（正文白、次级 #b8bcc4、辅助 #8e939c）。
 */
const DARK: ChartPalette = {
  yText: '#b8bcc4',
  xText: '#8e939c',
  grid: 'rgba(255, 255, 255, 0.12)',
  gridFaint: 'rgba(255, 255, 255, 0.1)',
  axis: 'rgba(255, 255, 255, 0.2)',
  nowLine: 'rgba(255, 255, 255, 0.38)',
  tide: '#4c9bff',
  series: ['#4c9bff', '#ff6961', '#ffd60a', '#3ddc84', '#c792ea'],
  ringTrack: 'rgba(120, 120, 128, 0.26)',
  ringFill: '#4c9bff',
  metricTemp: '#ff6961',
  metricPrecip: '#4c9bff',
  metricWind: '#63c4de',
  halo: '#16181d', // $fish-card-face
  markerRing: '#ffffff',
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
