<template>
  <view class="verdict-actions">
    <view class="verdict-actions__row" :style="enterStyle(1, showAnim)">
      <view class="verdict-actions__btn verdict-actions__btn--primary" @tap="emit('feedback')">
        <image class="verdict-actions__icon verdict-actions__icon--onaccent" :src="messageIcon" mode="widthFix" />
        <text class="verdict-actions__btn-text verdict-actions__btn-text--onaccent">反馈今日鱼口</text>
      </view>

      <view class="verdict-actions__btn verdict-actions__btn--tint" @tap="emit('analysis')">
        <image class="verdict-actions__icon verdict-actions__icon--accent" :src="sparklesIcon" mode="widthFix" />
        <text class="verdict-actions__btn-text verdict-actions__btn-text--blue">渔碌建议</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import { enterStyle } from '@/utils/motion';

const props = withDefaults(defineProps<{ showAnim?: boolean }>(), { showAnim: true });

const emit = defineEmits<{
  /** 去反馈今日鱼口 */
  feedback: [];
  /** 打开渔碌建议 */
  analysis: [];
}>();

const messageIcon = icon('message-square', 'onAccent');
const sparklesIcon = icon('sparkles', 'blue600');
</script>

<style lang="scss" scoped>
.verdict-actions {
  display: flex;
  flex-direction: column;
}

/* ── 动作 ──────────────────────────────────────────────────────────────── */

.verdict-actions__row {
  display: flex;
  align-items: center;
  @include fish-enter;
}

/*
 * 两个动作同一档：都是药丸、同样宽、同样 88rpx 高。
 *
 * 88rpx = 44pt，正好是 Apple 判定为「可放心点按」的最小命中尺寸。
 * 反馈在手指落下的那一帧就给出（fish-press），抬手回弹用满 260ms ——
 * 两段时长一短一长，是 iOS 按压手感的关键，缺一段立刻变塑料。
 */
.verdict-actions__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 20rpx;
  border-radius: $fish-radius-pill;
  @include fish-press(0.97);
}

/* 主动作：品牌蓝实心 */
.verdict-actions__btn--primary {
  background-image: $fish-gradient;
  box-shadow: $smooth-shadow-sm;
}

/*
 * 次动作：品牌蓝的淡底 + 深字。
 *
 * 淡底而不是描边：这一屏已经有一枚实心按钮了，
 * 再加一圈描边会多出一个视觉层级，而这一屏不该有三个层级。
 */
.verdict-actions__btn--tint {
  background-color: $fish-accent-tint;
}

/* 两枚药丸之间用 margin 而不是 gap —— WXSS 不保证支持 flex gap */
.verdict-actions__btn + .verdict-actions__btn {
  margin-left: 16rpx;
}

.verdict-actions__icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

.verdict-actions__icon--accent {
  width: 28rpx;
  height: 28rpx;
  margin-right: 8rpx;
}

.verdict-actions__icon--onaccent {
  margin-right: 10rpx;
}

.verdict-actions__btn-text {
  @include fish-type(body, 600);
}

.verdict-actions__btn-text--onaccent {
  color: $fish-on-accent;
}

.verdict-actions__btn-text--blue {
  color: $fish-blue-600;
}
</style>
