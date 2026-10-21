<template>
  <!--
    主体卡 —— 名字、距离、标签、地址、描述。

    它是唯一一张从照片底下「浮出来」的卡：上移压住头图下沿，
    层级靠「压」不靠「分」。所以这一张的圆角、阴影都比别的卡重一档 ——
    它是压在照片上的东西，不是平铺在页面底上的东西。
  -->
  <view class="head">
    <view class="head__top">
      <text class="head__name">{{ spot.name }}</text>
      <text class="head__dist">{{ distance }}</text>
    </view>

    <view class="head__meta">
      <Chip tone="accent">{{ kindLabel }}</Chip>
      <Chip>{{ feeLabel }}</Chip>
      <Chip v-for="tag in spot.tags" :key="tag">{{ tag }}</Chip>
    </view>

    <view v-if="spot.address" class="head__addr">
      <image class="head__pin" :src="pinIcon" mode="aspectFit" />
      <text class="head__addr-text">{{ spot.address }}</text>
    </view>

    <text v-if="spot.description" class="head__desc">{{ spot.description }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailHead —— 钓点详情页的主体卡。
 *
 * 只管渲染。文案换算（收费、距离）在 utils 里做完再传进来，
 * 组件里不出现任何「如果为空就怎么显示」的判断分支。
 */
import { computed } from 'vue';

import { icon } from '@/constants/icons';
import { FISHING_SPOT_KIND_LABELS, fishingSpotFeeLabel, type FishingSpot, type FishingSpotKind } from '@/types/fishing';

import Chip from '../Chip/Chip.vue';

const props = defineProps<{
  spot: FishingSpot;
  /** 距离展示文案（"12.1 km" / "距离未知"） */
  distance: string;
}>();

/** 地址前面的定位针 */
const pinIcon = icon('map-pin', 'muted');

/** 水体类型。缺这个字段时按未分类渲染（后端 omitempty 会整个省略它） */
const kindLabel = computed(() => FISHING_SPOT_KIND_LABELS[props.spot.kind as FishingSpotKind] ?? '未分类');

/** 收费。paid 时带金额 */
const feeLabel = computed(() => fishingSpotFeeLabel(props.spot.fee_type, props.spot.fee_amount));
</script>

<style lang="scss" scoped>
/*
 * 主体卡。
 *
 * 圆角用 $fish-radius-2xl（32pt），阴影用 $smooth-shadow-lg ——
 * 比页面里别的卡都重一档，因为它是唯一一张压在照片上的卡：
 * 「浮出来」这个感觉靠的就是它比周围高出一层。
 */
.head {
  padding: 40rpx 32rpx 36rpx;
  border-radius: $fish-radius-2xl;
  background-color: $fish-page;
  box-shadow: $smooth-shadow-lg;
}

/*
 * 名字 + 距离。
 *
 * align-items: flex-start 而不是 center：距离是个药丸，高度只有名字的一半，
 * 居中对齐的话它会浮在名字中间，读起来像夹在字里。
 */
.head__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
}

.head__name {
  flex: 1;
  min-width: 0;
  color: $fish-ink;
  @include fish-type(title1);
}

/*
 * 距离药丸。
 *
 * 底色用 $fish-fill（tertiarySystemFill）而不是描边 —— 它是参考信息，
 * 不该跟页面里那些卡片抢眼。
 */
.head__dist {
  flex-shrink: 0;
  height: 52rpx;
  padding: 0 22rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-fill;
  color: $fish-muted;
  @include fish-type(caption);

  font-weight: 600;
  line-height: 52rpx;
  white-space: nowrap;
}

/* 标签行。flex-wrap 让标签多了自动换行，而不是把卡片撑宽 */
.head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

/* 地址。图标是 13pt 的针，跟 13pt 的文字一个量级 */
.head__addr {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 24rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}

.head__pin {
  width: 26rpx;
  height: 26rpx;
  flex-shrink: 0;
}

.head__addr-text {
  flex: 1;
  min-width: 0;
}

/* 描述 */
.head__desc {
  display: block;
  margin-top: 24rpx;
  color: $fish-ink;
  @include fish-type(subhead);
}
</style>
