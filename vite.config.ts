import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  // uni-app 默认只暴露 VITE_ 前缀，这里补上 UNI_APP_ / VUE_APP_，
  // 让 .env.* 里的 UNI_APP_XXX 可以通过 import.meta.env.UNI_APP_XXX 读取
  envPrefix: ["VITE_", "UNI_APP_", "VUE_APP_"],
  plugins: [uni()],
});
