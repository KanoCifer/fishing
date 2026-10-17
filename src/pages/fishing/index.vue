<template>
  <view class="fishing">
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

    <DashboardSheet :initial-snap="0" :peek-title="peekTitle" :peek-subtitle="peekSubtitle">
      <view class="sheet">
        <WeatherHero />

        <view class="fishing__divider" />

        <FishingIndexCard @detail="openDetail" @feedback="openFeedback" />

        <QuickFeedbackBanner :disabled="!state.indexData" @submit="openFeedback" />

        <WeatherCard />

        <TideCard />

        <HourlyWeather />
      </view>
    </DashboardSheet>

    <!-- 钓鱼指数的特征详情（feature_breakdown 九项子特征） -->
    <SnapSheet
      :open="featureOpen"
      :snap-points="FEATURE_SNAP_POINTS"
      :initial-snap="0"
      @close="featureOpen = false"
    >
      <template #header>
        <view class="feature__header">
          <text class="feature__title">特征详情</text>
          <text class="feature__subtitle">钓鱼指数是怎么算出来的</text>
        </view>
      </template>
      <FeatureDetailPanel :data="state.indexData" />
    </SnapSheet>

    <!-- 钓点详情（编辑 / 删除） -->
    <FishingSpotDetailSheet
      :open="spotDetailOpen"
      :marker="selectedMarker"
      @close="closeSpotDetail"
      @updated="onSpotUpdated"
      @deleted="onSpotDeleted"
    />

    <!-- 钓鱼反馈 -->
    <FishingFeedbackForm
      :open="feedbackOpen"
      :data="state.indexData"
      :location-id="locationId"
      @close="feedbackOpen = false"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点页 —— 地图 + 持久数据面板 + 两层浮层。
 *
 * 布局见模板里地图区域的注释：原生 map 和普通 view 不能重叠，
 * 所以地图让出下半屏给 DashboardSheet，展开时地图被压矮而非被盖住。
 */
import { computed, onMounted, ref } from "vue";

import DashboardSheet from "@/components/DashboardSheet/DashboardSheet.vue";
import FeatureDetailPanel from "@/components/FeatureDetailPanel/FeatureDetailPanel.vue";
import FishingFeedbackForm from "@/components/FishingFeedbackForm/FishingFeedbackForm.vue";
import FishingIndexCard from "@/components/FishingIndexCard/FishingIndexCard.vue";
import FishingSpotDetailSheet from "@/components/FishingSpotDetailSheet/FishingSpotDetailSheet.vue";
import FullscreenMap from "@/components/FullscreenMap/FullscreenMap.vue";
import HourlyWeather from "@/components/HourlyWeather/HourlyWeather.vue";
import QuickFeedbackBanner from "@/components/QuickFeedbackBanner/QuickFeedbackBanner.vue";
import SnapSheet from "@/components/SnapSheet/SnapSheet.vue";
import TideCard from "@/components/TideCard/TideCard.vue";
import WeatherCard from "@/components/WeatherCard/WeatherCard.vue";
import WeatherHero from "@/components/WeatherHero/WeatherHero.vue";
import { useMapMarkers } from "@/composables/useMapMarkers";
import { useNavMetrics } from "@/composables/useNavMetrics";
import { MAP_CENTER, useFishingMapStore } from "@/composables/useFishingMapStore";
import type { MapMarker } from "@/types/fishing";

const nav = useNavMetrics();
const { state, fetchSpots, fetchWeatherAndFishing, setMarkers } = useFishingMapStore();

const { markerItems, resolveMarker } = useMapMarkers(() => state.markers);

const windowHeight = uni.getWindowInfo().windowHeight;

/** 特征详情两档：半屏 / 大半屏 */
const FEATURE_SNAP_POINTS = [50, 82] as const;

const focusedLng = ref(MAP_CENTER[0]);
const focusedLat = ref(MAP_CENTER[1]);

