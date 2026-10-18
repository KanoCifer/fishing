<template>
  <view class="features">
    <view class="features__head">
      <text class="features__title">钓鱼指数构成</text>
      <text class="features__meta">{{ tiles.length }} 项 · 相对水位</text>
    </view>

    <!--
      九条横条而不是一张折线。
      九项子特征量纲不一（气温 20、湿度 80），归一化成相对水位之后要解决的是
      「谁在拉分、谁在拖分」——横条能一眼比长短，折线只会把九个不相干的点连成
      一条没有含义的起伏。
    -->
    <view v-if="tiles.length" class="features__list">
      <view v-for="tile in tiles" :key="tile.key" class="features__row">
        <text class="features__label">{{ tile.label }}</text>
        <view class="features__track">
          <view
            class="features__fill"
            :class="{ 'features__fill--top': tile.percent === 100 }"
            :style="`width:${tile.percent}%`"
          />
        </view>
        <text class="features__value">{{ tile.percent }}%</text>
      </view>
    </view>

    <text v-else class="features__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * FeatureBreakdown —— 九项子特征对钓鱼指数的贡献。
 *
 * 与 FeatureDetailPanel 用的是同一份归一化结果（types/fishing.ts 的
 * toFeatureTiles），不另算一遍：两处各算一次迟早会出现「面板改了、这里没改」。
 * 纵轴是 0~100 的相对水位而非原始值，量纲不同画在同一根轴上比大小没有意义。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/composables/useFishingMapStore';
import { toFeatureTiles } from '@/types/fishing';

const { state } = useFishingMapStore();

const tiles = computed(() => toFeatureTiles(state.indexData?.feature_breakdown));

const loading = computed(() => state.indexLoading);

const emptyText = computed(() => (loading.value ? '加载中…' : '暂无指数构成数据'));
</script>

<style lang="scss" scoped>
.features__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.features__title {
  color: $fish-ink;
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: -1rpx;
}

.features__meta {
  color: $fish-muted-60;
  font-size: 22rpx;
}

.features__row {
  display: flex;
  align-items: center;
  height: 52rpx;
}

.features__label {
  width: 68rpx;
  flex-shrink: 0;
  color: $fish-muted;
  font-size: 24rpx;
}

.features__track {
  flex: 1;
  height: 12rpx;
  border-radius: 999rpx;
  overflow: hidden;
  background-color: $fish-surface;
}

.features__fill {
  height: 100%;
  border-radius: 999rpx;
  background-color: $fish-accent;
  transition: width 200ms ease-out;
}

/* 满格的那项单独上色：它是当前最主导的因素，值得从九条里跳出来 */
.features__fill--top {
  background-color: $fish-success;
}

.features__value {
  width: 88rpx;
  flex-shrink: 0;
  color: $fish-ink;
  font-size: 24rpx;
  font-weight: 500;
  text-align: right;
}

.features__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted-60;
  font-size: 26rpx;
  text-align: center;
}
</style>
