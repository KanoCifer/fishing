<template>
  <view class="astro">
    <view class="astro__head">
      <view class="astro__head-left">
        <image
          class="astro__title-icon"
          :class="{ 'astro__title-icon--dim': surface === 'photo' }"
          :src="sunMoonIcon"
          mode="aspectFit"
        />
        <text class="astro__title">日照与月相</text>
      </view>
      <text class="astro__meta">{{ dateLabel }}</text>
    </view>

    <view v-if="targets.length" class="astro__body">
      <!-- 主角：离下一个关键时刻还有多久 -->
      <view class="astro__hero">
        <view class="astro__hero-row">
          <text class="astro__count">{{ countText }}</text>
          <text v-if="countUnit" class="astro__count-unit">{{ countUnit }}</text>
        </view>
        <text class="astro__caption">{{ captionText }}</text>
      </view>

      <!-- 换目标：三枚胶囊。选中哪一枚，倒计时就数到哪一刻 -->
      <view class="astro__targets">
        <view
          v-for="target in targets"
          :key="target.key"
          class="astro__target"
          :class="{ 'astro__target--active': target.key === activeKey }"
          @tap="selectTarget(target.key)"
        >
          <text class="astro__target-text" :class="{ 'astro__target-text--active': target.key === activeKey }">
            {{ target.label }}
          </text>
        </view>
      </view>

      <!-- 24 小时轨道。三段都是按真实时刻换算的比例 -->
      <view class="astro__track">
        <view
          v-for="(band, index) in bands"
          :key="index"
          class="astro__band"
          :class="band.cls"
          :style="bandStyle(band)"
        />

        <!--
          「现在」。实心点 + 一圈卡面色的环：
          轨道上既有暖色带也有冷色带，纯色点在任何一段上都可能糊掉，
          那圈环让它在任何一段上都读得出位置。
        -->
        <view v-if="nowPercent !== null" class="astro__now" :style="`left:${nowPercent}%`" />
      </view>

      <!-- 证据：倒计时不说的那部分（月相、月出） -->
      <view class="astro__evidence">
        <image v-if="moonIconSrc" class="astro__moon" :src="moonIconSrc" mode="aspectFit" />
        <text class="astro__evidence-text">{{ evidenceText }}</text>
      </view>
    </view>

    <text v-else class="astro__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * AstroCard —— 日照时段与月相。
 *
 * 取的是日预报里的 astro 块（新版和风把天文现象放进了这一块，
 * 日出日落、月出月落都在那儿）。
 *
 * 这张卡的读法是**倒计时优先**：先答「还能下多久水」，
 * 剩下的时刻与月相是证据，不是主角。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { LOADING_TEXT, retryable } from '@/constants/copy';
import { useSurface } from '@/composables/useSurface';
import { useSurfaceIcons } from '@/composables/useSurfaceIcons';
import { useConditionsStore } from '@/stores/conditions';
import type { WeatherDay } from '@/types/fishing';
import { shortDate } from '@/utils/date';
import {
  astroBands,
  astroTargets,
  clockText,
  dayWord,
  nightWindows,
  percentOf,
  type AstroBand,
  type AstroTarget,
} from '@/utils/astro';
import { createCountUp, enterDelayMs } from '@/utils/motion';
import { moonPhaseIconUri, todayForecastDate } from '@/utils/weather';

const conditionsStore = useConditionsStore();

/**
 * 这一块压在什么上面。照片面上图标要压白（见 utils/theme 的图标说明）。
 */
const surface = useSurface();

/** 图标色档由 useSurfaceIcons 统一给（见该文件的说明） */
const { sunMoon: sunMoonIcon } = useSurfaceIcons();

/* ── 数据 ──────────────────────────────────────────────────────────────── */

/**
 * 带天文数据的那些天。
 *
 * 这里只要有日出日落的那几天 —— 天文数据与高低温的完整性无关。
 */
const astroDays = computed(() => conditionsStore.forecasts.filter((row) => row.sunrise || row.sunset));

/**
 * 今天的日期键。
 *
 * 口径与其他卡一致：归一后第一行（见 utils/weather 的 forecastDays）。
 * 头一天要是脏数据（缺高低温）整条被丢掉，剩下的第一行才是今天 ——
 * 头图、多日预报与这张卡说的必须是同一天。
 */
const todayDate = computed(() => todayForecastDate(conditionsStore.forecasts));

/** 今天那一条 */
const day = computed<WeatherDay | null>(() => {
  const rows = astroDays.value;
  if (!rows.length) return null;

  const key = todayDate.value;
  return (key ? rows.find((row) => row.fxDate === key) : null) ?? rows[0];
});

/**
 * 明天那一条。
 *
 * 取不到就没有 —— 没有明天的数据就不拿今天的时刻顶替，
 * 编出来的「明天日出」比没有更坏。
 */
