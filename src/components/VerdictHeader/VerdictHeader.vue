<template>
  <!--
    结论头 —— 数据页的第一屏，也是这一页唯一的结论。

    取向：钓鱼指数是「值不值得去」的答案，天气、潮汐、风是支撑这个答案的三个成因。
    所以三者同处一屏、成因在下结论在旁，而不是拆成四张等权卡片让人自己拼。
  -->
  <view class="verdict" :style="{ paddingTop: navBarBottom + 'px' }">
    <view class="verdict__top">
      <view class="verdict__place">
        <image class="verdict__icon verdict__icon--pin" :src="pinIcon" mode="widthFix" />
        <text class="verdict__place-name">{{ placeName }}</text>
        <text v-if="updatedAt" class="verdict__updated">{{ updatedAt }} 更新</text>
      </view>

      <view class="verdict__refresh" :class="{ 'verdict__refresh--busy': state.indexLoading }" @tap="onRefresh">
        <image class="verdict__icon" :src="refreshIcon" mode="widthFix" />
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="state.indexLoading && !state.indexData" class="verdict__body">
      <SkeletonCard />
    </view>

    <!-- 错误 -->
    <view v-else-if="state.indexError && !state.indexData" class="verdict__body">
      <text class="verdict__error">{{ state.indexError }}</text>
    </view>

    <!-- 有数据 -->
    <template v-else-if="state.indexData">
      <!--
        三段依次落位：先给结论（分数），再给依据（三条成因），最后给动作。
        骨架屏换成实数据的这一下是最容易「闪」的地方 —— 整块内容突然出现，
        眼睛要重新找一遍。分三段递进，读的人跟着结论 → 依据 → 下一步走一遍。

        只在首次拿到数据时播一次：刷新时 indexData 还在，v-else-if 不会重新挂载，
        所以下拉/点刷新拿到新数据不会把这一屏重播一遍。
      -->
      <view class="verdict__figure" :style="{ animationDelay: enterDelay(0) }">
        <text class="verdict__score" :class="`verdict__score--${tone}`">
          {{ state.indexData.fishing_index }}
        </text>
        <view class="verdict__figure-side">
          <text class="verdict__level" :class="`verdict__level--${tone}`">{{ state.indexData.level }}</text>
          <text class="verdict__verdict">{{ verdict }}</text>
        </view>
      </view>

      <!-- 三个成因。少一条就少一半说服力，所以天气/潮汐/风缺哪条都还占位 -->
      <view class="verdict__signals" :style="{ animationDelay: enterDelay(1) }">
        <view class="verdict__signal">
          <image class="verdict__icon verdict__icon--temp" :src="thermometerIcon" mode="widthFix" />
          <view class="verdict__signal-text">
            <text class="verdict__signal-value">{{ live?.temp ?? '--' }}°</text>
            <text class="verdict__signal-meta">{{ live?.text || '暂无天气' }}</text>
          </view>
        </view>

        <view class="verdict__signal">
          <image class="verdict__icon verdict__icon--tide" :src="wavesIcon" mode="widthFix" />
          <view class="verdict__signal-text">
            <text class="verdict__signal-value">{{ trendText }}</text>
            <text class="verdict__signal-meta">{{ tideMeta }}</text>
          </view>
        </view>

        <view class="verdict__signal">
          <image class="verdict__icon verdict__icon--wind" :src="windIcon" mode="widthFix" />
          <view class="verdict__signal-text">
            <text class="verdict__signal-value">{{ windText }}</text>
            <text class="verdict__signal-meta">{{ live?.windDir || '暂无风向' }}</text>
          </view>
        </view>
      </view>

      <view class="verdict__actions" :style="{ animationDelay: enterDelay(2) }">
        <view class="verdict__btn verdict__btn--primary" @tap="emit('feedback')">
          <image class="verdict__icon verdict__icon--onaccent" :src="messageIcon" mode="widthFix" />
          <text class="verdict__btn-text verdict__btn-text--onaccent">反馈今日指数</text>
        </view>
        <view class="verdict__btn" @tap="emit('detail')">
          <image class="verdict__icon" :src="infoIcon" mode="widthFix" />
          <text class="verdict__btn-text">特征详情</text>
        </view>
      </view>
    </template>

    <text v-else class="verdict__empty">暂无数据</text>
  </view>
</template>

