<template>
  <view class="verdict" :style="{ height: windowHeight + 'px', paddingTop: capsuleTop + 'px' }">
    <!-- 顶行：地点 / 更新时间 / 刷新 -->
    <view class="verdict__top">
      <view class="verdict__place">
        <image class="verdict__icon verdict__icon--pin" :src="pinIcon" mode="widthFix" />
        <text class="verdict__place-name">{{ placeName }}</text>
        <text v-if="updatedAt" class="verdict__updated">{{ updatedAt }} 更新</text>
      </view>

      <view
        class="verdict__refresh"
        :class="{ 'verdict__refresh--busy': mapStore.indexLoading || mapStore.locating }"
        @tap="onRefresh"
      >
        <image class="verdict__icon" :src="refreshIcon" mode="widthFix" />
      </view>
    </view>

    <!--
      主体。一个焦点：分数。其余文字都退到它下面去，
      别再跟它抢 —— 这一屏要回答的问题只有一个：今天能不能钓。
    -->
    <view class="verdict__stage">
      <!--
        加载中。

        这里**不用** SkeletonCard —— 那张骨架是列表卡的形状（标题行 + 数值块 + 三列），
        摆在这块屏幕上跟最终的形状完全不像：数据到了要换一次版，版一换位置就跳。
        骨架要照着这块屏最终的样子摆：标签、分数、等级词、一句话、一行因子。

        loading 把取数的**每一段**都算进来（见 computed 的注释）：
        indexPending 管「还没开始取」的那段，locating 管定位那段，
        indexLoading 管请求那段。少算一段，那一段就会摆出空态 ——
        而空态说的是「没有」，其实只是「还没取到」。
      -->
      <view v-if="loading && !mapStore.indexData" class="verdict__skeleton">
        <view class="verdict__skeleton-label" />

        <view class="verdict__skeleton-score">
          <view class="verdict__skeleton-number" />
          <view class="verdict__skeleton-max" />
        </view>

        <view class="verdict__skeleton-level" />
        <view class="verdict__skeleton-say" />

        <view class="verdict__skeleton-factors">
          <view class="verdict__skeleton-factor">
            <view class="verdict__skeleton-icon" />
            <view class="verdict__skeleton-bar verdict__skeleton-bar--value" />
            <view class="verdict__skeleton-bar verdict__skeleton-bar--meta" />
          </view>

          <view class="verdict__factor-sep" />

          <view class="verdict__skeleton-factor">
            <view class="verdict__skeleton-icon" />
            <view class="verdict__skeleton-bar verdict__skeleton-bar--value" />
            <view class="verdict__skeleton-bar verdict__skeleton-bar--meta" />
          </view>

          <view class="verdict__factor-sep" />

          <view class="verdict__skeleton-factor">
            <view class="verdict__skeleton-icon" />
            <view class="verdict__skeleton-bar verdict__skeleton-bar--value" />
            <view class="verdict__skeleton-bar verdict__skeleton-bar--meta" />
          </view>
        </view>
      </view>

      <!-- 有数据 -->
      <template v-else-if="mapStore.indexData">
        <text class="verdict__eyebrow" :style="enterStyle(0, showAnim)">今日鱼口概率</text>

        <!--
          分数可点：点开「鱼口概率构成」。

          按下反馈挂在里层。外层这一行带 fish-enter，它是 fill-mode: both，
          动画的终态（opacity: 1）会盖住 :active 写的 opacity ——
          动画值在层叠里优先于普通声明，反馈挂在外层等于没挂。
        -->
        <view class="verdict__score" :style="enterStyle(1, showAnim)">
          <view class="verdict__score-hit" @tap="emit('breakdown')">
            <!--
              数字是滚出来的，不是切出来的。

              滚动这一层是 JS 驱动的（字面在变，CSS 改不了），
              缓动和时长在 utils/motion.ts 的 createCountUp / COUNT_UP_DURATION。
              这里只管把当前显示值吐出来。
            -->
            <text class="verdict__score-num">{{ displayScore }}</text>
            <text class="verdict__score-max">/100</text>
            <!--
              可点的样子。

              光标不会在小程序里出现，「这里能点」得让人看得见。
              右箭头说明这个数字后面还有东西 —— 底边落在数字的基线上，
              与「/100」齐平。
            -->
            <image class="verdict__score-chevron" :src="chevronRightIcon" mode="widthFix" />
          </view>
        </view>

        <text class="verdict__level" :class="`verdict__level--${tone}`" :style="enterStyle(2, showAnim)">{{
          level
        }}</text>

        <text class="verdict__say" :style="enterStyle(3, showAnim)">{{ advice }}</text>

        <!--
          三个成因压成一行。

          原来是三块带分隔线的卡，占掉半屏高度；现在只留一行小字 ——
          它们是「为什么」的补充，不该跟结论一样重。
        -->
        <view class="verdict__factors" :style="enterStyle(4, showAnim)">
          <view class="verdict__factor">
            <image class="verdict__factor-icon" :src="thermometerIcon" mode="widthFix" />
            <text class="verdict__factor-value">{{ live?.temp ?? '--' }}°</text>
            <text class="verdict__factor-meta">{{ live?.text || '暂无天气' }}</text>
          </view>

          <view class="verdict__factor-sep" />

          <view class="verdict__factor">
            <image class="verdict__factor-icon" :src="wavesIcon" mode="widthFix" />
            <text class="verdict__factor-value">{{ trendText }}</text>
            <text class="verdict__factor-meta">{{ tideMeta }}</text>
          </view>

          <view class="verdict__factor-sep" />

          <view class="verdict__factor">
            <image class="verdict__factor-icon" :src="windIcon" mode="widthFix" />
            <text class="verdict__factor-value">{{ windText }}</text>
            <text class="verdict__factor-meta">{{ live?.windDir || '暂无风向' }}</text>
          </view>
        </view>
      </template>

      <!--
        没取到。

        取不到数据有两种，界面上要分开说：
        - 出错了（indexError）—— 这是「取不到」，重试有可能成；
        - 没取到（还没有 indexData，也没有错）—— 数据还没到手。

        两种都在这一块里：版式一样，一句标题 + 一行注解 + 一个动作。
        出错时标题说「暂时取不到」，跟规范里的措辞一致；
        没取到时标题是这一屏真正在问的问句（今天能不能钓），不是操作说明。

        动作是「重新获取」：这一屏没有别的出口，
        把用户堵在这儿等于让人自己找路（见 docs/design-system.md「路径寻找」）。
      -->
      <view v-else class="verdict__empty">
        <text class="verdict__empty-title" :style="enterStyle(0, showAnim)">{{ emptyTitle }}</text>
        <text class="verdict__empty-text" :style="enterStyle(1, showAnim)">{{ emptyText }}</text>

        <!--
          按钮里不放图标。

          accent 底 + 主色文字是这一档按钮的固定搭配，
          图标只有 muted 一档颜色（生成物里没有 onAccent 的 refresh-cw），
          灰图标压在 accent 底上会读成「禁用」。
        -->
        <!--
          按下反馈挂在里层，跟上面分数那一行同一个道理：
          外层带 fish-enter，它是 fill-mode: both，动画的终态
          （transform: scale(1)）会盖住 :active 写的 transform ——
          动画值在层叠里优先于普通声明，反馈挂在外层等于没挂。
        -->
        <view class="verdict__empty-action" :style="enterStyle(2, showAnim)">
          <view class="verdict__empty-action-hit" @tap="onRefresh">
            <text class="verdict__empty-action-text">重新获取</text>
          </view>
        </view>
      </view>
    </view>

    <!--
      底部：一个主动作 + 一个入口 + 一行「下面还有」的提示。

      主动作占满宽度，AI 建议退成一个文字入口 ——
      这一屏的主动作是反馈，AI 建议是偶尔才想看一眼的补充。
    -->
    <view class="verdict__foot">
      <!-- 动作只在有数据时出现：没有鱼口概率的时候，「反馈今日鱼口概率」反馈不了任何东西 -->
      <view v-if="mapStore.indexData" class="verdict__actions" :style="enterStyle(4, showAnim)">
        <view class="verdict__btn verdict__btn--primary" @tap="emit('feedback')">
          <image class="verdict__icon verdict__icon--onaccent" :src="messageIcon" mode="widthFix" />
          <text class="verdict__btn-text verdict__btn-text--onaccent">反馈今日鱼口概率</text>
        </view>

        <view class="verdict__link" @tap="emit('analysis')">
          <image class="verdict__icon verdict__icon--accent" :src="sparklesIcon" mode="widthFix" />
          <text class="verdict__link-text">渔碌建议</text>
        </view>
      </view>

      <view class="verdict__hint" :style="enterStyle(5, showAnim)">
        <image class="verdict__hint-icon" :src="chevronDownIcon" mode="widthFix" />
        <text class="verdict__hint-text">往下看完整数据</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 首屏概览 —— 数据页 tabBar 的第二页的头一屏。
 *
 * 页面滚动直接用页面级滚动，内容超过窗口自动滚（见 pages/data 的注释）。
 * 本组件负责的只有一件事：把「今天能不能钓」说清楚，并且占满第一屏。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import { createCountUp, enterDelayMs, enterStyle } from '@/utils/motion';
