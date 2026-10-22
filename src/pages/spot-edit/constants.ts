/**
 * 编辑钓点页的文案 —— 唯一出处。
 *
 * 这一页只放**编辑这一页独有**的那些。表单本身的字段标签、选项清单、
 * 必填提示在 constants/spot-form.ts（新建与编辑共用）。
 *
 * 保存成功后的措辞分两种，因为后端对两种状态的处理不一样：
 * 属主改一条没过审的钓点，它退回 pending 并清掉审核备注；
 * 改一条已过审的，它保持 approved。所以提示不能是同一句话 ——
 * 对一条待审的钓点说「已保存」，用户会以为它已经公开了。
 */

/** 页面标题 */
export const SPOT_EDIT_TITLE = '编辑钓点';

/** 引子 —— 页面开头那一段话 */
export const SPOT_EDIT_LEDE = {
  title: '编辑钓点',
} as const;

/** 提交按钮 */
export const SPOT_EDIT_SUBMIT = '保存修改';

/** 保存中。按钮锁住时显示它 */
export const SPOT_EDIT_SUBMITTING = '保存中…';

/** 载入中的那一行 */
export const SPOT_EDIT_LOADING = '正在载入钓点…';

/** 载入失败时的那一行 */
export const SPOT_EDIT_LOAD_FAILED = '钓点载入失败';

/** 驳回理由那一块的标题 */
export const SPOT_EDIT_REJECTED_TITLE = '驳回理由';

/** 保存失败时的提示（兜底文案，后端有 message 时用后端那句） */
export const SPOT_EDIT_SAVE_FAILED = '保存失败，请重试';

/**
 * 保存成功后的提示 —— 按这条钓点保存**之前**的状态分三种。
 *
 * pending / rejected：后端把它退回待审核，公开列表里看不到，
 *   所以说的是「等待审核」，并说清它去哪了。
 * approved：它本来就公开着，修改直接生效，不用等审核。
 */
export const SPOT_EDIT_SAVED = {
  /** 原来是待审核 */
  pending: {
    title: '已提交，等待审核',
    hint: '审核通过后会出现在地图上',
  },
  /** 原来是未通过 —— 改完重交，状态回到待审核 */
  rejected: {
    title: '已重新提交，等待审核',
    hint: '这次过了审就会出现在地图上',
  },
  /** 原来是已通过 —— 保持公开，修改直接生效 */
  approved: {
    title: '修改已保存',
    hint: '这条钓点已过审，修改直接生效',
  },
} as const;

/** 保存成功那个弹窗的确认按钮 */
export const SPOT_EDIT_SAVED_CONFIRM = '知道了';
