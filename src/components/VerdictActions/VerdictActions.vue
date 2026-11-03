<template>
  <view class="verdict-actions">
    <view class="verdict-actions__row" :style="enterStyle(1, showAnim)">
      <view class="verdict-actions__btn" @tap="emit('feedback')">
        <image class="verdict-actions__icon" :src="messageIcon" mode="widthFix" />
        <text class="verdict-actions__btn-text">反馈今日鱼口</text>
        <image class="verdict-actions__chevron" :src="chevronIcon" mode="widthFix" />
      </view>

      <view class="verdict-actions__btn" @tap="emit('analysis')">
        <image class="verdict-actions__icon" :src="sparklesIcon" mode="widthFix" />
        <text class="verdict-actions__btn-text">渔碌建议</text>
        <image class="verdict-actions__chevron" :src="chevronIcon" mode="widthFix" />
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

const messageIcon = icon('message-square', 'blue');
const sparklesIcon = icon('sparkles', 'blue600');
const chevronIcon = icon('chevron-right', 'muted60');
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

.verdict-actions__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 24rpx;
  @include fish-glass($fish-radius-pill);
  @include fish-glass-blur;

  /* 描边：一圈白色发丝，是玻璃的轮廓线，没有它半透明底会糊进背景 */
  border: 1rpx solid rgba(255, 255, 255, 0.92);

  box-shadow:
    0 10rpx 30rpx rgba(12, 40, 90, 0.1),
    inset 0 1rpx 0 rgba(255, 255, 255, 1),
    inset 0 -1rpx 0 rgba(255, 255, 255, 0.35);

  @include fish-press(0.97);
}

/* 两枚药丸之间用 margin 而不是 gap —— WXSS 不保证支持 flex gap */
.verdict-actions__btn + .verdict-actions__btn {
  margin-left: 16rpx;
}

.verdict-actions__icon {
  width: 34rpx;
  height: 34rpx;
  margin-right: 12rpx;
  flex-shrink: 0;
}

/* 箭头：说的是「点进去还有一层」，所以它不跟图标挤在一起，钉在最右 */
.verdict-actions__chevron {
  width: 26rpx;
  height: 26rpx;
  margin-left: 12rpx;
  flex-shrink: 0;
}

/* 药丸底是浅的，字一律深墨 —— 白字压在白玻璃上读不出来 */
.verdict-actions__btn-text {
  color: $fish-ink;
  @include fish-type(body, 600);
}
</style>
