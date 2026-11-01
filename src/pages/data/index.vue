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
        :busy="mapStore.indexLoading || mapStore.locating"
        @refresh="onRefresh"
      />

      <WeatherHero :show-anim="showAnim" @breakdown="openBreakdown" />

      <VerdictOverview :show-anim="showAnim" @feedback="openFeedback" @analysis="openAnalysis" />

      <view class="sect">
        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <MinutelyRain />
        </view>
        <view class="sect__card" :style="enterStyle(2, showAnim)">
          <CurrentWeather />
        </view>
        <view class="sect__card" :style="enterStyle(3, showAnim)">
          <DayForecast />
        </view>
        <view class="sect__card" :style="enterStyle(4, showAnim)">
          <Next24Hours />
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

      <view class="sect">
        <text class="sect__title" :style="enterStyle(0, showAnim)">其他数据</text>

        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <WeatherCard />
        </view>
      </view>

      <text class="data__foot">数据来自和风天气 · 渔碌服务端</text>

      <!--
        以下浮层不占页面流。SnapSheet 是 fixed 全屏遮罩，
        在可滚动页面上同样成立（浮层固定在视口，不随内容滚走）。
      -->

      <!-- AI 建议 -->
      <FishingAnalysisSheet :open="analysisOpen" @close="analysisOpen = false" />

      <!-- 鱼口概率构成 -->
      <FeatureBreakdownSheet :open="breakdownOpen" @close="breakdownOpen = false" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 数据页 —— tabBar 的第一个页签，也是冷启动落点。
 *
 * 页面滚动直接用页面级滚动（内容超过窗口自动滚），不套 scroll-view：
 * scroll-view 必须给确定高度，而这里内容高度随接口返回的条数变化，
 * 给死高度要么留白要么裁切。
 */
import { computed, ref } from 'vue';
import { onLoad, onPageScroll, onPageShow, onReady, onShareAppMessage } from '@dcloudio/uni-app';

import AstroCard from '@/components/AstroCard/AstroCard.vue';
import CurrentWeather from '@/components/CurrentWeather/CurrentWeather.vue';
import DayForecast from '@/components/DayForecast/DayForecast.vue';
import FeatureBreakdownSheet from '@/components/FeatureBreakdownSheet/FeatureBreakdownSheet.vue';
import FishingAnalysisSheet from '@/components/FishingAnalysisSheet/FishingAnalysisSheet.vue';
import LifeIndexCard from '@/components/LifeIndexCard/LifeIndexCard.vue';
import MinutelyRain from '@/components/MinutelyRain/MinutelyRain.vue';
import Next24Hours from '@/components/Next24Hours/Next24Hours.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictBar from '@/components/VerdictBar/VerdictBar.vue';
import VerdictOverview from '@/components/VerdictOverview/VerdictOverview.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import WeatherHero from '@/components/WeatherHero/WeatherHero.vue';
import { SHARE_CARDS } from '@/constants/share';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { loadQweatherIconFont } from '@/composables/useQweatherFont';
import { useViewport } from '@/composables/useViewport';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import { enterStyle } from '@/utils/motion';
import { enableShareMenu } from '@/utils/share';
import { levelTone } from '@/utils/weather';

const mapStore = useFishingMapStore();
const session = useSessionStore();
const { navBarBottom } = useNavMetrics();
const { windowHeight } = useViewport();
const analysisOpen = ref(false);
const breakdownOpen = ref(false);
const showAnim = ref(false);

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
 * 定位 → 按用户坐标取鱼口概率（天气、潮汐随 enriched 响应一起带回）。
 * 没有用户坐标时才退回默认中心（定位被拒 / 定位不可用）。
 *
 * 潮汐面板由 TideCard 自己在 onShow / 切港口日期时取，这里不重复触发 ——
 * 面板一直挂载着，若页面也去取，切一次港口就是两个请求。
 *
 * 分钟降水单独一路：它打的是另一个端点，上游只覆盖中国区域，
 * 失败只坏那一张卡，不会把整页天气拖下水。
 */

