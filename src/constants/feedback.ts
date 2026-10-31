/**
 * 鱼口反馈的选项与文案 —— 唯一出处。
 *
 * 「鱼口反馈」是残差模型的训练集来源：用户答的那一档（爆护 / 好 / 一般 /
 * 差 / 空军）跟服务端算的专家评分一比，差值就是模型要学的东西。
 *
 * 它跟钓鱼记录是**两个域**（记录有归属人，反馈没有），但它们在同一次
 * 提交里一起送出去 —— 端点与归属见 docs/architecture.md。
 */

import type { FishingFeedbackLevel } from '@/types/fishing';

/**
 * 五档反馈。
 *
 * 顺序即语义：从好到差。用户横着扫一眼就能找到自己那档，
 * 所以顺序不能改。
 */
export const FISHING_FEEDBACK_LEVELS: ReadonlyArray<{
  value: FishingFeedbackLevel;
  label: string;
}> = [
  { value: '爆护', label: '爆护' },
  { value: '好', label: '好' },
  { value: '一般', label: '一般' },
  { value: '差', label: '差' },
  { value: '空军', label: '空军' },
];

export const FISHING_FEEDBACK = {
  /** 卡片标题 */
  title: '鱼口体验',

  /** 未登录时的页面标题 */
  guestTitle: '反馈鱼口',

  /** 未登录时的提交按钮 */
  guestSubmit: '提交反馈',

  /** 提交中 */
  submitting: '提交中…',

  /** 没选档位时的提示 */
  noLevelToast: '请选择鱼口体验',

  /** 未登录时提示去登录的那一句 */
  guestHint: '登录后还能记下渔获、照片和地点',

  /** 未登录时的登录入口 */
  guestLogin: '去登录',

  /** 提交成功的提示 */
  submittedToast: '反馈已提交',

  /** 记录存下了、但鱼口反馈没提交上去 */
  recordOnlyToast: '记录已保存，反馈没提交上',
} as const;
