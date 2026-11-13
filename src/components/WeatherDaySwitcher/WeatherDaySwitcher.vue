<template>
  <view class="wxs" :class="{ 'wxs--empty': !hasDays }">
    <!--
      天色背景。卡片自己的六档天色（见 tokens/_color.scss 的「卡片天色」）。

      与整页背景那份天（constants/weatherHero.ts 的十一档）刻意分开：
      整页背景**就是**那片天，卡片若铺同一段会与页面底色化掉，
      读不出这是一块可以点的东西。
    -->
    <view v-if="hasDays" class="wxs__sky">
      <view
        v-for="sky in skies"
        :key="sky.key"
        class="wxs__sky-layer"
        :class="['wxs__sky-layer--' + sky.key, { 'wxs__sky-layer--on': sky.key === activeSky }]"
      >
        <view class="wxs__blob wxs__blob--warm" />
        <view class="wxs__blob wxs__blob--cool" />

        <view v-if="sky.rain" class="wxs__rain">
          <view v-for="drop in rainDrops" :key="drop.key" class="wxs__drop" :style="drop.style" />
        </view>

        <view v-if="sky.snow" class="wxs__snow">
          <view v-for="flake in snowFlakes" :key="flake.key" class="wxs__flake" :style="flake.style" />
        </view>

        <view v-if="sky.flash" class="wxs__flash" />
      </view>
    </view>

    <view v-if="hasDays" class="wxs__body">
      <text class="wxs__place">{{ place }}</text>

      <!--
        星期名。换天时旧名留在原地淡出、新名淡入。

        两层是两层「节点」而不是同一个节点换文字：不动节点的动画不会重播
        （WXML 里只有 wx:for 的项才按 key 重建节点）。
      -->
      <view class="wxs__day">
        <text v-for="layer in dayLayers" :key="layer.id" class="wxs__day-text" :class="layer.cls">
          {{ layer.text }}
        </text>
      </view>

      <view class="wxs__hero">
        <view class="wxs__temp">
          <view class="wxs__digits">
            <text
              v-for="digit in tempDigits"
              :key="digit.key"
              class="wxs__digit"
              :class="{ 'wxs__digit--pop': digit.pop }"
              :style="digit.style"
              >{{ digit.ch }}</text
            >
          </view>
          <text class="wxs__deg">°</text>
        </view>

        <view class="wxs__icon">
          <view
            v-for="icon in icons"
            :key="icon.slug"
            class="wxs__icon-layer"
            :class="{ 'wxs__icon-layer--on': icon.slug === activeSlug }"
          >
            <image class="wxs__icon-img" :class="icon.idle" :src="icon.uri" mode="aspectFit" />
          </view>
        </view>
      </view>

      <view class="wxs__cond">
        <text v-for="layer in condLayers" :key="layer.id" class="wxs__cond-text" :class="layer.cls">
          {{ layer.text }}
        </text>
      </view>

      <view class="wxs__hl">
        <text class="wxs__hl-item">最高 {{ active.max }}°</text>
        <text class="wxs__hl-item">最低 {{ active.min }}°</text>
        <text v-if="active.prob > 0" class="wxs__hl-item wxs__hl-item--accent">降水 {{ active.prob }}%</text>
      </view>
    </view>

    <text v-else class="wxs__empty">{{ emptyText }}</text>

    <!-- 日期条。药丸在选中那一格下面滑动 -->
    <view v-if="hasDays" :id="tabsId" class="wxs__tabs">
      <view class="wxs__pill" :style="pillStyle" />

      <view
        v-for="(day, i) in days"
        :key="day.fxDate"
        class="wxs__tab"
        :class="{ 'wxs__tab--on': i === activeIndex }"
        @tap="select(i)"
      >
        <image class="wxs__tab-icon" :src="day.tabIcon" mode="aspectFit" />
        <text class="wxs__tab-label">{{ day.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 天气日切换器 —— 一张自带天色的大卡片，横着切几天：
 * 天色、图标、温度、天气现象一起换。
 *
 * 动效的时长与曲线来自组件原型（transitions.dev 的 Weather Day Switcher），
 * 原样保留。落到本项目时换了三处：
 *
 *   1. 天色自带一套 —— 六档，卡片自己的面（见 tokens/_color.scss 的
 *      「卡片天色」）。整页背景那份天（constants/weatherHero.ts 的十一档）
 *      拿来铺这张卡会与页面底色化掉 —— 整页背景**就是**那片天，
 *      卡片若铺同一段，读不出这是一块可以点的东西；
 *   2. 图标不再用内联 SVG —— WXML 不认 <svg>，改用 Meteocons 的数据 URI
 *      （见 utils/weather），也跟逐时预报、多日预报是同一批图标；
 *   3. 状态不再靠属性选择器 —— WXSS 不认 [data-x]，全部换成类
 *      （见 docs/mp-weixin-platform.md）。
 *
 * 降级走 $fish-motion（编译期）：小程序拿不到系统的 prefers-reduced-motion，
 * 理由见 mixins/_motion.scss 顶部那段。
 */
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { PLACE_NAME_FALLBACK } from '@/constants/copy';
import { WEATHER_ICONS, type WeatherCodeIconSlug } from '@/constants/weatherIcons';
import { useConditionsStore } from '@/stores/conditions';
import { forecastDayLabel, isNightHour } from '@/utils/date';
import { DIGIT_STAGGER, TEXT_MORPH_DURATION, TEXT_SWAP_DURATION } from '@/utils/motion';
import { createSelectorQuery } from '@/utils/selectorQuery';
import { cardWeatherState, CARD_SKIES, IDLE_CLASS, type CardSky, type GlyphIdle } from '@/utils/weatherCard';
import { forecastDays, weatherIconSlug } from '@/utils/weather';

/**
 * 日期条上放几天。
 *
 * 五格是一屏里读得过来的上限，再多每一格只剩一个字的宽度。
 */
const MAX_DAYS = 5;

interface SwitcherDay {
  fxDate: string;
  /** 今天 / 周三 */
  label: string;
  /** 日均气温 */
  avg: number;
  max: number;
  min: number;
  prob: number;
  /** 天气现象（上游原文） */
  condition: string;
  /** 卡片天色 */
  sky: CardSky;
  /** 图标名（Meteocons） */
  slug: WeatherCodeIconSlug;
  /** 待机动作 */
  idle: GlyphIdle;
  /** 日期条上的小图标 */
  tabIcon: string;
}

interface Digit {
  ch: string;
  key: string;
  /** 这一位要不要播落位动画 */
  pop: boolean;
  style: string;
}

const conditionsStore = useConditionsStore();
const instance = getCurrentInstance()!;

/**
 * 现在是不是夜里。
 *
 * 每分钟走一次 —— 跨过 18:00 时卡片要自己切成夜里的样子，
 * 不该等下一次取数。
 */
const now = ref(Date.now());
const nightNow = computed(() => isNightHour(new Date(now.value)));

/** 节点 id。同一页里这张卡可能不止一份，id 得唯一 */
const tabsId = `wxs-tabs-${Math.random().toString(36).slice(2, 8)}`;

const days = computed<SwitcherDay[]>(() =>
  forecastDays(conditionsStore.forecasts)
    .slice(0, MAX_DAYS)
    .map((day, index) => {
      // 今天到了夜里就换成夜里的那一半：图标、现象、天色都取夜里的。
      // 别的日子恒是白天那一半 —— 预报说的是「哪天白天什么天」，
      // 钓鱼看的也是白天。
      const atNight = nightNow.value && index === 0 && day.iconNight !== '';

      const slug = weatherIconSlug(atNight ? day.iconNight : day.icon);
      const state = cardWeatherState(slug);

      return {
        fxDate: day.fxDate,
        label: forecastDayLabel(day.fxDate, index),
        avg: day.avg,
        max: day.max,
        min: day.min,
        prob: day.prob,
        condition: atNight ? day.textNight : day.text,
        sky: state.sky,
        slug,
        idle: state.idle,
        tabIcon: WEATHER_ICONS[slug],
      };
    }),
);

const hasDays = computed(() => days.value.length > 0);

const activeIndex = ref(0);

/**
 * 选中的那一天。
 *
 * 没有预报时给一个空壳而不是 null：模板里满地都是 active.xxx，
 * 为它到处加问号不值当 —— 那时整块内容根本不渲染（见 hasDays）。
 */
const EMPTY_DAY: SwitcherDay = {
  fxDate: '',
  label: '',
  avg: 0,
  max: 0,
  min: 0,
  prob: 0,
  condition: '',
  sky: 'cloudy',
  slug: 'cloudy',
  idle: 'float',
  tabIcon: '',
};

const active = computed<SwitcherDay>(() => days.value[activeIndex.value] ?? days.value[0] ?? EMPTY_DAY);
const activeSky = computed(() => active.value.sky);
const activeSlug = computed(() => active.value.slug);

const place = computed(() => conditionsStore.locationName || PLACE_NAME_FALLBACK);

/* ── 天色层 ──────────────────────────────────────────────────────── */

/**
 * 出现的几段天色。每一档只给一层 —— 天色是事实，不是装饰，
 * 同一档天铺两层没有意义。
 *
 * 夜里那一档**永远在场**：它是按时辰切出来的，可能在任何一刻第一次出现。
 * 事先就在，切天色才是交叉淡入 —— 临时插进来的那层不会过渡，直接盖上去，
 * 读起来是硬切。
 */
const skies = computed(() => {
  const keys = new Set<CardSky>([...days.value.map((day) => day.sky), 'night']);

  return [...keys].map((key) => ({ key, ...CARD_SKIES[key] }));
});

/**
 * 雨丝。位置与长度是写死的（不是随机）—— 同一段天每次都长一个样，
 * 随机的话每次切天雨都在换位置，读起来像卡了一下。
 */
const rainDrops = Array.from({ length: 16 }, (_, i) => {
  const x = ((i * 37) % 100) + (i % 3) * 2;

  return {
    key: `drop-${i}`,
    style: [
      `left:${Math.min(x, 112)}%`,
      `height:${24 + ((i * 7) % 10) * 2}rpx`,
      // 负延迟：雨丝一出现就在半空，不用等它落下来
      `animation-delay:-${(((i * 0.618) % 1) * 0.8).toFixed(3)}s`,
    ].join(';'),
  };
});

/**
 * 雪花。位置与大小是写死的（不是随机）—— 同一段天每次都长一个样，
 * 随机的话每次切天雪都在换位置，读起来像卡了一下。
 */
const snowFlakes = Array.from({ length: 14 }, (_, i) => {
  const x = ((i * 41) % 100) + (i % 4) * 3;
  const size = 6 + ((i * 5) % 4) * 3;

  return {
    key: `flake-${i}`,
    style: [
      `left:${Math.min(x, 108)}%`,
      `width:${size}rpx`,
      `height:${size}rpx`,
      // 负延迟：雪一出现就在半空，不用等它落下来
      `animation-delay:-${(((i * 0.754) % 1) * 6).toFixed(2)}s`,
    ].join(';'),
  };
});

/* ── 大图标 ──────────────────────────────────────────────────────── */

/**
 * 大图标。几枚叠在同一格里，只有选中的那一枚是亮的。
 *
 * 待机动作（太阳自转、云浮动、雷闪）挂在图标自己身上，
 * 不挂在换态的那一层上 —— 换态那一层要动 scale 与 blur，
 * 两者都要独占 transform。
 */
const icons = computed(() => {
  const seen = new Map<WeatherCodeIconSlug, { slug: WeatherCodeIconSlug; uri: string; idle: string }>();

  for (const day of days.value) {
    if (seen.has(day.slug)) continue;

    seen.set(day.slug, {
      slug: day.slug,
      uri: WEATHER_ICONS[day.slug],
      // 待机动作挂在这枚图标自己身上，不挂在换态那一层（理由见上面的注释）
      idle: IDLE_CLASS[day.idle],
    });
  }

  return [...seen.values()];
});

/* ── 温度数字 ────────────────────────────────────────────────────── */

const tempDigits = ref<Digit[]>([]);

let digitToken = 0;
let digitsFilled = false;

/**
 * 逐位错开的延迟（ms）。
 *
 * 从倒数第二位起错开：倒数第二位错一位、最后一位错两位。
 * 只有一位数时没有「错开」可言 —— 不给延迟。
 */
function staggerDelay(index: number, length: number): number {
  if (length < 2) return 0;
  if (index === length - 2) return DIGIT_STAGGER;
  if (index === length - 1) return DIGIT_STAGGER * 2;

  return 0;
}

/** 两个字符串的最长公共前缀长度 —— 前缀里的那几位没变，不该重播落位 */
function commonPrefix(a: string, b: string): number {
  let i = 0;

  while (i < a.length && i < b.length && a[i] === b[i]) i++;

  return i;
}

/**
 * 换温度数字。
 *
 * 没变就什么都不做 —— 同一天的两段读数一样时重播一次落位，
 * 读起来像数据闪了一下。
 */
function setDigits(next: string): void {
  const prev = tempDigits.value.map((digit) => digit.ch).join('');
  if (prev === next) return;

  const same = commonPrefix(prev, next);
  digitToken += 1;
  const chars = next.split('');

  tempDigits.value = chars.map((ch, i) => {
    // 第一次填数据不播：那时候是「数据到了」，不是「读数变了」
    const pop = digitsFilled && i >= same;
    const delay = staggerDelay(i, chars.length);

    return {
      ch,
      // 前缀里没变的那几位沿用同一个 key，节点不被重建，也就不会重播
      key: i < same ? `same-${i}` : `chg-${digitToken}-${i}`,
      pop,
      style: pop && delay ? `animation-delay:${delay}ms` : '',
    };
  });

  digitsFilled = true;
}

/* ── 换字（天气现象与星期名共用一套层） ──────────────────────────── */

/**
 * 一层一个字。
 *
 * 换字是「旧的一层淡出、新的一层淡入」，不是同一个节点换文字 ——
 * 不动节点的动画不会重播：WXML 里只有 wx:for 的项才按 key 重建节点，
 * 静态节点改了文字，动画停在上一轮的终态。
 */
interface TextLayer {
  id: number;
  text: string;
  cls: string;
}

/**
 * 摘旧层的宽限（ms）。
 *
 * 动画时长一到就该摘，但摘早一点会露出空档 —— 宽限几十毫秒，
 * 代价只是多留一个看不见的节点。
 */
const REMOVE_GRACE_MS = 60;

/**
 * 一处换字。
 *
 * 天气现象与星期名说的是同一件事 —— 旧的那层淡出、新的一层淡入，
 * 淡完再摘旧层。两处各写一遍，动画节奏迟早走偏。
 */
function createTextSwap(duration: number, inClass: string, outClass: string) {
  const layers = ref<TextLayer[]>([]);

  let nextId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function set(text: string): void {
    const current = layers.value[layers.value.length - 1];
    if (current && current.text === text) return;

    nextId += 1;
    const id = nextId;

    layers.value = [...layers.value.map((layer) => ({ ...layer, cls: outClass })), { id, text, cls: inClass }];

    if (timer !== null) clearTimeout(timer);

    timer = setTimeout(() => {
      layers.value = layers.value.filter((layer) => layer.id === id);
      timer = null;
    }, duration + REMOVE_GRACE_MS);
  }

  function clear(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    layers.value = [];
  }

  return { layers, set, clear };
}

/** 天气现象：换字淡入淡出 */
const {
  layers: condLayers,
  set: setCondition,
  clear: clearCondition,
} = createTextSwap(TEXT_SWAP_DURATION, 'wxs__cond-text--in', 'wxs__cond-text--out');

/* ── 星期名（morph） ─────────────────────────────────────────────── */

/** 星期名：换字时宽度跟着换 */
const {
  layers: dayLayers,
  set: setDay,
  clear: clearDay,
} = createTextSwap(TEXT_MORPH_DURATION, 'wxs__day-text--in', 'wxs__day-text--out');

/* ── 日期条（药丸滑动） ──────────────────────────────────────────── */

const tabRects = ref<{ left: number; width: number }[]>([]);

const pillStyle = computed(() => {
  const rect = tabRects.value[activeIndex.value];
  if (!rect) return {};

  return {
    transform: `translateX(${rect.left}px)`,
    width: `${rect.width}px`,
  };
});

/**
 * 量各格的位置与宽度。
 *
 * 药丸跟着选中那一格走，得知道它在哪 —— 格子是等分的，
 * 但等分不等于知道起点在哪一段（横竖屏、字宽变化都会挪），
 * 所以量一次真实的矩形位置。
 */
function measureTabs(): void {
  createSelectorQuery(instance)
    .select(`#${tabsId}`)
    .boundingClientRect()
    .selectAll('.wxs__tab')
    .boundingClientRect()
    .exec((res) => {
      const bar = (Array.isArray(res?.[0]) ? res?.[0][0] : res?.[0]) as { left?: number } | undefined;
      const tabs = (Array.isArray(res?.[1]) ? res?.[1] : []) as {
        left?: number;
        width?: number;
      }[];

      if (typeof bar?.left !== 'number') return;

      const barLeft = bar.left;
      const rects = tabs
        .filter((tab) => typeof tab.left === 'number' && typeof tab.width === 'number')
        .map((tab) => ({ left: (tab.left as number) - barLeft, width: tab.width as number }));

      if (!rects.length) return;

      tabRects.value = rects;
    });
}

/* ── 切换 ────────────────────────────────────────────────────────── */

/**
 * 选中的那一天（记日期，不记下标）。
 *
 * 预报刷新时列表会整体前移一天 —— 按下标记的话，用户选的那天
 * 会悄悄换成另一天，界面上什么提示都没有。
 */
const selectedDate = ref<string | null>(null);

function select(index: number): void {
  const target = days.value[index];
  if (!target || index === activeIndex.value) return;

  activeIndex.value = index;
  selectedDate.value = target.fxDate;

  // 星期名：旧名留在原地淡出，新名淡入
  setDay(target.label);
  setCondition(target.condition);
  setDigits(String(target.avg));
}

/**
 * 数据换了一份。
 *
 * 选中的那一天还在就留着（刷新一下把用户甩回今天，是白丢他选的东西）；
 * 不在了才回到第一天。
 */
watch(
  () => days.value.map((day) => `${day.fxDate}:${day.avg}:${day.condition}`).join('|'),
  () => {
    const keep = selectedDate.value;
    const index = keep === null ? -1 : days.value.findIndex((day) => day.fxDate === keep);

    activeIndex.value = index >= 0 ? index : 0;

    if (!hasDays.value) return;

    const current = active.value;
    selectedDate.value = current.fxDate;

    setDay(current.label);
    setCondition(current.condition);
    setDigits(String(current.avg));
  },
  { immediate: true },
);

/** 天数变了，格子的宽度也变了 */
watch(
  () => days.value.length,
  () => {
    void nextTick(measureTabs);
  },
);

let offResize: (() => void) | null = null;
let clock: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  void nextTick(measureTabs);

  clock = setInterval(() => {
    now.value = Date.now();
  }, 60_000);

  const off = uni.onWindowResize(() => {
    void nextTick(measureTabs);
  });

  offResize = typeof off === 'function' ? off : null;
});

