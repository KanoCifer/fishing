/**
 * 本地草稿 —— 新建钓点页还没提交的那一份。
 *
 * 草稿不是钓点。它是「用户填到一半不想扔掉的那点东西」，
 * 只存在这台设备上、不同步、也不进公开列表 ——
 * 只有提交成功，它才变成一条真正的钓点（而且还要等审核）。
 *
 * 字段名跟着页面里的状态走（name / kind / suitableFor…），
 * 不跟后端 DTO 走：这份数据不过网络，翻译成 DTO 是提交那一刻的事。
 */

import type { FishingSpotCarAccess, FishingSpotFeeType, FishingSpotKind, FishingSpotRoadCondition } from './fishing';

/** 草稿里的位置。坐标是 GCJ-02，和选点地图回来的一致 */
export interface SpotDraftLocation {
  /** 经度 */
  lng: number;
  /** 纬度 */
  lat: number;
  /** 选点地图给的地名 */
  name: string;
  /** 选点地图给的地址 */
  address: string;
}

/**
 * 一份草稿。
 *
 * `version` 是格式版本，不是内容版本：草稿的**形状**变了（多一个字段、
 * 改一个名字）就把版本往上加一位，读的时候对不上就当没有草稿 ——
 * 拿一份老草稿硬套新结构，出来的东西是错的，还不容易看出是错的。
 */
export interface SpotDraft {
  /** 草稿格式版本 */
  version: number;
  /** 存下来的时刻（毫秒时间戳） */
  savedAt: number;
  /** 位置。没选过就是 null */
  location: SpotDraftLocation | null;
  /** 名称 */
  name: string;
  /** 水体类型。没选过就是 null */
  kind: FishingSpotKind | null;
  /** 简介 */
  description: string;
  /** 适合的钓法。存的是中文字面量，跟提交时一样 */
  suitableFor: string[];
  /** 收费情况 */
  feeType: FishingSpotFeeType;
  /** 收费金额。存的是字符串，用户还没填完时就是个「3」，不能丢 */
  feeAmount: string;
  /** 道路情况 */
  roadCondition: FishingSpotRoadCondition;
  /** 能否车到水边 */
  carAccess: FishingSpotCarAccess;
  /** 开放时间 */
  openingHours: string;
  /** 已上传完成的照片（服务端相对路径） */
  photos: string[];
}
