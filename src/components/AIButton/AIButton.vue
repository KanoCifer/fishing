<template>
  <view class="verdict__btn" @tap="emit('analysis')">
    <image class="verdict__icon verdict__icon--accent" :src="sparklesIcon" mode="widthFix" />
    <text class="verdict__btn-text">AI 分析</text>
  </view>
</template>

<script setup lang="ts">
import { icon } from '@/constants/icons';

const sparklesIcon = icon('sparkles', 'blue600');
const emit = defineEmits<{
  analysis: [];
}>();
</script>

<style lang="scss" scoped>
.verdict__icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

.verdict__icon--accent {
  margin-right: 10rpx;
}

.verdict__btn-text {
  color: $fish-ink;
  @include fish-type(callout);
}

.verdict__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 20rpx 0 25rpx;
  border-radius: $fish-radius-pill;

  /*
   * 流光：白面 + 转动的彩虹描边 + 外发光。
   *
   * 这里不能给按钮自己加 z-index：加了它就成了层叠上下文，父元素自己的背景永远
   * 画在最底层，而 ::before 的 z-index: -1 会被困在这个上下文里、反而叠到按钮
   * 背景之上，光晕就把白面糊掉了。压在环境色底之上靠页面内容层（z-index: 1）就够。
   */
  @include fish-flow;
}
</style>
