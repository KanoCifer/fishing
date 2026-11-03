<template>
  <!--
    往期行程 —— 横着滑的一条行程卡。

    为什么横着排不竖着排：这一页已经有一屏高矮不一的格子了，
    竖着排的行程列表会把页面拉得很长，而用户要的不是「看完所有行程」，
    是「一眼看出最近几次钓到了什么」—— 横滑给的是这个。

    卡片宽度固定（344rpx），滑到下一张时正好停在两张之间，
    不用看清滑到哪儿了。

    卡面上四件事：照片、当时的气温、那天去了哪、钓到了几条。
    天气只压温度 —— 记天气时后端没存天气现象，只有温度，
    写「晴」是编的。
  -->
  <scroll-view class="rail" scroll-x :show-scrollbar="false">
    <view class="rail__row">
      <view v-for="log in logs" :key="log.log_id" class="rail__card" @tap="emit('select', log.log_id)">
        <!--
          封面。照片与压在它上面的两排浮层都待在这一层里 ——
          这层是定位参照，浮层才不会跑到整张卡（含下方文字）的边上。
        -->
        <view class="rail__cover">
          <!--
            lazy-load：横滑出去的那几张先别下载。

            这些都是网络照片（downloadFile 合法域名），一张几百 KB 起。
            进页面就把一整条全下完，而横滑一次只露得下一两张 —— 剩下的是白花的流量。

            占位插画不挂 lazy-load：它只有一张 URL，几张卡共用同一份缓存，
            早一步显示出来比空着半秒好。
          -->
          <image v-if="photo(log)" class="rail__img" :src="photo(log)" mode="aspectFill" lazy-load />
          <image v-else class="rail__img rail__img--empty" :src="emptyImage" mode="aspectFill" />

          <!--
            照片下缘的压暗。上下两排浮层都压着照片，
            白字得有一块稳的底 —— 亮水面上一行白字读不清。
          -->
          <view class="rail__scrim" />

          <!-- 照片上缘那一排：气温 + 日期 -->
          <view class="rail__top">
            <view v-if="temp(log)" class="rail__weather">
              <image class="rail__weather-icon" :src="thermometerIcon" mode="aspectFit" />
              <text class="rail__weather-text">{{ temp(log) }}</text>
            </view>
            <text class="rail__date">{{ dateText(log) }}</text>
          </view>

          <!-- 照片下缘那一排：地点 + 渔获条数 -->
          <view class="rail__bottom">
            <view class="rail__place">
              <image class="rail__place-icon" :src="pinIcon" mode="aspectFit" />
              <text class="rail__place-text">{{ place(log) }}</text>
            </view>
            <view v-if="catchCount(log)" class="rail__catch">
              <text class="rail__catch-num">{{ catchCount(log) }}</text>
              <text class="rail__catch-unit">{{ catchUnit }}</text>
            </view>
          </view>
        </view>

        <!-- 照片下方：钓到了什么 -->
        <view class="rail__body">
          <text class="rail__catchtext">{{ catchText(log) }}</text>
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
import { icon } from '@/constants/icons';
import { RECORD_EMPTY_IMAGE, RECORD_MONTH, RECORD_NO_PLACE, RECORD_TRIPS } from '@/constants/record';
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

const thermometerIcon = icon('thermometer', 'onAccent');
const pinIcon = icon('map-pin', 'onAccent');
const catchUnit = RECORD_MONTH.catchUnit;

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

/** 渔获总条数。照片下缘那一枚 */
function catchCount(log: FishingLog): number {
  let total = 0;
  for (const item of log.catches ?? []) total += item.quantity ?? 0;
  return total;
}

/** 当时的气温。没有天气快照就不显示这一枚 */
function temp(log: FishingLog): string {
  const value = log.weather?.temperature;
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return Math.round(value) + '°C';
}

/** 日期：「11月3日」 */
function dateText(log: FishingLog): string {
  const [, month, day] = log.log_date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

/** 地点。没记地点就说没记，不拿钓点名凑数 */
function place(log: FishingLog): string {
  return log.location_name || RECORD_NO_PLACE;
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
 *
 * 照片与文字分上下两半：照片是这一趟的脸，文字是这一趟说了什么。
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
 * 封面。240rpx = 120pt
 *
 * 344 × 240 与头图那一块（750 × 560）差得远，所以这里用 3:2 ——
 * 行程卡是「一眼扫过」的封面，不是主视觉，比例上不必跟头图一致。
 *
 * 这一层是定位参照：压在照片上的两排浮层与压暗都相对它摆。
 */
.rail__cover {
  position: relative;
  height: 240rpx;
}

.rail__img {
  width: 100%;
  height: 240rpx;
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

/*
 * 照片下缘的压暗。
 *
 * 只压下缘那一段：上面的字（气温、日期）自带底色胶囊或深色阴影，
 * 只有下缘那一排是白字直接压在照片上。
 */
.rail__scrim {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 180rpx;
  background-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.58) 100%);
}

/*
 * 照片上的上下两排浮层。
 *
 * 绝对定位压住照片的上下缘。
 */
.rail__top,
.rail__bottom {
  position: absolute;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  padding: 0 20rpx;
}

.rail__top {
  top: 0;
  justify-content: space-between;
}

.rail__bottom {
  bottom: 0;
  justify-content: space-between;
}

/* 气温。半透明白底的小胶囊 */
.rail__weather {
  display: flex;
  align-items: center;
  padding: 4rpx 14rpx;
  border-radius: $fish-radius-pill;
  background-color: rgba(0, 0, 0, 0.28);
}

.rail__weather-icon {
  width: 24rpx;
  height: 24rpx;
  margin-right: 6rpx;
}

.rail__weather-text {
  color: $fish-on-dark;
  @include fish-type(caption);
}

/* 日期。照片上最弱的一档 */
.rail__date {
  color: rgba(255, 255, 255, 0.9);
  @include fish-type(caption);
  text-shadow: 0 1rpx 6rpx rgba(0, 0, 0, 0.35);
}

/* 地点 */
.rail__place {
  display: flex;
  align-items: center;
  min-width: 0;
}

.rail__place-icon {
  width: 24rpx;
  height: 24rpx;
  flex-shrink: 0;
  margin-right: 6rpx;
}

.rail__place-text {
  overflow: hidden;
  color: $fish-on-dark;
  @include fish-type(caption);

  text-shadow: 0 1rpx 6rpx rgba(0, 0, 0, 0.35);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 渔获条数。照片上唯一需要被看见的数 */
.rail__catch {
  display: flex;
  align-items: baseline;
  flex-shrink: 0;
  margin-left: 12rpx;
}

.rail__catch-num {
  color: $fish-on-dark;
  @include fish-type(body);

  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.rail__catch-unit {
  margin-left: 4rpx;
  color: rgba(255, 255, 255, 0.86);
  @include fish-type(caption);
}

.rail__body {
  padding: 18rpx 20rpx 20rpx;
}

/* 主行：钓到了什么 */
.rail__catchtext {
  display: block;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(body);

  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
