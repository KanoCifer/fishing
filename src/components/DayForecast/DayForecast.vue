<template>
  <view class="days" :class="{ 'days--empty': !days.length && !loading }">
    <text v-if="days.length" class="days__title">{{ title }}</text>

    <!--
      加载中：标题的位置先占住。

      数据到了标题才冒出来。位置一占住，下面那三行就不会整体往下跳 ——
      骨架摆得再准，标题晚来一步，这一行照样会散架。
    -->
    <view v-else-if="loading" class="days__skeleton days__skeleton--title" />

    <view v-if="days.length" class="days__rows">
      <view v-for="(day, i) in days" :key="day.fxDate" class="days__row">
        <text class="days__label" :class="{ 'days__label--today': i === 0 }">{{ dayLabel(day.fxDate, i) }}</text>
        <!--
          白天天气。图标是这一行除了温度之外的第二个信息：
          「33° / 25°」说的是热不热，图标说的是出不出门 ——
          决定要不要出钓的往往是后者，不是前者。
          这里只取白天时段：钓鱼是白天的活（数据层的湿度/降水也是以白天段为准），
          夜间天气另有一格会挤掉这一行的可比性。
        -->
        <text v-if="qweatherFontReady" :class="['days__icon', weatherIconClass(day.icon)]" />
        <view v-else class="days__icon days__icon--pending" />
        <!-- 降水概率。贴着图标放：它说的是这张图标有多大概率成真，
             跟温度不在一件事上，挤到右边温度那两列里会被读成第三个温度 -->
        <text v-if="day.probText" class="days__prob">{{ day.probText }}</text>

        <view class="days__spacer" />

        <!--
          高低温两列。

          这里不画箭头：这张卡只有半宽（335rpx），一个「↑」加上数字就把
          降水概率那一格挤掉了 —— 概率是数据，箭头是修饰，数据先留。
          哪一列是高温靠排版说：大的重、小的弱（跟原横条同一手法）。
        -->
        <view class="days__temps">
          <text class="days__max">{{ day.max }}°</text>
          <text class="days__min">{{ day.min }}°</text>
        </view>
      </view>
    </view>

    <!--
      加载中：三行骨架。

      骨架照着真实行的行盒摆，不用 SkeletonCard —— 那张是列表卡的形状，
      摆在这半宽方卡里跟最终的形状对不上（理由见 VerdictOverview 的加载态注释）。

      行数按三天摆：接口就回三天，脏行被丢掉是少见的例外。
    -->
    <view v-else-if="loading" class="days__rows">
      <view v-for="i in 3" :key="i" class="days__row">
        <!-- 日期列：与 .days__label 同宽同位，图标才落在同一个 x 上 -->
        <view class="days__skeleton-cell">
          <view class="days__skeleton days__skeleton--label" />
        </view>
        <view class="days__skeleton days__skeleton--icon" />
        <view class="days__skeleton days__skeleton--prob" />
        <view class="days__spacer" />
        <view class="days__temps">
          <view class="days__skeleton days__skeleton--max" />
          <view class="days__skeleton days__skeleton--min" />
        </view>
      </view>
    </view>

    <text v-else class="days__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * DayForecast —— 数据页「天气」分区里的多日预报卡。
 *
 * 形态：一张方卡，三天各占一行 —— 像 iOS 天气 App 的逐日列表。
 *
 * 为什么从原来那条横列改成这样：
 * 横列是**表格**的读法（竖着三根柱子 + 两行数字），一屏里没有一张
 * 能一眼认出「今天」的图；而这一段的前一张 CurrentWeather 已经把
 * 这套页面的天气语言定成了「一张方方正正的大卡」。同一页里两种读法并排，
 * 「现在」和「未来三天」看着不像一件事。
 *
 * 为什么卡面是中性淡面、不跟任何一天绑定：
 * 那十组天气色（见 CurrentWeather）是「现在什么天」的信号 ——
 * 这张卡说的不是某一天，是「接下来三天」。拿一张带天气色的面装三天，
 * 读的人会以为这张卡讲的是其中某一天。
 *
 * 为什么行里不放大温度：上面那张卡已经有一个 100pt 的大温度了。
 * 这一段要回答的是「哪天更暖、哪天会下雨」，那是**比较**出来的，
 * 三行并排、两列对齐的数比一个主角数字更适合比。
 *
 * 取数在 store，换算在 utils，这里只管渲染。
 */
