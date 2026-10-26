<template>
  <!--
    天气详情 —— 实况的逐项读数。

    卡片自己不带标题：这一段在数据页里已经有分组标题「天气详情」了，
    卡片里再写一遍就成了「天气详情 / 天气详情」叠着说同一件事。

    这里原来还有一条三日预报的横排 —— 它和多日预报那张卡是同一件事说了两遍，
    两边都在同一屏上，一眼看过去是「今天 33°/25°」出现了两次。
    多日预报那张卡管多天（还有白天天气和降水概率），这里只管**当下这一刻**
    的实测读数，所以横排预报整条去掉了。

    源版本这里还有个跳转和风天气官网的链接（window.open），
    小程序没有 window.open，外链只能走 web-view 组件，
    为一个版权署名开一整页 web-view 不值得，直接去掉。
  -->
  <view class="weather-card">
    <SkeletonCard v-if="mapStore.weatherLoading" has-bottom-row />

    <text v-else-if="mapStore.weatherError" class="weather-card__error">
      {{ mapStore.weatherError }}
    </text>

    <view v-else-if="rows.length" class="weather-card__body">
      <!--
        读数表由数据驱动，不用一行行写死：
        新增一个字段就是数组里加一项，不用再抄一遍标签、值、色调三样东西。
      -->
      <view v-for="row in rows" :key="row.label" class="weather-card__row">
        <view class="weather-card__row-head">
          <!-- 状态点只给「气压状态」用，它承载的是颜色语义 -->
          <view v-if="row.dot" class="weather-card__dot" :class="`weather-card__dot--${row.tone}`" />
          <text class="weather-card__row-label">{{ row.label }}</text>
        </view>
        <text class="weather-card__row-value" :class="row.tone ? `weather-card__row-value--${row.tone}` : ''">
          {{ row.value }}
        </text>
      </view>
    </view>

    <text v-else class="weather-card__empty">暂无天气数据</text>
  </view>
</template>

<script setup lang="ts">
/**
 * WeatherCard —— 对应源项目 WeatherCard。
 *
 * 与源版本的差异：
 * - 去掉 lucide 图标（气象计/眼睛/指南针等）。小程序不能内联 SVG，
 *   为 5 个装饰性图标各引一张 PNG 不划算，行列本身已有文字标签，
 *   图标只是冗余。唯一保留的是气压状态点 —— 它承载的是颜色语义。
 * - 去掉跳转和风天气的外链。
 * - 去掉三日预报横排：多日预报另有卡片，两处都在同一屏上重复同一组数字。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import { num, precipTypeCn, pressureLevel, uvLevel } from '@/utils/weather';

import SkeletonCard from '../SkeletonCard/SkeletonCard.vue';

const mapStore = useFishingMapStore();

/** 一行读数 */
interface Row {
  label: string;
  value: string;
  /** 语义色调。有色调时值会跟着染色 */
  tone?: string;
  /** 标签前带一个状态点 */
  dot?: boolean;
}

/**
 * 风速换算：视图模型存的是 km/h，界面上给 m/s。
 *
 * 钓鱼看的是 m/s —— 3 m/s 和 11 m/s 在竿子上的分量完全不同，
 * 而 km/h 的数字读起来总是偏大。转不动时留空串，
 * 免得模板渲染成 "NaN m/s"。
 */
function toMs(value: string | undefined): string {
  const kmh = num(value);
  if (kmh === null) return '';
  return `${(kmh / 3.6).toFixed(1)} m/s`;
}

/** 数值 + 单位。空值给 '--'，不要拼出光秃秃的「°C」 */
function withUnit(value: string | undefined, unit: string, spaced = false): string {
  if (!value) return '--';
  return spaced ? `${value} ${unit}` : `${value}${unit}`;
}

const pressure = computed(() => {
  const hpa = num(mapStore.liveWeather?.pressure);
  if (hpa === null) return null;
  return pressureLevel(hpa);
});

/** 风：风向 + 风速 + 风力等级。缺哪项就少哪项，不留空位 */
const windValue = computed(() => {
  const live = mapStore.liveWeather;
  if (!live) return '--';

  const parts: string[] = [];
  if (live.windDir) parts.push(live.windDir);

  const speed = toMs(live.windSpeed);
  if (speed) parts.push(speed);

  if (live.windScale) parts.push(`${live.windScale} 级`);

  return parts.length ? parts.join(' · ') : '--';
});

