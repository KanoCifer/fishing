<template>
  <view class="map-wrapper">
    <map
      id="map"
      class="map"
      :longitude="longitude"
      :latitude="latitude"
      :scale="scale"
      :show-location="showLocation"
      :markers="markers"
      enable-zoom
      enable-scroll
      enable-rotate
      :enable-poi="showLocation"
      @regionchange="onRegionChange"
      @markertap="onMarkerTap"
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

    <!--
      定位被拒的兜底。用户拒绝一次之后小程序不会再弹权限窗，
      只能由这里引导去设置页手动打开 —— 详见 openLocationSetting。
    -->
    <cover-view v-if="!hasLocation" class="tip" :style="{ top: topInset + 'px' }">
      <cover-view class="tip__title">未获取到定位权限</cover-view>
      <cover-view class="tip__text">
        当前展示默认坐标，可在设置中开启定位后点击按钮重试
      </cover-view>
      <cover-view class="tip__action" @tap="openLocationSetting">
        去设置开启定位
      </cover-view>
    </cover-view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import type { MapMarkerItem } from '@/composables/useMapMarkers'

const props = withDefaults(
  defineProps<{
    /** 初始经度（GCJ-02 火星坐标系） */
    latitude?: number
    longitude?: number
    /** 缩放层级，3~18，默认 16 约等于街道级 */
    scale?: number
    /** 是否显示当前位置蓝点 */
    showLocation?: boolean
    /**
     * 顶部避让高度（px）。
     * 地图铺满整屏时，页面里浮着的导航栏会盖住顶部，
     * 组件自己排版排不了这个，得由调用方把导航栏底边的高度传进来。
     */
    topInset?: number
    /**
     * 地图标记。由 useMapMarkers 从领域层 MapMarker[] 转换而来，
     * 组件本身不认钓点业务字段。
     */
    markers?: MapMarkerItem[]
  }>(),
  {
    latitude: 30.2741,
    longitude: 120.1551,
    scale: 16,
    showLocation: true,
    topInset: 0,
    markers: () => [],
  },
)

const emit = defineEmits<{
  (e: 'regionchange', payload: { latitude: number; longitude: number; scale: number }): void
  /** marker 被点中。只回传 markerId，由调用方用 useMapMarkers 的 resolveMarker 换回领域对象 */
  (e: 'markertap', payload: { markerId: number }): void
}>()

const latitude = ref(props.latitude)
const longitude = ref(props.longitude)
const scale = ref(props.scale)

const locating = ref(false)
const hasLocation = ref(false)
const statusText = ref('定位中…')

/**
 * 父组件改经纬度就把地图移过去。
 *
 * 这是"聚焦某个钓点"的实现方式：<map> 的经纬度是受控属性，
 * 改 prop 就移图，不必绕 MapContext 的 translateMarker。
 */
watch(
  () => [props.latitude, props.longitude] as const,
  ([nextLat, nextLng]) => {
    latitude.value = nextLat
    longitude.value = nextLng
  },
)

/** 同样受控，父组件也能改缩放层级 */
watch(
  () => props.scale,
  (nextScale) => {
    scale.value = nextScale
  },
)

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
      // 授权被拒或系统定位不可用：保留默认坐标，界面上给提示。
      // 不在这里弹 openSetting —— 用户可能只是定位信号不好，
      // 上来就抢设置页很突兀，按钮点一下再去。
      hasLocation.value = false
      statusText.value = '重新定位'
    },
    complete: () => {
      locating.value = false
    },
  })
}

/**
 * 引导去设置页开定位。
 *
 * 用户拒绝授权后小程序**不会再次弹权限窗**，唯一能重来的路径就是设置页。
 * openSetting 返回时会带上用户在设置里做的选择：开了就重新定位，
 * 没开就退回手动重试，别让按钮看起来"点了没反应"。
 */
function openLocationSetting() {
  uni.openSetting({
    success: (res) => {
      if (res.authSetting?.['scope.userLocation']) {
        locate()
      } else {
        statusText.value = '重新定位'
      }
    },
    fail: () => {
      // 用户没走完设置流程，退回手动重试
      statusText.value = '重新定位'
    },
  })
}

function recenter() {
  if (locating.value) return
  locate()
}

function onRegionChange(e: { detail?: { scale?: number } }) {
  const scaleFromEvent = e.detail?.scale
  if (typeof scaleFromEvent === 'number') {
    scale.value = scaleFromEvent
  }
  emit('regionchange', {
    latitude: latitude.value,
    longitude: longitude.value,
    scale: scale.value,
  })
}

/**
 * marker 点击。
 *
 * 官方类型里没有 <map> 的 markertap 事件声明，detail 只有 markerId 一个字段，
 * 按实际形状取，不写 any。
 */
function onMarkerTap(e: { detail?: { markerId?: number } }) {
  const markerId = e.detail?.markerId
  if (typeof markerId !== 'number') return
  emit('markertap', { markerId })
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
  /* top 由 topInset 动态绑定，这里只用 margin-top 留出固定间距 */
  margin-top: 20rpx;
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

/* cover-view 只支持极少的 CSS：不能用 box-shadow、transform、animation */
.tip__action {
  display: inline-block;
  margin-top: 16rpx;
  padding: 12rpx 24rpx;
  background-color: #2f80ed;
  border-radius: 999rpx;
  color: #ffffff;
  font-size: 24rpx;
  text-align: center;
}
</style>
