<template>
  <view class="week">
    <view class="week__head">
      <text class="week__title">7 天</text>
      <text class="week__meta">最高 / 最低</text>
    </view>

    <view v-if="days.length" class="week__track">
      <view v-for="(day, i) in days" :key="day.fxDate" class="week__cell">
        <text class="week__label" :class="{ 'week__label--today': i === 0 }">{{ dayLabel(day.fxDate, i) }}</text>
        <!--
          一根 min–max 区间柱，红在上蓝在下。
          两根并排的条各自以 0 为基线，高低温的绝对值差会把它们压成一样高，
          看不出哪天暖；共用一根标尺的区间柱才比得出高低。
        -->
        <view class="week__bar">
          <view class="week__bar-max" :style="`top:${top(day.max)}px;height:${height(day.max, day.min, 'max')}px`" />
          <view
            class="week__bar-min"
            :style="`top:${top((day.max + day.min) / 2)}px;height:${height(day.max, day.min, 'min')}px`"
          />
        </view>
        <text class="week__max">{{ day.max }}°</text>
        <text class="week__min">{{ day.min }}°</text>
      </view>
    </view>

    <text v-else class="week__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * WeekStrip —— 七天高低温区间。
 *
 * 与原页面那张「7 天气温」折线的取舍：折线画的是趋势，区间柱给的是可比较的高低。
 * 七天这个长度上用户问的是「哪天暖、哪天冷」，不是「这周在往哪走」，
 * 所以换成能横向比大小的形式。数值仍然直接标在柱下，不靠悬停/轻触去读。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/composables/useFishingMapStore';
import { shortDate } from '@/utils/date';
import { num } from '@/utils/weather';

/** 柱区高度，单位 rpx。定高是为了让 7 根柱子有共同的像素标尺 */
const BAR_HEIGHT = 68;
/** 标尺的两端，比数据实际范围各留一点余量，避免最热/最冷那天顶到边上 */
const AXIS_LO = 14;
const AXIS_HI = 28;

const { state } = useFishingMapStore();

/** 挑出高低温都有值的日，脏数据整条丢掉，不参与作图 */
const days = computed(() =>
  state.forecasts
    .map((day) => ({
      fxDate: day.fxDate,
      max: num(day.tempMax),
      min: num(day.tempMin),
    }))
    .filter((day): day is { fxDate: string; max: number; min: number } => day.max !== null && day.min !== null),
);

const loading = computed(() => state.weatherLoading);

const emptyText = computed(() =>
  loading.value ? '加载中…' : state.forecasts.length ? '预报数据不完整' : '暂无预报数据',
);

function dayLabel(fxDate: string, index: number): string {
  return index === 0 ? '今天' : shortDate(fxDate);
}

/**
 * 数值 → 距柱顶的偏移。
 *
 * 单位必须写 rpx：小程序的行内 style 不走 WXSS 的编译，px 是设备像素不会换算，
 * 和外层用 rpx 写的柱高对不上，柱子的分段就会错位。
 */
function top(value: number): string {
  return `${(((AXIS_HI - value) / (AXIS_HI - AXIS_LO)) * BAR_HEIGHT).toFixed(1)}rpx`;
}

/**
 * 红段占区间上半（最高 → 中位），蓝段占下半（中位 → 柱底）。
 *
 * 以中位数为界，而不是「从柱底各画到 max / min」：后者两根的高度由各自的绝对值
 * 决定，低温那天会永远比高温那天矮一截，看着像每天温差都一样大。
 */
function height(max: number, min: number, half: 'max' | 'min'): string {
  const span = BAR_HEIGHT / (AXIS_HI - AXIS_LO);
  const topMax = (AXIS_HI - max) * span;
  const topMid = (AXIS_HI - (max + min) / 2) * span;
  return `${(half === 'max' ? topMid - topMax : BAR_HEIGHT - topMid).toFixed(1)}rpx`;
}
</script>

<style lang="scss" scoped>
.week {
  margin-top: 32rpx;
}

.week__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.week__title {
  color: $fish-ink;
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: -1rpx;
}

.week__meta {
  color: $fish-muted-60;
  font-size: 22rpx;
}

.week__track {
  display: flex;
  justify-content: space-between;
}

.week__cell {
  flex: 1;
  text-align: center;
}

.week__label {
  display: block;
  margin-bottom: 12rpx;
  color: $fish-muted-60;
  font-size: 20rpx;
}

.week__label--today {
  color: $fish-blue-600;
  font-weight: 600;
}

.week__bar {
  position: relative;
  width: 12rpx;
  height: 68rpx;
  margin: 0 auto 12rpx;
}

.week__bar-max {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: 2rpx;
  background-color: $fish-temp;
}

.week__bar-min {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: 2rpx;
  background-color: $fish-blue;
}

.week__max {
  display: block;
  color: $fish-ink;
  font-size: 22rpx;
  font-weight: 600;
}

.week__min {
  display: block;
  margin-top: 2rpx;
  color: $fish-muted-60;
  font-size: 20rpx;
}

.week__empty {
  display: block;
  padding: 48rpx 0;
  color: $fish-muted-60;
  font-size: 26rpx;
  text-align: center;
}
</style>
