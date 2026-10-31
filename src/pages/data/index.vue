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

        本站鱼口概率的构成（九项子特征各占多少）不在这里 —— 它点首屏那个分数
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
import HourlyWeather from '@/components/HourlyWeather/HourlyWeather.vue';
import LifeIndexCard from '@/components/LifeIndexCard/LifeIndexCard.vue';
import MetricChart from '@/components/MetricChart/MetricChart.vue';
import MinutelyRain from '@/components/MinutelyRain/MinutelyRain.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictBar from '@/components/VerdictBar/VerdictBar.vue';
import VerdictOverview from '@/components/VerdictOverview/VerdictOverview.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
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
