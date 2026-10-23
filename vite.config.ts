import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

// https://vitejs.dev/config/
export default defineConfig({
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
