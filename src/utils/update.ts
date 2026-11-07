/**
 * 小程序版本更新检测。
 *
 * 微信的 UpdateManager 有三条限制，决定了这个模块只能这么写：
 *
 * 1. **只在冷启动时向后台问一次版本** —— 没有「立即检查更新」这个 API，
 *    所以检测只能在 App.onLaunch 挂一次，等用户点某个按钮再查是不存在的。
 * 2. **只在已发布的正式版上有效** —— 开发版、体验版里回调根本不触发。
 *    开发阶段看不到弹窗是正常的，不是代码坏了。
 * 3. **新版是后台悄悄下载的** —— onUpdateReady 回调时新包已经下好了，
 *    applyUpdate 只是重启一次让新包生效（当前会话会被杀掉）。
 *
 * 平台能力走 uni.* 命名空间（见 AGENTS.md 的平台边界）：
 * uni.getUpdateManager 在 mp-weixin 上转发到微信原生实现。
 * 这个方法在 uni 的类型声明里属于 legacy 区，调用前探一下存在性 ——
 * 基础库太老时它是 undefined，直接调会抛 TypeError。
 */

import { ENV } from '@/config/env';

/**
 * confirmText / cancelText **最多 4 个字符**，超了微信静默失败
 * （按钮变成默认文案，不报错）—— 见 docs/mp-weixin-platform.md。
 */
const UPDATE_MODAL = {
  title: '版本更新',
  content: '新版本已下载完成，重启后生效。',
  confirmText: '立即更新',
  cancelText: '稍后',
} as const;

/**
 * 只在 App.onLaunch 调一次。
 */
export function setupAppUpdate(): void {
  const manager = uni.getUpdateManager?.();
  if (!manager || typeof manager.onUpdateReady !== 'function') return;

  manager.onCheckForUpdate((res) => {
    if (ENV.enableLog) {
      console.log(`[update] 检查更新：${res.hasUpdate ? '有新版本' : '已是最新'}`);
    }
  });

  manager.onUpdateReady(() => {
    uni.showModal({
      title: UPDATE_MODAL.title,
      content: UPDATE_MODAL.content,
      confirmText: UPDATE_MODAL.confirmText,
      cancelText: UPDATE_MODAL.cancelText,
      success(res) {
        // 取消不是错误：用户可能正在钓鱼，不想现在被打断。
        // 新包已经下好，下次冷启动还会再提示一次。
        if (!res.confirm) return;

        // 重启后当前会话里的内存状态全部丢失 —— 这是预期行为，
        // 登录态靠本地存储，重新拉起后还在。
        manager.applyUpdate();
      },
    });
  });

  manager.onUpdateFailed(() => {
    // 下载失败时微信自己会重试，用户侧不需要知道。
    if (ENV.enableLog) console.warn('[update] 新版本下载失败');
  });
}
