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
      <!--
        九条横条依次落位。这一组最吃入场动画：九行是拿来互相比较的，
        从上到下扫一遍就得出「谁在拉分」，一次全出现的话那一眼扫视没有落点。

        延迟在 enterDelay 里封了顶（第 9 项起不再累加），九条 × 60ms = 480ms，
        末条出现时前八条已经落定，不会出现「最后一行还在等」的空档。
      -->
      <view v-for="(tile, i) in tiles" :key="tile.key" class="features__row" :style="{ animationDelay: enterDelay(i) }">
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
 * 归一化在 types 里（types/fishing.ts 的 toFeatureTiles），这里只做展示：
 * 纵轴是 0~100 的相对水位而非原始值，量纲不同画在同一根轴上比大小没有意义。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import { toFeatureTiles } from '@/types/fishing';
import { enterDelay } from '@/utils/motion';

const mapStore = useFishingMapStore();

const tiles = computed(() => toFeatureTiles(mapStore.indexData?.feature_breakdown));

const loading = computed(() => mapStore.indexLoading);

const emptyText = computed(() => (loading.value ? '加载中…' : '暂无指数构成数据'));
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.features {
  @include fish-card;
}

.features__head {
  @include fish-card-head;
}

/* 分区标题统一走 headline 一级（见 DayForecast 同名注释） */
.features__title {
  @include fish-card-title;
}

.features__meta {
  @include fish-card-meta;
}

.features__row {
  display: flex;
  align-items: center;
  height: 52rpx;
  @include fish-enter;
}

.features__label {
  width: 72rpx;
  flex-shrink: 0;
  color: $fish-muted;
  @include fish-type(subhead);
}

/* 轨道用次级填充，卡片浮在上面 —— 12rpx ≈ 6pt 的条在这个信息密度下刚好 */
.features__track {
  flex: 1;
  height: 12rpx;
  overflow: hidden;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

.features__fill {
  height: 100%;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent;
  transition: width $fish-dur-base $fish-ease-out;
}

/* 满格的那项单独上色：它是当前最主导的因素，值得从九条里跳出来 */
.features__fill--top {
  background-color: $fish-success;
}

.features__value {
  width: 88rpx;
  flex-shrink: 0;
  color: $fish-ink;
  @include fish-type(subhead);

  font-variant-numeric: tabular-nums;
  text-align: right;
}

.features__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted;
  @include fish-type(subhead);

  text-align: center;
}
</style>
