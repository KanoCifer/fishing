<template>
  <view class="days" :class="{ 'days--empty': !days.length && !loading }">
    <view class="days__head">
      <text v-if="days.length" class="days__title">{{ title }}</text>

      <!--
        加载中：标题的位置先占住。

        数据到了标题才冒出来。位置一占住，下面那三列就不会整体往下跳 ——
        骨架摆得再准，标题晚来一步，这一行照样会散架。
      -->
      <view v-else-if="loading" class="days__skeleton days__skeleton--title" />
    </view>

    <!--
      三天横排。

      每一列是**一整天**：日期、天气、降水概率、温度区间。
      横排的理由不是「省地方」，是**要横着比** ——
      挑日子比的是「哪天更暖、哪天更稳」，把三天摆成三列，
      视线横着扫一遍就能比出来；竖着排成三行时，每次都得跨过别的行去对照。
    -->
    <view v-if="days.length" class="days__cols">
      <view v-for="(day, i) in days" :key="day.fxDate" class="days__col">
        <view class="days__label-row">
          <text class="days__label" :class="{ 'days__label--today': i === 0 }">{{ dayLabel(day.fxDate, i) }}</text>
        </view>

        <view class="days__weather">
          <!--
            白天天气。图标是这一列除了温度之外的第二个信息：
            「33° / 25°」说的是热不热，图标说的是出不出门 ——
            决定要不要出钓的往往是后者，不是前者。
            这里只取白天时段：钓鱼是白天的活（数据层的湿度/降水也是以白天段为准），
            夜间天气另有一格会挤掉这一列的可比性。
          -->
          <text v-if="qweatherFontReady" :class="['days__icon', weatherIconClass(day.icon)]" />
          <view v-else class="days__icon days__icon--pending" />
        </view>

        <view class="days__prob-row">
          <!--
            降水概率。贴着图标放：它说的是这张图标有多大概率成真，
            跟温度不在一件事上，挤到温度那两行里会被读成第三个温度。

            整行保留高度（概率为 0 时是空行）：三列的尺子要上下对齐，
            少一行文字三把尺子就错开了，那把尺子就白画了。
          -->
          <text v-if="day.probText" class="days__prob">{{ day.probText }}</text>
        </view>

        <!--
          温度区间条。**三列共用一把尺子**（尺子本体见 .days__scale）。

          每列的深色段画的是那天 min→max 在这把尺子上的位置：
          段的上沿是当天的最高温，下沿是最低温。
          三列用的是同一套换算（全局最低到全局最高），
          所以段的高下直接就是「哪天更暖」—— 不用去比数字，
          尺子本身就是答案。

          最高温贴在段的上沿、最低温贴在段的下沿：
          数字和它标的那个端点挨在一起，中间不隔东西。
        -->
        <view class="days__plot">
          <view class="days__scale">
            <view class="days__rail" />
            <view class="days__band" :style="bandStyle(day)" />
            <view class="days__max" :style="maxStyle(day)">
              <text class="days__max-num">{{ day.max }}°</text>
            </view>
            <view class="days__min" :style="minStyle(day)">
              <text class="days__min-num">{{ day.min }}°</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!--
      加载中：三列骨架。

      骨架照着最终形状摆，行盒高度与真实内容一致（.days__label-row /
      .days__weather / .days__prob-row / .days__plot 都是同一套类），
      所以数据到了版式不换，下面那一段不会跳。

      列数按三天摆：接口就回三天，脏行被丢掉是少见的例外。
    -->
    <view v-else-if="loading" class="days__cols">
      <view v-for="i in 3" :key="i" class="days__col">
        <view class="days__label-row">
          <view class="days__skeleton days__skeleton--label" />
        </view>
        <view class="days__weather">
          <view class="days__skeleton days__skeleton--icon" />
        </view>
        <view class="days__prob-row">
          <view class="days__skeleton days__skeleton--prob" />
        </view>
        <view class="days__plot">
          <view class="days__skeleton days__skeleton--rail" />
          <view class="days__skeleton days__skeleton--band" />
          <view class="days__skeleton days__skeleton--max" />
          <view class="days__skeleton days__skeleton--min" />
        </view>
      </view>
    </view>

    <text v-else class="days__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { qweatherFontReady } from '@/composables/useQweatherFont';
import { useFishingMapStore } from '@/stores/fishingMap';
import { shortDate } from '@/utils/date';
import type { ForecastDay } from '@/utils/weather';
import { forecastDays, weatherIconClass } from '@/utils/weather';

const mapStore = useFishingMapStore();

/**
 * 有效的预报日。
 *
 * 挑出高低温都有值的日，脏数据整条丢掉，不占一列 —— 口径在 utils/weather，
 * 与 CurrentWeather 取「今天」用的是同一份，两张卡不会对今天各说各话。
 */
const days = computed(() => forecastDays(mapStore.forecasts));

