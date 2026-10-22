/**
 * 新建钓点页的文案 —— 唯一出处。
 *
 * 只放**新建这一页独有**的那些：标题、引子、草稿、提交按钮与提交成功的提示。
 * 表单本身的字段标签、选项清单、必填提示在 constants/spot-form.ts ——
 * 那是新建与编辑共用的一套字，不该在这里再抄一份。
 */

/** 页面标题 */
export const SPOT_CREATE_TITLE = '新建钓点';

/**
 * 引子 —— 页面开头那一段话。
 *
 * 说清两件事：这一页要干什么、哪几样是必填的。
 * 必填在每一组标题旁边还会再标一次，两处不冲突：
 * 这里是解释，标的是提醒。
 */
export const SPOT_CREATE_LEDE = {
  title: '新建钓点',
} as const;

/**
 * 草稿。
 *
 * 草稿条只在**恢复出来**的时候出现：用户得知道这些内容是他上次写的，
 * 而不是这一页自己冒出来的。挂上之后也给一个「丢弃」——
 * 别人替他填的、或者上次填错了的，得能扔掉重来。
 */
export const SPOT_CREATE_DRAFT = {
  restored: '已恢复上次的草稿',
  /** 草稿条第二行。「保存于 10-21 20:15」 */
  savedAt: (time: string) => `保存于 ${time}`,
  /** 丢掉草稿 */
  discard: '丢弃',
  /** 确认丢掉 */
  discardTitle: '丢弃草稿？',
  /** 确认丢掉时说的。丢的是用户自己写的东西，收不回来 */
  discardContent: '上次没写完的内容会清掉，而且找不回来。',
  discardConfirm: '丢弃',
  discardCancel: '留着',
} as const;

/** 提交按钮 */
export const SPOT_CREATE_SUBMIT = '提交审核';

/** 提交中。按钮锁住时显示它 */
export const SPOT_CREATE_SUBMITTING = '提交中…';

/**
 * 提交成功后的提示。
 *
 * 说的是「等待审核」而不是「已添加」—— 后端把普通用户的投稿置为 pending，
 * 公开列表只放已过审的条目，它不会立刻出现在地图上。
 * 说「已添加」会让用户回头找不到自己刚建的那条。
 */
export const SPOT_CREATE_SUBMITTED = '已提交，等待审核';

/** 提交成功后落点提示 */
export const SPOT_CREATE_SUBMITTED_HINT = '审核通过后会出现在地图上';
