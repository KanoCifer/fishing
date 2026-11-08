<template>
  <!--
    头图 —— 地点、此刻的天气、鱼口概率。

    版式照着原型（iOS Weather 那套）：地点一行、现象、大温度、体感与高低，
    底下压一张玻璃卡说鱼口概率。

    整块压在照片上，所以根节点挂 .on-photo —— 令牌那一组整体翻成白字与深玻璃
    （见 styles/theme.scss）。JS 那一半由页面 provideSurface('photo') 给，
    图标与 canvas 色板才知道自己压在照片上。
  -->
  <view class="hero on-photo" :style="{ paddingTop: statusBarHeight + 'px' }">
    <!-- 地点行。整行可点：点开选点地图，换个地方看 -->
    <view class="hero__place" @tap="onPickPlace">
      <image class="hero__place-pin" :src="pinIcon" mode="widthFix" />
      <text class="hero__place-name">{{ placeName }}</text>
      <image class="hero__place-chevron" :src="chevronDownIcon" mode="widthFix" />
    </view>

    <!-- 现象：上游给的原文 -->
    <text v-if="cond" class="hero__cond">{{ cond }}</text>

    <!-- 大温度。这一屏的主角数字 -->
    <view v-if="temp !== null" class="hero__temp-row">
      <text class="hero__temp">{{ temp }}</text>
      <text class="hero__temp-deg">°</text>
    </view>

    <!-- 体感 · 最高 · 最低。缺哪一项就不写哪一项 -->
    <view v-if="hiloItems.length" class="hero__hilo">
      <template v-for="(item, i) in hiloItems" :key="item.label">
        <text v-if="i > 0" class="hero__hilo-sep">·</text>
        <text class="hero__hilo-item">{{ item.label }}</text>
      </template>
    </view>

    <!--
      鱼口概率。

      卡里只有接口给得出的东西：分数、等级、九项子特征里的主导几项。
      解读句与最佳窗口都没写 —— 接口没有这两个字段，凭空补一句就是编。
    -->
    <view class="hero__card">
      <view class="hero__card-head">
        <text class="hero__card-title">今日鱼口概率</text>

        <!-- 构成详情的入口。点开是浮层，里头是完整的九项 -->
        <view class="hero__card-link" @tap="emit('breakdown')">
          <text class="hero__card-link-text">构成</text>
          <image class="hero__card-link-chevron" :src="chevronRightIcon" mode="widthFix" />
        </view>
      </view>

      <view class="hero__card-body">
        <ProgressRing
          :value="displayScore"
          :max="100"
          :size="HERO_RING_SIZE"
          :stroke="HERO_RING_STROKE"
          :fill-color="ringFill"
        >
          <view class="hero__ring">
            <text class="hero__ring-num">{{ displayScore }}</text>
            <text class="hero__ring-unit">分</text>
          </view>
        </ProgressRing>

        <view class="hero__card-meta">
          <!-- 等级：分数是几档，环与这一个词是同一个颜色 -->
          <view class="hero__level">
            <view class="hero__level-dot" :class="`hero__level-dot--${tone}`" />
            <text class="hero__level-text" :class="`hero__level-text--${tone}`">{{ levelText }}</text>
          </view>

          <!-- 构成条：主导的三项。完整的九项在浮层里 -->
          <view v-if="bars.length" class="hero__bars">
            <view v-for="bar in bars" :key="bar.key" class="hero__bar">
              <text class="hero__bar-label">{{ bar.label }}</text>
              <view class="hero__bar-track">
                <view
                  class="hero__bar-fill"
                  :class="{ 'hero__bar-fill--top': bar.top }"
                  :style="{ width: bar.percent + '%' }"
                />
              </view>
            </view>
          </view>
        </view>
      </view>

      <!--
        渔碌建议。

        它是这一屏唯一能点开的「去看看」，所以跟着结论走 —— 结论在卡里，
        入口就该在卡里，而不是飘在顶行上跟读数抢位置。
      -->
      <view class="hero__advice" @tap="emit('analysis')">
        <image class="hero__advice-icon" :src="sparklesIcon" mode="widthFix" />
        <text class="hero__advice-text">渔碌建议</text>
        <image class="hero__advice-chevron" :src="chevronRightIcon" mode="widthFix" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 头图 —— 地点、此刻的天气、鱼口概率。
 *
 * 三件事分三层说：此刻在哪儿（地点行）、此刻什么天（现象与温度）、
 * 这一刻能不能钓（鱼口概率卡）。互不重复。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import ProgressRing from '@/components/ProgressRing/ProgressRing.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useSurface } from '@/composables/useSurface';
