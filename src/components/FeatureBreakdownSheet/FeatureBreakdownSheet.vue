<template>
  <SnapSheet :open="open" :snap-points="SNAP_POINTS" :initial-snap="0" @close="emit('close')">
    <template #header>
      <view class="breakdown__head">
        <text class="breakdown__title">鱼口概率构成</text>
        <text class="breakdown__meta">{{ tileCount }} 项 · 相对水位</text>
      </view>
    </template>

    <view class="breakdown__content">
      <FeatureBreakdown />
    </view>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * 鱼口概率构成 —— 浮层。
 *
 * 构成图原来是一张卡，摊在数据页的鱼口概率分区里。挪到这里是因为：
 * 九条横条是一份「为什么」的说明，摊在页面上会跟结论抢位置；
 * 而「今日鱼口概率」这个分数才是结论 —— 点分数才看构成，是一条自然的路。
 *
 * 标题区归这个浮层（SnapSheet 只提供容器），内容归 FeatureBreakdown。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import { toFeatureTiles } from '@/types/fishing';

import FeatureBreakdown from '../FeatureBreakdown/FeatureBreakdown.vue';
import SnapSheet from '../SnapSheet/SnapSheet.vue';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{ close: [] }>();

/**
 * 两档高度。
 *
 * 矮的那档放得下九条（九条 × 52rpx + 头部），高的那档留给以后加项 ——
 * 加到第十条时不用改组件。
 */
const SNAP_POINTS = [50, 85];

const mapStore = useFishingMapStore();

/**
 * 头部那句「N 项」。
 *
 * 与 FeatureBreakdown 取的是同一份数据、同一个归一化函数（toFeatureTiles），
 * 两边各调一次是同一件事算两遍，但省掉一条把条数往外传的口子。
 */
const tileCount = computed(() => toFeatureTiles(mapStore.indexData?.feature_breakdown).length);
</script>

<style lang="scss" scoped>
/*
 * 头部：标题在左、注解在右，与卡片头（fish-card-head）是同一套版式。
 *
 * 面板两侧的留白是 40rpx —— 与把手那一条对齐（见 SnapSheet 的 .snap-sheet__handle）。
 */
.breakdown__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 40rpx 20rpx;
}

.breakdown__title {
  color: $fish-ink;
  @include fish-type(title3);
}

.breakdown__meta {
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 内容区 */
.breakdown__content {
  padding: 0 40rpx 40rpx;
}
</style>
