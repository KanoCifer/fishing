<template>
  <view class="hero" :class="skyClass" :data-weather="group">
    <view class="hero__bg" />

    <image class="hero__img" :src="imageUrl" mode="aspectFill" />

    <view class="hero__scrim" />

    <view class="hero__fade" />

    <!-- 顶行：地点标签 / 刷新 -->
    <view class="hero__top" :style="topRowStyle">
      <!-- 地点标签：玻璃胶囊 + 实心图钉 + 地点名 + 展开箭头 -->
      <view class="hero__position" @tap="onPickPlace">
        <image class="hero__icon hero__icon--pin" :src="pinIcon" mode="widthFix" />
        <text class="hero__place-name">{{ placeName }}</text>
        <image class="hero__icon hero__icon--chevron" :src="chevronDownIcon" mode="widthFix" />
      </view>

      <view class="hero__refresh" :class="{ 'hero__refresh--busy': busy }" @tap="onRefresh">
        <image class="hero__icon__refresh" :src="refreshIcon" mode="widthFix" />
      </view>
    </view>

    <view class="hero__gauge" :style="enterStyle(1, showAnim)">
      <TideGauge
        :value="displayScore"
        :min="0"
        :max="100"
        :size="gaugeSize"
        :stroke="gaugeStroke"
        :track-color="trackColor"
        :stops="HERO_GAUGE_STOPS"
      >
        <view class="gauge">
          <view class="gauge__value">
            <text class="gauge__num">{{ displayScore }} <text class="gauge__unit">%</text> </text>
          </view>
          <view class="gauge__cap" @tap="emit('breakdown')">
            <image class="gauge__cap-icon" :src="fishIcon" mode="widthFix" />
            <text class="gauge__cap-text">鱼口概率</text>
            <image class="gauge__cap-chevron" :src="chevronIcon" mode="widthFix" />
          </view>
        </view>
      </TideGauge>
    </view>

    <view v-if="hasLive" class="hero__now" :style="enterStyle(2, showAnim)">
      <view class="hero__now-row">
        <view class="hero__now-temp-row">
          <text class="hero__now-temp">{{ temp }}</text>
          <text v-if="temp" class="hero__now-deg">°</text>
        </view>
        <image class="hero__now-icon" :src="nowIcon" mode="aspectFill" />
      </view>

      <!-- 现象：上游原文。缺值就不画，别拿「未知」顶上去 -->
      <text v-if="cond" class="hero__now-cond">{{ cond }}</text>

      <!-- 体感：这一屏只此一处说它（WeatherCard 里那格已去掉） -->
      <text v-if="feels" class="hero__now-feels">体感 {{ feels }}°</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import TideGauge from '@/components/TideGauge/TideGauge.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { icon } from '@/constants/icons';
import { HERO_GAUGE_SIZE, HERO_GAUGE_STOPS, HERO_GAUGE_STROKE, heroImageUrl, heroSky } from '@/constants/weatherHero';
import { useFishingMapStore } from '@/stores/fishingMap';
import { createCountUp, enterDelayMs, enterStyle } from '@/utils/motion';
import { num, weatherGroup, weatherIconUri } from '@/utils/weather';

const props = withDefaults(defineProps<{ showAnim?: boolean }>(), { showAnim: true });

const emit = defineEmits<{
  /** 点开鱼口概率的构成 */
  breakdown: [];
  /** 点地点标签上的箭头：换一个地方看 */
  pickPlace: [];
}>();

const mapStore = useFishingMapStore();

/** px。顶行要落在胶囊按钮那一行上，还得给它左侧让出位置 */
const { capsuleTop, capsuleInsetRight } = useNavMetrics();

/* ── 天色 ──────────────────────────────────────────────────────────────── */

/** 当前天气落在哪一组外观上（十种，见 utils/weather） */
const group = computed(() => weatherGroup(mapStore.liveWeather?.icon));

/** 头图只有四种天色 */
const sky = computed(() => heroSky(group.value));

const skyClass = computed(() => `hero--${sky.value}`);

