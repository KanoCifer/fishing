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

      <VerdictOverview
        :show-anim="showAnim"
        @feedback="openFeedback"
        @analysis="openAnalysis"
        @breakdown="openBreakdown"
      />
      <!--
        指数：官方对「今天能不能钓」的判断，紧跟结论放在一处。

        本站指数的构成（九项子特征各占多少）不在这里 —— 它点首屏那个分数
        才出（见 FeatureBreakdownSheet）。构成是一份「为什么」的说明，
        摊在页面上会跟结论抢位置；而结论给的是分，构成回答的是
        「为什么是这个分」，这两件事本来就隔着一屏远。

        官方指数留在页面上：它跟结论是同一件事的两个来源，
        不一致的时候用户一眼就看得出差别（两个信号打架恰恰是
        用户最该知道的时刻）。

        这一组不配眉标：这张卡的标题自己就说清了是什么，
        眉标在这里只是把「指数」两个字再说一遍。
      -->
      <view class="sect">
        <view class="sect__card" :style="enterStyle(0, showAnim)">
          <LifeIndexCard />
        </view>
      </view>

      <!--
        天气：现在什么样，接下来怎么走。

        当前天气与多日预报并排，各占一半宽 —— 两张方卡，一屏里一眼看到
        「现在」和「接下来三天」。

        分钟降水放在这一组的**最上面**：它回答的是最要紧的那件事
        （接下来两小时雨什么时候到、什么时候停），而当前天气与多日预报
        给的是背景 —— 背景不该排在结论前面。

        动画挂在外面这个普通 view 上：自定义组件的**宿主节点**不吃动画
        （见 docs/mp-weixin-platform.md）。

        逐时预报在前、指标曲线在后：前者往右滑着扫一眼就够，
        后者要挑指标、要点曲线 —— 这一组里唯一要动手的，动手的东西放最后。
      -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">天气</text>

        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <MinutelyRain />
        </view>
        <view class="sect__row" :style="enterStyle(2, showAnim)">
          <CurrentWeather class="sect__half" />
          <DayForecast class="sect__half" />
        </view>
        <view class="sect__card" :style="enterStyle(3, showAnim)">
          <HourlyWeather />
        </view>
        <view class="sect__card" :style="enterStyle(4, showAnim)">
          <MetricChart />
        </view>
      </view>

      <!--
        出钓时机：一天里什么时候能下水、什么时候能收竿。

        日照与月相说的是天什么时候亮、什么时候暗，潮汐说的是水什么时候动 ——
        两张卡回答的是同一个问题，所以放在同一组：钓鱼是跟日照过不去的活，
        这一组给的是决定出钓时间的那几个数。

        眉标留着：两张卡的标题是各自的题目（日照与月相 / 潮汐预报），
        「出钓时机」说的是这两张卡合起来回答什么 —— 卡片标题替不了这一层。
      -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">出钓时机</text>

        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <AstroCard />
        </view>
        <view class="sect__card" :style="enterStyle(2, showAnim)">
          <TideCard />
        </view>
      </view>

      <!--
        实测读数：实况的逐项读数。

        这一组只有一张卡，而且卡片自己不带标题 —— 组名得留着，
        否则这一段就成了没有名字的一段。
      -->
      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">实测读数</text>

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

      <!-- 钓鱼指数构成 -->
      <FeatureBreakdownSheet :open="breakdownOpen" @close="breakdownOpen = false" />
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
import FeatureBreakdownSheet from '@/components/FeatureBreakdownSheet/FeatureBreakdownSheet.vue';
import FishingAnalysisSheet from '@/components/FishingAnalysisSheet/FishingAnalysisSheet.vue';
import FishingFeedbackForm from '@/components/FishingFeedbackForm/FishingFeedbackForm.vue';
import HourlyWeather from '@/components/HourlyWeather/HourlyWeather.vue';
import LifeIndexCard from '@/components/LifeIndexCard/LifeIndexCard.vue';
import MetricChart from '@/components/MetricChart/MetricChart.vue';
import MinutelyRain from '@/components/MinutelyRain/MinutelyRain.vue';
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
const breakdownOpen = ref(false);
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
 *
 * 分钟降水单独一路：它打的是另一个端点，上游只覆盖中国区域，
 * 失败只坏那一张卡，不会把整页天气拖下水。
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
  void mapStore.ensureMinutely();
});
onPageShow(() => {
  void mapStore.ensureWeatherAndFishing();
  void mapStore.ensureMinutely();

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

function openBreakdown() {
  breakdownOpen.value = true;
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
