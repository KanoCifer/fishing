<template>
  <!--
    今日钓况 —— 四格网格。

    四格是「此刻这个钓点的天气与水情」：气压、风力、气温、潮汐。
    右上角挂一枚适宜度徽标，把这四项收成一句话。

    2×2 用 flex + 50% 宽而不是 CSS grid：老基础库不认 grid，
    只有 flex 是底线保证。发丝线画在格子的边上，奇数格画右边、
    前两格画下边 —— 十字正好落在四格中间。
  -->
  <view class="conditions">
    <view class="conditions__title">
      <text class="conditions__title-text">今日钓况</text>
      <Chip :tone="tone">{{ toneText }}</Chip>
    </view>

    <view class="conditions__grid">
      <view v-for="cell in cells" :key="cell.key" class="conditions__cell">
        <text class="conditions__label">{{ cell.label }}</text>

        <view class="conditions__value">
          <text class="conditions__number">{{ cell.value }}</text>
          <text v-if="cell.unit" class="conditions__unit">{{ cell.unit }}</text>
        </view>

        <text class="conditions__status">{{ cell.status }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailConditions —— 今日钓况四格。
 *
 * 组件只管渲染。数值从哪来、「偏热 / 可接受」这类评价怎么算，
 * 全在 utils/spot-conditions 里做完再传进来 ——
 * 同一份数据在数据页和详情页说的话必须一样。
 */
import { computed } from 'vue';

import { suitabilityText, suitabilityTone, type SpotConditionCell } from '../../spot-conditions';

import Chip from '@/components/Chip/Chip.vue';

const props = defineProps<{
  /** 四格。顺序即展示顺序 */
  cells: SpotConditionCell[];
  /** 钓鱼等级。徽标的文案与色调都从它来 */
  level?: string;
}>();

/** 徽标文案：「很适宜 / 较适宜 / 一般 / 不宜 / 空军」 */
const toneText = computed(() => suitabilityText(props.level));

/** 徽标色调档位 */
const tone = computed(() => suitabilityTone(props.level));
</script>

<style lang="scss" scoped>
/* 分区。标题上方的留白是 $fish-space-sectitle —— 「另起一段」的那一截 */
.conditions {
  margin-top: $fish-space-sectitle;
}

.conditions__title {
  @include fish-card-head;
}

.conditions__title-text {
  @include fish-card-title;
}

/*
 * 四格网格。
 *
 * flex + 50% 宽。发丝线画在格子的边上：奇数格画右边、前两格画下边，
 * 十字正好落在四格中间。
 */
.conditions__grid {
  display: flex;
  flex-wrap: wrap;
  overflow: hidden;
  border-radius: $fish-radius-2xl;
  background-color: $fish-page;
  box-shadow: $smooth-shadow-md;
}

.conditions__cell {
  box-sizing: border-box;
  width: 50%;
  padding: 28rpx 32rpx 32rpx;
}

/* 奇数格是左边那一列，画右边线 */
.conditions__cell:nth-child(odd) {
  border-right: 1rpx solid $fish-border-40;
}

/* 上排两格画下边线。写成两个 nth-child 而不是 -n+2 —— 旧解析器认不了负数形式 */
.conditions__cell:nth-child(1),
.conditions__cell:nth-child(2) {
  border-bottom: 1rpx solid $fish-border-40;
}

.conditions__label {
  display: block;
  color: $fish-muted;
  @include fish-type(caption);

  line-height: 1;
}

/*
 * 主数值 + 单位。
 *
 * baseline 对齐：单位比数值小一号，两者的**基线**对齐才是
 * 「1006 hPa」而不是「1006 悬着个 hPa」。
 */
.conditions__value {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
  margin-top: 16rpx;
  color: $fish-ink;
  @include fish-type(title1);
}

.conditions__number {
  font-variant-numeric: tabular-nums;
}

/* 单位要把大数值的字重和字距压回去 —— 否则 "hPa" 会跟数字一样重 */
.conditions__unit {
  color: $fish-muted;
  @include fish-type(caption);

  font-weight: 500;
  letter-spacing: 0;
}

.conditions__status {
  display: block;
  margin-top: 14rpx;
  color: $fish-muted;
  @include fish-type(caption);
}
</style>