import { PLACE_NAME_FALLBACK } from '@/constants/copy';
import { icon } from '@/constants/icons';
import { HERO_RING_SIZE, HERO_RING_STROKE } from '@/constants/weatherHero';
import { useConditionsStore } from '@/stores/conditions';
import { toFeatureTiles } from '@/types/fishing';
import { chartPalette } from '@/utils/chartPalette';
import { createCountUp, enterDelayMs } from '@/utils/motion';
import { toFiniteNumber } from '@/utils/number';
import { forecastDays, levelTone } from '@/utils/weather';

const props = withDefaults(defineProps<{ showAnim?: boolean }>(), { showAnim: true });

const emit = defineEmits<{
  /** 点开鱼口概率的构成 */
  breakdown: [];
  /** 点地点行的箭头：换一个地方看 */
  pickPlace: [];
  /** 打开渔碌建议 */
  analysis: [];
}>();

const conditionsStore = useConditionsStore();

/** px。运行时 API 的尺寸不能写 rpx（见 useNavMetrics 的说明） */
const { statusBarHeight } = useNavMetrics();

/**
 * 这一块压在什么上面。
 *
 * 照片面上图标与 canvas 都要压白 / 翻亮档 —— 页面 provideSurface('photo')，
 * 这一行是 JS 那一半（CSS 那一半是模板里的 .on-photo）。
 */
const surface = useSurface();

/* ── 地点 ──────────────────────────────────────────────────────────────── */

const placeName = computed(() => conditionsStore.locationName || PLACE_NAME_FALLBACK);

/* ── 此刻的天气 ────────────────────────────────────────────────────────── */

/** 现象：上游给的原文。缺值就不画，别拿「未知」顶上去 */
const cond = computed(() => conditionsStore.liveWeather?.text || '');

/** 当前温度。有值才画 */
const temp = computed(() => {
  const raw = conditionsStore.liveWeather?.temp ?? '';
  return toFiniteNumber(raw) === null ? null : raw;
});

/** 体感温度 */
const feels = computed(() => {
  const value = toFiniteNumber(conditionsStore.liveWeather?.feelsLike);
  return value === null ? null : String(value);
});

/**
 * 今天的高低温。
 *
 * 口径只有一个：utils/weather 的 forecastDays 归一过（缺高低温的那天整条丢掉），
 * 剩下的第一行就是今天 —— 多日预报那张卡也是这么取的，两边不会一个说今天、
 * 一个说昨天。
 */
const today = computed(() => forecastDays(conditionsStore.forecasts)[0] ?? null);

/**
 * 体感 · 最高 · 最低，一行。
 *
 * 分项拼而不是拼成一句：分项各缺各的（体感没值、体感有值但预报没来），
 * 拼成一句就得处理半句话，而半句话读不出来。
 */
const hiloItems = computed(() => {
  const items: Array<{ label: string }> = [];

  if (feels.value !== null) items.push({ label: `体感 ${feels.value}°` });
  if (today.value) {
    items.push({ label: `最高 ${today.value.max}°` });
    items.push({ label: `最低 ${today.value.min}°` });
  }

  return items;
});

/* ── 鱼口概率 ──────────────────────────────────────────────────────────── */

/** 鱼口概率。钳位在 store 里（见 stores/conditions 的 fishingScore） */
const score = computed(() => conditionsStore.fishingScore);

/** 等级词（极好 / 好 / 一般 …） */
const level = computed(() => conditionsStore.indexData?.level ?? '');

/** 等级词没有时先不给结论：宁缺勿编 */
const levelText = computed(() => level.value || '计算中');

/** 等级色调。与别处的等级词同一套（levelTone） */
const tone = computed(() => levelTone(level.value));

/**
 * 环的值弧色。
 *
 * 跟着等级走：同一个词在别处是红的，这里的环也得是红的。
 * 色值取自 chartPalette（canvas 不解析 CSS 变量），照片面那套是亮档。
 */
const ringFill = computed(() => chartPalette(surface).toneFill[tone.value]);

/**
 * 构成条：主导的三项。
 *
 * 九项全列是浮层那份的事；头图只给「谁在拉分」的前三，
 * 剩下的靠那个入口去看。条形是相对水位（口径在 types 的 toFeatureTiles），
 * 不是原始值 —— 九项量纲不一，画在同一条轴上比的是贡献，不是大小。
 */
const bars = computed(() => {
  const tiles = toFeatureTiles(conditionsStore.indexData?.feature_breakdown);
  return [...tiles]
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3)
    .map((tile, index) => ({
      key: tile.key,
      label: tile.label,
      percent: tile.percent,
      // 最主导的那一项单独上色，从另外两条里跳出来
      top: index === 0,
    }));
});

/* ── 数字滚动 ──────────────────────────────────────────────────────────── */

const displayScore = ref<number>(0);

