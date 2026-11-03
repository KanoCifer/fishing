<template>
  <view class="data" :style="{ minHeight: windowHeight + 'px', paddingBottom: '180rpx' }">
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

      <WeatherHero :show-anim="showAnim" @breakdown="openBreakdown" @pick-place="onPickPlace" />

      <view class="data__actions">
        <VerdictActions :show-anim="showAnim" @feedback="openFeedback" @analysis="openAnalysis" />
      </view>

      <view class="sect">
        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <Next24Hours />
        </view>
        <view class="sect__card" :style="enterStyle(2, showAnim)">
          <MinutelyRain />
        </view>
        <view class="sect__card" :style="enterStyle(3, showAnim)">
          <DayForecast />
        </view>
      </view>

      <view class="sect">
        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <AstroCard />
        </view>
        <view class="sect__card" :style="enterStyle(2, showAnim)">
          <TideCard />
        </view>
      </view>

      <view class="sect">
        <view class="sect__card" :style="enterStyle(1, showAnim)">
          <WeatherCard />
        </view>
      </view>

      <text class="data__foot">数据来自和风天气 · 渔碌服务端</text>

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
import DayForecast from '@/components/DayForecast/DayForecast.vue';
import FeatureBreakdownSheet from '@/components/FeatureBreakdownSheet/FeatureBreakdownSheet.vue';
import FishingAnalysisSheet from '@/components/FishingAnalysisSheet/FishingAnalysisSheet.vue';
import MinutelyRain from '@/components/MinutelyRain/MinutelyRain.vue';
import Next24Hours from '@/components/Next24Hours/Next24Hours.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictActions from '@/components/VerdictActions/VerdictActions.vue';
import VerdictBar from '@/components/VerdictBar/VerdictBar.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import WeatherHero from '@/components/WeatherHero/WeatherHero.vue';
import { SHARE_CARDS } from '@/constants/share';
import { HERO_PICK_FAILED } from '@/constants/weatherHero';
import { useNavMetrics } from '@/composables/useNavMetrics';
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
 * 地点标签上的箭头：换一个地方看。
 *
 * 调微信自带的选点地图 —— 用户在自己认得的地方点一下，
 * 比我们再画一张地图选得准。
 */
function onPickPlace() {
  uni.chooseLocation({
    success: (res) => {
      // 经度在前：location 要的是 [lng, lat]，写反了不会报错，
      // 只会落到地球另一侧
      void mapStore.pickManualLocation([res.longitude, res.latitude]);
    },
    fail: (err) => {
      // 用户主动取消是正常操作，不该弹一个「失败」把气氛搞砸
      const message = String(err?.errMsg ?? '');
      if (message.includes('cancel')) return;
      uni.showToast({ title: HERO_PICK_FAILED, icon: 'none' });
    },
  });
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

/* 头图下面的动作行。左右留白跟分区对齐，它才落在同一套竖线上 */
.data__actions {
  padding-right: 32rpx;
  padding-left: 32rpx;
  margin-top: -20rpx;
}

/* 落款 */
.data__foot {
  @include fish-foot;
}
</style>
