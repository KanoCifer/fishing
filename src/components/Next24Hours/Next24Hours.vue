<template>
  <view class="next24">
    <view class="next24__head">
      <view class="next24__head-left">
        <image class="next24__title-icon" :src="clockIcon" mode="aspectFit" />
        <text class="next24__title">未来 24 小时</text>
      </view>

      <view class="next24__segment">
        <view class="next24__item" :class="{ 'next24__item--active': mode === 'hours' }" @tap="mode = 'hours'">
          <text class="next24__item-text" :class="{ 'next24__item-text--active': mode === 'hours' }">逐时</text>
        </view>
        <view class="next24__item" :class="{ 'next24__item--active': mode === 'chart' }" @tap="mode = 'chart'">
          <text class="next24__item-text" :class="{ 'next24__item-text--active': mode === 'chart' }">曲线</text>
        </view>
      </view>
    </view>

    <view v-if="mode === 'hours'" class="next24__pane">
      <HourlyWeather />
    </view>
    <view v-else class="next24__pane">
      <MetricChart />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { icon } from '@/constants/icons';

import HourlyWeather from '../HourlyWeather/HourlyWeather.vue';
import MetricChart from '../MetricChart/MetricChart.vue';

/** 卡片的两态：逐时格子 / 指标曲线 */
type Mode = 'hours' | 'chart';

const mode = ref<Mode>('hours');

const clockIcon = icon('clock', 'ink');
</script>

<style lang="scss" scoped>
.next24 {
  @include fish-card;
}

.next24__head {
  @include fish-card-head;
  align-items: center;
}

.next24__head-left {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

/* 图标跟标题文字同色（ink），底边贴着文字基线 */
.next24__title-icon {
  width: 32rpx;
  height: 32rpx;
}

.next24__title {
  @include fish-card-title;
}

/*
 * 分段控件。
 *
 * 与 MetricChart 里那组同一套语言（填充轨道 + 白底选中块），
 * 只是小一号 —— 它在标题行里，不能跟内容抢那一行的视线。
 */
.next24__segment {
  display: flex;
  flex-shrink: 0;
  padding: 3rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-fill;
}

.next24__pane {
  @include fish-cross-in;
}

.next24__item {
  padding: 6rpx 22rpx;
  border-radius: $fish-radius-pill;
  text-align: center;
  @include fish-press-dim;
}

.next24__item--active {
  background-color: $fish-page;
  /* 选中块压出轨道用的那层投影。0.08 就够，再重就变成灰色描边了 */
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}

.next24__item-text {
  color: $fish-muted;
  @include fish-type(caption);
  @include numeric;
}

.next24__item-text--active {
  color: $fish-ink;
  font-weight: 600;
}
</style>
