<template>
  <view class="map-wrapper">
    <map
      id="map"
      class="map"
      :longitude="longitude"
      :latitude="latitude"
      :scale="scale"
      :rotate="rotate"
      :show-location="showLocation"
      :markers="markers"
      :enable-satellite="satellite"
      :enable-traffic="traffic"
      enable-zoom
      enable-scroll
      enable-rotate
      :enable-poi="showLocation"
      @regionchange="onRegionChange"
      @markertap="onMarkerTap"
    />

    <!--
      浮在地图上的控件用普通 view + z-index。
      微信已支持同层渲染（map 自基础库 2.8.3 起），不再需要 cover-view，
      好处是 box-shadow / transform 这些样式都能用了。

      控件簇排右上角、贴着 topInset（导航栏底边）：
      左侧留给手势，底部留给钓点计数浮层和 tabBar，只有右上角是长期空着的。
    -->
    <view class="controls" :style="{ top: topInset + 'px' }">
      <!-- 底图切换：卫星影像对看水面、岸线有用，所以给一个显式开关 -->
      <view class="controls__segmented">
        <view
          v-for="opt in BASE_MAP_OPTIONS"
          :key="opt.value"
          class="controls__segment"
          :class="{ 'controls__segment--active': activeBaseMap === opt.value }"
          @tap="selectBaseMap(opt.value)"
        >
          {{ opt.label }}
        </view>
      </view>

      <view class="btn" @tap="recenter">{{ locating ? "定位中…" : statusText }}</view>

      <!--
        自绘指南针。

        原生 show-compass 也能开，但它画死在地图右上角，而右上角被微信的胶囊
        按钮常驻盖着 —— 那是个点不到也看不见的死位置。胶囊在小程序里永远在最上层，
        页面内容盖不过去，只能换地方画。控件簇已经排在胶囊下方（top 取 navBarBottom），
        所以按钮挂这儿。

        只在旋转时出现：地图 enable-rotate 开着，用户能拧，拧完得给条回来的路。
        MapContext 没有重置角度的接口，只能把 rotate 绑成受控属性手动置 0。
      -->
      <view v-if="isRotated" class="btn btn--compass" @tap="resetRotation">
        回正北 {{ rotationLabel }}°
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import type { MapMarkerItem } from "@/composables/useMapMarkers";

/** 底图模式：标准 / 卫星影像 / 实时路况 */
type BaseMapMode = "standard" | "satellite" | "traffic";

interface BaseMapOption {
  value: BaseMapMode;
  label: string;
}

/**
 * 底图选项。
 *
 * 卫星图和路况是 <map> 的两个独立布尔属性（enable-satellite / enable-traffic，
 * 均基础库 2.7.0 起），不是三选一的枚举。界面上按三选一呈现，是为了让用户
 * 心里只有「当前底图」这一件事；两个属性的实际取值由 selectBaseMap 统一翻译。
 *
 * 注意别走 layer-style（个性化地图 style 编号）那条路：它是静态的，
 * 官方明确不支持动态修改，切不动。
 */
const BASE_MAP_OPTIONS: BaseMapOption[] = [
  { value: "standard", label: "地图" },
  { value: "satellite", label: "卫星" },
  { value: "traffic", label: "路况" },
];

/**
 * 控件簇的固定高度（rpx）。
 *
 * 定位权限提示排在控件簇正下方，CSS 里算不出控件簇多高，只能在这里按样式里的
 * 尺寸硬算一遍。改 .controls / .btn 的 padding 记得回来同步这个数。
 */
const CONTROLS_HEIGHT_RPX = 150;

/** 指南针按钮自身高度 + 与上一个按钮的间距，只在旋转时占位 */
const COMPASS_HEIGHT_RPX = 80;

const props = withDefaults(
  defineProps<{
    /** 初始经度（GCJ-02 火星坐标系） */
    latitude?: number;
    longitude?: number;
    /** 缩放层级，3~18，默认 16 约等于街道级 */
    scale?: number;
    /** 是否显示当前位置蓝点 */
    showLocation?: boolean;
    /**
     * 顶部避让高度（px）。
     * 地图铺满整屏时，页面里浮着的导航栏会盖住顶部，
     * 组件自己排版排不了这个，得由调用方把导航栏底边的高度传进来。
     */
    topInset?: number;
    /**
     * 地图标记。由 useMapMarkers 从领域层 MapMarker[] 转换而来，
     * 组件本身不认钓点业务字段。
     */
    markers?: MapMarkerItem[];
    /** 卫星图底图。v-model:satellite 双向绑定 */
    satellite?: boolean;
    /** 实时路况底图。v-model:traffic 双向绑定 */
    traffic?: boolean;
  }>(),
  {
    latitude: 30.2741,
    longitude: 120.1551,
    scale: 16,
    showLocation: true,
    topInset: 0,
    markers: () => [],
    satellite: false,
    traffic: false,
  },
);