<script setup lang="ts">
/**
 * VerdictHeader —— 合并了原 FishingIndexCard 与 WeatherHero 的头部。
 *
 * 合并的理由不是「少写一个组件」，而是这两个组件各占一块地回答同一个问题
 * （今天行不行），拆开就会出现两个大字、两个标题、两套刷新入口互相打架。
 * 现在指数和三个成因在一屏里，谁是结论、谁是依据一眼分得开。
 *
 * 图标：全部走 @/constants/icons 的 data URI（scripts/gen-icons.mjs 生成）。
 * 小程序不能内联 svg，<image> 又拿不到页面 CSS，所以颜色在生成时已烤死。
 *
 * 关于顶部那段内边距：数据页配了 navigationStyle: "custom"，导航栏成了浮层，
 * 页面内容从屏幕最顶端 y=0 开始排，状态栏和胶囊按钮都压在这块背景上。
 * 这里给 padding-top 让开 navBarBottom —— 只让 statusBarHeight 不够，
 * 胶囊按钮落在导航栏那一段，右上角的刷新键会和它撞在一起。
 * 背景渐变从 y=0 就铺下去，状态栏因此被染成和头部同一个颜色。
 */
import { computed } from 'vue';

import { MAP_CENTER, useFishingMapStore } from '@/composables/useFishingMapStore';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { icon } from '@/constants/icons';
import { enterDelay } from '@/utils/motion';
import { levelTone, levelVerdict, num } from '@/utils/weather';
import { parseFxTime } from '@/utils/date';
import { nextHighTide, tideTrend } from '@/utils/tide';

import SkeletonCard from '../SkeletonCard/SkeletonCard.vue';

const emit = defineEmits<{
  (e: 'feedback'): void;
  (e: 'detail'): void;
}>();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

const { state, fetchWeatherAndFishing } = useFishingMapStore();

const pinIcon = icon('map-pin', 'muted');
const refreshIcon = icon('refresh-cw', 'muted');
const thermometerIcon = icon('thermometer', 'destructive');
const wavesIcon = icon('waves', 'blue');
const windIcon = icon('wind', 'blue600');
const messageIcon = icon('message-square', 'onAccent');
const infoIcon = icon('info', 'ink');

const tone = computed(() => levelTone(state.indexData?.level));

/** 一句话结论直接复用天气模块的等级映射，不在这里另写一套说法 */
const verdict = computed(() => levelVerdict(state.indexData?.level));

const placeName = computed(() => state.locationName || '钓鱼地点');

/** 实况观测时刻，只取时分 */
const updatedAt = computed(() => parseFxTime(state.liveWeather?.obsTime ?? '')?.time ?? '');

const live = computed(() => state.liveWeather);

/** 风向标签（东南风）配风速数值（km/h），缺任一就不占这个位 */
const windText = computed(() => {
  const speed = num(live.value?.windSpeed);
  return speed === null ? '--' : `${speed} km/h`;
});

