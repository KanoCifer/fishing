import { SHARE_APP, SHARE_COVER } from '@/constants/about';

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
   * 三个 tab 页都用同一张 5:4 封面，不让微信拿当前页的截图当封面：
   * 钓点页那张是地图（带着分享者自己的位置标记），数据页那张带他自己的
   * 地点名与读数 —— 封面说的都不是卡片要说的那件事。
   *
   * 一张够不够：三个 tab 页要说的本来就是同一件事（这是个查潮汐找钓点的工具），
   * 分三张只是把同一句话写三遍。
   */
  cover: string;
}

export const SHARE_CARDS: Record<'fishing' | 'data' | 'mine', ShareCard> = {
  /** 钓点页（tab 二）：钓点地图 */
  fishing: {
    title: '渔碌｜钓点地图：钓法、收费与开放时间',
    path: '/pages/fishing/index',
    cover: SHARE_COVER,
  },
  /** 数据页（tab 一）：今日鱼口概率、潮汐与天气 */
  data: {
    title: '渔碌｜今日鱼口概率、潮汐与天气',
    path: '/pages/data/index',
    cover: SHARE_COVER,
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
    cover: SHARE_COVER,
  },
};
