<template>
  <view class="verdict">
    <view v-if="loading && !mapStore.indexData" class="verdict__skeleton">
      <!--
        三格读数条 + 两个动作块。

        骨架照着真实元素的形状摆：三格等宽，每格一枚图标圆片 + 一条值 + 一条元信息。
        格子宽度不按真实值算 —— 真实值到了以后宽度本来就不同，
        摆成常见值的形状，数据到了之后的位移就是几 rpx，看不出来。
      -->
      <view class="verdict__sk-strip">
        <!-- 温度 -->
        <view class="verdict__sk-cell">
          <view class="verdict__sk-chip" />
          <view class="verdict__sk-bar verdict__sk-bar--value verdict__sk-bar--temp-value" />
          <view class="verdict__sk-bar verdict__sk-bar--meta verdict__sk-bar--temp-meta" />
        </view>

        <!-- 潮汐 -->
        <view class="verdict__sk-cell">
          <view class="verdict__sk-chip" />
          <view class="verdict__sk-bar verdict__sk-bar--value verdict__sk-bar--tide-value" />
          <view class="verdict__sk-bar verdict__sk-bar--meta verdict__sk-bar--tide-meta" />
        </view>

        <!-- 风 -->
        <view class="verdict__sk-cell">
          <view class="verdict__sk-chip" />
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
      <view class="verdict__sk-actions">
        <view class="verdict__sk-btn" />
        <view class="verdict__sk-btn" />
      </view>
    </view>

    <!-- 有数据 -->
    <template v-else-if="mapStore.indexData">
      <!--
        三个成因，三格并列。

        概览要回答的是「今天为什么能钓」：温度、潮汐、风。
        三个成因得在一眼之内读完，所以从一行连读改成三格等宽的读数 ——
        一行三个读数要顺着念下去，三格是扫一眼就齐的。
      -->
      <view class="verdict__strip" :style="enterStyle(0, showAnim)">
        <view class="verdict__cell">
          <view class="verdict__cell-chip">
            <image class="verdict__cell-icon" :src="thermometerIcon" mode="widthFix" />
          </view>
          <text class="verdict__cell-value">{{ tempText }}</text>
          <text class="verdict__cell-meta">{{ live?.text || '暂无天气' }}</text>
        </view>

        <view class="verdict__cell">
          <view class="verdict__cell-chip">
            <image class="verdict__cell-icon" :src="wavesIcon" mode="widthFix" />
          </view>
          <text class="verdict__cell-value">{{ trendText }}</text>
          <text class="verdict__cell-meta">{{ tideMeta }}</text>
        </view>

        <view class="verdict__cell">
          <view class="verdict__cell-chip">
            <image class="verdict__cell-icon" :src="windIcon" mode="widthFix" />
          </view>
          <text class="verdict__cell-value">{{ windText }}</text>
          <text class="verdict__cell-meta">{{ windMeta }}</text>
        </view>
      </view>

      <!--
        两个动作并排。

        反馈与渔碌建议是这一屏仅有的两个动作，权重本来就近：
        一个要按、一个偶尔才看一眼，但并排两枚药丸已经把这件事说清了，
        不必再让一枚满宽的主按钮把另一个压成一行小字。
      -->
      <view class="verdict__actions" :style="enterStyle(1, showAnim)">
        <view class="verdict__btn verdict__btn--primary" @tap="emit('feedback')">
          <image class="verdict__icon verdict__icon--onaccent" :src="messageIcon" mode="widthFix" />
          <text class="verdict__btn-text verdict__btn-text--onaccent">反馈今日鱼口</text>
        </view>

        <view class="verdict__btn verdict__btn--tint" @tap="emit('analysis')">
          <image class="verdict__icon verdict__icon--accent" :src="sparklesIcon" mode="widthFix" />
          <text class="verdict__btn-text verdict__btn-text--blue">渔碌建议</text>
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
 * 这一张说「为什么」：温度、潮汐、风三个成因，外加两个动作 ——
 * 反馈今日鱼口与渔碌建议。
 *
 * 分工不重叠 —— 同一个数字不在两处出现。
 */
