<template>
  <view class="metric">
    <view class="metric__head">
      <text class="metric__title">{{ active.label }} · 未来 24 小时</text>
      <text class="metric__hint">轻触曲线查看数值</text>
    </view>

    <!-- 指标切换。三个固定项，不需要 scroll-view -->
    <view class="metric__segment">
      <view
        v-for="option in METRICS"
        :key="option.key"
        class="metric__item"
        :class="{ 'metric__item--active': metric === option.key }"
        @tap="metric = option.key"
      >
        <text class="metric__item-text" :class="{ 'metric__item-text--active': metric === option.key }">
          {{ option.label }}
        </text>
      </view>
    </view>

    <SkeletonCard v-if="loading && !hasData" has-chart />

    <template v-else-if="hasData">
      <LineChart
        :categories="categories"
        :series="series"
        :min="axis?.min"
        :max="axis?.max"
        :label-step="4"
        :width="CHART_WIDTH"
        :height="300"
        :unit="active.unit"
      />
    </template>

    <text v-else class="metric__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * MetricChart —— 24 小时逐时曲线，三种指标共用一张图。
 *
 * 为什么切换指标比重画三张省一个 canvas：三条曲线的横轴（时刻）完全一样，
 * 拆成三张就是三个 canvas 实例、三份内存、三倍首屏绘制。在小程序端
 * canvas 是实打实的资源，能省则省。
 *
 * 指标选择放在组件内部而不是页面：它只影响这一张图，外界没有读它的理由。
 */
import { computed, ref } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import { parseFxTime } from '@/utils/date';
import { num } from '@/utils/weather';

import LineChart from '../LineChart/LineChart.vue';
import SkeletonCard from '../SkeletonCard/SkeletonCard.vue';

/**
 * 图表可用宽度：750 − 页面留白 32rpx × 2 − 卡片内边距 28rpx × 2
 *
 * 这三个数是一套的，改任何一处都要回来改这里。图表是定宽块，
 * 给宽了会横向溢出卡片，给窄了右边会空出一条。
 */
const CHART_WIDTH = 630;

interface Metric {
  /** 直接对应 WeatherHourly 的字段名 */
  key: 'temp' | 'precip' | 'windSpeed';
  label: string;
  unit: string;
  /** canvas 读不了 SCSS 变量，颜色只能硬编码，与令牌层 _color.scss 保持一致 */
  color: string;
}

const METRICS: ReadonlyArray<Metric> = [
  { key: 'temp', label: '气温', unit: '°C', color: '#ff3b30' }, // $fish-temp
  { key: 'precip', label: '降水', unit: 'mm', color: '#007aff' }, // $fish-tide 的蓝：水
  { key: 'windSpeed', label: '风速', unit: 'km/h', color: '#5ac8fa' }, // systemTeal
];

const mapStore = useFishingMapStore();

const metric = ref<Metric['key']>('temp');

const active = computed(() => METRICS.find((m) => m.key === metric.value) ?? METRICS[0]);

/** 逐时数据先筛脏值：降水字段偶尔是空串，直接 Number() 会得到 0，把曲线拽到底 */
const hours = computed(() =>
  mapStore.weatherHourly
    .slice(0, 24)
    .map((hour) => ({ fxTime: hour.fxTime, value: num(hour[metric.value]) }))
    .filter((row): row is { fxTime: string; value: number } => row.value !== null),
);

const categories = computed(() => hours.value.map((hour) => parseFxTime(hour.fxTime)?.time ?? ''));

const series = computed(() =>
  hours.value.length
    ? [{ name: active.value.label, data: hours.value.map((h) => h.value), color: active.value.color }]
    : [],
);

const hasData = computed(() => hours.value.length > 0);

const loading = computed(() => mapStore.weatherLoading);

/**
 * 取值域：按 step 向上/下取整，并各留 margin 的余量。返回 null 表示交给 LineChart 自己取整。
 *
 * 气温不给零基线：0~50 的轴上，22~31 的起伏会被压成一条直线。
 * 降水是绝对量、从 0 起最诚实，所以不给下界。
 */
const axis = computed(() => {
  const values = hours.value.map((h) => h.value);
  if (!values.length) return null;
  if (metric.value === 'precip') return null;

  const step = 5;
  const margin = 2;
  const min = Math.floor((Math.min(...values) - margin) / step) * step;
  const max = Math.ceil((Math.max(...values) + margin) / step) * step;
  // 风速下界别落到负数
  return { min: Math.max(0, min), max };
});

const emptyText = computed(() => (loading.value ? '加载中…' : '暂无逐时数据'));
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）——
 * 那是页面的版式决定，不是各组件自己的事。
 */
.metric {
  @include fish-card;
}

.metric__head {
  @include fish-card-head;
}

.metric__title {
  @include fish-card-title(title3);
}

.metric__hint {
  @include fish-card-meta;
}

/*
 * 分段控件。
 *
 * 轨道用中性填充（$fish-fill）而不是带色底 —— iOS 的 segmented control
 * 从来不给轨道上品牌色，彩色只出现在选中项上，否则整排都在抢注意力。
 *
 * 选中块是白底 + 一层极浅投影：它是「浮」在轨道上的一层，不是「染」了轨道的颜色。
 */
.metric__segment {
  display: flex;
  margin-bottom: 20rpx;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

.metric__item {
  flex: 1;
  padding: 14rpx 0;
  border-radius: 14rpx;
  text-align: center;
  @include fish-press-dim;
}

.metric__item--active {
  background-color: $fish-page;
  /* 选中块压出轨道用的那层投影。0.08 就够，再重就变成灰色描边了 */
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}

.metric__item-text {
  color: $fish-muted;
  @include fish-type(callout);
}

.metric__item-text--active {
  color: $fish-ink;
  font-weight: 600;
}

.metric__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted-60;
  @include fish-type(subhead);
  text-align: center;
}
</style>
