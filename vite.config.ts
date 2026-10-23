import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

// https://vitejs.dev/config/
export default defineConfig({
  // .env.* 里全部用 VITE_ 前缀，也是 uni-app 默认唯一暴露的前缀。
  // UNI_APP_ / VUE_APP_ 是 CLI 时代的遗留，项目里没有任何变量在用，不再声明。
  //
  // 但 envPrefix 不能只写 'VITE_' —— 那等于把 .env 文件里的**每一个** VITE_ 变量
  // 都塞进小程序包体，不管代码有没有读它。密钥一旦写进 .env.production，
  // 就会跟着包发到用户手机上，删代码也删不掉。
  //
  // 所以这里逐个列出白名单：多写一个变量才会进包，少写一个代码就读不到。
  // 往 .env.* 里加新变量时，记得同步加到这里 —— 忘了的话那个变量是 undefined，
  // 不是报错，很容易漏过去。
  envPrefix: [
    'VITE_APP_ENV',
    'VITE_APP_TITLE',
    'VITE_API_BASE_URL',
    'VITE_QWEATHER_FONT_URL',
    'VITE_CDN_BASE_URL',
    'VITE_ENABLE_LOG',
    'VITE_YULU_VERSION',
  ],
  plugins: [uni()],
});
