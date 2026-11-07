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
        @create="openCreate"
        :logged-in="session.loggedIn"
      />

      <!--
        钓点一块都没拿到时的空态。

        压在地图左下角而不是居中：这一屏还有别的用处（定位、投稿），
        缺的是标记这一层 —— 做成一张居中的大卡片等于把地图整个盖住。
      -->
      <view v-if="spotsFailed" class="spots-error">
        <view class="spots-error__text">
          <text class="spots-error__title">钓点没加载出来</text>
          <text class="spots-error__reason">{{ mapStore.spotsError }}</text>
        </view>
        <view
          class="spots-error__retry"
          :class="{ 'spots-error__retry--busy': mapStore.spotsLoading }"
          @tap="retrySpots"
        >
          <text class="spots-error__retry-text">重试</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点页 —— 全屏地图 + 钓点标记。
 */
import { computed, ref } from 'vue';
import { onLoad, onReady, onShareAppMessage, onShow } from '@dcloudio/uni-app';

import FullscreenMap from '@/components/FullscreenMap/FullscreenMap.vue';
import { useMapMarkers } from '@/composables/useMapMarkers';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { SHARE_CARDS } from '@/constants/share';
import { MAP_CENTER, useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import { enableShareMenu } from '@/utils/share';

const nav = useNavMetrics();
const mapStore = useFishingMapStore();
const session = useSessionStore();

/** 可用窗口高度（px）。地图铺满的高度就是它，理由见 useViewport */
const { windowHeight } = useViewport();

const { markerItems, resolveMarker } = useMapMarkers(() => mapStore.markers);

const focusedLng = ref(MAP_CENTER[0]);
const focusedLat = ref(MAP_CENTER[1]);

/**
 * 钓点一块都没拿到 —— 这时才把空态亮出来。
 *
 * 地图上已经有标记就是可用状态：后台那次刷新没成，用户不需要知道。
 * 什么都没有的时候，「这一片真的没有钓点」和「没取到」才分不清。
 */
const spotsFailed = computed(
  () => mapStore.markers.length === 0 && mapStore.spotsError !== '',
);

/**
 * 重试取钓点。force：不管新鲜窗口 —— 用户点了就是现在要。
 */
function retrySpots() {
  if (mapStore.spotsLoading) return;
  void mapStore.fetchSpots({ force: true });
}

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
 * 去投稿钓点。
 *
 * 由地图工具条上的「投稿」键触发 —— 那一列只有四枚键（卫星 / 路况 / 投稿 / 定位），
 * 记一个点这件事不再另挂一个浮在屏幕角落的按钮。
 *
 * 走独立页而不是浮层：投稿要填的东西有九栏（位置、名称、类型、简介、
 * 钓法、收费、道路、车到水边、开放时间），抽屉只装得下半屏。
 */
function openCreate() {
  uni.navigateTo({ url: '/pages/spot-create/index' });
}

/**
 * 转发这一页。
 *
 * 标题与封面在 @/constants/share（唯一出处），这里只把它交出去。
 *
 * 落回本页：收的人点进来看到的是一张钓点地图 —— 跟卡片上写的是同一件事。
 */
onShareAppMessage(() => ({
  title: SHARE_CARDS.fishing.title,
  path: SHARE_CARDS.fishing.path,
  imageUrl: SHARE_CARDS.fishing.cover,
}));

/**
 * 打开胶囊菜单里的「转发」。
 *
 * 放在 onLoad 而不是 onShow：tab 页的 onLoad 只触发一次（页面实例一直在），
 * 而菜单项是页面级的设置，设一次就够。三个 tab 页各设各的 ——
 * 菜单跟着当前页走，谁被显示谁的那份设置生效。
 */
onLoad(() => {
  enableShareMenu();
});

/**
 * 首屏那一轮取完了没有。
 *
 * onShow 在 onReady 之前就会跑一次（这一页是启动落点时），
 * 那一次落在启动阶段里，不能发请求 —— 规矩见 docs/mp-weixin-network.md。
 */
let ready = false;

/**
 * 只拉钓点。
 *
 * 天气和鱼口概率是 store 里的同一份数据，只有数据页那三张卡在用，
 * 这一页一个像素都不显示 —— 这里再拉一份就是白拉一条最重的请求。
 *
 * **为什么放在 onReady 而不是 onMounted**：这条请求跟首屏没有依赖关系，
 * 地图先出来、点后补上完全可以接受；而它在启动阶段发出去就是微信体检
 * 记的那条「小程序启动时存在耗时较长的请求」（实测 TTFB 250 ms）。
 * onReady 是「页面初次渲染完成」，之后再让开一个宏任务，
 * 请求就确定落在启动阶段之外了。
 */
onReady(() => {
  ready = true;

  setTimeout(() => {
    void mapStore.fetchSpots();

    /*
     * 恢复会话。
     *
     * 工具条上的「投稿」键取决于有没有登录。不恢复就判断不出来：
     * 用户明明是登录着的，却因为进程重启没了内存里的用户，
     * 就看不到投稿入口了。
     *
     * 跟取钓点放在同一个宏任务里：分享链接可以落到这一页，
     * 那时它就是启动落点，启动阶段不能有请求（见 docs/mp-weixin-network.md）。
     *
     * 没登录不会白发请求 —— restore() 读到本地没有 token 就直接返回。
     */
    void session.restore();
  }, 0);
});

/**
 * 切回本页时补一次取数。
 *
 * 这一页的 onReady 只跑一次（tab 页实例一直在），那一次失败就定格到
 * 用户杀进程重进为止。切 tab 回来补一刀：store 里按五分钟的新鲜窗口
 * 判断该不该发，所以不会每次都白发一条，而失败的那次一定会重发。
 */
onShow(() => {
  if (!ready) return;
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

/*
 * 钓点没取到时的空态。
 *
 * 压在地图左下角，不占中间：这一屏还有别的用处（定位、投稿），
 * 缺的是标记这一层 —— 做成一张居中的大卡片等于把地图整个盖住。
 *
 * 材质跟右上那根工具条一致：同一块玻璃面、同一档圆角与阴影，
 * 两块浮在地图上的东西看着是一套。
 */
.spots-error {
  position: absolute;
  left: 24rpx;

  /*
   * 抬到底栏之上。地图铺满整屏，而底栏是浮在屏幕上的通栏 ——
   * 空态卡片原本贴着地图下沿，现在那块地正好是底栏。
   */
  bottom: calc(#{$fish-tabbar-height} + env(safe-area-inset-bottom) + 24rpx);
  z-index: 10;
  display: flex;
  align-items: center;
  max-width: calc(100% - 48rpx);
  padding: 16rpx 16rpx 16rpx 24rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-map-panel;
  box-shadow: $smooth-shadow-md;
}

.spots-error__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.spots-error__title {
  color: $fish-ink;
  @include fish-type(caption, 500);
}

.spots-error__reason {
  margin-top: 4rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

.spots-error__retry {
  flex-shrink: 0;
  margin-left: 20rpx;
  padding: 10rpx 24rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent-tint;
  @include fish-press(0.94);
}

.spots-error__retry-text {
  color: $fish-blue-600;
  @include fish-type(caption, 500);
}

/* 重试在飞：按下去不重复发 */
.spots-error__retry--busy {
  opacity: 0.5;
}
</style>
