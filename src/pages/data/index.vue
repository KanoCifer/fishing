<template>
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

      <VerdictOverview :show-anim="showAnim" @feedback="openFeedback" @analysis="openAnalysis" />
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">天气</text>

        <!--
          当前天气与多日预报并排，各占一半宽 —— 两张方卡，一屏里一眼看到
          「现在」和「接下来三天」。

          两张卡都在同一个 view 里做入场动画：自定义组件的**宿主节点**
          不吃动画（见 docs/mp-weixin-platform.md），动画挂在外层这个普通 view 上。
        -->
        <view class="sect__row" :style="enterStyle(0, showAnim)">
          <view class="sect__half">
            <CurrentWeather />
          </view>
          <view class="sect__half">
            <DayForecast />
          </view>
        </view>
        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <LifeIndexCard />
        </view>
        <view class="sect__card" :style="enterStyle(2, showAnim)">
          <MetricChart />
        </view>
        <view class="sect__card" :style="enterStyle(3, showAnim)">
          <HourlyWeather />
        </view>
      </view>

      <!--
        日照与月相单独一段：它和上面的天气读数不是一回事 ——
        上面说的是「现在是什么样」，这里说的是「一天里什么时候能下水」。
        钓鱼是跟日照过不去的活，这一段给的是决定出钓时间的那几个数。
      -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">日照与月相</text>

        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <AstroCard />
        </view>
      </view>

      <!-- 潮汐：港口和日期可切，和天气分开是因为它换的是港口不是指标 -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">潮汐</text>

        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <TideCard />
        </view>
      </view>

      <!-- 指数构成：九项子特征各自贡献多少 -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">指数构成</text>

        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <FeatureBreakdown />
        </view>
      </view>

      <!-- 天气详情：实况的逐项读数 -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">天气详情</text>

        <view class="sect__card" :style="enterStyle(1, showAnim)">
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

      <!-- AI 建议 -->
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
import CurrentWeather from '@/components/CurrentWeather/CurrentWeather.vue';
import DayForecast from '@/components/DayForecast/DayForecast.vue';
import FeatureBreakdown from '@/components/FeatureBreakdown/FeatureBreakdown.vue';
import FishingAnalysisSheet from '@/components/FishingAnalysisSheet/FishingAnalysisSheet.vue';
import FishingFeedbackForm from '@/components/FishingFeedbackForm/FishingFeedbackForm.vue';
import HourlyWeather from '@/components/HourlyWeather/HourlyWeather.vue';
import LifeIndexCard from '@/components/LifeIndexCard/LifeIndexCard.vue';
import MetricChart from '@/components/MetricChart/MetricChart.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictBar from '@/components/VerdictBar/VerdictBar.vue';
import VerdictOverview from '@/components/VerdictOverview/VerdictOverview.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { loadQweatherIconFont } from '@/composables/useQweatherFont';
import { useViewport } from '@/composables/useViewport';
import { useFishingMapStore } from '@/stores/fishingMap';
import { enterStyle } from '@/utils/motion';
import { levelTone } from '@/utils/weather';

const mapStore = useFishingMapStore();
const { navBarBottom } = useNavMetrics();
const { windowHeight } = useViewport();
const feedbackOpen = ref(false);
const analysisOpen = ref(false);
const showAnim = ref(false);

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

const barVisible = computed(() => scrollTop.value >= navBarBottom);

onPageScroll((event) => {
  scrollTop.value = event.scrollTop;
});
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
  /*
   * 图标字体在这里加载，不在 App.onLaunch。
   *
   * 字体本体 73 KB，走网络。放 onLaunch 就是一条冷启动阶段的长请求；
   * 而消费它的三张卡都在这一页 —— 谁要用，谁负责把字体拉来。
   * 组件侧有 `v-if="qweatherFontReady"` 兜底，字体晚到只是图标晚出现，不会出豆腐块。
   */
  void loadQweatherIconFont();

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