const emit = defineEmits<{
  (e: "regionchange", payload: { latitude: number; longitude: number; scale: number }): void;
  /** marker 被点中。只回传 markerId，由调用方用 useMapMarkers 的 resolveMarker 换回领域对象 */
  (e: "markertap", payload: { markerId: number }): void;
  (e: "update:satellite", value: boolean): void;
  (e: "update:traffic", value: boolean): void;
  /** 底图整体切了一档。想把选择持久化的页面听这个就够 */
  (
    e: "base-map-change",
    payload: { mode: BaseMapMode; satellite: boolean; traffic: boolean },
  ): void;
}>();

const latitude = ref(props.latitude);
const longitude = ref(props.longitude);
const scale = ref(props.scale);

/** 底图两个布尔属性，同样受控，父组件也能改 */
const satellite = ref(props.satellite);
const traffic = ref(props.traffic);

/**
 * 地图旋转角（度）。
 *
 * 绑成受控属性是为了能一键回正北 —— MapContext 没有重置角度的接口，
 * 原生 show-compass 又被胶囊按钮挡在右上角，只能改 rotate 自己把它拧回去。
 * 代价是它和经纬度 / 缩放一样受 patch 管辖，所以必须跟着 onRegionChange 同步，
 * 规则见那个函数的注释。
 */
const rotate = ref(0);

const locating = ref(false);
const hasLocation = ref(false);
const statusText = ref("定位中…");

/** 由两个布尔反推当前档位，供 segmented 高亮 */
const activeBaseMap = computed<BaseMapMode>(() =>
  satellite.value ? "satellite" : traffic.value ? "traffic" : "standard",
);

/**
 * 当前旋转角归一到 0~360 的整数。
 *
 * 先取整再取模：359.6° 在取整前当然算「转过」，但对用户来说就是回到正北了，
 * 不该还挂着一个让他去点的按钮。
 */
const rotationLabel = computed(() => Math.round(rotate.value) % 360);

/** 转过地图才显示指南针，归零之后自动收起 */
const isRotated = computed(() => rotationLabel.value !== 0);

/** 点指南针：把旋转角归零，地图自己会拧回正北 */
function resetRotation() {
  rotate.value = 0;
}

/** 定位权限提示的 top：导航栏底边 + 控件簇高度（指南针出现时再加一段） */
const tipTop = computed(() => {
  const extra = isRotated.value ? COMPASS_HEIGHT_RPX : 0;
  return props.topInset + uni.upx2px(CONTROLS_HEIGHT_RPX + extra);
});

/**
 * 切底图。
 *
 * 两个布尔一起赋值，避免出现「卫星 + 路况」这种界面上选不出来的组合。
 * 切底图只是让微信换一批瓦片重新渲染，视口不动 —— 因为经纬度 / 缩放在
 * onRegionChange 里始终跟地图内部真实视口同步着，这次 patch 传下去的还是
 * 「本来就在的位置」，不会把用户弹回定位点。
 */
function selectBaseMap(mode: BaseMapMode) {
  const nextSatellite = mode === "satellite";
  const nextTraffic = mode === "traffic";

  satellite.value = nextSatellite;
  traffic.value = nextTraffic;

  emit("update:satellite", nextSatellite);
  emit("update:traffic", nextTraffic);
  emit("base-map-change", { mode, satellite: nextSatellite, traffic: nextTraffic });
}

/**
 * 父组件改经纬度就把地图移过去。
 *
 * 这是"聚焦某个钓点"的实现方式：<map> 的经纬度是受控属性，
 * 改 prop 就移图，不必绕 MapContext 的 translateMarker。
 */
watch(
  () => [props.latitude, props.longitude] as const,
  ([nextLat, nextLng]) => {
    latitude.value = nextLat;
    longitude.value = nextLng;
  },
);

/** 底图两个属性也受控 */
watch(
  () => props.satellite,
  (next) => {
    satellite.value = next;
  },
);

watch(
  () => props.traffic,
  (next) => {
    traffic.value = next;
  },
);

/** 同样受控，父组件也能改缩放层级 */
watch(
  () => props.scale,
  (nextScale) => {
    scale.value = nextScale;
  },
);

function locate() {
  locating.value = true;
  statusText.value = "定位中…";

  uni.getLocation({
    // 必须是 gcj02 —— 小程序 <map> 组件用的是 GCJ-02 火星坐标系。
    // 传 wgs84（GPS 原始坐标）会偏移几百米，这是最常见的对不上问题。
    type: "gcj02",
    success: (res) => {
      latitude.value = res.latitude;
      longitude.value = res.longitude;
      scale.value = 16;
      hasLocation.value = true;
      statusText.value = "回到我的位置";
    },
    fail: () => {
      // 授权被拒或系统定位不可用：保留默认坐标，界面上给提示。
      // 不在这里弹 openSetting —— 用户可能只是定位信号不好，
      // 上来就抢设置页很突兀，按钮点一下再去。
      hasLocation.value = false;
      statusText.value = "重新定位";
    },
    complete: () => {
      locating.value = false;
    },
  });
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
      if (res.authSetting?.["scope.userLocation"]) {
        locate();
      } else {
        statusText.value = "重新定位";
      }
    },
    fail: () => {
      // 用户没走完设置流程，退回手动重试
      statusText.value = "重新定位";
    },
  });
}

