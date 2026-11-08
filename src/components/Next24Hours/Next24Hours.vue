<template>
  <view class="next24">
    <view class="next24__head">
      <view class="next24__head-left">
        <image
          class="next24__title-icon"
          :class="{ 'next24__title-icon--dim': surface === 'photo' }"
          :src="clockIcon"
          mode="aspectFit"
        />
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
import { ref, computed } from 'vue';

import { useSurface } from '@/composables/useSurface';
import { useSurfaceIcons } from '@/composables/useSurfaceIcons';

import HourlyWeather from '../HourlyWeather/HourlyWeather.vue';
import MetricChart from '../MetricChart/MetricChart.vue';

/** 卡片的两态：逐时格子 / 指标曲线 */
type Mode = 'hours' | 'chart';

const mode = ref<Mode>('hours');

/**
 * 这一块压在什么上面。照片面上图标要压白（见 utils/theme 的图标说明）。
 */
const surface = useSurface();

/** 图标色档由 useSurfaceIcons 统一给（见该文件的说明） */
const { clock: clockIcon } = useSurfaceIcons();
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

/*
 * 图标跟标题文字同色，底边贴着文字基线。
 *
 * 尺寸走 badge 那一档：标题落到 caption 之后，40rpx 的图标比字还大，
 * 反过来成了这一行里最重的东西。
 */
.next24__title-icon {
  width: $fish-icon-badge;
  height: $fish-icon-badge;
}

/*
 * 照片面：图标压到 72% —— 与 muted 标题同一档。
 *
 * 图标的色值烤在 data URI 里，CSS 变量改不动它，只能用 opacity 压。
 * 白 72% 正是照片面上 --fish-muted 的值，压完之后图标与标题同档。
 */
.next24__title-icon--dim {
  @include fish-photo-icon-dim;
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

/*
 * 选中块。
 *
 * 底色走令牌：普通页面上是页面底色（一块浮在轨道上的白），
 * 照片面上换成更亮的半透明白 —— iOS 的 segmented control 在深色材质上
 * 就是「轨道半透明 + 选中块更亮」。
 */
.next24__item--active {
  background-color: var(--fish-segment-active);
  /* 选中块压出轨道用的那层投影。0.08 就够，再重就变成灰色描边了 */
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08); /* color-allow: 阴影在深色下本来就失效，层次靠面 */
}

.next24__item-text {
  color: $fish-muted;
  @include fish-type(caption);
  @include numeric;
}

.next24__item-text--active {
  color: $fish-ink;
  font-weight: 500;
}
</style>