import { levelTone, levelVerdict, num } from '@/utils/weather';
import { nextHighTide, tideTrend } from '@/utils/tide';

const emit = defineEmits<{
  feedback: [];
  /** 打开 AI 建议面板 */
  analysis: [];
  /** 点开鱼口概率的构成 */
  breakdown: [];
}>();

const props = withDefaults(defineProps<{ showAnim?: boolean }>(), { showAnim: true });

/** px。导航栏是浮层，顶部内容都得自己让开 */
const { capsuleTop } = useNavMetrics();

/** px。可用窗口高度（不含 tabBar），就是这一屏真正能显示的高度 */
const { windowHeight } = useViewport();

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

const pinIcon = icon('map-pin', 'muted');
const refreshIcon = icon('refresh-cw', 'muted');
const thermometerIcon = icon('thermometer', 'destructive');
const wavesIcon = icon('waves', 'blue');
const windIcon = icon('wind', 'blue600');
const messageIcon = icon('message-square', 'onAccent');
const sparklesIcon = icon('sparkles', 'blue600');
const chevronDownIcon = icon('chevron-down', 'muted60');
const chevronRightIcon = icon('chevron-right', 'muted60');

const tone = computed(() => levelTone(mapStore.indexData?.level));

/** 等级词。接口没给等级时先空着，别拿 undefined 去渲染 */
const level = computed(() => mapStore.indexData?.level ?? '');

