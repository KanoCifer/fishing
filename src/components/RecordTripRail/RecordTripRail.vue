<template>
  <!--
    往期行程 —— 横着滑的一条行程卡。

    为什么横着排不竖着排：这一页已经有一屏高矮不一的格子了，
    竖着排的行程列表会把页面拉得很长，而用户要的不是「看完所有行程」，
    是「一眼看出最近几次钓到了什么」—— 横滑给的是这个。

    卡片宽度固定（344rpx），滑到下一张时正好停在两张之间，
    不用看清滑到哪儿了。
  -->
  <scroll-view class="rail" scroll-x :show-scrollbar="false">
    <view class="rail__row">
      <view v-for="log in logs" :key="log.log_id" class="rail__card" @tap="emit('select', log.log_id)">
        <!--
          lazy-load：横滑出去的那几张先别下载。

          这些都是网络照片（downloadFile 合法域名），一张几百 KB 起。
          进页面就把一整条全下完，而横滑一次只露得下一两张 —— 剩下的是白花的流量。
        -->
        <image v-if="photo(log)" class="rail__img" :src="photo(log)" mode="aspectFill" lazy-load />
        <view v-else class="rail__img rail__img--empty" />

        <view class="rail__body">
          <text class="rail__catch">{{ catchText(log) }}</text>
          <text class="rail__meta">{{ meta(log) }}</text>
        </view>
      </view>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
/**
 * 行程卡横滑条。
 *
 * 摆法归这里，挑哪几条归页面。
 */
import { mediaUrl } from '@/api/upload';
import { RECORD_NO_PLACE, RECORD_TRIPS } from '@/constants/record';
import type { FishingLog } from '@/types/record';

defineProps<{
  logs: FishingLog[];
}>();

const emit = defineEmits<{
  /** 点了某张卡，看这条记录的详情 */
  select: [id: string];
}>();

/** 卡片封面。没有照片就空着，不拿别的图凑 */
function photo(log: FishingLog): string {
  return log.images?.length ? mediaUrl(log.images[0]) : '';
}

/**
 * 卡上的主行：钓到了什么。
 *
 * 空军也是一句话（「只打卡」），不留空 ——
 * 空着会读成「这条记录没写完」。
 */
function catchText(log: FishingLog): string {
  if (!log.catches?.length) return RECORD_TRIPS.checkinOnly;
  return log.catches.map((item) => `${item.species} ×${item.quantity}`).join(' · ');
}

/** 次行：几号、去的哪儿 */
function meta(log: FishingLog): string {
  const day = Number(log.log_date.slice(8, 10));
  const place = log.location_name || RECORD_NO_PLACE;
  return `${day}日 · ${place}`;
}
</script>

<style lang="scss" scoped>
/*
 * 横向滚动条。
 *
 * white-space: nowrap + 内层 inline-flex —— 小程序端 scroll-x 的内容
 * 必须不换行，否则内层的 flex 容器会被撑到与视口同宽而横向滚不动。
 * 这套写法与 HourlyWeather、SpotDetailGallery 一致。
 */
.rail {
  width: 100%;
  white-space: nowrap;
}

.rail__row {
  display: inline-flex;
  padding: 0 32rpx 12rpx;
}

/*
 * 卡片。
 *
 * 344rpx = 172pt：两张卡加上间距差不多占满一屏，
 * 滑一下就是下一张 —— 一屏放三张就变成「翻页」了，不是「扫一眼」。
 */
.rail__card {
  width: 344rpx;
  flex-shrink: 0;
  margin-right: 24rpx;
  overflow: hidden;
  border-radius: $fish-radius-card;
  @include fish-glass;
  @include fish-press(0.97);
}

/* 封面。216rpx = 108pt */
.rail__img {
  width: 100%;
  height: 216rpx;
}

/* 没照片时的底。一块极淡的灰，不假装有图 */
.rail__img--empty {
  background-color: $fish-fill;
}

.rail__body {
  padding: 20rpx 24rpx 24rpx;
}

/* 主行：钓到了什么 */
.rail__catch {
  display: block;
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
}

/* 次行：几号、去的哪儿 */
.rail__meta {
  display: block;
  margin-top: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}
</style>