/**
 * 首屏这一轮取数交给 onReady（见下），切回本页交给 onPageShow。
 *
 * 两个钩子都挂着：onPageShow 在冷启动时也会触发一次，而那一次落在启动阶段内，
 * 不能在那里发请求（见下）。onShow 在 onReady 之前，所以首屏那一次 ready 是 false。
 */
let ready = false;

/**
 * **为什么放在 onReady 而不是 onMounted**：这一页是冷启动落点，
 * 而 enriched 那条是全应用最重的请求（实测 TTFB 180~390 ms，响应 22 KB）——
 * 在启动阶段（App.onLaunch ~ 首页首屏渲染完成）发出去，
 * 微信体检就会记一条「小程序启动时存在耗时较长的请求」。
 * onReady 是「页面初次渲染完成」，之后再让开一个宏任务，
 * 请求就确定落在启动阶段之外了。详见 docs/mp-weixin-network.md。
 */
onReady(() => {
  ready = true;

  setTimeout(() => {
    /*
     * 图标字体也在这里拉，不在 App.onLaunch，也不在 onMounted。
     *
     * 字体本体 73 KB，走网络。放启动阶段就是一条冷启动长请求；
     * 而消费它的三张卡都在这一页 —— 谁要用，谁负责把字体拉来。
     * 组件侧有 `v-if="qweatherFontReady"` 兜底，字体晚到只是图标晚出现，不会出豆腐块。
     */
    void loadQweatherIconFont();

    void mapStore.ensureWeatherAndFishing();
    void mapStore.ensureMinutely();

    /*
     * 恢复会话。
     *
     * 首页上的「渔碌建议」要带 token：SSE 那条不走 withSession，
     * access token 过期了不会静默刷新 —— 只有 restore() 里的 /me 才会触发刷新。
     * 冷启动后登录态是空的，不恢复就带不上 token。
     *
     * 跟取数放在同一个宏任务里：这一页是启动落点，启动阶段不能有请求。
     * 没登录不会白发请求 —— restore() 读到本地没有 token 就直接返回。
     */
    void session.restore();
  }, 0);
});

/**
 * 切回本页时取数。
 *
 * 首屏那一次不在这里取 —— 见上面的 ready 说明。
 */
onPageShow(() => {
  showAnim.value = false;
  setTimeout(() => {
    showAnim.value = true;
  }, 50);

  if (!ready) return;
  void mapStore.ensureWeatherAndFishing();
  void mapStore.ensureMinutely();
});

/**
 * 转发这一页。
 *
 * 标题与封面在 @/constants/share（唯一出处），这里只把它交出去。
 *
 * 标题里不写读数：收的人点进来看到的是**他自己所在地的**读数，
 * 标题替一个他没法验证的数字报账，说不对。理由见 constants/share 的说明。
 */
onShareAppMessage(() => ({
  title: SHARE_CARDS.data.title,
  path: SHARE_CARDS.data.path,
  imageUrl: SHARE_CARDS.data.cover,
}));

/**
 * 打开胶囊菜单里的「转发」。
 *
 * 放在 onLoad 而不是 onShow：tab 页的 onLoad 只触发一次（页面实例一直在），
 * 而菜单项是页面级的设置，设一次就够。
 */
onLoad(() => {
  enableShareMenu();
});

/**
 * 去反馈鱼口。
 *
 * 走独立页而不是浮层：反馈与记录已经合成一张表单了 ——
 * 登录时一次提交两样东西（记录 + 鱼口反馈），未登录时只剩反馈那一半。
 * 浮层装不下这张表单。
 */
function openFeedback() {
  uni.navigateTo({ url: '/pages/record/create/index' });
}

function openAnalysis() {
  analysisOpen.value = true;
}

function openBreakdown() {
  breakdownOpen.value = true;
}
</script>

<style lang="scss" scoped>
.data {
  background-color: $fish-grouped;
}

.data__content {
  position: relative;
  z-index: 1;
}

.sect {
  @include fish-section;
}

/* 落款 */
.data__foot {
  @include fish-foot;
}
</style>
