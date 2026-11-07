<template>
  <!--
    日照与月相 —— 一张卡先回答「还能下多久水」。

    为什么是倒计时：钓鱼是**跟日照过不去**的活。33 度的晴天下午两点
    和清早六点，鱼口完全是两回事 —— 但「晴 / 33°」这个读数里没有这句话，
    只有「今天几点天黑、几点月落」里有。所以这张卡把最上面让给倒计时，
    日出日落的时刻、月相这些退成证据。

    底下那条 24 小时轨道按真实比例排，不做视觉上的匀分：
    匀分出来的时间轴会骗人 —— 6 月和 12 月的白昼长度差一倍，
    一条等长的暖色带在这两幅图里完全不是同一件事。
    暖色是白昼，冷色是夜钓窗口（天黑且月亮在天上的那几段），
    圆点标着「现在」。
  -->
  <view class="astro">
    <view class="astro__head">
      <view class="astro__head-left">
        <image class="astro__title-icon" :src="sunMoonIcon" mode="aspectFit" />
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
          <text
            class="astro__target-text"
            :class="{ 'astro__target-text--active': target.key === activeKey }"
          >
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

import { icon } from '@/constants/icons';
import { useConditionsStore } from '@/stores/conditions';
import type { WeatherDay } from '@/types/fishing';
import { minutesOfDay, shortDate } from '@/utils/date';
import { createCountUp, enterDelayMs } from '@/utils/motion';
import { moonPhaseIconUri } from '@/utils/weather';

const conditionsStore = useConditionsStore();

const sunMoonIcon = computed(() => icon('sun-moon', 'ink'));

/** 一天 1440 分钟。轨道与倒计时共用这把尺子 */
const DAY_MINUTES = 24 * 60;

/** 一个倒计时目标 */
interface AstroTarget {
  key: string;
  /** 胶囊上的字 */
  label: string;
  /** 目标时刻：从今天零点起算的分钟数，可以大于 1440（那是明天） */
  at: number;
  /** 这一刻是什么：天黑 / 月落 / 日出 / 日落 */
  event: string;
}

/** 轨道上的一段 */
interface AstroBand {
  cls: string;
  left: number;
  width: number;
}

/* ── 数据 ──────────────────────────────────────────────────────────────── */

/**
 * 带天文数据的那些天。
 *
 * 「今天」不一定是接口的第一条 —— 头一天要是脏数据（缺高低温），
 * 归一层会把它整条丢掉（见 utils/weather 的 forecastDays），
 * 剩下的第一行才是今天。所以今天按 fxDate 找，不按位置猜。
 */
const astroDays = computed(() => conditionsStore.forecasts.filter((row) => row.sunrise || row.sunset));

