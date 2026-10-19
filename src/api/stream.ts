/**
 * SSE 流式请求 —— 网络层。
 *
 * 普通请求走 `src/api/client.ts`，流式请求不能走那里，有三个绕不开的原因：
 *
 * 1. **uni.request 不传回调就只给 Promise。**
 *    uni 的 promisify 包装只在传了 success/fail/complete 时才把 RequestTask 返回出来
 *    （见 @dcloudio/uni-mp-weixin 的 `promisify`），不传就只给 Promise，
 *    task 丢了就挂不上 `onChunkReceived`，流式直接退化成一次性请求。
 * 2. **响应体不能按 JSON 解析。**
 *    `dataType: 'json'` 会让 wx 对整个响应体做一次 JSON.parse，
 *    而 SSE 的报文是 `data: {...}`，根本不是合法 JSON。
 * 3. **超时覆盖的是整段流，不只是首包。**
 *    wx.request 的 timeout 从发送到 complete 全程计时，大模型生成超过默认 60s
 *    就会被腰斩，所以这里显式放大。
 *
 * 服务端要求：响应头 `Content-Type: text/event-stream` + `Transfer-Encoding: chunked`，
 * 反代（Nginx）要 `proxy_buffering off`，否则分块被缓存住，流式退化成一次性。
 */

import { ApiError, getToken, withQuery } from '@/api/client';
import { ENV } from '@/config/env';
import { createSseDecoder, createUtf8Decoder } from '@/utils/sse';
import type { HttpMethod, QueryValue } from '@/api/client';
import type { SseEvent } from '@/utils/sse';

/**
 * 流式请求默认超时。
 *
 * 5 分钟不是随手写的：wx.request 默认 60s，而大模型生成一段长回答经常要两三分钟，
 * 用默认值会在回答生成到一半时被腰斩，用户看到的是"生成到一半就没了"。
 */
const DEFAULT_STREAM_TIMEOUT = 5 * 60 * 1000;

export interface StreamOptions {
  /** 相对路径，不带基址，如 `v1/chat/stream` */
  url: string;
  method?: HttpMethod;
  /** 请求体。POST 时按 JSON 序列化 */
  data?: Record<string, unknown>;
  /** query 参数。空值会被丢掉 */
  params?: Record<string, QueryValue>;
  /** 追加的请求头，同名的会覆盖上面设的 */
  header?: Record<string, string>;
  /** 收到一条完整 SSE 事件 */
  onEvent: (event: SseEvent) => void;
  /** 流正常结束（服务端关流）。主动 abort 不会触发 */
  onDone?: () => void;
  /** 出错（网络错误、非 2xx）。主动 abort 不会触发 */
  onError?: (err: ApiError) => void;
  /** 超时（毫秒），默认 5 分钟 */
  timeout?: number;
}

/** 流式请求句柄 */
export interface StreamHandle {
  /** 主动断开。断开后不会再有回调 */
  abort(): void;
  /** 流是否已经结束（正常结束、出错或主动断开） */
  readonly closed: boolean;
}

/**
 * 响应体统一读成文本。
 *
 * `responseType: 'arraybuffer'` 拿到的应该是 ArrayBuffer，但服务端如果回的是
 * 非 2xx 的 JSON，某些情况下 wx 会直接给字符串，所以两种都兜住。
 */
function readText(data: unknown): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') {
    return createUtf8Decoder().decode(data as ArrayBuffer);
  }
  return '';
}

/**
 * 从错误响应体里取后端给的 message。
 *
 * 后端统一返回 `{ message, data }` 信封（见 client.ts），这里直接从信封里掏 message。
 * 掏不到就返回空串，让调用方退回状态码兜底文案。
 */
function readErrorMessage(data: unknown): string {
  const text = readText(data);
  if (!text) return '';
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    return typeof parsed.message === 'string' ? parsed.message : '';
  } catch {
    return '';
  }
}

/**
 * 发起一个 SSE 流式请求。
 *
 * 事件按到达顺序逐条回调，回调里只拿到协议层的数据（`{ event, data, id, retry }`），
 * data 的具体结构由调用方自己解析 —— 这一层不做任何业务假设。
 */
export function streamSse(options: StreamOptions): StreamHandle {
  const {
    url,
    method = 'POST',
    data,
    params,
    header: extraHeader,
    onEvent,
    onDone,
    onError,
    timeout = DEFAULT_STREAM_TIMEOUT,
  } = options;

  const sse = createSseDecoder();
  let task: WechatMiniprogram.RequestTask | null = null;
  let closed = false;
  let aborted = false;
  /** 有没有收到过分块。用来识别"服务端没开 chunked"的降级情况 */
  let receivedChunk = false;

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  const token = getToken();
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }
  Object.assign(header, extraHeader);

  const base = ENV.apiBaseUrl.replace(/\/+$/, '');
  const fullUrl = withQuery(`${base}/${url.replace(/^\/+/, '')}`, params);

  /** 派发解析出来的事件 */
  const emit = (events: SseEvent[]) => {
    for (const evt of events) {
      if (closed) return;
      onEvent(evt);
    }
  };

  const onChunk = (res: WechatMiniprogram.OnChunkReceivedListenerResult) => {
    if (closed) return;
    receivedChunk = true;
    emit(sse.decode(res.data));
  };

  /** 收尾：解掉分块监听、标记流已结束 */
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      task?.offChunkReceived(onChunk);
    } catch {
      // 监听解不掉也不影响结果，流已经结束了
    }
  };

  const fail = (err: ApiError) => {
    if (closed) return;
    close();
    onError?.(err);
  };

  const done = () => {
    if (closed) return;
    close();
    onDone?.();
  };

  const requestTask = uni.request({
    url: fullUrl,
    method,
    data,
    header,
    timeout,
    // 流式响应不能按 JSON 解析；响应体是原始字节，靠 onChunkReceived 逐块取
    dataType: 'text',
    responseType: 'arraybuffer',
    enableChunked: true,
    // 声明 enableChunked 后微信会走 HTTP/1.1，这里再显式关一次，
    // 免得某些反代把 HTTP/2 响应也带成 chunked 反而下发不了分块
    enableHttp2: false,
    success: (res) => {
      // 服务端没开 chunked 时，分块回调一次都不会触发，整段响应走 success ——
      // 这时把完整 body 补喂一次，不然这一轮会安静地什么都不吐
      if (!receivedChunk && res.data) {
        const text = readText(res.data);
        if (text) emit(sse.push(text));
      }
      emit(sse.flush());

      const status = res.statusCode;
      if (status >= 200 && status < 300) {
        done();
        return;
      }
      fail(new ApiError(readErrorMessage(res.data) || `请求失败（${status}）`, status));
    },
    fail: (err) => {
      // 主动断开也会走 fail，这里不当错误报出去
      if (aborted) return;
      const message = /timeout/i.test(err.errMsg) ? '请求超时，请检查网络' : '网络异常，请检查网络连接';
      fail(new ApiError(message, 0));
    },
  }) as unknown as WechatMiniprogram.RequestTask;

  // 回调里用的是 task（可能为 null，用 ?. 兜），这里留一份确定非空的给 abort 用
  task = requestTask;

  // 分块监听必须在 task 拿到之后再挂 —— 挂早了拿不到 task，挂晚了会漏掉前面的块
  requestTask.onChunkReceived(onChunk);

  return {
    abort() {
      if (closed) return;
      aborted = true;
      close();
      try {
        requestTask.abort();
      } catch {
        // 已经断了就算了
      }
    },
    get closed() {
      return closed;
    },
  };
}