/**
 * 数字滚动。
 *
 * 用 createCountUp 而不是自己写 setInterval：计数期间每改一次值就是一次跨线
 * setData，控制器只在整数真的变了时才写。
 *
 * 环跟着数字一起长 —— 数字滚到哪，环就画到哪，两者是同一件事的两种画法。
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

/* ── 动作 ──────────────────────────────────────────────────────────────── */

/**
 * 地点行 = 换一个地方看。
 *
 * 这里只发事件：选点要弹微信自带的地图，组件不该知道那件事，
 * 更不该知道选完之后要重新取哪一份数。
 */
function onPickPlace() {
  emit('pickPlace');
}

/* ── 图标 ──────────────────────────────────────────────────────────────── */

/**
 * 头图上的图标一律压白 —— 底下是照片，深墨压在上面读不出来。
 * 图标的颜色烤在 data URI 里，换色要回去跑 pnpm icons。
 */
const pinIcon = computed(() => icon('map-pin', 'onAccent'));
const chevronDownIcon = computed(() => icon('chevron-down', 'onPhoto'));
const chevronRightIcon = computed(() => icon('chevron-right', 'onPhoto'));

/**
 * 渔碌建议的图标。
 *
 * 压白：它落在深玻璃卡上，蓝色压上去读不出来（照片面那一档就是为这个准备的）。
 */
const sparklesIcon = computed(() => icon('sparkles', 'onPhoto'));
</script>

<style lang="scss" scoped>
/*
 * 头图没有固定高度 —— 内容有多高它就有多高。
 *
 * 原来那块是 600rpx 固定高，内容全靠绝对定位摆：仪表在左上、实况在右上，
 * 两块各占一角。原型那一版是竖着排的（地点 → 现象 → 温度 → 概率卡），
 * 竖排塞进固定高度里就得绝对定位，那已经没有流式布局可改了 ——
 * 多一块少一块都得重算坐标。
 */
.hero {
  position: relative;
  padding: 0 40rpx 56rpx;
}

/* ── 地点行 ────────────────────────────────────────────────────────────── */

/*
 * 地点行居中。
 *
 * 徽标那一行是原型的做法：这一屏讲的是「此刻这片天」，地点是它的注脚，
 * 不该跟操作键抢左边那块位置。
 */
.hero__place {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 16rpx;
  @include fish-press-dim;
}

.hero__place-pin {
  width: 24rpx;
  height: 24rpx;
  margin-right: 10rpx;
  flex-shrink: 0;
}

