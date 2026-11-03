/**
 * 「我的」页的文案与素材 —— 唯一出处。
 *
 * 这一页的文案都短，但每一句都在回答一个具体的问题：
 * 头图说「这是渔碌」，昵称说「这是谁」，胶囊说「现在能做什么」。
 * 归在一处，是为了让这一屏上的每一句话都能被人单独找到出处。
 */

/** 满幅头图 */
export const MINE_HERO = {
  image: 'https://cdn.kanocifer.chat/yulu/mine-hero-v1.webp',
} as const;

/** 身份块下面那颗胶囊按钮 */
export const MINE_CTA = {
  /** 已登录，资料齐了 */
  edit: '编辑资料',
  /** 已登录，还缺头像或昵称 */
  complete: '完善资料',
  /** 未登录 */
  login: '微信登录',
  /** 登录进行中 */
  loggingIn: '登录中…',
} as const;

/** 退出登录 */
export const MINE_LOGOUT = {
  /** 行上的字 */
  label: '退出登录',
} as const;