const selectedMarker = ref<MapMarker | null>(null);
/** 钓点详情（marker 点开） */
const spotDetailOpen = ref(false);
/** 钓鱼指数的特征详情（卡片上的「详情」按钮） */
const featureOpen = ref(false);
const feedbackOpen = ref(false);

/** 反馈关联的钓点 id。无关联钓点时后端约定用 'default' */
const locationId = computed(() => {
  const spot = selectedMarker.value?.extraData;
  return spot ? String(spot.id) : "default";
});

const peekTitle = computed(() => {
  const level = state.indexData?.level;
  return level ? `钓鱼指数 ${level}` : "钓鱼数据";
});

/**
 * 收起档浮层条的副标题：天气 + 地点。
 *
 * 收起态是地图全屏，用户第一眼看到的就这一条，所以要把最关键的
 * 「今天什么天气、在哪」塞进去 —— 数据没到时别显示占位符，
 * 宁可短一行也不要出现「--」这种噪音。
 */
const peekSubtitle = computed(() => {
  const parts: string[] = [];
  const weather = state.liveWeather;
  if (weather) {
    parts.push(`${weather.temp}° ${weather.text}`);
  }
  if (state.locationName) {
    parts.push(state.locationName);
  }
  return parts.join(" · ");
});

function onMarkerTap(payload: { markerId: number }) {
  const marker = resolveMarker(payload.markerId);
  if (!marker) return;

  selectedMarker.value = marker;

  const [lng, lat] = marker.position;
  focusedLng.value = lng;
  focusedLat.value = lat;

  spotDetailOpen.value = true;
}

function closeSpotDetail() {
  spotDetailOpen.value = false;
}

function openDetail() {
  featureOpen.value = true;
}

function openFeedback() {
  feedbackOpen.value = true;
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
  selectedMarker.value = updated;
}

function onSpotDeleted(id: string) {
  setMarkers((prev) => prev.filter((marker) => marker.extraData?.id !== id));
  selectedMarker.value = null;
}

onMounted(() => {
  void fetchSpots();
  // 定位到位后再拉会覆盖这次，先按中心点出一版，页面不至于空白
  void fetchWeatherAndFishing(MAP_CENTER);
});
</script>

<style lang="scss" scoped>
.fishing {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: $fish-page;
}

.fishing__map-area {
  position: relative;
  width: 100%;
  /* 铺满导航栏以下的整屏。面板浮在上面靠 z-index，不占这里的高度 */
  height: 100vh;
}

.fishing__map {
  width: 100%;
  height: 100%;
}

.fishing__divider {
  height: 2rpx;
  background-color: $fish-border-40;
}

.fishing__closing {
  display: block;
  margin-top: 64rpx;
  padding-bottom: 32rpx;
  color: $fish-muted-60;
  font-size: 24rpx;
  text-align: center;
}

/*
 * 钓点数量提示。
 *
 * 用 fixed 而不是 absolute：DashboardSheet 的收起档浮层条也是 fixed 压在
 * 地图上的，两者都在视口坐标系里算位置，才能保证始终贴同一个边。
 * bottom 抬到 140rpx 是给浮层条让位 —— 它收起时就在底部约 150rpx 处。
 */
.hint {
  position: fixed;
  right: 30rpx;
  bottom: 200rpx;
  z-index: 20;
  padding: 12rpx 24rpx;
  background-color: rgba(0, 0, 0, 0.65);
  border-radius: 999rpx;
}

.hint__text {
  color: #ffffff;
  font-size: 24rpx;
  text-align: center;
}

/* 特征详情头部 */
.feature__header {
  padding: 0 40rpx 24rpx;
}

.feature__title {
  display: block;
  color: $fish-ink;
  font-size: 32rpx;
  font-weight: 600;
}

.feature__subtitle {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted;
  font-size: 24rpx;
}

.sheet {
  padding: 12px;
}
</style>
