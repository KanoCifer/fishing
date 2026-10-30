/**
 * 钓鱼日志网关 —— 端点清单的唯一出处。
 *
 * 为什么单独一个文件而不并进 `api/fishing.ts`：
 * 那边是**鱼口概率、天气、潮汐、钓点**这条链路上的端点，
 * 全部对着同一个后端网关、同一套天气模型。
 * 钓鱼日志是另一回事 —— 它有自己的表、自己的归属人、自己的读写语义，
 * 连名字都不叫 records（那叫钓鱼记录，是模型训练集）。
 * 两者混在一个文件里，下次有人去 `api/fishing.ts` 里找「记录」，
 * 找到的会是训练集那条匿名端点。
 */

import { request, withSession } from './client';
import type { CreateFishingLogPayload, CreateFishingLogResponse, FishingLog, FishingLogStats } from '@/types/record';

const LOGS_BASE = 'v3/fish/logs';

/**
 * 钓鱼日志网关。
 *
 * 全部走 `withSession`：记录绑定用户，接入方必然要鉴权，
 * 而 access token 恰好是最容易过期的一枚 —— 撞上 401 静默刷一次再重试，
 * 比让页面显示「记录载入失败」强。
 */
export const fishingLogApi = {
  /**
   * 创建一条记录。
   *
   * 渔获记录与空打卡走同一个端点：一条「今天去了但空军」的记录，
   * 和一条「今天钓到 3 条鲫鱼」的记录，数据结构上只差 `catches` 是不是空的。
   * 分成两个端点的话，服务端就得维护两套几乎一样的写入逻辑，
   * 而「当天已有一条打卡」这类幂等判断还得跨两个端点做。
   *
   * `catches` 为空且当天已存在空打卡记录时，服务端不新建行，
   * 返回既有记录且 `created` 为 false。
   */
  create(payload: CreateFishingLogPayload): Promise<CreateFishingLogResponse> {
    return withSession(() =>
      request<CreateFishingLogResponse>({
        url: LOGS_BASE,
        method: 'POST',
        data: payload as unknown as Record<string, unknown>,
      }),
    );
  },

  /**
   * 当月的记录。
   *
   * 按月取，不分页：日历页要的是「这个月的每一天有没有记录」，
   * 而一个月最多也就几十条。翻月就是换一个 `month` 再取一次。
   */
  list(month: string): Promise<FishingLog[]> {
    return withSession(() => request<FishingLog[]>({ url: LOGS_BASE, params: { month } }));
  },

  /** 单条详情 */
  get(id: string): Promise<FishingLog> {
    return withSession(() => request<FishingLog>({ url: `${LOGS_BASE}/${id}` }));
  },

  /**
   * 统计。
   *
   * 连续天数与总天数是跨月的量，前端拿一个月的数据算不出来 ——
   * 服务端一次算好，前端只管显示。
   */
  stats(): Promise<FishingLogStats> {
    return withSession(() => request<FishingLogStats>({ url: `${LOGS_BASE}/stats` }));
  },

  /**
   * 删除一条记录。
   *
   * 只删记录行，服务器上的图片文件留着 —— 图片可能还挂在别的记录上，
   * 删文件这件事得等存储层有引用计数再说。
   */
  remove(id: string): Promise<void> {
    return withSession(() => request<void>({ url: `${LOGS_BASE}/${id}`, method: 'DELETE' }));
  },
};
