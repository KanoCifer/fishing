/**
 * 钓点域网关 —— 端点清单的唯一出处。
 *
 * 与源项目 `packages/api/src/gateways/` 的区别：
 * - axios → `uni.request`（`request` 已经把 `{ message, data }` 信封剥了，这里直接拿业务对象）
 * - 砍掉高德安全密钥、weather/full、AI 流式三个端点
 * - 其余端点路径、参数格式、返回形状一律照抄后端契约，不做"顺手优化"
 */

import { request, withSession } from './client';
import type {
  CreateFishingSpotPayload,
  FishingFeedbackPayload,
  FishingFeedbackResponse,
  FishingIndexData,
  FishingSpot,
  FishingStats,
  TideApiEnvelope,
  TideData,
  UpdateFishingSpotPayload,
} from '@/types/fishing';

/** 经度在前，和源项目保持一致 —— 写反了会定位到地球另一侧，但不报错 */
export type LngLat = [number, number];

/**
 * 查询参数用的坐标串。
 *
 * 保留两位小数是后端的约定（也是刻意的位置模糊），不要为了"更精确"改成 toFixed(6)：
 * 后端按两位小数做缓存和降级，位数变了缓存全部 miss。
 */
function toLocationParam(location: LngLat): string {
  const [lng, lat] = location;
  return `${lng.toFixed(2)},${lat.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// 钓鱼指数 / 天气 / 潮汐
// ---------------------------------------------------------------------------

export const fishingApi = {
  /**
   * 钓鱼指数。
   *
   * `enriched: true` 时后端顺带返回天气、日预报、潮汐、小时报 —— 这是本项目取天气
   * 数据的唯一入口。旧实现并发调 weather/full + fishing/index，导致后端对同一
   * location 取数两次（fishing/index 内部还会再调一次 weather/full），已废弃。
   *
   * 注意 enriched 响应不含生活指数，所以 `WeatherIndex[]` 在本项目恒为空数组，
   * UI 侧按空态渲染。
   */
  getFishingIndex(location: LngLat, enriched = true): Promise<FishingIndexData> {
    return request<FishingIndexData>({
      url: 'v2/fishing/index',
      params: {
        location: toLocationParam(location),
        enriched: String(enriched),
      },
    });
  },

  /** 提交钓鱼反馈 */
  submitFeedback(payload: FishingFeedbackPayload): Promise<FishingFeedbackResponse> {
    return request<FishingFeedbackResponse>({
      url: 'v2/fishing/feedback',
      method: 'POST',
      data: payload as unknown as Record<string, unknown>,
    });
  },

  /** 钓鱼记录统计 */
  getStats(): Promise<FishingStats> {
    return request<FishingStats>({ url: 'v2/fishing/stats' });
  },

  /** 潮汐。接口返回带缓存标记的包装层，取不取由调用方决定 */
  getTide(payload: { harbor: string; date: string }): Promise<TideApiEnvelope> {
    return request<TideApiEnvelope>({
      url: 'v3/weather/tide',
      params: { harbor: payload.harbor, date: payload.date },
    });
  },

  /** 只要潮汐本体，不要缓存标记 —— 面板展示用不到 fromCache */
  async getTideData(payload: { harbor: string; date: string }): Promise<TideData> {
    const envelope = await fishingApi.getTide(payload);
    return envelope.data;
  },
};

// ---------------------------------------------------------------------------
// 钓点 CRUD
// ---------------------------------------------------------------------------

/** 删除方式：软删只置 DeletedAt，物理删彻底移除数据 */
export interface DeleteFishingSpotOptions {
  /** true = 物理删除；省略 / false = 软删 */
  hard?: boolean;
}

const SPOTS_BASE = 'v3/fish/spots';

/*
 * 钓点写操作走 withSession 包装。
 *
 * request 只负责发请求和剥信封，401 它直接抛 —— 不会去刷 token。
 * 刷新那件事在 api/auth 的 withSession 里：撞上 401 就静默刷一次再重试。
 * 写入类端点全都要求登录，token 恰好是最容易过期的一枚，所以这几个都要包。
 * 公开的 list / getById 不包 —— 它们不带头也能调，401 不该由它们来解释。
 */
export const fishingSpotApi = {
  /** 钓点列表 */
  list(): Promise<FishingSpot[]> {
    return request<FishingSpot[]>({ url: SPOTS_BASE });
  },

  /**
   * 我提交的钓点。
   *
   * 公开列表只含已过审的条目 —— 公开接口把 status 写死成 approved，
   * 所以自己刚提交的那条（pending）只能在这里看见，连带它的审核状态。
   */
  listMine(): Promise<FishingSpot[]> {
    return withSession(() => request<FishingSpot[]>({ url: `${SPOTS_BASE}/mine` }));
  },

  getById(id: string): Promise<FishingSpot> {
    return request<FishingSpot>({ url: `${SPOTS_BASE}/${id}` });
  },

  /**
   * 创建钓点。
   *
   * 后端返回**创建好的钓点对象**（含 id / status），不是空响应 ——
   * 提交完要靠它跳详情页，也要靠 status 告诉用户「已提交，待审核」。
   */
  create(payload: CreateFishingSpotPayload): Promise<FishingSpot> {
    return withSession(() =>
      request<FishingSpot>({
        url: SPOTS_BASE,
        method: 'POST',
        // location 是元组，序列化成 JSON 交给后端解
        data: payload as unknown as Record<string, unknown>,
      }),
    );
  },

  /**
   * 更新钓点。
   *
   * ⚠️ 路由用 PUT 而不是 PATCH：`wx.request` 的合法方法里没有 PATCH
   * （详见 `client.ts` 的 HttpMethod 注释），小程序端发不出这个动词。
   * 后端已按 PUT 注册（`internal/handler/fish_handler.go`），
   * 早期注册的 PATCH 那条路小程序永远走不通。
   *
   * 另外后端的 update 是 Partial 语义（不传的字段不动），而 PUT 惯例是全量替换。
   * 这里的 DTO 全是指针字段，**刻意**走部分更新：只传名字不会把地址清空。
   */
  update(id: string, payload: UpdateFishingSpotPayload): Promise<void> {
    return withSession(() =>
      request<void>({
        url: `${SPOTS_BASE}/${id}`,
        method: 'PUT',
        data: payload as unknown as Record<string, unknown>,
      }),
    );
  },

  remove(id: string, options: DeleteFishingSpotOptions = {}): Promise<void> {
    return withSession(() =>
      request<void>({
        url: `${SPOTS_BASE}/${id}`,
        method: 'DELETE',
        // 只在物理删时带 hard=true，软删不带 —— 带成字符串 "false" 后端一样会当软删，
        // 但这种"写了跟没写一样"的参数最容易在排查时把人带偏
        params: options.hard ? { hard: 'true' } : undefined,
      }),
    );
  },
};