onBeforeUnmount(() => {
  offResize?.();

  if (clock !== null) clearInterval(clock);

  clearCondition();
  clearDay();
});

const emptyText = computed(() => (conditionsStore.weatherError ? '预报暂时取不到' : '未来几天没有预报数据'));
</script>

<style lang="scss" scoped>
.wxs {
  position: relative;
  overflow: hidden;
  border-radius: $fish-radius-mid;
  background-color: $fish-deep-base;
  box-shadow: $smooth-shadow-sm;
  color: $fish-on-dark;
}

/* ==========================================================================
   天色背景
   ========================================================================== */

.wxs__sky {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}

/*
 * 一段天色。几段叠在同一格里，换天时交叉淡入（700ms）。
 *
 * 淡的是整层：光晕、雨丝跟着一起换，不会出现「天色变了但雨还在下」。
 */
.wxs__sky-layer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  opacity: 0;

  @if $fish-motion {
    transition: opacity $fish-dur-sky-fade $fish-ease-swap;
  }
}

/*
 * 六段天色。
 *
 * 渐变在令牌层（见 tokens/_color.scss 的「卡片天色」那一段）：
 * 卡片自己的面与整页背景那份天色分开 —— 整页背景就是那片天，
 * 卡片铺同一段就与页面底色化掉了，读不出这是一块可以点的东西。
 *
 * 按令牌那张表生成，不手写六条规则 —— 加一档天色只改表。
 */
