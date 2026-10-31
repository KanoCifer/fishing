<template>
  <!--
    当时的天气 —— 这条记录记下那一刻的环境。

    深色面：读数要的是对比，不是存在感；白字压深底比灰字压浅底更稳。

    一张卡上给的东西：潮位（弧形表 + 数字）、涨退与潮差、五项天气读数、
    鱼口指数、距下一潮多久。潮汐那几项是这张卡的主体 ——
    记钓鱼记录的人回看时，最想知道的是「那天潮怎么样」。
  -->
  <view class="wx">
    <view class="wx__head">
      <text class="wx__title">{{ title }}</text>
      <text v-if="tideType" class="wx__chip">{{ tideType }}</text>
    </view>

    <view class="wx__body">
      <!-- 潮位表 -->
      <view v-if="hasTide" class="wx__gauge">
        <TideGauge :value="tideLevel" :size="gaugeSize" :max="tideMax">
          <view class="wx__gauge-center">
            <text class="wx__gauge-value">{{ tideLevelText }}</text>
            <text class="wx__gauge-unit">{{ tideUnit }}</text>
          </view>
        </TideGauge>

        <text v-if="tideRangeText" class="wx__tide-range">{{ tideRangeText }}</text>
      </view>

      <!-- 五项读数，两列 -->
      <view class="wx__readings">
        <view v-for="item in readings" :key="item.key" class="wx__reading">
          <text class="wx__reading-label">{{ item.label }}</text>
          <text class="wx__reading-value">{{ item.value }}</text>
        </view>
      </view>
    </view>

    <!-- 鱼口指数与下一次潮 -->
    <view v-if="hasIndex || nextTideText" class="wx__foot">
      <view v-if="hasIndex" class="wx__index">
        <text class="wx__index-label">{{ indexLabel }}</text>
        <view class="wx__index-dots">
          <view
            v-for="n in 3"
            :key="n"
            class="wx__dot"
            :class="[`wx__dot--${indexTone}`, { 'wx__dot--on': n <= indexLit }]"
          />
        </view>
        <text class="wx__index-word" :class="`wx__index-word--${indexTone}`">{{ indexWord }}</text>
      </view>

      <text v-if="nextTideText" class="wx__next-tide">{{ nextTideText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * RecordWeatherCard —— 一条记录当时的天气。
 *
 * 只被记录详情页用，所以放在页面自己的 components 目录里
 * （与 pages/spot-detail/components 一个惯例）。
 * 记一笔页那张天气卡是**可编辑**的另一套，不共用。
 */
import { computed } from 'vue';

import TideGauge from '@/components/TideGauge/TideGauge.vue';
import { indexCategoryTone } from '@/utils/weather';
import type { FishingLogWeather } from '@/types/record';

const props = defineProps<{
  weather: FishingLogWeather;
}>();

const title = '当时的天气';
/**
 * 那一项的正式名字。
 *
 * 叫「钓鱼指数」而不是「鱼口指数」：本 app 里的「鱼口概率」是服务端
 * 自己算出来的一个 0–100 的分，而这一项是和风官方给的 1–3 档，
 * 两件事不是一回事 —— 名字混了，读的人会以为它们说的是同一个东西。
 */
const indexLabel = '钓鱼指数';
const tideUnit = 'm';

/**
 * 弧形表的满量程（米）。
 *
 * 沿海绝大多数潮差落在这个区间。取满量程而不是取这次的潮差 ——
 * 表是量具，同一把尺子量每一天，量程不该跟着被量的东西变。
 */
const tideMax = 3;

/**
 * 弧形表的边长（rpx）。
 *
 * 跟下面 `.wx__gauge` 的宽度是同一个数 —— 那一条给容器定宽，
 * 这一条给画布定尺寸，两边必须一样，否则表会撑出去或者留白。
 */
const gaugeSize = 180;

/* ── 潮汐 ──────────────────────────────────────────────────────────────── */

/** 有没有潮位 */
const hasTide = computed(() => isNumber(props.weather.tide_level));

/** 潮位（米） */
const tideLevel = computed(() => (hasTide.value ? (props.weather.tide_level as number) : 0));

/** 潮位数字。一位小数 —— 厘米级的潮位变化在这一屏里没有意义 */
const tideLevelText = computed(() => tideLevel.value.toFixed(1));

/** 涨潮 / 退潮 */
const tideType = computed(() => {
  const value = props.weather.tide_type;
  return value === '涨潮' || value === '退潮' ? value : '';
});

/** 潮差 */
const tideRangeText = computed(() => {
  const range = props.weather.tide_range;
  if (!isNumber(range)) return '';
  return `潮差 ${(range as number).toFixed(1)}m`;
});

/**
 * 距下一潮多久。
 *
 * 写「下一潮」而不是「高潮」：潮汐表里高低潮交替，
 * 下一次未必是高潮 —— 说成「高潮」有一半的时候是错的。
 */
const nextTideText = computed(() => {
  const hours = props.weather.hours_to_next_tide;
  if (!isNumber(hours)) return '';

  const value = hours as number;
  if (value <= 0) return '';
  if (value < 1) return '不到 1 小时后到下一潮';
  return `${Math.round(value)} 小时后到下一潮`;
});

/* ── 读数 ──────────────────────────────────────────────────────────────── */

/**
 * 五项读数。
 *
 * 气压取整：两位小数的气压在读数上只是噪音，而且「1013.2hPa」会把
 * 旁边那一格挤开。
 */
const readings = computed(() => {
  const w = props.weather;
  return [
    { key: 'temperature', label: '气温', value: withUnit(w.temperature, '°') },
    { key: 'humidity', label: '湿度', value: withUnit(w.humidity, '%') },
    { key: 'pressure', label: '气压', value: withUnit(w.pressure, 'hPa', 0) },
    { key: 'wind', label: '风速', value: withUnit(w.wind_speed, 'km/h') },
    { key: 'precipitation', label: '降水', value: withUnit(w.precipitation, 'mm') },
  ].filter((item) => item.value);
});

/**
 * 把数字配上单位。
 *
 * 缺值不画「--°」这种空壳 —— 读数没有的时候画一个空壳，
 * 那个空壳会骗人（读成「零度」）。
 */
function withUnit(value: number | undefined, unit: string, digits = 1): string {
  if (!isNumber(value)) return '';
  const factor = 10 ** digits;
  return `${Math.round((value as number) * factor) / factor}${unit}`;
}

/* ── 鱼口指数 ──────────────────────────────────────────────────────────── */

/** 有没有鱼口指数 */
const hasIndex = computed(() => isNumber(props.weather.indices));

/**
 * 指数档位（1–3）。
 *
 * 和风官方钓鱼指数：1 = 适宜 / 2 = 较适宜 / 3 = 不宜（见 utils/feedback.ts）。
 */
const indexLevel = computed(() => {
  const value = props.weather.indices;
  if (!isNumber(value)) return 0;
  return Math.min(3, Math.max(1, Math.round(value as number)));
});

/** 档位词 */
const indexWord = computed(() => {
  if (!hasIndex.value) return '';
  if (indexLevel.value === 1) return '适宜';
  if (indexLevel.value === 2) return '较适宜';
  return '不宜';
});

/** 档位色调。沿用官方生活指数那一套口径（见 utils/weather.ts） */
const indexTone = computed(() => indexCategoryTone(indexWord.value));

/**
 * 亮几盏灯。
 *
 * 反着算：档位 1（适宜）是**最好**的一档，档位 3（不宜）最差。
 * 直接按档位点亮会读成「越差灯越多」。
 */
const indexLit = computed(() => 4 - indexLevel.value);

/** 这个数是不是一个能用的数 */
function isNumber(value: number | undefined): boolean {
  return value !== undefined && value !== null && Number.isFinite(value);
}
</script>

<style lang="scss" scoped>
/*
 * 深色面。
 *
 * 它在这一屏里独占一张卡位 —— 玻璃卡与深色面同屏时两种材质会互相削弱，
 * 这张卡因此不进别的分区。
 */
.wx {
  padding: 28rpx;
  @include fish-deep-face;
}

/* ── 头部 ──────────────────────────────────────────────────────────────── */

.wx__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.wx__title {
  color: $fish-on-dark;
  @include fish-type(headline);
}

/*
 * 涨潮 / 退潮。
 *
 * 深色面上没有「淡底深字」这一档（底色本来就深），
 * 只能反过来用半透明白底压白字 —— 它是这屏里唯一带底色的东西，
 * 刚好够把「涨还是退」这一眼要看到的信息标出来。
 */
.wx__chip {
  padding: 6rpx 20rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-deep-hairline;
  color: $fish-on-dark;
  @include fish-type(caption);

  font-weight: 600;
}

/* ── 主体 ──────────────────────────────────────────────────────────────── */

.wx__body {
  display: flex;
  align-items: flex-start;
  margin-top: 24rpx;
}

/* 潮位表 */
.wx__gauge {
  flex-shrink: 0;
  width: 180rpx;
  margin-right: 14rpx;
}

/*
 * 表心。
 *
 * 数字与单位并排：数字大、单位小，视线先落在数字上。
 */
.wx__gauge-center {
  display: flex;
  align-items: baseline;
}

.wx__gauge-value {
  color: $fish-on-dark;
  @include fish-type(title3);

  font-weight: 700;
}

.wx__gauge-unit {
  margin-left: 4rpx;
  color: $fish-deep-muted;
  @include fish-type(caption2);
}

.wx__tide-range {
  display: block;
  margin-top: 8rpx;
  color: $fish-deep-muted;
  @include fish-type(caption2);

  text-align: center;
}

/*
 * 读数格。两列。
 *
 * 每格占一半宽 —— 百分比宽度而不是 flex: 1：
 * 五个读数要按两列排（最后一行缺一格），
 * flex 均分会把五项摊成一条，读数挤成一串。
 */
.wx__readings {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  min-width: 0;
}

.wx__reading {
  box-sizing: border-box;
  width: 50%;
  padding: 6rpx 0;
}

.wx__reading-label {
  color: $fish-deep-muted;
  @include fish-type(caption2);
}

.wx__reading-value {
  display: block;
  margin-top: 2rpx;
  color: $fish-on-dark;
  @include fish-type(footnote);

  font-weight: 600;

  /* 「1013hPa」与「6.3km/h」同排时不许折行 */
  white-space: nowrap;
}

/* ── 底部 ──────────────────────────────────────────────────────────────── */

.wx__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 22rpx;
  margin-top: 24rpx;
  border-top: 1rpx solid $fish-deep-hairline;
}

.wx__index {
  display: flex;
  align-items: center;
  min-width: 0;
}

.wx__index-label {
  color: $fish-deep-muted;
  @include fish-type(caption2);
}

/*
 * 三盏灯。
 *
 * 亮着的按档位取色：绿=适宜、蓝=较适宜、红=不宜。
 * 深色面上没有「淡底深字」那一档，灯本身不用底色，
 * 颜色直接压在深底上。
 *
 * 亮与暗用两个类组合出来，不靠属性选择器 ——
 * WXSS 不认 `[...]`（见 docs/mp-weixin-platform.md）。
 */
.wx__index-dots {
  display: flex;
  align-items: center;
  margin: 0 12rpx;
}

.wx__dot {
  width: 14rpx;
  height: 14rpx;
  margin-right: 8rpx;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.24);
}

.wx__dot:last-child {
  margin-right: 0;
}

.wx__dot--on.wx__dot--success {
  background-color: $fish-success;
}

.wx__dot--on.wx__dot--blue {
  background-color: $fish-gauge-from;
}

.wx__dot--on.wx__dot--destructive {
  background-color: $fish-destructive;
}

.wx__index-word {
  @include fish-type(caption);

  font-weight: 600;
}

.wx__index-word--success {
  color: $fish-success;
}

.wx__index-word--blue {
  color: $fish-gauge-from;
}

.wx__index-word--destructive {
  color: $fish-destructive;
}

.wx__next-tide {
  flex-shrink: 0;
  margin-left: 16rpx;
  color: $fish-deep-muted;
  @include fish-type(caption2);
}
</style>
