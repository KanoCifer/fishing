/**
 * SSE 流式解析底座。
 *
 * 小程序没有 EventSource、没有 fetch、没有 `responseType: 'stream'`，
 * 拿流式响应只有一条路：`wx.request` 的 `enableChunked` + `RequestTask.onChunkReceived`。
 * 那个回调给的是 ArrayBuffer，所以这里负责把字节流变成"一条条事件"：
 *
 *   ArrayBuffer chunk → UTF-8 文本 → SSE 事件
 *
 * 两个坑，都是真机才暴露的，开发者工具上看不出来：
 *
 * - **TextDecoder 真机上没有**。开发者工具有、真机没有（微信阉割了 Web API）。
 *   "有就用、没有就降级"的写法会造出只在真机复现的 bug —— 工具里跑得好好的，
 *   真机上解析出来是空字符串，表现为"流式一直没反应"。所以这里根本不用它，
 *   自己写一份字节级解码，开发者工具和真机走同一条路径。
 * - **chunk 边界会切在多字节字符和事件中间**。一个中文字符 3 字节，切一刀就乱码；
 *   一条 SSE 事件（`data: {...}\n\n`）也可能被切成两块。两者都得跨块缓冲，
 *   不能逐块独立解码再拼接。
 */

/** 非法字节解码出来的替换字符，和浏览器 TextDecoder 的行为一致 */
const REPLACEMENT = '\uFFFD';

/**
 * 按首字节判断 UTF-8 序列长度；返回 0 表示这个字节不能作为序列开头。
 *
 * 范围按 UTF-8 规范收紧过：C0/C1 是过长编码，F5 及以上超出 Unicode 上限，
 * 一律当非法字节处理。
 */
function utf8SequenceLength(lead: number): number {
  if (lead <= 0x7f) return 1;
  if (lead >= 0xc2 && lead <= 0xdf) return 2;
  if (lead >= 0xe0 && lead <= 0xef) return 3;
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  return 0;
}

/** 码点转字符串。超过 BMP 的手工拼代理对，不依赖 String.fromCodePoint */
function codePointToString(codePoint: number): string {
  if (codePoint <= 0xffff) return String.fromCharCode(codePoint);
  const offset = codePoint - 0x10000;
  return String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
}

/**
 * 统一成 Uint8Array。
 *
 * 用 `Object.prototype.toString` 而不是 `instanceof`：开发者工具和真机是不同 realm，
 * 跨 realm 时 `instanceof` 会失灵（真机上拿到的 ArrayBuffer 原型不是当前 realm 的），
 * 结果就是明明传了 ArrayBuffer 却走进兜底分支，静默丢掉整块数据。
 */
