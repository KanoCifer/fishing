<template>
  <view class="fishing" :style="{ height: windowHeight + 'px' }">
    <view class="fishing__map-area">
      <FullscreenMap
        class="fishing__map"
        :markers="markerItems"
        :latitude="focusedLat"
        :longitude="focusedLng"
        :top-inset="nav.navBarBottom"
        @markerTap="onMarkerTap"
      />
    </view>
    <view class="fishing__create" @tap="openCreate">
      <image class="fishing__create-icon" :src="createIcon" mode="aspectFit" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点页 —— 全屏地图 + 钓点标记。
 */
import { ref } from 'vue';
import { onReady } from '@dcloudio/uni-app';

import FullscreenMap from '@/components/FullscreenMap/FullscreenMap.vue';
import { useMapMarkers } from '@/composables/useMapMarkers';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { icon } from '@/constants/icons';
import { MAP_CENTER, useFishingMapStore } from '@/stores/fishingMap';

const nav = useNavMetrics();
const mapStore = useFishingMapStore();

/** 可用窗口高度（px）。地图铺满的高度就是它，理由见 useViewport */
const { windowHeight } = useViewport();

const { markerItems, resolveMarker } = useMapMarkers(() => mapStore.markers);

/** 新建钓点按钮上的加号 */
const createIcon = icon('plus', 'onAccent');

const focusedLng = ref(MAP_CENTER[0]);
const focusedLat = ref(MAP_CENTER[1]);

/**
 * 点 marker → 推钓点详情页。
 *
 * 顺带把地图挪到那个点上：详情页往回退时，用户看到的还是他刚点的那个地方，
 * 地图不会弹回初始中心。
 */
function onMarkerTap(payload: { markerId: number }) {
  const marker = resolveMarker(payload.markerId);
  if (!marker) return;

  mapStore.setSelectedMarker(marker);

  const [lng, lat] = marker.position;
  focusedLng.value = lng;
  focusedLat.value = lat;

  // id 来自 marker 携带的钓点数据（extraData 就是钓点本体去掉坐标）
  const id = marker.extraData?.id;
  if (!id) return;

  uni.navigateTo({ url: `/pages/spot-detail/index?id=${id}` });
}

/**
 * 去新建钓点。
 *
 * 走独立页而不是浮层：新建要填的东西有九栏（位置、名称、类型、简介、
 * 钓法、收费、道路、车到水边、开放时间），抽屉只装得下半屏。
 */
function openCreate() {
  uni.navigateTo({ url: '/pages/spot-create/index' });
}

/**
 * 只拉钓点。
 *
 * 天气和钓鱼指数是 store 里的同一份数据，只有数据页那三张卡在用，
 * 这一页一个像素都不显示 —— 这里再拉一份就是白拉一条最重的请求。
 *
 * **为什么放在 onReady 而不是 onMounted**：这条请求跟首屏没有依赖关系，
 * 地图先出来、点后补上完全可以接受；而它在启动阶段发出去就是微信体检
 * 记的那条「小程序启动时存在耗时较长的请求」（实测 TTFB 250 ms）。
 * onReady 是「页面初次渲染完成」，之后再让开一个宏任务，
 * 请求就确定落在启动阶段之外了。
 */
onReady(() => {
  setTimeout(() => {
    void mapStore.fetchSpots();
  }, 0);
});
</script>

<style lang="scss" scoped>
/* 地图页没有自己的底色 —— 整屏都是地图，任何底色都只在首帧露一下。
   这里给的是地图瓦片还没加载时的兜底，等同于 App.vue 的 page 色。

   高度不写在这里，由模板绑 windowHeight（px）—— 100vh 会把 tabBar
   的高度算进来，页面就多出一截可滚动范围，双指滑动地图时整页会跟着走。
   详见 useViewport。 */
.fishing {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: $fish-grouped;
}

.fishing__map-area {
  position: relative;
  width: 100%;
  /* 整屏铺满：地图要顶到导航栏底下，一屏就是一整张图 */
  height: 100%;
}

.fishing__map {
  width: 100%;
  height: 100%;
}

/*
 * 新建钓点按钮。
 *
 * 112rpx 见方（56pt）—— 比 iOS 常规按钮大：它压在地图上，
 * 目标不明确，得比工具栏上那几枚小按钮更显眼才对得起「记一个点」这件事。
 *
 * 阴影用一层实打实的黑，不是玻璃模糊：地图是照片，玻璃的模糊在照片上读不出来。
 *
 * z-index 10：压在地图之上、导航栏之下（导航栏是 20）。
 */
.fishing__create {
  position: absolute;
  right: 32rpx;
  bottom: 64rpx;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 112rpx;
  height: 112rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.18);
  @include fish-press(0.94);
}

.fishing__create-icon {
  width: 48rpx;
  height: 48rpx;
}
</style>
