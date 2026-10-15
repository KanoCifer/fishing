<template>
  <view class="map-wrapper">
    <map
      id="map"
      class="map"
      :longitude="longitude"
      :latitude="latitude"
      :scale="scale"
      :show-location="showLocation"
      enable-zoom
      enable-scroll
      enable-rotate
      :enable-poi="showLocation"
      @regionchange="onRegionChange"
      @tap="onTap"
    />

    <!--
      map 是原生组件，层级永远在普通组件之上，z-index 对它无效。
      任何要浮在地图上的东西都只能用 cover-view / cover-image。
      而且 cover-view 只支持极少的 CSS（没有 box-shadow，字号要写具体值）。
    -->
    <cover-view class="controls">
      <cover-view v-if="locating" class="btn">定位中…</cover-view>
      <cover-view v-else class="btn" @tap="recenter">{{ statusText }}</cover-view>
    </cover-view>

    <cover-view v-if="!hasLocation" class="tip">
      <cover-view class="tip__title">未获取到定位权限</cover-view>
      <cover-view class="tip__text">
        当前展示默认坐标，可在设置中开启定位后点击按钮重试
      </cover-view>
    </cover-view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 初始经度（GCJ-02 火星坐标系） */
    latitude?: number
    longitude?: number
    /** 缩放层级，3~18，默认 16 约等于街道级 */
    scale?: number
    /** 是否显示当前位置蓝点 */
    showLocation?: boolean
  }>(),
  {
    latitude: 30.2741,
    longitude: 120.1551,
    scale: 16,
    showLocation: true,
  },
)

const emit = defineEmits<{
  (e: 'regionchange', payload: { latitude: number; longitude: number; scale: number }): void
}>()

const latitude = ref(props.latitude)
const longitude = ref(props.longitude)
const scale = ref(props.scale)

const locating = ref(false)
const hasLocation = ref(false)
const statusText = ref('定位中…')

function locate() {
  locating.value = true
  statusText.value = '定位中…'

  uni.getLocation({
    // 必须是 gcj02 —— 小程序 <map> 组件用的是 GCJ-02 火星坐标系。
    // 传 wgs84（GPS 原始坐标）会偏移几百米，这是最常见的对不上问题。
    type: 'gcj02',
    success: (res) => {
      latitude.value = res.latitude
      longitude.value = res.longitude
      scale.value = 16
      hasLocation.value = true
      statusText.value = '回到我的位置'
    },
    fail: () => {
      // 用户拒绝授权或系统定位不可用，保留默认坐标，界面上给提示
      hasLocation.value = false
      statusText.value = '重新定位'
    },
    complete: () => {
      locating.value = false
    },
  })
}

function recenter() {
  if (locating.value) return
  locate()
}

function onRegionChange(e: any) {
  const d = e.detail
  if (d && typeof d.scale === 'number') {
    scale.value = d.scale
  }
  emit('regionchange', {
    latitude: latitude.value,
    longitude: longitude.value,
    scale: scale.value,
  })
}

function onTap(e: any) {
  // 地图点击不触发业务逻辑，预留钩子
  void e
}

onMounted(() => {
  locate()
})
</script>

<style lang="scss" scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.map {
  width: 100%;
  height: 100%;
}

.controls {
  position: absolute;
  right: 30rpx;
  bottom: 60rpx;
}

.btn {
  display: inline-block;
  padding: 20rpx 30rpx;
  background-color: rgba(0, 0, 0, 0.65);
  border-radius: 999rpx;
  color: #ffffff;
  font-size: 26rpx;
  text-align: center;
}

.tip {
  position: absolute;
  left: 30rpx;
  right: 30rpx;
  top: 30rpx;
  padding: 24rpx 28rpx;
  background-color: rgba(255, 255, 255, 0.95);
  border-radius: 16rpx;
}

.tip__title {
  display: block;
  color: #333333;
  font-size: 28rpx;
  margin-bottom: 8rpx;
}

.tip__text {
  display: block;
  color: #999999;
  font-size: 24rpx;
  line-height: 36rpx;
}
</style>