/** 阵风。持续风小、阵风大的日子是「看着温和其实危险」的那种 */
const windGustValue = computed(() => {
  const gust = toMs(mapStore.liveWeather?.windGust);
  return gust || '--';
});

/**
 * 降水：量 + 强度 + 类型。
 *
 * 强度为 0 时不显示（0 mm/h 是废话），类型「无」也不显示 ——
 * 「0 mm · 无」读起来像有个什么东西要下，只是什么都没下。
 */
const precipValue = computed(() => {
  const live = mapStore.liveWeather;
  if (!live) return '--';

  const parts: string[] = [];
  if (live.precip) parts.push(`${live.precip} mm`);

  const intensity = num(live.precipIntensity);
  if (intensity !== null && intensity > 0) parts.push(`${intensity} mm/h`);

  const type = precipTypeCn(live.precipType);
  if (type && type !== '无') parts.push(type);

  return parts.length ? parts.join(' · ') : '--';
});

/** 紫外线：数值 + 档位。档位带色调 —— 强和极强是两回事 */
const uv = computed(() => {
  const value = num(mapStore.liveWeather?.uvIndex);
  if (value === null) return null;
  return { value, ...uvLevel(value) };
});

const rows = computed<Row[]>(() => {
  const live = mapStore.liveWeather;
  if (!live) return [];

  const pressureInfo = pressure.value;

  return [
    { label: '体感温度', value: withUnit(live.feelsLike, '°C') },
    { label: '相对湿度', value: withUnit(live.humidity, '%') },
    { label: '气压', value: withUnit(live.pressure, 'hPa', true) },
    {
      label: '气压状态',
      value: pressureInfo?.label ?? '--',
      tone: pressureInfo?.tone,
      dot: true,
    },
    { label: '能见度', value: withUnit(live.vis, 'km', true) },
    { label: '风', value: windValue.value },
    { label: '阵风', value: windGustValue.value },
    { label: '降水', value: precipValue.value },
    { label: '云量', value: withUnit(live.cloud, '%') },
    {
      label: '紫外线',
      value: uv.value ? `${uv.value.value} · ${uv.value.label}` : '--',
      tone: uv.value?.tone,
    },
    { label: '露点', value: withUnit(live.dew, '°C') },
  ];
});
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.weather-card {
  @include fish-card;
}

.weather-card__body {
  display: flex;
  flex-direction: column;
}

/*
 * 逐项读数。
 *
 * 行直接坐在玻璃卡上，不套一层白底：卡面本身已经是「浮起来的一层」，
 * 里面再垫一块实色白就变成贴纸了。行与行之间靠发丝线分。
 */

/* 行间 1rpx 发丝线。2rpx 在 375pt 机型上是 1pt，是 iOS 分隔线的三倍厚。
   左右不留白：文字与卡片的内容边缘对齐，分隔线也就从卡片左边一直走到右边，
   读起来是「这张卡里的一列行」，不是「卡里又嵌了一块白板」。 */
.weather-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 0;
  border-bottom: 1rpx solid $fish-border;
}

.weather-card__row:last-child {
  border-bottom: none;
}

.weather-card__row-head {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* 状态点用填充档的绿/红/橙，右侧文字用压深档（见令牌层 _color.scss 的说明） */
.weather-card__dot {
  width: 16rpx;
  height: 16rpx;
  margin-right: 20rpx;
  border-radius: 50%;
}

.weather-card__dot--success {
  background-color: $fish-success;
}

.weather-card__dot--warning {
  background-color: $fish-warning;
}

.weather-card__dot--destructive {
  background-color: $fish-destructive;
}

.weather-card__dot--muted {
  background-color: $fish-faint;
}

.weather-card__row-label {
  color: $fish-muted;
  @include fish-type(subhead);
}

.weather-card__row-value {
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
  /* 读数纵向对齐：数字多的那几行（气压、露点）不该因为位数不同而左右飘 */
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.weather-card__row-value--success {
  color: $fish-success-ink;
}

.weather-card__row-value--warning {
  color: $fish-warning-ink;
}

.weather-card__row-value--destructive {
  color: $fish-destructive-ink;
}

.weather-card__row-value--muted {
  color: $fish-muted;
}

.weather-card__error {
  color: $fish-destructive;
  @include fish-type(callout);
}

.weather-card__empty {
  color: $fish-muted;
  @include fish-type(callout);
}
</style>
