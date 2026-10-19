// 创建uniapp可用的Decoder
//
function createDecoder() {
  let decoder = null;
  if (!decoder && typeof TextDecoder !== 'undefined') {
    try {
      decoder = new TextDecoder('utf-8');
    } catch {}
  }

  const decode = (buffer: ArrayBuffer) => {
    if (!buffer) return '';
    if (decoder) {
      try {
        return decoder.decode(buffer, { stream: true });
      } catch {}
    }
  };

  return decode;
}
