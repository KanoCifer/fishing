<template>
  <view class="feedback-banner">
    <view class="feedback-banner__text">
      <text class="feedback-banner__title">钓完了？告诉我们今天实际如何</text>
      <text class="feedback-banner__subtitle">三个问题，三十秒 —— 您的反馈会帮系统下次更准</text>
    </view>
    <view
      class="feedback-banner__btn"
      :class="{ 'feedback-banner__btn--disabled': disabled }"
      @tap="onTap"
    >
      <text class="feedback-banner__btn-text">反馈今日指数</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 快速反馈横幅 —— 对应源项目 QuickFeedbackBanner。
 *
 * 源版本用 framer-motion 做入场动画，这里换 CSS keyframe：
 * 一次性的淡入位移不值得引动画库，小程序端也没有对应的运行时。
 */
const props = withDefaults(
  defineProps<{
    /** 无钓鱼指数数据时禁用 */
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'submit'): void
}>()

function onTap() {
  if (props.disabled) return
  emit('submit')
}
</script>

<style lang="scss" scoped>
.feedback-banner {
  display: flex;
  align-items: center;
  /* 上下 48rpx 是原先 DashboardSheet 里相邻卡片的间距，数据页的卡片节奏是 24rpx */
  margin: 24rpx 8rpx;
  padding: 28rpx 32rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-page;
  animation: banner-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.feedback-banner__text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.feedback-banner__title {
  color: $fish-ink;
  font-size: 30rpx;
}

.feedback-banner__subtitle {
  margin-top: 4rpx;
  color: $fish-muted;
  font-size: 24rpx;
}

.feedback-banner__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80rpx;
  margin-left: 24rpx;
  flex-shrink: 0;
  padding: 0 32rpx;
  border-radius: 999rpx;
  background-color: $fish-accent;
}

.feedback-banner__btn--disabled {
  background-color: $fish-surface;
}

.feedback-banner__btn-text {
  color: $fish-ink;
  font-size: 26rpx;
  font-weight: 500;
}

@keyframes banner-in {
  from {
    opacity: 0;
    transform: translateY(-12rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
