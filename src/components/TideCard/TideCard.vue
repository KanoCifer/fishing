<template>
  <view class="tide-card">
    <view class="tide-card__header">
      <text class="tide-card__title">潮汐预报</text>
    </view>

    <!-- 港口切换 -->
    <scroll-view class="tide-card__segmented" scroll-x :show-scrollbar="false">
      <view class="tide-card__segmented-track">
        <view
          v-for="opt in HARBOR_OPTIONS"
          :key="opt.code"
          class="tide-card__segment"
          :class="{ 'tide-card__segment--active': state.selectedHarbor === opt.code }"
          @tap="setSelectedHarbor(opt.code)"
        >
          <text
            class="tide-card__segment-text"
            :class="{ 'tide-card__segment-text--active': state.selectedHarbor === opt.code }"
          >
            {{ opt.name }}
          </text>
        </view>
      </view>
    </scroll-view>

    <!-- 日期选择：今日起 8 天 -->
    <scroll-view class="tide-card__dates" scroll-x :show-scrollbar="false">
      <view class="tide-card__dates-track">
        <view
          v-for="opt in dateOptions"
          :key="opt.value"
          class="tide-card__chip"
          :class="{ 'tide-card__chip--active': state.selectedDate === opt.value }"
          @tap="setSelectedDate(opt.value)"
        >
          <text
            class="tide-card__chip-text"
            :class="{ 'tide-card__chip-text--active': state.selectedDate === opt.value }"
          >
            {{ opt.label }} {{ opt.weekday }}
          </text>
        </view>
      </view>
    </scroll-view>

    <!--
      画布挂在卡片上、跟着卡片一起活着，不跟着 loading 分支销毁重建。

      切港口/日期时 tideLoading 翻转会整段换掉 body，图表组件被销毁、
      数据回来时重新挂载 —— 新实例走的是「首次出图」那条路，直接出最终态，
      切数据就没有动画了。节点保持存活，数据变化才会走到组件内部的
      watch，那里才有入场动画。显隐用 v-show，不影响实例。

      tideHourly 可能为空数组（后端当日无数据），这时给空态文案而不是空白画布。
    -->
    <view class="tide-card__body">
      <view v-show="hasHourly" class="tide-card__chart">
        <TideChart :points="chartPoints" :labels="chartLabels" :now-index="nowIndex" />
      </view>

      <!-- 骨架屏只在首屏还没数据时出现：已有数据时留着旧曲线，
           切港口/日期不会先白一下再画 -->
      <SkeletonCard v-if="state.tideLoading && !hasHourly" has-chart has-bottom-row />

      <!-- 高潮 / 低潮 -->
      <view v-if="hasHourly" class="tide-card__peaks">
        <view class="tide-card__peak">
          <view class="tide-card__peak-head">
            <text class="tide-card__peak-label">最高潮</text>
            <text class="tide-card__peak-time">{{ highTide?.time ?? '--' }}</text>
          </view>
          <text class="tide-card__peak-height">{{ highTide?.height ?? '--' }} m</text>
        </view>
        <view class="tide-card__peak">
          <view class="tide-card__peak-head">
            <text class="tide-card__peak-label">最低潮</text>
            <text class="tide-card__peak-time">{{ lowTide?.time ?? '--' }}</text>
          </view>
          <text class="tide-card__peak-height">{{ lowTide?.height ?? '--' }} m</text>
        </view>
      </view>

      <text v-else-if="!state.tideLoading" class="tide-card__empty">暂无潮汐数据</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * TideCard —— 对应源项目 TideCard。
 *
 * 与源版本的差异：
 * - TideChart 从 ECharts 换成手写 Canvas 2d（见 TideChart 组件头注释）
 * - 港口 / 日期选择器从 <button> 换成 <view> + @tap。小程序 button 自带一套
 *   样式和尺寸，混进 segmented control 里会多出边距和边框，得靠 ::after 伪元素清掉，
 *   不如直接用 view，语义标签也更干净
 */
import { computed, watch } from 'vue';

import { HARBOR_OPTIONS, useFishingMapStore } from '@/composables/useFishingMapStore';
import { parseFxTime } from '@/utils/date';
import type { TideTableItem } from '@/types/fishing';

import SkeletonCard from '../SkeletonCard/SkeletonCard.vue';
import TideChart from '../TideChart/TideChart.vue';

const { state, fetchPanelTide, setSelectedHarbor, setSelectedDate } = useFishingMapStore();

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 今日起 8 天。
 *
 * 这里是本地日期运算（不是后端时间），走 new Date() 是对的 ——
 * 只有解析后端 fxTime 才需要避时区换算。
 */
