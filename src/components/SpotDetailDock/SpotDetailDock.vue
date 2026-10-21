<template>
  <!--
    底部导航条 —— 浮在内容之上的那一个动作。

    整页只有「去那儿」一件事要做，所以它是满宽的主色 pill：
    独占一行、整条都是热区，比半宽的按钮好按得多。

    底色是渐隐而不是实色 —— 内容从它底下滚过去时，实底会像刀切一样
    把内容截断，渐隐则让内容「沉进去」。跟头图那头的压暗是同一种手法。
  -->
  <view class="dock">
    <view class="dock__cta" @tap="emit('nav')">
      <image class="dock__icon" :src="navIcon" mode="aspectFit" />
      <text class="dock__text">前往钓点</text>
      <text class="dock__dist">· {{ distance }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailDock —— 底部导航 CTA。
 *
 * 位置用 fixed 而不是 CSS 的 position: sticky：这一页配了
 * navigationStyle: "custom"，sticky 的粘附基准在自定义导航栏下不可靠
 * （粘到哪儿取决于浮层的高度和滚动容器的 overflow），实测会粘到
 * 状态栏下面被胶囊盖住。自己算位置反而是确定的 —— 同 VerdictBar。
 */
import { icon } from '@/constants/icons';

const emit = defineEmits<{
  nav: [];
}>();

defineProps<{
  /** 距离展示文案（"12.1 km" / "距离未知"） */
  distance: string;
}>();

/** 导航键的箭头。压在主色按钮上，所以是白色 */
const navIcon = icon('navigation', 'onAccent');
</script>

<style lang="scss" scoped>
/*
 * 底栏本体。
 *
 * 渐隐底：上半段完全透明（内容从这儿看过去不受阻），
 * 往下逐渐压实，到按钮那一行已经接近实底。
 */
.dock {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  padding: 48rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: $fish-dock-fade;
}

/*
 * 主按钮。
 *
 * 满宽药丸。min-height 108rpx（54pt）—— 拇指点得中的高度。
 * 按下缩到 0.97：iOS 的按钮是手指落下就开始缩，抬手才回弹，
 * 等 click 再反应就是「假」的。
 */
.dock__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  width: 100%;
  min-height: 108rpx;
  border-radius: $fish-radius-pill;
  background: $fish-gradient;
  box-shadow: $smooth-shadow-lg;
  @include fish-press(0.97);
}

.dock__icon {
  width: 36rpx;
  height: 36rpx;
}

/* 实心按钮上的文字必须反色：pill 的蓝底够深，沿用深色文字会糊在底色里 */
.dock__text {
  color: #ffffff;
  @include fish-type(callout);

  font-weight: 600;
}

/*
 * 距离。
 *
 * 弱化一档（透明度 0.72 + 字重降到 500）—— 它是补充信息，
 * 不该跟「导航送达」四个字抢同一行的注意力。
 */
.dock__dist {
  color: #ffffff;
  @include fish-type(callout);

  opacity: 0.72;
  font-weight: 500;
}
</style>
