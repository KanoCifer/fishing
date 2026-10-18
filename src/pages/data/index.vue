<template>
  <!--
    数据页 —— tabBar 的第二个页签。

    结构上的取舍：这一页原本是八张等权卡片从上到下排开，每张回答一个子问题，
    用户得自己滚完、把四类数据在脑子里拼成一个判断。现在改成两层：

      第一层  结论头。一屏之内给出「今天行不行」，以及支撑它的三个成因。
      第二层  证据。按天气 / 潮汐 / 指数构成切换，每次只看一类，需要时才进来。

    分工也跟着变了：钓点页回答「在哪、这个地方行不行」，这一页回答「数据长什么样」。
    钓点页则只剩地图和 marker，不跟这里抢内容。
  -->

  <view class="data">
    <!-- 结论 -->
    <VerdictHeader @feedback="openFeedback" @detail="openDetail" />

    <!--
      证据切换。三个固定项，不需要 scroll-view。
      刻意用分段控件而不是纵向堆叠：三类数据互不相干，同屏出现只会互相稀释，
      而一次只需要认真看一类。
    -->
    <view class="segment">
      <view
        v-for="option in PANES"
        :key="option.key"
        class="segment__item"
        :class="{ 'segment__item--active': pane === option.key }"
        @tap="pane = option.key"
      >
        <text class="segment__text" :class="{ 'segment__text--active': pane === option.key }">
          {{ option.label }}
        </text>
      </view>
    </view>

    <!-- 天气：实况 → 趋势 → 逐时 → 七天，由实到细 -->
    <view v-if="pane === 'weather'" class="pane">
      <MetricChart />
      <HourlyWeather />
      <WeekStrip />
      <WeatherCard />
    </view>

    <!-- 潮汐：港口和日期可切，和天气分开是因为它换的是港口不是指标 -->
    <view v-else-if="pane === 'tide'" class="pane">
      <TideCard />
    </view>

    <!-- 指数构成：九项子特征各自贡献多少 -->
    <view v-else class="pane">
      <FeatureBreakdown />
    </view>

    <text class="data__foot">数据来自和风天气 · 渔碌服务端</text>

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

import FeatureBreakdown from '@/components/FeatureBreakdown/FeatureBreakdown.vue';
import FeatureDetailPanel from '@/components/FeatureDetailPanel/FeatureDetailPanel.vue';
import FishingFeedbackForm from '@/components/FishingFeedbackForm/FishingFeedbackForm.vue';
import HourlyWeather from '@/components/HourlyWeather/HourlyWeather.vue';
import MetricChart from '@/components/MetricChart/MetricChart.vue';
import SnapSheet from '@/components/SnapSheet/SnapSheet.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictHeader from '@/components/VerdictHeader/VerdictHeader.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import WeekStrip from '@/components/WeekStrip/WeekStrip.vue';
import { MAP_CENTER, useFishingMapStore } from '@/composables/useFishingMapStore';

/** 特征详情两档：半屏 / 大半屏 */
const FEATURE_SNAP_POINTS = [50, 82] as const;

type PaneKey = 'weather' | 'tide' | 'feature';

const PANES: ReadonlyArray<{ key: PaneKey; label: string }> = [
  { key: 'weather', label: '天气' },
  { key: 'tide', label: '潮汐' },
  { key: 'feature', label: '指数构成' },
];

const { state, fetchWeatherAndFishing } = useFishingMapStore();

/** 默认落在天气：进页面最常被问的是「现在什么天气」 */
const pane = ref<PaneKey>('weather');

/** 钓鱼指数的特征详情（结论头上的「特征详情」按钮） */
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

/**
 * 取数。
 *
 * 天气和钓鱼指数不再打一遍：store 是单例，钓点 tab 首屏已经拉过，
 * 这里只在数据还没到时兜底补一次。
 *
 * 潮汐面板由 TideCard 自己在 onShow / 切港口日期时取，这里不重复触发 ——
 * 三个面板都挂载着，若页面也去取，切一次面板就是两个请求。
 */
async function ensureData(): Promise<void> {
  if (!state.indexData && !state.weatherLoading && !state.indexLoading) {
    void fetchWeatherAndFishing(MAP_CENTER);
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
  background-color: #f8f8f8;
}

.segment {
  display: flex;
  margin: 28rpx 32rpx 0;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-blue-50;
}

.segment__item {
  flex: 1;
  padding: 14rpx 0;
  border-radius: 18rpx;
  text-align: center;
}

.segment__item--active {
  background-color: $fish-page;
  box-shadow: 0 2rpx 6rpx rgba(32, 33, 36, 0.12);
}

.segment__text {
  color: $fish-muted;
  font-size: 26rpx;
}

.segment__text--active {
  color: $fish-blue-600;
  font-weight: 600;
}

/* 一屏内的分区。左右留白统一 32rpx，结论头是满宽的，两者的关系是「带内容的一层」 */
.pane {
  padding: 32rpx;
}

.data__foot {
  display: block;
  padding: 16rpx 0 48rpx;
  color: $fish-muted-60;
  font-size: 22rpx;
  text-align: center;
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
</style>
