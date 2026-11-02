<template>
  <!--
    墨色那一档跟着天色走：亮天深墨（压白面），暗天白字（压深面）。
    这一对类一直写在下方的样式里，根节点却没挂过 —— 挂上之后
    压面与墨色才真的生效（挂错组名的表现是「这一组没有专属颜色」，不会白屏）。
  -->
  <view class="hero" :class="[skyClass, darkSky ? 'hero--dark' : 'hero--light']" :data-weather="group">
    <view class="hero__bg" />

    <image class="hero__img" :src="imageUrl" mode="aspectFill" />

    <view class="hero__scrim" />

    <!--
      底部过渡。

      头图是个满幅矩形：底边直接切在页面底色上，会在页面上划出一条硬线。
      这一层把画面底边化进页面底色 —— 硬线没了，头图读成「这张画铺到那儿就淡了」。
    -->
    <view class="hero__fade" />

    <!-- 顶行：地点 / 更新时间 / 刷新 -->
    <view class="hero__top" :style="topRowStyle">
      <view class="hero__place">
        <image class="hero__icon hero__icon--pin" :src="pinIcon" mode="widthFix" />
        <text class="hero__place-name">{{ placeName }}</text>
        <text v-if="updatedAt" class="hero__updated">{{ updatedAt }} 更新</text>
      </view>

      <view class="hero__refresh" :class="{ 'hero__refresh--busy': busy }" @tap="onRefresh">
        <image class="hero__icon" :src="refreshIcon" mode="widthFix" />
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
        :from-color="arcColor"
        :to-color="arcColor"
      >
        <view class="gauge">
          <view class="gauge__value">
            <text class="gauge__num">{{ displayScore }}</text>
            <text class="gauge__max">/100</text>
          </view>
          <view class="gauge__cap" @tap="emit('breakdown')">
            <image class="gauge__cap-icon" :src="fishIcon" mode="widthFix" />
            <text class="gauge__cap-text">鱼口概率</text>
            <image class="gauge__cap-chevron" :src="chevronIcon" mode="widthFix" />
          </view>
        </view>
      </TideGauge>
    </view>

    <!--
      实时天气：压在头图右上角。

      这一块原来是一张独立卡片（CurrentWeather），挪上来是因为它跟仪表
      讲的是同一件事的两面 —— 「此刻」的读数分成上下两块，要滚一屏才看得到一起。
      位置在右上：仪表在左，这块在右，中间留白是画面里的天。

      取不到实况就不画：头图上摆一个空位，比没有这块更让人以为数据没到。
    -->
    <view v-if="hasLive" class="hero__now" :style="enterStyle(2, showAnim)">
      <view class="hero__now-row">
        <view class="hero__now-temp-row">
          <text class="hero__now-temp">{{ temp }}</text>
          <text v-if="temp" class="hero__now-deg">°</text>
        </view>
        <image class="hero__now-icon" :src="nowIcon" mode="aspectFit" />
      </view>

      <!-- 现象：上游原文。缺值就不画，别拿「未知」顶上去 -->
      <text v-if="cond" class="hero__now-cond">{{ cond }}</text>

      <!-- 体感：这一屏只此一处说它（WeatherCard 里那格已去掉） -->
      <text v-if="feels" class="hero__now-feels">体感 {{ feels }}°</text>
    </view>

    <!-- 等级：不是一行浮在画上的字，是一枚芯片 -->
    <view v-if="level" class="hero__level" :style="enterStyle(3, showAnim)">
      <text class="hero__chip" :class="`hero__chip--${tone}`">{{ level }}</text>
    </view>

    <!-- 一句话结论 -->
    <text v-if="hasData" class="hero__lead" :style="enterStyle(4, showAnim)">{{ advice }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import TideGauge from '@/components/TideGauge/TideGauge.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { icon, type IconColor } from '@/constants/icons';
import {
  HERO_GAUGE_SIZE,
  HERO_GAUGE_STROKE,
  HERO_TONE_FILL,
  heroDarkSky,
  heroImageUrl,
  heroSky,
} from '@/constants/weatherHero';
import { useFishingMapStore } from '@/stores/fishingMap';
import { createCountUp, enterDelayMs, enterStyle } from '@/utils/motion';
import { levelTone, levelVerdict, num, weatherGroup, weatherIconUri } from '@/utils/weather';

const props = withDefaults(defineProps<{ showAnim?: boolean }>(), { showAnim: true });

const emit = defineEmits<{
  /** 点开鱼口概率的构成 */
  breakdown: [];
}>();

const mapStore = useFishingMapStore();

/** px。顶行要落在胶囊按钮那一行上，还得给它左侧让出位置 */
const { capsuleTop, capsuleInsetRight } = useNavMetrics();

/* ── 天色 ──────────────────────────────────────────────────────────────── */

/** 当前天气落在哪一组外观上（十种，见 utils/weather） */
const group = computed(() => weatherGroup(mapStore.liveWeather?.icon));

/** 头图只有四种天色 */
const sky = computed(() => heroSky(group.value));

/** 暗天（夜、雨）：白字 + 压深面；亮天：深墨 + 压白面 */
const darkSky = computed(() => heroDarkSky(group.value));

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

/** 实况观测时刻，只取时分 */
const updatedAt = computed(() => mapStore.liveWeather?.obsTime);

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

/* ── 等级与分数 ────────────────────────────────────────────────────────── */

const tone = computed(() => levelTone(mapStore.indexData?.level));

/** 等级词。接口没给等级时先空着，别拿 undefined 去渲染 */
const level = computed(() => mapStore.indexData?.level ?? '');

/**
 * 有没有取到鱼口概率。
 *
 * 没取到时一句话结论不出现 —— levelVerdict 的兜底是「鱼口概率计算中」，
 * 取数失败时那句会跟下面卡片里的「暂时取不到」打架。
 */
const hasData = computed(() => Boolean(mapStore.indexData));

const score = computed(() => {
  const value = mapStore.indexData?.fishing_index ?? 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
});

/** 弧色：等级色的填充档 */
const arcColor = computed(() => HERO_TONE_FILL[tone.value]);

/**
 * 轨道色。
 *
 * 轨道是「量程」那一段，不是内容 —— 它得比弧淡一档。
 * 亮天的底是浅蓝白，轨道压深；暗天压白。
 */
const trackColor = computed(() => (darkSky.value ? 'rgba(255, 255, 255, 0.28)' : 'rgba(15, 42, 61, 0.16)'));

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

/* ── 一句话结论 ────────────────────────────────────────────────────────── */

/**
 * 优先用和风官方那条「钓鱼」建议 —— 它是接口给的原文，比我们自己拼一句更有分量；
 * 官方指数还没到时退回等级映射（见 utils/weather 的 levelVerdict）。
 */
const advice = computed(() => {
  const fishing = mapStore.weatherIndices.find((item) => item.name.includes('钓鱼') && item.text);
  return fishing?.text ?? levelVerdict(mapStore.indexData?.level);
});

/* ── 图标 ──────────────────────────────────────────────────────────────── */

/** 顶行图标跟着天色换：亮天深墨，暗天白 */
const inkColor = computed<IconColor>(() => (darkSky.value ? 'onAccent' : 'heroInk'));

const pinIcon = computed(() => icon('map-pin', inkColor.value));
const refreshIcon = computed(() => icon('refresh-cw', inkColor.value));
const fishIcon = computed(() => icon('fish', inkColor.value));
const chevronIcon = computed(() => icon('chevron-right', inkColor.value));

/* ── 动作 ──────────────────────────────────────────────────────────────── */

function onRefresh() {
  // 定位那一段也算「正在忙」：图标已经在转了，这时候再按就是并发第二轮取数
  if (mapStore.indexLoading || mapStore.locating) return;
  void mapStore.refreshIndexData();
}
</script>

<style lang="scss" scoped>
.hero {
  position: relative;
  height: 800rpx;
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

/* 天色压面。亮天压白，暗天压深 */
.hero__scrim {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 280rpx;
}

.hero--light .hero__scrim {
  background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.44) 0%, rgba(255, 255, 255, 0) 100%);
}

