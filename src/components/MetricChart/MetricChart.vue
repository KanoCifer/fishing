<template>
  <view class="metric">
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

      <!--
        「轻触曲线查看数值」挪到图下面：
        标题行归外层那张卡了（它写的是「未来 24 小时」），
        这里再摆一个标题就跟外层重复，不如给一句操作提示。
      -->
      <text class="metric__hint">轻触曲线查看数值</text>
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
 *
 * 现在它是「未来 24 小时」卡的**曲线态**（见 Next24Hours）——
 * 玻璃面、卡内留白、标题行都由外层那张卡给。
 *
 * 默认指标是风速：同一批逐时数据在逐时格子里已经给过一遍气温了，
 * 默认再画一遍气温，同一个数在同一屏上说了两次。
 */
import { computed, ref } from 'vue';

import { LOADING_TEXT, retryable } from '@/constants/copy';
import { useConditionsStore } from '@/stores/conditions';
import { parseFxTime } from '@/utils/date';
import { chartPalette } from '@/utils/chartPalette';
import { useSurface } from '@/composables/useSurface';
import { toFiniteNumber } from '@/utils/number';

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
  /**
   * 值域从 0 起。
   *
   * 降水是绝对量：0 就是「没下雨」，没有负的那一侧，
   * 所以轴的下界固定在 0，不跟着数据往上下取整。
   *
   * 气温相反：0~50 的轴上 22~31 的起伏会被压成一条直线，
   * 所以它与风速都按数据取整（见下面的 axis）。
   */
  zeroBased?: boolean;
}

const METRICS: ReadonlyArray<Metric> = [
  { key: 'temp', label: '气温', unit: '°C' },
  { key: 'precip', label: '降水', unit: 'mm', zeroBased: true },
  { key: 'windSpeed', label: '风速', unit: 'km/h' },
];

/**
 * 这一块压在什么上面。照片面走自己那套色板（见 utils/chartPalette）。
 */
const surface = useSurface();

/**
 * 指标图的系列色。
 *
 * canvas 读不了 SCSS 变量与 CSS 变量，取色走 utils/chartPalette，
 * 三套都在那儿 —— 与 _color.scss 的同名令牌保持一致。
 */
function metricColor(key: Metric['key']): string {
  const tone = chartPalette(surface);
  if (key === 'temp') return tone.metricTemp;
  if (key === 'precip') return tone.metricPrecip;
  return tone.metricWind;
}

const conditionsStore = useConditionsStore();

const metric = ref<Metric['key']>('windSpeed');

const active = computed(() => METRICS.find((m) => m.key === metric.value) ?? METRICS[0]);

/** 逐时数据先筛脏值：降水字段偶尔是空串，直接 Number() 会得到 0，把曲线拽到底 */
const hours = computed(() =>
  conditionsStore.weatherHourly
    .slice(0, 24)
    .map((hour) => ({ fxTime: hour.fxTime, value: toFiniteNumber(hour[metric.value]) }))
    .filter((row): row is { fxTime: string; value: number } => row.value !== null),
);

const categories = computed(() => hours.value.map((hour) => parseFxTime(hour.fxTime)?.time ?? ''));

const series = computed(() =>
  hours.value.length
    ? [{ name: active.value.label, data: hours.value.map((h) => h.value), color: metricColor(active.value.key) }]
    : [],
);

const hasData = computed(() => hours.value.length > 0);

const loading = computed(() => conditionsStore.weatherPending);

/**
 * 取值域：按 step 向上/下取整，并各留 margin 的余量。返回 null 表示交给 LineChart 自己取整。
 *
 * 降水的下界固定在 0（见 Metric.zeroBased），不参与取整。
 */
const axis = computed(() => {
  const values = hours.value.map((h) => h.value);
  if (!values.length) return null;
  if (active.value.zeroBased) return null;

  const step = 5;
  const margin = 2;
  const min = Math.floor((Math.min(...values) - margin) / step) * step;
  const max = Math.ceil((Math.max(...values) + margin) / step) * step;
  // 风速下界别落到负数
  return { min: Math.max(0, min), max };
});

const emptyText = computed(() => (loading.value ? LOADING_TEXT : retryable('暂无逐时数据')));
</script>

<style lang="scss" scoped>
/*
 * 这一块现在是「未来 24 小时」卡的**曲线态**（见 Next24Hours）——
 * 玻璃面、卡内留白、标题行都由外层那张卡给。
 *
 * 所以这里没有 @include fish-card：卡里再套一层玻璃面，
 * 里面就多了一张贴纸（见 _material 的 fish-glass）。
 */

/*
 * 操作提示。压在图下面一行、右对齐 ——
 * 它是给「这张图能点」加的一句说明，不是标题。
 * 放在标题行里会跟外层那张卡的标题抢位置。
 */
.metric__hint {
  display: block;
  margin-top: 12rpx;
  text-align: right;
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

/*
 * 选中块。
 *
 * 底色走令牌：普通页面上是页面底色（一块浮在轨道上的白），
 * 照片面上换成更亮的半透明白 —— iOS 的 segmented control 在深色材质上
 * 就是「轨道半透明 + 选中块更亮」，不是选中块变白。
 */
.metric__item--active {
  background-color: var(--fish-segment-active);
  /* 选中块压出轨道用的那层投影。0.08 就够，再重就变成灰色描边了 */
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08); /* color-allow: 阴影在深色下本来就失效，层次靠面 */
}

.metric__item-text {
  color: $fish-muted;
  @include fish-type(body);
}

.metric__item-text--active {
  color: $fish-ink;
  font-weight: 500;
}

.metric__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted-60;
  @include fish-type(body);
  text-align: center;
}
</style>
