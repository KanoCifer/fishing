<template>
  <!--
    钓点详情页 —— 一张满幅头图压顶，白卡从照片下沿浮出来。

    版式是「照片 → 名字 → 钓况 → 信息 → 照片条 → 导航」这条线，
    头图那一块负责让人先看见地方，名字那一块负责让人知道这是哪，
    钓况那一块回答「今天能不能去」。

    层级全靠三样东西撑起来：
    - 头图与导航栏都浮在内容之上（fixed），内容从它们底下过
    - 主体卡上移压住头图下沿 —— 压，不是分
    - 底栏是一道渐隐，内容从它底下沉进去
  -->
  <view class="spot-detail">
    <SpotDetailNav :title="title" :solid="solid" :material="material" @back="onBack" />

    <SpotDetailHero :src="coverSrc" :has-photo="hasPhoto" :height="heroHeight" />

    <view class="spot-detail__body" :style="{ marginTop: -heroOverlap + 'px' }">
      <SpotDetailHead
        v-if="spot"
        class="spot-detail__enter"
        :style="{ animationDelay: enterDelay(1) }"
        :spot="spot"
        :distance="distanceLabel"
      />

      <!--
        钓况这一节等钓况数据到了再出现。

        不是为了「先占个位」—— 是因为小程序组件的 prop 从 undefined
        变成字符串时不会重新渲染（数组和布尔值都正常，只有字符串这条会丢）。
        先建组件再喂字符串，徽标就会一直停在「待定」。
        等数据到位再建，prop 一上来就是终值。
      -->
      <SpotDetailConditions
        v-if="detailStore.index"
        class="spot-detail__enter"
        :style="{ animationDelay: enterDelay(2) }"
        :cells="cells"
        :level="level"
      />

      <SpotDetailInfo v-if="spot" class="spot-detail__enter" :style="{ animationDelay: enterDelay(3) }" :spot="spot" />

      <SpotDetailGallery
        v-if="images.length"
        class="spot-detail__enter"
        :style="{ animationDelay: enterDelay(4) }"
        :images="images"
      />
    </view>

    <SpotDetailDock :distance="distanceLabel" @nav="openNavigation" />
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点详情页 —— 取代原来的 SnapSheet 抽屉版。
 *
 * 抽屉只能露出半屏，钓点这种「照片 + 档案 + 钓况」的信息量本来就装不下；
 * 推成独立页之后，照片能压满一屏，钓况和档案也能一口气读完。
 *
 * 数据分两段到：钓点本体先回来（照片、名字、地址、路况），
 * 钓况随后到 —— 钓况是按**钓点自己的坐标**取的，跟用户当前位置那份不是一回事
 * （见 stores/spotDetail 的说明）。
 */
import { computed, ref } from 'vue';
import { onLoad, onPageScroll } from '@dcloudio/uni-app';

import SpotDetailConditions from '@/components/SpotDetailConditions/SpotDetailConditions.vue';
import SpotDetailDock from '@/components/SpotDetailDock/SpotDetailDock.vue';
import SpotDetailGallery from '@/components/SpotDetailGallery/SpotDetailGallery.vue';
import SpotDetailHead from '@/components/SpotDetailHead/SpotDetailHead.vue';
import SpotDetailHero from '@/components/SpotDetailHero/SpotDetailHero.vue';
import SpotDetailInfo from '@/components/SpotDetailInfo/SpotDetailInfo.vue';
import SpotDetailNav from '@/components/SpotDetailNav/SpotDetailNav.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { SPOT_HERO_HEIGHT_RPX, SPOT_HERO_OVERLAP_RPX, SPOT_PLACEHOLDER_IMAGE } from '@/constants/spot-detail';
import { mediaUrl } from '@/api/upload';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSpotDetailStore } from '@/stores/spotDetail';
import { enterDelay } from '@/utils/motion';
import { buildConditionCells, distanceKm, formatDistance } from '@/utils/spot-conditions';

const detailStore = useSpotDetailStore();
const mapStore = useFishingMapStore();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/**
 * 头图高度与压住量（px）。
 *
 * 设计尺寸是 rpx，这里过一次 upx2px —— 运行时用的是 px，
 * 而且页面要用同一个数算滚动阈值，两处必须同源。
 */
const heroHeight = uni.upx2px(SPOT_HERO_HEIGHT_RPX);
const heroOverlap = uni.upx2px(SPOT_HERO_OVERLAP_RPX);

/**
 * 导航栏反色的滚动阈值（px）。
 *
 * 主体卡的上沿在文档坐标上是「头图高度 − 压住量」；
 * 它滚到导航栏底边以下时，导航栏背后就不是照片了，该反色。
 *
 * 写死一个数是不行的：头图高度是 rpx，在 375pt 机型上是 372px、
 * 在 414pt 上是 411px —— 同一个阈值在两种机型上会一个早翻一个晚翻。
 */
const flipAt = heroHeight - heroOverlap - navBarBottom;

/** 当前滚动位置（px）。onPageScroll 给的 */
const scrollTop = ref(0);

