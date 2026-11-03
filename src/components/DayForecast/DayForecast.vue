<template>
  <view class="days" :class="{ 'days--empty': !days.length && !loading }">
    <view class="days__head">
      <view v-if="days.length" class="days__head-left">
        <image class="days__title-icon" :src="calendarIcon" mode="aspectFit" />
        <text class="days__title">{{ title }}</text>
      </view>

      <view v-else-if="loading" class="days__skeleton days__skeleton--title" />
    </view>

    <!--
      骨架与实数据叠在同一个格子里交叉淡入：
      数据到了，内容淡入落位、同一时刻骨架淡出（见 composables/useCrossFade）。

      叠在同一个格子而不是上下排：两态不占两份高度，
      也不必为「骨架该多高」再写一套尺寸。
    -->
    <view class="days__stack">
      <view v-if="days.length" class="days__content">
        <view class="days__list">
          <view v-for="(day, i) in days" :key="day.fxDate" class="days__row">
            <!-- 行首的星期 -->
            <text class="days__label" :class="{ 'days__label--today': i === 0 }">{{ dayLabel(day.fxDate, i) }}</text>

            <image class="days__icon" :src="weatherIconUri(day.icon)" mode="aspectFit" />

            <!-- 最低温 -->
            <text class="days__temp days__temp--min">{{ day.min }}°</text>

            <!-- 最高温。它比最低温重一档：最低温是背景，最高温才是「哪天更暖」要读的那个数 -->
            <text class="days__temp days__temp--max">{{ day.max }}°</text>

            <view class="days__bar">
              <view class="days__track" />
              <view class="days__segment" :style="segmentStyle(day, i)">
                <view class="days__segment-fill" :style="segmentFillStyle(day)" />
              </view>
            </view>

            <text class="days__prob">{{ probText(day) }}</text>
          </view>
        </view>
      </view>

      <!--
        加载中：行骨架。

        骨架照着最终形状摆（每一行的行盒高度与真实行一致），
        所以数据到了版式不换，下面那一段不会跳。

        行数跟着已知数据走：预报列表有几天就摆几行，
        免得真实数据到了之后整块高度缩一下。
      -->
      <view
        v-if="skeletonVisible"
        class="days__skeleton-layer"
        :class="{ 'days__skeleton-layer--out': days.length > 0 }"
      >
        <view class="days__list">
          <view v-for="i in skeletonRows" :key="i" class="days__row">
            <view class="days__skeleton days__skeleton--label" />
            <view class="days__skeleton days__skeleton--icon" />
            <view class="days__skeleton days__skeleton--temp" />
            <view class="days__skeleton days__skeleton--temp" />
            <view class="days__skeleton days__skeleton--bar" />
            <view class="days__skeleton days__skeleton--prob" />
          </view>
        </view>
      </view>
    </view>

    <text v-if="!days.length && !loading" class="days__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useCrossFade } from '@/composables/useCrossFade';
import { icon } from '@/constants/icons';
import { tempGradient } from '@/constants/weatherTemp';
import { useFishingMapStore } from '@/stores/fishingMap';
import { weekdayCn } from '@/utils/date';
import type { ForecastDay } from '@/utils/weather';
import { forecastDays, weatherIconUri } from '@/utils/weather';

const mapStore = useFishingMapStore();

const calendarIcon = icon('calendar-days', 'ink');

/**
 * 有效的预报日。
 *
 * 挑出高低温都有值的日，脏数据整条丢掉，不占一行 —— 口径在 utils/weather，
 * 「今天」只有这一个出处。
 */
const days = computed(() => forecastDays(mapStore.forecasts));

/**
 * 全部行共用的温度量程。
 *
 * 全局最低到全局最高，所有行用同一套换算 —— 这正是「可比较」的前提：
 * 每行各画各的尺子的话，那几截的高下就只是各说各话。
 *
 * 跨度为 0（所有天温度一模一样）时按 1 算：分母不能是 0，
 * 而这种情况下每截本来就在同一个位置，比不比都一样。
 */
const scale = computed(() => {
  if (!days.value.length) return null;

  let lo = Infinity;
  let hi = -Infinity;

  for (const day of days.value) {
    if (day.min < lo) lo = day.min;
    if (day.max > hi) hi = day.max;
  }

  return { lo, hi, span: Math.max(hi - lo, 1) };
});

