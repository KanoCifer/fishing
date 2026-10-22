/**
 * 和风天气图标字体 —— 网络加载。
 *
 * 字体本体走 `wx.loadFontFace`，主包里只留「码 → 字形」的映射规则
 * （见 `src/styles/qweather-icons.css`，4 KB）。原来是把字体 base64 内联进
 * 那份 css（40 KB），现在改成运行时拉。
 *
 * 为什么这个状态是模块级的单例：小程序的所有页面共用同一份逻辑层
 * （跟 Pinia 的 store 能跨页共享是同一个道理），所以模块级 ref 就是全局一份。
 * 组件 import 到的都是同一个 ref。
 */

import { ref } from 'vue';

import { ENV } from '@/config/env';

/** 字体族名。必须与 css 里 `.qi` 的 font-family 完全一致 */
export const QWEATHER_FONT_FAMILY = 'qweather-icons';

/**
 * 字体是否已就绪。
 *
 * 组件据此决定要不要画图标 —— 字体没到位时画了就是豆腐块
 * （私用区位码位在系统字体里没有对应字形，会渲染成空心方框）。
 */
export const qweatherFontReady = ref(false);

/**
 * 字体是否加载失败。
 *
 * 失败的两条常见原因：
 * - 微信后台没把字体域名配成 **downloadFile 合法域名**（最常见）；
 * - 网络不通（弱网 / CDN 抽风）。
 *
 * 失败不是致命错误：页面上的读数全是文字，图标没了照样能读。
 * 所以这里只是记录状态，不弹 toast 打扰用户。
 */
export const qweatherFontFailed = ref(false);

/** 重试间隔（ms）。只重试一次 —— 重试更多次换不来一个不通的域名 */
const RETRY_DELAY = 1500;

let inflight: Promise<void> | null = null;

/** 单次加载。失败时 reject，由调用方决定要不要重试 */
function loadOnce(): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.loadFontFace({
      family: QWEATHER_FONT_FAMILY,
      source: `url("${ENV.qweatherFontUrl}")`,
      // 全局生效：图标散在好几个页面里，逐页注册会漏
      global: true,
      // desc 三项都要给：uni 的类型里 variant 是必填的（微信文档说它可选）
      desc: { style: 'normal', weight: 'normal', variant: 'normal' },
      success: (res) => {
        // status: 'loaded' | 'error'。接口成功不代表字体真的加载上了
        const status = (res as { status?: string })?.status;
        if (status === 'loaded') {
          resolve();
          return;
        }
        reject(new Error(`loadFontFace status=${status ?? 'unknown'}`));
      },
      fail: (err) => {
        const message = (err as { errMsg?: string })?.errMsg ?? 'loadFontFace failed';
        reject(new Error(message));
      },
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 加载图标字体。
 *
 * 幂等：并发调用只会真的发一次请求（跟 store 里那两个 in-flight 守卫同一个道理）。
 * 永远 resolve —— 字体失败不该让启动流程挂掉，只把状态标成 failed。
 */
export function loadQweatherIconFont(): Promise<void> {
  if (inflight) return inflight;

  inflight = (async () => {
    // 环境变量没配（自定义构建、.env.local 覆盖掉了）就别去请求一个空地址 ——
    // 报出来的错会指向「网络」而不是「配置」，把人带偏。
    if (!ENV.qweatherFontUrl) {
      qweatherFontFailed.value = true;
      console.warn('[qweather-font] 未配置 VITE_QWEATHER_FONT_URL，天气图标将不显示。');
      return;
    }

    try {
      await loadOnce();
      qweatherFontReady.value = true;
      return;
    } catch {
      // 第一次失败多半是瞬时的（刚打开小程序、网络还在握手），再试一次
      await delay(RETRY_DELAY);
      try {
        await loadOnce();
        qweatherFontReady.value = true;
        return;
      } catch (second) {
        qweatherFontFailed.value = true;
        console.warn(
          `[qweather-font] 图标字体加载失败：${(second as Error).message}\n` +
            `请确认「${ENV.qweatherFontUrl}」已在微信后台配为 downloadFile 合法域名。`,
        );
      }
    }
  })();

  return inflight;
}