import { computed } from 'vue';

import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import { enterStyle } from '@/utils/motion';
import { num, windLevelName } from '@/utils/weather';
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

/** 温度。取不到就 '--'，不留半个符号 */
const tempText = computed(() => {
  const temp = num(live.value?.temp);
  return temp === null ? '--' : `${temp}°`;
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

/** 潮汐格的元信息：下一次满潮的时刻 */
const tideMeta = computed(() => {
  const high = nextHighTide(mapStore.tideData);
  return high && high.time !== '--' ? `高潮 ${high.time}` : '暂无潮时';
});

/**
 * 风：级数，不给风速。
 *
 * 上游给的就是蒲福级数（weather-normalize 从 wind.scale 归一而来），
 * 「3 级风」是所有人都懂的，「12.4 km/h」没人有直觉。
 * 同一屏的 WeatherCard 也已经是「东南风 · 12.4 km/h · 3 级」——
 * 这里单挂一个风速才是全项目最后的不一致。
 */
const windText = computed(() => {
  const scale = num(live.value?.windScale);
  return scale === null ? '--' : `${scale} 级`;
});

/**
 * 风格的元信息：风名 + 风向。
 *
 * 风名（「微风」）是级数说的人话，风向是钓鱼关心的另一半 ——
 * 风从哪来决定抛投方向。两样都没有才写「暂无风况」。
 */
const windMeta = computed(() => {
  const parts: string[] = [];

  const scale = num(live.value?.windScale);
  if (scale !== null) {
    const name = windLevelName(scale);
    if (name) parts.push(name);
  }
  if (live.value?.windDir) parts.push(live.value.windDir);

  return parts.length ? parts.join(' · ') : '暂无风况';
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
 *
 * 圆角用 fish-glass 的默认档（radius-mid）：数据页上其余几张方卡
 * （当前天气 / 多日预报）是同一档，这一张单挂 radius-card 会读成另一套组件。
 */
.verdict {
  position: relative;
  margin-top: -36rpx;
  margin-right: 32rpx;
  margin-left: 32rpx;
  padding: 28rpx;
  @include fish-glass;
  background-color: $fish-page;
}

/* ── 三个成因 ──────────────────────────────────────────────────────────── */

/*
 * 读数条。
 *
 * 三格等宽的一层浅面。底色用 $fish-fill（分组内部的浅一档面）而不是描边：
 * 这一层是「一块托着三个读数的面」，描边会把三格读成一张表。
 */
.verdict__strip {
  display: flex;
  align-items: stretch;
  padding: 24rpx 8rpx;
  border-radius: 28rpx;
  background-color: $fish-fill;
  @include fish-enter;
}

.verdict__cell {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

/*
 * 图标垫一枚白底圆片。
 *
 * 白底是刻意的：圆片压在 $fish-fill 的浅灰面上，不垫底的话图标跟底色混在一块，
 * 读不出「这是一枚图标」。三枚圆片一样大，下面那一行读数才齐。
 */
.verdict__cell-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  margin-bottom: 14rpx;
  border-radius: 50%;
  background-color: $fish-page;
}

.verdict__cell-icon {
  width: 30rpx;
  height: 30rpx;
}

/*
 * 值是这一格的主角，套 title 一档（40rpx / 600）。
 *
 * 字阶里没有比 title 更适合的档：display 那一档是头图的分数，
 * 这一格要是也用上，两屏的「最大数字」就撞了。
 */
.verdict__cell-value {
  color: $fish-ink;
  @include fish-type(title);

  font-variant-numeric: tabular-nums;
}

/* 元信息：值的注解，一句话说完 */
.verdict__cell-meta {
  margin-top: 6rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* ── 动作 ──────────────────────────────────────────────────────────────── */

.verdict__actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 28rpx;
  @include fish-enter;
}

/*
 * 两个动作同一档：都是药丸、同样宽、同样 88rpx 高。
 *
 * 88rpx = 44pt，正好是 Apple 判定为「可放心点按」的最小命中尺寸。
 * 反馈在手指落下的那一帧就给出（fish-press），抬手回弹用满 260ms ——
 * 两段时长一短一长，是 iOS 按压手感的关键，缺一段立刻变塑料。
 */
.verdict__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 20rpx;
  border-radius: $fish-radius-pill;
  @include fish-press(0.97);
}

/* 主动作：品牌蓝实心 */
.verdict__btn--primary {
  background-image: $fish-gradient;
  box-shadow: $smooth-shadow-sm;
}

/*
 * 次动作：品牌蓝的淡底 + 深字。
 *
 * 淡底而不是描边：这一屏已经有一枚实心按钮了，
 * 再加一圈描边会多出一个视觉层级，而这一屏不该有三个层级。
 */
.verdict__btn--tint {
  background-color: $fish-accent-tint;
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
  @include fish-type(body, 600);
}

.verdict__btn-text--onaccent {
  color: $fish-on-accent;
}

.verdict__btn-text--blue {
  color: $fish-blue-600;
}

/* ── 加载骨架 ──────────────────────────────────────────────────────────── */

/*
 * 分两层：**行盒**管位置，**色块**管形状。
 *
 * 底色是 $fish-surface，跟 SkeletonCard 同一档；
 * 呼吸幅度也是同一档（0.35 / 1.8s），否则同一个页面里两种加载态一深一浅，像两套组件。
 */
.verdict__skeleton {
  display: flex;
  flex-direction: column;
}

.verdict__sk-bar,
.verdict__sk-chip,
.verdict__sk-btn {
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

/* 读数条的占位：形状跟真的一格一样 */
.verdict__sk-strip {
  display: flex;
  padding: 24rpx 8rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-fill;
}

.verdict__sk-cell {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
}

/* 图标圆片：64rpx，跟真的那枚一样大 */
.verdict__sk-chip {
  width: 64rpx;
  height: 64rpx;
  margin-bottom: 14rpx;
  border-radius: 50%;
}

/* 值：title 40rpx */
.verdict__sk-bar--value {
  height: 40rpx;
  border-radius: $fish-radius-sm;
}

/* 元信息：caption 24rpx */
.verdict__sk-bar--meta {
  height: 24rpx;
  margin-top: 10rpx;
  border-radius: $fish-radius-sm;
}

/*
 * 三块的宽度按**常见值**摆：温度「22°」约 48rpx、潮汐「涨潮」56rpx、风「3 级」56rpx；
 * 元信息分别是「多云」48rpx、「高潮 15:30」120rpx、「微风 · 东南风」140rpx。
 *
 * 真实宽度随数据变，摆得准是运气 —— 摆成常见值的形状，
 * 数据到了之后的位移就是几 rpx，看不出来。
 */
.verdict__sk-bar--temp-value {
  width: 48rpx;
}

.verdict__sk-bar--temp-meta {
  width: 48rpx;
}

.verdict__sk-bar--tide-value {
  width: 56rpx;
}

.verdict__sk-bar--tide-meta {
  width: 120rpx;
}

.verdict__sk-bar--wind-value {
  width: 56rpx;
}

.verdict__sk-bar--wind-meta {
  width: 140rpx;
}

/* 动作区的占位 */
.verdict__sk-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 28rpx;
}

.verdict__sk-btn {
  flex: 1;
  height: 88rpx;
  border-radius: $fish-radius-pill;
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
  @include fish-type(title);
  @include fish-enter;
}

.verdict__empty-text {
  margin-top: 12rpx;
  color: $fish-muted;
  @include fish-type(body);
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
  @include fish-type(body, 600);
}
</style>