/**
 * 温度条上那一截的位置与宽度（占轨道宽的百分比）。
 *
 * 左端 = 当天最低温在量程里的位置，右端 = 最高温的位置。
 * 尺子是倒的与否无所谓 —— 这里只关心截的长度与偏移，不关心上下。
 *
 * 下限 2%：一天里高低温差极小时，那一截会缩成一个点，看不见。
 * 给它留一点长度，「那天基本不变温」这件事至少还看得见。
 */
function segmentGeometry(day: ForecastDay): { left: number; width: number } {
  const s = scale.value;
  if (!s) return { left: 0, width: 0 };

  const left = ((day.min - s.lo) / s.span) * 100;
  const width = ((day.max - day.min) / s.span) * 100;

  return { left, width: Math.max(width, 2) };
}

/**
 * 截本身的位置与宽度。
 *
 * 顺带给出逐行延迟：温度条从上往下依次展开，
 * 步长 12ms —— 与分钟降水的雨幕同一档。
 */
function segmentStyle(day: ForecastDay, index: number): string {
  const { left, width } = segmentGeometry(day);

  return [
    `left:${left.toFixed(2)}%`,
    `width:${width.toFixed(2)}%`,
    `animation-delay:${index * 12}ms`,
  ].join(';');
}

/**
 * 截里的渐变。
 *
 * 渐变按**全局量程**铺，不是按这一截自己的区间铺 ——
 * 否则每一截都从「冷」开始到「热」结束，24°–28° 的暖天和 4°–8° 的冷天
 * 画出来是同一条蓝到橙，真实的冷暖就丢了。
 *
 * 铺法：截里放一个与轨道等宽的内层（宽度按百分比换算），
 * 内层往左挪一个偏移量，于是它露出来的那一段正好落在这一截的位置上。
 * 露出的部分就是全局渐变在当天温度区间里的那一段 —— 同一温度恒定同色。
 *
 * 那个偏移量要一起交给渐变：内层比轨道宽、又被左移，
 * 它的坐标原点不在轨道原点上。不把偏移告诉渐变，
 * 露出来的颜色会比真实温度偏冷一整截。
 */
function segmentFillStyle(day: ForecastDay): string {
  const s = scale.value;
  if (!s) return '';

  const { left, width } = segmentGeometry(day);
  if (!width) return '';

  return [
    `left:${(-(left / width) * 100).toFixed(2)}%`,
    `width:${((100 / width) * 100).toFixed(2)}%`,
    `background-image:${tempGradient(s.lo, s.hi, left / 100)}`,
  ].join(';');
}

/**
 * 行首的标签。
 *
 * 「今天」认的是**留下来的第一行**，不是接口的第一条 —— 头一天要是脏数据
 * （缺高低温）整条被丢掉，剩下的第一行才是今天。
 * 所以这个判断按行在列表里的位置算，不按它在接口里的位置。
 *
 * 其余各行说星期而不是日期：钓鱼的人想的是「这周末去不去」，
 * 星期不用自己换算，日期要。
 */
function dayLabel(fxDate: string, index: number): string {
  if (index === 0) return '今天';

  return weekdayCn(fxDate) || fxDate.slice(5);
}

/**
 * 降水概率文案。
 *
 * 概率为 0 时是空串 —— 一整周都不下雨却每行都写「0%」是噪音，
 * 而右对齐的列本来就不怕留空。
 */
function probText(day: ForecastDay): string {
  return day.prob > 0 ? `${day.prob}%` : '0%';
}

/**
 * 标题跟着实际天数走。
 *
 * 原来这里写死「7 天」，而接口只回三天 —— 标题说的和下面列的不是一回事，
 * 读的人会以为数据缺了四天。接口给几天就写几天。
 */
const title = computed(() => `未来 ${days.value.length} 天`);

/**
 * 加载中。
 *
 * `locating` 一起算进来：定位是取数的前置（授权询问 + 一次往返），
 * 那段时间请求还没发出去，只看 weatherLoading 会把「还没取」当成「没有」。
 *
 * 有数据时刷新不算加载 —— 已有读数换成骨架，读的人会以为数据没了。
 */
const loading = computed(() => mapStore.locating || mapStore.weatherLoading);

/**
 * 骨架与实数据交叉淡入。
 *
 * 预报一到，骨架淡出、列表淡入，同一时刻发生 ——
 * 骨架立刻摘掉的话，中间会露出卡片底色，读起来像闪了一下。
 */
