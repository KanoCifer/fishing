/**
 * 主题真值 —— 现在是浅色还是深色。
 *
 * 为什么不是 pinia store：canvas 与图标是普通模块（src/utils/*、
 * src/constants/*），拿不到 pinia 实例，而它们恰恰是最需要读主题的地方。
 * 真值放模块级 ref，组件用 computed 包一层就够了。
 *
 * 为什么初值取 hostTheme：app.json 声明了 `darkmode: true` 之后，
 * 微信才在 getAppBaseInfo 的返回值里带上 theme 字段（light / dark）。
 * 没声明时它是 undefined —— 一律当浅色。
 *
 * 为什么还要监听变化：用户可以在应用运行中切系统主题。
 * 页面颜色由 WXSS 媒体查询自动跟着翻，canvas 与图标不会 ——
 * 它们靠这个回调重新取色重画。
 */

import { ref } from 'vue';

export type ThemeMode = 'light' | 'dark';

/**
 * 微信运行时里的 wx —— 只声明用得上的这一条接口。
 *
 * 为什么绕过 uni.*：uni 的类型里有 onThemeChange，
 * 但 mp-weixin 的运行时**没有实现**它（@dcloudio/uni-mp-weixin/dist 里查不到），
 * 只有 uni-app-x 的 dist-x 有。调 uni.onThemeChange 会直接抛 TypeError。
 * 同类例外见 src/utils/privacy.ts 的 openPrivacyContract。
 */
declare const wx: {
  onThemeChange?: (callback: (res: { theme?: string }) => void) => void;
};

/** 当前主题。读它的地方（模板、canvas 绘制）会自动跟着变 */
export const themeMode = ref<ThemeMode>('light');

/** 当前是不是深色 */
export function isDarkTheme(): boolean {
  return themeMode.value === 'dark';
}

/** 写主题。只有两处会写：启动时读一次系统值，之后由系统事件驱动 */
export function setThemeMode(next: ThemeMode): void {
  if (themeMode.value === next) return;
  themeMode.value = next;
}

/**
 * 读一次系统主题。读不到就当浅色 —— 宁可界面是浅的，不要是黑的。
 */
function readSystemTheme(): ThemeMode {
  try {
    const info = uni.getAppBaseInfo();
    return info.hostTheme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

let initialized = false;

/**
 * 初始化主题真值。App.vue 的 onLaunch 调一次。
 *
 * 重复调用无效 —— 监听只注册一次。
 */
export function initTheme(): void {
  if (initialized) return;
  initialized = true;

  setThemeMode(readSystemTheme());

  if (typeof wx.onThemeChange === 'function') {
    wx.onThemeChange((res) => {
      setThemeMode(res?.theme === 'dark' ? 'dark' : 'light');
    });
  }
}
