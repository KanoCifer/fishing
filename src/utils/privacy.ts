/**
 * 微信官方的隐私协议 —— 打开后台配置的那份「用户隐私保护指引」。
 *
 * 为什么全项目只有这一个文件碰 `wx`：uni 没有 openPrivacyContract，
 * 这个接口只有微信有（@dcloudio/types 里也只补了 wx.openPrivacyContract 的声明）。
 * 别的平台能力仍一律走 `uni.*`（见 AGENTS.md 的平台边界）。
 *
 * 前提两条，少一条都弹不出来：
 * - 基础库 2.32.3 起才有（更低的版本这个方法压根不存在）
 * - 微信后台要配好「用户隐私保护指引」，没配接口直接 fail
 *
 * 不支持 Promise 风格调用（微信文档明说），只能回调包一层。
 */

/**
 * 微信运行时里的 wx —— 只声明用得上的这一条接口。
 *
 * 为什么在这里手写一份窄声明，而不是把 `wx` 加进 lint 的全局白名单：
 * 那道白名单（.oxlintrc.json 的 globals）只放 uni.*、定时器与 console，
 * 它是**平台边界的静态版本** —— 浏览器 API 写进来会直接报错。
 * wx 不是浏览器 API，它是微信自己的运行时；可一旦把它放进全局白名单，
 * 全项目都能绕过 `uni.*` 直接调 wx.request，白名单就废了一半。
 *
 * 声明也只收窄到这一条接口：这个文件里写不出别的 wx.*。
 *
 * 同类做法见 src/utils/selectorQuery.ts —— 那里也是手写了一份原生实例的窄类型。
 */
declare const wx: {
  openPrivacyContract?: (option: { success?: () => void; fail?: (res: { errMsg?: string }) => void }) => void;
};

/**
 * 打开微信官方的隐私协议页。
 *
 * 打不开就 reject —— 兜底由调用方决定（关于页退回本地全文，见 src/pages/about）。
 * 不在这里吞掉错误：弹不出官方协议是**后台没配**造成的，
 * 静默失败会让人以为「隐私政策这一行点得开」。
 */
export function openPrivacyContract(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 基础库低于 2.32.3 时这个方法不存在，直接调会抛 TypeError ——
    // 那不是「打开失败」，是整个点击处理被打断，所以先探一下。
    if (typeof wx.openPrivacyContract !== 'function') {
      reject(new Error('openPrivacyContract: 基础库版本过低'));
      return;
    }

    wx.openPrivacyContract({
      success: () => resolve(),
      fail: (res) => reject(new Error(res?.errMsg ?? 'openPrivacyContract failed')),
    });
  });
}