import { computed } from 'vue';

import { qweatherFontReady } from '@/composables/useQweatherFont';
import { useFishingMapStore } from '@/stores/fishingMap';
import { shortDate } from '@/utils/date';
import { forecastDays, weatherIconClass } from '@/utils/weather';

const mapStore = useFishingMapStore();

/**
 * 有效的预报日。
 *
 * 挑出高低温都有值的日，脏数据整条丢掉，不占一行 —— 口径在 utils/weather，
 * 与 CurrentWeather 取「今天」用的是同一份，两张卡不会对今天各说各话。
 */
const days = computed(() => forecastDays(mapStore.forecasts));

/**
 * 行首的日期。
 *
 * 「今天」认的是**留下来的第一行**，不是接口的第一条 ——
 * 头一天要是脏数据（缺高低温）整条被丢掉，剩下的第一行才是今天。
 * 所以这个判断按行在列表里的位置算，不按它在接口里的位置。
 */
function dayLabel(fxDate: string, index: number): string {
  return index === 0 ? '今天' : shortDate(fxDate);
}

/**
 * 标题跟着实际天数走。
 *
 * 原来这里写死「7 天」，而接口只回三天 —— 标题说的和下面列的不是一回事，
 * 读的人会以为数据缺了四天。
 */
const title = computed(() => `未来 ${days.value.length} 天`);

/**
 * 加载中。
 *
 * `locating` 一起算进来：定位是取数的前置（授权询问 + 一次往返），
 * 那段时间请求还没发出去，只看 weatherLoading 会把「还没取」当成「没有」。
 *
 * 有数据时刷新不算加载 —— 已有读数换成骨架，读的人会以为数据没了。
 */
const loading = computed(() => mapStore.locating || mapStore.weatherLoading);

/**
 * 空态与出错时说同一句话的不同版本。
 *
 * 出错时不说「暂无」：取不到不是没有。
 * 具体原因已经在 toast 里报过、也在结论头那块一直摆着，
 * 这里只说清「这一块没取到」，免得让人以为整页都废了。
 */
const emptyText = computed(() => {
  if (mapStore.weatherError) return '预报暂时取不到';

  return mapStore.forecasts.length ? '预报数据不完整' : '暂无预报数据';
});
</script>

