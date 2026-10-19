<template>
  <SnapSheet :open="open && !!marker" :snap-points="SNAP_POINTS" :initial-snap="0" @close="onClose">
    <template #header>
      <view class="spot-detail__header">
        <view class="spot-detail__header-text">
          <text class="spot-detail__title">{{ spot?.name || '钓点详情' }}</text>
          <text v-if="dateLabel" class="spot-detail__date">{{ dateLabel }}</text>
        </view>
      </view>
    </template>

    <view class="spot-detail__content">
      <!-- 评分 -->
      <view v-if="spot && spot.rating !== undefined" class="spot-detail__rating">
        <text
          v-for="i in 5"
          :key="i"
          class="spot-detail__star spot-detail__star--readonly"
          :class="{ 'spot-detail__star--on': i <= Math.round(spot.rating) }"
        >
          ★
        </text>
        <text class="spot-detail__rating-value">{{ spot.rating.toFixed(1) }}</text>
      </view>

      <text v-if="spot?.description" class="spot-detail__description">
        {{ spot.description }}
      </text>

      <view v-if="spot?.tags?.length" class="spot-detail__tags">
        <text v-for="tag in spot.tags" :key="tag" class="spot-detail__tag">
          {{ tag }}
        </text>
      </view>

      <!-- 信息组 -->
      <view class="spot-detail__group">
        <view v-if="coordinateLabel" class="spot-detail__row">
          <text class="spot-detail__row-label">位置</text>
          <text class="spot-detail__row-value">{{ coordinateLabel }}</text>
        </view>
        <view v-if="spot?.created_at" class="spot-detail__row">
          <text class="spot-detail__row-label">创建时间</text>
          <text class="spot-detail__row-value">{{ createdLabel }}</text>
        </view>
      </view>

      <!-- 操作 -->
      <view class="spot-detail__actions">
        <view class="spot-detail__btn spot-detail__btn--primary" @tap="openNavigation">
          <image class="spot-detail__btn-icon" :src="navIcon" mode="aspectFit" />
          <text class="spot-detail__btn-text">导航</text>
        </view>
      </view>
    </view>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * 钓点详情面板 —— 对应源项目 FishingSpotDetailSheet.tsx。
 *
 * 面板只做两件事：把钓点的信息摊开，再给一个「去那儿」的动作。
 *
 * 导航走小程序自带的 `uni.openLocation`（微信侧是 wx.openLocation）：
 * 跳到微信自己的地图页，那一页里有完整的路线规划与转向导航。
 *
 * 与源版本的差异：
 * - 编辑与删除暂时下线。后端的 update 走 PUT，路由是否已注册还没实测确认
 *   （见 api/fishing.ts 的注释），两个动作连同相关状态一并摘掉，
 *   等后端契约落定再接回来
 * - 源版导航调 AMap.Driving 画 Polyline，小程序端没有高德 JS SDK，
 *   改用系统自带地图，不再自己算路线
 * - lucide 图标换 emoji / 纯文本
 */
import { computed } from 'vue';

import { icon } from '@/constants/icons';
import type { MapMarker } from '@/types/fishing';

import SnapSheet from '../SnapSheet/SnapSheet.vue';

const SNAP_POINTS = [50, 78] as const;

/** 导航键的箭头。压在主色按钮上，所以是白色 */
const navIcon = icon('navigation', 'onAccent');

