<template>
  <view class="weather-hero">
    <!-- 地点 -->
    <view class="weather-hero__place">
      <image
        class="weather-hero__pin"
        src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1hcC1waW5uZWQgcHJldmlldy1pY29uIj48cGF0aCBkPSJNMTggOGMwIDMuNjEzLTMuODY5IDcuNDI5LTUuMzkzIDguNzk1YTEgMSAwIDAxLTEuMjE0IDBDOS44NyAxNS40MjkgNiAxMS42MTMgNiA4YTYgNiAwIDAxMTIgMCIvPjxwYXRoIGQ9Ik00LjQ3NCAxNWgtLjE5N2ExIDEgMCAwMC0uOTY5Ljc1M2wtMS4wOTcgNC4zNWExLjUgMS41IDAgMDAxLjQ0NCAxLjg5OEwyMC4zNDQgMjJhMS41IDEuNSAwIDAwMS40NDYtMS44OTdsLTEuMDk4LTQuMzVhMSAxIDAgMDAtLjk2OS0uNzUzaC0uMTk3Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSI4IiByPSIyIi8+PC9zdmc+"
      />
      <text class="weather-hero__place-name">
        {{ state.locationName || "钓鱼地点" }}
      </text>
    </view>

    <!-- 主体 -->
    <view v-if="state.weatherLoading && !state.liveWeather" class="weather-hero__skeleton">
      <view class="weather-hero__skeleton-row">
        <view class="weather-hero__skeleton-block weather-hero__skeleton-block--temp" />
        <view class="weather-hero__skeleton-block weather-hero__skeleton-block--icon" />
      </view>
      <view class="weather-hero__skeleton-line" />
    </view>

    <view v-else-if="state.liveWeather" class="weather-hero__main">
      <view class="weather-hero__temp-block">
        <view class="weather-hero__temp-row">
          <text class="weather-hero__temp">{{ state.liveWeather.temp }}</text>
          <text class="weather-hero__degree">°</text>
        </view>
        <view class="weather-hero__condition">
          <text class="weather-hero__condition-text">{{ state.liveWeather.text }}</text>
          <text class="weather-hero__feels">· 体感 {{ state.liveWeather.feelsLike }}°</text>
        </view>
      </view>

      <text :class="['weather-hero__icon', iconClass]" />
    </view>

    <text v-else class="weather-hero__empty">暂无天气数据</text>

    <!-- 今日高低温 -->
    <view v-if="today && state.liveWeather" class="weather-hero__range">
      <text class="weather-hero__range-text">最高 {{ today.tempMax }}°</text>
      <text class="weather-hero__range-sep">·</text>
      <text class="weather-hero__range-text">最低 {{ today.tempMin }}°</text>
    </view>

    <!-- 单一 hairline，不用整块分隔条 -->
    <view class="weather-hero__hairline" />

    <!-- 结论：一行把"天气"桥到"值不值得出钓" -->
    <view class="weather-hero__verdict">
      <image
        class="weather-hero__fish"
        src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWZpc2hpbmctaG9vayBwcmV2aWV3LWljb24iPjxwYXRoIGQ9Im0xNy41ODYgMTEuNDE0LTUuOTMgNS45M2ExIDEgMCAwIDEtOC04bDMuMTM3LTMuMTM3YS43MDcuNzA3IDAgMCAxIDEuMjA3LjVWMTAiLz48cGF0aCBkPSJNMjAuNDE0IDguNTg2IDIyIDciLz48Y2lyY2xlIGN4PSIxOSIgY3k9IjEwIiByPSIyIi8+PC9zdmc+"
      />
      <view v-if="state.indexData" class="weather-hero__verdict-text">
        <text class="weather-hero__verdict-title" :class="`weather-hero__verdict-title--${tone}`">
          {{ verdict }}
        </text>
        <text class="weather-hero__verdict-meta">
          钓鱼指数 {{ state.indexData.level }}
          <text class="weather-hero__verdict-num">{{ state.indexData.fishing_index }}</text>
        </text>
      </view>
      <text v-else class="weather-hero__verdict-pending">钓鱼指数计算中…</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * WeatherHero —— 天气主导区，对应源项目 WeatherHero。
 *
 * 与源版本的差异：顶部的「AI 分析」按钮本期不做。
 * AI 分析链路（AnalysisContext / 流式）已确认不在本期范围，
 * 按钮留着会是个点了没反应的死控件，不如先摘掉。
 * 等步骤 5 把流式方案定下来再加回，那时它才有意义。
 */
import { computed } from "vue";

import { useFishingMapStore } from "@/composables/useFishingMapStore";
import { levelTone, levelVerdict, weatherIconClass } from "@/utils/weather";

