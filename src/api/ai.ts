/**
 * AI 网关 —— 对接后端的大模型流式分析接口。
 *
 * 端点与报文格式照抄后端契约，不在这里做"顺手优化"：
 * - `POST /v2/llm/weather-analysis`
 * - 请求体 `{ weather_data, model_id }`
 * - 响应是 SSE，每帧一个 JSON：`{ content, type, is_end }`
 *   —— `type` 区分「思考过程」和「正文」两个通道，`content` 是本帧的增量文本
 * - 结束哨兵是 `data: [DONE]`
 *
 * 这一层只管协议：帧怎么切、哨兵怎么认、JSON 怎么解。
 * 「收到一帧之后怎么办」是调用方的事，不在这里猜。
 */

import { streamSse } from '@/api/stream';
import type { ApiError } from '@/api/client';
import type { StreamHandle } from '@/api/stream';
import type { WeatherAnalysisPayload } from '@/types/fishing';

/** 帧的通道标识 —— 'reasoning' 是思考过程，'content' 是正文 */
export type AiStreamFrameType = 'reasoning' | 'content';

/** 一帧流数据 */
export interface AiStreamFrame {
  /** 本帧的增量文本 */
  content?: string;
  /** 该通道是否到此结束 */
  is_end?: boolean;
  /** 通道标识。缺省按 'content' 处理（后端向后兼容） */
  type?: AiStreamFrameType;
}

/**
 * 可选模型。
 *
 * id 是后端认的模型标识，name 是给人看的。后端加了模型就回来加一行。
 *
 * 目前只留 deepseek-flash 一个：一个选项的下拉框是死 UI ——
 * 点开只有一个选项，用户白多点一次。后端上更多模型时，这里加行、
 * 面板那边把静态标签换回 picker 就行。
 */
export const AI_MODELS = [{ id: 'deepseek-flash', name: 'DeepSeek Flash' }] as const;

/** 默认模型 */
export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

export interface WeatherAnalysisOptions {
  /** 天气 / 潮汐 / 指数的拼装结果 */
  weatherData: WeatherAnalysisPayload;
  /** 模型 id */
  modelId?: string;
  /** 收到一帧 */
  onFrame: (frame: AiStreamFrame) => void;
  /** 流结束。后端哨兵和连接关闭都会走到这里，但只会收到一次 */
  onDone?: () => void;
  /** 出错 */
  onError?: (err: ApiError) => void;
}

/**
 * 发起一次流式天气分析。
 *
 * 返回的句柄可以中途 abort —— 用户点「停止」时靠它断开。
 */
export function streamWeatherAnalysis(options: WeatherAnalysisOptions): StreamHandle {
  const { weatherData, modelId = DEFAULT_AI_MODEL, onFrame, onDone, onError } = options;

  /*
   * 结束的判定有两个来源：后端的 `data: [DONE]` 哨兵，和连接关闭。
   * 两个都会到，先到先算 —— 只报一次，否则调用方会收到两次 onDone。
   */
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  return streamSse({
    url: 'v2/llm/weather-analysis',
    method: 'POST',
    data: {
      weather_data: weatherData,
      model_id: modelId,
    },
    onEvent(event) {
      // 结束哨兵。不是 JSON，别去解
      if (event.data === '[DONE]') {
        finish();
        return;
      }

      let frame: AiStreamFrame;
      try {
        frame = JSON.parse(event.data) as AiStreamFrame;
      } catch {
        // 单帧解不出来不该掐断整条流 —— 后端偶尔混进一帧心跳或注释
        return;
      }
      onFrame(frame);
    },
    onDone: finish,
    onError,
  });
}