@each $sky, $gradient in $fish-card-sky {
  .wxs__sky-layer--#{$sky} {
    background-image: $gradient;
  }
}

.wxs__sky-layer--on {
  opacity: 1;
}

/*
 * 两团漂移的光。它们的色相跟着天色走：
 * 晴的那档暖光在前，雨雪那档把暖光压掉 —— 一片下着雨的暖光读作矛盾。
 */
.wxs__blob {
  position: absolute;
  border-radius: 50%;
  opacity: 0.55;

  @if $fish-motion {
    animation: wxs-drift $fish-dur-sky-drift ease-in-out infinite alternate;
  }
}

/* 暖光默认没有：一片下着雨的暖光读作矛盾，只有晴天那道 */
.wxs__blob--warm {
  top: 30%;
  right: -220rpx;
  width: 480rpx;
  height: 480rpx;
  opacity: 0;
  background-image: radial-gradient(circle, $fish-sky-glow-warm 0%, $fish-sky-glow-warm-0 65%);
}

.wxs__blob--cool {
  top: 12%;
  left: -260rpx;
  width: 520rpx;
  height: 520rpx;
  background-image: radial-gradient(circle, $fish-sky-glow-cool 0%, $fish-sky-glow-cool-0 68%);

  @if $fish-motion {
    animation-duration: $fish-dur-sky-drift * 1.3;
    animation-direction: alternate-reverse;
  }
}

