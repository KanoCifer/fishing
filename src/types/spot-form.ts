/**
 * 钓点表单模型 —— 新建与编辑两页共用的那份表单状态。
 *
 * 为什么单独一个类型：这两页填的是同一张表（同一批字段、同一套校验），
 * 草稿、提交载荷、回填都从它出发。模型一旦分成两份，
 * 「新建能填的字段编辑页填不了」这类问题要等用户撞上才发现。
 *
 * 字段名跟着表单走（name / kind / suitableFor…），不跟后端 DTO 走：
 * 翻译成 DTO 是提交那一刻的事（见 utils/spot-update 与 pages/spot-create）。
 */

import type { FishingSpotCarAccess, FishingSpotFeeType, FishingSpotKind, FishingSpotRoadCondition } from './fishing';

/** 表单里的位置。坐标是 GCJ-02，和选点地图回来的一致 */
export interface SpotFormLocation {
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
 * 一份表单。
 *
 * photos 存的是**服务端相对路径**，不是能直接显示的地址 ——
 * 显示那一层由 mediaUrl() 负责（见 api/upload）。
 */
export interface SpotFormModel {
  /** 位置。没选过就是 null */
  location: SpotFormLocation | null;
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
  /** 收费金额。存字符串 —— 用户还没填完时就是个「3」，不能丢 */
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

/**
 * 一份空表单。
 *
 * 三个枚举字段的默认值就是「还没选」—— 与后端的 unknown 同义，
 * 新建和回填都用得上。
 */
export function createEmptySpotForm(): SpotFormModel {
  return {
    location: null,
    name: '',
    kind: null,
    description: '',
    suitableFor: [],
    feeType: 'unknown',
    feeAmount: '',
    roadCondition: 'unknown',
    carAccess: 'unknown',
    openingHours: '',
    photos: [],
  };
}