const tomorrow = computed<WeatherDay | null>(() => {
  const rows = astroDays.value;
  const index = day.value ? rows.indexOf(day.value) : -1;
  return index >= 0 ? (rows[index + 1] ?? null) : null;
});

const dateLabel = computed(() => (day.value?.fxDate ? shortDate(day.value.fxDate) : ''));

/**
 * 月相图标的地址。
 *
 * 空串表示这一天的月相不认识（上游新增了代码，或当天没给 astro），
 * 模板据此不画图标，只留中文名。
 */
const moonIconSrc = computed(() => moonPhaseIconUri(day.value?.moonPhaseCode ?? ''));

/* ── 现在的时刻 ────────────────────────────────────────────────────────── */

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
 * 不刷新的话，倒计时会一直停在打开页面的那一秒 —— 一张会自己说谎的卡，
 * 比没有这张卡更糟。一分钟一次足够：读数是分钟级的，
 * 每一帧都重算是白花钱。
 */
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => {
    nowMinutes.value = currentMinutes();

    const at = activeTarget.value?.at;
    if (at === undefined || at === null) return;
    // 分钟推进只差一分，不重播滚动 —— 直接定住
    countUp.set(Math.max(0, at - nowMinutes.value));
  }, 60_000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

/* ── 夜钓窗口 ────────────────────────────────────────────────────────── */

/** 夜钓窗口。算法见 utils/astro 的 nightWindows */
const windows = computed(() => nightWindows(day.value, tomorrow.value));

/* ── 目标 ──────────────────────────────────────────────────────────────── */

/** 三个倒计时目标：夜钓窗口、日出、日落。算法见 utils/astro 的 astroTargets */
const targets = computed(() => astroTargets(day.value, tomorrow.value, windows.value, nowMinutes.value));

/** 用户点的是哪一枚 */
const selectedKey = ref('night');

/** 正在数的那一枚。点的那枚没了就退回第一个 */
const activeTarget = computed<AstroTarget | null>(() => {
  const list = targets.value;
  return list.find((item) => item.key === selectedKey.value) ?? list[0] ?? null;
});

const activeKey = computed(() => activeTarget.value?.key ?? '');

function selectTarget(key: string): void {
  selectedKey.value = key;
}

/* ── 倒计时 ────────────────────────────────────────────────────────────── */

/** 当前显示的剩余分钟数 */
const remaining = ref(0);

/**
 * 数字滚动。
 *
 * 用 createCountUp 而不是自己写 setInterval：计数期间每改一次值就是一次跨线
 * setData，控制器只在整数真的变了时才写。
 */
const countUp = createCountUp((value) => {
  remaining.value = value;
});

/** 组件没了就别再滚：定时器停下来，最后一次 setData 才不会打在卸载后的节点上 */
onUnmounted(() => {
  countUp.cancel();
});

/**
 * 目标变了就重数一遍。
 *
 * 换胶囊时从当前显示值补间过去 —— 从 46 分钟滚到 10 小时 10 分，
 * 那一段滚动本身就在说「尺度变了」。
 *
 * 延迟用 enterDelayMs(1)：这张卡在页面上是第 1 张入场，
 * 数字跟卡片一起落位，读起来是「一次落位」而不是两件事各演各的。
 */
watch(
  () => activeTarget.value?.at ?? null,
  (at) => {
    if (at === null || at === undefined) return;
    countUp.to(Math.max(0, at - nowMinutes.value), { delay: enterDelayMs(1) });
  },
  { immediate: true },
);

/**
 * 大数字。
 *
 * 不到一小时只写分钟；超过一小时写成「X 小时 Y 分」——
 * 「640 分钟」要读者自己换算，「10 小时 10 分」不用。
 */
const countText = computed(() => {
  const value = Math.max(0, remaining.value);
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return hours > 0 ? `${hours} 小时 ${minutes} 分` : String(value);
});

/** 不到一小时时跟在数字后面的单位 */
const countUnit = computed(() => (remaining.value >= 60 ? '' : '分钟'));

/** 说明行：数到哪一刻、那是什么、是哪一天 */
const captionText = computed(() => {
  const target = activeTarget.value;
  if (!target) return '';

  return `${dayWord(target.at)} ${clockText(target.at)} · ${target.event}`;
});

/* ── 轨道 ──────────────────────────────────────────────────────────────── */

/** 轨道上的两段：白昼与夜钓窗口。算法见 utils/astro 的 astroBands */
const bands = computed(() => astroBands(day.value, windows.value));

const nowPercent = computed(() => percentOf(nowMinutes.value));

/** 段 → 行内样式。rpx 只对样式文件有效，行内样式这里统一用百分比 */
function bandStyle(band: AstroBand): string {
  return `left:${band.left.toFixed(2)}%;width:${band.width.toFixed(2)}%`;
}

/* ── 证据行 ────────────────────────────────────────────────────────────── */

/**
 * 倒计时不说的那部分：月相与月出。
 *
 * 月落、天黑、日出、日落都已经由说明行与胶囊说过了，
 * 同一件事在一屏里说两遍等于没说。这里只补它没说的。
 */
