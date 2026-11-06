<template>
  <view class="tide" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <PageNav title="潮汐详情" :scrolled="scrolled" fallback-url="/pages/data/index" />

    <view class="tide__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!-- 港口与日期。首页只留「今日」，要看别的港口、别的日子到这里来选 -->
      <view class="sect sect--first">
        <view class="sect__card tide__card">
          <!-- 港口切换：iOS segmented control -->
          <scroll-view class="tide__segmented" scroll-x :show-scrollbar="false">
            <view class="tide__segmented-track">
              <view
                v-for="opt in mapStore.tideStations"
                :key="opt.code"
                class="tide__segment"
                :class="{ 'tide__segment--active': mapStore.activeHarbor === opt.code }"
                @tap="mapStore.setSelectedHarbor(opt.code)"
              >
                <text
                  class="tide__segment-text"
                  :class="{ 'tide__segment-text--active': mapStore.activeHarbor === opt.code }"
                >
                  {{ opt.name }}
                </text>
              </view>
            </view>
          </scroll-view>

          <!-- 日期：原生日期选择器，范围是今天起 10 天 -->
          <picker
            class="tide__date-picker"
            mode="date"
            :value="pickerValue"
            :start="dateRange.start"
            :end="dateRange.end"
            @change="onDateChange"
          >
            <view class="tide__date-row">
              <text class="tide__date-label">日期</text>
              <view class="tide__date-value">
                <text class="tide__date-text">{{ dateLabel }}</text>
                <image class="tide__date-chevron" :src="chevronIcon" mode="aspectFit" />
              </view>
            </view>
          </picker>
        </view>
      </view>

      <!-- 读数与曲线 -->
      <view class="sect">
        <view class="sect__card tide__card">
          <!--
            当前读数。看的是别的日子时没有「当前」这回事，
            这块就不画 —— 曲线与下面那两张卡已经说完了那一天。
          -->
          <view v-if="now" class="tide__now">
            <text class="tide__now-label">当前潮位 · {{ spotName }}</text>
            <view class="tide__now-row">
              <view class="tide__now-left">
                <view class="tide__now-pill">
                  <text class="tide__now-trend">{{ trendText }}</text>
                </view>
                <text class="tide__now-rate">{{ rateText }}</text>
              </view>
              <view class="tide__now-level">
                <text class="tide__now-value">{{ levelText }}</text>
                <text class="tide__now-unit">m</text>
              </view>
            </view>
          </view>

          <view v-if="hasHourly" class="tide__chart">
            <TideChart :points="chartPoints" :labels="chartLabels" :now-index="nowIndex" :show-head="false" />
          </view>

          <SkeletonCard v-else-if="mapStore.tideLoading" has-chart />

          <text v-else class="tide__empty">这一天没有潮汐数据</text>

          <!-- 这一天的两个数：潮差与下一个潮时 -->
          <view v-if="hasHourly" class="tide__meta">
            <view class="tide__meta-cell">
              <text class="tide__meta-label">潮差</text>
              <text class="tide__meta-value">{{ rangeText }} m</text>
            </view>
            <view class="tide__meta-cell">
              <text class="tide__meta-label">{{ nextTideLabel }}</text>
              <text class="tide__meta-value">{{ nextTideValue }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 当天最高与最低。没有数据时整块不画：两个「--」不是信息，是占位 -->
      <view v-if="high || low" class="sect">
        <view class="sect__row">
          <view class="sect__half tide__peak">
            <text class="tide__peak-label tide__peak-label--high">{{ highLabel }}</text>
            <text class="tide__peak-time">{{ high?.time ?? '--' }}</text>
            <text class="tide__peak-height">潮高 {{ highHeight }} m</text>
          </view>
          <view class="sect__half tide__peak">
            <text class="tide__peak-label tide__peak-label--low">{{ lowLabel }}</text>
            <text class="tide__peak-time">{{ low?.time ?? '--' }}</text>
            <text class="tide__peak-height">潮高 {{ lowHeight }} m</text>
          </view>
        </view>
      </view>

      <!-- 潮汐时刻表 -->
      <view class="sect">
        <text class="sect__title">潮汐时刻表</text>

        <view class="sect__card tide__card">
          <view v-for="row in tableRows" :key="row.key" class="tide__row">
            <text class="tide__row-time">{{ row.time }}</text>
            <text class="tide__row-kind" :class="'tide__row-kind--' + row.kindKey">{{ row.label }}</text>
            <text class="tide__row-height">{{ row.height }} m</text>
          </view>

          <text v-if="!tableRows.length" class="tide__empty">这一天没有潮时记录</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 潮汐详情页 —— 潮汐卡片的完整版。
 *
 * 首页那张卡只说「此刻这片水的潮汐」；这里说完整的一天：
 * 港口与日期由用户挑，曲线之外还有当天的最高/最低与全部潮时。
 *
 * 数据走 store 的面板潮汐（panelTideData）：港口和日期的切换由 store 发请求，
 * 页面只负责把选择画出来。理由见 stores/fishingMap 的 fetchPanelTide。
 */
import { computed, onMounted, ref } from 'vue';
import { onPageScroll } from '@dcloudio/uni-app';

import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import SkeletonCard from '@/components/SkeletonCard/SkeletonCard.vue';
import TideChart from '@/components/TideChart/TideChart.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import {
  formatCompactDate,
  fxHourKey,
  localHourKey,
  parseFxTime,
  shortDate,
  weekdayCn,
} from '@/utils/date';
import { deriveTideNow, highestHighTide, lowestLowTide, nextTideEvent, tideRange } from '@/utils/tide';