/**
 * 三天共用的温度刻度。
 *
 * 全局最低到全局最高，三列用同一套换算 —— 这正是「可比较」的前提：
 * 每列各画各的尺子的话，三段深色的高下就只是三段各说各话。
 *
 * 跨度为 0（三天温度一模一样）时按 1 算：分母不能是 0，
 * 而这种情况下三段本来就在同一个位置，比不比都一样。
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
 * 某个温度在这把尺子上的位置：0 是全局最高，1 是全局最低。
 *
 * 刻度是倒的 —— 上暖下凉，跟天气卡的直觉一致。
 */
function position(temp: number): number {
  const s = scale.value;
  if (!s) return 0;

  return (s.hi - temp) / s.span;
}

/** 深色段：上沿在最高温，下沿在最低温。 */
function bandStyle(day: ForecastDay): string {
  const top = position(day.max);
  const bottom = position(day.min);

  return `top:${(top * 100).toFixed(2)}%;height:${((bottom - top) * 100).toFixed(2)}%`;
}

/** 最高温数字：底边对齐段的上沿。 */
function maxStyle(day: ForecastDay): string {
  return `bottom:${((1 - position(day.max)) * 100).toFixed(2)}%`;
}

/** 最低温数字：顶边对齐段的下沿。 */
function minStyle(day: ForecastDay): string {
  return `top:${(position(day.min) * 100).toFixed(2)}%`;
}

/**
 * 行首的日期。
 *
 * 「今天」认的是**留下来的第一行**，不是接口的第一条 ——
 * 头一天要是脏数据（缺高低温）整条被丢掉，剩下的第一行才是今天。
 * 所以这个判断按行在列表里的位置算，不按它在接口里的位置。
 */
function dayLabel(fxDate: string, index: number): string {
  return index === 0 ? '今天' : shortDate(fxDate);
}

/**
 * 标题跟着实际天数走。
 *
 * 原来这里写死「7 天」，而接口只回三天 —— 标题说的和下面列的不是一回事，
 * 读的人会以为数据缺了四天。
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
  min-height: 464rpx;

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

/* 三列 */
.days__cols {
  display: flex;
}

/*
 * 一列。
 *
 * 每一列内部从上到下：日期、天气图标、降水概率、温度尺。
 * 这几行的高度写死（行盒），三列才对得齐 ——
 * 尺子错开一列，「共用一把尺」这件事就没了。
 */
