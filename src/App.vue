<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';

import { loadQweatherIconFont } from '@/composables/useQweatherFont';

// 和风天气图标字体的**映射规则**。必须走 App.vue 引入：编译后进 app.wxss，全局一份。
// 不能写进 uni.scss —— 那个文件会被每个用到 scss 变量的组件各注入一份。
//
// 这份 css 里没有字体本体，只有「码 → 字形」的规则（4 KB）；
// 字体走网络加载，见下面 onLaunch 里的 loadQweatherIconFont()。
import '@/styles/qweather-icons.css';

onLaunch(() => {
  console.log('App Launch');

  // 尽早开始拉字体：图标散在天气页的三个卡片里，字体晚到一拍就多一帧空图标。
  // 启动时发起，能和天气接口的请求并行，抢到的就是等待时间。
  void loadQweatherIconFont();
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

/*
 * 流光：角度变量 + 关键帧 —— 全局一份，被 fish-flow mixin 引用。
 *
 * 放这里的理由同上面的 fish-enter：uni.scss 会被每个用到它的组件各注入一份，
 * 写在那里的 @keyframes / @property 会跟着复制好几遍。
 *
 * @property 不是可选项：--fish-flow-angle 必须是注册过的 <angle>，
 * 否则关键帧对它只能离散插值，在 0deg 和 360deg 之间硬跳一次 —— 而这两端的
 * conic 渐变完全相同，等于流光根本不动，只是每 3 秒闪一下。
 *
 * inherits: false：角度只在本元素上生效，靠 --fish-flow 这条已替换好的渐变
 * 往下传（自定义属性的计算值就是替换后的结果），不靠角度变量本身继承。
 */
@property --fish-flow-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes fish-flow-spin {
  from {
    --fish-flow-angle: 0deg;
  }
  to {
    --fish-flow-angle: 360deg;
  }
}
</style>
