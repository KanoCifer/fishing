import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  // .env.* 里全部用 VITE_ 前缀，也是 uni-app 默认唯一暴露的前缀。
  // UNI_APP_ / VUE_APP_ 是 CLI 时代的遗留，项目里没有任何变量在用，不再声明。
  envPrefix: ["VITE_"],
  plugins: [uni()],
});
