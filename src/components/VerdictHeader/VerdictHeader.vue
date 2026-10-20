<template>
  <!--
    结论头 —— 数据页的第一屏，也是这一页唯一的结论。

    取向：钓鱼指数是「值不值得去」的答案，天气、潮汐、风是支撑这个答案的三个成因。
    所以三者同处一屏、成因在下结论在旁，而不是拆成四张等权卡片让人自己拼。

    结论本身是一把 0–100 的刻度盘（见 FishingGauge）：单独一个「86」是
    孤零零的字，多大算好全靠读的人自己心里补一把尺；有了环，86 才有位置。
  -->
  <view class="verdict" :style="{ paddingTop: navBarBottom + 'px' }">
    <view class="verdict__top">
      <view class="verdict__place">
        <image class="verdict__icon verdict__icon--pin" :src="pinIcon" mode="widthFix" />
        <text class="verdict__place-name">{{ placeName }}</text>
        <text v-if="updatedAt" class="verdict__updated">{{ updatedAt }} 更新</text>
      </view>

      <view
        class="verdict__refresh"
        :class="{ 'verdict__refresh--busy': mapStore.indexLoading || mapStore.locating }"
        @tap="onRefresh"
      >
        <image class="verdict__icon" :src="refreshIcon" mode="widthFix" />
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="mapStore.indexLoading && !mapStore.indexData" class="verdict__body">
      <SkeletonCard />
    </view>

    <!-- 错误 -->
    <view v-else-if="mapStore.indexError && !mapStore.indexData" class="verdict__body">
      <text class="verdict__error">{{ mapStore.indexError }}</text>
    </view>

    <!-- 有数据 -->
    <template v-else-if="mapStore.indexData">
      <!--
        三段依次落位：先给结论（仪表），再给依据（三条成因），最后给动作。
        骨架屏换成实数据的这一下是最容易「闪」的地方 —— 整块内容突然出现，
        眼睛要重新找一遍。分三段递进，读的人跟着结论 → 依据 → 下一步走一遍。

        只在首次拿到数据时播一次：刷新时 indexData 还在，v-else-if 不会重新挂载，
        所以下拉/点刷新拿到新数据不会把这一屏重播一遍。

        .verdict__conclusion 里的仪表卡高度是定死的（表盘 184rpx），
        所以这一块的高度不随数据变化 —— 页面据此判断结论什么时候被滚走。
      -->
      <view class="verdict__conclusion" :style="{ animationDelay: enterDelay(0) }">
        <FishingGauge :score="score" :tone="tone" :level="level" :verdict="verdict" />
      </view>

      <!-- 三个成因。少一条就少一半说服力，所以天气/潮汐/风缺哪条都还占位 -->
      <view class="verdict__signals" :style="{ animationDelay: enterDelay(1) }">
        <view class="verdict__signal">
          <image class="verdict__icon verdict__icon--temp" :src="thermometerIcon" mode="widthFix" />
          <view class="verdict__signal-text">
            <text class="verdict__signal-value">{{ live?.temp ?? '--' }}°</text>
            <text class="verdict__signal-meta">{{ live?.text || '暂无天气' }}</text>
          </view>
        </view>

        <view class="verdict__signal">
          <image class="verdict__icon verdict__icon--tide" :src="wavesIcon" mode="widthFix" />
          <view class="verdict__signal-text">
            <text class="verdict__signal-value">{{ trendText }}</text>
            <text class="verdict__signal-meta">{{ tideMeta }}</text>
          </view>
        </view>

        <view class="verdict__signal">
          <image class="verdict__icon verdict__icon--wind" :src="windIcon" mode="widthFix" />
          <view class="verdict__signal-text">
            <text class="verdict__signal-value">{{ windText }}</text>
            <text class="verdict__signal-meta">{{ live?.windDir || '暂无风向' }}</text>
          </view>
        </view>
      </view>

      <view class="verdict__actions" :style="{ animationDelay: enterDelay(2) }">
        <!--
          AI 分析是次级动作：主按钮是「反馈今日指数」——
          反馈是这个页面的日常动作，AI 分析是偶尔才想看一眼的补充。
          所以次按钮不抢主色，排在左边。
        -->
        <view class="verdict__btn verdict__btn--secondary" @tap="emit('analysis')">
          <image class="verdict__icon verdict__icon--accent" :src="sparklesIcon" mode="widthFix" />
          <text class="verdict__btn-text">AI 分析</text>
        </view>

        <view class="verdict__btn verdict__btn--primary" @tap="emit('feedback')">
          <image class="verdict__icon verdict__icon--onaccent" :src="messageIcon" mode="widthFix" />
          <text class="verdict__btn-text verdict__btn-text--onaccent">反馈今日指数</text>
        </view>
      </view>
    </template>

    <text v-else class="verdict__empty">暂无数据</text>
  </view>
</template>

