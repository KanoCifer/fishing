/**
 * 给 canvas 用的图片源。
 *
 * 为什么需要这一层：`canvas.createImage()` 的 src，官方文档明确承诺的是
 * **网络地址**与 **base64 Data URI**（基础库 2.11.0 起）。
 * 「代码包里的本地路径能不能直接喂给它」并不在文档承诺里 ——
 * 押在这一条上，结果就是真机上那张小程序码或占位插画可能压根没画出来，
 * 而它在开发工具里是好的（换机器才复现）。
 *
 * 所以本地文件一律先读成 base64（FileSystemManager 读代码包内的文件是文档写明的），
 * 再交给画布。这条路有出处，不靠运气。
 */

/** 包内路径的两种写法。两个都试一遍 —— 哪个能用算哪个。 */
function packagePathCandidates(filePath: string): string[] {
  const withoutSlash = filePath.replace(/^\//, '');
  return withoutSlash === filePath ? [filePath] : [filePath, withoutSlash];
}

/**
 * 按扩展名猜 mime。
 *
 * 只认 png 与 jpg —— 海报里只有这两种图（小程序码是 jpg，占位插画是 png）。
 * 猜错了的后果是画布解不出图，所以不做更宽的猜测。
 */
function mimeOf(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

/** 读一个代码包内的文件，返回 base64 data URI。读不出来返回空串 */
function readPackageFile(filePath: string): Promise<string> {
  const candidates = packagePathCandidates(filePath);

  const attempt = (index: number): Promise<string> => {
    if (index >= candidates.length) return Promise.resolve('');

    return new Promise((resolve) => {
      uni.getFileSystemManager().readFile({
        filePath: candidates[index],
        encoding: 'base64',
        success: (res) => resolve(`data:${mimeOf(filePath)};base64,${String(res.data)}`),
        fail: () => resolve(attempt(index + 1)),
      });
    });
  };

  return attempt(0);
}

/**
 * 把一个图片地址换成画布吃得下的东西。
 *
 * - 网络地址（http/https）原样返回 —— 域名要在微信后台的
 *   **downloadFile 合法域名**里，否则那张照片永远不出来；
 * - 代码包内的本地路径（`/static/...`）读成 base64 data URI。
 *
 * 读不出来就返回空串：调用方把它当「这张图没有」处理，
 * 而不是拿一个坏地址去撞画布。
 */
export function toCanvasSource(src: string): Promise<string> {
  if (!src) return Promise.resolve('');
  if (!src.startsWith('/')) return Promise.resolve(src);
  return readPackageFile(src);
}