const imageUrl = computed(() => heroImageUrl(group.value));

/* ── 实时天气 ──────────────────────────────────────────────────────────── */

/** 实况。整块没有 → 右上角不画读数 */
const live = computed(() => mapStore.liveWeather);

/** 当前温度。有值才画 */
const temp = computed(() => {
  const raw = live.value?.temp ?? '';
  return num(raw) === null ? null : raw;
});

/** 天气现象：上游给的原文 */
const cond = computed(() => live.value?.text || '');

/** 体感温度 */
const feels = computed(() => {
  const value = num(live.value?.feelsLike);
  return value === null ? null : String(value);
});

/** 天气图标。认不出的码落兜底云（见 utils/weather 的 weatherIconSlug） */
const nowIcon = computed(() => weatherIconUri(live.value?.icon));

/** 有实况才画这一块 */
const hasLive = computed(() => Boolean(live.value));

/* ── 顶行 ──────────────────────────────────────────────────────────────── */

const placeName = computed(() => mapStore.locationName || '钓鱼地点');

const busy = computed(() => mapStore.indexLoading || mapStore.locating);

/**
 * 顶行的位置与避让。
 *
 * top 落在胶囊按钮的上沿（胶囊与顶行同高，两者一行排开）；
 * paddingRight 让出胶囊那一段 —— 刷新键压在胶囊下面会点不动。
 */
const topRowStyle = computed(() => ({
  top: `${capsuleTop}px`,
  paddingRight: `${capsuleInsetRight}px`,
}));

/* ── 分数 ──────────────────────────────────────────────────────────────── */

const score = computed(() => {
  const value = mapStore.indexData?.fishing_index ?? 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
});

/**
 * 轨道色。
 *
 * 轨道是「量程」那一段，不是内容 —— 它得比弧淡一档。
 * 头图整体压深面，轨道压白。
 */
const trackColor = 'rgba(255, 255, 255, 0.28)';

const gaugeSize = HERO_GAUGE_SIZE;
const gaugeStroke = HERO_GAUGE_STROKE;

/* ── 数字滚动 ──────────────────────────────────────────────────────────── */

const displayScore = ref<number>(0);

/**
 * 数字滚动。
 *
 * 用 createCountUp 而不是自己写 setInterval：计数期间每改一次值就是一次跨线
 * setData，控制器只在整数真的变了时才写。
 *
 * 弧跟着数字一起长 —— 数字滚到哪，弧就画到哪，两者是同一件事的两种画法。
 */
const countUp = createCountUp((value) => {
  displayScore.value = value;
});

/**
 * showAnim 翻动时数字跟着重播。
 *
 * 入场动画由页面持有开关（见 pages/data 的注释），摘掉时元素回到「先不在」的状态。
 * 数字跟着回到 0，重播时再数一遍 —— 数字停在旧值上、只有别的东西在动，
 * 读起来是「卡住了」。
 */
watch(
  () => props.showAnim,
  (show) => {
    if (!show) {
      countUp.set(0);
      return;
    }
    /* 分数是入场序列的第 1 项，数字用同一条延迟起滚 —— 数字跟它那一行
       同时开始、同时落位，读起来是「一次落位」而不是两件事各演各的 */
    countUp.to(score.value, { delay: enterDelayMs(1) });
  },
  { immediate: true },
);

/**
 * 分数变了：数据到了，或者刷新回来了一个新值。
 *
 * 从当前显示值补间过去，不是从 0 数起 —— 刷新时数字从 60 走到 62，
 * 那一下「几乎没动」本身就是「刷新成功」的信息。
 */
watch(score, (target) => {
  if (!props.showAnim) {
    countUp.set(0);
    return;
  }
  countUp.to(target);
});

// 组件没了就别再滚：定时器停下来，最后一次 setData 才不会打在卸载后的节点上
onBeforeUnmount(() => {
  countUp.cancel();
});

/* ── 图标 ──────────────────────────────────────────────────────────────── */