<script setup lang="ts">
/**
 * VerdictHeader —— 合并了原 FishingIndexCard 与 WeatherHero 的头部。
 *
 * 合并的理由不是「少写一个组件」，而是这两个组件各占一块地回答同一个问题
 * （今天行不行），拆开就会出现两个大字、两个标题、两套刷新入口互相打架。
 * 现在指数和三个成因在一屏里，谁是结论、谁是依据一眼分得开。
 *
 * 图标：全部走 @/constants/icons 的 data URI（scripts/gen-icons.mjs 生成）。
 * 小程序不能内联 svg，<image> 又拿不到页面 CSS，所以颜色在生成时已烤死。
 *
 * 关于顶部那段内边距：数据页配了 navigationStyle: "custom"，导航栏成了浮层，
 * 页面内容从屏幕最顶端 y=0 开始排，状态栏和胶囊按钮都压在这块背景上。
 * 这里给 padding-top 让开 navBarBottom —— 只让 statusBarHeight 不够，
 * 胶囊按钮落在导航栏那一段，右上角的刷新键会和它撞在一起。
 */
import { computed, getCurrentInstance, nextTick, watch } from 'vue';

import { useNavMetrics } from '@/composables/useNavMetrics';
import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import { toFeatureTiles } from '@/types/fishing';
import { enterDelay } from '@/utils/motion';
import { levelTone, levelVerdict, num } from '@/utils/weather';
import { parseFxTime } from '@/utils/date';
import { nextHighTide, tideTrend } from '@/utils/tide';
import { createSelectorQuery } from '@/utils/selectorQuery';

import FishingGauge from '../FishingGauge/FishingGauge.vue';
import SkeletonCard from '../SkeletonCard/SkeletonCard.vue';

const emit = defineEmits<{
  feedback: [];
  /** 打开 AI 分析面板 */
  analysis: [];
  /**
   * 结论卡底边在**文档坐标**里的 y（px）。
   *
   * 页面拿它算常驻结论条什么时候浮现：结论滚到顶部被导航栏盖住的那一刻，
   * 顶上就该浮出那条窄栏。位置由这个组件报 —— 谁拥有结论，谁就知道结论在哪儿。
   */
  'conclusion-bottom': [bottom: number];
}>();

const instance = getCurrentInstance()!;

const { navBarBottom } = useNavMetrics();

const mapStore = useFishingMapStore();

const pinIcon = icon('map-pin', 'muted');
const refreshIcon = icon('refresh-cw', 'muted');
const thermometerIcon = icon('thermometer', 'destructive');
const wavesIcon = icon('waves', 'blue');
const windIcon = icon('wind', 'blue600');
const messageIcon = icon('message-square', 'onAccent');
const sparklesIcon = icon('sparkles', 'blue600');

const tone = computed(() => levelTone(mapStore.indexData?.level));

/** 等级词。接口没给等级时先空着，别拿 undefined 去渲染 */
const level = computed(() => mapStore.indexData?.level ?? '');

/** 钓鱼指数。接口给的是 0–100 */
const score = computed(() => mapStore.indexData?.fishing_index ?? 0);

/** 一句话结论直接复用天气模块的等级映射，不在这里另写一套说法 */
const verdict = computed(() => levelVerdict(mapStore.indexData?.level));

const placeName = computed(() => mapStore.locationName || '钓鱼地点');

/** 实况观测时刻，只取时分 */
const updatedAt = computed(() => parseFxTime(mapStore.liveWeather?.obsTime ?? '')?.time ?? '');

const live = computed(() => mapStore.liveWeather);

/** 风向标签（东南风）配风速数值（km/h），缺任一就不占这个位 */
const windText = computed(() => {
  const speed = num(live.value?.windSpeed);
  return speed === null ? '--' : `${speed} km/h`;
});

const trendText = computed(() => {
  switch (tideTrend(mapStore.tideData)) {
    case 'rising':
      return '涨潮';
    case 'falling':
      return '退潮';
    case 'flat':
      return '平潮';
    default:
      return '--';
  }
});

const tideMeta = computed(() => {
  const high = nextHighTide(mapStore.tideData);
  return high ? `高潮 ${high.time}` : '暂无潮汐';
});

function onRefresh() {
  if (mapStore.indexLoading) return;
  void mapStore.refreshIndexData();
}

/**
 * 量一次结论卡的底边，报给页面。
 *
 * 为什么要等 300ms：入场动画（fish-enter）带着 16rpx 的上移，动画没走完时
 * 量到的是「还在往上飘」的位置，比终态低了 8pt。这点误差不影响判断，
 * 但等它落定再量，量到的就是稳定值 —— 页面不必去猜动画什么时候结束。
 */
function measureConclusion() {
  createSelectorQuery(instance)
    .select('.verdict__conclusion')
    .boundingClientRect()
    .selectViewport()
    // 回调不能省（类型要求必须传），但结果统一在 exec 的回调里拿，
    // 这里传个空函数即可
    .scrollOffset(() => {})
    .exec((res) => {
      const rect = res[0] as { bottom?: number } | null;
      const offset = res[1] as { scrollTop?: number } | null;
      if (!rect || typeof rect.bottom !== 'number') return;
      // 视口坐标 + 当前滚动量 = 文档坐标
      emit('conclusion-bottom', rect.bottom + (offset?.scrollTop ?? 0));
    });
}

