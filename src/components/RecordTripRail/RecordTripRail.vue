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

          占位插画不挂 lazy-load：它只有一张 URL，几张卡共用同一份缓存，
          早一步显示出来比空着半秒好。
        -->
        <image v-if="photo(log)" class="rail__img" :src="photo(log)" mode="aspectFill" lazy-load />
        <image v-else class="rail__img rail__img--empty" :src="emptyImage" mode="aspectFill" />

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
import { RECORD_EMPTY_IMAGE, RECORD_NO_PLACE, RECORD_TRIPS } from '@/constants/record';
import type { FishingLog } from '@/types/record';

defineProps<{
  logs: FishingLog[];
}>();

const emit = defineEmits<{
  /** 点了某张卡，看这条记录的详情 */
  select: [id: string];
}>();

/**
 * 空态插画。
 *
 * 与头图（RecordHero）用的是同一张 —— 同一条记录的两张脸，
 * 不该一个插画一个灰块。
 */
const emptyImage = RECORD_EMPTY_IMAGE;

/**
 * 卡片封面。
 *
 * 没有照片时给占位插画（空串是「没有封面」，插画那张才是兜底）——
 * 但绝不拿别的行程的照片来凑：拿旧照片冒充这次出行是撒谎。
 */
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

/*
 * 封面。216rpx = 108pt
 *
 * 344 × 216 与头图那一块（750 × 472）是同一个比例 ——
 * 所以占位插画按 Fill 铺出来时，裁掉的正好是同一部分，
 * 一张脸在两处的长相一模一样。
 */
.rail__img {
  width: 100%;
  height: 216rpx;
}

/*
 * 没照片时的兜底面。
 *
 * 冷灰蓝底 —— 与头图缺图那一档同一个色（$fish-photo-placeholder）：
 * 同一张脸不该两个页面两个色。插画铺满之后它基本看不见，
 * 只在图还没加载出来的那一瞬顶一下。
 */
.rail__img--empty {
  background-color: $fish-photo-placeholder;
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
