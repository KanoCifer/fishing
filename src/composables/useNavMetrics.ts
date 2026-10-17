/**
 * 自定义导航栏的尺寸计算。
 *
 * 只在页面配了 `navigationStyle: "custom"` 时才需要：原生导航栏由微信自己渲染，
 * 页面既拿不到它的矩形，也不需要知道它有多高——内容区天然就在它下面。
 * 一旦改成 custom，导航栏就成了浮层，页面所有顶部内容都得自己让开。
 *
 * 返回值单位统一是 px：来源是运行时 API（胶囊按钮矩形、系统信息），
 * 和手写 rpx 不是同一套单位。rpx 间距要跟这些值相加，必须先过 uni.upx2px()。
 */

export interface NavMetrics {
  /** 状态栏高度（px）。刘海屏机型 > 0，非刘海为 0 */
  statusBarHeight: number
  /** 导航栏本体高度（px），不含状态栏 */
  navBarHeight: number
  /** 导航栏底边的 y 坐标（px）。浮在导航栏下面的内容该从这条线往下排 */
  navBarBottom: number
  /** 胶囊按钮左侧到屏幕右边缘的距离（px）。标题要居中就得给它让出这段 */
  capsuleInsetRight: number
}

// 胶囊按钮和状态栏高度在一次启动内不会变，算一次就够，避免每个组件重复调 API
let cached: NavMetrics | null = null

function measure(): NavMetrics {
  if (cached) return cached

  const { statusBarHeight, windowWidth } = uni.getWindowInfo()

  // 胶囊按钮矩形是微信小程序独有的 API，基础库 2.7.1 起提供。
  // 本项目只有小程序端，不存在"拿不到胶囊"的运行环境，所以直接用，不写兑底值。
  const capsule = uni.getMenuButtonBoundingClientRect()

  // 微信官方那条公式：导航栏高度 = 胶囊上下留白对称推算。
  // 胶囊顶部到状态栏底部的空隙记作 gap，那么上下各留一个 gap，导航栏 = gap*2 + 胶囊高。
  const navBarHeight = (capsule.top - statusBarHeight) * 2 + capsule.height

  cached = {
    statusBarHeight,
    navBarHeight,
    navBarBottom: statusBarHeight + navBarHeight,
    capsuleInsetRight: windowWidth - capsule.left,
  }
  return cached
}

export function useNavMetrics(): Readonly<NavMetrics> {
  return measure()
}
