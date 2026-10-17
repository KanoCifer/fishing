<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";

// 和风天气图标字体。必须走 App.vue 引入：编译后进 app.wxss，全局一份。
// 不能写进 uni.scss —— 那个文件会被每个用到 scss 变量的组件各注入一份，
// 34 KB 的 base64 × 十几个组件，包体直接爆。
import "@/styles/qweather-icons.css";

onLaunch(() => {
  console.log("App Launch");
});
onShow(() => {
  console.log("App Show");
});
onHide(() => {
  console.log("App Hide");
});
</script>
<style></style>
