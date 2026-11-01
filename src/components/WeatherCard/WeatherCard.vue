<template>
  <view class="weather-card">
    <!--
      加载中：骨架照着折叠态那一行摆。

      有数据时刷新不算加载 —— 把已有读数换成骨架，读的人会以为数据没了。
    -->
    <view v-if="mapStore.weatherLoading && !rows.length" class="weather-card__toggle">
      <view class="weather-card__skeleton weather-card__skeleton--summary" />
      <view class="weather-card__skeleton weather-card__skeleton--chev" />
    </view>

    <text v-else-if="mapStore.weatherError" class="weather-card__error">
      {{ mapStore.weatherError }}
    </text>

    <text v-else-if="!rows.length" class="weather-card__empty">暂无天气数据，刷新可重试</text>

    <view v-else class="weather-card__body">
      <!--
        摘要行同时是展开/收起的把手。

        命中区是整行：它是一个可点的控件，按在字上比按在小三角上准得多。
      -->
      <view class="weather-card__toggle" @tap="expanded = !expanded">
        <text class="weather-card__summary">{{ summary }}</text>
        <image
          class="weather-card__chev"
          :class="{ 'weather-card__chev--up': expanded }"
          :src="chevronIcon"
          mode="aspectFit"
        />
      </view>

      <view class="weather-card__grid" :class="{ 'weather-card__grid__show': expanded }">
        <view class="weather-card__grid-inner">
          <view v-for="row in rows" :key="row.label" class="weather-card__cell">
            <text class="weather-card__cell-label">{{ row.label }}</text>
            <view class="weather-card__cell-value-row">
              <text class="weather-card__cell-value" :class="row.tone ? `weather-card__cell-value--${row.tone}` : ''">
                {{ row.value }}
              </text>
              <text v-if="row.badge" class="weather-card__badge" :class="`weather-card__badge--${row.badge.tone}`">
                {{ row.badge.text }}
              </text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * WeatherCard —— 对应源项目 WeatherCard。
 *
 * 与源版本的差异：
 * - 去掉 lucide 图标（气象计/眼睛/指南针等）。小程序不能内联 SVG，
 *   为 5 个装饰性图标各引一张 PNG 不划算，读数本身已有文字标签，
 *   图标只是冗余。
 * - 去掉跳转和风天气的外链。
 * - 去掉三日预报横排：多日预报另有卡片，两处都在同一屏上重复同一组数字。
 * - 气压状态不再单占一行：它跟气压是同一件事（数值 + 这一档怎么读），
 *   拆成两行就是同一个数说了两遍。现在并进气压那一行，档位做成徽标。
 */
import { computed, ref } from 'vue';

import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import { num, precipTypeCn, pressureLevel, uvLevel } from '@/utils/weather';

const mapStore = useFishingMapStore();

/**
 * 展开态。默认折起。
 *
 * 这一段在页面很靠下，而十项读数一次铺开就是半屏高 ——
 * 首屏往下的空间要留给还要做决定的内容，不是给一屏读数。
 */
const expanded = ref(false);

/** 一行读数 */
interface Row {
  label: string;
  value: string;
  /** 语义色调。有色调时值会跟着染色 */
  tone?: string;
  /** 值后面的徽标：状态（气压正常）、档位（紫外线强） */
  badge?: { text: string; tone: string };
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
    {
      label: '气压',
      value: withUnit(live.pressure, 'hPa', true),
      badge: pressureInfo ? { text: pressureInfo.label, tone: pressureInfo.tone } : undefined,
    },
    { label: '能见度', value: withUnit(live.vis, 'km', true) },
    { label: '风', value: windValue.value },
    { label: '阵风', value: windGustValue.value },
    { label: '降水', value: precipValue.value },
    { label: '云量', value: withUnit(live.cloud, '%') },
    {
      label: '紫外线',
      value: uv.value ? String(uv.value.value) : '--',
      badge: uv.value ? { text: uv.value.label, tone: uv.value.tone } : undefined,
    },
    { label: '露点', value: withUnit(live.dew, '°C') },
  ];
});

/**
 * 折起来那一行给的摘要：体感、气压状态、风。
 *
 * 三项都是「出门前先问自己一遍」的：穿多少、能不能钓、风大不大能抛竿吗。
 * 气压那一项给的是**档位**（正常 / 偏高），不是数值 ——
 * 数值在展开后的网格里，摘要只给读得懂的那一档。
 */
const summary = computed(() => {
  const live = mapStore.liveWeather;
  if (!live) return '';

  const parts: string[] = [];

  const feels = num(live.feelsLike);
  if (feels !== null) parts.push(`体感 ${feels}°`);

  const pressureInfo = pressure.value;
  if (pressureInfo) parts.push(`气压${pressureInfo.label}`);

  const wind: string[] = [];
  if (live.windDir) wind.push(live.windDir);
  if (live.windScale) wind.push(`${live.windScale} 级`);
  if (wind.length) parts.push(wind.join(' '));

  return parts.join(' · ');
});

/** 收起方向的小三角。展开时转 180° —— 方向是状态的一部分 */
const chevronIcon = icon('chevron-down', 'muted60');
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
 * 摘要行 —— 同时是展开/收起的把手。
 *
 * 命中区整行 88rpx（44pt）：它是一个可点的控件，
 * 按在字上比按在小三角上准得多。
 */
.weather-card__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88rpx;
  @include fish-press-dim;
}

