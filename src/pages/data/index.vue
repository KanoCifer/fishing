<template>
  <view class="data">
    <!--
      数据页 —— tabBar 的第二个页签，钓点页那块可拖拽数据面板的内容都在这。

      分工：钓点页回答「在哪、这个地方行不行」，这一页回答「数据长什么样」。
      天气、潮汐、钓鱼指数、反馈四条线按分组排下来，纵向滚完就是一次完整的
      出钓判断；钓点页则只剩地图和 marker，不跟这里抢内容。
    -->

    <view class="data__context">
      <text class="data__place">{{ placeName }}</text>
      <text v-if="updatedAt" class="data__updated">更新于 {{ updatedAt }}</text>
    </view>

    <!--
      钓鱼指数放最前：它是这一页的结论，其余都是支撑这个结论的证据。
      「详情」和「反馈」两个出口也在这里，跟过去时上下文是完整的。
    -->
    <view class="card card--nested">
      <FishingIndexCard @detail="openDetail" @feedback="openFeedback" />
    </view>

    <QuickFeedbackBanner :disabled="!state.indexData" @submit="openFeedback" />

    <!-- 天气：实况 → 详情 → 趋势 → 逐时，由实到细 -->
    <view class="card card--nested">
      <WeatherHero />
      <view class="divider" />
      <WeatherCard />
    </view>

    <!-- 7 天气温：最高 / 最低两条线 -->
    <view class="card">
      <view class="card__header">
        <text class="card__title">7 天气温</text>
        <text class="card__sub">最高 / 最低</text>
      </view>

      <LineChart
        v-if="weekSeries.length"
        :categories="weekCategories"
        :series="weekSeries"
        :min="weekAxis?.min"
        :max="weekAxis?.max"
        :width="CHART_WIDTH"
        :height="320"
      />
      <text v-else class="card__empty">{{ weekEmpty }}</text>
    </view>

    <!-- 未来 24 小时：三种指标共用一张图，切换比重画三张省一个 canvas -->
    <view class="card">
      <view class="card__header">
        <text class="card__title">24 小时趋势</text>
        <view class="segment">
          <view
            v-for="option in METRICS"
            :key="option.key"
            class="segment__item"
            :class="{ 'segment__item--active': metric === option.key }"
            @tap="metric = option.key"
          >
            <text class="segment__text" :class="{ 'segment__text--active': metric === option.key }">
              {{ option.label }}
            </text>
          </view>
        </view>
      </view>

      <view v-if="hourlySeries.length" class="chart-unit">
        <text class="chart-unit__text">{{ activeMetric.unit }}</text>
        <text class="chart-unit__hint">轻触曲线查看数值</text>
      </view>
      <LineChart
        v-if="hourlySeries.length"
        :categories="hourlyCategories"
        :series="hourlySeries"
        :min="hourlyAxis?.min"
        :max="hourlyAxis?.max"
        :label-step="4"
        :width="CHART_WIDTH"
        :height="300"
      />
      <text v-else class="card__empty">{{ hourlyEmpty }}</text>
    </view>

    <!-- 逐时预报的横向卡片：给出每个时刻的天气现象和温度，
         和上面的曲线是同一份数据，一个看趋势一个看逐条 -->
    <view class="card card--nested">
      <HourlyWeather />
    </view>

    <!-- 潮汐：港口和日期可切，和天气分开成卡是因为它换的是港口不是指标 -->
    <view class="card card--nested">
      <TideCard />
    </view>

    <!--
      钓鱼指数构成。
      纵轴是 0~100 的「相对水位」而不是原始值：九项子特征量纲不一
      （气温 20、湿度 80），画在同一根轴上比大小没有意义。
      归一化规则见 types/fishing.ts 的 toFeatureTiles，和特征详情面板共用。
    -->
    <view class="card">
      <view class="card__header">
        <text class="card__title">钓鱼指数构成</text>
        <text class="card__sub">{{ featureCategories.length }} 项 · 相对水位 %</text>
      </view>

      <LineChart
        v-if="featureSeries.length"
        :categories="featureCategories"
        :series="featureSeries"
        :min="0"
        :max="100"
        :label-step="1"
        :width="CHART_WIDTH"
        :height="320"
      />
      <text v-else class="card__empty">{{ featureEmpty }}</text>
    </view>

    <text class="data__foot">数据来自和风天气 · 渔录服务端</text>

    <!--
      以下两个是浮层，不占页面流。SnapSheet 是 fixed 全屏遮罩，
      在可滚动页面上同样成立（浮层固定在视口，不随内容滚走）。
    -->

    <!-- 钓鱼指数的特征详情（feature_breakdown 九项子特征） -->
    <SnapSheet :open="featureOpen" :snap-points="FEATURE_SNAP_POINTS" :initial-snap="0" @close="featureOpen = false">
      <template #header>
        <view class="feature__header">
          <text class="feature__title">特征详情</text>
          <text class="feature__subtitle">钓鱼指数是怎么算出来的</text>
        </view>
      </template>
      <FeatureDetailPanel :data="state.indexData" />
    </SnapSheet>

    <!-- 钓鱼反馈 -->
    <FishingFeedbackForm
      :open="feedbackOpen"
      :data="state.indexData"
      :location-id="locationId"
      @close="feedbackOpen = false"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 数据页 —— tabBar 的第二个页签。
 *
 * 页面滚动直接用页面级滚动（内容超过窗口自动滚），不套 scroll-view：
 * scroll-view 必须给确定高度，而这里内容高度随接口返回的条数变化，
 * 给死高度要么留白要么裁切。
 */