const mapStore = useFishingMapStore();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

/** 导航栏材质层要不要显形 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

/** picker 要的日期格式：`YYYY-MM-DD` */
function toPickerDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * 可选范围：今天起 10 天（含今天）。
 *
 * 边界是本地日历日（不是后端时间），走 new Date() 是对的 ——
 * 只有解析后端 fxTime 才需要避时区换算。
 */
const dateRange = computed(() => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 9);
  return { start: toPickerDate(start), end: toPickerDate(end) };
});

/** picker 的当前值。store 里存的是 `YYYYMMDD`，这里换成 picker 要的 `YYYY-MM-DD` */
const pickerValue = computed(() => {
  const value = mapStore.selectedDate;
  if (!value || value.length < 8) return dateRange.value.start;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
});

const dateLabel = computed(() => `${shortDate(pickerValue.value)} ${weekdayCn(pickerValue.value)}`);

/** picker 选完：`YYYY-MM-DD` → store 的 `YYYYMMDD` */
function onDateChange(event: { detail: { value: string } }): void {
  const picked = event.detail.value;
  if (!picked) return;
  mapStore.setSelectedDate(picked.replace(/-/g, ''));
}

/** 日期行右边的小箭头。它是「这里能改」的唯一提示 */
const chevronIcon = icon('chevron-down', 'muted60');

const tide = computed(() => mapStore.panelTideData);

const spotName = computed(() => mapStore.panelTideSpotName || mapStore.activeHarbor);

const hourly = computed(() => tide.value?.tideHourly ?? []);

/** 至少要有一条数值可用的逐时记录才画曲线 */
const hasHourly = computed(() => hourly.value.length > 0);

const chartPoints = computed(() => hourly.value);

const chartLabels = computed(() => hourly.value.map((point) => parseFxTime(point.fxTime)?.time ?? ''));

/**
 * 当前时刻落在逐时序列里的下标，画「现在」竖线用。
 *
 * 比对的是小时键，不 new Date()：后端 fxTime 自带 +08:00，
 * 转成 Date 会按设备时区重解释，开发者工具和真机会差出几个小时。
 */
const nowIndex = computed(() => {
  const stamp = localHourKey();
  return hourly.value.findIndex((point) => fxHourKey(point.fxTime) === stamp);
});

/** 此刻的潮位与涨退速率。看别的日子时给 null */
const now = computed(() => deriveTideNow(tide.value));

const trendText = computed(() => {
  const trend = now.value?.trend;
  if (trend === 'rising') return '涨潮中';
  if (trend === 'falling') return '退潮中';
  return '平潮';
});

/** 速率带符号：涨是 +，退是 − */
const rateText = computed(() => {
  const rate = now.value?.rate;
  if (rate === undefined || !Number.isFinite(rate)) return '';
  const sign = rate > 0 ? '+' : rate < 0 ? '−' : '';
  return `${sign}${Math.abs(rate).toFixed(2)} m/h`;
});

const levelText = computed(() => (now.value ? now.value.level.toFixed(2) : '--'));

const high = computed(() => highestHighTide(tide.value));
const low = computed(() => lowestLowTide(tide.value));

const highHeight = computed(() => (high.value ? high.value.height.toFixed(2) : '--'));
const lowHeight = computed(() => (low.value ? low.value.height.toFixed(2) : '--'));

