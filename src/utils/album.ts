/**
 * 保存图片到相册。
 *
 * 为什么单独一个文件：保存到相册要处理**授权**，
 * 而授权的失败和保存本身的失败是两件事 ——
 * 前者要引导用户去设置页，后者重试一次可能就好了。
 * 混在一起写，最后都变成一句「保存失败」。
 */

/** 失败原因。调用方要按这个给不同的说法 */
export type SaveFailure = 'denied' | 'failed';

export interface SaveResult {
  ok: boolean;
  /** 失败原因。用户明确拒绝过相册权限 → 'denied' */
  reason?: SaveFailure;
}

/** 微信的拒绝文案长这样，别的都是保存本身出了问题 */
function isAuthError(message: string): boolean {
  return /auth|deny|authorize/i.test(message);
}

/**
 * 当前相册权限状态。
 *
 * 三档的含义跟定位那边一样（见 docs/mp-weixin-platform.md）：
 * - true：已授权
 * - false：用户明确拒绝过 —— 微信不会再弹窗，只能引导去设置页
 * - undefined：还没问过
 */
export async function getAlbumAuthState(): Promise<boolean | undefined> {
  return new Promise((resolve) => {
    uni.getSetting({
      success: (res) => {
        resolve(res.authSetting?.['scope.writePhotosAlbum']);
      },
      fail: () => resolve(undefined),
    });
  });
}

/**
 * 把图片存进相册。
 *
 * 第一次调用时微信会自己弹授权窗；用户拒绝之后 `scope.writePhotosAlbum`
 * 变成 false，再调只会静默失败 —— 所以要先读状态，把「被拒过」这个情况
 * 单独报出去，界面上才给得出「去设置里打开」而不是「再试一次」。
 */
export async function saveImageToAlbum(filePath: string): Promise<SaveResult> {
  const granted = await getAlbumAuthState();
  if (granted === false) {
    return { ok: false, reason: 'denied' };
  }

  return new Promise((resolve) => {
    uni.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve({ ok: true }),
      fail: (err) => {
        const message = String((err as { errMsg?: string })?.errMsg ?? '');
        resolve({ ok: false, reason: isAuthError(message) ? 'denied' : 'failed' });
      },
    });
  });
}

/**
 * 打开设置页。
 *
 * 用户明确拒绝过相册权限时，除了这里没别的路 ——
 * 微信的授权弹窗对已拒绝的权限不会再弹。
 */
export function openAlbumSetting(): void {
  uni.openSetting({
    fail: () => {
      // 设置页打不开不算错，但得让调用方知道没成功
    },
  });
}