const { skeletonVisible } = useCrossFade({
  hasContent: () => days.value.length > 0,
  loading: () => loading.value,
});

/**
 * 骨架摆几行。
 *
 * 有一份旧预报就按那份的行数摆（刷新时正是这种情况），数据到了行数不变；
 * 什么都没有时按一周 7 行摆 —— 冷启动那一次无从得知行数。
 */
const skeletonRows = computed(() => mapStore.forecasts.length || 7);

/**
 * 空态与出错时说同一句话的不同版本。
 *
 * 出错时不说「暂无」：取不到不是没有。
 * 具体原因已经在 toast 里报过、也在结论头那块一直摆着，
 * 这里只说清「这一块没取到」，免得让人以为整页都废了。
 */
const emptyText = computed(() => {
  if (mapStore.weatherError) return '预报暂时取不到，刷新可重试';

  return mapStore.forecasts.length ? '预报数据不完整，刷新可重试' : '暂无预报数据，刷新可重试';
});
</script>

<style lang="scss" scoped>
.days {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;

  /* 空态时给一块高度，别让「取不到」那一句话孤零零贴在顶上 */
  min-height: 320rpx;

  @include fish-card;

  /* fish-card 的默认圆角是 radius-card，那一档留给方卡 */
  border-radius: $fish-radius-mid;
}

/*
 * 空态 / 出错时的排布。
 *
 * 面还是玻璃面 —— 这一档说的是「没有内容」，
 * 拿一张带渐变的卡装一句话，读起来像这张卡坏了。
 */
.days--empty {
  align-items: center;
  justify-content: center;
}

.days__empty {
  color: $fish-muted;
  @include fish-type(body);
}

.days__head {
  @include fish-card-head;
}

/* 标题。分区标题统一走 fish-card-title（跟其余卡片同一档） */
.days__title {
  @include fish-card-title;
}

