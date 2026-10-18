<template>
  <view class="weather-card">
    <view class="weather-card__header">
      <text class="weather-card__title">天气详情</text>
      <!--
        源版本这里是个跳转和风天气官网的链接（window.open）。
        小程序没有 window.open，外链只能走 web-view 组件，
        为一个版权署名开一整页 web-view 不值得，这里直接去掉。
      -->
    </view>

    <SkeletonCard v-if="state.weatherLoading" has-bottom-row />

    <text v-else-if="state.weatherError" class="weather-card__error">
      {{ state.weatherError }}
    </text>

    <view v-else-if="state.liveWeather" class="weather-card__body">
      <view class="weather-card__group">
        <view class="weather-card__row">
          <text class="weather-card__row-label">体感</text>
          <text class="weather-card__row-value">{{ state.liveWeather.feelsLike }}°C</text>
        </view>
        <view class="weather-card__row">
          <text class="weather-card__row-label">能见度</text>
          <text class="weather-card__row-value">{{ state.liveWeather.vis }} km</text>
        </view>
        <view class="weather-card__row">
          <text class="weather-card__row-label">{{ state.liveWeather.windDir }}</text>
          <text class="weather-card__row-value">{{ windSpeedText }}</text>
        </view>
        <view class="weather-card__row">
          <text class="weather-card__row-label">湿度</text>
          <text class="weather-card__row-value">{{ state.liveWeather.humidity }}%</text>
        </view>
        <view class="weather-card__row">
          <text class="weather-card__row-label">气压</text>
          <text class="weather-card__row-value">{{ state.liveWeather.pressure }} hPa</text>
        </view>
        <view class="weather-card__row">
          <view class="weather-card__pressure">
            <view class="weather-card__pressure-dot" :class="`weather-card__pressure-dot--${pressureTone}`" />
            <text class="weather-card__row-label">气压状态</text>
          </view>
          <text class="weather-card__row-value weather-card__row-value--{{ pressureTone }}">
            {{ pressureLabel }}
          </text>
        </view>
      </view>

      <!-- 三日预报 -->
      <view v-if="forecasts.length" class="weather-card__forecast">
        <view
          v-for="(day, i) in forecasts"
          :key="day.fxDate"
          class="weather-card__forecast-cell"
          :class="{ 'weather-card__forecast-cell--divided': i > 0 }"
        >
          <text class="weather-card__forecast-date">
            {{ i === 0 ? '今天' : shortDate(day.fxDate) }}
          </text>
          <text :class="['weather-card__forecast-icon', weatherIconClass(day.iconDay)]" />
          <text class="weather-card__forecast-temp">{{ day.tempMax }}° / {{ day.tempMin }}°</text>
        </view>
      </view>
    </view>

    <text v-else class="weather-card__empty">暂无天气数据</text>
  </view>
</template>

<script setup lang="ts">
/**
 * WeatherCard —— 对应源项目 WeatherCard。
 *
 * 与源版本的差异：
 * - 去掉 lucide 图标（气象计/眼睛/指南针等）。小程序不能内联 SVG，
 *   为 5 个装饰性图标各引一张 PNG 不划算，行列本身已有文字标签，
 *   图标只是冗余。唯一保留的是气压状态点 —— 它承载的是颜色语义。
 * - 去掉跳转和风天气的外链。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/composables/useFishingMapStore';
import { shortDate } from '@/utils/date';
import { num, pressureLevel, weatherIconClass } from '@/utils/weather';

import SkeletonCard from '../SkeletonCard/SkeletonCard.vue';

const { state } = useFishingMapStore();

const forecasts = computed(() => state.forecasts.slice(0, 3));
/**
 * 和风给的风速是 km/h，钓鱼看的是 m/s。转不动时留空串，
 * 免得模板渲染成 "NaN m/s"。
 */
const windSpeedText = computed(() => {
  const kmh = num(state.liveWeather?.windSpeed);
  if (kmh === null) return '';
  return `${(kmh / 3.6).toFixed(1)} m/s`;
});

const pressure = computed(() => {
  const hpa = num(state.liveWeather?.pressure);
  if (hpa === null) return null;
  return pressureLevel(hpa);
});

const pressureLabel = computed(() => pressure.value?.label ?? '--');
const pressureTone = computed(() => pressure.value?.tone ?? 'muted');
</script>

<style lang="scss" scoped>
.weather-card {
  /* 底部留白原本是 DashboardSheet 里相邻卡片的间距；现在本组件只出现在数据页的
     卡片内部，卡片自己给了内边距，这里收窄，避免卡片底部多出一块空白 */
  padding: 8rpx 8rpx 16rpx;
}

.weather-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.weather-card__title {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.weather-card__body {
  display: flex;
  flex-direction: column;
}

.weather-card__group {
  border-radius: $fish-radius-xl;
  overflow: hidden;
  background-color: $fish-page;
}

.weather-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 32rpx;
  border-bottom: 2rpx solid $fish-border-40;
}

.weather-card__row:last-child {
  border-bottom: none;
}

.weather-card__pressure {
  display: flex;
  align-items: center;
}

.weather-card__pressure-dot {
  width: 16rpx;
  height: 16rpx;
  margin-right: 20rpx;
  border-radius: 50%;
}

.weather-card__pressure-dot--success {
  background-color: $fish-success;
}

.weather-card__pressure-dot--warning {
  background-color: $fish-warning;
}

.weather-card__pressure-dot--destructive {
  background-color: $fish-destructive;
}

.weather-card__pressure-dot--muted {
  background-color: $fish-surface;
}

.weather-card__row-label {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.weather-card__row-value {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.weather-card__row-value--success {
  color: $fish-success;
}

.weather-card__row-value--warning {
  color: $fish-warning;
}

.weather-card__row-value--destructive {
  color: $fish-destructive;
}

.weather-card__row-value--muted {
  color: $fish-muted;
}

/* 三日预报：扁平横排，不加卡片边框 */
.weather-card__forecast {
  display: flex;
  margin-top: 32rpx;
}

.weather-card__forecast-cell {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 0;
}

.weather-card__forecast-cell--divided {
  border-left: 2rpx solid $fish-border-40;
}

.weather-card__forecast-date {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.weather-card__forecast-icon {
  margin: 12rpx 0;
  font-size: 44rpx;
  line-height: 1;
  /* 单色字形吃 color（emoji 不吃），压成辅助灰让同格的高低温保持主次 */
  color: $fish-muted;
}

.weather-card__forecast-temp {
  color: $fish-ink;
  font-size: 24rpx;
  font-weight: 600;
}

.weather-card__error {
  color: $fish-destructive;
  font-size: 28rpx;
}

.weather-card__empty {
  color: $fish-muted;
  font-size: 28rpx;
}
</style>
