<template>
  <view class="hourly">
    <view class="hourly__header">
      <text class="hourly__title">逐时预报</text>
      <text class="hourly__meta">未来 24 小时</text>
    </view>

    <scroll-view class="hourly__scroll" scroll-x :show-scrollbar="false">
      <view v-if="hours.length" class="hourly__track">
        <view
          v-for="(hour, i) in hours"
          :key="hour.fxTime"
          class="hourly__cell"
          :class="{ 'hourly__cell--now': i === 0 }"
        >
          <text class="hourly__time">
            {{ i === 0 ? '现在' : (parseFxTime(hour.fxTime)?.time ?? '') }}
          </text>
          <text :class="['hourly__icon', weatherIconClass(hour.icon)]" />
          <text class="hourly__temp">{{ hour.temp }}°</text>
        </view>
      </view>

      <!-- 空态骨架 -->
      <view v-else class="hourly__track">
        <view v-for="i in 8" :key="i" class="hourly__cell">
          <view class="hourly__skeleton hourly__skeleton--time" />
          <view class="hourly__skeleton hourly__skeleton--icon" />
          <view class="hourly__skeleton hourly__skeleton--temp" />
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
/**
 * 逐时预报 —— iOS Weather 招牌的横向滚动条，对应源项目 HourlyWeather。
 *
 * 小程序端必须用 `<scroll-view>` 而不是 CSS overflow-x：
 * 横向滚动的惯性、边界回弹都是原生组件给的，用 view + overflow 模拟不出来。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/composables/useFishingMapStore';
import { parseFxTime } from '@/utils/date';
import { weatherIconClass } from '@/utils/weather';

const { state } = useFishingMapStore();

const hours = computed(() => state.weatherHourly.slice(0, 24));
</script>

<style lang="scss" scoped>
.hourly {
  /* 底部留白原本是 DashboardSheet 里相邻卡片的间距；现在本组件只出现在数据页的
     卡片内部，卡片自己给了内边距，这里收窄，避免卡片底部多出一块空白 */
  padding: 8rpx 8rpx 16rpx;
}

.hourly__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.hourly__title {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.hourly__meta {
  color: $fish-muted;
  font-size: 24rpx;
}

.hourly__scroll {
  width: 100%;
  white-space: nowrap;
}

.hourly__track {
  display: flex;
  padding: 0 4rpx;
}

.hourly__cell {
  display: flex;
  width: 108rpx;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 0;
}

.hourly__time {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.hourly__cell--now .hourly__time {
  color: $fish-ink;
}

.hourly__icon {
  margin: 12rpx 0;
  font-size: 40rpx;
  line-height: 1;
  /* 单色字形吃 color（emoji 不吃），压成辅助灰让同格的温度数值保持主次 */
  color: $fish-muted;
}

.hourly__temp {
  color: $fish-ink;
  font-size: 26rpx;
  font-weight: 600;
}

.hourly__skeleton {
  border-radius: 8rpx;
  background-color: $fish-surface;
  animation: hourly-pulse 1.8s ease-in-out infinite;
}

.hourly__skeleton--time {
  width: 64rpx;
  height: 12rpx;
}

.hourly__skeleton--icon {
  width: 40rpx;
  height: 40rpx;
  margin: 12rpx 0;
  border-radius: 50%;
}

.hourly__skeleton--temp {
  width: 48rpx;
  height: 14rpx;
}

@keyframes hourly-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