/* 晴天那道暖光 */
.wxs__sky-layer--clear .wxs__blob--warm {
  opacity: 1;
}

/* 夜里的冷光收一档 */
.wxs__sky-layer--night .wxs__blob--cool {
  opacity: 0.35;
}

/* 雨丝 */
.wxs__rain {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}

.wxs__drop {
  position: absolute;
  top: -48rpx;
  width: 3rpx;
  border-radius: 2rpx;
  background-image: linear-gradient(180deg, $fish-sky-rain-0 0%, $fish-sky-rain 100%);

  @if $fish-motion {
    animation: wxs-fall $fish-dur-sky-rain linear infinite;
  }
}

/* 落雪 */
.wxs__snow {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}

.wxs__flake {
  position: absolute;
  top: -24rpx;
  border-radius: 50%;
  background-color: $fish-sky-snow;
  filter: blur(1rpx);

  @if $fish-motion {
    animation: wxs-fall-snow $fish-dur-sky-snow linear infinite;
  }
}

/* 闪电 */
.wxs__flash {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  opacity: 0;
  background-image: radial-gradient(ellipse at 70% 0%, $fish-sky-flash 0%, $fish-sky-flash-0 70%);

  @if $fish-motion {
    animation: wxs-flash $fish-dur-sky-flash ease-out infinite;
  }
}

