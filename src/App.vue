<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { loadQweatherIconFont } from '@/composables/useQweatherFont';
import '@/styles/qweather-icons.css';

onLaunch(() => {
  void loadQweatherIconFont();
});
onShow(() => {});
onHide(() => {});
</script>
<style lang="scss">
page {
  background-color: #f2f2f7;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.fish-placeholder {
  color: $fish-muted-60;
  font-size: 34rpx;
  line-height: 1.45;
}

/*
 * 入场关键帧 —— 全局一份，被 fish-enter mixin 引用。
 *
 * 放 App.vue 而不是令牌层：令牌层每个组件各加载一份，
 * 写在那里的 @keyframes 会跟着复制十几遍同一个动画定义。
 * 变量和 mixin 放那边（要靠它拿值），@keyframes 放这边（只要一份）。
 *
 * 帧里的值来自令牌层的 fish-enter-frames：改幅度只改那一处。
 *
 * ⚠️ 关键帧也跟着 $fish-motion 一起关：数据页是**用行内 animation-name**
 * 摘掉/挂回入场动画的（见 src/pages/data/index.vue 的 enterStyle）。
 * 降级时如果关键帧还在，那条行内样式照样能引用到它，动画照播 ——
 * 降级开关就只剩下一半了。关键帧没了，行内样式引用不到动画，自动失效。
 */
@if $fish-motion {
  @keyframes fish-enter {
    @include fish-enter-frames;
  }

  @keyframes fish-enter-media {
    from {
      opacity: 0;
      transform: scale(1.06);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
}

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
