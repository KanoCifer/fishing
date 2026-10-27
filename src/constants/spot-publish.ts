import type { FishingSpotStatus } from '@/types/fishing';

export const SPOT_PUBLISH_NOTICE = {
  line1: '钓点内容由开发者本人采集与维护，本小程序不开放钓点投稿：其他用户请退出本页面，无需提交任何内容。',
  /** 第二行 —— 内容底线 */
  line2: '内容不得违法、虚假、侮辱他人或侵犯他人合法权益，也不得用于违反当地渔业法规的活动。',
  /** 第三行 —— 违规内容怎么处理、怎么处理入口 */
  line3:
    '违规内容会被下架、屏蔽或删除；发现违规内容，可在钓点详情页通过「信息有误？提交反馈」反馈，也可以通过「我的」页的「联系客服」入口告诉我们。',
  /** 链接上的字。点开是关于页里那篇《内容审核与举报说明》 */
  link: '内容审核与举报说明',
} as const;

export const SPOT_PUBLISH_BANNER = {
  /** 徽标上的字 */
  badge: '仅限开发者本人提交',

  text: '本页只接受开发者本人提交的钓点内容，本小程序不开放钓点投稿，其他用户请退出本页面。非本人提交的内容将被退回。',
} as const;

/**
 * 提交前的确认弹窗。
 *
 * 为什么点「提交审核」还要再问一次：这一页填的是要**公开给别人看**的东西，
 * 而提交按钮和别的按钮长得一样。弹一次窗，是让用户在做之前知道这件事的后果。
 *
 * ⚠️ `confirmText` / `cancelText` **最多 4 个汉字** —— 微信对 `uni.showModal`
 * 有硬限制，超出时接口静默失败：弹窗不弹，也不报错，代码继续往下跑
 * （同一个坑见 spot-create/constants.ts 的同名常量）。
 * 想说的话放进 content，那行没有长度限制。
 */
export const SPOT_PUBLISH_CONFIRM = {
  /** 弹窗标题 */
  title: '确认提交？',
  /** 弹窗正文。说清楚「提交后会发生什么」 */
  content:
    '本页只接受开发者本人提交的钓点内容，本小程序不开放钓点投稿。非本人提交的内容将被退回，请确认内容真实、不含违规信息。',
  /** 确认按钮。4 个字 */
  confirm: '确认提交',
  /** 取消按钮 */
  cancel: '再想想',
} as const;

export function spotPublishAuditHint(status: FishingSpotStatus | undefined): string {
  if (status === 'approved') {
    return '这条钓点已通过审核，修改保存后直接生效；修改涉及名称、描述与照片时，我们会重新核查内容合规性。';
  }
  return '修改保存后这条钓点会重新进入待审核，通过后才会在公开地图上展示。';
}

export const SPOT_PUBLISH_REPORT_DOC = {
  /** 行标题。about.ts 里那一条的 key，也是从别处跳过来时带的参数 */
  key: '内容审核与举报说明',
  /** 抽屉副标题 */
  summary: '内容怎么审、违规怎么处理、怎么举报',
} as const;