function recenter() {
  if (locating.value) return;
  locate();
}

/**
 * 视口变化（缩放 / 拖动 / 旋转），这四个值必须**一起**同步回本地 ref。
 *
 * 为什么缺一个就会弹回中心：<map> 的经纬度和缩放都是受控属性，微信收到
 * setData 时会以属性里的 longitude/latitude 为中心重新定位。所以只要有任意
 * 一个属性被 Vue 重新 patch，地图就被拽回那个属性值指向的旧中心 ——
 * 典型就是捏合缩放改了 scale，而 latitude/longitude 还留着定位成功那一刻的值，
 * 缩放一下地图就弹回定位点。
 *
 * 把 detail 里的值全量同步后，受控属性始终等于地图内部的真实视口，
 * 之后任何一次 patch 传下去的都是「本来就在的位置」，等于没动。
 *
 * rotate 同样要在这儿同步：它为了回正北被绑成了受控属性，适用同一条规则。
 * 漏了它，用户转完地图点任意一处触发 patch，角度就被拽回上一次的值。
 *
 * skew 不在这儿：组件没绑这个属性，它不受控，patch 不会触发重定位，
 * 不构成回弹来源。倾斜也只有开了 enable-overlooking 才会有，这里没开。
 */
function onRegionChange(e: {
  detail?: { latitude?: number; longitude?: number; scale?: number; rotate?: number };
}) {
  const { latitude: lat, longitude: lng, scale: nextScale, rotate: nextRotate } = e.detail ?? {};

  // 同步赋值落在同一批次，微信只会收到一次合并后的更新，中途不会瞬移
  if (typeof lat === "number") latitude.value = lat;
  if (typeof lng === "number") longitude.value = lng;
  if (typeof nextScale === "number") scale.value = nextScale;
  if (typeof nextRotate === "number") rotate.value = nextRotate;

  emit("regionchange", {
    latitude: latitude.value,
    longitude: longitude.value,
    scale: scale.value,
  });
}

/**
 * marker 点击。
 *
 * 官方类型里没有 <map> 的 markertap 事件声明，detail 只有 markerId 一个字段，
 * 按实际形状取，不写 any。
 */
function onMarkerTap(e: { detail?: { markerId?: number } }) {
  const markerId = e.detail?.markerId;
  if (typeof markerId !== "number") return;
  emit("markertap", { markerId });
}

onMounted(() => {
  locate();
});
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
  right: 24rpx;
  /* top 由 topInset 动态绑定，这里只留出固定的右边距 */
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* 与 TideCard 的港口切换同一套 segmented 观感 */
.controls__segmented {
  display: flex;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-blue-50;
  box-shadow: 0 4rpx 16rpx rgba(32, 33, 36, 0.12);
}

.controls__segment {
  padding: 12rpx 22rpx;
  /* 比容器小 4rpx，正好压在容器的 4rpx 内边距上 */
  border-radius: 8rpx;
  color: $fish-muted;
  font-size: 24rpx;
  line-height: 32rpx;
}

.controls__segment--active {
  background-color: $fish-page;
  color: $fish-blue-600;
  font-weight: 600;
  box-shadow: 0 2rpx 6rpx rgba(32, 33, 36, 0.12);
}

.btn {
  /* 深蓝灰而非纯黑：浮在地图上比黑更协调，也和 Google 蓝同一色相家族 */
  margin-top: 16rpx;
  padding: 16rpx 28rpx;
  border-radius: 999rpx;
  background-color: rgba(32, 33, 36, 0.82);
  box-shadow: 0 4rpx 16rpx rgba(32, 33, 36, 0.18);
  color: #ffffff;
  font-size: 24rpx;
  line-height: 32rpx;
  text-align: center;
}

/*
 * 指南针按钮。
 *
 * 用主色底从定位按钮里跳出来：它跟定位不是一回事，定位是「回到我」，
 * 指南针是「把地图拧正」，两件事不该长得一样。
 */
.btn--compass {
  background-color: $fish-accent;
}

.tip {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  /* top 由 topInset + 控件簇高度动态绑定，这里只留固定间距 */
  z-index: 10;
  margin-top: 20rpx;
  padding: 24rpx 28rpx;
  border-radius: 16rpx;
  background-color: rgba(255, 255, 255, 0.95);
  box-shadow: 0 4rpx 16rpx rgba(32, 33, 36, 0.12);
}

.tip__title {
  display: block;
  color: $fish-ink;
  font-size: 28rpx;
  margin-bottom: 8rpx;
}

.tip__text {
  display: block;
  color: $fish-muted;
  font-size: 24rpx;
  line-height: 36rpx;
}

.tip__action {
  display: inline-block;
  margin-top: 16rpx;
  padding: 12rpx 24rpx;
  background-color: $fish-accent;
  border-radius: 999rpx;
  color: #ffffff;
  font-size: 24rpx;
  text-align: center;
}
</style>
