<template>
  <!--
    钓点信息 —— 2×2 紧凑网格。

    四个字段压成两行两列：标签在上、值在下，各占半宽。
    一屏里要读的东西有五块（名字、结论、四因子、档案、照片），
    档案再占四条整行的话，它自己就是一屏 —— 压成网格之后，
    它退回成「一块要扫一眼的信息」，而不是「一页的主体」。

    属主单独一行、头像 + 名字 + 浏览量 —— 它不是字段，是「这条信息是谁提供的」，
    跟上面那几项不在一个层级上，所以那条发丝线留着。
  -->
  <view class="info">
    <text class="info__section">钓点信息</text>

    <view class="info__group">
      <view class="info__grid">
        <view v-for="row in rows" :key="row.label" class="info__cell">
          <text class="info__label">{{ row.label }}</text>
          <text class="info__value">{{ row.value }}</text>
        </view>
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
 * SpotDetailInfo —— 钓点信息分组。
 *
 * 只管渲染。枚举 → 中文在 utils/types 里换算完再传进来。
 */
import { computed } from 'vue';

import { fishingSpotCarLabel, fishingSpotRoadLabel, type FishingSpot } from '@/types/fishing';
import { mediaUrl } from '@/api/upload';

const props = defineProps<{
  spot: FishingSpot;
}>();

/**
 * 四个字段。
 *
 * 值都换算好了再摆上来 —— 组件里不出现「如果为空就怎么显示」的判断分支，
 * 那一层在 types/fishing 的 label 函数里。
 */
const rows = computed(() => [
  { label: '道路情况', value: fishingSpotRoadLabel(props.spot.road_condition) },
  { label: '车到水边', value: fishingSpotCarLabel(props.spot.car_access) },
  { label: '开放时间', value: props.spot.opening_hours || '未知' },
  // 一项都没有时给个横杠，而不是留一格空白
  { label: '适合钓法', value: (props.spot.suitable_for ?? []).join(' · ') || '—' },
]);

/** 属主名。没有属主时是「未署名」 */
const ownerName = computed(() => props.spot.owner?.name || '未署名');

/** 头像。有 URL 就用图，没有就拿名字的第一个字凑一个 */
const avatarSrc = computed(() => mediaUrl(props.spot.owner?.avatar) || '');

const ownerInitial = computed(() => (props.spot.owner?.name || '?').slice(0, 1));

/** 浏览量 */
const viewText = computed(() => `${(props.spot.view_count ?? 0).toLocaleString('en-US')} 次浏览`);
</script>

<style lang="scss" scoped>
/* 分区。标题上方的留白是 $fish-space-sectitle */
.info {
  margin-top: $fish-space-sectitle;
}

/* 分区标签：eyebrow，与钓况、照片两段同一档 */
.info__section {
  display: block;
  margin-bottom: 20rpx;
  @include fish-eyebrow;
}

/*
 * 分组卡。
 *
 * inset-grouped 的结构：白卡浮在灰底上，靠**面**分层。
 * 组内不再逐行画发丝线 —— 两行两列的网格靠留白分开就够了，
 * 再压三道线，卡片会读成一张表格。
 */
.info__group {
  overflow: hidden;
  border-radius: $fish-radius-card;
  background-color: $fish-page;
  box-shadow: $smooth-shadow-md;
  padding-top: 24rpx;
}

/* 两行两列。flex + 50% 宽，不用 grid（老基础库不认） */
.info__grid {
  display: flex;
  flex-wrap: wrap;
}

.info__cell {
  box-sizing: border-box;
  width: 50%;
  padding: 0 32rpx 24rpx;
}

/* 标签在上、值在下 */
.info__label {
  display: block;
  color: $fish-muted;
  @include fish-type(caption);

  line-height: 1;
}

.info__value {
  display: block;
  margin-top: 14rpx;
  color: $fish-ink;
  @include fish-type(subhead);
}

/*
 * 属主行。
 *
 * 它不是字段，是「这条信息是谁提供的」—— 所以左右各挂一样东西：
 * 左边是谁，右边有多少人看过。
 *
 * 跟上面那两行的分界靠这道发丝线：字段是这一块的档案，
 * 属主是这段信息的来源，两者不在一个层级上。
 */
.info__owner {
  display: flex;
  align-items: center;
  padding: 22rpx 32rpx;
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
  margin-right: 18rpx;
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

/*
 * 属主名。
 *
 * 不截断：这个名字整页只有这一处，截了就再也读不到完整的那几个字。
 * 长就让它换行 —— 昵称最多二十来个字，两行放得下。
 */
.info__owner-name {
  flex: 1;
  min-width: 0;
  color: $fish-ink;
  @include fish-type(subhead);

  overflow-wrap: break-word;
}

.info__view {
  flex-shrink: 0;
  color: $fish-muted;
  @include fish-type(subhead);
}
</style>
