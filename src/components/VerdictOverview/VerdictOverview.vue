<template>
  <view class="verdict">
    <view v-if="loading && !mapStore.indexData" class="verdict__skeleton">
      <!--
        三个成因压成的一行。行盒 42rpx —— 撑住这一行的是值的行盒（subhead），
        图标（28rpx）和元信息（caption2 22rpx）都比它矮。
      -->
      <view class="verdict__sk-row">
        <!-- 温度 -->
        <view class="verdict__sk-factor">
          <view class="verdict__sk-icon" />
          <view class="verdict__sk-bar verdict__sk-bar--value verdict__sk-bar--temp-value" />
          <view class="verdict__sk-bar verdict__sk-bar--meta verdict__sk-bar--temp-meta" />
        </view>

        <view class="verdict__factor-sep" />

        <!-- 潮汐 -->
        <view class="verdict__sk-factor">
          <view class="verdict__sk-icon" />
          <view class="verdict__sk-bar verdict__sk-bar--value verdict__sk-bar--tide-value" />
          <view class="verdict__sk-bar verdict__sk-bar--meta verdict__sk-bar--tide-meta" />
        </view>

        <view class="verdict__factor-sep" />

        <!-- 风 -->
        <view class="verdict__sk-factor">
          <view class="verdict__sk-icon" />
          <view class="verdict__sk-bar verdict__sk-bar--value verdict__sk-bar--wind-value" />
          <view class="verdict__sk-bar verdict__sk-bar--meta verdict__sk-bar--wind-meta" />
        </view>
      </view>

      <!--
        动作区的占位。

        这一块是「后来才出现的东西」—— 有数据了才有反馈按钮。
        不先占住，数据一到脚部就长出一行 88rpx，头部那块内容被顶下去，
        那一跳比行盒差几 rpx 显眼得多。

        占位只有形状，没有文字，也不挂 tap：它是个还没长成按钮的东西。
      -->
      <view class="verdict__sk-foot">
        <view class="verdict__sk-btn" />

        <view class="verdict__sk-link">
          <view class="verdict__sk-icon" />
          <view class="verdict__sk-bar verdict__sk-bar--link" />
        </view>
      </view>
    </view>

    <!-- 有数据 -->
    <template v-else-if="mapStore.indexData">
      <view class="verdict__factors" :style="enterStyle(0, showAnim)">
        <view class="verdict__factor">
          <image class="verdict__factor-icon" :src="thermometerIcon" mode="widthFix" />
          <text class="verdict__factor-value">{{ live?.temp ?? '--' }}°</text>
          <text class="verdict__factor-meta">{{ live?.text || '暂无天气' }}</text>
        </view>

        <view class="verdict__factor-sep" />

        <view class="verdict__factor">
          <image class="verdict__factor-icon" :src="wavesIcon" mode="widthFix" />
          <text class="verdict__factor-value">{{ trendText }}</text>
        </view>

        <view class="verdict__factor-sep" />

        <view class="verdict__factor">
          <image class="verdict__factor-icon" :src="windIcon" mode="widthFix" />
          <text class="verdict__factor-value">{{ windText }}</text>
          <text class="verdict__factor-meta">{{ live?.windDir || '暂无风向' }}</text>
        </view>
      </view>

      <!--
        底部：一个主动作 + 一个入口。

        主动作占满宽度，AI 建议退成一个文字入口 ——
        这一屏的主动作是反馈，AI 建议是偶尔才想看一眼的补充。
      -->
      <view class="verdict__actions" :style="enterStyle(1, showAnim)">
        <view class="verdict__btn verdict__btn--primary" @tap="emit('feedback')">
          <image class="verdict__icon verdict__icon--onaccent" :src="messageIcon" mode="widthFix" />
          <text class="verdict__btn-text verdict__btn-text--onaccent">反馈今日鱼口概率</text>
        </view>

        <view class="verdict__link" @tap="emit('analysis')">
          <image class="verdict__icon verdict__icon--accent" :src="sparklesIcon" mode="widthFix" />
          <text class="verdict__link-text">渔碌建议</text>
        </view>
      </view>
    </template>

    <view v-else class="verdict__empty">
      <text class="verdict__empty-title" :style="enterStyle(0, showAnim)">{{ emptyTitle }}</text>
      <text class="verdict__empty-text" :style="enterStyle(1, showAnim)">{{ emptyText }}</text>

      <!--
        按下反馈挂在里层，跟外层的 fish-enter 分开：
        外层是 fill-mode: both，动画终态会把 :active 的 transform 盖掉。
      -->
      <view class="verdict__empty-action" :style="enterStyle(2, showAnim)">
        <view class="verdict__empty-action-hit" @tap="onRefresh">
          <text class="verdict__empty-action-text">重新获取</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 概览卡 —— 压在头图下沿的那一张。
 *
 * 头图（WeatherHero）说「今天能不能钓」：分数、等级、一句话、鱼口徽标。
 * 这一张说「为什么」：温度、潮汐、风三个成因，外加一个反馈动作
 * 和一个 AI 建议入口。
 *
 * 分工不重叠 —— 同一个数字不在两处出现。
 */
