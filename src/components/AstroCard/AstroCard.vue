<template>
  <!--
    日照与月相 —— 一天里什么时候能下水、什么时候能收竿。

    为什么值得单独一张卡：钓鱼是**跟日照过不去**的活。
    33 度的晴天下午两点和清早六点，鱼口完全是两回事 ——
    但「晴 / 33°」这个读数里没有这句话，只有「日出 06:25、日落 17:56」里有。

    时间轴那一段是这张卡的主干：一条按真实比例排的 24 小时轨道，
    暖色的一段是白昼，两头浅一档的是民用晨昏，剩下的是夜。
    圆点标着「现在」。扫一眼就知道今天还剩多少天光。
  -->
  <view class="astro">
    <view class="astro__head">
      <text class="astro__title">日照与月相</text>
      <text class="astro__meta">{{ dateLabel }}</text>
    </view>

    <view v-if="day" class="astro__body">
      <!-- 日：日出 / 正午 / 日落 -->
      <view class="astro__triplet">
        <view class="astro__slot">
          <text class="astro__slot-label">日出</text>
          <text class="astro__slot-value">{{ day.sunrise || '--' }}</text>
        </view>
        <view class="astro__slot">
          <text class="astro__slot-label">正午</text>
          <text class="astro__slot-value">{{ day.solarNoon || '--' }}</text>
        </view>
        <view class="astro__slot">
          <text class="astro__slot-label">日落</text>
          <text class="astro__slot-value">{{ day.sunset || '--' }}</text>
        </view>
      </view>

      <!--
        24 小时轨道。三段都是按真实时刻换算的比例，不做视觉上的匀分 ——
        匀分出来的时间轴会骗人：6 月和 12 月的白昼长度差一倍，
        一条等长的暖色带在这两幅图里完全不是同一件事。
      -->
      <view class="astro__track">
        <view
          v-if="timeline.dawnBand"
          class="astro__band astro__band--twilight"
          :style="bandStyle(timeline.dawnBand)"
        />
        <view v-if="timeline.dayBand" class="astro__band astro__band--day" :style="bandStyle(timeline.dayBand)" />
        <view
          v-if="timeline.duskBand"
          class="astro__band astro__band--twilight"
          :style="bandStyle(timeline.duskBand)"
        />

        <!--
          「现在」。白点 + 一圈深色描边：轨道是暖色的，纯白点在亮段上会糊掉，
          描边让它在任何一段上都读得出位置。
        -->
        <view v-if="timeline.nowPercent !== null" class="astro__now" :style="`left:${timeline.nowPercent}%`" />
      </view>

      <view class="astro__notes">
        <text v-if="daylightText" class="astro__note">{{ daylightText }}</text>
        <text v-if="civilText" class="astro__note">{{ civilText }}</text>
      </view>

      <!-- 分隔：日与月是两件事，中间用发丝线断开 -->
      <view class="astro__rule" />

      <!-- 月：月相 + 月出 / 中天 / 月落 -->
      <view class="astro__phase">
        <!--
          月相图标。和风的月相图标是 800-807 这一段（新月 → 残月），
          码由 `astro.moonPhase` 的英文代码换算而来（见 utils/weather 的
          MOON_PHASE_ICON_CODES）。认不出的月相不画图标 —— 那一格留空，
          比画一个 999 的云形字形诚实。

          字体没到位时同样不画：这一行的文字是「盈凸月」，图标只是它的图示，
          少一个图示不影响读数（不像逐时预报那样是唯一的信息）。
        -->
        <text v-if="qweatherFontReady && moonIconClass" :class="['astro__moon', moonIconClass]" />
        <text class="astro__phase-text">{{ day.moonPhase || '月相未知' }}</text>
      </view>

      <view class="astro__triplet">
        <view class="astro__slot">
          <text class="astro__slot-label">月出</text>
          <text class="astro__slot-value">{{ day.moonrise || '--' }}</text>
        </view>
        <view class="astro__slot">
          <text class="astro__slot-label">中天</text>
          <text class="astro__slot-value">{{ day.moonTransit || '--' }}</text>
        </view>
        <view class="astro__slot">
          <text class="astro__slot-label">月落</text>
          <text class="astro__slot-value">{{ day.moonset || '--' }}</text>
        </view>
      </view>
    </view>

    <text v-else class="astro__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * AstroCard —— 日照时段与月相。
 *
 * 取的是当天那一条日预报（forecasts[0]）里的 astro 块。
 * 新版和风的日预报把天文现象放进了这一块，日出日落、月出月落都在那儿。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { qweatherFontReady } from '@/composables/useQweatherFont';
