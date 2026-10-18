<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';

// 和风天气图标字体。必须走 App.vue 引入：编译后进 app.wxss，全局一份。
// 不能写进 uni.scss —— 那个文件会被每个用到 scss 变量的组件各注入一份，
// 34 KB 的 base64 × 十几个组件，包体直接爆。
import '@/styles/qweather-icons.css';

onLaunch(() => {
  console.log('App Launch');
});
onShow(() => {
  console.log('App Show');
});
onHide(() => {
  console.log('App Hide');
});
</script>
<style lang="scss">
/*
 * 全局底色与字体栈。
 *
 * 字体：-apple-system 在 iOS 上解析到 SF Pro，它自带光学字号和默认字距表 ——
 * 数字（钓鱼指数那一大串、坐标、潮高）在 SF Pro 下比微信默认字体好看得多，
 * 且高分屏不会糊。中文落到 PingFang SC。
 *
 * 底色：systemGroupedBackground。放在这里而不是各页面，是因为小程序页面在切换时
 * 会先露出这层底色 —— 页面白底、切换瞬间灰一下，是最容易露馅的一处。
 */
page {
  background-color: #f2f2f7;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/*
 * 入场关键帧 —— 全局一份，被 fish-enter mixin 引用。
 *
 * 放在 App.vue 而不是 uni.scss，和上面那段图标字体的注释是同一个理由：
 * uni.scss 会被每个用到它的组件各注入一份，写在这里的 @keyframes
 * 会跟着复制十几遍同一个动画定义。变量和 mixin 放那边（要靠它拿值），
 * @keyframes 放这边（只要一份）。
 *
 * from 一帧就带上位移，所以整段位移始终发生在合成层。
 */
@keyframes fish-enter {
  from {
    opacity: 0;
    transform: translateY($fish-enter-y);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
