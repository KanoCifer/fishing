<template>
  <view class="month">
    <!-- 环：已过的这个月里走了几成 -->
    <view class="month__lead">
      <ProgressRing :value="trips" :max="elapsed" :size="150" :stroke="8">
        <view class="month__ringmid">
          <text class="month__num">{{ trips }}</text>
          <text class="month__unit">{{ unit }}</text>
        </view>
      </ProgressRing>

      <text class="month__leadlabel">{{ tripsLabel }}</text>
    </view>

    <!-- 分隔线。与右边那一栏之间 -->
    <view class="month__divider" />

    <view class="month__rest">
      <!-- 本月渔获条数 -->
      <view class="month__row">
        <text class="month__rowlabel">{{ catchesLabel }}</text>
        <view class="month__rowvalue">
          <text class="month__rownum">{{ catches }}</text>
          <text class="month__rowunit">{{ catchUnit }}</text>
        </view>
      </view>

      <!-- 每日渔获。一排柱，条数越高柱子越高 -->
      <view class="month__trend">
        <view class="month__trendhead">
          <text class="month__trendtitle">{{ trendLabel }}</text>
          <text class="month__trendsub">{{ trendHint }}</text>
        </view>

        <view class="month__bars">
          <view
            v-for="bar in bars"
            :key="bar.day"
            class="month__bar"
            :class="{ 'month__bar--on': bar.count > 0 }"
            :style="{ height: bar.height + '%' }"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 本月概览卡。
 *
 * 受控组件：数字与柱都由外面给。它不读 store，也不取数 ——
 * 当前显示的是哪个月，那是页面知道的事。
 */
import { computed } from 'vue';

import { RECORD_DAY_UNIT, RECORD_MONTH } from '@/constants/record';
import type { FishingLog } from '@/types/record';
import ProgressRing from '../ProgressRing/ProgressRing.vue';

const props = defineProps<{
  /** 当前显示的月份 `YYYY-MM` */
  month: string;
  /** 当月的记录 */
  logs: FishingLog[];
  /** 今天 `YYYY-MM-DD` */
  today: string;
}>();

const unit = RECORD_DAY_UNIT;
const catchUnit = RECORD_MONTH.catchUnit;
const tripsLabel = RECORD_MONTH.trips;
const catchesLabel = RECORD_MONTH.catches;
const trendLabel = RECORD_MONTH.trend;
const trendHint = RECORD_MONTH.trendHint;

/** 当月天数 */
const daysInMonth = computed(() => {
  const [year, mon] = props.month.split('-').map(Number);
  return new Date(year, mon, 0).getDate();
});

/**
 * 已经过去的天数。
 *
 * 本月到今天为止，过去的一个月走完 —— 环画的是「已经走的那部分里，你走了几成」。
 * 翻到过去的月份时，整月都算过去了。
 */
const elapsed = computed(() => {
  const [year, mon] = props.month.split('-').map(Number);
  const thisMonth = year + '-' + String(mon).padStart(2, '0');
  if (thisMonth !== props.today.slice(0, 7)) return daysInMonth.value;

  return Math.max(1, Number(props.today.slice(8, 10)));
});

/** 这个月走了几天（有记录的天数） */
const trips = computed(() => {
  const days = new Set(props.logs.map((log) => log.log_date));
  return days.size;
});

/** 这个月钓到多少条 */
const catches = computed(() => {
  let total = 0;
  for (const log of props.logs) {
    for (const item of log.catches ?? []) total += item.quantity ?? 0;
  }
  return total;
});

/**
 * 每天的渔获条数。
 *
 * 高度是百分比（相对这个月最多的一天），柱体本身有个下限 ——
 * 一天钓到 0 条时画成一根贴底的细柱，
 * 空着的话看不出「那天去了但空军」和「那天没去」的分别。
 */
const bars = computed(() => {
  const counts = Array.from<number>({ length: daysInMonth.value }).fill(0);

  for (const log of props.logs) {
    const day = Number(log.log_date.slice(8, 10));
    if (day < 1 || day > daysInMonth.value) continue;
    let total = 0;
    for (const item of log.catches ?? []) total += item.quantity ?? 0;
    counts[day - 1] += total;
  }

  const max = Math.max(1, ...counts);
  const visible = Math.min(counts.length, elapsed.value);

  return counts.slice(0, visible).map((count, index) => ({
    day: index + 1,
    count,
    height: count > 0 ? Math.max(14, Math.round((count / max) * 100)) : 4,
  }));
});
</script>

<style lang="scss" scoped>
.month {
  display: flex;
  align-items: center;
}

/* 环这一侧 */
.month__lead {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.month__ringmid {
  display: flex;
  align-items: baseline;
}

.month__num {
  color: $fish-ink;
  @include fish-type(display);

  font-variant-numeric: tabular-nums;
}

.month__unit {
  margin-left: 4rpx;
  color: $fish-muted-60;
  @include fish-type(caption);

  line-height: 1;
}

.month__leadlabel {
  margin-top: 12rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 分隔线 */
.month__divider {
  width: 1rpx;
  height: 120rpx;
  margin: 0 28rpx;
  background-color: $fish-border-40;
}

.month__rest {
  flex: 1;
  min-width: 0;
}

/* 本月渔获条数 */
.month__row {
  display: flex;
  align-items: baseline;
}

.month__rowlabel {
  color: $fish-muted-60;
  @include fish-type(caption);
}

.month__rowvalue {
  display: flex;
  align-items: baseline;
  margin-left: auto;
}

.month__rownum {
  color: $fish-ink;
  @include fish-type(title);

  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.month__rowunit {
  margin-left: 4rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 趋势 */
.month__trend {
  margin-top: 20rpx;
}

.month__trendhead {
  display: flex;
  align-items: baseline;
}

.month__trendtitle {
  color: $fish-muted-60;
  @include fish-type(caption);
}

.month__trendsub {
  margin-left: 10rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
  opacity: 0.7;
}

/*
 * 柱排。
 *
 * 固定高度 72rpx，柱高用百分比 —— 百分比撑不满的部分是底色，
 * 所以「最高的那根」永远是满的，不依赖具体数值。
 */
.month__bars {
  display: flex;
  align-items: flex-end;
  height: 72rpx;
  margin-top: 12rpx;
}

.month__bar {
  flex: 1;
  min-width: 0;
  margin-right: 4rpx;
  border-radius: 4rpx;
  background-color: $fish-border-40;
}

/* 有渔获的那天 */
.month__bar--on {
  background-color: $fish-blue;
}

/* 最后一根不留右边距 */
.month__bar:last-child {
  margin-right: 0;
}
</style>
