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

/** H5 / App 端没有胶囊按钮，用微信导航栏的通用高度兜底 */
const FALLBACK_NAV_BAR_HEIGHT = 44

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

  // getMenuButtonBoundingClientRect 是小程序端独有的 API，H5 预览时不存在。
  // 这里必须先做 typeof 判断——直接调用会在 H5 上抛 undefined is not a function，
  // 而 dev:h5 是本项目日常用的预览方式。
  const capsule =
    typeof uni.getMenuButtonBoundingClientRect === 'function'
      ? uni.getMenuButtonBoundingClientRect()
      : null

  if (!capsule) {
    cached = {
      statusBarHeight: 0,
      navBarHeight: FALLBACK_NAV_BAR_HEIGHT,
      navBarBottom: FALLBACK_NAV_BAR_HEIGHT,
      capsuleInsetRight: 0,
    }
    return cached
  }

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
