<template>
  <view class="weather">
    <!--
      骨架与实读数叠在同一个格子里交叉淡入：
      读数到了，内容淡入落位、同一时刻骨架淡出（见 composables/useCrossFade）。

      有数据时刷新不算加载 —— 把已有读数换成骨架，读的人会以为数据没了。
    -->
    <view class="weather__stack">
      <view v-if="showTiles" class="weather__content">
        <view class="weather__body">
          <view class="weather__head">
            <text class="weather__title">实况读数</text>
            <text v-if="updatedAt" class="weather__meta">{{ updatedAt }} 更新</text>
          </view>

          <view class="weather__grid">
            <view v-for="tile in tiles" :key="tile.key" class="weather__tile">
              <view class="weather__tile-head">
                <text class="weather__tile-title">{{ tile.title }}</text>
                <image class="weather__tile-icon" :src="tile.icon" mode="aspectFit" />
              </view>

              <view class="weather__tile-value">
                <text class="weather__tile-num">{{ tile.value }}</text>
                <text v-if="tile.unit" class="weather__tile-unit">{{ tile.unit }}</text>
              </view>

              <view class="weather__tile-foot">
                <text class="weather__tile-level" :class="`weather__tile-level--${tile.tone}`">
                  {{ tile.level }}
                </text>
                <text v-if="tile.note" class="weather__tile-note">{{ tile.note }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载中：骨架照着磁贴排 -->
      <view
        v-if="skeletonVisible"
        class="weather__skeleton-layer"
        :class="{ 'weather__skeleton-layer--out': showTiles }"
      >
        <view class="weather__grid">
          <view v-for="i in 9" :key="i" class="weather__tile weather__tile--skeleton">
            <view class="weather__sk weather__sk--title" />
            <view class="weather__sk weather__sk--value" />
            <view class="weather__sk weather__sk--level" />
          </view>
        </view>
      </view>
    </view>

    <text v-if="conditionsStore.weatherError && !skeletonVisible" class="weather__error">
      {{ conditionsStore.weatherError }}
    </text>

    <text v-else-if="!tiles.length && !skeletonVisible" class="weather__empty">暂无天气数据，刷新可重试</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useCrossFade } from '@/composables/useCrossFade';
import { icon, type IconName } from '@/constants/icons';
import { useSurface } from '@/composables/useSurface';
import { useConditionsStore } from '@/stores/conditions';
import { formatTimeOfDay } from '@/utils/date';
import { toFiniteNumber } from '@/utils/number';
import {
  cloudLevel,
  dewLevel,
  humidityLevel,
  precipLevel,
  precipTypeCn,
  pressureLevel,
  uvLevel,
  visibilityLevel,
  windLevel,
} from '@/utils/weather';
import type { Tone } from '@/types/view';

const conditionsStore = useConditionsStore();

/**
 * 这一块压在什么上面。
 *
 * 这一张卡有两处用：天气页（压在整页照片上）与记录详情页（普通页面）。
 * 两处的磁贴底不一样，图标色也就必须跟着走 ——
 * 图标是烤进 data URI 的，CSS 变量改不动它（见 utils/theme 的说明）。
 */
const surface = useSurface();

/** 图标色档：照片面上压白，普通页面上压深墨 */
const iconTier = computed(() => (surface === 'photo' ? 'onPhoto' : 'ink'));

/** 一格磁贴 */
interface Tile {
  key: string;
  title: string;
  /** 图标数据 URI。标识用的图标一律用 ink 色 —— 它不是状态信号 */
  icon: string;
  value: string;
  unit: string;
  /** 档位词：这一格读数怎么样 */
  level: string;
  tone: Tone;
  /** 补充信息。放不进大数字里的那一部分（风向、降水类型） */
  note?: string;
}