/** 数据换了一份就重量一次：高度会随骨架屏 → 实数据、刷新而变 */
watch(
  () => mapStore.indexData,
  async () => {
    await nextTick();
    setTimeout(measureConclusion, 300);
  },
  { immediate: true },
);
</script>

<style lang="scss" scoped>
/*
 * 结论头。
 *
 * 这里没有背景色了。原来是叠了一层很淡的蓝调 wash —— 那是给纯灰底做的一层空气，
 * 现在页面底本身是环境色渐层（见 pages/data），wash 再叠上去就成了双份的蓝，
 * 顶部会偏色。层次现在由渐层 + 玻璃卡承担。
 */
.verdict {
  padding-right: 32rpx;
  padding-bottom: 32rpx;
  padding-left: 32rpx;
}

.verdict__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.verdict__place {
  display: flex;
  align-items: center;
  min-width: 0;
}

.verdict__icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

.verdict__icon--pin {
  width: 28rpx;
  height: 28rpx;
  margin-right: 10rpx;
}

.verdict__icon--temp,
.verdict__icon--tide,
.verdict__icon--wind {
  margin-right: 14rpx;
}

.verdict__icon--onaccent {
  margin-right: 10rpx;
}

.verdict__icon--accent {
  margin-right: 10rpx;
}

.verdict__place-name {
  max-width: 300rpx;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.verdict__updated {
  margin-left: 12rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* 刷新键：圆形热区，按下即反馈，不用等抬手 */
.verdict__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  flex-shrink: 0;
  border-radius: 50%;
  @include fish-press-dim;
}

/* 刷新中的转圈。用 CSS 旋转而不是图标帧图，少一张静态图 */
.verdict__refresh--busy .verdict__icon {
  animation: verdict-spin 1s linear infinite;
}

@keyframes verdict-spin {
  to {
    transform: rotate(360deg);
  }
}

.verdict__body {
  min-height: 360rpx;
}

/*
 * 结论卡。仪表自带玻璃面，这里只管它和下面两块的间距。
 *
 * 高度是定死的（表盘 184rpx + 上下内边距），不随分数变化 ——
 * 页面据此判断结论什么时候被滚走。
 */
.verdict__conclusion {
  margin-bottom: 24rpx;
  @include fish-enter;
}

/*
 * 三个成因 —— 和结论卡同一种材质的两块面。
 *
 * 卡与卡之间靠 1rpx 发丝线分隔，这条线要「几乎看不见」才不显得脏。
 * 底色是半透明白而不是纯白：它浮在环境色之上，透过来一点才读得出「一层材质」。
 */
.verdict__signals {
  display: flex;
  overflow: hidden;
  @include fish-glass;
  @include fish-enter;
}

.verdict__signal {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 24rpx 20rpx;
  border-right: 1rpx solid $fish-border-40;
}

.verdict__signal:last-child {
  border-right: none;
}

.verdict__signal-text {
  min-width: 0;
}

.verdict__signal-value {
  display: block;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.verdict__signal-meta {
  display: block;
  margin-top: 2rpx;
  overflow: hidden;
  color: $fish-muted;
  @include fish-type(caption2);

  white-space: nowrap;
  text-overflow: ellipsis;
}

.verdict__actions {
  display: flex;
  margin-top: 28rpx;
  @include fish-enter;
}

/*
 * 按钮。
 *
 * 88rpx = 44pt，正好是 Apple 判定为「可放心点按」的最小命中尺寸。
 * 反馈在手指落下的那一帧就给出（fish-press），抬手回弹用满 260ms ——
 * 两段时长一短一长，是 iOS 按压手感的关键，缺一段立刻变塑料。
 */
.verdict__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 20rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
  @include fish-press(0.97);
}

/* 主按钮用品牌渐变：一个方向上的三个色标读作同一种品牌色的切面 */
.verdict__btn--primary {
  flex: 1;
  background-image: $fish-gradient;
  box-shadow: $smooth-shadow-sm;
}

/*
 * 次按钮（AI 分析）。
 *
 * 宽度按内容走，不参与 flex 分配 —— 主按钮吃掉剩下的空间。
 * 不抢主色：这一屏的主动作是反馈，AI 分析是偶尔才想看一眼的补充。
 */
.verdict__btn--secondary {
  flex-shrink: 0;
  margin-right: 16rpx;
  padding: 0 32rpx;
}

.verdict__btn-text {
  color: $fish-ink;
  @include fish-type(callout);
}

.verdict__btn-text--onaccent {
  color: #ffffff;
  font-weight: 600;
}

.verdict__error {
  color: $fish-destructive;
  @include fish-type(callout);
}

.verdict__empty {
  color: $fish-muted;
  @include fish-type(callout);
}
</style>
