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

import { useFishingMapStore } from '@/stores/fishingMap';
import { shortDate } from '@/utils/date';
import { num } from '@/utils/weather';

/** 柱区高度，单位 rpx。定高是为了让 7 根柱子有共同的像素标尺 */
const BAR_HEIGHT = 68;

/** 没有数据时的占位标尺，只为了让空态以外不出现除零 */
const FALLBACK_AXIS = { lo: 0, hi: 10 };

const mapStore = useFishingMapStore();

/** 挑出高低温都有值的日，脏数据整条丢掉，不参与作图 */
const days = computed(() =>
  mapStore.forecasts
    .map((day) => ({
      fxDate: day.fxDate,
      max: num(day.tempMax),
      min: num(day.tempMin),
    }))
    .filter((day): day is { fxDate: string; max: number; min: number } => day.max !== null && day.min !== null),
);

const loading = computed(() => mapStore.weatherLoading);

const emptyText = computed(() =>
  loading.value ? '加载中…' : mapStore.forecasts.length ? '预报数据不完整' : '暂无预报数据',
);

function dayLabel(fxDate: string, index: number): string {
  return index === 0 ? '今天' : shortDate(fxDate);
}

/**
 * 标尺的两端，**从数据里推**。
 *
 * 原来写死 14~28。界面上一旦出现这个区间外的温度（截图里正是 32~34°），
 * 每根柱子的 top 都算成负数，整排区间柱会跑到容器外面去 —— 页面上什么都不显示，
 * 也没有任何报错能指回这里。写死的标尺等于「只要这个冬天不下雪就必然画不出来」。
 *
 * 两端各留 15% 余量取整：最热/最冷那天不会顶到边上。
 */
const axis = computed(() => {
  if (!days.value.length) return FALLBACK_AXIS;

  let lo = Infinity;
  let hi = -Infinity;
  for (const day of days.value) {
    if (day.min < lo) lo = day.min;
    if (day.max > hi) hi = day.max;
  }

  // 全天恒温时 lo===hi，取整后仍然相等 —— 跨度为 0 会除零，先兜住
  const pad = Math.max(1, Math.round((hi - lo) * 0.15));
  return { lo: Math.floor(lo - pad), hi: Math.ceil(hi + pad) };
});

/** 标尺跨度，单位 px。rpx 只对样式有效，这里自己换算，行内 style 不吃 rpx */
const spanPx = computed(() => uni.upx2px(BAR_HEIGHT) / Math.max(1e-6, axis.value.hi - axis.value.lo));

/** 柱区总高，单位 px */
const barHeightPx = uni.upx2px(BAR_HEIGHT);

/**
 * 数值 → 距柱顶的偏移（px）。
 *
 * 返回**纯数字**，单位由模板拼 px —— 这里必须用 px 而不是 rpx：
 * 行内 style 里的 rpx 不会走小程序的编译，写进去在小程序端能生效纯属侥幸，
 * 一旦这份组件被拿到别的平台（uni-app 的 rpx 换算只作用于 WXSS 文件）就直接失效。
 * 主动 upx2px 则在任何平台都是确定的像素值。
 */
function top(value: number): string {
  return ((axis.value.hi - value) * spanPx.value).toFixed(1);
}

/**
 * 红段占区间上半（最高 → 中位），蓝段占下半（中位 → 柱底）。
 *
 * 以中位数为界，而不是「从柱底各画到 max / min」：后者两根的高度由各自的绝对值
 * 决定，低温那天会永远比高温那天矮一截，看着像每天温差都一样大。
 */
function height(max: number, min: number, half: 'max' | 'min'): string {
  const span = spanPx.value;
  const topMax = (axis.value.hi - max) * span;
  const topMid = (axis.value.hi - (max + min) / 2) * span;
  return (half === 'max' ? topMid - topMax : barHeightPx - topMid).toFixed(1);
}
</script>

<style lang="scss" scoped>
.week {
  margin-top: $fish-space-section;
}

.week__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

/* 分区标题统一走 headline 一级。原先这里 30rpx、HourlyWeather 28rpx、
   各组件各写各的，同一页里三个分区标题三个字号 —— 这是这套类型系统里
   最容易被忽略也最伤整体感的一处。 */
.week__title {
  color: $fish-ink;
  @include fish-type(headline);
}

.week__meta {
  color: $fish-muted-60;
  @include fish-type(caption2);
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
  color: $fish-muted;
  @include fish-type(caption2);
}

.week__label--today {
  color: $fish-accent;
  font-weight: 600;
}

.week__bar {
  position: relative;
  width: 12rpx;
  height: 68rpx;
  margin: 0 auto 12rpx;
}

/*
 * 两段拼成一根连续的区间柱：上段管上端圆角、下段管下端圆角，
 * 接缝保持方角。
 *
 * 两段各自都给满圆角会在中位处掐出一道缺口，看着像断成两截；
 * 这里让它们在中线处严丝合缝，只有整根柱子的两端是圆的 ——
 * 读起来才是一根柱子，而不是两个色块。
 */
.week__bar-max,
.week__bar-min {
  position: absolute;
  left: 0;
  right: 0;
}

.week__bar-max {
  border-radius: $fish-radius-pill $fish-radius-pill 0 0;
  background-color: $fish-temp;
}

.week__bar-min {
  border-radius: 0 0 $fish-radius-pill $fish-radius-pill;
  background-color: $fish-tide;
}

.week__max {
  display: block;
  color: $fish-ink;
  @include fish-type(caption);

  font-weight: 600;
}

.week__min {
  display: block;
  margin-top: 2rpx;
  color: $fish-muted;
  @include fish-type(caption2);
}

.week__empty {
  display: block;
  padding: 48rpx 0;
  color: $fish-muted;
  @include fish-type(subhead);

  text-align: center;
}
</style>
