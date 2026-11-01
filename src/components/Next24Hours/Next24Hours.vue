<template>
  <view class="next24">
    <view class="next24__head">
      <text class="next24__title">未来 24 小时</text>

      <!--
        逐时 / 曲线：同一份数据的两种读法。

        分段控件放在标题行右侧 —— 它是这张卡的视图开关，不是内容。
      -->
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
      两种态各是一个组件。挂 v-if 而不是 v-show：
      曲线那张图是 canvas 节点，v-show 只是把它藏起来 ——
      canvas 还在、也还在画，切到逐时态时它白占一份内存。
    -->
    <HourlyWeather v-if="mode === 'hours'" />
    <MetricChart v-else />
  </view>
</template>

<script setup lang="ts">
/**
 * Next24Hours —— 未来 24 小时：逐时格子与指标曲线合成一张卡。
 *
 * 为什么合成一张：这两块说的是同一份数据（mapStore.weatherHourly 的前 24 条）。
 * 分成两张卡时，一屏里能同时读到「24 个温度」和「一条气温曲线」——
 * 同一批数字被说了两遍，而且两遍都是温度。
 *
 * 合成之后省下一张卡，也省下一遍温度。代价是曲线从「滑过就看见」
 * 变成「点一下才看见」—— 这是拿可见性换版面，不是白拿的。
 *
 * 曲线默认指标改成风速：气温在逐时格子里已经给过一遍。
 */
import { ref } from 'vue';

import HourlyWeather from '../HourlyWeather/HourlyWeather.vue';
import MetricChart from '../MetricChart/MetricChart.vue';

/** 卡片的两态：逐时格子 / 指标曲线 */
type Mode = 'hours' | 'chart';

const mode = ref<Mode>('hours');
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
}

.next24__item-text--active {
  color: $fish-ink;
  font-weight: 600;
}
</style>