/* ==========================================================================
   内容
   ========================================================================== */

.wxs__body {
  position: relative;
  z-index: 1;
  padding: 48rpx 48rpx 0;
}

.wxs__place {
  color: $fish-on-dark;
  @include fish-type(body, 500);
}

/*
 * 星期名。
 *
 * 两层都绝对定位，容器宽度由量出来的新名字给 —— 宽度是「换」出来的，
 * 没有量就没有宽度。过渡在第一次量完之后才挂上，
 * 否则第一次给宽度会从 0 涨上来。
 *
 * 块级：这一行要自己占一行。行内元素会跟上一行的地名挤在一行里
 * （「广州越秀今天」），读起来像一串地名而不是两个信息。
 */
.wxs__day {
  position: relative;
  display: block;
  height: 36rpx;
  margin-top: 4rpx;
}

.wxs__day-text {
  position: absolute;
  top: 0;
  left: 0;
  color: $fish-sky-muted;
  white-space: nowrap;
  @include fish-type(caption);
}

.wxs__day-text--in {
  opacity: 1;

  @if $fish-motion {
    animation: wxs-morph-in $fish-dur-text-morph $fish-ease-tabs both;
  }
}

.wxs__day-text--out {
  opacity: 0;

  @if $fish-motion {
    animation: wxs-morph-out $fish-dur-text-morph $fish-ease-tabs both;
  }
}

