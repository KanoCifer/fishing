<template>
  <!--
    高度由脚本绑定，不用 100vh。

    100vh 把原生 tabBar 的高度也算进去了，页面会比真正能显示的那部分
    高出约 50px —— 页面因此可滚动，双指在地图上滑动时整页跟着滑，
    地图被拖离原位。详见 useViewport 的注释。
  -->
  <view class="fishing" :style="{ height: windowHeight + 'px' }">
    <!--
      钓点页 —— 只做一件事：在地图上选点。

      数据（天气、潮汐、钓鱼指数、反馈）全在「数据」页签。这样切分是按
      「在哪」而不是「是什么」：地图这一屏留给空间关系，实况和曲线交给
      可以滚动的列表页，两边都不用在对方的地盘上做取舍。
    -->
    <view class="fishing__map-area">
      <FullscreenMap
        class="fishing__map"
        :markers="markerItems"
        :latitude="focusedLat"
        :longitude="focusedLng"
        :top-inset="nav.navBarBottom"
        @markertap="onMarkerTap"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点页 —— 全屏地图 + 钓点标记。
 *
 * 这一页只管「在哪」：地图和 marker 是空间关系，别的都不归它管。
 * 地图铺满整屏，浮在上面的只有钓点计数。
 *
 * 钓点详情是推出去的独立页（pages/spot-detail），不是这一页上的浮层 ——
 * 抽屉只能露出半屏，而钓点详情要放的东西是照片、档案和今日钓况，
 * 半屏装不下，挤在地图上也读不完。
 */
import { onMounted, ref } from 'vue';

import FullscreenMap from '@/components/FullscreenMap/FullscreenMap.vue';
import { useMapMarkers } from '@/composables/useMapMarkers';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { MAP_CENTER, useFishingMapStore } from '@/stores/fishingMap';

const nav = useNavMetrics();
const mapStore = useFishingMapStore();

/** 可用窗口高度（px）。地图铺满的高度就是它，理由见 useViewport */
const { windowHeight } = useViewport();

const { markerItems, resolveMarker } = useMapMarkers(() => mapStore.markers);

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
 * 只拉钓点。
 *
 * 天气和钓鱼指数是 store 里的同一份数据：定位成功后 store 会按用户坐标取一次，
 * 数据页直接用那一份。这里再拉一份就是同一份数据两个消费方各拉各的。
 */
onMounted(() => {
  void mapStore.fetchSpots();
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
</style>
