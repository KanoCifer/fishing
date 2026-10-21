<template>
  <!--
    钓点信息 —— inset-grouped 列表。

    分组卡而不是一整块白：每一行是「标签 / 值」的对，
    标签靠左 muted、值靠右墨色，读的时候眼睛从左扫到右，
    一行扫完就知道这个钓点在这一项上是什么情况。

    属主单独一行、头像 + 名字 + 浏览量 —— 它不是字段，是「这条信息是谁提供的」，
    跟上面那几项不在一个层级上。
  -->
  <view class="info">
    <text class="info__title">钓点信息</text>

    <view class="info__group">
      <view class="info__row">
        <text class="info__label">道路情况</text>
        <text class="info__value">{{ roadLabel }}</text>
      </view>

      <view class="info__row">
        <text class="info__label">车到水边</text>
        <text class="info__value">{{ carLabel }}</text>
      </view>

      <view class="info__row">
        <text class="info__label">开放时间</text>
        <text class="info__value">{{ spot.opening_hours || '未知' }}</text>
      </view>

      <view class="info__row">
        <text class="info__label">适合钓法</text>
        <text class="info__value">{{ suitableText }}</text>
      </view>

      <view class="info__owner">
        <image v-if="avatarSrc" class="info__avatar-image" :src="avatarSrc" mode="aspectFill" />
        <text v-else class="info__avatar">{{ ownerInitial }}</text>

        <text class="info__owner-name">{{ ownerName }}</text>
        <text class="info__view">{{ viewText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailInfo —— 钓点信息分组列表。
 *
 * 只管渲染。枚举 → 中文在 utils/types 里换算完再传进来。
 */
import { computed } from 'vue';

import { fishingSpotCarLabel, fishingSpotRoadLabel, type FishingSpot } from '@/types/fishing';

const props = defineProps<{
  spot: FishingSpot;
}>();

/** 道路情况 */
const roadLabel = computed(() => fishingSpotRoadLabel(props.spot.road_condition));

/** 能否车到水边 */
const carLabel = computed(() => fishingSpotCarLabel(props.spot.car_access));

/** 适合的钓法。一项都没有时给个横杠，而不是留一行空白 */
const suitableText = computed(() => {
  const list = props.spot.suitable_for ?? [];
  return list.length ? list.join(' · ') : '—';
});

/** 属主名。没有属主时是「未署名」 */
const ownerName = computed(() => props.spot.owner?.name || '未署名');

/** 头像。有 URL 就用图，没有就拿名字的第一个字凑一个 */
const avatarSrc = computed(() => props.spot.owner?.avatar || '');

const ownerInitial = computed(() => (props.spot.owner?.name || '?').slice(0, 1));

/** 浏览量 */
const viewText = computed(() => `${(props.spot.view_count ?? 0).toLocaleString('en-US')} 次浏览`);
</script>

<style lang="scss" scoped>
/* 分区。标题上方的留白是 $fish-space-sectitle */
.info {
  margin-top: $fish-space-sectitle;
}

.info__title {
  display: block;
  margin-bottom: 20rpx;
  color: $fish-ink;
  @include fish-type(headline);
}

/*
 * 分组卡。
 *
 * inset-grouped 的结构：白卡浮在灰底上，靠**面**分层，
 * 行与行之间是一道发丝线而不是描边 —— 1rpx，不是 2rpx。
 */
.info__group {
  overflow: hidden;
  border-radius: $fish-radius-2xl;
  background-color: $fish-page;
  box-shadow: $smooth-shadow-md;
}

.info__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 26rpx 32rpx;
}

.info__row + .info__row {
  border-top: 1rpx solid $fish-border-40;
}

.info__label {
  flex-shrink: 0;
  color: $fish-muted;
  @include fish-type(subhead);
}

.info__value {
  color: $fish-ink;
  @include fish-type(subhead);

  text-align: right;
}

/*
 * 属主行。
 *
 * 它不是字段，是「这条信息是谁提供的」—— 所以左右各挂一样东西：
 * 左边是谁，右边有多少人看过。
 */
.info__owner {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 24rpx 32rpx;
  border-top: 1rpx solid $fish-border-40;
}

/*
 * 头像。
 *
 * 有头像图就用图，没有就拿名字的第一个字凑一个圆形底 ——
 * 空着的圆比一个字更像「这里有个人」。
 */
.info__avatar,
.info__avatar-image {
  width: 60rpx;
  height: 60rpx;
  flex-shrink: 0;
  border-radius: 999rpx;
}

.info__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $fish-avatar-tint;
  color: $fish-blue-600;
  @include fish-type(footnote);

  font-weight: 600;
}

.info__owner-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(subhead);

  white-space: nowrap;
  text-overflow: ellipsis;
}

.info__view {
  flex-shrink: 0;
  color: $fish-muted;
  @include fish-type(subhead);
}
</style>