const score = computed(() => {
  const value = mapStore.indexData?.fishing_index ?? 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
});

const displayScore = ref<number>(0);

/**
 * 数字滚动。
 *
 * 用 createCountUp 而不是自己写 setInterval：计数期间每改一次值就是一次跨线
 * setData，控制器只在整数真的变了时才写（0→100 的取值就 101 个，
 * 再被帧数一压，全程写不满 50 次）。
 */
const countUp = createCountUp((value) => {
  displayScore.value = value;
});

/**
 * showAnim 翻动时数字跟着重播。
 *
 * 这一屏的入场动画由页面持有开关（见 pages/data 的注释），摘掉时元素回到
 * 「先不在」的状态。数字跟着回到 0，重播时再数一遍 —— 数字停在旧值上、
 * 只有别的东西在动，读起来是「卡住了」。
 */
watch(
  () => props.showAnim,
  (show) => {
    if (!show) {
      countUp.set(0);
      return;
    }
    countUp.to(score.value, { delay: enterDelayMs(3) });
  },
  { immediate: true },
);

/**
 * 分数变了：数据到了，或者刷新回来了一个新值。
 *
 * 从当前显示值补间过去，不是从 0 数起 —— 刷新时数字从 60 走到 62，
 * 那一下「几乎没动」本身就是「刷新成功」的信息；从 0 重数会把这条信息抹掉。
 */
