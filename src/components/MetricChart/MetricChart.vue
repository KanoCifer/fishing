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
      />
      <text class="metric__empty-note">单位 {{ active.unit }}</text>
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

import { useFishingMapStore } from '@/composables/useFishingMapStore';
import { parseFxTime } from '@/utils/date';
import { num } from '@/utils/weather';

import LineChart from '../LineChart/LineChart.vue';
import SkeletonCard from '../SkeletonCard/SkeletonCard.vue';

/** 图表可用宽度：750 − 面板左右留白 32rpx × 2 */
const CHART_WIDTH = 686;

interface Metric {
  /** 直接对应 WeatherHourly 的字段名 */
  key: 'temp' | 'precip' | 'windSpeed';
  label: string;
  unit: string;
  /** canvas 读不了 SCSS 变量，颜色只能硬编码，与 uni.scss 保持一致 */
  color: string;
}

const METRICS: ReadonlyArray<Metric> = [
  { key: 'temp', label: '气温', unit: '°C', color: '#ea4335' },
  { key: 'precip', label: '降水', unit: 'mm', color: '#4285f4' },
  { key: 'windSpeed', label: '风速', unit: 'km/h', color: '#1a73e8' },
];

const { state } = useFishingMapStore();

const metric = ref<Metric['key']>('temp');

const active = computed(() => METRICS.find((m) => m.key === metric.value) ?? METRICS[0]);

/** 逐时数据先筛脏值：降水字段偶尔是空串，直接 Number() 会得到 0，把曲线拽到底 */
const hours = computed(() =>
  state.weatherHourly
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

const loading = computed(() => state.weatherLoading);

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
.metric__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.metric__title {
  color: $fish-ink;
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: -1rpx;
}

.metric__hint {
  color: $fish-muted-60;
  font-size: 22rpx;
}

.metric__segment {
  display: flex;
  margin-bottom: 20rpx;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-blue-50;
}

.metric__item {
  flex: 1;
  padding: 12rpx 0;
  border-radius: 18rpx;
  text-align: center;
}

.metric__item--active {
  background-color: $fish-page;
  box-shadow: 0 2rpx 6rpx rgba(32, 33, 36, 0.12);
}

.metric__item-text {
  color: $fish-muted;
  font-size: 24rpx;
}

.metric__item-text--active {
  color: $fish-blue-600;
  font-weight: 600;
}

.metric__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted-60;
  font-size: 26rpx;
  text-align: center;
}

.metric__empty-note {
  display: block;
  margin-top: 12rpx;
  color: $fish-muted-60;
  font-size: 22rpx;
}
</style>