.days__col {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/*
 * 列间的发丝线。
 *
 * 层次靠面不靠描边，但列与列之间那一道例外 —— 它是分隔，不是边框。
 *
 * 用背景渐变而不是 border-left：border 会把这一列的内容框挤窄 1rpx，
 * 居中的尺子跟着偏半格，三列就不在同一个中心线上了。
 */
.days__col + .days__col {
  background-image: linear-gradient(90deg, $fish-border-40 0, $fish-border-40 1rpx, transparent 1rpx);
}

/* 日期行。行盒定高，三列的图标与尺子才对得齐 */
.days__label-row {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30rpx;
}

/* 日期列 */
.days__label {
  color: $fish-ink;
  @include fish-type(caption);
}

/*
 * 「今天」靠字重站出来，不靠颜色 —— 加了颜色就变成在提示，
 * 而它其实是状态，不是提醒（跟 HourlyWeather 的首格同一手法）。
 */
.days__label--today {
  font-weight: 600;
}

/* 天气图标行。行盒定高 = 图标字形的高度 */
.days__weather {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36rpx;
  margin-top: 8rpx;
}

/*
 * 天气图标。
 *
 * 字形不走字阶：和风图标是字体字形，没有「字重 / 字距 / 行高」的排版语义
 * （理由见 HourlyWeather 的 .hourly__icon）。
 *
 * 压成辅助灰：卡面是中性玻璃面，图标没有自己的面撑着，
 * 深色字形会跟下面的温度抢 —— 温度才是这一列的读数。
 */
.days__icon {
  width: 36rpx;
  flex-shrink: 0;
  color: $fish-muted;
  font-size: 36rpx;
  line-height: 1;
}

/* 字体没到位时的占位。尺寸对齐上面的字形盒 */
.days__icon--pending {
  width: 36rpx;
  height: 36rpx;
}

/* 降水概率行。行盒定高：概率为 0 的是空行，尺子照样对齐 */
.days__prob-row {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30rpx;
  margin-top: 6rpx;
}

/*
 * 降水概率。
 *
 * 用文字档的蓝（$fish-blue-600）而不是填充档的 $fish-tide：
 * $fish-tide 是给填充用的（逐时那根概率条），当文字读只有 4.0:1，压不住。
 */
.days__prob {
  color: $fish-blue-600;
  @include fish-type(caption);

  font-variant-numeric: tabular-nums;
}

/*
 * 温度尺区。
 *
 * 高度是三列共用的：尺子本体 + 上下两段余量。
 * 上下的余量是给数字留的（最高温 / 最低温各自贴着一个端点）——
 * 不给数字留地方，端点贴近尺子边缘那天就会被裁掉半个数字。
 */
.days__plot {
  position: relative;
  width: 100%;
  height: 216rpx;
  margin-top: 16rpx;
}

/*
 * 尺子本体。
 *
 * 三列的尺子一样长、一样高、上下端点一样平：
 * 尺子一样，段的高下才是在比温度，而不是在比画法。
 */
.days__scale {
  position: absolute;
  top: 52rpx;
  right: 0;
  left: 0;
  height: 120rpx;
}

/*
 * 尺身。
 *
 * 一根浅色的管子，从全局最高画到全局最低 ——
 * 三列各有自己的一根，但它们是同一把尺子上的同一段：
 * 没有这根管子，深色段读作三根漂浮的短棒，
 * 「哪段更高」就没有共同的参照可看。
 *
 * 粗细跟深色段一样宽（同 AstroCard 的轨道/段关系）：
 * 管子和段一样宽时，深段正好盖住管子，
 * 露出来的那两截浅色就是尺子上「不属于这一天的部分」——
 * 一眼能看出三段有多高差。管子画细了则完全露不出来
 * （浅填充压在玻璃面上，6rpx 的细线等于没有）。
 */
.days__rail {
  position: absolute;
  top: 0;
  left: 50%;
  width: 12rpx;
  height: 100%;
  margin-left: -6rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

/*
 * 深色段：那天 min→max 在尺子上的位置。
 *
 * 底色用中性填充 $fish-surface，深色段压在上面 ——
 * 这张卡上「深的那段就是当天」已经够读，
 * 再给温度加一层颜色，就是让颜色讲第二件事。
 */
.days__band {
  position: absolute;
  left: 50%;
  width: 12rpx;
  min-height: 6rpx;
  margin-left: -6rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-ink;
}

/*
 * 最高温。
 *
 * 底边对齐段的上沿（margin-bottom 把它从端点抬开一点），
 * 所以这个数字标的就是段的上端，不是「附近」。
 */
.days__max {
  position: absolute;
  right: 0;
  left: 0;
  margin-bottom: 6rpx;
  text-align: center;
}

/* 数字 */
.days__max-num {
  color: $fish-ink;
  @include fish-type(body);

  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/*
 * 最低温。
 *
 * 顶边对齐段的下沿。它比最高温小一档、灰一档：
 * 最高温才是「哪天更暖」要读的那个数，最低温是背景。
 */
.days__min {
  position: absolute;
  right: 0;
  left: 0;
  margin-top: 6rpx;
  text-align: center;
}

/* 数字 */
.days__min-num {
  color: $fish-muted;
  @include fish-type(caption);

  font-variant-numeric: tabular-nums;
}

/*
 * 加载骨架。
 *
 * 每一块的尺寸照着上面真实元素的行盒摆：
 * 日期 30rpx 行盒、图标 36rpx、概率 30rpx、尺身 120rpx 加上下各一段余量。
 * 底色用 $fish-surface，呼吸幅度用 0.35 —— 跟 SkeletonCard、HourlyWeather、
 * CurrentWeather、VerdictOverview 同一档，否则同一个页面里两种加载态一深一浅，
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

/* 日期 */
.days__skeleton--label {
  width: 56rpx;
  height: 28rpx;
}

/* 图标。圆形：和风图标是个圆盘形的字形 */
.days__skeleton--icon {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
}

/* 概率 */
.days__skeleton--prob {
  width: 44rpx;
  height: 28rpx;
}

/* 尺身。跟真实的 .days__rail 一样粗、一样长 */
.days__skeleton--rail {
  position: absolute;
  top: 52rpx;
  left: 50%;
  width: 12rpx;
  height: 120rpx;
  margin-left: -6rpx;
  border-radius: $fish-radius-pill;
}

/* 深色段。摆在尺子中段：真实位置要等数据 */
.days__skeleton--band {
  position: absolute;
  top: 100rpx;
  left: 50%;
  width: 12rpx;
  height: 48rpx;
  margin-left: -6rpx;
  border-radius: $fish-radius-pill;
}

/*
 * 最高温。
 *
 * 摆的是数字盒子的位置，不是它底边的位置：
 * 真实数字的**底边**贴住尺子上沿（52rpx），
 * 盒子本身有 42rpx 高，所以顶边在 10rpx。
 * 骨架贴错边，数据到了数字就会往下掉一截。
 */
.days__skeleton--max {
  position: absolute;
  top: 10rpx;
  left: 50%;
  width: 56rpx;
  height: 42rpx;
  margin-left: -28rpx;
}

/*
 * 最低温。
 *
 * 顶边贴在尺子下沿之下 6rpx（最低温那天的位置是尺底）：
 * 尺底在 172rpx，加 6rpx 的让位 = 178rpx。
 */
.days__skeleton--min {
  position: absolute;
  top: 178rpx;
  left: 50%;
  width: 48rpx;
  height: 31rpx;
  margin-left: -24rpx;
}
</style>
