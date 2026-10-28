<template>
  <view class="features">
    <!--
      九条横条而不是一张折线。
      九项子特征量纲不一（气温 20、湿度 80），归一化成相对水位之后要解决的是
      「谁在拉分、谁在拖分」——横条能一眼比长短，折线只会把九个不相干的点连成
      一条没有含义的起伏。
    -->
    <view v-if="tiles.length" class="features__list">
      <!--
        行与行之间没有逐条落位。

        原来它在页面上是一张卡，九条横条依次落位（enterDelay 逐条错开）：
        那一组最吃入场动画，九行是拿来互相比较的，一次全出现的话那一眼扫视没有落点。

        现在它在浮层里 —— 浮层的内容由 SnapSheet 统一落位（fish-enter-sheet，
        延迟 240ms 起）。这一层再自己逐条淡入，就是两层动画叠在一起：
        面板还在路上内容就开始落位，读起来像面板是空的。
      -->
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
 * 归一化在 types 里（types/fishing.ts 的 toFeatureTiles），这里只做展示：
 * 纵轴是 0~100 的相对水位而非原始值，量纲不同画在同一根轴上比大小没有意义。
 *
 * 它现在住在浮层里（见 FeatureBreakdownSheet），所以这一层是**内容**，
 * 不带卡片外壳、也不带标题 —— 浮层的标题区归浮层自己（见 design-system 的
 * 「手势与浮层」一节）。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import { toFeatureTiles } from '@/types/fishing';

const mapStore = useFishingMapStore();

const tiles = computed(() => toFeatureTiles(mapStore.indexData?.feature_breakdown));

const loading = computed(() => mapStore.indexLoading);

const emptyText = computed(() => (loading.value ? '加载中…' : '暂无指数构成数据'));
</script>

<style lang="scss" scoped>
.features__row {
  display: flex;
  align-items: center;
  height: 52rpx;
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
