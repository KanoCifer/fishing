<template>
  <view class="fishing">
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

    <!-- 钓点详情（导航） -->
    <FishingSpotDetailSheet :open="spotDetailOpen" :marker="selectedMarker" @close="closeSpotDetail" />
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点页 —— 全屏地图 + 钓点标记 + 钓点详情浮层。
 *
 * 这一页只管「在哪」：地图和 marker 是空间关系，别的都不归它管。
 * 地图铺满整屏，浮在上面的只有钓点计数和详情浮层。
 */
import { computed, onMounted, ref } from 'vue';

import FishingSpotDetailSheet from '@/components/FishingSpotDetailSheet/FishingSpotDetailSheet.vue';
import FullscreenMap from '@/components/FullscreenMap/FullscreenMap.vue';
import { useMapMarkers } from '@/composables/useMapMarkers';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { MAP_CENTER, useFishingMapStore } from '@/stores/fishingMap';

const nav = useNavMetrics();
const mapStore = useFishingMapStore();

const { markerItems, resolveMarker } = useMapMarkers(() => mapStore.markers);

const focusedLng = ref(MAP_CENTER[0]);
const focusedLat = ref(MAP_CENTER[1]);

/** 选中态在 store 里，本页只是读写它，不另存一份 */
const selectedMarker = computed(() => mapStore.selectedMarker);
/** 钓点详情（marker 点开） */
const spotDetailOpen = ref(false);

function onMarkerTap(payload: { markerId: number }) {
  const marker = resolveMarker(payload.markerId);
  if (!marker) return;

  mapStore.setSelectedMarker(marker);

  const [lng, lat] = marker.position;
  focusedLng.value = lng;
  focusedLat.value = lat;

  spotDetailOpen.value = true;
}

function closeSpotDetail() {
  spotDetailOpen.value = false;
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
   这里给的是地图瓦片还没加载时的兜底，等同于 App.vue 的 page 色 */
.fishing {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: $fish-grouped;
}

.fishing__map-area {
  position: relative;
  width: 100%;
  /* 整屏铺满：地图要顶到导航栏底下，一屏就是一整张图 */
  height: 100vh;
}

.fishing__map {
  width: 100%;
  height: 100%;
}
</style>