watch(score, (target) => {
  if (!props.showAnim) {
    // 入场还没播，数字先停在起点，等 showAnim 挂回时再数
    countUp.set(0);
    return;
  }
  countUp.to(target);
});

// 组件没了就别再滚：定时器停下来，最后一次 setData 才不会打在卸载后的节点上
onBeforeUnmount(() => {
  countUp.cancel();
});

/**
 * 一句话结论。
 *
 * 优先用和风官方那条「钓鱼」建议 —— 它是接口给的原文，比我们自己拼一句更有分量；
 * 官方指数还没到时退回等级映射（见 utils/weather 的 levelVerdict）。
 */
const advice = computed(() => {
  const fishing = mapStore.weatherIndices.find((item) => item.name.includes('钓鱼') && item.text);
  return fishing?.text ?? levelVerdict(mapStore.indexData?.level);
});

const placeName = computed(() => mapStore.locationName || '钓鱼地点');

/** 实况观测时刻，只取时分 */
const updatedAt = computed(() => mapStore.liveWeather?.obsTime);

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

const tideMeta = computed(() => {
  const high = nextHighTide(mapStore.tideData);
  return high ? `高潮 ${high.time}` : '暂无潮汐';
});

function onRefresh() {
  if (mapStore.indexLoading) return;
  void mapStore.refreshIndexData();
}
</script>

<style lang="scss" scoped>
.verdict {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding-right: 32rpx;
  padding-bottom: 24rpx;
  padding-left: 32rpx;
}

/* 顶行 */
.verdict__top {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 12rpx;
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

.verdict__icon--accent {
  width: 28rpx;
  height: 28rpx;
  margin-right: 8rpx;
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

/*
 * 刷新键：圆形热区，按下即反馈，不用等抬手。
 *
 * 命中区 88rpx 见方（44pt）：图标键要盲按，热区不够大就按不准。
 */
.verdict__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  border-radius: 50%;
  @include fish-press-dim;
}

/* 刷新中的转圈。用 CSS 旋转而不是图标帧图，少一张静态图 */
.verdict__refresh--busy .verdict__icon {
  animation: fish-spin 1s linear infinite;
}

/*
 * 主体。
 *
 * flex:1 吃掉顶行与底部之间的全部高度，再把内容垂直居中 ——
 * 首屏定高之后，这块留白是算出来的，不是随手撑出来的。
 */
.verdict__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  text-align: center;
}

/*
 * 加载骨架。
 *
 * 每一块的尺寸都照着上面真实元素的**行盒**摆，不是照着字面高度：
 * 标签行 31rpx、分数行 152rpx、等级词行 55rpx、一句话两行之内、
 * 因子行 28rpx。占位比真实内容矮一截的话，数据到了版式一换，
 * 下面的东西会往上跳一下 —— 那一跳读起来就是「页面散架了」。
 *
 * 底色是 $fish-surface，跟 SkeletonCard 同一档；
 * 呼吸幅度也是同一档（0.35），否则同一个页面里两种加载态一深一浅，像两套组件。
 */
