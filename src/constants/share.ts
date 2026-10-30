/**
 * 三个 tab 页的转发卡片 —— 文案与落点的唯一出处。
 *
 * 为什么单独成文件：转发是**要发给别人的话**。
 *
 * 页面上给自己看的那些读数（钓鱼指数、潮汐表、钓点标记）与卡片上那一行
 * 不是同一件事：前者是仪表，后者是替收的人做的一个判断 ——
 * 措辞、长度、语气都不一样。所以这里把「自己看的话」和「发给别人看的话」
 * 分开存，改一个不会连着改另一个。
 *
 * 三张卡片各说这一页的那件事，句式也对齐：
 * 钓点页说找钓点，数据页说看天气潮汐，我的页说这个 App 是什么。
 *
 * 落点与标题是一对：**收的人点进来看到的东西，要和卡片上写的是同一件事**。
 * 所以数据页的卡片不写「今日鱼口 78 分」这种读数 ——
 * 收的人打开数据页，看到的是**他自己所在地的**读数，
 * 标题替一个他没法验证的数字报账，说不对
 * （这条跟 about.ts 里 SHARE_APP.cover 的那套道理是同一条）。
 */

import { SHARE_APP, APP_COVER } from '@/constants/about';

/** 一张转发卡片 */
export interface ShareCard {
  /**
   * 转发卡片的标题。
   *
   * 微信聊天列表里只显示一行，超出就截断 —— 所以这一行只装一件事。
   */
  title: string;
  /** 转发后落到哪一页 */
  path: string;
  /**
   * 转发卡片的封面。
   *
   * 三个 tab 页都用应用图标，不让微信拿当前页的截图当封面：
   * 钓点页那张是地图（带着分享者自己的位置标记），数据页那张带他自己的
   * 地点名与读数 —— 封面说的都不是卡片要说的那件事。
   */
  cover: string;
}

export const SHARE_CARDS: Record<'fishing' | 'data' | 'mine', ShareCard> = {
  /** 钓点页（tab 一）：钓点地图 */
  fishing: {
    title: '渔碌｜钓点地图：钓法、收费与开放时间',
    path: '/pages/fishing/index',
    cover: APP_COVER,
  },
  /** 数据页（tab 二）：今日鱼口、潮汐与天气 */
  data: {
    title: '渔碌｜今日鱼口、潮汐与天气',
    path: '/pages/data/index',
    cover: APP_COVER,
  },
  /**
   * 我的页（tab 三）：这个 App 是什么。
   *
   * 落**首页**不是本页 —— 分享是带人进门，不是带人参观说明页。
   * 这一份就是「分享渔碌给朋友」那行按钮用的那份文案（见 about.ts 的 SHARE_APP），
   * 抄一份就会改一处漏一处。
   */
  mine: {
    title: SHARE_APP.title,
    path: SHARE_APP.path,
    cover: APP_COVER,
  },
};
