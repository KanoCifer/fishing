<template>
  <view class="tide-card">
    <!--
      标题行。右边是「站名 · 今日」加一个箭头 —— 这是这张卡唯一的出口，
      详情在潮汐详情页里。

      为什么不做成整卡可点：卡里的曲线是可以拖着看的，
      整卡可点会把「看某个时刻的潮高」和「进详情页」搅成同一个手势。
    -->
    <view class="tide-card__head">
      <text class="tide-card__title">潮汐预报</text>

      <view class="tide-card__entry" @tap="openDetail">
        <text class="tide-card__entry-text">{{ entryText }}</text>
        <image class="tide-card__entry-icon" :src="chevronIcon" mode="aspectFit" />
      </view>
    </view>

    <!--
      画布挂在卡片上、跟着卡片一起活着，不跟着 loading 分支销毁重建。

      切页面时 tideLoading 翻转会整段换掉 body，图表组件被销毁、
      数据回来时重新挂载 —— 新实例走的是「首次出图」那条路，直接出最终态，
      切数据就没有动画了。节点保持存活，数据变化才会走到组件内部的
      watch，那里才有入场动画。显隐用 v-show，不影响实例。

      tideHourly 可能为空数组（后端当日无数据），这时给空态文案而不是空白画布。
    -->
    <view class="tide-card__body">
      <view v-show="hasHourly" class="tide-card__chart">
        <TideChart :points="chartPoints" :labels="chartLabels" :now-index="nowIndex" />
      </view>

      <!-- 骨架屏只在首屏还没数据时出现：已有数据时留着旧曲线 -->
      <SkeletonCard v-if="loading && !hasHourly" has-chart />

      <text v-else-if="!hasHourly" class="tide-card__empty">暂无潮汐数据</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * TideCard —— 首页的潮汐卡。
 *
 * 只说一件事：**此刻这片水的潮汐**。
 * 曲线留着（钓鱼看的就是走势），高低潮明细与时刻表挪去了潮汐详情页，
 * 港口与日期的选择也搬走了 —— 首页只显示今日。
 *
 * 与源版本的差异：
 * - TideChart 从 ECharts 换成手写 Canvas 2d（见 TideChart 组件头注释）
 * - 港口 / 日期选择器整个搬去潮汐详情页
 */
import { computed, onMounted, watch } from 'vue';

import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import { fxHourKey, localHourKey, parseFxTime } from '@/utils/date';

import SkeletonCard from '../SkeletonCard/SkeletonCard.vue';
import TideChart from '../TideChart/TideChart.vue';

const mapStore = useFishingMapStore();

/** 详情页入口 */
const DETAIL_URL = '/pages/tide/index';

const chevronIcon = icon('chevron-right', 'muted60');

const hourly = computed(() => mapStore.homeTideData?.tideHourly ?? []);

/** 至少要有一条数值可用的逐时记录才画曲线 */
const hasHourly = computed(() => hourly.value.length > 0);

const chartPoints = computed(() => hourly.value);

const chartLabels = computed(() => hourly.value.map((point) => parseFxTime(point.fxTime)?.time ?? ''));

/**
 * 当前时刻落在逐时序列里的下标，画「现在」竖线用。
 *
 * 比对的是小时键（`2026-10-17T14`），不 new Date()：
 * 后端 fxTime 自带 +08:00，转成 Date 会按设备时区重解释，
 * 开发者工具和真机时区不一致时整条标线会偏几小时，且只在真机复现。
 *
 * 逐时数据是整点（`...T14:00`），当前时刻是整点内（比如 14:23），
 * 所以按小时对齐，不去比分钟。
 */
const nowIndex = computed(() => {
  const stamp = localHourKey();
  return hourly.value.findIndex((point) => fxHourKey(point.fxTime) === stamp);
});

/** 站名 + 日期。取不到站名时先不写站名，别让卡片顶着一个空标签 */
const entryText = computed(() => {
  const spot = mapStore.homeTideSpotName || mapStore.tideStation?.name || '';
  return spot ? `${spot} · 今日` : '今日';
});

const loading = computed(() => (mapStore.indexLoading || mapStore.homeTideLoading) && !hasHourly.value);

function openDetail(): void {
  uni.navigateTo({ url: DETAIL_URL });
}

/**
 * 首页潮汐取数。
 *
 * 近站点那一份是 enriched 顺带回来的，零额外请求；没有近站点时
 * store 才去取固定港口的今日潮汐（见 ensureHomeTide）。
 *
 * 近站点是 enriched 响应回来才有的，所以要盯着它 —— 晚到的那一次
 * 才能把卡片从「没有潮汐」换成「这片水的潮汐」。
 */
function ensureTide(): void {
  void mapStore.ensureHomeTide();
}

onMounted(ensureTide);

watch(() => [mapStore.tideData, mapStore.tideStation, mapStore.nearestStationResolved], ensureTide);
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.tide-card {
  @include fish-card;
}

/*
 * 标题行。左边标题、右边入口，两端对齐到基线。
 *
 * 入口那一块撑到 88rpx 高（44pt 的可点按热区）：它字小，
 * 按热区不跟着缩，否则点不准。
 */
.tide-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.tide-card__title {
  @include fish-card-title;
}

.tide-card__entry {
  display: flex;
  align-items: center;
  padding-top: 16rpx;
  padding-bottom: 16rpx;
  margin-top: -16rpx;
  @include fish-press-dim;
}

.tide-card__entry-text {
  color: $fish-muted;
  @include fish-type(caption);
}

.tide-card__entry-icon {
  width: 24rpx;
  height: 24rpx;
  margin-left: 6rpx;
  opacity: 0.8;
}

.tide-card__body {
  min-height: 420rpx;
}

.tide-card__chart {
  padding: 8rpx 0 24rpx;
}

.tide-card__empty {
  color: $fish-muted;
  @include fish-type(body);
}
</style>
