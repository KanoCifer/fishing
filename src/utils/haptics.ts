/**
 * 触觉反馈 —— 全项目震动的唯一出入口。
 *
 * 震动是「非视觉反馈」，跟动效同族（见 utils/motion.ts）：都是把「刚刚发生的事」
 * 送到用户身上，一条走眼睛一条走手。两者都要收口在一处，否则同一个动作
 * 在两个页面会用两种强度表达，改版时也总有漏删的旧调用。
 *
 * **什么时候震：只有「结果会在一两秒内从屏幕上消失」的时刻。**
 * 提交成功弹的 toast 会消失，浮层吸附落位之后没有任何标记留在屏幕上 ——
 * 这些时刻用户可能没在看屏幕，只靠眼睛会读漏，给一次触觉才补上这条通道。
 *
 * 反过来，确认还在屏幕上的时候不给第二条通道：投稿成功弹的是模态框，
 * 模态框本身就是确认，再叠一次震动只是噪音。
 *
 * 也不要给「点按钮、切标签、选选项」这些动作加：视觉上已经说清楚了，
 * 而且震动一旦密集起来就只剩噪音，还会训练用户忽略它
 * （见 docs/design-system.md 的「触觉」）。
 *
 * **强度怎么定：**
 * - `light`  一次落位（浮层吸附到下一档）
 * - `medium` 一个动作完成了（提交成功）
 * - `heavy`  失败了（提交被拒、网络错误）
 *
 * 微信的 `type` 参数在 uni 的类型声明里没有（UniNamespace.VibrateShortOptions
 * 只声明了 success/fail/complete），但运行时是原样透传给 `wx.vibrateShort` 的 ——
 * 见 @dcloudio/uni-mp-weixin 的 initUni：没有特例的接口直接落到 wx 上。
 * 所以这里自己收窄一次类型，别让 `type` 漏在调用点。
 */

/** 震动强度。跟微信 wx.vibrateShort 的 type 同名同值 */
export type HapticStrength = 'light' | 'medium' | 'heavy';

/**
 * 两次震动之间的最小间隔（毫秒）。
 *
 * 手速快的时候连着触发会叠成一段长震，读起来像「卡了一下」，
 * 而不是两次独立的确认。60ms 短到不影响节奏，又足够把连击分开。
 */
const MIN_INTERVAL = 60;

/** 上一次震动的时间戳。0 = 还没震过 */
let lastAt = 0;

/**
 * 震一下。
 *
 * 设备不支持震动（开发者工具的模拟器、部分机型）时静默跳过 ——
 * 触觉是加分项，不能让它把交互带崩。
 */
export function haptic(strength: HapticStrength = 'light'): void {
  const now = Date.now();
  if (now - lastAt < MIN_INTERVAL) return;
  lastAt = now;

  try {
    /*
     * 传 fail 回调是为了不让 uni 把这次调用包成 Promise：
     * 震不了的时候接口是失败的，而没有 catch 的 Promise 失败
     * 会变成一条未捕获的拒绝，在真机日志里平白多一条红字。
     */
    const result = uni.vibrateShort({ type: strength, fail: () => {} }) as unknown;

    // 万一 uni 仍然返回了 Promise，再兜一次它的失败
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // 震不了就算了
  }
}