import { useFishingMapStore } from '@/stores/fishingMap';
import { durationBetween, minutesOfDay, shortDate } from '@/utils/date';
import { moonPhaseIconClass } from '@/utils/weather';

const mapStore = useFishingMapStore();

/** 一天 1440 分钟。时间轴的比例尺 */
const DAY_MINUTES = 24 * 60;

/** 当天的日预报 */
const day = computed(() => mapStore.forecasts[0] ?? null);

const dateLabel = computed(() => (day.value?.fxDate ? shortDate(day.value.fxDate) : ''));

/**
 * 月相图标的 class。
 *
 * 空串表示这一天的月相不认识（上游新增了代码，或当天没给 astro），
 * 模板据此不画图标，只留中文名。
 */
const moonIconClass = computed(() => moonPhaseIconClass(day.value?.moonPhaseCode ?? ''));

/**
 * 现在的时刻（当天第几分钟）。
 *
 * 用设备本地时间：这里问的是「我现在站在这条轨道上的哪一点」，
 * 而用户手里的钟就是这个时区。接口给的日出日落带 +08:00，
 * 对国内的钓鱼人两者是同一片天。
 */
function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const nowMinutes = ref(currentMinutes());

/**
 * 每分钟走一次。
 *
 * 不刷新的话，圆点会一直停在打开页面的那一秒 —— 一张会自己说谎的图，
 * 比没有这张图更糟。一分钟一次足够：圆点是分钟级的位置，
 * 每一帧都重算是白花钱。
 */
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => {
    nowMinutes.value = currentMinutes();
  }, 60_000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

/**
 * 时间轴上的三段。
 *
 * 每一段都是「起点 + 长度」，按当天第几分钟换算成百分比。
 * 段算不出来就整段不画 —— 宁可轨道上少一段，也不要画一段位置不对的。
 */
const timeline = computed(() => {
  const source = day.value;
  const sunrise = minutesOfDay(source?.sunrise);
  const sunset = minutesOfDay(source?.sunset);
  const civilDawn = minutesOfDay(source?.civilDawn);
  const civilDusk = minutesOfDay(source?.civilDusk);

  const percent = (minutes: number): number => (minutes / DAY_MINUTES) * 100;

  const span = (from: number | null, to: number | null): { left: number; width: number } | null => {
    if (from === null || to === null || to <= from) return null;
    return { left: percent(from), width: percent(to - from) };
  };

  /**
   * 晨昏带的下限。
   *
   * 民用晨昏只有二十几分钟，占一天不到 2% —— 按真比例画出来是一条
   * 一两个像素宽的缝，在手机上跟渲染瑕疵分不出来。所以给它一个下限：
   * 位置仍然按真时刻算，长度保证看得见。
   * 这是整张图里唯一一处「画得比真值粗」的地方，白昼那一段是严格按比例的。
   */
  const TWILIGHT_MIN_PERCENT = 2.4;

  const widen = (band: { left: number; width: number } | null): { left: number; width: number } | null => {
    if (!band) return null;
    if (band.width >= TWILIGHT_MIN_PERCENT) return band;
    return { left: band.left, width: TWILIGHT_MIN_PERCENT };
  };

  const now = nowMinutes.value;

  return {
    dayBand: span(sunrise, sunset),
    dawnBand: widen(span(civilDawn, sunrise)),
    duskBand: widen(span(sunset, civilDusk)),
    nowPercent: now >= 0 && now <= DAY_MINUTES ? percent(now) : null,
  };
});

