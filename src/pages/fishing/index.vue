<template>
  <view class="fishing">
    <NavBar title="钓点" />

    <FullscreenMap
      class="fishing__map"
      :markers="markerItems"
      :latitude="focusedLat"
      :longitude="focusedLng"
      :top-inset="nav.navBarBottom"
      @markertap="onMarkerTap"
    />

    <cover-view class="hint" :style="{ top: nav.navBarBottom + 'px' }">
      <cover-view class="hint__text">
        {{ hintText }}
      </cover-view>
    </cover-view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import FullscreenMap from '@/components/FullscreenMap/FullscreenMap.vue'
import NavBar from '@/components/NavBar/NavBar.vue'
import { useMapMarkers } from '@/composables/useMapMarkers'
import { useNavMetrics } from '@/composables/useNavMetrics'
import { MAP_CENTER, useFishingMapStore } from '@/composables/useFishingMapStore'
import type { MapMarker } from '@/types/fishing'

const nav = useNavMetrics()
const { state, fetchSpots, fetchWeatherAndFishing } = useFishingMapStore()

const { markerItems, resolveMarker } = useMapMarkers(() => state.markers)

/** 地图中心。点击 marker 后跟着移过去，让详情落在视野里 */
const focusedLng = ref(MAP_CENTER[0])
const focusedLat = ref(MAP_CENTER[1])

/** 点中 marker 后暂存领域对象，步骤 3 的钓点详情面板会消费它 */
const selectedMarker = ref<MapMarker | null>(null)

const hintText = computed(() => {
  if (state.spotsLoading) return '钓点加载中…'
  if (state.spotsError) return `钓点加载失败：${state.spotsError}`
  if (state.markers.length === 0) return '暂无钓点数据'
  return `共 ${state.markers.length} 个钓点`
})

function onMarkerTap(payload: { markerId: number }) {
  const marker = resolveMarker(payload.markerId)
  if (!marker) return

  selectedMarker.value = marker

  const [lng, lat] = marker.position
  focusedLng.value = lng
  focusedLat.value = lat

  const name = marker.extraData?.name
  uni.showToast({
    title: name ? name.slice(0, 12) : '未命名钓点',
    icon: 'none',
  })
}

onMounted(() => {
  void fetchSpots()
  // 定位到位后再拉会覆盖这次，先按中心点出一版，页面不至于空白
  void fetchWeatherAndFishing(MAP_CENTER)
})
</script>

<style lang="scss" scoped>
.fishing {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #f5f6f8;
}

.fishing__map {
  width: 100%;
  height: 100%;
}

/* cover-view 只支持极少的 CSS：不能用 box-shadow，字号必须写具体值 */
.hint {
  position: absolute;
  left: 30rpx;
  /* top 由导航栏底边动态绑定 */
  margin-top: 20rpx;
  padding: 12rpx 24rpx;
  background-color: rgba(0, 0, 0, 0.65);
  border-radius: 999rpx;
}

.hint__text {
  color: #ffffff;
  font-size: 24rpx;
  text-align: center;
}
</style>
