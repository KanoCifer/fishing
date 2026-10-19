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

import { useFishingMapStore } from '@/stores/fishingMap';
import { parseFxTime } from '@/utils/date';
import { weatherIconClass } from '@/utils/weather';

const mapStore = useFishingMapStore();

const hours = computed(() => mapStore.weatherHourly.slice(0, 24));
</script>

<style lang="scss" scoped>
/* 分区间距：统一走 $fish-space-section，理由见 uni.scss。
   原来这里靠一个空规则占位，现已改成真正生效的分区间距 */
.hourly {
  margin-top: $fish-space-section;
}

.hourly__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.hourly__title {
  color: $fish-ink;
  @include fish-type(headline);
}

.hourly__meta {
  color: $fish-muted;
  @include fish-type(caption);
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
  @include fish-type(caption);
}

/* 「现在」这一格靠字重站出来，不靠颜色 —— 加了颜色就变成在提示，
   而它其实是状态，不是提醒 */
.hourly__cell--now .hourly__time {
  color: $fish-accent;
  font-weight: 600;
}

/*
 * 图标字形不走字阶。
 *
 * 和风图标是字体字形，没有「字重 / 字距 / 行高」的排版语义 ——
 * 套 fish-type 会把行高顶到 1.25，在字形下面多留一截空白，
 * 整排格子跟着往下坠。字形只认 font-size 和 line-height: 1。
 */
.hourly__icon {
  margin: 12rpx 0;
  font-size: 40rpx;
  line-height: 1;
  /* 单色字形吃 color（emoji 不吃），压成辅助灰让同格的温度数值保持主次 */
  color: $fish-muted;
}

.hourly__temp {
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
}

.hourly__skeleton {
  border-radius: $fish-radius-sm;
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

/* 与 SkeletonCard 的同名 keyframes 保持同一档呼吸幅度（0.35），
   否则同一个页面里两种加载态一深一浅，像两套组件 */
@keyframes hourly-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
