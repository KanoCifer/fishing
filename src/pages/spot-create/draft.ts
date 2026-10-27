/**
 * 钓点投稿的本地草稿 —— 存取。
 *
 * 为什么要有草稿：这一页有十栏，填到一半退出是常事。
 * 没有草稿，那半页内容就白填了，而用户并不是不想提交，
 * 只是还没填完。草稿替他留住这些内容，下次进来接着填。
 *
 * 为什么不存服务端：草稿是**一个人**的半页内容，服务端没有它该待的地方
 * （未提交的投稿要是进了库，就得考虑审核、去重、过期清理一整套），
 * 而本地 Storage 恰好就是「只在这台设备上、用户主动清掉才消失」的那个位置。
 *
 * 存的是**已经上传好的照片的服务端相对路径** —— 不是本地临时路径。
 * 临时路径离开这次会话就没了，存进去等于存了一串废字符。
 */

import type { SpotDraft } from '@/types/draft';
import { readStorage, removeStorage, writeStorage } from '@/utils/storage';

/** Storage 键。和 token 那些分开，免得有人清会话时把草稿一起清了 */
const DRAFT_KEY = 'fish.spot.create.draft';

/**
 * 草稿格式版本。
 *
 * 草稿的形状变了（加字段、改名）就往上加一位。
 * 读的时候对不上就当没有草稿 —— 拿老草稿硬套新结构，
 * 出来的是错的东西，还不容易看出是错的。
 */
const DRAFT_VERSION = 1;

/**
 * 读草稿。
 *
 * 读不出来就当没有：Storage 里的东西可能被人手改过、可能来自旧版本、
 * 可能根本不是对象。任何一种异常都只回一个 null，不抛 ——
 * 草稿是加分项，它坏了不该挡住用户建钓点。
 */
export function readSpotDraft(): SpotDraft | null {
  const stored = readStorage(DRAFT_KEY);
  if (!stored || typeof stored !== 'object') return null;

  const draft = stored as Partial<SpotDraft>;
  if (draft.version !== DRAFT_VERSION) return null;
  if (typeof draft.savedAt !== 'number' || !draft.savedAt) return null;
  if (!Array.isArray(draft.suitableFor) || !Array.isArray(draft.photos)) return null;

  return draft as SpotDraft;
}

/** 存草稿。存不进去就算了 —— 草稿丢了只是要重填，不该因此报错。 */
export function writeSpotDraft(draft: SpotDraft): void {
  writeStorage(DRAFT_KEY, draft);
}

/** 清掉草稿。提交成功、用户主动丢弃，走的都是这一条。 */
export function clearSpotDraft(): void {
  removeStorage(DRAFT_KEY);
}

/**
 * 这份草稿有没有内容。
 *
 * 没有内容就不存 —— 存一份空草稿，下次进来会弹一条「已恢复上次的草稿」，
 * 而用户根本没写过东西，那条提示就成了噪音。
 */
export function isSpotDraftEmpty(draft: SpotDraft): boolean {
  return (
    !draft.location &&
    !draft.name.trim() &&
    !draft.kind &&
    !draft.description.trim() &&
    draft.suitableFor.length === 0 &&
    !draft.feeAmount.trim() &&
    !draft.openingHours.trim() &&
    draft.photos.length === 0 &&
    // 这三个默认值就是「没选」，选了别的才算有内容
    draft.feeType === 'unknown' &&
    draft.roadCondition === 'unknown' &&
    draft.carAccess === 'unknown'
  );
}