/* 温度与图标并排 */
.wxs__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  margin-top: 16rpx;
}

/* 度数符号与数字同一基线，字形自己在上半格 —— 与原型那枚一样 */
.wxs__temp {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: baseline;
}

.wxs__digits {
  display: flex;
  align-items: baseline;
}

/*
 * 每一位是一个独立的节点：落位动画逐位错开，
 * 前缀里没变的那几位沿用同一个 key，节点不被重建，也就不会重播。
 */
/*
 * 主角数字。
 *
 * 用系统字体而不是 Nunito：这张卡是 iOS 天气卡的样子，数字跟着那一套走
 * （Regular，比 Nunito 细一档）。tabular-nums 留着 ——
 * 换数时字宽不变，数字不会左右跳。
 */
.wxs__digit {
  display: inline-block;
  font-size: 132rpx;
  line-height: 1;
  letter-spacing: -0.04em;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.wxs__digit--pop {
  @if $fish-motion {
    animation: wxs-digit-pop $fish-dur-digit $fish-ease-digit both;
  }
}

.wxs__deg {
  margin-left: 4rpx;
  font-size: 112rpx;
  line-height: 1;
  font-weight: 400;
}

/*
 * 大图标。
 *
 * Meteocons 的插画四周留白多（图形只占 128 视窗的六成），
 * 盒子给到 140rpx，画出来的那一朵云才与旁边那排数字差不多大。
 */
.wxs__icon {
  position: relative;
  flex: none;
  width: 140rpx;
  height: 140rpx;
}

/*
 * 换态的那一层只管缩放与模糊，待机的动作挂在里头的图标上 ——
 * 两者都要独占 transform，挤在一层就互相抵消。
 */
.wxs__icon-layer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  filter: blur($fish-blur-soft);
  transform: scale(0.25);

  @if $fish-motion {
    transition:
      opacity $fish-dur-icon-swap $fish-ease-swap,
      filter $fish-dur-icon-swap $fish-ease-swap,
      transform $fish-dur-icon-swap $fish-ease-swap;
  }
}

