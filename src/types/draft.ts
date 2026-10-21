/**
 * 本地草稿 —— 新建钓点页还没提交的那一份。
 *
 * 草稿不是钓点。它是「用户填到一半不想扔掉的那点东西」，
 * 只存在这台设备上、不同步、也不进公开列表 ——
 * 只有提交成功，它才变成一条真正的钓点（而且还要等审核）。
 *
 * 字段名跟着页面里的状态走（name / kind / suitableFor…），
 * 不跟后端 DTO 走：这份数据不过网络，翻译成 DTO 是提交那一刻的事。
 *
 * 草稿的形状就是表单模型本身（见 types/spot-form）——
 * 草稿是「填到一半的那张表」，不是另一套字段。
 */

import type { SpotFormLocation, SpotFormModel } from './spot-form';

/** 草稿里的位置。坐标是 GCJ-02，和选点地图回来的一致 */
export type SpotDraftLocation = SpotFormLocation;

/**
 * 一份草稿。
 *
 * `version` 是格式版本，不是内容版本：草稿的**形状**变了（多一个字段、
 * 改一个名字）就把版本往上加一位，读的时候对不上就当没有草稿 ——
 * 拿一份老草稿硬套新结构，出来的东西是错的，还不容易看出是错的。
 */
export interface SpotDraft extends SpotFormModel {
  /** 草稿格式版本 */
  version: number;
  /** 存下来的时刻（毫秒时间戳） */
  savedAt: number;
}
