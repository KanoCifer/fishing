<template>
  <view class="data" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />
    <WeatherBackdrop />

    <view class="data__content">
      <VerdictBar
        v-if="conditionsStore.indexData"
        class="on-photo"
        :visible="barVisible"
        :score="score"
        :level="level"
        :tone="tone"
        :place="placeName"
        :busy="conditionsStore.indexLoading || locationStore.locating"
        @refresh="onRefresh"
        @analysis="openAnalysis"
      />

      <WeatherHero
        :show-anim="showAnim"
        @breakdown="openBreakdown"
        @pick-place="onPickPlace"
        @analysis="openAnalysis"
      />

      <!--
        天气页的卡片不做入场落位。

        令牌层 .sect__card 上那条 fish-enter 是 opacity 动画，而 opacity 动画
        会让祖先成为 backdrop root —— 后代的 backdrop-filter 只能采样它内部的
        背景。天气页整页是照片，照片在卡片祖先外面，底断了就糊不了。
        覆盖写在下面的样式里，理由同那里。
      -->
      <view class="sect sect__first on-photo">
        <view class="sect__card">
          <Next24Hours />
        </view>
        <view class="sect__card">
          <MinutelyRain />
        </view>
        <view class="sect__card">
          <DayForecast />
        </view>
      </view>

      <view class="sect on-photo">
        <view class="sect__card">
          <AstroCard />
        </view>
        <view class="sect__card">
          <TideCard />
        </view>
      </view>

      <view class="sect on-photo">
        <view class="sect__card">
          <WeatherCard />
        </view>
      </view>

      <text class="data__foot on-photo">数据来自和风天气 · 渔碌服务端</text>

      <!-- AI 建议 -->
      <FishingAnalysisSheet :open="analysisOpen" @close="analysisOpen = false" />

      <!-- 鱼口概率构成 -->
      <FeatureBreakdownSheet :open="breakdownOpen" @close="breakdownOpen = false" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPageScroll, onShow, onReady, onShareAppMessage, onPullDownRefresh } from '@dcloudio/uni-app';

import AstroCard from '@/components/AstroCard/AstroCard.vue';
import DayForecast from '@/components/DayForecast/DayForecast.vue';
import FeatureBreakdownSheet from '@/components/FeatureBreakdownSheet/FeatureBreakdownSheet.vue';
import FishingAnalysisSheet from '@/components/FishingAnalysisSheet/FishingAnalysisSheet.vue';
import MinutelyRain from '@/components/MinutelyRain/MinutelyRain.vue';
import Next24Hours from '@/components/Next24Hours/Next24Hours.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import TideCard from '@/components/TideCard/TideCard.vue';
import VerdictBar from '@/components/VerdictBar/VerdictBar.vue';
import WeatherBackdrop from '@/components/WeatherBackdrop/WeatherBackdrop.vue';
import WeatherCard from '@/components/WeatherCard/WeatherCard.vue';
import WeatherHero from '@/components/WeatherHero/WeatherHero.vue';
import { SHARE_CARDS } from '@/constants/share';
import { HERO_PICK_FAILED } from '@/constants/weatherHero';
import { provideSurface } from '@/composables/useSurface';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { useConditionsStore } from '@/stores/conditions';
import { useLocationStore } from '@/stores/location';
import { useSessionStore } from '@/stores/session';
import { enableShareMenu } from '@/utils/share';
import { showToast } from '@/utils/toast';
import { levelTone } from '@/utils/weather';

const conditionsStore = useConditionsStore();
const locationStore = useLocationStore();
const session = useSessionStore();
const { navBarBottom } = useNavMetrics();
const { windowHeight } = useViewport();
/**
 * 这一页整页是一层天色，卡片浮在上面 —— 这一块走「照片面」那一套令牌。
 *
 * 照片面有**两半**，缺一不可：
 *   · CSS —— 模板里给这几块挂 .on-photo，那一组令牌（深玻璃 + 白字）整体翻过去；
 *   · JS  —— 这里 provideSurface('photo')，图标与 canvas 色板知道自己压在照片上。
 *
 * 少写一半的后果很具体：只有 CSS 那一半，图标是烤进 data URI 的深墨，
 * 糊进照片里；只有 JS 那一半，卡上的字是浅色档的深色，压在深玻璃上读不出来。
 */
provideSurface('photo');

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

const score = computed(() => conditionsStore.indexData?.fishing_index ?? 0);
const level = computed(() => conditionsStore.indexData?.level ?? '');
const tone = computed(() => levelTone(conditionsStore.indexData?.level));
const placeName = computed(() => conditionsStore.locationName || '钓鱼地点');

function onRefresh() {
  if (conditionsStore.indexLoading) return;
  void conditionsStore.refreshIndexData();
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
      void conditionsStore.pickManualLocation([res.longitude, res.latitude]);
    },
    fail: (err) => {
      // 用户主动取消是正常操作，不该弹一个「失败」把气氛搞砸
      const message = String(err?.errMsg ?? '');
      if (message.includes('cancel')) return;
      showToast(HERO_PICK_FAILED);
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
 * 首屏这一轮取数交给 onReady（见下），切回本页交给 onShow。
 *
 * 两个钩子都挂着：onShow 在冷启动时也会触发一次，而那一次落在启动阶段内，
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
    void conditionsStore.ensureWeatherAndFishing();
    void conditionsStore.ensureMinutely();

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

onPullDownRefresh(() => {
  onRefresh();
  setTimeout(() => uni.stopPullDownRefresh(), 1000);
});

/**
 * 切回本页时取数。
 *
 * 首屏那一次不在这里取 —— 见上面的 ready 说明。
 */
onShow(() => {
  showAnim.value = false;
  setTimeout(() => {
    showAnim.value = true;
  }, 50);

  if (!ready) return;
  void conditionsStore.ensureWeatherAndFishing();
  void conditionsStore.ensureMinutely();
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

.sect.sect__first {
  margin-top: -28rpx;
}

.data__content {
  position: relative;
  z-index: 1;

  /* 底栏是 fixed 通栏，浮在内容之上 —— 最后一屏要自己让开 */
  @include fish-tabbar-inset;
}

.sect {
  @include fish-section;
}

/*
 * 天气页的卡片没有入场动画。
 *
 * .sect__card 上那条 fish-enter（令牌层 _layout.scss）是 opacity 0 → 1。
 * CSS 有一条 backdrop-root 规则：祖先上只要有一个在生效的 opacity 动画，
 * 它就成了 backdrop root —— 后代的 backdrop-filter 只能采样它**内部**的背景。
 *
 * 天气页整页是照片，照片在卡片祖先**外面**，祖先内部是空的 ——
 * 卡片那层玻璃从一开始就没有底可糊，糊的是一片空。
 * 动画跑完、opacity 停在 1，那个效果节点还在，背板依旧断着。
 *
 * 所以这里把动画整个按回去：opacity 与 transform 都落终态。
 * 多写一层 .data 是为了压过令牌层展开出来的那条（同为 scoped 时靠特异性取胜）。
 */
.data .sect .sect__card {
  opacity: 1;
  transform: none;
  animation: none;
}

/* 落款 */
.data__foot {
  @include fish-foot;
}
</style>
