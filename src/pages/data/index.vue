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
    <VerdictHeader @feedback="openFeedback" />

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

    <!--
      天气：实况 → 趋势 → 逐时 → 七天，由实到细。

      .pane__section 落在每个子组件的根节点上（Vue 的 class fallthrough，
      钓点页的 FullscreenMap 也是这么用的），所以动画归每个分区自己所有，
      页面只负责按顺序给不同的延迟。切面板时整组重建，入场跟着重放一遍 ——
      这正是要的效果：新面板的内容落位，而不是旧面板消失后新面板凭空出现。
    -->
    <view v-if="pane === 'weather'" class="pane">
      <MetricChart class="pane__section" :style="{ animationDelay: enterDelay(0) }" />
      <HourlyWeather class="pane__section" :style="{ animationDelay: enterDelay(1) }" />
      <WeekStrip class="pane__section" :style="{ animationDelay: enterDelay(2) }" />
      <WeatherCard class="pane__section" :style="{ animationDelay: enterDelay(3) }" />
    </view>

    <!-- 潮汐：港口和日期可切，和天气分开是因为它换的是港口不是指标 -->
    <view v-else-if="pane === 'tide'" class="pane">
      <TideCard class="pane__section" :style="{ animationDelay: enterDelay(0) }" />
    </view>

    <!-- 指数构成：九项子特征各自贡献多少 -->
    <view v-else class="pane">
      <FeatureBreakdown class="pane__section" :style="{ animationDelay: enterDelay(0) }" />
    </view>

    <text class="data__foot">数据来自和风天气 · 渔碌服务端</text>

    <!--
      以下浮层不占页面流。SnapSheet 是 fixed 全屏遮罩，
      在可滚动页面上同样成立（浮层固定在视口，不随内容滚走）。
    -->

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
import FishingFeedbackForm from '@/components/FishingFeedbackForm/FishingFeedbackForm.vue';
import HourlyWeather from '@/components/HourlyWeather/HourlyWeather.vue';
import MetricChart from '@/components/MetricChart/MetricChart.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictHeader from '@/components/VerdictHeader/VerdictHeader.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import WeekStrip from '@/components/WeekStrip/WeekStrip.vue';
import { MAP_CENTER, useFishingMapStore } from '@/composables/useFishingMapStore';
import { enterDelay } from '@/utils/motion';

type PaneKey = 'weather' | 'tide' | 'feature';

const PANES: ReadonlyArray<{ key: PaneKey; label: string }> = [
  { key: 'weather', label: '天气' },
  { key: 'tide', label: '潮汐' },
  { key: 'feature', label: '指数构成' },
];

const { state, fetchWeatherAndFishing } = useFishingMapStore();

/** 默认落在天气：进页面最常被问的是「现在什么天气」 */
const pane = ref<PaneKey>('weather');

/** 钓鱼反馈浮层 */
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

function openFeedback() {
  feedbackOpen.value = true;
}
</script>

<style lang="scss" scoped>
/* 页面底色 = systemGroupedBackground。App.vue 里给 page 也上了同一个色，
   这里再写一遍是为了让「内容区」和「切换瞬间露出的底色」保证同色 */
.data {
  min-height: 100vh;
  background-color: $fish-grouped;
}

/*
 * 证据切换 —— 全页唯一的分段控件。
 *
 * 轨道是中性填充而非品牌色底：iOS 的 segmented 从不给轨道上色，
 * 彩色只留给选中项。选中块白底 + 浅投影，读作「浮在轨道上的一层」。
 */
.segment {
  display: flex;
  margin: 24rpx 32rpx 0;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

.segment__item {
  flex: 1;
  padding: 16rpx 0;
  border-radius: 14rpx;
  text-align: center;
  @include fish-press-dim;
}

.segment__item--active {
  background-color: $fish-page;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}

.segment__text {
  color: $fish-muted;
  @include fish-type(callout);
}

.segment__text--active {
  color: $fish-ink;
  font-weight: 600;
}

/*
 * 一屏内的分区。
 *
 * 左右留白 32rpx 统一在这里给，内容组件（WeekStrip / TideCard / WeatherCard /
 * HourlyWeather）自己不再带内边距 —— 留白是页面级的，留在组件里就等于
 * 同一个数抄了三份。结论头是满宽的，它和 .pane 的关系是「带内容的一层」。
 */
.pane {
  padding: 32rpx;
}

/*
 * 分区入场。
 *
 * 规则写在页面而不是各组件里：延迟取决于这一组里第几个分区（由模板给），
 * 组件自己不知道自己排在第几位。规则也只有这一条，各分区长得一样。
 *
 * 这里没有退场动画。退场要留住旧内容等它走完，小程序端 v-if 直接销毁节点，
 * 挂一个退场等于让新旧两块同时占位，面板切换时会看到两层内容叠着。
 * 切换本来就是一次「换」，入场把新内容交代清楚就够了。
 */
.pane__section {
  @include fish-enter;
}

.data__foot {
  display: block;
  padding: 16rpx 0 48rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);

  text-align: center;
}
</style>