import { computed, onMounted, ref } from 'vue';
import { onPageShow } from '@dcloudio/uni-app';

import FeatureDetailPanel from '@/components/FeatureDetailPanel/FeatureDetailPanel.vue';
import FishingFeedbackForm from '@/components/FishingFeedbackForm/FishingFeedbackForm.vue';
import FishingIndexCard from '@/components/FishingIndexCard/FishingIndexCard.vue';
import HourlyWeather from '@/components/HourlyWeather/HourlyWeather.vue';
import LineChart from '@/components/LineChart/LineChart.vue';
import QuickFeedbackBanner from '@/components/QuickFeedbackBanner/QuickFeedbackBanner.vue';
import SnapSheet from '@/components/SnapSheet/SnapSheet.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import WeatherHero from '@/components/WeatherHero/WeatherHero.vue';
import { fishingApi } from '@/api/fishing';
import { MAP_CENTER, useFishingMapStore } from '@/composables/useFishingMapStore';
import { toFeatureTiles, type FishingStats } from '@/types/fishing';
import { parseFxTime, shortDate } from '@/utils/date';
import { num } from '@/utils/weather';

/** 卡片内边距 24rpx × 2 + 页面左右留白 24rpx × 2 = 750 - 96 */
const CHART_WIDTH = 654;

/** 特征详情两档：半屏 / 大半屏 */
const FEATURE_SNAP_POINTS = [50, 82] as const;

interface Metric {
  /** 直接对应 WeatherHourly 的字段名 */
  key: 'temp' | 'precip' | 'windSpeed';
  label: string;
  unit: string;
}

const METRICS: ReadonlyArray<Metric> = [
  { key: 'temp', label: '气温', unit: '°C' },
  { key: 'precip', label: '降水', unit: 'mm' },
  { key: 'windSpeed', label: '风速', unit: 'km/h' },
];

const { state, fetchWeatherAndFishing } = useFishingMapStore();

const metric = ref<Metric['key']>('temp');
const stats = ref<FishingStats | null>(null);
const statsLoading = ref(false);

/** 钓鱼指数的特征详情（指数卡上的「详情」按钮） */
const featureOpen = ref(false);
const feedbackOpen = ref(false);

/**
 * 反馈关联的钓点 id，取自钓点页共享过来的选中态。
 *
 * 用户在钓点页选了哪个点，切到这页提交反馈时就记到那个点头上；
 * 没选过就是 'default'（后端约定）。
 */
const locationId = computed(() => {
  const spot = state.selectedMarker?.extraData;
  return spot ? String(spot.id) : 'default';
});

const placeName = computed(() => state.locationName || '钓鱼地点');

/** 实况观测时刻，形如 2026-10-18T11:00+08:00，只取时分 */
const updatedAt = computed(() => parseFxTime(state.liveWeather?.obsTime ?? '')?.time ?? '');

/**
 * 把取值域按 step 向上/下取整，并各留 margin 的余量。
 *
 * 返回 null 表示没有数据，调用方据此不传 min/max，
 * 交给 LineChart 按原来的规则自动取整（从 0 起）。
 */