function toBytes(chunk: ArrayBuffer | Uint8Array): Uint8Array {
  const tag = Object.prototype.toString.call(chunk);
  if (tag === '[object Uint8Array]') return chunk as Uint8Array;
  if (tag === '[object ArrayBuffer]') return new Uint8Array(chunk as ArrayBuffer);
  if (tag === '[object ArrayBufferView]') {
    const view = chunk as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return new Uint8Array(0);
}

/** UTF-8 增量解码器 */
export interface Utf8Decoder {
  /** 解码一个 chunk，返回这次能完整解出来的文本 */
  decode(chunk: ArrayBuffer | Uint8Array): string;
  /** 流结束时调用：吐出被截断的尾巴 */
  flush(): string;
}

/**
 * 字节级 UTF-8 增量解码器。
 *
 * 为什么不直接 `new TextDecoder()`：真机上没有这个全局对象，而真机恰恰是唯一
 * 需要它的地方。自己实现一遍成本不高，换来的是开发者工具和真机行为完全一致。
 */
export function createUtf8Decoder(): Utf8Decoder {
  /** 上一块没解完的字节（序列被切断时留下的尾巴） */
  let pending: number[] = [];

  const decode = (chunk: ArrayBuffer | Uint8Array): string => {
    const bytes = toBytes(chunk);
    if (bytes.length === 0) return '';

    // 有残留就把残留接到新块前面：残留里的字节可能和下一个字节凑成一个字符
    let buf = bytes;
    if (pending.length > 0) {
      buf = new Uint8Array(pending.length + bytes.length);
      buf.set(pending, 0);
      buf.set(bytes, pending.length);
      pending = [];
    }

    let out = '';
    let i = 0;

    while (i < buf.length) {
      const lead = buf[i];

      // ASCII
      if (lead <= 0x7f) {
        out += String.fromCharCode(lead);
        i += 1;
        continue;
      }

      const len = utf8SequenceLength(lead);
      if (len === 0) {
        out += REPLACEMENT;
        i += 1;
        continue;
      }

      // 序列不完整 —— 整段留到下一块再解
      if (i + len > buf.length) {
        for (let k = i; k < buf.length; k += 1) pending.push(buf[k]);
        break;
      }

      // 后续字节必须是 10xxxxxx
      let valid = true;
      for (let k = 1; k < len; k += 1) {
        if ((buf[i + k] & 0xc0) !== 0x80) {
          valid = false;
          break;
        }
      }
      if (!valid) {
        out += REPLACEMENT;
        i += 1;
        continue;
      }

      let codePoint = lead & (0xff >> (len + 1));
      for (let k = 1; k < len; k += 1) codePoint = (codePoint << 6) | (buf[i + k] & 0x3f);

      // 过长编码、代理区、超出 Unicode 上限
      if (
        (len === 2 && codePoint < 0x80) ||
        (len === 3 && codePoint < 0x800) ||
        (len === 4 && codePoint < 0x10000) ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        out += REPLACEMENT;
        i += 1;
        continue;
      }

      out += codePointToString(codePoint);
      i += len;
    }

    return out;
  };

  return {
    decode,
    flush() {
      if (pending.length === 0) return '';
      // 序列被截断：按一个替换字符收尾，和 TextDecoder 的行为一致
      pending = [];
      return REPLACEMENT;
    },
  };
}

/** 一条 SSE 事件 */
export interface SseEvent {
  /** event 字段；服务端没指定时是 'message' */
  event: string;
  /** data 字段；多行用 \n 连接 */
  data: string;
  /** id 字段；服务端没指定时是空串 */
  id: string;
  /** retry 字段（毫秒）；服务端没指定时是 undefined */
  retry?: number;
}

/** SSE 增量解析器 */
export interface SseDecoder {
  /** 喂一个 chunk，返回这次能完整解析出的事件 */
  decode(chunk: ArrayBuffer | Uint8Array): SseEvent[];
  /** 喂一段已经解码好的文本。响应体不是二进制时走这里 */
  push(text: string): SseEvent[];
  /** 流结束（服务端关连接）时调用，吐出没收到收尾空行的事件 */
  flush(): SseEvent[];
}

/**
 * SSE 增量解析器。
 *
 * 按 WHATWG 的事件流格式实现，但有一处刻意放宽：`flush()` 会把"最后一行没带行尾符"
 * 的内容当成正常一行处理。规范要求丢弃它，可大模型网关经常是"写完最后一条 data
 * 就关连接"，照规范丢事件等于丢答案。
 *
 * 另外注意 `data` 的累积规则：多条 data 行会先各自入队，派发时用 \n 连接 ——
 * 末尾那个 \n 是协议规定的分隔符，不能留在内容里。
 */
export function createSseDecoder(): SseDecoder {
  const utf8 = createUtf8Decoder();

  /** 还没处理完的文本（可能被 chunk 边界切开） */
  let buffer = '';
  /** 当前事件累积的 data 行 */
  let dataLines: string[] = [];
  /** 当前事件的 event 类型 */
  let eventType = '';
  /** 最后一条 id（协议规定 id 会延续到后续事件） */
  let lastId = '';
  /** retry 字段 */
  let retry: number | undefined;

  /** 派发当前事件；没有 data 就不派发（只重置 event 类型） */
  const dispatch = (): SseEvent | null => {
    if (dataLines.length === 0) {
      eventType = '';
      return null;
    }
    const data = dataLines.join('\n');
    dataLines = [];
    const type = eventType || 'message';
    eventType = '';
    const evt: SseEvent = { event: type, data, id: lastId };
    if (retry !== undefined) evt.retry = retry;
    return evt;
  };

  /** 处理一行（已去掉行尾符） */
  const handleLine = (line: string): SseEvent | null => {
    // 空行 = 事件边界
    if (line === '') return dispatch();

    // ':' 开头是注释，大模型网关拿它当心跳
    if (line.charCodeAt(0) === 58) return null;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    // 规范：冒号后的第一个空格要去掉
    if (value.charCodeAt(0) === 32) value = value.slice(1);

    switch (field) {
      case 'data':
        dataLines.push(value);
        break;
      case 'event':
        eventType = value;
        break;
      case 'id':
        // 含 NUL 的 id 按规范忽略
        if (value.indexOf('\u0000') === -1) lastId = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) retry = Number(value);
        break;
      default:
        // 未知字段直接忽略：服务端加新字段不该让客户端炸掉
        break;
    }
    return null;
  };

  /** 把文本喂进状态机，返回本次能派发的事件 */
  const feed = (text: string): SseEvent[] => {
    buffer += text;
    const events: SseEvent[] = [];
    let start = 0;
    let i = 0;

    while (i < buffer.length) {
      const ch = buffer.charCodeAt(i);

      // \n
      if (ch === 10) {
        const evt = handleLine(buffer.slice(start, i));
        if (evt) events.push(evt);
        i += 1;
        start = i;
        continue;
      }

      // \r —— 末尾的孤立 \r 可能是 \r\n 的前半段，要等下一个字符再决定
      if (ch === 13) {
        if (i + 1 >= buffer.length) break;
        const evt = handleLine(buffer.slice(start, i));
        if (evt) events.push(evt);
        i += buffer.charCodeAt(i + 1) === 10 ? 2 : 1;
        start = i;
        continue;
      }

      i += 1;
    }

    buffer = buffer.slice(start);
    return events;
  };

  return {
    decode(chunk) {
      return feed(utf8.decode(chunk));
    },
    push(text) {
      return feed(text);
    },
    flush() {
      const events: SseEvent[] = [];

      // 缓冲区里最后一行没有行尾符：宽松处理成正常一行
      if (buffer.length > 0) {
        const evt = handleLine(buffer);
        buffer = '';
        if (evt) events.push(evt);
      }

      // 收了 data 但没收到收尾空行的事件
      const evt = dispatch();
      if (evt) events.push(evt);

      // 解码器里没解完的字节也收个尾
      utf8.flush();

      return events;
    },
  };
}
