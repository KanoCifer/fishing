<template>
  <!--
    统计面板 —— 四个数：打卡天数、渔获天数、当前连续、最长连续。

    为什么把「打卡」和「渔获」分成两个数：它们是不同的事。
    打卡是「我去了」，哪怕空军也算；渔获是「我钓到了」。
    只给一个总数的话，连续三十天的人不知道自己其中有几天真有收获 ——
    那才是这个功能真正的产出。

    数字比标签大一号：这一屏扫的是数字，标签是注脚。
  -->
  <view class="stats">
    <view v-for="item in items" :key="item.key" class="stats__item">
      <text class="stats__value">{{ item.value }}</text>
      <text class="stats__label">{{ item.label }}</text>
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

import { RECORD_STATS } from '@/constants/record';
import type { FishingLogStats } from '@/types/record';

const props = defineProps<{
  stats: FishingLogStats | null;
}>();

const items = computed(() => [
  { key: 'checkin', value: props.stats?.checkin_days ?? 0, label: RECORD_STATS.checkinDays },
  { key: 'catch', value: props.stats?.catch_days ?? 0, label: RECORD_STATS.catchDays },
  { key: 'current', value: props.stats?.current_streak ?? 0, label: RECORD_STATS.currentStreak },
  { key: 'longest', value: props.stats?.longest_streak ?? 0, label: RECORD_STATS.longestStreak },
]);
</script>

<style lang="scss" scoped>
/*
 * 四个数平分一行。
 *
 * 不分两行两列：四个数要能一眼横扫着比较，分两行就得分两次看。
 * 每个格子等宽，数字右对齐还是居中？居中 —— 这一排是四个独立的数，
 * 不是一组需要对齐的表格。
 */
.stats {
  display: flex;
}

.stats__item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

/*
 * 数字。
 *
 * 用 title2（22pt）—— 比这一屏其它文字都大：它是这一屏的主角。
 * 不加粗到 700：这一屏已经有四个大数字了，再加粗就成了四块招牌。
 */
.stats__value {
  color: $fish-ink;
  @include fish-type(title2);
}

.stats__label {
  margin-top: 4rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);

  text-align: center;
}
</style>