.verdict__skeleton {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.verdict__skeleton-label,
.verdict__skeleton-max,
.verdict__skeleton-level,
.verdict__skeleton-say,
.verdict__skeleton-number,
.verdict__skeleton-icon,
.verdict__skeleton-bar {
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.verdict__skeleton-label {
  width: 96rpx;
  height: 31rpx;
  border-radius: $fish-radius-sm;
}

/* 分数行占满 152rpx 的行盒高度，跟真分数那一行一样高 */
.verdict__skeleton-score {
  display: flex;
  align-items: flex-end;
  height: 152rpx;
  margin-top: 12rpx;
}

.verdict__skeleton-number {
  width: 220rpx;
  height: 120rpx;
  border-radius: $fish-radius-xl;
}

.verdict__skeleton-max {
  width: 44rpx;
  height: 12rpx;
  margin-left: 8rpx;
  margin-bottom: 24rpx;
  border-radius: $fish-radius-sm;
}

.verdict__skeleton-level {
  width: 120rpx;
  height: 44rpx;
  margin-top: 4rpx;
  margin-bottom: 11rpx;
  border-radius: $fish-radius-sm;
}

.verdict__skeleton-say {
  width: 280rpx;
  height: 30rpx;
  margin-top: 8rpx;
  margin-bottom: 12rpx;
  border-radius: $fish-radius-sm;
}

.verdict__skeleton-factors {
  display: flex;
  align-items: center;
  margin-top: 40rpx;
}

.verdict__skeleton-factor {
  display: flex;
  align-items: center;
}

.verdict__skeleton-icon {
  width: 28rpx;
  height: 28rpx;
  margin-right: 8rpx;
  border-radius: 50%;
}

.verdict__skeleton-bar {
  height: 12rpx;
  border-radius: $fish-radius-sm;
}

.verdict__skeleton-bar--value {
  width: 40rpx;
}

.verdict__skeleton-bar--meta {
  width: 28rpx;
  height: 10rpx;
  margin-left: 6rpx;
}

/* 「今日鱼口概率」这个名号 */
.verdict__eyebrow {
  @include fish-eyebrow;
  @include fish-enter;
}

/*
 * 分数。
 *
 * 不套字阶：这一档（152rpx = 76pt）比字阶里最大的一级还大，
 * 套上去只会把 letter-spacing / line-height 覆盖掉。直写更省事，
 * 但每个值都要能说出理由 —— 数字用 700 与 large-title 同一档字重。
 */
.verdict__score {
  display: flex;
  margin-top: 12rpx;
  @include fish-enter;
}

/*
 * 分数本体 —— 可点的那一块。
 *
 * 按下变暗不缩小（fish-press-dim）：这一屏的主动作是下面那颗按钮，
 * 分数跟着缩会跟它抢注意力。
 */
.verdict__score-hit {
  display: flex;
  align-items: baseline;
  @include fish-press-dim;
}

/* 右箭头：可点的样子 */
.verdict__score-chevron {
  width: 24rpx;
  margin-left: 8rpx;
  opacity: 0.6;
}

.verdict__score-num {
  color: $fish-ink;
  font-size: 152rpx;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

/* 「/100」是刻度的上限，不是第二个数字：压到最小一档 */
.verdict__score-max {
  margin-left: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 等级词。
 *
 * 颜色走文字专用的深档（-ink），不用填充档 —— 这一行是当文字读的，
 * 对比度要求跟「徽标淡底深字」是同一件事（见 _color.scss 的说明）。
 */
.verdict__level {
  margin-top: 4rpx;
  @include fish-type(title2);
  @include fish-enter;
}

.verdict__level--success {
  color: $fish-success-ink;
}

.verdict__level--blue {
  color: $fish-blue-600;
}

.verdict__level--warning {
  color: $fish-warning-ink;
}

.verdict__level--destructive {
  color: $fish-destructive-ink;
}

.verdict__level--muted {
  color: $fish-muted;
}

/* 一句话结论 */
.verdict__say {
  max-width: 520rpx;
  margin-top: 8rpx;
  color: $fish-muted;
  @include fish-type(subhead);
  @include fish-enter;
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
  margin-top: 40rpx;
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
  margin: 0 18rpx;
  background-color: $fish-border-40;
}

/* 底部 */
.verdict__foot {
  flex-shrink: 0;
}

.verdict__actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
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

/*
 * 「下面还有」的提示。
 *
 * 首屏定高之后，下面确实还有东西 —— 这一行告诉用户这里是可以往下滑的，
 * 否则定高留出来的大片空白会被读成「没加载出来」。
 */
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

/*
 * 空态。
 *
 * 不是一张卡：这一屏没有「条目」可套卡片形状，硬套一张卡像坏了。
 * 版式照 my-spots 的空态：一句标题 + 一行注解 + 一个动作。
 */
.verdict__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 48rpx;
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
  margin-top: 40rpx;
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