.wxs__icon-layer--on {
  opacity: 1;
  filter: blur(0);
  transform: scale(1);
}

.wxs__icon-img {
  width: 140rpx;
  height: 140rpx;
}

.wxs__icon-img--spin {
  @if $fish-motion {
    animation: wxs-spin $fish-dur-icon-spin linear infinite;
  }
}

.wxs__icon-img--float {
  @if $fish-motion {
    animation: wxs-float $fish-dur-icon-float ease-in-out infinite alternate;
  }
}

.wxs__icon-img--flicker {
  @if $fish-motion {
    animation: wxs-flicker $fish-dur-icon-float * 1.5 ease-in-out infinite;
  }
}

/* 天气现象 */
.wxs__cond {
  position: relative;
  height: 40rpx;
  margin-top: 8rpx;
}

.wxs__cond-text {
  position: absolute;
  top: 0;
  left: 0;
  color: $fish-on-dark;
  white-space: nowrap;
  @include fish-type(caption);
}

.wxs__cond-text--in {
  opacity: 1;

  @if $fish-motion {
    animation: wxs-swap-in $fish-dur-text-swap $fish-ease-swap both;
  }
}

.wxs__cond-text--out {
  opacity: 0;

  @if $fish-motion {
    animation: wxs-swap-out $fish-dur-text-swap $fish-ease-swap both;
  }
}

/* 高低温与降水概率 */
.wxs__hl {
  display: flex;
  align-items: baseline;
  gap: 20rpx;
  margin-top: 4rpx;
}

.wxs__hl-item {
  color: $fish-sky-muted;
  font-variant-numeric: tabular-nums;
  @include fish-type(caption);
}

/* 降水概率。它是这一行里唯一要提醒的事（其余两件是背景） */
.wxs__hl-item--accent {
  color: $fish-blue-600;
}

/* ==========================================================================
   日期条
   ========================================================================== */

.wxs__tabs {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin: 32rpx 24rpx 24rpx;
  padding: 6rpx;
  border-radius: 30rpx;
  background-color: $fish-sky-bar;
}