/**
 * 地点标签里的图钉是**深色实心**的。
 *
 * 它压在玻璃胶囊上：白色的描边图钉在浅底上读不出来，实心的才立得住。
 * 实心版是生成脚本里的 filled 变体（中间那个圆被挖空成洞）。
 */
const pinIcon = icon('map-pin', 'ink');

/** 展开箭头：灰。深墨压在玻璃上太重 */
const chevronDownIcon = icon('chevron-down', 'muted60');

/** 头图上的其余图标一律压白 —— 图标的颜色烤在 data URI 里，换色要回去跑 pnpm icons */
const refreshIcon = icon('rotate-cw', 'ink');
const fishIcon = icon('fish', 'onAccent');
const chevronIcon = icon('chevron-right', 'onAccent');

/* ── 动作 ──────────────────────────────────────────────────────────────── */

/**
 * 地点标签上的箭头 = 换一个地方看。
 *
 * 这里只发事件：选点要弹微信自带的地图，组件不该知道那件事，
 * 更不该知道选完之后要重新取哪一份数。
 */
function onPickPlace() {
  emit('pickPlace');
}

function onRefresh() {
  // 定位那一段也算「正在忙」：图标已经在转了，这时候再按就是并发第二轮取数
  if (mapStore.indexLoading || mapStore.locating) return;
  void mapStore.refreshIndexData();
}
</script>

<style lang="scss" scoped>
.hero {
  position: relative;
  height: 600rpx;
  overflow: hidden;
}

/* 兜底天色 */
.hero__bg {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}