/* 标题左侧的图标。底边贴着文字基线，像一个字那样站着 */
.days__head-left {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.days__title-icon {
  width: 32rpx;
  height: 32rpx;
}

/* 列表 */
.days__list {
  display: flex;
  flex-direction: column;
}

/*
 * 骨架与实数据叠在同一个格子里。
 *
 * grid 叠同一个单元：两态不占两份高度，也不退出文档流。
 * 读数轨道那一处也是这么做的（见 LineChart 的 line-chart__slot）。
 */
.days__stack {
  display: grid;
}

/* 实数据：数据一到就淡入落位 */
.days__content {
  grid-area: 1 / 1;
  @include fish-cross-in;
}

/*
 * 骨架。
 *
 * 内容到位后淡出，淡完再从 DOM 里摘 ——
 * 立刻摘的话，中间会露出卡片底色（见 composables/useCrossFade）。
 */
.days__skeleton-layer {
  grid-area: 1 / 1;
  opacity: 1;
  @include fish-cross-out;

  &--out {
    opacity: 0;
    pointer-events: none;
  }
}

/*
 * 一行。
 *
 * 每一行的高度写死（行盒）：温度条与数字都在同一条基线上，
 * 逐行扫下来才平。行高给的是「内容 + 上下留白」，
 * 不是内容本身 —— 图标 48rpx 高，行盒 76rpx，图标上下各留 14rpx。
 */
.days__row {
  display: flex;
  align-items: center;
  height: 76rpx;
}

/*
 * 行首的星期。
 *
 * 「今天」靠字重站出来，不靠颜色 —— 加了颜色就变成在提示，
 * 而它其实是状态，不是提醒（跟 HourlyWeather 的首格同一手法）。
 */
.days__label {
  width: 64rpx;
  flex-shrink: 0;
  color: $fish-ink;
  @include fish-type(caption);
}

.days__label--today {
  font-weight: 600;
}

/*
 * 天气图标。
 *
 * 是一张图，不是一行字：不吃字阶，尺寸用宽高给
 * （理由见 HourlyWeather 的 .hourly__icon）。
 */
.days__icon {
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  margin-right: 8rpx;
}

/*
 * 温度数字。最低温与最高温各占一格，宽度固定，两列才对得齐。
 *
 * 宽度是按**最宽的那个值**定的，不是按当前显示的值。
 * 显示的是整数（口径在 utils/weather 的 forecastDays），所以最宽的是负温：
 * 实测（body 档 32rpx，同一字体栈）加粗的「-12°」墨迹宽约 62rpx。
 * 固定宽度装不下就往左溢出，粗体最高温压到最低温上，两串数字糊成一团。
 * 这里留到 76rpx。
 */
.days__temp {
  width: 76rpx;
  flex-shrink: 0;
  text-align: right;
  white-space: nowrap;
  @include fish-type(body);
}

/* 最低温：灰一档，它是背景 */
.days__temp--min {
  color: $fish-muted;
  @include numeric(500);
}

/* 最高温：重一档，它才是要读的那个数 */
.days__temp--max {
  color: $fish-ink;
  @include numeric;
}

/*
 * 温度条。
 *
 * 轨道与截都在这一格里，格宽是弹性的（flex: 1）——
 * 前面几列宽度写死，条自然吃掉剩下的宽度，行末那一列宽度也就固定了。
 */
.days__bar {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 8rpx;
  margin: 0 20rpx;
}

/*
 * 轨道：这一段预报的全局量程。
 *
 * 浅填充压在玻璃面上，8rpx 这么细的浅色几乎看不见 ——
 * 所以轨道给足存在感（比截稍粗一点），否则「哪截更长」没有参照。
 */
.days__track {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 100%;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

/*
 * 截：当天 min→max 在量程上的位置。
 *
 * 底色用渐变（按绝对温度给色），颜色讲的是冷暖，
 * 长度与偏移讲的是哪天更暖 —— 一个形状说一件事，不叠加。
 */
.days__segment {
  position: absolute;
  top: 0;
  height: 100%;
  overflow: hidden;
  border-radius: $fish-radius-pill;

  /*
   * 温度条从左端展开。
   *
   * 只动 transform：条是绝对定位，改 width 也能做，
   * 但那是布局属性，七行一起动会带着兄弟节点重排。
   *
   * 逐行延迟走行内 animation-delay（见 segmentStyle），
   * 步长 12ms —— 与分钟降水的雨幕同一档。
   */
  transform-origin: left center;

  @if $fish-motion {
    animation: bar-grow $fish-dur-base $fish-ease-out both;
  }
}

/*
 * 温度条展开。
 *
 * 关键帧写在本组件里（分钟降水的雨幕也是这么做的），不进 App.vue ——
 * 全局那份只放跨组件复用的动画。
 */
@keyframes bar-grow {
  from {
    transform: scaleX(0);
  }

  to {
    transform: scaleX(1);
  }
}

/*
 * 截里的渐变层。
 *
 * 它与轨道等宽（用百分比换算），再往左挪一个偏移量 ——
 * 于是它露在截里的那一段，正好是全局渐变在当天温度区间里的那一段。
 * 同一温度在任何一天都是同一个颜色。
 */
.days__segment-fill {
  position: absolute;
  top: 0;
  height: 100%;
}

/*
 * 降水概率。右对齐：它是一列数字，右对齐才能竖着比大小。
 */
.days__prob {
  width: 64rpx;
  flex-shrink: 0;
  color: $fish-blue-600;
  @include fish-type(caption);

  text-align: right;
  font-variant-numeric: tabular-nums;
}

/*
 * 加载骨架。
 *
 * 每一块的尺寸照着上面真实元素的行盒摆。
 * 底色用 $fish-surface，呼吸幅度用 0.35 —— 跟 SkeletonCard、HourlyWeather、
 * WeatherCard 同一档，否则同一个页面里两种加载态一深一浅，
 * 像两套组件。
 */
.days__skeleton {
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.days__skeleton--title {
  width: 140rpx;
  height: 46rpx;
}

/* 星期 */
.days__skeleton--label {
  width: 48rpx;
  height: 28rpx;
  margin-right: 16rpx;
}

/* 图标。圆形：图标是个圆盘形的字形 */
.days__skeleton--icon {
  width: 48rpx;
  height: 48rpx;
  margin-right: 12rpx;
  border-radius: 50%;
}

/* 温度数字。宽度跟上面真实的一列一致 */
.days__skeleton--temp {
  width: 76rpx;
  height: 32rpx;
}

/* 温度条 */
.days__skeleton--bar {
  flex: 1;
  height: 8rpx;
  margin: 0 20rpx;
  border-radius: $fish-radius-pill;
}

/* 概率 */
.days__skeleton--prob {
  width: 48rpx;
  height: 28rpx;
}
</style>
