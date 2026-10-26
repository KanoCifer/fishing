/**
 * 钓点纠错反馈的文案与选项 —— 唯一出处。
 *
 * 反馈不公开：提交完只有一句「已提交，我们会核实」，没有「我的反馈」页面，
 * 没有状态徽标。所以这一份文案里**没有**「已提交 / 处理中 / 已采纳」那一类状态词 ——
 * 有的话就说明有人给反馈加了不该有的可见性。
 *
 * 放在常量层而不是组件里，是因为表单几乎全是文字：类型叫什么、说明要写多少字、
 * 按钮怎么写，这些是产品要改的，改文案不该先读版式。
 */

import type { FishingSpotFeeType, FishingSpotFeedbackType } from '@/types/fishing';
import { FISHING_SPOT_FEE_LABELS } from '@/types/fishing';

/** 页面标题 */
export const SPOT_FEEDBACK_TITLE = '提交反馈';

/**
 * 钓点详情页正文末尾那一个入口。
 *
 * 一整行可点、灰色小字、左对齐 —— 它是这一页最次要的动作，
 * 不该跟底栏那个「导航」主按钮抢注意力，也不该跟属主的「编辑」并排
 * （那是作者操作，读者不该看到跟自己无关的动词）。
 */
export const SPOT_FEEDBACK_ENTRY = {
  label: '信息有误？提交反馈',
} as const;

/**
 * 反馈类型 —— 五项单选。
 *
 * 取值与后端 `dto.FishingSpotFeedbackRequest.Type` 的 oneof 校验同集合，
 * 顺序按「最常见的先出现」排：位置不对和收费变更是用户最常遇到的两类。
 */
export const SPOT_FEEDBACK_TYPE_OPTIONS: readonly { value: FishingSpotFeedbackType; label: string }[] = [
  { value: 'location_wrong', label: '位置不对' },
  { value: 'closed', label: '已封闭' },
  { value: 'fee_wrong', label: '收费变更' },
  { value: 'info_stale', label: '信息有误' },
  { value: 'other', label: '其他' },
];

/**
 * 收费方式 —— 只有「收费变更」那一种类型才问。
 *
 * **文案取自钓点那一份 `FISHING_SPOT_FEE_LABELS`，这里不再另抄一张。**
 * 三个取值是同一组，另起一张表的后果是：后端哪天加了第四个取值，
 * 只改一处就会出现「详情页能选、反馈页不能选」这种只有查了才知道的差异。
 *
 * 顺序写死：free / paid / unknown —— 先给确定的两个，最后才是「未知」。
 */
const SPOT_FEEDBACK_FEE_ORDER: readonly FishingSpotFeeType[] = ['free', 'paid', 'unknown'];

export const SPOT_FEEDBACK_FEE_OPTIONS: readonly { value: FishingSpotFeeType; label: string }[] =
  SPOT_FEEDBACK_FEE_ORDER.map((value) => ({ value, label: FISHING_SPOT_FEE_LABELS[value] }));

/** 各栏的标签与占位 */
export const SPOT_FEEDBACK_FIELDS = {
  type: {
    label: '哪里不对',
  },
  description: {
    label: '说明',
    placeholder: '哪里不对？什么时候发现的？',
  },
  photos: {
    label: '现场照片',
    hint: '可不填',
    /** 张数上限的补充说明 */
    maxHint: (max: number) => `最多 ${max} 张`,
  },
  location: {
    label: '正确的位置',
    /** 还没选点时占位的那一行 */
    empty: '点这里选个位置',
    /** 新坐标是选填的 —— 「我也不知道具体在哪」也是有效反馈 */
    hint: '选填',
  },
  correctedName: {
    label: '建议的名称',
    placeholder: '如：北岸老柳树',
  },
  fee: {
    label: '现在的收费',
  },
  feeAmount: {
    label: '收费金额',
    placeholder: '如：30',
    unit: '元',
  },
} as const;

/** 分组标题 */
export const SPOT_FEEDBACK_GROUPS = {
  type: '问题类型',
  about: '说说哪里不对',
  corrected: '它现在是什么样',
  photos: '现场照片',
  required: '必填',
  optional: '选填',
} as const;

/**
 * 说明文字的字数上下限。
 *
 * 与后端 service 层的校验用同一个数（5–500，按字符数算，中文一个字算一个）。
 * 两处各写一遍迟早出现「前端能过、后端拒」的错位。
 */
export const SPOT_FEEDBACK_DESCRIPTION = {
  min: 5,
  max: 500,
} as const;

/**
 * 配图最多几张。
 *
 * 三张够管理员判断了，再多就是浏览而不是纠错 —— 也让上传不至于把弱网用户拖死。
 */
export const SPOT_FEEDBACK_IMAGE_MAX = 3;

/** 提交按钮上的字 */
export const SPOT_FEEDBACK_SUBMIT = '提交反馈';

/** 提交中按钮上的字 */
export const SPOT_FEEDBACK_SUBMITTING = '提交中…';

/**
 * 提交成功的话。
 *
 * 只有一句，不给入口 —— 反馈不公开，提交者看不到状态，
 * 「去看看我的反馈」这种按钮不存在。
 */
export const SPOT_FEEDBACK_SUBMITTED = '已提交，我们会核实';

/** 详情页那一行上方的说明：现在页面上写的是什么 */
export const SPOT_FEEDBACK_CURRENT = '现在页面上写的是：';

/** 未登录时的空态 */
export const SPOT_FEEDBACK_EMPTY = {
  title: '登录后才能提交反馈',
  hint: '反馈只交给管理员核实，不会公开显示',
  action: '登录',
} as const;

/** 取钓点信息时的提示 */
export const SPOT_FEEDBACK_LOADING = '载入中…';

/**
 * 错误文案。
 *
 * 后端给的是「invalid_feedback_payload: …」这种带错误码的串，
 * 直接甩给用户看不像人话 —— 所以常见的几种按状态码换成这里的话，
 * 换不掉的才退回 `toErrorMessage`。
 */
export const SPOT_FEEDBACK_ERRORS = {
  /** 兜底 */
  submitFailed: '提交失败，请重试',
  /** 同一钓点已有未处理的反馈（409） */
  duplicate: '你已提交过这条钓点的反馈',
  /** 钓点不存在（404） */
  spotMissing: '这条钓点不存在',
  /** 登录态没了（401） */
  loginRequired: '登录后才能提交反馈',
  /** 登录失败 */
  loginFailed: '登录失败，请重试',
  /** 类型没选 */
  typeRequired: '选一个问题类型',
  /** 说明太短 */
  descriptionTooShort: '说明至少写 5 个字',
  /** 说明太长 */
  descriptionTooLong: '说明最多 500 个字',
  /** 收费方式没选 */
  feeRequired: '现在是什么收费情况？',
  /** 选了收费但没填金额 */
  feeAmountRequired: '填一下收费金额',
  /** 金额不是个数或小于 0 */
  feeAmountInvalid: '金额填 0 或者更大的数',
  /** 选点失败 */
  pickFailed: '选点失败，请重试',
} as const;