import { computed } from 'vue';

import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import { enterStyle } from '@/utils/motion';
import { num } from '@/utils/weather';
import { nextHighTide, tideTrend } from '@/utils/tide';

const emit = defineEmits<{
  feedback: [];
  /** 打开 AI 建议面板 */
  analysis: [];
}>();

withDefaults(defineProps<{ showAnim?: boolean }>(), { showAnim: true });

const mapStore = useFishingMapStore();

/**
 * 这一屏现在在等什么。
 *
 * 取数有两段：定位（授权询问 + 一次往返）和请求。
 * 加载判定要覆盖**两段** —— 少算一段，那一段就会摆出空态，
 * 而空态说的是「没有」，其实只是「还没取到」，说假话
 * （见 docs/architecture.md「空态不是加载态」）。
 *
 * indexPending 覆盖的是「这一轮还没发出请求」的窗口（冷启动那一段，
 * 以及定位那一段），indexLoading 覆盖请求本身，locating 兜住
 * 别的入口发起的定位（地图上的定位键）。
 */
const loading = computed(() => mapStore.indexPending || mapStore.indexLoading || mapStore.locating);

/**
 * 空态的头一句。
 *
 * 出错与没取到分开说：前者是「取不到」（重试可能成），
 * 后者是「还没取到」。混成一句就是把两种情况说成了同一种
 * （见 docs/architecture.md「空态不是加载态」）。
 *
 * 「还没取到」那一档写成问句：占位文案要说清这一屏在问什么，
 * 而不是变成一句操作说明（见 docs/design-system.md「谁来说，事先分好」）。
 */
const emptyTitle = computed(() => (mapStore.indexError ? '今天的鱼口概率暂时取不到' : '今天能不能钓？'));

/**
 * 空态的注解。
 *
 * 出错时给具体原因 —— 后端原文只在这一层出现，卡片那边不摆
 * （见 docs/architecture.md「别把后端原文摆到卡上」：
 * 原因交给 toast 与这一块结论头）。
 * 没出错时说清这一屏在等什么，不重复按钮上的话。
 */
const emptyText = computed(() => mapStore.indexError || '数据还没到，取到就能回答这个问题');

const thermometerIcon = icon('thermometer', 'destructive');
const wavesIcon = icon('waves', 'blue');
const windIcon = icon('wind', 'blue600');
const messageIcon = icon('message-square', 'onAccent');
const sparklesIcon = icon('sparkles', 'blue600');

const live = computed(() => mapStore.liveWeather);

/** 风向标签（东南风）配风速数值（km/h），缺任一就不占这个位 */
const windText = computed(() => {
  const speed = num(live.value?.windSpeed);
  return speed === null ? '--' : `${speed} km/h`;
});

const trendText = computed(() => {
  switch (tideTrend(mapStore.tideData)) {
    case 'rising':
      return '涨潮';
    case 'falling':
      return '退潮';
    case 'flat':
      return '平潮';
    default:
      return '--';
  }
});

