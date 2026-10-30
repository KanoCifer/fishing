/**
 * 转发能力的两件公共事。
 *
 * 为什么收在一个文件里：**提供转发内容**与**开出转发入口**是两件事，
 * 少做一件，胶囊菜单里就没有一个能用的转发出口。
 *
 * - 内容：页面自己注册 onShareAppMessage（各页的卡片在 @/constants/share）。
 * - 入口：uni.showShareMenu —— 微信没有别的 API 能开它。
 *
 * 只开转发，不开「分享到朋友圈」：这一版分享不做朋友圈
 * （页面自己发不了朋友圈，只能由用户从胶囊菜单点，见 docs/mp-weixin-network.md）。
 * 留着朋友圈只会多一个走不通的出口。
 */

/**
 * 打开胶囊菜单里的「转发」。
 *
 * withShareTicket：转发时带上分享者的标识，
 * 收的人打开后能知道这张卡是谁发的（要自己接 from 字段才用得上）。
 */
export function enableShareMenu(): void {
  uni.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage'],
  });
}
