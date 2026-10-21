/**
 * 钓点详情页的版式常量。
 *
 * 放这里而不是散在页面和组件里，是因为头图高度同时被两处用到：
 * 组件把它撑到多高，以及页面算「照片什么时候离开导航栏」那个滚动阈值。
 * 两处各写一个 744，改了一处忘了另一处，导航就会在错的高度上反色。
 *
 * 单位是 rpx（设计尺寸）。要用到 px 的地方过 `uni.upx2px()` 换算 ——
 * 运行时量出来的尺寸用 px，设计稿尺寸用 rpx，两者相加先过 upx2px。
 */

/** 头图高度。375pt 机型上约合 372pt，是一屏里最抢眼的一个面 */
export const SPOT_HERO_HEIGHT_RPX = 744;

/** 主体卡上移压住头图下沿的量。层级靠「压」不靠「分」 */
export const SPOT_HERO_OVERLAP_RPX = 68;

/**
 * 缺图占位插画。
 *
 * src/static 下的文件在小程序里挂在根路径，所以是 /static/... 而不是 @/static/...
 * （同 useMapMarkers 的 marker 图标路径）。
 */
export const SPOT_PLACEHOLDER_IMAGE = '/static/spots.png';