const { state } = useFishingMapStore();

const today = computed(() => state.forecasts[0] ?? null);
/** 图标 class 由 `icon` 字段决定，非法码在 utils 里已兜底成 999 */
const iconClass = computed(() => weatherIconClass(state.liveWeather?.icon));
const tone = computed(() => levelTone(state.indexData?.level));
const verdict = computed(() => levelVerdict(state.indexData?.level));
</script>

<style lang="scss" scoped>
.weather-hero {
  padding: 16rpx 8rpx 48rpx;
}

.weather-hero__place {
  display: flex;
  align-items: center;
}

.weather-hero__pin {
  margin-right: 12rpx;
  width: 24px;
  height: 24px;
  font-size: 26rpx;
}

.weather-hero__place-name {
  max-width: 380rpx;
  overflow: hidden;
  color: $fish-muted;
  font-size: 28rpx;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.weather-hero__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-top: 24rpx;
}

.weather-hero__temp-block {
  min-width: 0;
}

.weather-hero__temp-row {
  display: flex;
  align-items: flex-start;
}

/* 主包 transformPx: false，写 px 不会被换算，这里一律手写 rpx */
.weather-hero__temp {
  color: $fish-ink;
  font-size: 128rpx;
  line-height: 0.85;
  font-weight: 300;
  letter-spacing: -2rpx;
}

.weather-hero__degree {
  margin-top: 8rpx;
  margin-left: 4rpx;
  color: $fish-ink-60;
  font-size: 60rpx;
  font-weight: 300;
}

.weather-hero__condition {
  display: flex;
  align-items: baseline;
  margin-top: 16rpx;
}

.weather-hero__condition-text {
  color: $fish-muted;
  font-size: 28rpx;
}

.weather-hero__feels {
  margin-left: 12rpx;
  color: $fish-muted-60;
  font-size: 28rpx;
}

.weather-hero__icon {
  margin-top: -8rpx;
  font-size: 100rpx;
  line-height: 1;
  /* 和风字形是单色的，会继承 color；这里显式压成辅助灰，
     免得 100rpx 的大图标跟左侧温度数字抢焦点。emoji 时代不需要这条 ——
     emoji 自带彩色，不吃 color。 */
  color: $fish-muted;
}

.weather-hero__range {
  display: flex;
  align-items: baseline;
  margin-top: 24rpx;
}

.weather-hero__range-text {
  color: $fish-muted;
  font-size: 28rpx;
}

.weather-hero__range-sep {
  margin: 0 12rpx;
  color: $fish-muted-60;
  font-size: 28rpx;
}

.weather-hero__empty {
  display: block;
  margin-top: 32rpx;
  color: $fish-muted;
  font-size: 28rpx;
}

.weather-hero__hairline {
  height: 2rpx;
  margin-top: 40rpx;
  background-color: $fish-border-40;
}

.weather-hero__verdict {
  display: flex;
  align-items: center;
  margin-top: 32rpx;
}

.weather-hero__fish {
  margin-right: 16rpx;
  width: 24px;
  height: 24px;
}

.weather-hero__verdict-text {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: baseline;
}

.weather-hero__verdict-title {
  font-size: 32rpx;
  font-weight: 600;
}

.weather-hero__verdict-title--success {
  color: $fish-success;
}

.weather-hero__verdict-title--ink {
  color: $fish-ink;
}

.weather-hero__verdict-title--warning {
  color: $fish-warning;
}

.weather-hero__verdict-title--destructive {
  color: $fish-destructive;
}

.weather-hero__verdict-title--muted {
  color: $fish-muted;
}

.weather-hero__verdict-meta {
  margin-left: 16rpx;
  color: $fish-muted;
  font-size: 24rpx;
}

.weather-hero__verdict-num {
  margin-left: 12rpx;
}

.weather-hero__verdict-pending {
  color: $fish-muted;
  font-size: 28rpx;
}

/* 骨架 */
.weather-hero__skeleton {
  margin-top: 24rpx;
}

.weather-hero__skeleton-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.weather-hero__skeleton-block {
  border-radius: $fish-radius-xl;
  background-color: $fish-surface;
  animation: hero-pulse 1.8s ease-in-out infinite;
}

.weather-hero__skeleton-block--temp {
  width: 224rpx;
  height: 128rpx;
}

.weather-hero__skeleton-block--icon {
  width: 112rpx;
  height: 112rpx;
}

.weather-hero__skeleton-line {
  width: 320rpx;
  height: 14rpx;
  margin-top: 24rpx;
  border-radius: 8rpx;
  background-color: $fish-surface;
  animation: hero-pulse 1.8s ease-in-out infinite;
}

@keyframes hero-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
