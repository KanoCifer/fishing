/**
 * 通用文案 —— 多处出现的说法只在这里写一次。
 *
 * 这些句子散在页面与组件里各写一遍，改文案要全局搜，
 * 而漏改一处就会出现同一件事有两种说法。
 *
 * 只收「多处完全一样」的那些。措辞因场景而异的句子留在各自的地方。
 */

/** 还在取数 */
export const LOADING_TEXT = '加载中…';

/** 选点失败（微信地图选点那一步） */
export const PICK_FAILED = '选点失败，请重试';

/** 地点名还没取到时的占位 */
export const PLACE_NAME_FALLBACK = '钓鱼地点';

/** 一部分取不到时，后面那句「其余不受影响」 */
export const OTHER_DATA_UNAFFECTED = '其余天气数据不受影响';

/** 取不到时的重试提示 */
export const RETRY_HINT = '刷新可重试';

/**
 * 「XX 暂时取不到，刷新可重试」。
 *
 * 取不到不是没有 —— 这半句是同一件事的说法，合成一处。
 */
export function retryable(what: string): string {
  return `${what}，${RETRY_HINT}`;
}