const dateOptions = computed(() => {
  const today = new Date();
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return {
      value: `${d.getFullYear()}${month}${day}`,
      label: `${month}-${day}`,
      weekday: WEEKDAYS[d.getDay()],
    };
  });
});

const hourly = computed(() => state.panelTideData?.tideHourly ?? []);

/** 至少要有一条数值可用的逐时记录才画曲线 */
const hasHourly = computed(() => hourly.value.length > 0);

const chartPoints = computed(() => hourly.value);

const chartLabels = computed(() => hourly.value.map((point) => parseFxTime(point.fxTime)?.time ?? ''));

/**
 * 当前时刻落在逐时序列里的下标，画「现在」竖线用。
 *
 * 比对的是字符串前 14 位（`2026-10-17T14`），不 new Date()：
 * 后端 fxTime 自带 +08:00，转成 Date 会按设备时区重解释，
 * 开发者工具和真机时区不一致时整条标线会偏几小时，且只在真机复现。
 */
const nowIndex = computed(() => {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`;
  return hourly.value.findIndex((point) => point.fxTime.slice(0, 14) === stamp);
});

const highTide = computed(() => extremeTide('H', 'max'));
const lowTide = computed(() => extremeTide('L', 'min'));

/** 取高潮最高 / 低潮最低的那一条 */
function extremeTide(type: 'H' | 'L', pick: 'max' | 'min'): { time: string; height: string } | null {
  const table = state.panelTideData?.tideTable ?? [];
  const filtered = table.filter((item: TideTableItem) => item.type === type);
  if (!filtered.length) return null;

  const best = filtered.reduce((prev, curr) => {
    const prevValue = Number(prev.height);
    const currValue = Number(curr.height);
    return (pick === 'max' ? currValue > prevValue : currValue < prevValue) ? curr : prev;
  });

  const height = Number(best.height);
  return {
    time: parseFxTime(best.fxTime)?.time ?? '--',
    height: Number.isFinite(height) ? height.toFixed(2) : '--',
  };
}

// 首屏进页面时还没有面板潮汐数据，切港口/日期由 store 内部触发，这里只补首屏这一次
watch(
  () => [state.selectedHarbor, state.selectedDate],
  () => {
    void fetchPanelTide();
  },
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.tide-card {
  /* 原先这段内边距是为了把自己缩进 .card 里（卡片自带 24rpx 内边距，
     再补 8rpx 才和别的卡片标题对齐）。数据页改成无卡片的分区布局后，
     没有卡片可缩进了，内边距统一交给页面的 .pane，这里归零。 */
}

.tide-card__header {
  margin-bottom: 24rpx;
}

.tide-card__title {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.tide-card__segmented {
  width: 100%;
  margin-bottom: 16rpx;
  white-space: nowrap;
  border-radius: $fish-radius-lg;
  background-color: $fish-blue-50;
}

.tide-card__segmented-track {
  display: flex;
  padding: 4rpx;
}

.tide-card__segment {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64rpx;
  flex: 1;
  flex-shrink: 0;
  padding: 0 24rpx;
  border-radius: 10rpx;
}

.tide-card__segment--active {
  background-color: $fish-page;
}

.tide-card__segment-text {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.tide-card__segment-text--active {
  color: $fish-ink;
}

.tide-card__dates {
  width: 100%;
  margin-bottom: 32rpx;
  white-space: nowrap;
}

.tide-card__dates-track {
  display: flex;
  padding: 4rpx;
}

.tide-card__chip {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 72rpx;
  flex-shrink: 0;
  margin-right: 12rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background-color: $fish-surface;
}

.tide-card__chip--active {
  background-color: $fish-accent;
}

.tide-card__chip-text {
  color: $fish-ink;
  font-size: 24rpx;
  font-weight: 500;
}

.tide-card__body {
  min-height: 520rpx;
}

.tide-card__chart {
  padding: 16rpx 0 32rpx;
}

.tide-card__peaks {
  display: flex;
  border-radius: $fish-radius-xl;
  overflow: hidden;
  background-color: $fish-border-40;
}

.tide-card__peak {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 24rpx 32rpx;
  background-color: $fish-page;
}

.tide-card__peak-head {
  display: flex;
  align-items: baseline;
  margin-bottom: 8rpx;
}

.tide-card__peak-label {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.tide-card__peak-time {
  margin-left: 12rpx;
  color: $fish-ink;
  font-size: 24rpx;
}

.tide-card__peak-height {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.tide-card__empty {
  color: $fish-muted;
  font-size: 28rpx;
}
</style>