function onRefresh() {
  // 定位那一段也算「正在忙」：图标已经在转了，这时候再按就是并发第二轮取数
  if (mapStore.indexLoading || mapStore.locating) return;
  void mapStore.refreshIndexData();
}
</script>

<style lang="scss" scoped>
/*
 * 这张卡。
 *
 * 上外边距 -36rpx：压住头图的下沿 —— 两块咬在一起，
 * 不然头图与卡片是两张互不相干的贴片。
 *
 * 玻璃面 + 阴影：层次靠**面**不靠描边（见 docs/design-system.md）。
 */
.verdict {
  position: relative;
  margin-top: -36rpx;
  margin-right: 32rpx;
  margin-left: 32rpx;
  padding: 28rpx;
  @include fish-glass($fish-radius-card);
  background-color: $fish-page;
}

/*
 * 三个成因。一行小字，不再是三块卡。
 *
 * 分隔线用 1rpx 发丝线：同一行里三个条目靠它断开就够，
 * 重了会读成一张表。
 */
.verdict__factors {
  display: flex;
  align-items: center;
  @include fish-enter;
}

.verdict__factor {
  display: flex;
  align-items: center;
  min-width: 0;
}

.verdict__factor-icon {
  width: 28rpx;
  height: 28rpx;
  margin-right: 8rpx;
  flex-shrink: 0;
}

