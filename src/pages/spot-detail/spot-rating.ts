/**
 * 钓点评分的展示模型。
 *
 * 后端给的是两个数：rating（1–5 星均值）与 rating_count（参与评分的人数）。
 * 界面上要的是一行「★ 4.5　12 人评分」——
 * 「0 是不是等于没人评分」「人数为 0 时写不写」这类判断放在这里，
 * 组件里就只剩画字。
 *
 * 跟 spot-conditions 是同一类东西：展示模型的换算不进组件。
 */

import { SPOT_RATING } from './constants';

export interface SpotRating {
  /** 有没有人评分过。false 时界面给「暂无评分」，不画星标 */
  rated: boolean;
  /** 分数文案。"4.5" / "4"。没评分时是空串 */
  score: string;
  /**
   * 参与人数文案。"12 人评分"。
   *
   * 人数为 0 时是空串 —— 写「0 人评分」比不写更像出了错：
   * 有人给过分却没记上人数，跟没人给过分是两回事，别混成一句。
   */
  count: string;
}

/**
 * 评分 → 展示模型。
 *
 * 分数保留一位小数（4.5），整数分不带小数点（4 而不是 4.0）——
 * 「4.0」读着像四个整的，实际是四分。
 */
export function buildSpotRating(rating: number | null | undefined, count: number | null | undefined): SpotRating {
  const hasScore = typeof rating === 'number' && Number.isFinite(rating) && rating > 0;

  if (!hasScore) {
    return { rated: false, score: '', count: '' };
  }

  return {
    rated: true,
    score: String(Number(rating.toFixed(1))),
    count: typeof count === 'number' && count > 0 ? `${count} ${SPOT_RATING.countUnit}` : '',
  };
}