.hero--dark .hero__scrim {
  background-image: linear-gradient(180deg, rgba(6, 20, 34, 0.45) 0%, rgba(6, 20, 34, 0) 100%);
}

/* ── 顶行 ──────────────────────────────────────────────────────────────── */

/*
 * 底部过渡。
 *
 * 渐变方向 0deg 是**从下往上**：底下是页面底色，往上淡出到透明。
 *
 * 高度只留 90rpx：再高就压到等级芯片与一句话上去了（那两块是字，不是画）。
 * 字压在这层之上，不受它影响。
 */
.hero__fade {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 120rpx;
  background-image: linear-gradient(0deg, $fish-page-base 0%, rgba($fish-page-base, 0) 100%);
}

.hero__top {
  position: absolute;
  left: 32rpx;
  right: 0;
  display: flex;
  align-items: center;
  height: 64rpx;
}

.hero__place {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.hero__icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

.hero__icon--pin {
  width: 28rpx;
  height: 28rpx;
  margin-right: 10rpx;
}

.hero__place-name {
  max-width: 300rpx;
  overflow: hidden;
  @include fish-type(body);

  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero--light .hero__place-name {
  color: $fish-hero-ink;
}

.hero--dark .hero__place-name {
  color: $fish-on-dark;
}

.hero__updated {
  margin-left: 12rpx;
  @include fish-type(caption);
}

.hero--light .hero__updated {
  color: rgba(15, 42, 61, 0.62);
}

.hero--dark .hero__updated {
  color: rgba(255, 255, 255, 0.72);
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
  top: 180rpx;
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
  font-size: 96rpx;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.hero--light .gauge__num {
  color: $fish-hero-ink;
}

.hero--dark .gauge__num {
  color: $fish-on-dark;
}

/* 「/100」是刻度的上限，不是第二个数字：压到最小一档 */
.gauge__max {
  margin-left: 6rpx;
  @include fish-type(caption);
}

.hero--light .gauge__max {
  color: rgba(15, 42, 61, 0.62);
}

.hero--dark .gauge__max {
  color: rgba(255, 255, 255, 0.72);
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

.gauge__cap-text {
  @include fish-type(caption);
}

.gauge__cap-chevron {
  width: 22rpx;
  height: 22rpx;
  margin-left: 2rpx;
  flex-shrink: 0;
}

/* 图标的颜色是烤进 data URI 的，CSS 改不动 —— 只有文字这一档能调 */
.hero--light .gauge__cap-text {
  color: rgba(15, 42, 61, 0.62);
}

.hero--dark .gauge__cap-text {
  color: rgba(255, 255, 255, 0.72);
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
  font-size: 88rpx;
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
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1;
}

/*
 * 天气图标。Meteocons 的彩色 SVG，颜色烤死在图形里 —— 这里只管尺寸。
 */
.hero__now-icon {
  width: 120rpx;
  height: 120rpx;
  margin-left: 16rpx;
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

.hero--light .hero__now-temp,
.hero--light .hero__now-deg,
.hero--light .hero__now-cond {
  color: $fish-hero-ink;
}

.hero--dark .hero__now-temp,
.hero--dark .hero__now-deg,
.hero--dark .hero__now-cond {
  color: $fish-on-dark;
}

.hero--light .hero__now-feels {
  color: rgba(15, 42, 61, 0.62);
}

.hero--dark .hero__now-feels {
  color: rgba(255, 255, 255, 0.72);
}

/* ── 等级芯片 ──────────────────────────────────────────────────────────── */

/*
 * 等级词不是一行浮在画上的字，而是一枚芯片。
 *
 * 底色用等级色的**深档** + 白字：填充分档（亮绿、亮橙）压白字只有 2.2:1，
 * 读不出来；深档压白字都在 4.5:1 以上。
 */
.hero__level {
  position: absolute;
  top: 580rpx;
  left: 48rpx;
  display: flex;
  align-items: center;
}

/*
 * 不套字阶：字阶里最小的一级（caption 24rpx）撑不起一枚芯片，
 * 往上一档（title 40rpx）又太大。36rpx 是这两者之间的一档，
 * 字重与字距跟 title 那一族走 —— 与分数那一行同一个理由。
 */
.hero__chip {
  padding: 8rpx 24rpx 10rpx;
  border-radius: $fish-radius-pill;
  color: $fish-on-accent;
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.016em;
}

.hero__chip--success {
  background-color: $fish-success-ink;
}

.hero__chip--blue {
  background-color: $fish-blue-600;
}

.hero__chip--warning {
  background-color: $fish-warning-ink;
}

.hero__chip--destructive {
  background-color: $fish-destructive-ink;
}

.hero__chip--muted {
  background-color: $fish-muted-60;
}

/* ── 一句话 ────────────────────────────────────────────────────────────── */

/*
 * 宽度收到 420rpx：再宽就压到插画右边那个人身上了。
 */
.hero__lead {
  position: absolute;
  top: 660rpx;
  left: 48rpx;
  max-width: 420rpx;
  @include fish-type(caption);
}

.hero--light .hero__lead {
  color: $fish-hero-ink;
}

.hero--dark .hero__lead {
  color: $fish-on-dark;
}
</style>
