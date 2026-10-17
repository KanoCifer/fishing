<template>
  <view class="index-card">
    <view class="index-card__header">
      <view class="index-card__header-text">
        <text class="index-card__title">钓鱼指数</text>
        <text class="index-card__subtitle">基于实时天气、潮汐综合计算</text>
      </view>
      <view
        class="index-card__refresh"
        :class="{ 'index-card__refresh--busy': state.indexLoading }"
        @tap="onRefresh"
      >
        <text class="index-card__refresh-icon">↻</text>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="state.indexLoading && !state.indexData" class="index-card__body">
      <SkeletonCard />
    </view>

    <!-- 错误 -->
    <view v-else-if="state.indexError && !state.indexData" class="index-card__body">
      <text class="index-card__error">{{ state.indexError }}</text>
    </view>

    <!-- 有数据 -->
    <view v-else-if="state.indexData" class="index-card__body">
      <!-- 主数值 -->
      <view class="index-card__hero">
        <text class="index-card__score" :class="`index-card__score--${tone}`">
          {{ state.indexData.fishing_index }}
        </text>
        <text class="index-card__level" :class="`index-card__level--${tone}`">
          {{ state.indexData.level }}
        </text>
      </view>

      <!-- inset-grouped 数据行 -->
      <view class="index-card__group">
        <view class="index-card__row">
          <text class="index-card__row-label">默认权重</text>
          <text class="index-card__row-value">{{ state.indexData.expert_score }}</text>
        </view>
        <view class="index-card__row">
          <text class="index-card__row-label">权重调整</text>
          <text class="index-card__row-value">
            {{ residualText }}
          </text>
        </view>
        <view class="index-card__row">
          <text class="index-card__row-label">综合指数</text>
          <text class="index-card__row-value index-card__row-value--emphasis">
            {{ state.indexData.fishing_index }}
          </text>
        </view>
      </view>

      <!-- 操作行 -->
      <view class="index-card__actions">
        <view class="index-card__btn index-card__btn--primary" @tap="onFeedback">
          <text class="index-card__btn-text">反馈今日指数</text>
        </view>
        <view
          v-if="hasBreakdown"
          class="index-card__btn index-card__btn--ghost"
          @tap="onDetail"
        >
          <text class="index-card__btn-text">详情</text>
        </view>
      </view>
    </view>

    <text v-else class="index-card__empty">暂无数据</text>
  </view>
</template>

<script setup lang="ts">
/**
 * FishingIndexCard —— 对应源项目同名组件。
 *
 * 刷新按钮复用 store 的 fetchWeatherAndFishing：钓鱼指数和天气潮汐来自同一个
 * enriched 接口，两者同生共死，分开刷新只会多打一次后端。
 */
import { computed } from 'vue'

import { MAP_CENTER, useFishingMapStore } from '@/composables/useFishingMapStore'
import { levelTone } from '@/utils/weather'

import SkeletonCard from '../SkeletonCard/SkeletonCard.vue'

const emit = defineEmits<{
  (e: 'feedback'): void
  (e: 'detail'): void
}>()

const { state, fetchWeatherAndFishing } = useFishingMapStore()

const tone = computed(() => levelTone(state.indexData?.level))

/** 后端可能给负残差，负号自带，正数补 + 号，两者视觉上才是一个量级的对齐 */
const residualText = computed(() => {
  const residual = state.indexData?.residual ?? 0
  return `${residual > 0 ? '+' : ''}${residual}`
})

const hasBreakdown = computed(
  () => Object.keys(state.indexData?.feature_breakdown ?? {}).length > 0,
)

function onRefresh() {
  if (state.indexLoading) return
  void fetchWeatherAndFishing(MAP_CENTER)
}

function onFeedback() {
  emit('feedback')
}

function onDetail() {
  emit('detail')
}
</script>

<style lang="scss" scoped>
.index-card {
  padding: 16rpx 8rpx 48rpx;
}

.index-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.index-card__header-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.index-card__title {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.index-card__subtitle {
  margin-top: 4rpx;
  color: $fish-muted;
  font-size: 24rpx;
}

.index-card__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  flex-shrink: 0;
  border-radius: 50%;
}

/* 加载中转圈。用 CSS 旋转而不是图标帧图，少一张静态图 */
.index-card__refresh--busy .index-card__refresh-icon {
  animation: refresh-spin 1s linear infinite;
}

.index-card__refresh-icon {
  color: $fish-muted;
  font-size: 36rpx;
  line-height: 1;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.index-card__body {
  min-height: 400rpx;
}

.index-card__hero {
  display: flex;
  align-items: baseline;
  margin-bottom: 40rpx;
  padding: 0 8rpx;
}

.index-card__score {
  font-size: 112rpx;
  line-height: 1;
  font-weight: 300;
  letter-spacing: -2rpx;
}

.index-card__score--success {
  color: $fish-success;
}

.index-card__score--ink {
  color: $fish-ink;
}

.index-card__score--warning {
  color: $fish-warning;
}

.index-card__score--destructive {
  color: $fish-destructive;
}

.index-card__score--muted {
  color: $fish-muted;
}

.index-card__level {
  margin-left: 24rpx;
  font-size: 32rpx;
  font-weight: 500;
}

.index-card__level--success {
  color: $fish-success;
}

.index-card__level--ink {
  color: $fish-ink;
}

.index-card__level--warning {
  color: $fish-warning;
}

.index-card__level--destructive {
  color: $fish-destructive;
}

.index-card__level--muted {
  color: $fish-muted;
}

.index-card__group {
  border-radius: $fish-radius-xl;
  overflow: hidden;
  background-color: $fish-page;
}

.index-card__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 20rpx 32rpx;
  border-bottom: 2rpx solid $fish-border-40;
}

.index-card__row:last-child {
  border-bottom: none;
}

.index-card__row-label {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.index-card__row-value {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.index-card__row-value--emphasis {
  font-size: 32rpx;
}

.index-card__actions {
  display: flex;
  margin-top: 40rpx;
  padding: 0 4rpx;
}

.index-card__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
}

.index-card__btn--primary {
  flex: 1;
  background-color: $fish-accent;
}

.index-card__btn--ghost {
  margin-left: 16rpx;
  background-color: $fish-surface;
}

.index-card__btn-text {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 500;
}

.index-card__error,
.index-card__empty {
  color: $fish-destructive;
  font-size: 28rpx;
}

.index-card__empty {
  color: $fish-muted;
}
</style>