/* 药丸。位置与宽度由 JS 量出来给（见 measureTabs） */
.wxs__pill {
  position: absolute;
  top: 6rpx;
  bottom: 6rpx;
  left: 0;
  z-index: 0;
  width: 0;
  border-radius: 24rpx;
  background-color: $fish-sky-surface;
  pointer-events: none;

  @if $fish-motion {
    transition:
      transform $fish-dur-tabs $fish-ease-tabs,
      width $fish-dur-tabs $fish-ease-tabs;
  }
}

.wxs__tab {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  min-width: 0;
  height: auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: $fish-sky-muted;
  @include fish-type(caption);

  @if $fish-motion {
    transition:
      color $fish-dur-tabs $fish-ease-tabs,
      transform $fish-dur-press $fish-spring;
  }

  &:active {
    transform: scale(0.99);
    transition-duration: $fish-dur-fast, $fish-dur-fast;
  }
}

.wxs__tab--on {
  color: $fish-on-dark;
  font-weight: 500;
}

/* 日期条上的小图标。同样是留白多的插画，盒子给足才读得出是什么 */
.wxs__tab-icon {
  width: 56rpx;
  height: 56rpx;
}

.wxs__tab-label {
  white-space: nowrap;
}

/* ==========================================================================
   空态
   ========================================================================== */

.wxs--empty {
  background-color: $fish-card-glass;
  @include fish-glass-blur;
}

.wxs__empty {
  display: block;
  padding: 64rpx 48rpx;
  color: $fish-on-dark;
  @include fish-type(body);
  text-align: center;
}

/* ==========================================================================
   关键帧
   ========================================================================== */

/* 光晕漂移 */
@keyframes wxs-drift {
  from {
    transform: translate(0, 0) scale(1);
  }

  to {
    transform: translate($fish-distance-drift, -$fish-distance-drift * 0.6) scale(1.08);
  }
}

/* 雨丝下落 */
@keyframes wxs-fall {
  from {
    transform: translate(0, 0) rotate(8deg);
  }

  to {
    transform: translate(-100rpx, 800rpx) rotate(8deg);
  }
}

/* 落雪：比雨慢，横向还飘一点 */
@keyframes wxs-fall-snow {
  from {
    transform: translate(0, 0) rotate(0deg);
  }

  to {
    transform: translate($fish-distance-snow, $fish-distance-snow-fall) rotate(180deg);
  }
}

/* 闪电 */
@keyframes wxs-flash {
  0%,
  86%,
  100% {
    opacity: 0;
  }

  88% {
    opacity: 0.4;
  }

  89% {
    opacity: 0.08;
  }

  91% {
    opacity: 0.3;
  }
}

/* 太阳自转 */
@keyframes wxs-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 云浮动 */
@keyframes wxs-float {
  from {
    transform: translateY(-$fish-distance-float);
  }

  to {
    transform: translateY($fish-distance-float);
  }
}

/* 雷闪 */
@keyframes wxs-flicker {
  0%,
  70%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  74% {
    opacity: 0.55;
    transform: scale(0.97);
  }

  78% {
    opacity: 1;
    transform: scale(1.02);
  }
}

/* 温度数字落位 */
@keyframes wxs-digit-pop {
  from {
    opacity: 0;
    filter: blur($fish-blur-soft);
    transform: translateY($fish-distance-digit);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

/* 换字：新字进来 */
@keyframes wxs-swap-in {
  from {
    opacity: 0;
    filter: blur($fish-blur-soft);
    transform: translateY($fish-distance-swap);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

/* 换字：旧字出去 */
@keyframes wxs-swap-out {
  from {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }

  to {
    opacity: 0;
    filter: blur($fish-blur-soft);
    transform: translateY(-$fish-distance-swap);
  }
}

/* 星期名：新名进来 */
@keyframes wxs-morph-in {
  from {
    opacity: 0;
    filter: blur($fish-blur-soft);
  }

  to {
    opacity: 1;
    filter: blur(0);
  }
}

/* 星期名：旧名出去 */
@keyframes wxs-morph-out {
  from {
    opacity: 1;
    filter: blur(0);
  }

  to {
    opacity: 0;
    filter: blur($fish-blur-soft);
  }
}
</style>