function paddedAxis(values: number[], options: { step: number; margin: number }): { min: number; max: number } | null {
  if (!values.length) return null;

  const { step, margin } = options;
  return {
    min: Math.floor((Math.min(...values) - margin) / step) * step,
    max: Math.ceil((Math.max(...values) + margin) / step) * step,
  };
}

// ---------------------------------------------------------------------------
// 7 天气温
// ---------------------------------------------------------------------------

/** 挑出温湿度两项都有值的日，脏数据整条丢掉，不参与作图 */
const weekDays = computed(() =>
  state.forecasts
    .map((day) => ({
      fxDate: day.fxDate,
      max: num(day.tempMax),
      min: num(day.tempMin),
    }))
    .filter((day): day is { fxDate: string; max: number; min: number } => day.max !== null && day.min !== null),
);

const weekCategories = computed(() => weekDays.value.map((day, i) => (i === 0 ? '今天' : shortDate(day.fxDate))));

const weekSeries = computed(() => {
  if (!weekDays.value.length) return [];
  return [
    {
      name: '最高',
      // $fish-temp 红 / $fish-blue 蓝，与 uni.scss 一致（canvas 读不了 SCSS 变量，只能硬编码）
      data: weekDays.value.map((day) => day.max),
      color: '#ea4335',
    },
    { name: '最低', data: weekDays.value.map((day) => day.min), color: '#4285f4' },
  ];
});

const weekAxis = computed(() =>
  paddedAxis([...weekDays.value.map((d) => d.max), ...weekDays.value.map((d) => d.min)], {
    step: 5,
    margin: 2,
  }),
);

// ---------------------------------------------------------------------------
// 未来 24 小时
// ---------------------------------------------------------------------------

const activeMetric = computed(() => METRICS.find((m) => m.key === metric.value) ?? METRICS[0]);

/** 逐时数据同样先筛脏值：降水字段偶尔是空串，直接 Number() 会得到 0，把曲线拽到底 */
const hours = computed(() =>
  state.weatherHourly
    .slice(0, 24)
    .map((hour) => ({ fxTime: hour.fxTime, value: num(hour[metric.value]) }))
    .filter((row): row is { fxTime: string; value: number } => row.value !== null),
);

const hourlyCategories = computed(() => hours.value.map((hour) => parseFxTime(hour.fxTime)?.time ?? ''));

const hourlySeries = computed(() =>
  hours.value.length
    ? [{ name: activeMetric.value.label, data: hours.value.map((h) => h.value), color: '#4285f4' }]
    : [],
);

/**
 * 纵轴取值域：按 step 向上/下取整，并留 margin 的余量。
 *
 * 气温不给零基线：0~50 的轴上，22~31 的起伏会被压成一条直线。
 * 降水是绝对量、从 0 起最诚实，交给 LineChart 自己取整即可（返回 null）。
 */
const hourlyAxis = computed(() => {
  const values = hours.value.map((h) => h.value);
  if (!values.length) return null;
  if (metric.value === 'precip') return null;

  const axis = paddedAxis(values, { step: 5, margin: 2 });
  // 风速下界别落到负数
  return axis ? { ...axis, min: Math.max(0, axis.min) } : null;
});

// ---------------------------------------------------------------------------
// 钓鱼指数构成 / 记录
// ---------------------------------------------------------------------------

const featureTiles = computed(() => toFeatureTiles(state.indexData?.feature_breakdown));
const featureCategories = computed(() => featureTiles.value.map((tile) => tile.label));
const featureSeries = computed(() =>
  featureTiles.value.length
    ? [{ name: '相对水位', data: featureTiles.value.map((tile) => tile.percent), color: '#34a853' }]
    : [],
);

const recordsText = computed(() => {
  const total = stats.value?.total_records;
  return typeof total === 'number' ? String(total) : '—';
});

const lastRecordText = computed(() => {
  const raw = stats.value?.latest_record_time;
  if (!raw) return '暂无';
  const parsed = parseFxTime(raw);
  return parsed ? `${parsed.date} ${parsed.time}` : raw;
});

// ---------------------------------------------------------------------------
// 空态与取数
// ---------------------------------------------------------------------------

const firstLoading = computed(() => (state.weatherLoading || state.indexLoading) && !state.indexData);

const weekEmpty = computed(() =>
  firstLoading.value ? '加载中…' : state.forecasts.length ? '预报数据不完整' : '暂无预报数据',
);
const hourlyEmpty = computed(() => (firstLoading.value ? '加载中…' : '暂无逐时数据'));
const featureEmpty = computed(() => (firstLoading.value ? '加载中…' : '暂无指数构成数据'));