.hero__place-name {
  max-width: 420rpx;
  min-width: 0;
  overflow: hidden;
  color: $fish-ink;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.022em;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 展开箭头：它说的是「这里能点开，换个地方看」 */
.hero__place-chevron {
  width: 26rpx;
  height: 26rpx;
  margin-left: 8rpx;
  flex-shrink: 0;
}

/* ── 现象 ──────────────────────────────────────────────────────────────── */

.hero__cond {
  display: block;
  margin-top: 20rpx;
  color: $fish-muted;
  @include fish-type(body, 500);

  text-align: center;
}

/* ── 大温度 ────────────────────────────────────────────────────────────── */

/* 温度与度数符号并排。符号挂在数字右上角，跟原型那一位上标是同一个位置关系 */
.hero__temp-row {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  margin-top: 8rpx;
}

.hero__temp {
  color: $fish-ink;
  font-size: 140rpx;
  line-height: 1;
  letter-spacing: -0.04em;
  @include numeric;
}

/* 度数符号：跟着数字的字号走，缩到四成多 */
.hero__temp-deg {
  margin-left: 4rpx;
  color: $fish-ink;
  font-size: 52rpx;
  font-weight: 500;
  line-height: 1;
}

/* ── 体感 · 最高 · 最低 ────────────────────────────────────────────────── */

.hero__hilo {
  display: flex;
  align-items: baseline;
  justify-content: center;
  margin-top: 10rpx;
}

.hero__hilo-item {
  color: $fish-muted;
  @include fish-type(body);
}

/* 分隔点比正文淡一档：它是结构符号，不是内容 */
.hero__hilo-sep {
  margin: 0 12rpx;
  color: $fish-muted-60;
  @include fish-type(body);
}

/* ── 鱼口概率卡 ────────────────────────────────────────────────────────── */

/*
 * 玻璃卡。
 *
 * 卡面走照片面那一档（.on-photo 把 --fish-card-glass 翻成深蓝半透明）：
 * 底下是照片，卡得糊过照片才立得住 —— 不糊的话它只是一块半透明的色块。
 *
 * 这一块没有入场动画：opacity 动画会让祖先成为 backdrop root，
 * 卡片自己的 backdrop-filter 就只能采样它内部的背景（这里是空的），
 * 玻璃会糊成一片空。整页的卡片都按这个理由不落位（见 pages/data）。
 */
.hero__card {
  margin-top: 40rpx;
  padding: 28rpx;
  @include fish-glass($fish-radius-mid, rgba(12, 28, 54, 0.14));
  @include fish-glass-blur;
}

.hero__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero__card-title {
  color: $fish-muted;
  @include fish-type(caption, 500);
}

/*
 * 构成详情的入口。箭头说明这一行后面还有东西 —— 小程序里没有光标。
 *
 * 内衬把命中区撑到 64rpx（32pt）高：文字本身只有一行字那么高，
 * 按不准。外边距是负的 —— 命中区撑大了，视觉位置不能跟着动。
 */
.hero__card-link {
  display: flex;
  align-items: center;
  padding: 18rpx 0 18rpx 12rpx;
  margin: -18rpx 0 -18rpx -12rpx;
  @include fish-press-dim;
}

.hero__card-link-text {
  color: $fish-muted;
  @include fish-type(caption);
}

.hero__card-link-chevron {
  width: 22rpx;
  height: 22rpx;
  margin-left: 4rpx;
  flex-shrink: 0;
}

/* 环与右边那一栏并排 */
.hero__card-body {
  display: flex;
  align-items: center;
  margin-top: 24rpx;
}

.hero__card-meta {
  flex: 1;
  min-width: 0;
  margin-left: 24rpx;
}

/* ── 环心 ──────────────────────────────────────────────────────────────── */

.hero__ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.hero__ring-num {
  color: $fish-ink;
  font-size: 48rpx;
  line-height: 1;
  letter-spacing: -0.03em;
  @include numeric;
}

.hero__ring-unit {
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

/* ── 等级 ──────────────────────────────────────────────────────────────── */

.hero__level {
  display: flex;
  align-items: center;
}

.hero__level-dot {
  width: 16rpx;
  height: 16rpx;
  margin-right: 12rpx;
  flex-shrink: 0;
  border-radius: 50%;
}

.hero__level-text {
  @include fish-type(body, 500);
}

/*
 * 等级色。
 *
 * 走语义文字档（-ink 那一族），不用填充档 —— 等级词是当文字读的。
 * 照片面上这些档都翻成了亮档（见 theme.scss 的 .on-photo）。
 *
 * 点与词是同一种颜色：同一件事（这个等级好不好），两处信号得是同一个色。
 */
.hero__level-text--success {
  color: $fish-success-ink;
}

.hero__level-text--blue {
  color: $fish-blue-600;
}

.hero__level-text--warning {
  color: $fish-warning-ink;
}

.hero__level-text--destructive {
  color: $fish-destructive-ink;
}

.hero__level-text--muted {
  color: $fish-muted-60;
}

/* 点是块，填色；它不该带字色 */
.hero__level-dot--success {
  background-color: $fish-success-ink;
}

.hero__level-dot--blue {
  background-color: $fish-blue-600;
}

.hero__level-dot--warning {
  background-color: $fish-warning-ink;
}

.hero__level-dot--destructive {
  background-color: $fish-destructive-ink;
}

.hero__level-dot--muted {
  background-color: $fish-muted-60;
}

/* ── 构成条 ────────────────────────────────────────────────────────────── */

.hero__bars {
  margin-top: 18rpx;
}

.hero__bar {
  display: flex;
  align-items: center;
  height: 34rpx;
}

.hero__bar-label {
  width: 64rpx;
  flex-shrink: 0;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 轨道：白 14% 的填充 —— 深玻璃上要靠「比底亮」才看得出是条轨道 */
.hero__bar-track {
  flex: 1;
  height: 10rpx;
  overflow: hidden;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

.hero__bar-fill {
  height: 100%;
  border-radius: $fish-radius-pill;
  background-color: $fish-blue-600;
}

/* 最主导的那一项单独上色：它值得从另外两条里跳出来 */
.hero__bar-fill--top {
  background-color: $fish-success-ink;
}

/* ── 渔碌建议 ──────────────────────────────────────────────────────────── */

/*
 * 卡底那一行。
 *
 * 上沿一道发丝线：这一行跟上面的构成条不是一组东西 ——
 * 构成条说的是「分数怎么来的」，这一行说的是「去看看」。
 * 分隔线把它们分成两段，不然读起来是同一组数据。
 */
.hero__advice {
  display: flex;
  align-items: center;
  margin-top: 26rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid $fish-border;
  @include fish-press-dim;
}

.hero__advice-icon {
  width: 30rpx;
  height: 30rpx;
  margin-right: 10rpx;
  flex-shrink: 0;
}

.hero__advice-text {
  color: $fish-ink;
  @include fish-type(body, 500);
}

/* 箭头推到最右：这一行是一个入口，不是一段说明 */
.hero__advice-chevron {
  width: 22rpx;
  height: 22rpx;
  margin-left: auto;
  flex-shrink: 0;
}
</style>
