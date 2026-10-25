<script setup lang="ts">
import { onShow, onHide } from '@dcloudio/uni-app';
import '@/styles/generated/qweather-icons.css';

onShow(() => {});
onHide(() => {});
</script>
<style lang="scss">
page {
  background-color: $fish-grouped;
  font-family: $fish-font;
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

  @keyframes fish-enter-sheet {
    @include fish-enter-sheet-frames;
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

/*
 * 流光按钮的转角。
 *
 * inherits 必须是 true：流光按钮拆成外壳（光）与内层（面 + 描边环）两层，
 * 旋转的驱动在外壳上，角度要能传到内层的描边环和外壳自己的光晕，
 * 三者才是同色同速。写成 false 的话，内层拿到的是 initial-value，
 * 环不转、光晕不转，只有外壳那层在转 —— 环和光会对不上。
 *
 * 老设备不支持 @property 时，这条属性就是个普通自定义属性，
 * 而普通自定义属性本来就继承，行为不变（只是插值不连续，转起来一跳一跳）。
 */
@property --fish-flow-angle {
  syntax: '<angle>';
  inherits: true;
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

/*
 * 打字点 —— AI 建议面板生成中用。
 *
 * 三个点错开 160ms：同时跳是「加载」，依次跳才是「在打字」。
 * 幅度只抬 2rpx，再多就变成弹跳了。
 *
 * 放全局一份，理由同上面的入场关键帧。
 */
@keyframes fish-typing {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-2rpx);
  }
}
</style>
