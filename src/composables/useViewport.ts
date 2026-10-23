/**
 * 视口尺寸。
 *
 * 只回答一个问题：这一屏到底有多高（px）。
 *
 * 为什么不用 100vh：
 *
 * 小程序的 100vh 以屏幕高度为基准，**把原生 tabBar 的高度也算进去了**。
 * 本项目三个页签都是 tabBar 页，页面内容按 100vh 铺满的话，
 * 实际高度比「真正能显示的那部分」高出整整一个 tabBar（约 50px）——
 * 页面于是变成可滚动的：内容比视口多出来的那一截，就是用户能拖出去的范围。
 *
 * 在地图页上这个多出来的 50px 表现得很明显：双指在地图上滑动，
 * 被 WebView 接管成页面滚动，整页跟着滑，地图被拖离原位；
 * iOS 上还会叠加一层橡皮筋回弹。
 *
 * uni.getWindowInfo().windowHeight 才是「真正能显示的那部分高度」——
 * tabBar 页面上它不含 tabBar 高度。微信社区上也是这个结论：
 * https://developers.weixin.qq.com/community/minihome/doc/000a8afb7c834838f842547536b800
 *
 * 只做全屏铺底的页面用它；有内容要滚的页面用 min-height 就够了。
 *
 * 尺寸在一次启动内不变，算一次就够，和 useNavMetrics 一样不反复调 API。
 */

import { windowMetrics } from './windowMetrics';

export interface Viewport {
  /** 可用窗口高度（px）。tabBar 页面上不含 tabBar 高度 */
  windowHeight: number;
  /** 可用窗口宽度（px） */
  windowWidth: number;
}

let cached: Viewport | null = null;

function measure(): Viewport {
  if (cached) return cached;

  // 从共享快照里取，不再自己调 getWindowInfo —— 它是同步 API，
  // 而 useNavMetrics 已经取过同一份数据了。
  const { windowWidth, windowHeight } = windowMetrics();

  cached = { windowWidth, windowHeight };
  return cached;
}

export function useViewport(): Readonly<Viewport> {
  return measure();
}
