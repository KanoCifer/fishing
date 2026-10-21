<template>
  <view class="skeleton-card">
    <!-- header -->
    <view class="skeleton-card__header">
      <view class="skeleton-card__header-text">
        <view class="skeleton-card__bar skeleton-card__bar--title" />
        <view class="skeleton-card__bar skeleton-card__bar--sub" />
      </view>
      <view class="skeleton-card__circle" />
    </view>

    <!-- 主数值 -->
    <view class="skeleton-card__block skeleton-card__block--hero" />

    <!-- 三列分组 -->
    <view class="skeleton-card__group">
      <view v-for="i in 3" :key="i" class="skeleton-card__cell">
        <view class="skeleton-card__bar skeleton-card__bar--xs" />
        <view class="skeleton-card__bar skeleton-card__bar--sm" />
      </view>
    </view>

    <!-- 可选图表占位 -->
    <view v-if="hasChart" class="skeleton-card__block skeleton-card__block--chart" />

    <!-- 可选底部双列 -->
    <view v-if="hasBottomRow" class="skeleton-card__group">
      <view v-for="i in 2" :key="i" class="skeleton-card__cell skeleton-card__cell--left">
        <view class="skeleton-card__bar skeleton-card__bar--xs" />
        <view class="skeleton-card__bar skeleton-card__bar--md" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 加载骨架 —— 对应源项目 SkeletonCard。
 *
 * 脉冲用 opacity 0.4↔0.7 的 1.8s 循环，比默认的 animate-pulse 更轻，
 * 避免加载态在弱网下闪得刺眼。
 *
 * 尺寸全部手写 rpx：manifest 的 transformPx: false 关掉了 px→rpx 自动换算，
 * 这里写 px 不会被转换，在不同机型上会差出一截。
 */
withDefaults(
  defineProps<{
    /** 是否含图表占位 */
    hasChart?: boolean;
    /** 是否含底部双列占位 */
    hasBottomRow?: boolean;
  }>(),
  {
    hasChart: false,
    hasBottomRow: false,
  },
);
</script>

<style lang="scss" scoped>
.skeleton-card {
  display: flex;
  flex-direction: column;
}

.skeleton-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 30rpx;
}

.skeleton-card__header-text {
  display: flex;
  flex-direction: column;
}

.skeleton-card__circle {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: $fish-surface;
}

.skeleton-card__bar,
.skeleton-card__block,
.skeleton-card__circle {
  animation: skeleton-pulse 1.8s ease-in-out infinite;
}

.skeleton-card__bar {
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
}

.skeleton-card__bar--title {
  width: 96rpx;
  height: 14rpx;
  margin-bottom: 12rpx;
}

.skeleton-card__bar--sub {
  width: 128rpx;
  height: 10rpx;
}

.skeleton-card__bar--xs {
  width: 32rpx;
  height: 10rpx;
  margin-bottom: 12rpx;
}

.skeleton-card__bar--sm {
  width: 40rpx;
  height: 12rpx;
}

.skeleton-card__bar--md {
  width: 56rpx;
  height: 14rpx;
}

.skeleton-card__block {
  border-radius: $fish-radius-xl;
  background-color: $fish-surface;
  animation: skeleton-pulse 1.8s ease-in-out infinite;
}

.skeleton-card__block--hero {
  width: 160rpx;
  height: 80rpx;
  margin-bottom: 30rpx;
}

.skeleton-card__block--chart {
  width: 100%;
  height: 192rpx;
  margin-top: 30rpx;
}

/*
 * 分组容器。
 *
 * 底色是分隔线色而不是「卡片色」——它在这套结构里的角色是**露出的一条缝**：
 * 卡片从缝里浮起来，分组才能读成一个整体。真实内容里同一条缝由
 * $fish-border 的 1rpx 发丝线承担（见 WeatherCard / SpotDetailInfo）。
 */
.skeleton-card__group {
  display: flex;
  margin-bottom: 30rpx;
  overflow: hidden;
  border-radius: $fish-radius-xl;
  background-color: $fish-border-40;
}

.skeleton-card__cell {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 16rpx;
  background-color: $fish-page;
}

.skeleton-card__cell--left {
  align-items: flex-start;
  padding: 20rpx 24rpx;
}

.skeleton-card__cell--left:last-child {
  margin-bottom: 0;
}

/*
 * 呼吸幅度收到 0.35。
 *
 * 骨架屏是一次性出现的加载占位，用户盯着它的时间不确定长；幅度越小、越平缓，
 * 弱网下反复闪烁时的疲劳感越低。1 → 0.35 是既能看出「在动」又不会晃眼的档。
 */
@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
