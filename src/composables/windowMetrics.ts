/**
 * 窗口快照 —— 全应用只调一次同步 API。
 *
 * 这个文件存在的理由：`uni.getWindowInfo()` 与 `uni.getMenuButtonBoundingClientRect()`
 * 都是**同步 API**。微信把它们和 `getStorageSync` 一起列在「启动过程中减少同步 API
 * 的调用」那一条里（uni 的 mp-weixin 运行时也把这两个名字写进了同步 API 白名单
 * `SYNC_API_RE`）—— 它们会阻塞 JS 线程，耗时直接算进启动。
 *
 * 原先 `useNavMetrics` 与 `useViewport` 各自模块级缓存自己那一份，
 * 结果同一次启动里 `getWindowInfo` 被打了两遍 —— 两份缓存切的是同一把刀。
 * 这里把两个 API 各收成一次调用，谁要尺寸都从这一份里取。
 *
 * 尺寸在一次启动内不会变，所以算一次就够。
 */

/** 胶囊按钮矩形（px）。微信小程序独有，基础库 2.7.1 起提供 */
export interface CapsuleRect {
  /** 上边界 y 坐标 */
  top: number;
  /** 左边界 x 坐标 */
  left: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/** 窗口快照 */
export interface WindowSnapshot {
  /** 状态栏高度（px）。刘海屏机型 > 0，非刘海为 0 */
  statusBarHeight: number;
  /** 可用窗口宽度（px） */
  windowWidth: number;
  /** 可用窗口高度（px）。tabBar 页面上不含 tabBar 高度，理由见 useViewport */
  windowHeight: number;
  /** 设备像素比。canvas 位图按它放大，CSS 尺寸不变 */
  pixelRatio: number;
  /** 胶囊按钮矩形（px） */
  capsule: CapsuleRect;
}

let cached: WindowSnapshot | null = null;

/**
 * 取窗口快照。
 *
 * 第一次调用才真的碰 API，之后都返回同一份。
 */
export function windowMetrics(): WindowSnapshot {
  if (cached) return cached;

  const win = uni.getWindowInfo();

  // 胶囊按钮矩形是微信小程序独有的 API，基础库 2.7.1 起提供。
  // 本项目只有小程序端，不存在「拿不到胶囊」的运行环境，所以直接用，不写兜底值。
  const capsule = uni.getMenuButtonBoundingClientRect();

  cached = {
    statusBarHeight: win.statusBarHeight,
    windowWidth: win.windowWidth,
    windowHeight: win.windowHeight,
    pixelRatio: win.pixelRatio || 1,
    capsule: {
      top: capsule.top,
      left: capsule.left,
      width: capsule.width,
      height: capsule.height,
    },
  };

  return cached;
}
