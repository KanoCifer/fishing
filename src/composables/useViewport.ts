/**
 * 视口尺寸。
 *
 * 只回答一个问题：这一屏到底有多高（px）。
 *
 * 为什么不用 100vh：
 *
 * 100vh 以屏幕高度为基准，而本项目的导航栏与底栏都是自定义的浮层。
 * 页面能用的是「可用窗口高度」——uni.getWindowInfo().windowHeight。
 * 按 100vh 铺满，页面会多出一截可滚动范围：内容比视口多出来的那一截，
 * 就是用户能拖出去的范围。
 *
 * 在地图页上这个多出来的一截表现得很明显：双指在地图上滑动，
 * 被 WebView 接管成页面滚动，整页跟着滑，地图被拖离原位；
 * iOS 上还会叠加一层橡皮筋回弹。
 *
 * ⚠️ 自定义底栏是浮层：windowHeight 里**含**它，tab 页的底部要自己让开
 * （见令牌层的 fish-tabbar-inset）。地图页是例外 —— 地图要铺满整屏，
 * 底栏浮在地图上。
 *
 * 只做全屏铺底的页面用它；有内容要滚的页面用 min-height 就够了。
 *
 * 尺寸在一次启动内不变，算一次就够，和 useNavMetrics 一样不反复调 API。
 */

import { windowMetrics } from './windowMetrics';

export interface Viewport {
  /** 可用窗口高度（px）。自定义底栏是浮层，这个高度里含它 */
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