/** 段 → 行内样式。rpx 只对样式文件有效，行内样式这里统一用百分比 */
function bandStyle(band: { left: number; width: number }): string {
  return `left:${band.left}%;width:${band.width}%`;
}

/** 白昼时长：「白昼 11小时31分」 */
const daylightText = computed(() => {
  const text = durationBetween(day.value?.sunrise ?? '', day.value?.sunset ?? '');
  return text ? `白昼 ${text}` : '';
});

/** 民用晨昏：「民用晨昏 06:02–18:19」。天亮到天黑之间那两段微光 */
const civilText = computed(() => {
  const dawn = day.value?.civilDawn ?? '';
  const dusk = day.value?.civilDusk ?? '';
  if (!dawn || !dusk) return '';
  return `民用晨昏 ${dawn}–${dusk}`;
});

const emptyText = computed(() =>
  mapStore.weatherLoading ? '加载中…' : mapStore.forecasts.length ? '暂无日照数据' : '暂无预报数据',
);
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.astro {
  @include fish-card;
}

.astro__head {
  @include fish-card-head;
}

/* 分区标题统一走 headline 一级（见 DayForecast 同名注释） */
.astro__title {
  @include fish-card-title;
}

.astro__meta {
  @include fish-card-meta;
}

.astro__body {
  display: flex;
  flex-direction: column;
}

/*
 * 三格读数。
 *
 * 标签在上、数值在下：这一组的读法是「先知道这是哪一项，再读它的值」，
 * 横排（值在左、标签在右）会把两组数字挤在一条基线上互相干扰。
 */
.astro__triplet {
  display: flex;
}

.astro__slot {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.astro__slot-label {
  display: block;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.astro__slot-value {
  display: block;
  margin-top: 4rpx;
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/*
 * 24 小时轨道。
 *
 * 底色是中性填充 —— 夜就是「没有暖色」，不用再给它染一层深蓝。
 * 段和段都绝对定位，轨道本身不参与排版。
 */
.astro__track {
  position: relative;
  height: 16rpx;
  margin-top: 24rpx;
  overflow: hidden;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

.astro__band {
  position: absolute;
  top: 0;
  height: 100%;
}

/* 白昼：暖色。两个色标在同一片暖调里，读作「同一种日光的两端」 */
.astro__band--day {
  background-image: linear-gradient(90deg, $fish-sun 0%, $fish-sun-soft 100%);
}

/* 民用晨昏：同一支暖色压淡，是白昼的余韵而不是白昼本身 */
.astro__band--twilight {
  background-color: rgba(255, 149, 0, 0.3);
}

/* 「现在」 */
.astro__now {
  position: absolute;
  top: 50%;
  width: 16rpx;
  height: 16rpx;
  margin-left: -8rpx;
  border-radius: 50%;
  background-color: $fish-page;
  box-shadow: 0 0 0 4rpx rgba(0, 0, 0, 0.16);
  transform: translateY(-50%);
}

.astro__notes {
  display: flex;
  margin-top: 16rpx;
}

.astro__note {
  margin-right: 24rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

/* 日与月之间的发丝线 */
.astro__rule {
  height: 1rpx;
  margin: 24rpx 0;
  background-color: $fish-border-40;
}

.astro__phase {
  display: flex;
  align-items: center;
}

/*
 * 月相图标字形不走字阶，理由见 HourlyWeather 的 .hourly__icon。
 *
 * 压成辅助灰：这一格里真正要读的是「盈凸月」三个字，图标是那三个字的
 * 图示说明，不该跟文字抢主次。
 */
.astro__moon {
  margin-right: 14rpx;
  font-size: 36rpx;
  line-height: 1;
  color: $fish-muted;
}

.astro__phase-text {
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
}
</style>
