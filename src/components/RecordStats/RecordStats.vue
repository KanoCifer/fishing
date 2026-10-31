<template>
  <view class="stats">
    <view class="stats__lead">
      <text class="stats__eyebrow">{{ lead.label }}</text>

      <!--
        环。分母是最长连续：环长画的是「现在离自己的最好成绩有多远」。

        环心的数字放在 DOM 里（RecordRing 的 slot）——
        canvas 里画字只能用硬编码色值与 px 字号，跟令牌层对不上。
      -->
      <RecordRing :value="lead.value" :max="longest" :size="152" :stroke="8">
        <view class="stats__ringmid">
          <text class="stats__num">{{ lead.value }}</text>
          <text class="stats__unit">{{ unit }}</text>
        </view>
      </RecordRing>
    </view>

    <view class="stats__rest">
      <view v-for="item in items" :key="item.key" class="stats__item">
        <text class="stats__value">{{ item.value }}</text>
        <text class="stats__label">{{ item.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 统计面板。
 *
 * 受控组件：数字由外面给。连续天数与总天数是跨月的量，
 * 服务端算好（见 api/record.ts 的 stats），组件不参与计算。
 */
import { computed } from 'vue';

import RecordRing from '@/components/RecordRing/RecordRing.vue';
import { RECORD_DAY_UNIT, RECORD_STATS } from '@/constants/record';
import type { FishingLogStats } from '@/types/record';

const props = defineProps<{
  stats: FishingLogStats | null;
}>();

/** 单位。数字与单位分开摆 —— 单位跟着数字大一号会压过数字本身 */
const unit = RECORD_DAY_UNIT;

/** 主角：当前连续 */
const lead = computed(() => ({
  label: RECORD_STATS.currentStreak,
  value: props.stats?.current_streak ?? 0,
}));

/** 环的分母：历史最长连续。没比过就没有比，环画成空环 */
const longest = computed(() => props.stats?.longest_streak ?? 0);

/** 配角：三个平级的数 */
const items = computed(() => [
  { key: 'checkin', value: props.stats?.checkin_days ?? 0, label: RECORD_STATS.checkin },
  { key: 'catch', value: props.stats?.catch_days ?? 0, label: RECORD_STATS.catch },
  { key: 'longest', value: props.stats?.longest_streak ?? 0, label: RECORD_STATS.longest },
]);
</script>

<style lang="scss" scoped>
.stats {
  display: flex;
  align-items: center;
}

/* 主角：眉标 + 环 */
.stats__lead {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

/*
 * 眉标。当前连续是这一块的结论，先给它名字，再给数。
 *
 * caption2 是全页最低的一档：它是数字的注脚，不是小标题。
 */
.stats__eyebrow {
  margin-bottom: 16rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* 环心的数字与单位并排 */
.stats__ringmid {
  display: flex;
  align-items: baseline;
}

/*
 * 主角的数字。
 *
 * title1（28pt / 700）—— 比三个配角大一号，这一块扫的是它。
 * 这一档比头图的地点名（title2）还大一档：主角方案就是让这一块
 * 自己成为主角，头图那一行压在照片上，靠材质仍然更重。
 *
 * 等宽数字：位数变化时整块环心的宽度会跳。
 */
.stats__num {
  color: $fish-ink;
  @include fish-type(title1);

  font-variant-numeric: tabular-nums;
}

/* 单位。跟在小数后面，不跟主角同一档 —— 单位是注脚 */
.stats__unit {
  margin-left: 6rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);

  line-height: 1;
}

/* 三个配角 */
.stats__rest {
  display: flex;
  flex: 1;
  min-width: 0;
}

/*
 * 每一格等宽，数字居中。
 *
 * 居中而不右对齐：这一排是三个独立的数，不是一组需要对齐的表格。
 */
.stats__item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.stats__value {
  color: $fish-ink;
  @include fish-type(title3);

  font-variant-numeric: tabular-nums;
}

/* 配角的标签 */
.stats__label {
  margin-top: 4rpx;
  color: $fish-muted-60;
  @include fish-type(caption);

  text-align: center;
}
</style>
