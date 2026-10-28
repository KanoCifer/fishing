<template>
  <view class="minutely">
    <view class="minutely__head">
      <text class="minutely__title">分钟降水</text>
      <text class="minutely__meta">{{ windowLabel }}</text>
    </view>

    <!--
      上游给的一句话。

      这是这张卡最该先被看到的东西：「95分钟后雨就停了」比一排柱子更快地
      回答「还能不能钓」。所以它排在图上面，而不是塞进标题行的注脚里。
    -->
    <text v-if="summary" class="minutely__summary">{{ summary }}</text>

    <!--
      骨架照着最终形状摆，不用 SkeletonCard —— 那张是列表卡的形状
      （标题行 + 数值块 + 三列），摆在这里跟最终的样子对不上
      （理由见 VerdictOverview 的加载态注释）。
    -->
    <view v-if="loading && !hasData" class="minutely__skeleton">
      <view class="minutely__skeleton-summary" />
      <view class="minutely__skeleton-plot" />
    </view>

    <view v-else-if="hasData" class="minutely__body">
      <!--
        雨幕。

        一格一根柱子：横排是时间，柱高是这 5 分钟下了多少，柱色是雨强档位。

        为什么不用曲线：上游给的是一格一格的累计量，连成曲线等于替这串
        离散数据编了一段并不存在的连续性 —— 雨是断续的，曲线会把两场雨
        之间的空当描成一条缓缓下滑的线，看着像雨没停。柱子只声称它知道的
        那一格。
      -->
      <view class="curtain">
        <view v-for="bucket in curtain.buckets" :key="bucket.index" class="curtain__col" @tap="select(bucket.index)">
          <!--
            选中标记：柱子顶端一个墨点。

            读数轨道在图的下面，手指点了柱子之后视线要一路往下找，
            这里给一个「就是你这一格」的锚点。
          -->
          <view v-if="bucket.index === selected" class="curtain__caret" />

          <view class="minutely__bar" :class="barClass(bucket)" :style="barStyle(bucket)" />
        </view>

        <!-- 现在：左边界上那道线，与横轴的「现在」刻度对齐 -->
        <!--
          整段没有降水时的说明。

          没有雨的时候，图上只剩一排 0 高度的短柱 —— 看着像图没加载出来。
          所以在这里把结论写出来：这一格不是空的，是「测过了，是 0」。
        -->
        <view v-if="isDry" class="minutely__dry">
          <text class="minutely__dry-label">{{ dryLabel }}</text>
        </view>

        <view class="curtain__now" />
      </view>

      <view class="curtain__ticks">
        <text
          v-for="tick in curtain.ticks"
          :key="tick.offset"
          class="curtain__tick"
          :class="'curtain__tick--' + tick.anchor"
          :style="{ left: tick.leftPct + '%' }"
        >
          {{ tick.label }}
        </text>
      </view>

      <!--
        色卡。

        颜色在这张图里只承载**档位**，不承载大小（大小是柱高），
        所以色卡要写清楚每档叫什么 —— 否则四根深浅不一的蓝柱
        对读者来说只是四根不一样的蓝柱。
      -->
      <view class="minutely__legend">
        <!--
          整段没有降水：四档色卡用不上，只留一枚「无降水」色块 ——
          四档都摆着、图上一根柱子都没有，图例反而会让人以为图漏了。
        -->
        <view v-if="isDry" class="minutely__legend-chip minutely__legend-chip--last">
          <view class="minutely__swatch minutely__swatch--none" />
          <text class="minutely__legend-label">0 毫米</text>
        </view>
        <template v-else>
          <view
            v-for="(level, index) in legendLevels"
            :key="level.key"
            class="minutely__legend-chip"
            :class="{ 'minutely__legend-chip--last': index === legendLevels.length - 1 }"
          >
            <view class="minutely__swatch" :class="'minutely__swatch--' + level.key" />
            <text class="minutely__legend-label">{{ level.label }}</text>
          </view>
        </template>
      </view>

      <!--
        读数轨道。

        两组内容叠在同一个格子里交叉淡入，写法跟 LineChart 的轨道一致
        （绝对定位 + 基态藏起来 + 修饰类显出来）。
      -->
      <view class="minutely__rail">
        <!-- 常态：没选中任何一格时给这段窗口的总量 -->
        <view class="minutely__slot" :class="{ 'minutely__slot--idle': selected === null }">
          <text class="minutely__rail-label">累计降水</text>
          <view class="minutely__rail-row">
            <text class="minutely__rail-value">{{ curtain.total.toFixed(1) }}</text>
            <text class="minutely__rail-unit">毫米</text>
            <view v-if="peakTag" class="minutely__tag">
              <view class="minutely__dot" :class="'minutely__dot--' + peakTag.level" />
              <text class="minutely__tag-text">峰值 {{ peakTag.label }}</text>
            </view>
          </view>
        </view>

        <!-- 激活：当前选中那一格的读数 -->
        <view class="minutely__slot" :class="{ 'minutely__slot--active': selected !== null }">
          <text class="minutely__rail-label">{{ activeLabel }}</text>
          <view class="minutely__rail-row">
            <text class="minutely__rail-value">{{ activeValue }}</text>
            <text class="minutely__rail-unit">毫米 / 5 分钟</text>
            <view class="minutely__tag">
              <view v-if="activeLevel" class="minutely__dot" :class="'minutely__dot--' + activeLevel" />
              <text class="minutely__tag-text">{{ activeTag }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <text v-else class="minutely__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 分钟降水 —— 未来 2 小时、每 5 分钟一格的降水预报。
 *
 * 为什么值得单独一张卡、还放在天气分区的最上面：
 * 钓鱼最怕的是「雨下起来了才知道」。逐时预报给的是小时粒度，
 * 正在下雨的那一小时里它只能给一个平均值；分钟降水给的是接下来两小时的
 * 逐 5 分钟累计量 —— 雨什么时候到、什么时候停，一眼看得出来。
 *
 * 图用「雨幕」：一格一根柱子，不画曲线。理由写在模板里那段注释中。
 *
 * 上游只覆盖中国区域，所以这张卡取不到数是常态而不是异常：
 * 失败时给一句空态，不弹 toast、不拖垮同一分区的其它卡。
 */
import { computed, ref, watch } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import type { MinutelyBucket } from '@/types/fishing';
import { buildMinutelyCurtain, formatSpan, precipLevelLabel, PRECIP_LEGEND_LEVELS } from '@/utils/precip';

const mapStore = useFishingMapStore();

const points = computed(() => mapStore.minutelyForecast?.points ?? []);

const summary = computed(() => mapStore.minutelyForecast?.summary ?? '');

/** 换算成「雨幕」的窗口模型。取数在 store，换算在 utils，这里只管画 */
const curtain = computed(() => buildMinutelyCurtain(points.value));

/** 色卡上的四档 */
const legendLevels = PRECIP_LEGEND_LEVELS;

/**
 * 有没有可画的东西。
 *
 * 「上游给了格子」不等于「有格子能画」：整段窗口都可能是空串，
 * 那时候这张卡该说「暂无数据」，而不是画一排空柱子。
 */
const hasData = computed(() => curtain.value.buckets.some((bucket) => bucket.value !== null));

const loading = computed(() => mapStore.minutelyLoading);

/** 标题行右侧的窗口说明 */
const windowLabel = computed(() => `未来 ${formatSpan(curtain.value.spanMinutes)} · 每 5 分钟`);

/**
 * 空态文案分两种：取不到（多为境外坐标，上游没覆盖）和拿到了但没数据。
 */
const emptyText = computed(() => (mapStore.minutelyError ? '分钟降水暂不可用' : '未来两小时暂无降水数据'));

/** 选中的格子序号。没选中时为 null */
const selected = ref<number | null>(null);

/**
 * 数据换了就把选择清掉。
 *
 * 下标是这一份数据里的下标，新一份数据的第 12 格可能完全不是同一段时间 ——
 * 留着旧下标，轨道上会读出一格不相干的读数。
 */
watch(
  () => mapStore.minutelyForecast,
  () => {
    selected.value = null;
  },
);

/** 点柱子：选中这一格。再点一下同一格，取消选择，回到窗口总量 */
function select(index: number) {
  selected.value = selected.value === index ? null : index;
}

/** 柱子属于哪一档 —— 决定它的颜色 */
function barClass(bucket: MinutelyBucket): string {
  if (bucket.value === null) return 'minutely__bar--gap';
  return `minutely__bar--${bucket.level ?? 'none'}`;
}

/**
 * 柱子的高度与入场延迟。
 *
 * 高度是百分比（相对绘图区），落在行内样式里 —— 格子数是上游给的，
 * 写死在 CSS 里就得跟着上游改。
 */
function barStyle(bucket: MinutelyBucket): string {
  let height: string;
  if (bucket.value === null) {
    // 没有数据：整格画成虚线空框（见 .minutely__bar--gap）
    height = '100%';
  } else if (!bucket.heightPct) {
    // 测到 0 雨：留一根极短的淡柱。留这一根是为了跟「没有数据」区分开 ——
    // 0 高度是「这一格测过，是 0」，虚线空框是「这一格没测到」
    height = '4rpx';
  } else {
    height = `${bucket.heightPct}%`;
  }
  // 逐格错开入场：柱子从左到右立起来，像雨幕一档档拉开
  return `height: ${height}; animation-delay: ${bucket.index * 14}ms;`;
}

/** 选中格子的读数 */
const active = computed(() => (selected.value === null ? null : (curtain.value.buckets[selected.value] ?? null)));

const activeLabel = computed(() => {
  const bucket = active.value;
  if (!bucket) return '';
  return bucket.offset === 0 ? '现在' : `${bucket.offset}分钟后`;
});

/** 选中格子的数值。没有数据时给一个破折号，不给 0 */
const activeValue = computed(() => {
  const bucket = active.value;
  if (!bucket) return '';
  return bucket.value === null ? '—' : bucket.value.toFixed(2);
});

/** 选中格子的档位（决定色点）。没有数据时为 null */
const activeLevel = computed(() => {
  const bucket = active.value;
  if (!bucket || bucket.value === null) return null;
  return bucket.level ?? 'none';
});

const activeTag = computed(() => {
  const bucket = active.value;
  if (!bucket) return '';
  if (bucket.value === null) return '无数据';
  return precipLevelLabel(bucket.level ?? 'none');
});

/**
 * 整段没有降水。
 *
 * 这种窗口下每一格都是 0，图上只剩一排 0 高度的短柱 —— 看着像图没加载出来。
 * 所以要单独认出来：柱子照画（0 高度也是「测过了，是 0」），
 * 另在图上写一句结论、色卡换成一枚「无降水」。
 */
const isDry = computed(() => hasData.value && curtain.value.total === 0);

/**
 * 干态下那句话。
 *
 * 写状态，不写结论 —— 上游那句话（通常是「未来两小时无降水」）已经在卡片
 * 上面了，图上再写一遍同样的句子就是同一句话说两遍。
 *
 * 有格子缺测的时候不能一口咬定整段无雨 —— 缺的那几格是「不知道」，
 * 不是「没下」。所以分开说。
 */
const dryLabel = computed(() => {
  const gap = curtain.value.buckets.some((bucket) => bucket.value === null);
  return gap ? '无降水（部分时段缺测）' : '无降水';
});

/**
 * 峰值标签。
 *
 * 整段没有降水时不挂这个标签 ——「峰值 无降水」是一句废话，
 * 峰值本来就是 0，读者要的信息图上那句结论已经给了。
 */
const peakTag = computed(() => {
  const peak = curtain.value.peak;
  if (!peak || peak.value === null || peak.value <= 0) return null;
  const level = peak.level ?? 'none';
  return { level, label: precipLevelLabel(level) };
});
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.minutely {
  @include fish-card;
}

.minutely__head {
  @include fish-card-head;
}

.minutely__title {
  @include fish-card-title;
}

.minutely__meta {
  @include fish-card-meta;
}

/*
 * 上游那句话。
 *
 * 它是结论不是注脚，所以给正文的字阶与墨色 —— 压成灰色小字就成了一句
 * 容易被划过去的补充说明，而它恰恰是这张卡最该被先读到的内容。
 */
.minutely__summary {
  display: block;
  margin-bottom: 20rpx;
  color: $fish-ink;
  @include fish-type(subhead);
}

.minutely__skeleton-summary {
  width: 320rpx;
  height: 28rpx;
  margin-bottom: 20rpx;
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

/* 图区的高度照着真图来：数据到了不换版，页面不会往下跳一截 */
.minutely__skeleton-plot {
  width: 100%;
  height: 200rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.minutely__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted-60;
  @include fish-type(subhead);
  text-align: center;
}

/* ===========================================================================
   雨幕
   =========================================================================== */

/*
 * 干态说明。
 *
 * 绝对定位在绘图区正中：柱子全在底边（0 高度），中间是空的，
 * 结论写在那里，图就不像没加载出来。
 */
.minutely__dry {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  /*
   * 这一层铺满整个绘图区，会盖在柱子上；不让它接事件，
   * 点击才能落到下面的柱子上（这层是纯文字，本来也不需要交互）。
   * 与 PageNav / PageBackdrop 同一套做法。
   */
  pointer-events: none;
}

.minutely__dry-label {
  color: $fish-muted;
  @include fish-type(subhead);
}

/*
 * 绘图区。
 *
 * 柱子从下往上长：每一格是等宽的一列，列里的柱子贴着底边。
 */
.curtain {
  position: relative;
  display: flex;
  align-items: flex-end;
  height: 200rpx;
}

.curtain__col {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex: 1;
  height: 100%;
}

.minutely__bar {
  width: 18rpx;
  border-radius: 6rpx 6rpx 2rpx 2rpx;
  transform-origin: bottom center;

  @if $fish-motion {
    animation: curtain-rise 520ms $fish-ease-out both;
  }
}

/*
 * 测到 0 雨的那一格。
 *
 * 用 $fish-faint 而不是 $fish-surface：surface 那一档淡到几乎看不见，
 * 整段无雨的时候图上就只剩一片空白，看着像图没加载出来。
 * faint 是「不是文字的极淡填充」这一档，正是短桩该用的。
 */
.minutely__bar--none {
  background-color: $fish-faint;
}

.minutely__bar--light {
  background-color: $fish-rain-light;
}

.minutely__bar--medium {
  background-color: $fish-rain-medium;
}

.minutely__bar--heavy {
  background-color: $fish-rain-heavy;
}

.minutely__bar--storm {
  background-color: $fish-rain-storm;
}

/*
 * 没有数据的那一格。
 *
 * 画成虚线空框，而不是一根 0 高度的柱子：0 高度是「这一格测到没下雨」，
 * 虚线空框是「这一格没测到」。两件事在图上必须长得不一样。
 */
.minutely__bar--gap {
  border: 1rpx dashed $fish-border-40;
  background-color: transparent;

  @if $fish-motion {
    animation-name: curtain-fade;
  }
}

/*
 * 选中标记。
 *
 * 一个墨点，不是一根线：柱子的高矮差很多，线容易跟柱子混在一起，
 * 点则只说明「这一列被选中了」。
 */
.curtain__caret {
  position: absolute;
  top: -6rpx;
  left: 50%;
  width: 12rpx;
  height: 12rpx;
  margin-left: -6rpx;
  border-radius: 50%;
  background-color: $fish-ink;
}

/* 现在：绘图区左边界上那道线 */
.curtain__now {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1rpx;
  background-color: $fish-border-40;
}

/*
 * 横轴刻度。
 *
 * 刻度按各自那一格的位置摆（不等距），所以用绝对定位落在百分比上。
 */
.curtain__ticks {
  position: relative;
  height: 32rpx;
  margin-top: 8rpx;
}

.curtain__tick {
  position: absolute;
  top: 0;
  color: $fish-muted-60;
  @include fish-type(caption2);
  white-space: nowrap;
}

.curtain__tick--mid {
  transform: translateX(-50%);
}

.curtain__tick--end {
  transform: translateX(-100%);
}

/* ===========================================================================
   色卡
   =========================================================================== */

.minutely__legend {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid $fish-border-40;
}

.minutely__legend-chip {
  display: flex;
  align-items: center;
  margin-right: 28rpx;
}

.minutely__legend-chip--last {
  margin-right: 0;
}

.minutely__swatch {
  width: 20rpx;
  height: 20rpx;
  margin-right: 10rpx;
  border-radius: 6rpx;
}

/* 「无降水」色块：跟「测到 0」的短柱同一个色 */
.minutely__swatch--none {
  background-color: $fish-faint;
}

.minutely__swatch--light {
  background-color: $fish-rain-light;
}

.minutely__swatch--medium {
  background-color: $fish-rain-medium;
}

.minutely__swatch--heavy {
  background-color: $fish-rain-heavy;
}

.minutely__swatch--storm {
  background-color: $fish-rain-storm;
}

.minutely__legend-label {
  color: $fish-muted;
  @include fish-type(caption2);
}

/* ===========================================================================
   读数轨道
   =========================================================================== */

/*
 * 两个状态叠在同一个格子里交叉淡入。
 *
 * 基态是「藏起来并下移 4rpx」，两个修饰类都是「显出来」——
 * 写法跟 LineChart 的轨道一致，两处读数轨道是同一套行为。
 */
.minutely__rail {
  position: relative;
  height: 132rpx;
  margin-top: 20rpx;
  border-top: 1rpx solid $fish-border-40;
}

.minutely__slot {
  position: absolute;
  top: 18rpx;
  right: 0;
  bottom: 0;
  left: 0;
  opacity: 0;
  transform: translateY(4rpx);

  @if $fish-motion {
    transition:
      opacity $fish-dur-cross $fish-ease-out,
      transform $fish-dur-cross $fish-ease-out;
  }
}

.minutely__slot--idle,
.minutely__slot--active {
  opacity: 1;
  transform: translateY(0);
}

.minutely__rail-label {
  display: block;
  margin-bottom: 6rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.minutely__rail-row {
  display: flex;
  align-items: baseline;
}

.minutely__rail-value {
  color: $fish-ink;
  @include fish-type(subhead);
  font-weight: 600;
}

.minutely__rail-unit {
  margin-left: 6rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* 档位标签：色点 + 档位名。跟 LineChart 的分档标记同一套做法 */
.minutely__tag {
  display: flex;
  align-items: center;
  margin-left: 16rpx;
}

.minutely__dot {
  align-self: center;
  width: 14rpx;
  height: 14rpx;
  margin-right: 8rpx;
  border-radius: 50%;
}

.minutely__dot--none {
  background-color: $fish-faint;
}

.minutely__dot--light {
  background-color: $fish-rain-light;
}

.minutely__dot--medium {
  background-color: $fish-rain-medium;
}

.minutely__dot--heavy {
  background-color: $fish-rain-heavy;
}

.minutely__dot--storm {
  background-color: $fish-rain-storm;
}

.minutely__tag-text {
  color: $fish-muted;
  @include fish-type(caption2);
}

/* ===========================================================================
   入场
   =========================================================================== */

/*
 * 柱子从底边长上来。
 *
 * 只动 transform 与 opacity：这两条在小程序里走合成，不触发布局重排。
 *
 * 关键帧写在组件自己的样式里（SnapSheet 也是这么做的），不进 App.vue ——
 * 全局那份只放跨组件复用的动画。
 */
@keyframes curtain-rise {
  from {
    opacity: 0;
    transform: scaleY(0);
  }

  to {
    opacity: 1;
    transform: scaleY(1);
  }
}

/* 没有数据的那一格不生长，只淡入 —— 让「没数据」看起来是「这一格被跳过」 */
@keyframes curtain-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
