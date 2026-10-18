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

    <!-- 钓点详情（编辑 / 删除） -->
    <FishingSpotDetailSheet
      :open="spotDetailOpen"
      :marker="selectedMarker"
      @close="closeSpotDetail"
      @updated="onSpotUpdated"
      @deleted="onSpotDeleted"
    />
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
import { MAP_CENTER, useFishingMapStore } from '@/composables/useFishingMapStore';
import type { MapMarker } from '@/types/fishing';

const nav = useNavMetrics();
const { state, fetchSpots, setMarkers, setSelectedMarker } = useFishingMapStore();

const { markerItems, resolveMarker } = useMapMarkers(() => state.markers);

const focusedLng = ref(MAP_CENTER[0]);
const focusedLat = ref(MAP_CENTER[1]);

/** 选中态在 store 里，本页只是读写它，不另存一份 */
const selectedMarker = computed(() => state.selectedMarker);
/** 钓点详情（marker 点开） */
const spotDetailOpen = ref(false);

function onMarkerTap(payload: { markerId: number }) {
  const marker = resolveMarker(payload.markerId);
  if (!marker) return;

  setSelectedMarker(marker);

  const [lng, lat] = marker.position;
  focusedLng.value = lng;
  focusedLat.value = lat;

  spotDetailOpen.value = true;
}

function closeSpotDetail() {
  spotDetailOpen.value = false;
}

/** 按 id 局部换掉一条 marker，避免整数组替换触发地图全量重绘 */
function onSpotUpdated(updated: MapMarker) {
  const id = updated.extraData?.id;
  if (!id) return;

  setMarkers((prev) =>
    prev.map((marker) => {
      const markerId = marker.extraData?.id;
      return markerId === id ? updated : marker;
    }),
  );
  setSelectedMarker(updated);
}

function onSpotDeleted(id: string) {
  setMarkers((prev) => prev.filter((marker) => marker.extraData?.id !== id));

  // 删掉的正是当前选中项时顺手清掉，否则数据页的反馈还会关联到一个已不存在的钓点
  if (state.selectedMarker?.extraData?.id === id) {
    setSelectedMarker(null);
  }
}

/**
 * 只拉钓点。
 *
 * 天气和钓鱼指数由数据页负责取数（那边才是它们的展示位置），
 * 这里再拉一份就是同一份数据两个消费方各拉各的。
 */
onMounted(() => {
  void fetchSpots();
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