.hero--sunny .hero__bg {
  background-image: linear-gradient(180deg, #bfe0f2 0%, #e7f3f6 46%, #7fd3d8 100%);
}

.hero--cloudy .hero__bg {
  background-image: linear-gradient(180deg, #9db6cc 0%, #cfd9e6 42%, #6d8fa8 100%);
}

.hero--rain .hero__bg {
  background-image: linear-gradient(180deg, #59697a 0%, #93a3ae 48%, #45535e 100%);
}

.hero--night .hero__bg {
  background-image: linear-gradient(180deg, #0a1a33 0%, #16365e 50%, #060f1e 100%);
}

.hero__img {
  position: absolute;
  top: 0;
  left: -1133rpx;
  width: 1888rpx;
  height: 800rpx;
}

.hero__scrim {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-image: linear-gradient(180deg, rgba(6, 20, 34, 0.3) 0%, rgba(6, 20, 34, 0) 100%);
}

/* ── 顶行 ──────────────────────────────────────────────────────────────── */

.hero__fade {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 90rpx;
  background-image: linear-gradient(0deg, $fish-page-base 0%, rgba($fish-page-base, 0) 100%);
}

.hero__top {
  position: absolute;
  left: 32rpx;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64rpx;
}

/*
 * 地点标签：一枚玻璃胶囊。
 *
 * 半透明白 + 顶边高光 + 柔影 —— 与项目里其他玻璃面同一套材质，
 * 压在头图上是「一层浮起来的材质」，不是「画上去的一个框」。
 *
 * 胶囊底是浅的，里面的东西一律深墨：白图标压在白底上读不出来。
 */
.hero__position {
  display: flex;
  align-items: center;
  height: 64rpx;
  max-width: 460rpx;
  padding: 0 24rpx;
  @include fish-glass($fish-radius-pill);
  @include fish-press;
}

.hero__icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

.hero__icon__refresh {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
  padding: 16rpx;
  @include fish-glass($fish-radius-pill);
}

/* 图钉：实心，个头与字高相当 */
.hero__icon--pin {
  width: 36rpx;
  height: 36rpx;
  margin-right: 14rpx;
}

/* 展开箭头：它说的是「这里能点开，换个地方看」 */
.hero__icon--chevron {
  width: 28rpx;
  height: 28rpx;
  margin-left: 10rpx;
}

.hero__place-name {
  max-width: 300rpx;
  min-width: 0;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(body);

  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/*
 * 刷新键。
 *
 * 命中区 88rpx 见方（44pt）：图标键要盲按，热区不够大就按不准。
 */
.hero__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  margin-right: 8rpx;
  flex-shrink: 0;
  border-radius: 50%;
  @include fish-press-dim;
}

/* 刷新中。转起来只是加强信号，静态的那一份是变暗 */
.hero__refresh--busy .hero__icon {
  opacity: 0.4;
  animation: fish-spin 1s linear infinite;
}

/* ── 仪表 ──────────────────────────────────────────────────────────────── */

.hero__gauge {
  position: absolute;
  top: 200rpx;
  left: 40rpx;
}

/*
 * 表心的内容。
 *
 * 铺满整块表 —— 绝对定位的定位基准是 TideGauge 那个铺满的容器。
 */
.gauge {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}

.gauge__value {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
  transform: translateY(-50%);
}

/*
 * 分数。
 *
 * 不套字阶：这一档比字阶里最大的一级还大，套上去只会把
 * letter-spacing / line-height 覆盖掉。
 */
.gauge__num {
  position: relative;
  color: $fish-on-dark;
  font-size: 96rpx;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.gauge__unit {
  position: absolute;
  left: 105%;
  bottom: 0;
  color: $fish-on-dark;
  @include fish-type(body);
}

/*
 * 表心的注脚：鱼口概率 + 一个右箭头。
 *
 * 箭头说明这一行后面还有东西 —— 光标不会在小程序里出现，
 * 「这里能点」得让人看得见。
 */
.gauge__cap {
  position: absolute;
  right: 0;
  bottom: 44rpx;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  @include fish-press-dim;
}

.gauge__cap-icon {
  width: 28rpx;
  height: 28rpx;
  margin-right: 6rpx;
  flex-shrink: 0;
}

/* 图标的颜色是烤进 data URI 的，CSS 改不动 —— 只有文字这一档能调 */
.gauge__cap-text {
  color: $fish-on-dark;
  @include fish-type(caption);
}

.gauge__cap-chevron {
  width: 22rpx;
  height: 22rpx;
  margin-left: 2rpx;
  flex-shrink: 0;
}

/* ── 实时天气 ──────────────────────────────────────────────────────────── */

/*
 * 右上角那一块：现在多少度、什么天、体感多少度。
 *
 * 位置：仪表在左上（180rpx 起），这块在右上（210rpx 起），
 * 中间那条空档留给画面里的天 —— 两块读数各占一角，谁也不压着谁。
 */
.hero__now {
  position: absolute;
  top: 210rpx;
  right: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* 温度与图标并排 */
.hero__now-row {
  margin-right: -24rpx;
  display: flex;
  align-items: center;
}

/*
 * 温度与度数符号：baseline 对齐，符号再相对定位提上去 ——
 * 跟参考图里那个「挂在数字右上角的小圈」是同一个位置关系。
 */
.hero__now-temp-row {
  display: flex;
  align-items: baseline;
}

/*
 * 大温度。不套字阶：这一档比字阶里最大的一级（display 64rpx）还大，
 * 理由与仪表上的分数同一个 —— 它是这一块的主角。
 */
.hero__now-temp {
  font-size: 64rpx;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

/* 度数符号：挂在数字上沿 */
.hero__now-deg {
  position: relative;
  top: -0.5em;
  margin-left: 2rpx;
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1;
}

/*
 * 天气图标。Meteocons 的彩色 SVG，颜色烤死在图形里 —— 这里只管尺寸。
 */
.hero__now-icon {
  width: 160rpx;
  height: 160rpx;
  margin-right: -8rpx;
  flex-shrink: 0;
}

/* 天气现象 */
.hero__now-cond {
  margin-top: 10rpx;
  @include fish-type(body, 600);
}

/* 体感：一行注脚 */
.hero__now-feels {
  margin-top: 4rpx;
  @include fish-type(caption);
}

.hero__now-temp,
.hero__now-deg,
.hero__now-cond {
  color: $fish-on-dark;
}

.hero__now-feels {
  color: $fish-on-dark;
}
</style>