/** 看的是今天就说「今日」，别的日子说「当日」 */
const isToday = computed(() => mapStore.selectedDate === formatCompactDate());
const highLabel = computed(() => (isToday.value ? '今日高潮' : '当日高潮'));
const lowLabel = computed(() => (isToday.value ? '今日低潮' : '当日低潮'));

const rangeText = computed(() => {
  const range = tideRange(tide.value);
  return range === null ? '--' : range.toFixed(2);
});

/**
 * 「距下一次潮时」只对今天成立。
 *
 * 看别的日子时，表里的潮时全在未来，「距下一次」数出来是几十小时 ——
 * 那不是「下一次潮」，是那天最早的一次潮。这种时候给的是当天潮时次数。
 *
 * 标签与取值拆开：标签说「这是什么事」，取值只说「多少」。
 */
const nextTideLabel = computed(() => {
  if (!isToday.value) return '当天潮时';

  const event = nextTideEvent(tide.value);
  return event ? `距${event.type === 'H' ? '高潮' : '低潮'}` : '潮时';
});

const nextTideValue = computed(() => {
  if (!isToday.value) return `${tide.value?.tideTable?.length ?? 0} 次`;

  const event = nextTideEvent(tide.value);
  if (!event) return '已过';
  return formatDuration(event.minutesToNext);
});

/** 分钟数写成「2 小时 18 分」。不到一小时就不写小时 */
function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '--';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

/**
 * 首屏取数。
 *
 * store 里已有面板潮汐就不重打 —— 切港口、切日期之后那份数据还在，
 * 再取一遍是白花一个往返。没有就取：近站点今天这一档直接用 enriched
 * 带回的那份，不会白发请求（见 fetchPanelTide）。
 */
onMounted(() => {
  /*
   * 近站点还没到齐时，先把 enriched 取回来 —— 它带着「你所在地最近的潮汐站」
   * 与今天的潮汐。潮汐是按地点取数的东西：没有这一份，这一页给的就是
   * 固定港口的潮汐，与用户所在的那片水无关。
   *
   * 数据页首屏已经取过一次时这里是空转（store 按坐标缓存）。
   */
  if (!mapStore.nearestStationResolved) {
    void mapStore.ensureWeatherAndFishing();
  }

  if (mapStore.panelTideData) return;
  void mapStore.fetchPanelTide();
});

/** 潮时表逐行 */
const tableRows = computed(() => {
  const table = tide.value?.tideTable ?? [];
  return table.map((item, index) => {
    const height = Number(item.height);
    return {
      key: `${item.fxTime}-${index}`,
      time: parseFxTime(item.fxTime)?.time ?? '--',
      label: item.type === 'H' ? '高潮' : '低潮',
      kindKey: item.type === 'H' ? 'high' : 'low',
      height: Number.isFinite(height) ? height.toFixed(2) : '--',
    };
  });
});
</script>

<style lang="scss" scoped>
.tide {
  background-color: $fish-grouped;
}

.tide__body {
  position: relative;
  z-index: 1;
  padding-bottom: calc(64rpx + env(safe-area-inset-bottom));
}

/* 分区。缩进、眉标、卡间距走令牌层 _layout.scss 的 fish-section */
.sect {
  @include fish-section;
}

.sect--first {
  margin-top: 0;
}

.tide__card {
  @include fish-card;
}

/*
 * 港口切换：iOS segmented control。
 *
 * 轨道是中性填充、选中块是白底浮在上面 —— 轨道不给品牌色是刻意的，
 * 彩色留给选中项，整排才不会一起抢注意力。
 *
 * 轨道按内容宽度铺：站名长短不一，轨道得跟着最长的那个名字走，
 * 选中块才不会被挤成半截字。站名多到一屏放不下时，这一排自己横滑。
 */
.tide__segmented {
  width: 100%;
  margin-bottom: 24rpx;
  white-space: nowrap;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.06);
}

.tide__segmented-track {
  display: flex;
  width: max-content;
  min-width: 100%;
  padding: 4rpx;
}

.tide__segment {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64rpx;
  flex: 1 0 auto;
  min-width: 120rpx;
  padding: 0 24rpx;
  border-radius: 14rpx;
  /* 分段按下是变暗不是缩小：缩小会让整排的选中块位置跳一下 */
  @include fish-press-dim;
}

.tide__segment--active {
  background-color: $fish-page;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}

.tide__segment-text {
  color: $fish-muted;
  @include fish-type(body);
}

.tide__segment-text--active {
  color: $fish-ink;
  font-weight: 500;
}