const evidenceText = computed(() => {
  const today = day.value;
  if (!today) return '';

  const parts: string[] = [];
  if (today.moonPhase) parts.push(today.moonPhase);
  if (today.moonrise) parts.push(`月出 ${today.moonrise}`);

  return parts.join(' · ');
});

const emptyText = computed(() => {
  if (conditionsStore.weatherLoading) return LOADING_TEXT;
  if (conditionsStore.weatherError) return retryable('日照数据暂时取不到');
  return conditionsStore.forecasts.length ? retryable('暂无日照数据') : retryable('暂无预报数据');
});
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

/* 分区标题统一走 fish-card-title（见 DayForecast 同名注释） */
.astro__title {
  @include fish-card-title;
}

.astro__meta {
  @include fish-card-meta;
}

/* 标题左侧的图标。底边贴着文字基线，像个字那样站着 */
.astro__head-left {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

/* 尺寸走 badge 那一档：标题落到 caption 之后，图标不该比字还大 */
.astro__title-icon {
  width: $fish-icon-badge;
  height: $fish-icon-badge;
}

/* 照片面：压到 72%，与 muted 标题同档（见 Next24Hours 同名注释） */
.astro__title-icon--dim {
  @include fish-photo-icon-dim;
}

.astro__body {
  display: flex;
  flex-direction: column;
}

/*
 * 倒计时。
 *
 * 这张卡的第一个字。上面的留白比下面的多 —— 主角要往边上靠一点，
 * 下面的胶囊与轨道才是「证据」。
 */
.astro__hero {
  padding-top: 8rpx;
}

.astro__hero-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

/* 大数字。display 那一档就是主角数字用的 */
.astro__count {
  color: $fish-ink;
  @include fish-type(display);
  @include numeric;
}

/* 单位。跟在数字后面，不占主角位 */
.astro__count-unit {
  color: $fish-muted;
  @include fish-type(body);
}

/* 说明行：数到哪一刻 */
.astro__caption {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 三枚胶囊。
 *
 * 命中区 64rpx（32pt）—— 卡片里空间紧，但这一排是这张卡唯一的操作，
 * 按不准比看不见更糟。
 *
 * 按下反馈用变暗不是缩小：缩小会让相邻的胶囊跟着挪一点，
 * 读起来像「整排跳了一下」。
 */
.astro__targets {
  display: flex;
  gap: 12rpx;
  margin-top: 28rpx;
}

.astro__target {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64rpx;
  padding: 0 8rpx;
  border: 1rpx solid $fish-border-40;
  border-radius: $fish-radius-pill;
  @include fish-press-dim;
}

/* 选中：淡蓝底 + 蓝字。底色是淡底不是实底 —— 这一排压着玻璃面 */
.astro__target--active {
  background-color: $fish-accent-tint;
  border-color: transparent;
}

.astro__target-text {
  color: $fish-muted;
  @include fish-type(caption);
  white-space: nowrap;
}

.astro__target-text--active {
  color: $fish-blue-600;
  font-weight: 500;
}

/*
 * 24 小时轨道。
 *
 * 底色是中性填充 —— 夜就是「没有暖色」，不用再给它染一层深蓝。
 * 段和段都绝对定位，轨道本身不参与排版。
 */
.astro__track {
  position: relative;
  height: 12rpx;
  margin-top: 28rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

.astro__band {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: $fish-radius-pill;
}

/* 白昼：暖色。两个色标在同一片暖调里，读作「同一种日光的两端」 */
.astro__band--day {
  background-image: linear-gradient(90deg, $fish-sun 0%, $fish-sun-soft 100%);
}

/* 夜钓窗口：月色。跟月相图标里那轮月亮是同一个值 */
.astro__band--night {
  background-color: $fish-moon;
}

/*
 * 「现在」。
 *
 * 实心点用正文色（浅色下是黑、深色下是白），外面一圈卡面色的环：
 * 轨道上既有暖色带也有冷色带，单靠点自身的颜色在某些段上会糊掉，
 * 那圈环把它从底色里抬出来。
 */
.astro__now {
  position: absolute;
  top: 50%;
  width: 16rpx;
  height: 16rpx;
  margin-left: -8rpx;
  border-radius: 50%;
  background-color: $fish-ink;
  box-shadow: 0 0 0 4rpx $fish-card-face;
  transform: translateY(-50%);
}

/* 证据行 */
.astro__evidence {
  display: flex;
  align-items: center;
  margin-top: 20rpx;
}

/* 月相图标是一张图，不是一行字，理由见 HourlyWeather 的 .hourly__icon */
.astro__moon {
  width: 40rpx;
  height: 40rpx;
  margin-right: 10rpx;
}

.astro__evidence-text {
  color: $fish-muted-60;
  @include fish-type(caption);
}

.astro__empty {
  color: $fish-muted;
  @include fish-type(body);
}
</style>
