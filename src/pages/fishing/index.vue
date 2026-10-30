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
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点页 —— 全屏地图 + 钓点标记。
 */
import { ref } from 'vue';
import { onLoad, onReady, onShareAppMessage } from '@dcloudio/uni-app';

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
  setTimeout(() => {
    void mapStore.fetchSpots();

    /*
     * 恢复会话。
     *
     * 这一页是 tabBar 首页，冷启动就落在这儿 —— 而工具条上的「投稿」键
     * 取决于有没有登录。不恢复就判断不出来：用户明明是登录着的，
     * 却因为进程重启没了内存里的用户，就看不到投稿入口了。
     *
     * 跟取钓点放在同一个宏任务里：这一页是启动落点，
     * 启动阶段不能有请求（见 docs/mp-weixin-network.md）。
     *
     * 没登录不会白发请求 —— restore() 读到本地没有 token 就直接返回。
     */
    void session.restore();
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
</style>