/*
 * 日期行。原生 picker：整行可点，点了拉起微信自己的日期轮盘。
 *
 * 左边是字段名，右边是取值与箭头 —— 箭头是「这里能改」的唯一提示，
 * 没有它，这一行看着像一行静态文字。
 */
.tide__date-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 22rpx;
  border-top: 1rpx solid $fish-border-40;
}

.tide__date-label {
  color: $fish-muted;
  @include fish-type(body);
}

.tide__date-value {
  display: flex;
  align-items: center;
}

.tide__date-text {
  color: $fish-ink;
  @include fish-type(body, 500);
}

.tide__date-chevron {
  width: 28rpx;
  height: 28rpx;
  margin-left: 10rpx;
  opacity: 0.6;
}

/*
 * 当前读数。
 *
 * 左边是状态（涨潮中 + 速率），右边是数值 —— 数值大、状态小，
 * 一眼先落在「现在多高」，再读到「在往哪边走」。
 */
.tide__now {
  margin-bottom: 24rpx;
}

.tide__now-label {
  display: block;
  margin-bottom: 12rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

.tide__now-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.tide__now-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

/* 状态胶囊。它只报状态，不装别的信息 */
.tide__now-pill {
  padding: 6rpx 18rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent-tint;
}

.tide__now-trend {
  color: $fish-blue-600;
  @include fish-type(caption, 500);
}

.tide__now-rate {
  margin-top: 10rpx;
  color: $fish-muted;
  @include fish-type(caption);
  @include numeric(500);
}

.tide__now-level {
  display: flex;
  align-items: baseline;
}

/* 读数取曲线的那个蓝：同一个数，跟图上那条线是一件事 */
.tide__now-value {
  color: $fish-tide;
  @include fish-type(display);
  @include numeric;
}

.tide__now-unit {
  margin-left: 6rpx;
  color: $fish-muted-60;
  @include fish-type(title);
}

.tide__chart {
  padding: 8rpx 0 24rpx;
}

/*
 * 潮差与下一个潮时。放在曲线下面，与曲线之间留一段。
 *
 * 两格并排，中间一道发丝线：标签在上、取值在下 ——
 * 取值是这一格真正要读的东西，标签只是它是什么。
 */
.tide__meta {
  display: flex;
  padding-top: 20rpx;
  border-top: 1rpx solid $fish-border-40;
}

.tide__meta-cell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.tide__meta-cell + .tide__meta-cell {
  padding-left: 24rpx;
  border-left: 1rpx solid $fish-border-40;
}

.tide__meta-label {
  color: $fish-muted-60;
  @include fish-type(caption);
}

.tide__meta-value {
  margin-top: 6rpx;
  color: $fish-ink;
  @include fish-type(body, 500);
  font-variant-numeric: tabular-nums;
}

/*
 * 当天最高与最低。
 *
 * 两张并排的内嵌面板，中间露出一道发丝线底 —— 面板从缝里浮起来，
 * 才读得成一个分组。
 */
.tide__peak {
  display: flex;
  flex-direction: column;
  padding: 24rpx 28rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

/* 标签分色：高潮蓝、低潮琥珀，与时刻表同一套颜色语言 */
.tide__peak-label {
  color: $fish-muted;
  @include fish-type(caption);
}

.tide__peak-label--high {
  color: $fish-blue-600;
}

.tide__peak-label--low {
  color: $fish-warning-ink;
}

.tide__peak-time {
  margin-top: 8rpx;
  color: $fish-ink;
  @include fish-type(title);
  font-variant-numeric: tabular-nums;
}

.tide__peak-height {
  margin-top: 4rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
  font-variant-numeric: tabular-nums;
}

/* 潮时表的一行：时刻、高潮/低潮、潮高 */
.tide__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 0;
  border-bottom: 1rpx solid $fish-border-40;
}

.tide__row:last-child {
  border-bottom: none;
}

.tide__row-time {
  color: $fish-ink;
  @include fish-type(body);
  font-variant-numeric: tabular-nums;
}

/* 高潮用蓝、低潮用琥珀：两件事要能一眼分开 */
.tide__row-kind {
  @include fish-type(body, 500);
}

.tide__row-kind--high {
  color: $fish-blue-600;
}

.tide__row-kind--low {
  color: $fish-warning-ink;
}

.tide__row-height {
  color: $fish-muted;
  @include fish-type(body);
  font-variant-numeric: tabular-nums;
}

.tide__empty {
  display: block;
  padding: 32rpx 0;
  color: $fish-muted-60;
  @include fish-type(caption);
  text-align: center;
}
</style>
