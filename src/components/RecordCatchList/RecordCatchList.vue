<template>
  <!--
    渔获清单 —— 一条记录里钓到了什么。

    「鲫鱼 ×3」这样一行一行摆着，不折成一句话（「鲫鱼3条、草鱼1条」）：
    一行一个鱼种，扫一眼就知道有几种、每种几条，
    而一句话得从头读到尾才知道断在哪。
  -->
  <view class="catch-list">
    <view v-for="(item, index) in catches" :key="index" class="catch-list__item">
      <text class="catch-list__species">{{ item.species }}</text>
      <text class="catch-list__quantity">×{{ item.quantity }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 渔获清单展示。
 *
 * 只管排版，不做任何计算 —— 「钓到几种鱼」这种统计是别处的事。
 */
import type { FishingLogCatch } from '@/types/record';

defineProps<{
  catches: FishingLogCatch[];
}>();
</script>

<style lang="scss" scoped>
/*
 * 横向排布，不换行。
 *
 * 一次出行通常就一两种鱼，换行会让这一行的高度飘 —— 而它是在一条
 * 列表行里，行高飘了整张列表就散了。
 */
.catch-list {
  display: flex;
  flex-wrap: wrap;
}

.catch-list__item {
  display: flex;
  align-items: baseline;
  margin-right: 20rpx;
}

.catch-list__species {
  color: $fish-ink;
  @include fish-type(callout);
}

.catch-list__quantity {
  margin-left: 4rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}
</style>
