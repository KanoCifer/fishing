<template>
  <!--
    最小高度绑 windowHeight（px），不用 100vh。

    100vh 把原生 tabBar 的高度也算进去了，页面会比真正能显示的那部分
    高出约 50px —— 滚到底之后还能再拖出去一截，脚下只剩底色。
    详见 useViewport 的注释。
  -->
  <view class="data" :style="{ minHeight: windowHeight + 'px' }">
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
        <text class="sect__title" :style="enterStyle(0)">天气</text>

        <!--
          官方指数排在最前面：它是这一屏里唯一一条**别人**给的结论 ——
          和风气象台的「钓鱼指数：不宜」。我们的指数紧跟在它后面（结论头），
          两条并排看，一致时可信度更高，不一致时用户自己会追问。

          每张卡外面套一层普通 view：入场动画挂在这一层上。
          组件标签本身不吃 class 上的动画（见 docs/mp-weixin-platform.md）。
        -->
        <view class="sect__card" :style="enterStyle(0)">
          <LifeIndexCard />
        </view>
        <view class="sect__card" :style="enterStyle(1)">
          <MetricChart />
        </view>
        <view class="sect__card" :style="enterStyle(2)">
          <HourlyWeather />
        </view>
        <view class="sect__card" :style="enterStyle(3)">
          <WeekStrip />
        </view>
      </view>

      <!--
        日照与月相单独一段：它和上面的天气读数不是一回事 ——
        上面说的是「现在是什么样」，这里说的是「一天里什么时候能下水」。
        钓鱼是跟日照过不去的活，这一段给的是决定出钓时间的那几个数。
      -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0)">日照与月相</text>

        <view class="sect__card" :style="enterStyle(1)">
          <AstroCard />
        </view>
      </view>

      <!-- 潮汐：港口和日期可切，和天气分开是因为它换的是港口不是指标 -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0)">潮汐</text>

        <view class="sect__card" :style="enterStyle(1)">
          <TideCard />
        </view>
      </view>

      <!-- 指数构成：九项子特征各自贡献多少 -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0)">指数构成</text>

        <view class="sect__card" :style="enterStyle(1)">
          <FeatureBreakdown />
        </view>
      </view>

      <!-- 天气详情：实况的逐项读数 -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0)">天气详情</text>

        <view class="sect__card" :style="enterStyle(1)">
          <WeatherCard />
        </view>
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

import AstroCard from '@/components/AstroCard/AstroCard.vue';
import FeatureBreakdown from '@/components/FeatureBreakdown/FeatureBreakdown.vue';
import FishingAnalysisSheet from '@/components/FishingAnalysisSheet/FishingAnalysisSheet.vue';
import FishingFeedbackForm from '@/components/FishingFeedbackForm/FishingFeedbackForm.vue';
import HourlyWeather from '@/components/HourlyWeather/HourlyWeather.vue';
import LifeIndexCard from '@/components/LifeIndexCard/LifeIndexCard.vue';
import MetricChart from '@/components/MetricChart/MetricChart.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictBar from '@/components/VerdictBar/VerdictBar.vue';
import VerdictHeader from '@/components/VerdictHeader/VerdictHeader.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import WeekStrip from '@/components/WeekStrip/WeekStrip.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { useFishingMapStore } from '@/stores/fishingMap';
import { enterDelay } from '@/utils/motion';
import { levelTone } from '@/utils/weather';

const mapStore = useFishingMapStore();

/** px。结论条的位置判断要用它，见 useNavMetrics */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

/** 钓鱼反馈浮层 */
const feedbackOpen = ref(false);

/** AI 分析浮层 */
const analysisOpen = ref(false);

const showAnim = ref(false);

function enterStyle(index: number): Record<string, string> {
  return {
    animationDelay: enterDelay(index),
    animationName: showAnim.value ? 'fish-enter' : 'none',
  };
}

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

  showAnim.value = false;
  setTimeout(() => {
    showAnim.value = true;
  }, 50);
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
   真正的底色是下面那层固定的环境色渐层。

   最小高度不写在这里，由模板绑 windowHeight（px）—— 100vh 会把 tabBar
   的高度算进来，页面就多出一截能拖出去的范围，滚到底之后脚下只剩底色。
   详见 useViewport。 */
.data {
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
 * 缩进、眉标、卡间距全部走令牌层 _layout.scss 的 fish-section ——
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