function makeTile(t: {
  key: string;
  title: string;
  iconName: IconName;
  value: string;
  unit: string;
  level: { label: string; tone?: Tone } | null;
  note?: string;
}): Tile {
  return {
    key: t.key,
    title: t.title,
    icon: icon(t.iconName, iconTier.value),
    value: t.value,
    unit: t.unit,
    level: t.level?.label ?? '--',
    tone: t.level?.tone ?? 'muted',
    note: t.note,
  };
}

/**
 * 风速换算：视图模型存的是 km/h，界面上给 m/s。
 *
 * 钓鱼看的是 m/s —— 3 m/s 和 11 m/s 在竿子上的分量完全不同，
 * 而 km/h 的数字读起来总是偏大。转不动时留 '--'，
 * 免得模板渲染成 "NaN m/s"。
 */
function toMs(value: string | undefined): number | null {
  const kmh = toFiniteNumber(value);
  if (kmh === null) return null;
  return kmh / 3.6;
}

/** 数值转显示串。整数不带小数点，缺失给 '--' */
function fmt(value: number | null): string {
  if (value === null) return '--';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const tiles = computed<Tile[]>(() => {
  const live = conditionsStore.liveWeather;
  if (!live) return [];

  const out: Tile[] = [];

  const humidity = toFiniteNumber(live.humidity);
  out.push(
    makeTile({
      key: 'humidity',
      title: '相对湿度',
      iconName: 'droplet',
      value: fmt(humidity),
      unit: '%',
      level: humidity === null ? null : humidityLevel(humidity),
    }),
  );

  const pressure = toFiniteNumber(live.pressure);
  out.push(
    makeTile({
      key: 'pressure',
      title: '气压',
      iconName: 'gauge',
      value: fmt(pressure),
      unit: 'hPa',
      level: pressure === null ? null : pressureLevel(pressure),
    }),
  );

  const vis = toFiniteNumber(live.vis);
  out.push(
    makeTile({
      key: 'vis',
      title: '能见度',
      iconName: 'eye',
      value: fmt(vis),
      unit: 'km',
      level: vis === null ? null : visibilityLevel(vis),
    }),
  );

  // 风：大数字给风速，风向与风力等级放副行 —— 两者都不是「风有多大」
  const speed = toMs(live.windSpeed);
  const windNote: string[] = [];
  if (live.windDir) windNote.push(live.windDir);
  if (live.windScale) windNote.push(`${live.windScale}级`);
  out.push(
    makeTile({
      key: 'wind',
      title: '风',
      iconName: 'compass',
      value: speed === null ? '--' : speed.toFixed(1),
      unit: 'm/s',
      level: speed === null ? null : windLevel(speed),
      note: windNote.length ? windNote.join(' · ') : undefined,
    }),
  );

  // 阵风单列一档：持续风小、阵风大的日子是「看着温和其实危险」的那种
  const gust = toMs(live.windGust);
  out.push(
    makeTile({
      key: 'gust',
      title: '阵风',
      iconName: 'wind',
      value: gust === null ? '--' : gust.toFixed(1),
      unit: 'm/s',
      level: gust === null ? null : windLevel(gust),
    }),
  );

  // 降水：瞬时雨强当大数字，降水量与类型放副行
  const intensity = toFiniteNumber(live.precipIntensity);
  const amount = toFiniteNumber(live.precip);
  const typeCn = precipTypeCn(live.precipType);
  const precipNote: string[] = [];
  if (typeCn && typeCn !== '无') precipNote.push(typeCn);
  if (amount !== null && amount > 0) precipNote.push(`${fmt(amount)}mm`);
  out.push(
    makeTile({
      key: 'precip',
      title: '降水',
      iconName: 'umbrella',
      value: fmt(intensity ?? amount),
      unit: intensity === null ? 'mm' : 'mm/h',
      level: precipLevel(intensity, live.precipType),
      note: precipNote.length ? precipNote.join(' · ') : undefined,
    }),
  );

  const cloud = toFiniteNumber(live.cloud);
  out.push(
    makeTile({
      key: 'cloud',
      title: '云量',
      iconName: 'cloud',
      value: fmt(cloud),
      unit: '%',
      level: cloud === null ? null : cloudLevel(cloud),
    }),
  );

  const uv = toFiniteNumber(live.uvIndex);
  out.push(
    makeTile({
      key: 'uv',
      title: '紫外线',
      iconName: 'sun',
      value: fmt(uv),
      unit: '',
      level: uv === null ? null : uvLevel(uv),
    }),
  );

  const dew = toFiniteNumber(live.dew);
  out.push(
    makeTile({
      key: 'dew',
      title: '露点',
      iconName: 'thermometer',
      value: fmt(dew),
      unit: '°C',
      level: dew === null ? null : dewLevel(dew),
    }),
  );

  return out;
});

/**
 * 实读数这一屏。
 *
 * 出错时不画读数：拿旧读数顶一条报错，读的人不知道该信哪个。
 */
const showTiles = computed(() => tiles.value.length > 0 && !conditionsStore.weatherError);

/** 还在取数没有 */
const loading = computed(() => conditionsStore.weatherLoading);

/**
 * 骨架与实读数交叉淡入。
 *
 * 读数一到，骨架淡出、磁贴淡入，同一时刻发生 ——
 * 骨架立刻摘掉的话，中间会露出卡片底色，读起来像闪了一下。
 */
const { skeletonVisible } = useCrossFade({
  hasContent: () => tiles.value.length > 0,
  loading: () => loading.value,
});

/** 落款：这批读数是什么时候的 */
const updatedAt = computed(() => formatTimeOfDay(conditionsStore.liveWeather?.obsTime));
</script>

<style lang="scss" scoped>
/*
 * 这一节不是一张卡，是一组卡。
 *
 * 每一项读数自成一块玻璃面：九项挤在一张卡里，卡就变成一张表，
 * 而表要靠位置去认「哪一格是什么」。拆开之后每块自己带标题，
 * 扫过去就是九个数 —— 顺序和位置都不再承担信息。
 */
.weather__body {
  display: flex;
  flex-direction: column;
}

/*
 * 骨架与实读数叠在同一个格子里。
 *
 * grid 叠同一个单元：两态不占两份高度，也不退出文档流。
 * 读数轨道那一处也是这么做的（见 LineChart 的 line-chart__slot）。
 */
.weather__stack {
  display: grid;
}

/*
 * 实读数。
 *
 * 这里**不挂**交叉淡入：那条是 opacity 动画，会掐断磁贴的 backdrop-filter。
 * CSS 有一条 backdrop-root 规则 —— 祖先上只要有一个在生效的 opacity 动画，
 * 它就成了 backdrop root，后代的 backdrop-filter 只能采样它**内部**的背景。
 *
 * 磁贴的底是页面底下那张整页照片，照片在 .weather 的祖先**外面** ——
 * 祖先一旦成了 backdrop root，磁贴就只采样得到祖先内部的背景，糊的是一片空。
 *
 * 交叉淡入的观感由骨架层承担：数据到了，骨架淡出 160ms，读数从底下透出来。
 * 读数一直都在，只是先前被不透明的骨架盖着。
 */
.weather__content {
  grid-area: 1 / 1;
}

/*
 * 骨架。
 *
 * 读数到位后淡出，淡完再从 DOM 里摘 ——
 * 立刻摘的话，中间会露出卡片底色（见 composables/useCrossFade）。
 */
.weather__skeleton-layer {
  grid-area: 1 / 1;
  opacity: 1;
  @include fish-cross-out;

  &--out {
    opacity: 0;
    pointer-events: none;
  }
}

.weather__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.weather__title {
  color: $fish-ink;
  @include fish-type(body);

  font-weight: 500;
}

.weather__meta {
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 磁贴网格。两列。
 *
 * 一列会让这一屏全是九张竖条，读数被推到屏幕外；
 * 三列每块只剩 100pt 出头，标题和数字开始挤。
 */
.weather__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

/*
 * 磁贴。
 *
 * 九块磁贴各糊一次 backdrop-filter，代价是九份 —— 所以半径比卡面小一档
 * （--fish-blur-tile）。照片面上这一档是 14px：再大就白糊了，
 * 底本来就是照片，糊的是那 42% 透上来的光。
 *
 * 底现在是天色渐变（照片层已撤下），但这一层的关系没变：
 * 底下是「一张压着整个页面的面」，糊的是透上来的光。
 *
 * 这几块是「卡里的块」，不再各带一层影 —— 九块小影叠在一张大卡上，
 * 读起来是九张浮起来的贴纸，不是九格读数。
 */
.weather__tile {
  box-sizing: border-box;
  padding: 24rpx 26rpx 22rpx;
  border: 0.5px solid var(--fish-glass-stroke);
  border-radius: $fish-radius-card;
  background-color: var(--fish-card-glass);
  backdrop-filter: blur(var(--fish-blur-tile, 12px)) saturate(var(--fish-saturate, 1.8));
  -webkit-backdrop-filter: blur(var(--fish-blur-tile, 12px)) saturate(var(--fish-saturate, 1.8));
}

/*
 * 骨架磁贴。
 *
 * 不给模糊。骨架层自己带 opacity 过渡（淡出）—— 过渡期间它是 backdrop root，
 * 磁贴采样不到照片，blur 根本没生效过；等它不淡出直接被摘掉，模糊也只剩
 * 一层壳。九块模糊在低端安卓上是纯开销，占位块不需要。
 */
.weather__tile--skeleton {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.weather__tile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.weather__tile-title {
  color: $fish-muted-60;
  @include fish-type(caption);

  font-weight: 500;
}

/* 图标是标识，不是状态信号 —— 所以统一用 ink 色 */
.weather__tile-icon {
  width: $fish-icon-badge;
  height: $fish-icon-badge;
  flex-shrink: 0;
}

.weather__tile-value {
  display: flex;
  align-items: baseline;
  margin-top: 14rpx;
}

.weather__tile-num {
  color: $fish-ink;
  @include fish-type(display);
  @include numeric;
}

/*
 * 单位跟着大数字排，不另起一行 ——
 * 「72」「%」分两行读起来像两个数。
 */
.weather__tile-unit {
  margin-left: 6rpx;
  color: $fish-muted-60;
  @include fish-type(body);

  font-weight: 500;
}

.weather__tile-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 10rpx;
}

/*
 * 档位词。颜色只承载档位 ——
 * 数值一律黑，彩色的是「这一档怎么样」。
 */
.weather__tile-level {
  flex-shrink: 0;
  @include fish-type(caption);

  font-weight: 500;
}

.weather__tile-level--success {
  color: $fish-success-ink;
}

.weather__tile-level--blue {
  color: $fish-blue-600;
}

.weather__tile-level--warning {
  color: $fish-warning-ink;
}

.weather__tile-level--destructive {
  color: $fish-destructive-ink;
}

.weather__tile-level--muted {
  color: $fish-muted-60;
}

/* 副行：放不進大数字里的那部分。挤不下就截断，不换行 */
.weather__tile-note {
  min-width: 0;
  margin-left: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption);

  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/*
 * 加载骨架。照着磁贴排：标题 / 数字 / 档位三块。
 *
 * 底色用 $fish-surface，呼吸幅度用 0.35 —— 与 SkeletonCard、HourlyWeather、
 * DayForecast 同一档，否则同一个页面里两种加载态一深一浅，像两套组件。
 */
.weather__sk {
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.weather__sk--title {
  width: 120rpx;
  height: 24rpx;
}

.weather__sk--value {
  width: 140rpx;
  height: 56rpx;
  margin-top: 18rpx;
}

.weather__sk--level {
  width: 80rpx;
  height: 22rpx;
  margin-top: 14rpx;
}

.weather__error {
  color: $fish-destructive-ink;
  @include fish-type(body);
}

.weather__empty {
  color: $fish-muted;
  @include fish-type(body);
}
</style>
