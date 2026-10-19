// 创建uniapp可用的Decoder
//
/**
 * 解码器的最小结构。
 *
 * 不直接引用 DOM 的 TextDecoder 类型：这里的类型来自 dom lib，
 * 而小程序侧同时挂着 miniprogram-api-typings，两套全局声明容易互相踩。
 * 实际只需要 decode 这一个方法，按结构声明就够。
 */
interface Decoder {
  decode(input: ArrayBuffer, options?: { stream?: boolean }): string;
}

export function createDecoder() {
  let decoder: Decoder | null = null;
  if (!decoder && typeof TextDecoder !== 'undefined') {
    try {
      decoder = new TextDecoder('utf-8');
    } catch {}
  }

  const decode = (buffer: ArrayBuffer): string => {
    if (!buffer) return '';
    if (decoder instanceof TextDecoder) {
      try {
        return decoder.decode(buffer, { stream: true });
      } catch {}
    }
    return '';
  };

  return decode;
}