<style lang="scss" scoped>
.days {
  display: flex;
  flex-direction: column;

  /*
   * border-box：卡上有一圈 4rpx 的白边，不设它的话边框会撑在卡外面 ——
   * 卡就比它那一半宽还宽 8rpx，两张卡并排会顶出页面。
   */
  box-sizing: border-box;
  height: 345rpx;
  padding: 28rpx 28rpx 24rpx;
  overflow: hidden;
  border-radius: $fish-radius-mid;
  box-shadow: $smooth-shadow-sm;

  --face: radial-gradient(circle at 130% 50%, #cfe1f4, transparent 60%), #ffffff;

  background: var(--face);
}

/*
 * 空态 / 出错时的面。
 *
 * 玻璃面而不是那张淡蓝渐变面 —— 这一档说的是「没有内容」，
 * 拿一张带渐变的卡装一句话，读起来像这张卡坏了。
 *
 * 高度不收：这张卡跟左边那张并排（见 _layout 的 .sect__row），
 * 只有一张塌下去，那一行就参差了。
 */
.days--empty {
  align-items: center;
  justify-content: center;

  /*
   * 渐变层关掉。
   *
   * `background: var(--face)` 是简写，渐变落在 background-image 上；
   * 后面再写 background-color 只是换底色，那两张光晕照样透上来 ——
   * 这张卡就还是一张渐变卡，「没有内容」这一档读不出来。
   */
  background-image: none;

  @include fish-glass;
}

.days__empty {
  color: $fish-muted;
  @include fish-type(subhead);
}

/* 标题。分区标题统一走 headline 一级（跟其余卡片同一档） */
.days__title {
  display: block;
  margin-bottom: 8rpx;
  color: $fish-ink;
  @include fish-type(headline);
}

/*
 * 三行。
 *
 * 每行 flex: 1 —— 行高自己长出来填满方卡，行与行之间等距。
 * 定高会让三行挤在卡的上半张，下半张空着。
 */
.days__rows {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.days__row {
  display: flex;
  flex: 1;
  align-items: center;
}

/* 行间的发丝线。层次靠面不靠描边，但行与行之间那一道例外 —— 它是分隔，不是边框 */
.days__row + .days__row {
  border-top: 1rpx solid $fish-border-40;
}

/* 日期列 */
.days__label {
  width: 56rpx;
  flex-shrink: 0;
  color: $fish-ink;
  @include fish-type(caption2);
}

/*
 * 「今天」靠字重站出来，不靠颜色 —— 加了颜色就变成在提示，
 * 而它其实是状态，不是提醒（跟 HourlyWeather 的首格同一手法）。
 */
.days__label--today {
  font-weight: 600;
}

/*
 * 天气图标。
 *
 * 字形不走字阶：和风图标是字体字形，没有「字重 / 字距 / 行高」的排版语义
 * （理由见 HourlyWeather 的 .hourly__icon）。
 *
 * 压成辅助灰：卡面是中性淡面，图标没有自己的面撑着，
 * 深色字形会跟右边的温度抢 —— 温度才是这一行的读数。
 */
.days__icon {
  width: 36rpx;
  flex-shrink: 0;
  margin-left: 10rpx;
  color: $fish-muted;
  font-size: 36rpx;
  line-height: 1;
}

/* 字体没到位时的占位。尺寸对齐上面的字形盒 */
.days__icon--pending {
  width: 36rpx;
  height: 36rpx;
}

/*
 * 降水概率。
 *
 * 用文字档的蓝（$fish-blue-600）而不是填充档的 $fish-tide：
 * $fish-tide 是给填充用的（逐时那根概率条），当文字读只有 4.0:1，压不住。
 *
 * 不给固定宽：概率有两位也有三位（「60%」「100%」），
 * 宽度跟着内容走，多出来的那一截由中间的弹性空隙吸收 ——
 * 右边的两列温度是定宽右对齐的，不会被概率顶得移位。
 */
.days__prob {
  flex-shrink: 0;
  margin-left: 4rpx;
  color: $fish-blue-600;
  @include fish-type(caption2);

  font-variant-numeric: tabular-nums;
}

/* 把两列温度推到行尾 */
.days__spacer {
  flex: 1;
}

/*
 * 高低温两列。
 *
 * 两列各自右对齐、基线对齐 —— 三行之间要能横着比：
 * 33° / 31° / 28° 一列，25° / 24° / 22° 一列，一眼看完哪几天更暖。
 */
.days__temps {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
}

.days__max {
  color: $fish-ink;
  @include fish-type(caption);
  font-variant-numeric: tabular-nums;
}

.days__min {
  color: $fish-muted;
  @include fish-type(caption2);
  font-variant-numeric: tabular-nums;
}

/*
 * 加载骨架。
 *
 * 每一块的尺寸照着上面真实元素的行盒摆：标题行 46rpx、
 * 日期列 44rpx（列本身固定 56rpx）、图标 36rpx、概率 40rpx、
 * 最高温 40rpx、最低温 36rpx。行高跟着真实行走（flex: 1），
 * 摆的是行盒不是字面高度 —— 占位比真实内容矮一截的话，
 * 数据到了版式一换，下面会往上跳一下，那一跳读起来就是「页面散架了」。
 *
 * 底色用 $fish-surface，呼吸幅度用 0.35 —— 跟 SkeletonCard、HourlyWeather、
 * CurrentWeather、VerdictOverview 同一档，否则同一个页面里两种加载态一深一浅，
 * 像两套组件。
 */
.days__skeleton {
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  animation: days-pulse 1.8s ease-in-out infinite;
}

.days__skeleton--title {
  width: 140rpx;
  height: 46rpx;
  margin-bottom: 8rpx;
}

/* 日期列。与 .days__label 同宽同位，图标才落在同一个 x 上 */
.days__skeleton-cell {
  width: 56rpx;
  flex-shrink: 0;
}

.days__skeleton--label {
  width: 44rpx;
  height: 28rpx;
}

.days__skeleton--icon {
  width: 36rpx;
  height: 36rpx;
  margin-left: 10rpx;
  border-radius: 50%;
}

.days__skeleton--prob {
  width: 40rpx;
  height: 28rpx;
  margin-left: 4rpx;
}

.days__skeleton--max {
  width: 40rpx;
  height: 31rpx;
}

.days__skeleton--min {
  width: 36rpx;
  height: 28rpx;
}

/* 与 SkeletonCard、HourlyWeather、CurrentWeather、VerdictOverview 的同名 keyframes 保持同一档呼吸幅度 */
@keyframes days-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