.weather-card__summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: $fish-muted;
  @include fish-type(body);

  white-space: nowrap;
  text-overflow: ellipsis;
}

.weather-card__chev {
  width: 28rpx;
  height: 28rpx;
  margin-left: 16rpx;
  flex-shrink: 0;
  opacity: 0.6;
}

.weather-card__chev--up {
  transform: rotate(180deg);
}

/*
 * 展开 / 收起 —— 用 grid 的行轨道高度做过渡。
 *
 * 为什么不用 max-height：max-height 得先猜一个上限。猜小了内容被切掉半截，
 * 猜大了动画的最后一段是「卡住不动」的假动作。
 * grid-template-rows: 0fr → 1fr 让轨道高度跟着内容走 ——
 * 展开多高由内容决定，一行 JS 都不用量。
 *
 * 结构上必须多一层内层容器：0fr 只压得住**一行**。
 * 十格直接挂在 0fr 的容器里，第三格起会掉进自动行（auto 高，压不动），
 * 收起时下半屏还留在卡里。内层是被压的那一行，
 * 它自己 overflow: hidden 把内容裁掉，轨道才真的能收到 0。
 *
 * 代价：这条过渡动的是高度，每一帧都要重排这十格。
 * 十格是小树，一次重排几毫秒，换来「不用猜高度」，值。
 *
 * 支持度：grid-template-rows 的插值动画 Chrome 107+ / Firefox 66+ / Safari 16+。
 * 更老的内核不认这条过渡 —— 展开收起照样能用，只是没有动画，直接跳变。
 */
.weather-card__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 0fr;

  /* 260ms：展开是紧跟着手指抬起的一次动作，500ms 那一档慢成「界面在等」 */
  transition: grid-template-rows $fish-dur-press $fish-ease-out;
}

.weather-card__grid__show {
  grid-template-rows: 1fr;
}

/* 被压住的那一行。两列排布也在这层：轨道只管高度，不管排版 */
.weather-card__grid-inner {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  min-height: 0;
  overflow: hidden;
}

/*
 * 一格。标签在上、数值在下 ——
 * 这一组的读法是「先知道这是哪一项，再读它的值」。
 */
.weather-card__cell {
  box-sizing: border-box;
  padding: 20rpx 0;
  border-bottom: 1rpx solid $fish-border-40;
}

/* 右列：左边让出一道竖发丝线，两列读起来是并排的两张清单 */
.weather-card__cell:nth-child(2n) {
  padding-left: 24rpx;
  border-left: 1rpx solid $fish-border-40;
}

/* 最后一行不留底线 */
.weather-card__cell:nth-last-child(-n + 2) {
  border-bottom: none;
}

.weather-card__cell-label {
  display: block;
  color: $fish-muted-60;
  @include fish-type(caption);
}

.weather-card__cell-value-row {
  display: flex;
  align-items: center;
  margin-top: 6rpx;
}

.weather-card__cell-value {
  color: $fish-ink;
  @include fish-type(body);

  font-weight: 600;
  /* 读数纵向对齐：数字多的那几行（气压、露点）不该因为位数不同而左右飘 */
  font-variant-numeric: tabular-nums;
}

.weather-card__cell-value--success {
  color: $fish-success-ink;
}

.weather-card__cell-value--warning {
  color: $fish-warning-ink;
}

.weather-card__cell-value--destructive {
  color: $fish-destructive-ink;
}

.weather-card__cell-value--muted {
  color: $fish-muted;
}

/*
 * 徽标：淡底 + 深字（与 LifeIndexCard 的 life__badge 同一套）。
 *
 * 深底白字在 12pt 上要过 4.5:1 才读得清，警告档与危险档都过不了 ——
 * 徽标字号小、字重要少，容不下那种对比度。淡底深字反过来：
 * 底色保持「这一档的颜色」这个信号，字用压深档，两边都不牺牲。
 */
.weather-card__badge {
  flex-shrink: 0;
  margin-left: 12rpx;
  padding: 2rpx 14rpx;
  border-radius: $fish-radius-pill;
  @include fish-type(caption);

  font-weight: 600;
}

.weather-card__badge--success {
  color: $fish-success-ink;
  background-color: $fish-tone-tint;
}

.weather-card__badge--blue {
  color: $fish-blue-600;
  background-color: $fish-accent-tint;
}

.weather-card__badge--warning {
  color: $fish-warning-ink;
  background-color: $fish-warning-tint;
}

.weather-card__badge--destructive {
  color: $fish-destructive-ink;
  background-color: $fish-destructive-tint;
}

.weather-card__badge--muted {
  color: $fish-muted;
  background-color: $fish-surface;
}

/*
 * 加载骨架。照着折叠态那一行摆：
 * 摘要一行 + 一个小三角。数据到了不会换版。
 *
 * 底色用 $fish-surface，呼吸幅度用 0.35 —— 与 SkeletonCard、HourlyWeather、
 * CurrentWeather、VerdictOverview 同一档，否则同一个页面里两种加载态
 * 一深一浅，像两套组件。
 */
.weather-card__skeleton {
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.weather-card__skeleton--summary {
  width: 320rpx;
  height: 30rpx;
}

.weather-card__skeleton--chev {
  width: 28rpx;
  height: 28rpx;
  margin-left: 16rpx;
  flex-shrink: 0;
}

.weather-card__error {
  color: $fish-destructive-ink;
  @include fish-type(body);
}

.weather-card__empty {
  color: $fish-muted;
  @include fish-type(body);
}
</style>