const trendText = computed(() => {
  switch (tideTrend(state.tideData)) {
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

const tideMeta = computed(() => {
  const high = nextHighTide(state.tideData);
  return high ? `高潮 ${high.time}` : '暂无潮汐';
});

function onRefresh() {
  if (state.indexLoading) return;
  void fetchWeatherAndFishing(MAP_CENTER);
}
</script>

<style lang="scss" scoped>
/*
 * 结论头。
 *
 * 底色是一层**很淡的蓝调 wash**，不是 Material 那种 #e8f0fe 的实色板。
 * 差别在于实色板会在这一屏铺开一大片有彩色的区域，把注意力从分数上抢走；
 * 淡 wash 只是给整屏一个冷调的空气，分数仍然站在最前面。
 *
 * 前 34% 保持实度：状态栏和胶囊都落在这块背景里，这一段若已经开始透明，
 * 顶部就会露出 App.vue 里 page 的灰底。
 */
.verdict {
  padding-right: 24rpx;
  padding-bottom: 32rpx;
  padding-left: 24rpx;
  background: linear-gradient(180deg, rgba(0, 122, 255, 0.1) 0%, rgba(0, 122, 255, 0.1) 34%, rgba(0, 122, 255, 0) 100%);
}

.verdict__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.verdict__place {
  display: flex;
  align-items: center;
  min-width: 0;
}

.verdict__icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

.verdict__icon--pin {
  width: 28rpx;
  height: 28rpx;
  margin-right: 10rpx;
}

.verdict__icon--temp,
.verdict__icon--tide,
.verdict__icon--wind {
  margin-right: 14rpx;
}

.verdict__icon--onaccent {
  margin-right: 10rpx;
}

.verdict__place-name {
  max-width: 300rpx;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.verdict__updated {
  margin-left: 12rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* 刷新键：圆形热区，按下即反馈，不用等抬手 */
.verdict__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  flex-shrink: 0;
  border-radius: 50%;
  @include fish-press-dim;
}

/* 刷新中的转圈。用 CSS 旋转而不是图标帧图，少一张静态图 */
.verdict__refresh--busy .verdict__icon {
  animation: verdict-spin 1s linear infinite;
}

@keyframes verdict-spin {
  to {
    transform: rotate(360deg);
  }
}

.verdict__body {
  min-height: 360rpx;
}

.verdict__figure {
  display: flex;
  align-items: flex-start;
  margin-bottom: 32rpx;
  @include fish-enter;
}

/*
 * 那个大数字。
 *
 * 不套 fish-type：这一处四项全都要覆盖（大到 76pt），套上去只会留下一串
 * 被覆盖掉的声明，读的人得逐条比对才知道哪个才是生效值。这里直写。
 *
 * 字距收 -0.025em：76pt 的数字，SF Pro 的默认字距在这个尺寸上偏松，
 * 两个位数之间会露出一道缝。但也别收到更紧 —— 数字本身还带着内边白，
 * 收到 -0.05em 两三位就会粘连。字重 300 是在「细得优雅」和「非 Apple 设备上
 * 退化成细体后发虚」之间取的折中。
 */
.verdict__score {
  font-size: 152rpx;
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.025em;
}

/* 分数当文字用，所以走压深过的那一档绿，不是填充用的 systemGreen */
.verdict__score--success {
  color: $fish-success-ink;
}

.verdict__score--ink {
  color: $fish-ink;
}

.verdict__score--warning {
  color: $fish-warning;
}

.verdict__score--destructive {
  color: $fish-destructive;
}

.verdict__score--muted {
  color: $fish-muted;
}

.verdict__figure-side {
  flex: 1;
  min-width: 0;
  padding-top: 12rpx;
  padding-left: 28rpx;
}

.verdict__level {
  display: block;
  @include fish-type(title3);
}

.verdict__level--success {
  color: $fish-success-ink;
}

.verdict__level--ink {
  color: $fish-ink;
}

.verdict__level--warning {
  color: $fish-warning;
}

.verdict__level--destructive {
  color: $fish-destructive;
}

.verdict__level--muted {
  color: $fish-muted;
}

.verdict__verdict {
  display: block;
  margin-top: 6rpx;
  color: $fish-muted;
  @include fish-type(subhead);
}

/*
 * 三个成因 —— inset-grouped 分组。
 *
 * 白底浮在带色 wash 上，卡与卡之间靠 1rpx 发丝线分隔，这条线要「几乎看不见」
 * 才不显得脏。分组容器不投影：它已经是白底浮在 tint 上了，再加投影就成了三层。
 */
.verdict__signals {
  display: flex;
  overflow: hidden;
  border-radius: $fish-radius-xl;
  background-color: $fish-page;
  @include fish-enter;
}

.verdict__signal {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 20rpx 18rpx;
  border-right: 1rpx solid $fish-border;
}

.verdict__signal:last-child {
  border-right: none;
}

.verdict__signal-text {
  min-width: 0;
}

.verdict__signal-value {
  display: block;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.verdict__signal-meta {
  display: block;
  margin-top: 2rpx;
  overflow: hidden;
  color: $fish-muted;
  @include fish-type(caption2);

  white-space: nowrap;
  text-overflow: ellipsis;
}

.verdict__actions {
  display: flex;
  margin-top: 28rpx;
  @include fish-enter;
}

/*
 * 按钮。
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
  background-color: $fish-surface;
  @include fish-press(0.97);
}

.verdict__btn--primary {
  flex: 1;
  background-color: $fish-accent;
}

/* 次要按钮只让出右边的间距，不吃掉一级按钮的宽度 */
.verdict__btn + .verdict__btn {
  margin-left: 16rpx;
}

.verdict__btn-text {
  color: $fish-ink;
  @include fish-type(callout);
}

.verdict__btn-text--onaccent {
  color: #ffffff;
  font-weight: 600;
}

.verdict__error {
  color: $fish-destructive;
  @include fish-type(callout);
}

.verdict__empty {
  color: $fish-muted;
  @include fish-type(callout);
}
</style>
