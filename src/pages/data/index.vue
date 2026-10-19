<template>
  <view class="data">
    <PageBackdrop />

    <view class="data__content">
      <VerdictBar
        v-if="mapStore.indexData"
        :visible="barVisible"
        :score="score"
        :level="level"
        :tone="tone"
        :place="placeName"
        @refresh="onRefresh"
      />

      <!-- 结论 -->
      <VerdictHeader @feedback="openFeedback" @analysis="openAnalysis" @conclusion-bottom="onConclusionBottom" />
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(0) }">天气</text>

        <MetricChart class="sect__card" :style="{ animationDelay: enterDelay(1) }" />
        <HourlyWeather class="sect__card" :style="{ animationDelay: enterDelay(2) }" />
        <WeekStrip class="sect__card" :style="{ animationDelay: enterDelay(3) }" />
      </view>

      <!-- 潮汐：港口和日期可切，和天气分开是因为它换的是港口不是指标 -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(0) }">潮汐</text>

        <TideCard class="sect__card" :style="{ animationDelay: enterDelay(1) }" />
      </view>

      <!-- 指数构成：九项子特征各自贡献多少 -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(0) }">指数构成</text>

        <FeatureBreakdown class="sect__card" :style="{ animationDelay: enterDelay(1) }" />
      </view>

      <!-- 天气详情：实况的逐项读数 -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(0) }">天气详情</text>

        <WeatherCard class="sect__card" :style="{ animationDelay: enterDelay(1) }" />
      </view>

      <text class="data__foot">数据来自和风天气 · 渔碌服务端</text>

      <!--
        以下浮层不占页面流。SnapSheet 是 fixed 全屏遮罩，
        在可滚动页面上同样成立（浮层固定在视口，不随内容滚走）。
      -->

      <!-- 钓鱼反馈 -->
      <FishingFeedbackForm
        :open="feedbackOpen"
        :data="mapStore.indexData"
        :location-id="locationId"
        @close="feedbackOpen = false"
      />

      <!-- AI 分析 -->
      <FishingAnalysisSheet :open="analysisOpen" @close="analysisOpen = false" />
    </view>
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
import { onPageScroll, onPageShow } from '@dcloudio/uni-app';

import FeatureBreakdown from '@/components/FeatureBreakdown/FeatureBreakdown.vue';
import FishingAnalysisSheet from '@/components/FishingAnalysisSheet/FishingAnalysisSheet.vue';
import FishingFeedbackForm from '@/components/FishingFeedbackForm/FishingFeedbackForm.vue';
import HourlyWeather from '@/components/HourlyWeather/HourlyWeather.vue';
import MetricChart from '@/components/MetricChart/MetricChart.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictBar from '@/components/VerdictBar/VerdictBar.vue';
import VerdictHeader from '@/components/VerdictHeader/VerdictHeader.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import WeekStrip from '@/components/WeekStrip/WeekStrip.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useFishingMapStore } from '@/stores/fishingMap';
import { enterDelay } from '@/utils/motion';
import { levelTone } from '@/utils/weather';

const mapStore = useFishingMapStore();

/** px。结论条的位置判断要用它，见 useNavMetrics */
const { navBarBottom } = useNavMetrics();

/** 钓鱼反馈浮层 */
const feedbackOpen = ref(false);

/** AI 分析浮层 */
const analysisOpen = ref(false);

/**
 * 反馈关联的钓点 id，取自钓点页共享过来的选中态。
 *
 * 用户在钓点页选了哪个点，切到这页提交反馈时就记到那个点头上；
 * 没选过就是 'default'（后端约定）。
 */
const locationId = computed(() => {
  const spot = mapStore.selectedMarker?.extraData;
  return spot ? String(spot.id) : 'default';
});

/* ── 常驻结论条 ──────────────────────────────────────────────────────── */

/** 当前滚动位置（px）。onPageScroll 给的 */
const scrollTop = ref(0);

/**
 * 结论卡底边在文档坐标里的 y（px）。由 VerdictHeader 量出来报给这里 ——
 * 谁拥有结论，谁就知道结论在哪儿；页面只管滚动。
 */
const conclusionBottom = ref(0);

/**
 * 结论条什么时候浮出来。
 *
 * 判据是「结论已经被结论条盖住了」：结论卡底边滚到导航栏下沿的那一帧，
 * 顶上就该出现那条窄栏接手结论。再晚一点，用户会有一段「结论没了、
 * 窄栏也没来」的空窗。
 */
const barVisible = computed(() => scrollTop.value >= conclusionBottom.value - navBarBottom);

onPageScroll((event) => {
  scrollTop.value = event.scrollTop;
});

function onConclusionBottom(bottom: number) {
  conclusionBottom.value = bottom;
}

/* ── 结论条上的那几个值 ──────────────────────────────────────────────── */

const score = computed(() => mapStore.indexData?.fishing_index ?? 0);
const level = computed(() => mapStore.indexData?.level ?? '');
const tone = computed(() => levelTone(mapStore.indexData?.level));
const placeName = computed(() => mapStore.locationName || '钓鱼地点');

function onRefresh() {
  if (mapStore.indexLoading) return;
  void mapStore.refreshIndexData();
}

/**
 * 取数。
 *
 * 定位 → 按用户坐标取钓鱼指数（天气、潮汐随 enriched 响应一起带回）。
 * 没有用户坐标时才退回默认中心（定位被拒 / 定位不可用）。
 *
 * 潮汐面板由 TideCard 自己在 onShow / 切港口日期时取，这里不重复触发 ——
 * 面板一直挂载着，若页面也去取，切一次港口就是两个请求。
 */

// onPageShow 在 tab 切回本页时也会触发，所以两个钩子都挂；
// ensureWeatherAndFishing 内部有「已有当前坐标的那份数据就复用」的守卫，
// 首帧两次调用只会真的发一次请求。
onMounted(() => {
  void mapStore.ensureWeatherAndFishing();
});
onPageShow(() => {
  void mapStore.ensureWeatherAndFishing();
});

function openFeedback() {
  feedbackOpen.value = true;
}

function openAnalysis() {
  analysisOpen.value = true;
}
</script>

<style lang="scss" scoped>
/* 页面底色 = systemGroupedBackground。App.vue 里给 page 也上了同一个色，
   这里再写一遍是为了让「内容区」和「切换瞬间露出的底色」保证同色。
   真正的底色是下面那层固定的环境色渐层。 */
.data {
  min-height: 100vh;
  background-color: $fish-grouped;
}

/*
 * 环境色底：固定在视口上，不随内容滚走。
 * 由 PageBackdrop 提供 —— 关于页用同一块底，两页切起来是连续的。
 */

/* 内容层。定位 + z-index 是为了压在环境色底之上 */
.data__content {
  position: relative;
  z-index: 1;
}

/*
 * 一个分区。
 *
 * 缩进、眉标、卡间距全部走 uni.scss 的 fish-section ——
 * 这一层的数是「页面怎么分块」的约定，不该各页各写一份。
 */
.sect {
  @include fish-section;
}

/* 落款 */
.data__foot {
  @include fish-foot;
}
</style>