onPageScroll((event) => {
  scrollTop.value = event.scrollTop;
});

const spot = computed(() => detailStore.spot);

/**
 * 照片地址。
 *
 * 库里存的是**服务端相对路径**（如 `gallery/42/xxx.jpg`），
 * 直接当 src 用会 404 —— 得过 mediaUrl() 拼成能加载的地址。
 * 已经是 http 开头的原样返回（迁移过来的老数据可能是完整 URL）。
 */
const images = computed(() => (spot.value?.images ?? []).map(mediaUrl));

/** 有没有真实照片。没有的话头图用占位插画 */
const hasPhoto = computed(() => images.value.length > 0);

/** 头图地址：没有照片时用占位插画 */
const coverSrc = computed(() => (hasPhoto.value ? (images.value[0] ?? '') : SPOT_PLACEHOLDER_IMAGE));

/** 导航栏标题 */
const title = computed(() => spot.value?.name ?? '');

/**
 * 导航栏的两态。
 *
 * 头图上永远压着一道暗渐变（照片和占位插画都有），所以只要头图还在，
 * 导航就该是白字 —— 白箭头压在暗渐变上，黑字压在暗渐变上就糊了。
 * 内容滚上来、头图离开导航栏之后，才换成蓝箭头 + 黑字。
 */
const past = computed(() => scrollTop.value >= flipAt);
const solid = computed(() => past.value);

/** 材质层：内容滚到导航栏底下才显形 */
const material = computed(() => past.value);

/** 钓况四格 */
const cells = computed(() => buildConditionCells(detailStore.now, detailStore.tide));

/** 钓鱼等级。徽标的文案与色调从它来 */
const level = computed(() => detailStore.index?.level);

/**
 * 距离。
 *
 * 后端的 `distance_km` 只有列表请求带了定位中心才有值，
 * `GET /v3/fish/spots/{id}` 不给这个字段 —— 所以这里自己算，
 * 公式与后端 util.DistanceKm 一致（见 utils/spot-conditions）。
 */
const distanceLabel = computed(() => {
  const current = spot.value;
  const user = mapStore.userLocation;
  if (!current || !user) return formatDistance(null);
  return formatDistance(distanceKm(user, current.location));
});

onLoad((options) => {
  const id = options?.id;
  if (!id) {
    uni.showToast({ title: '钓点不存在', icon: 'none' });
    return;
  }

  void detailStore.load(id);

  /*
   * 距离要用用户坐标。
   *
   * 不带 force：已有坐标直接复用，用户拒绝过也不重试 ——
   * 微信在用户拒绝之后不会再弹权限窗，反复调只是反复失败。
   * 从地图页点进来时，那边多半已经问过一轮了。
   */
  void mapStore.locateUser();
});

/**
 * 返回上一页。
 *
 * 页面栈里只有这一页时（分享链接直接打开、开发者工具预览），没有上一页可退，
 * navigateBack 会失败。这时候退回钓点页，而不是让按钮点了没反应。
 */
function onBack() {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.switchTab({ url: '/pages/fishing/index' });
    },
  });
}

/**
 * 打开微信内置地图的导航入口。
 *
 * 用的是小程序自带的 `uni.openLocation`：它把当前这个点摆到微信自己的地图页上，
 * 用户在那页可以一键唤起路线规划与转向导航。系统那条链本来就是完整的，
 * 自己再画一条 Polyline 只会多一层还少一半能力。
 *
 * 坐标直接传，不做转换：钓点的 location 是 GCJ-02，微信地图原生也用 GCJ-02，
 * 换算错了会偏出几百米 —— 比偏个几十米糟糕得多。location 是 [lng, lat]，
 * 而 openLocation 要的是 lat / lng 两个字段，写反了不会报错，只会落到地球另一侧。
 *
 * scale 16 是街道级：默认的 18 已经是楼栋级，钓点多半在水边、路边，
 * 放到那个倍率反而看不见周围的地形。
 */
function openNavigation() {
  const current = spot.value;
  if (!current) return;

  const [lng, lat] = current.location;

  uni.openLocation({
    latitude: lat,
    longitude: lng,
    name: current.name || '钓点',
    scale: 16,
    fail: () => {
      // 正常不会走到这里（不涉及任何权限），但万一是环境不支持，
      // 给个说法比按钮点了没反应强
      uni.showToast({ title: '无法打开地图', icon: 'none' });
    },
  });
}
</script>

<style lang="scss" scoped>
.spot-detail {
  min-height: 100vh;
  background-color: $fish-grouped;
}

.spot-detail__body {
  position: relative;
  z-index: 2;
  padding: 16rpx 24rpx;

  /* 底栏是浮层的，下面这一截留出来，不然最后一段内容被它盖住 */
  padding-bottom: calc(200rpx + env(safe-area-inset-bottom));
  border-radius: $fish-radius-sheet $fish-radius-sheet 0 0;
  background-color: $fish-grouped;
}

/* 入场。延迟由 enterDelay 按序号给，样式只管「怎么动」 */
.spot-detail__enter {
  @include fish-enter;
}
</style>