.verdict__factor-value {
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.verdict__factor-meta {
  margin-left: 6rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.verdict__factor-sep {
  width: 1rpx;
  height: 22rpx;
  margin-right: 18rpx;
  margin-left: 18rpx;
  background-color: $fish-border-40;
}

/* ── 加载骨架 ──────────────────────────────────────────────────────────── */

/*
 * 分两层：**行盒**管位置，**色块**管形状。
 *
 * 行盒的高度照着上面真实元素的行盒摆（因子行 42rpx），
 * 色块的高度照着字的墨迹摆（30rpx 的值 / 22rpx 的元信息）。
 *
 * 底色是 $fish-surface，跟 SkeletonCard 同一档；
 * 呼吸幅度也是同一档（0.35 / 1.8s），否则同一个页面里两种加载态一深一浅，像两套组件。
 */
.verdict__skeleton {
  display: flex;
  flex-direction: column;
}

.verdict__sk-bar,
.verdict__sk-icon,
.verdict__sk-btn {
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

/* 行盒：只管高度，不管长相 */
.verdict__sk-row {
  display: flex;
  align-items: center;
  height: 42rpx;
}

.verdict__sk-factor {
  display: flex;
  align-items: center;
}

.verdict__sk-icon {
  width: 28rpx;
  height: 28rpx;
  margin-right: 8rpx;
  flex-shrink: 0;
  border-radius: 50%;
}

/* 值：subhead 30rpx */
.verdict__sk-bar--value {
  height: 30rpx;
  border-radius: $fish-radius-sm;
}

/* 元信息：caption2 22rpx */
.verdict__sk-bar--meta {
  height: 22rpx;
  margin-left: 6rpx;
  border-radius: $fish-radius-sm;
}

/*
 * 三块的宽度按**常见值**摆：温度「28°」约 48rpx、潮汐「涨潮」60rpx、风「12 km/h」96rpx；
 * 元信息分别是「多云」44rpx、「高潮 15:30」100rpx、「东南风」66rpx。
 *
 * 真实宽度随数据变，摆得准是运气 —— 摆成常见值的形状，
 * 数据到了之后的位移就是几 rpx，看不出来。
 */
.verdict__sk-bar--temp-value {
  width: 48rpx;
}

.verdict__sk-bar--temp-meta {
  width: 44rpx;
}

.verdict__sk-bar--tide-value {
  width: 60rpx;
}

.verdict__sk-bar--tide-meta {
  width: 100rpx;
}

.verdict__sk-bar--wind-value {
  width: 96rpx;
}

.verdict__sk-bar--wind-meta {
  width: 66rpx;
}

/* 动作区的占位 */
.verdict__sk-foot {
  display: flex;
  align-items: center;
  margin-top: 28rpx;
}

.verdict__sk-btn {
  flex: 1;
  height: 88rpx;
  border-radius: $fish-radius-pill;
}

.verdict__sk-link {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding-right: 8rpx;
  padding-left: 8rpx;
}

.verdict__sk-bar--link {
  width: 128rpx;
  height: 32rpx;
  border-radius: $fish-radius-sm;
}

/* ── 动作 ──────────────────────────────────────────────────────────────── */

.verdict__actions {
  display: flex;
  align-items: center;
  margin-top: 28rpx;
  @include fish-enter;
}

/*
 * 主动作。
 *
 * 88rpx = 44pt，正好是 Apple 判定为「可放心点按」的最小命中尺寸。
 * 反馈在手指落下的那一帧就给出（fish-press），抬手回弹用满 260ms ——
 * 两段时长一短一长，是 iOS 按压手感的关键，缺一段立刻变塑料。
 */
.verdict__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 20rpx;
  border-radius: $fish-radius-pill;
  @include fish-press(0.97);
}

.verdict__btn--primary {
  flex: 1;
  background-image: $fish-gradient;
  box-shadow: $smooth-shadow-sm;
}

.verdict__icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

.verdict__icon--accent {
  width: 28rpx;
  height: 28rpx;
  margin-right: 8rpx;
}

.verdict__icon--onaccent {
  margin-right: 10rpx;
}

.verdict__btn-text {
  color: $fish-ink;
  @include fish-type(callout);
}

.verdict__btn-text--onaccent {
  color: $fish-on-accent;
  font-weight: 600;
}

/*
 * AI 建议。
 *
 * 一个文字入口，不占一块面 —— 这一屏的主动作是反馈，
 * AI 建议是偶尔才想看一眼的补充，重量不该跟主动作一样。
 * 按下变暗不缩小（同分段控件，见 _motion.scss 的 fish-press-dim）。
 */
.verdict__link {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 8rpx;
  @include fish-press-dim;
}

.verdict__link-text {
  color: $fish-blue-600;
  @include fish-type(callout);

  font-weight: 600;
}

/* ── 「下面还有」 ──────────────────────────────────────────────────────── */

.verdict__hint {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 24rpx;
  @include fish-enter;
}

.verdict__hint-icon {
  width: 22rpx;
  height: 22rpx;
  margin-right: 4rpx;
  opacity: 0.6;
}

.verdict__hint-text {
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* ── 空态 ──────────────────────────────────────────────────────────────── */

/*
 * 空态不是一张卡：这一屏没有「条目」可套卡片形状，硬套一张卡像坏了。
 * 版式照 my-spots 的空态：一句标题 + 一行注解 + 一个动作。
 */
.verdict__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 16rpx 16rpx;
  text-align: center;
}

.verdict__empty-title {
  color: $fish-ink;
  @include fish-type(title3);
  @include fish-enter;
}

.verdict__empty-text {
  margin-top: 12rpx;
  color: $fish-muted;
  @include fish-type(callout);
  @include fish-enter;
}

/*
 * 空态里那个按钮。
 *
 * 分两层：外层带入场动画，内层是真正被按的那块。
 * 按下反馈必须挂在内层 —— 外层的 fish-enter 是 fill-mode: both，
 * 动画终态会把 :active 的 transform 盖掉（同一件事见上面分数那一行）。
 *
 * 内层的样式只有纯声明：嵌套规则后面再跟声明，Sass 会报 mixed-decls 弃用警告。
 */
.verdict__empty-action {
  display: flex;
  margin-top: 32rpx;
  @include fish-enter;
}

.verdict__empty-action-hit {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 200rpx;
  min-height: 80rpx;
  padding: 0 40rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent;
  @include fish-press(0.97);
}

.verdict__empty-action-text {
  color: $fish-on-accent;
  @include fish-type(callout);

  font-weight: 600;
}
</style>