/** 今天的日期键（设备本地）。fxDate 形如 2026-11-07 */
function todayKey(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 今天那一条 */
const day = computed<WeatherDay | null>(() => {
  const rows = astroDays.value;
  if (!rows.length) return null;

  const key = todayKey();
  return rows.find((row) => row.fxDate === key) ?? rows[0];
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
  return index >= 0 ? rows[index + 1] ?? null : null;
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

/**
 * 一段「天黑且月亮在天上」的时间。
 *
 * 两个条件缺一不可：月亮不在天上那截钓不到鱼，天亮那截也不是夜里。
 */
interface AstroWindow {
  start: number;
  end: number;
  /** 窗口怎么开的：天黑 / 月出 */
  open: string;
  /** 窗口怎么关的：月落 / 天亮 */
  close: string;
}

/**
 * 夜钓窗口 = 天黑 ∧ 月亮在天上。
 *
 * ⚠️ 不要按「天黑 → 月落」配对 —— 那是错的。
 * 月落若在天黑之前（残月常见：月亮后半夜升起、天黑前就落了），
 * 那一夜压根没有月亮在天上的时段，配出来的窗口既不是夜里也没有月。
 * 交集才是窗口：暗的那截 ∩ 月在天上的那截。
 *
 * 时刻是绝对分钟（从今天零点起算，可以超过 1440 —— 那是明天）。
 */
const windows = computed<AstroWindow[]>(() => {
  const today = day.value;
  if (!today) return [];

  const moonrise = minutesOfDay(today.moonrise);
  const moonset = minutesOfDay(today.moonset);
  const dusk = minutesOfDay(today.civilDusk);
  const dawn = minutesOfDay(today.civilDawn);
  if (moonrise === null || moonset === null || dusk === null || dawn === null) return [];

  const next = tomorrow.value;
  const tomorrowDawn = minutesOfDay(next?.civilDawn) ?? dawn;
  const tomorrowDusk = minutesOfDay(next?.civilDusk) ?? dusk;
  const tomorrowMoonrise = minutesOfDay(next?.moonrise);
  const tomorrowMoonset = minutesOfDay(next?.moonset);

  /**
   * 月亮在天上的那一段。
   *
   * s < r 表示今夜升起、明晨落下 —— 那一段跨零点。
   */
  const up = (start: number, end: number, offset: number) =>
    end > start
      ? { start: offset + start, end: offset + end }
      : { start: offset + start, end: offset + end + DAY_MINUTES };

  const moonSpans = [
    up(moonrise, moonset, 0),
    // 上一段：它决定今天凌晨还亮不亮月亮
    moonset > moonrise
      ? { start: moonrise - DAY_MINUTES, end: moonset - DAY_MINUTES }
      : { start: moonrise - DAY_MINUTES, end: moonset },
  ];
  if (tomorrowMoonrise !== null && tomorrowMoonset !== null) {
    moonSpans.push(up(tomorrowMoonrise, tomorrowMoonset, DAY_MINUTES));
  }

  /** 天黑的那几段：昨夜剩下的、今夜、明夜 */
  const darkSpans = [
    { start: dusk - DAY_MINUTES, end: dawn },
    { start: dusk, end: DAY_MINUTES + tomorrowDawn },
    { start: DAY_MINUTES + tomorrowDusk, end: DAY_MINUTES * 2 + tomorrowDawn },
  ];

  const list: AstroWindow[] = [];

  for (const moon of moonSpans) {
    for (const dark of darkSpans) {
      const start = Math.max(moon.start, dark.start);
      const end = Math.min(moon.end, dark.end);
      if (start >= end) continue;

      list.push({
        start,
        end,
        // 交集的起点取两者里靠后的那个 —— 那才是窗口真正开的那一刻
        open: dark.start > moon.start ? '天黑' : '月出',
        close: moon.end < dark.end ? '月落' : '天亮',
      });
    }
  }

  list.sort((a, b) => a.start - b.start);
  return list;
});

/**
 * 夜钓窗口这一项数到哪一刻。
 *
 * 窗口正开着 → 数到它关（还剩多久收竿）；
 * 窗口还没开 → 数到它开（还有多久能下水）。
 */
const nightTarget = computed<AstroTarget | null>(() => {
  const now = nowMinutes.value;
  const list = windows.value;
  if (!list.length) return null;

  const current = list.find((item) => now >= item.start && now <= item.end);
  if (current) {
    return { key: 'night', label: '夜钓窗口', at: current.end, event: current.close };
  }

  const upcoming = list.find((item) => item.start > now);
  if (!upcoming) return null;

  return { key: 'night', label: '夜钓窗口', at: upcoming.start, event: upcoming.open };
});

/* ── 目标 ──────────────────────────────────────────────────────────────── */

/**
 * 三个倒计时目标：夜钓窗口、日出、日落。
 *
 * 每个目标都是「从现在往后，下一次发生的那一刻」。
 * 晚上 8 点看「日出」，数的是明天早上那一次 —— 所以日出的时刻可能落在
 * 明天，具体是哪一天由说明行说了算。
 */
const targets = computed<AstroTarget[]>(() => {
  const today = day.value;
  if (!today) return [];

  const now = nowMinutes.value;
  const sunrise = minutesOfDay(today.sunrise);
  const sunset = minutesOfDay(today.sunset);

  const next = tomorrow.value;
  const tomorrowSunrise = minutesOfDay(next?.sunrise);
  const tomorrowSunset = minutesOfDay(next?.sunset);

  /**
   * 下一个「今天这个钟点」：今天的过了就取明天的。
   *
   * 两个来源都没有就返回 null —— 那一项不出现，
   * 不用别处的时刻凑一个出来。
   */
  const pick = (todayValue: number | null, tomorrowValue: number | null): number | null => {
    if (todayValue !== null && todayValue > now) return todayValue;
    if (tomorrowValue !== null) return DAY_MINUTES + tomorrowValue;
    if (todayValue !== null) return DAY_MINUTES + todayValue;
    return null;
  };

  const list: AstroTarget[] = [];

  // 夜钓窗口：数到下一个边界（窗口开 / 窗口关）
  const night = nightTarget.value;
  if (night) list.push(night);

  const sunriseAt = pick(sunrise, tomorrowSunrise);
  if (sunriseAt !== null) list.push({ key: 'sunrise', label: '日出', at: sunriseAt, event: '日出' });

  const sunsetAt = pick(sunset, tomorrowSunset);
  if (sunsetAt !== null) list.push({ key: 'sunset', label: '日落', at: sunsetAt, event: '日落' });

  return list;
});

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

/** 时刻落在哪一天 */
function dayWord(at: number): string {
  return Math.floor(at / DAY_MINUTES) === 0 ? '今天' : '明天';
}

/** 时刻 → HH:mm */
function clockText(at: number): string {
  const minutes = ((at % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/* ── 轨道 ──────────────────────────────────────────────────────────────── */

function percent(minutes: number): number {
  return (minutes / DAY_MINUTES) * 100;
}

/**
 * 轨道上的两段。
 *
 * 白昼是日出到日落。冷色那些是夜钓窗口 —— 天黑且月亮在天上的那几段。
 * 窗口可能跨零点（夜里开始的窗口会在轨道上是两截：昨夜开的那截在早上，
 * 今夜开的那截在傍晚），所以冷色段不止一条。
 *
 * 轨道画的是一整天，所以只取落在今天这一天的部分。
 */
const bands = computed<AstroBand[]>(() => {
  const today = day.value;
  if (!today) return [];

  const list: AstroBand[] = [];
  const sunrise = minutesOfDay(today.sunrise);
  const sunset = minutesOfDay(today.sunset);

  if (sunrise !== null && sunset !== null && sunset > sunrise) {
    list.push({ cls: 'astro__band--day', left: percent(sunrise), width: percent(sunset - sunrise) });
  }

  for (const item of windows.value) {
    const start = Math.max(item.start, 0);
    const end = Math.min(item.end, DAY_MINUTES);
    if (end <= start) continue;

    list.push({ cls: 'astro__band--night', left: percent(start), width: percent(end - start) });
  }

  return list;
});

const nowPercent = computed(() => percent(nowMinutes.value));

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
  if (conditionsStore.weatherLoading) return '加载中…';
  if (conditionsStore.weatherError) return '日照数据暂时取不到，刷新可重试';
  return conditionsStore.forecasts.length ? '暂无日照数据，刷新可重试' : '暂无预报数据，刷新可重试';
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

.astro__title-icon {
  width: $fish-icon-title;
  height: $fish-icon-title;
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
