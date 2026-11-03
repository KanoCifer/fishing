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

    <!--
    两态各挂一层：换态时新的一层淡入落位，不是一整块硬切。

    挂普通 <view> 而不是组件标签本身 ——
    组件宿主节点不吃动画，挂在宿主上的 animation 不动。
    -->
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
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.next24 {
  @include fish-card;
}

/*
 * 标题行。右边那一段是视图开关（分段控件），不是元信息 ——
 * 所以对齐用 center 而不是基线：分段控件有自己的一行高，
 * 拿基线去对齐它，那个小方块会悬在标题字的半腰上。
 */
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
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

/*
 * 两态的外层。
 *
 * 换态时旧的一层立刻摘掉，新的一层从下方 4rpx 升上来淡入 ——
 * 眼睛不用重新找一次内容从哪来。
 *
 * 位移只有 4rpx：两态高度差得远（逐时一排 vs 一张曲线），
 * 位移再大就从「换了一组内容」读作「飞进来了」。
 *
 * 用 animation 而不是 transition：内容是随 v-if 挂上来的，
 * 中间没有「先在隐藏态」那一帧，transition 没有起点可过渡。
 */
.next24__pane {
  @include fish-cross-in;
}

.next24__item {
  padding: 6rpx 22rpx;
  border-radius: 12rpx;
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