/**
 * 取数。
 *
 * 天气和钓鱼指数不再打一遍：store 是单例，钓点 tab 首屏已经拉过，
 * 这里只在数据还没到时兜底补一次。记录统计没有缓存，每次进 tab 都刷新。
 */
async function ensureData(): Promise<void> {
  if (!state.indexData && !state.weatherLoading && !state.indexLoading) {
    void fetchWeatherAndFishing(MAP_CENTER);
  }

  if (statsLoading.value) return;
  statsLoading.value = true;
  try {
    stats.value = await fishingApi.getStats();
  } catch {
    // 统计拿不到不影响天气和指数，页面上以「—」呈现即可，就不弹 toast 了
    stats.value = null;
  } finally {
    statsLoading.value = false;
  }
}

// onPageShow 在 tab 切回本页时也会触发，所以两个钩子都挂；
// ensureData 内部有 loading 守卫，首帧两次调用只会真的发一次请求。
onMounted(() => {
  void ensureData();
});
onPageShow(() => {
  void ensureData();
});

function openDetail() {
  featureOpen.value = true;
}

function openFeedback() {
  feedbackOpen.value = true;
}
</script>

<style lang="scss" scoped>
.data {
  min-height: 100vh;
  padding: 24rpx 24rpx 48rpx;
  box-sizing: border-box;
  background-color: #f8f8f8;
}

.data__context {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8rpx 8rpx 24rpx;
}

.data__place {
  color: $fish-ink;
  font-size: 30rpx;
  font-weight: 600;
}

.data__updated {
  color: $fish-muted-60;
  font-size: 24rpx;
}

.card {
  margin-bottom: 24rpx;
  padding: 28rpx 24rpx 20rpx;
  border-radius: 20rpx;
  background-color: $fish-page;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
}

/* 内嵌 WeatherCard / HourlyWeather 的卡片：这两个组件自带左右内边距，
   卡片这边就只留上下的量，否则左右会被撑到 32rpx，和其它卡片对不齐 */
.card--nested {
  padding: 24rpx 16rpx 20rpx;
}

/* 同一张卡里的分组线：实况天气和天气详情是两块内容，不该糊成一片 */
.divider {
  height: 2rpx;
  margin: 8rpx 8rpx;
  background-color: $fish-border-40;
}

/* 特征详情浮层的头部。SnapSheet 只提供容器，标题区归页面 */
.feature__header {
  padding: 0 40rpx 24rpx;
}

.feature__title {
  display: block;
  color: $fish-ink;
  font-size: 32rpx;
  font-weight: 600;
}

.feature__subtitle {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted;
  font-size: 24rpx;
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.card__title {
  color: $fish-ink;
  font-size: 30rpx;
  font-weight: 600;
}

.card__sub {
  color: $fish-muted-60;
  font-size: 24rpx;
}

.card__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted-60;
  font-size: 26rpx;
  text-align: center;
}

/* 指标切换：三个固定项，不需要 scroll-view */
.segment {
  display: flex;
  flex-direction: row;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-blue-50;
}

.segment__item {
  padding: 10rpx 24rpx;
  border-radius: 18rpx;
}

.segment__item--active {
  background-color: $fish-page;
  box-shadow: 0 2rpx 6rpx rgba(32, 33, 36, 0.12);
}

.segment__text {
  color: $fish-muted;
  font-size: 24rpx;
}

.segment__text--active {
  color: $fish-blue-600;
  font-weight: 600;
}

.chart-unit {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.chart-unit__text {
  color: $fish-muted;
  font-size: 24rpx;
}

.chart-unit__hint {
  color: $fish-muted-60;
  font-size: 22rpx;
}

.stats {
  display: flex;
  flex-direction: row;
  padding-top: 8rpx;
}

.stats__item {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.stats__item--wide {
  flex: 1.4;
}

.stats__value {
  color: $fish-ink;
  font-size: 44rpx;
  font-weight: 600;
  line-height: 1.2;
}

.stats__value--time {
  font-size: 32rpx;
}

.stats__label {
  margin-top: 6rpx;
  color: $fish-muted-60;
  font-size: 24rpx;
}

.data__foot {
  display: block;
  padding: 8rpx 0 16rpx;
  color: $fish-muted-60;
  font-size: 22rpx;
  text-align: center;
}
</style>