const props = defineProps<{
  open: boolean;
  /** 完整 MapMarker：extraData 供展示，position 供坐标行 */
  marker: MapMarker | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const spot = computed(() => props.marker?.extraData);

const dateLabel = computed(() => {
  const created = spot.value?.created_at;
  if (!created) return '';
  return `记于 ${created.slice(0, 10)}`;
});

const createdLabel = computed(() => {
  const created = spot.value?.created_at;
  if (!created) return '';
  return created.slice(0, 16).replace('T', ' ');
});

const coordinateLabel = computed(() => {
  const position = props.marker?.position;
  if (!position) return '';
  return `${position[0].toFixed(4)}, ${position[1].toFixed(4)}`;
});

/**
 * 打开微信内置地图的导航入口。
 *
 * 用的是小程序自带的 `uni.openLocation`：它把当前这个点摆到微信自己的地图页上，
 * 用户在那页可以一键唤起路线规划与转向导航。系统那条链（看位置 → 选目的地 →
 * 开始导航）本来就是完整的，自己再画一条 Polyline 只会多一层还少一半能力。
 *
 * 坐标直接传，不做转换：钓点的 location 是 GCJ-02，微信地图原生也用 GCJ-02，
 * 换算错了会偏出几百米 —— 比偏个几十米糟糕得多。position 是 [lng, lat]，
 * 而 openLocation 要的是 lat / lng 两个字段，写反了不会报错，只会落到地球另一侧。
 *
 * scale 16 是街道级：默认的 18 已经是楼栋级，钓点多半在水边、路边，
 * 放到那个倍率反而看不见周围的地形。
 */
function openNavigation() {
  const position = props.marker?.position;
  if (!position) return;

  const [lng, lat] = position;

  uni.openLocation({
    latitude: lat,
    longitude: lng,
    name: spot.value?.name || '钓点',
    scale: 16,
    fail: () => {
      // 正常不会走到这里（不涉及任何权限），但万一是环境不支持，
      // 给个说法比按钮点了没反应强
      uni.showToast({ title: '无法打开地图', icon: 'none' });
    },
  });
}

function onClose() {
  emit('close');
}
</script>

<style lang="scss" scoped>
.spot-detail__header {
  padding: 0 40rpx 24rpx;
}

.spot-detail__header-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

/* 抽屉的标题比页面内的分区标题大一档：这一屏只有它一个主角 */
.spot-detail__title {
  max-width: 560rpx;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(title2);

  white-space: nowrap;
  text-overflow: ellipsis;
}

.spot-detail__date {
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

.spot-detail__content {
  padding: 32rpx 40rpx 64rpx;
}

/* 评分 */
.spot-detail__rating {
  display: flex;
  align-items: center;
  margin-bottom: 32rpx;
}

/* ★ 是字形不是文字，理由见 HourlyWeather 的 .hourly__icon */
.spot-detail__star {
  margin-right: 8rpx;
  font-size: 44rpx;
  line-height: 1;
  color: $fish-border;
}

/* 选中星用 systemOrange 而非 systemYellow(#ffcc00)：1pt 的星在白底上
   用 Yellow 会淡到看不出填充和空白的区别 */
.spot-detail__star--on {
  color: $fish-warning;
}

.spot-detail__rating-value {
  margin-left: 12rpx;
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.spot-detail__description {
  display: block;
  margin-bottom: 32rpx;
  color: $fish-ink;
  @include fish-type(body);
}

.spot-detail__tags {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 32rpx;
}

/* 标签是「静态标记」不是「可选中的 chip」：中性填充 + 圆角矩形，
   胶囊会让人以为能点 */
.spot-detail__tag {
  margin: 0 12rpx 12rpx 0;
  padding: 8rpx 24rpx;
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  color: $fish-muted;
  @include fish-type(caption);
}

.spot-detail__group {
  margin-bottom: 32rpx;
  overflow: hidden;
  border-radius: $fish-radius-xl;
  background-color: $fish-grouped;
}

.spot-detail__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 32rpx;
  border-bottom: 1rpx solid $fish-border;
}

.spot-detail__row:last-child {
  border-bottom: none;
}

.spot-detail__row-label {
  color: $fish-muted;
  @include fish-type(subhead);
}

.spot-detail__row-value {
  color: $fish-ink;
  @include fish-type(subhead);

  font-variant-numeric: tabular-nums;
}

/* 操作 */
.spot-detail__actions {
  display: flex;
}

/*
 * 按钮。
 *
 * 现在只剩导航这一个动作，于是这条规则塌成一个满宽的主色 pill：
 * 独占一行、整条都是热区，比半宽的按钮好按得多。
 * margin 归零也是为这个 —— 原来两个按钮并排时用 8rpx 外边距做间隙，
 * 只剩一个按钮时那点间隙就变成了左右各缩进一截，白白窄一截。
 */
.spot-detail__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  border-radius: $fish-radius-pill;
  @include fish-press(0.97);
}

.spot-detail__btn--primary {
  background-color: $fish-accent;
}

/* 导航键上的箭头。与文字同一色（白），所以图标不另取色 */
.spot-detail__btn-icon {
  width: 34rpx;
  height: 34rpx;
  margin-right: 12rpx;
}

.spot-detail__btn-text {
  color: $fish-ink;
  @include fish-type(callout);
}

/* 实心按钮上的文字必须反色：pill 的蓝底够深，
   沿用深色文字会糊在底色里 */
.spot-detail__btn--primary .spot-detail__btn-text {
  color: #ffffff;
  font-weight: 600;
}
</style>
