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
      :enable-satellite="satellite"
      :enable-traffic="traffic"
      :enable-zoom="interactive"
      :enable-scroll="interactive"
      :enable-rotate="false"
      :show-compass="false"
      :enable-poi="showLocation"
      @regionchange="onRegionChange"
      @markertap="onMarkerTap"
    />

    <view class="toolbar" :style="{ top: topInset + 16 + 'px' }">
      <view class="toolbar__btn" :class="{ 'toolbar__btn--on': satellite }" @tap="toggleSatellite">
        <image class="toolbar__btn-icon" :src="satelliteIcon" mode="aspectFit" />
      </view>

      <view class="toolbar__btn" :class="{ 'toolbar__btn--on': traffic }" @tap="toggleTraffic">
        <image class="toolbar__btn-icon" :src="trafficIcon" mode="aspectFit" />
      </view>

      <view class="toolbar__divider" />

      <view class="toolbar__btn" @tap="emitCreate">
        <image class="toolbar__btn-icon" :src="createIcon" mode="aspectFit" />
      </view>

      <view class="toolbar__btn" :class="{ 'toolbar__btn--busy': locating }" @tap="recenter">
        <image class="toolbar__btn-icon" :src="locateIcon" mode="aspectFit" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type Ref } from 'vue';

import type { MapMarkerItem } from '@/composables/useMapMarkers';
import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';

/**
 * 底图的两个开关。
 *
 * 卫星与路况是**两个独立开关**，不是同一个枚举里的三档：
 * 微信的原生地图支持「卫星影像上叠一层实时路况」，两者不互斥。
 * 合成一档就等于把这个组合从界面上拿掉了 —— 用户在卫星图上看路况是常事。
 * 「标准地图」不是一个状态，它是两个开关都关时的样子。
 */
interface BaseMapState {
  satellite: boolean;
  traffic: boolean;
}

const props = withDefaults(
  defineProps<{
    /** 初始经度（GCJ-02 火星坐标系） */
    latitude?: number;
    longitude?: number;
    /** 缩放层级，3~20，默认 16 约等于街道级 */
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

    interactive?: boolean;
  }>(),
  {
    latitude: 30.2741,
    longitude: 120.1551,
    scale: 11,
    showLocation: true,
    topInset: 0,
    markers: () => [],
    satellite: false,
    traffic: true,
    interactive: true,
  },
);

const emit = defineEmits<{
  /**
   * 视野变了。
   *
   * 事件名是驼峰的 `regionChange`，不是 `regionchange` ——
   * 后者是小程序 `<map>` 的原生事件名。父组件上的 `@regionchange` 会被编译成
   * `bindregionchange` 绑在自定义组件上，微信会让它同时接住两条路：
   * 组件内部 `triggerEvent` 派发的一条，和 `<map>` 原生 markertap 冒泡出组件的一条。
   * 于是同一个监听器被打两次。
   */
  regionChange: [payload: { latitude: number; longitude: number; scale: number }];
  /**
   * marker 被点中。只回传 markerId，由调用方用 useMapMarkers 的 resolveMarker 换回领域对象。
   *
   * 驼峰的理由同上：`markertap` 是 `<map>` 的原生事件名，同名会双触发。
   */
  markerTap: [payload: { markerId: number }];
  'update:satellite': [value: boolean];
  'update:traffic': [value: boolean];
  /** 底图的两个开关都变了。想把选择持久化的页面听这个就够 */
  'base-map-change': [payload: BaseMapState];
  /**
   * 点了「新建」。
   *
   * 只抛事件，不自己跳页：组件不知道「新建钓点」是什么、也不知道该带什么参数，
   * 那是业务，交给宿主页去导航。
   */
  create: [];
}>();

const latitude = ref(props.latitude);
const longitude = ref(props.longitude);
const scale = ref(props.scale);

/** 底图两个布尔属性，同样受控，父组件也能改 */
const satellite = ref(props.satellite);
const traffic = ref(props.traffic);

/**
 * 坐标由 store 统一持有。
 *
 * 全应用只调一次 uni.getLocation（见 useFishingMapStore 的 locateUser）：
 * 地图的定位键和天气取数用的是同一份坐标，两边各调一次会弹两次权限窗，
 * 也会拿到两个略有差异的点。
 */
const mapStore = useFishingMapStore();

/** 定位中。转圈状态也用 store 那一份，两处不必各记一个 */
const locating = computed(() => mapStore.locating);

/**
 * 定位失败 / 权限被拒。
 *
 * 两处用：给定位键染红，以及让 recenter 走授权补救那条路（见那个函数）。
 *
 * 之所以要分成两个状态：被拒答的是「用户明确拒绝了，去设置页才有用」，
 * 失败答的是「这次没成，再试一次可能就成了」。两者的下一步完全不同。
 */
const permissionDenied = computed(() => mapStore.locationDenied);

/**
 * 定位键当前该不该报警。
 *
 * 被拒和其他失败都算「按了没用」，图标上一视同仁；
 * 差别在点击之后走哪条路 —— 被拒去设置页，其他直接重试。
 */
const locateFailed = computed(() => permissionDenied.value || mapStore.locationError !== '');

/**
 * 卫星键的图标。
 *
 * 用地球（earth）而不是卫星：卫星是「谁拍的」，地球是「你要看哪一层」——
 * 这一键切的是底图（卫星影像），图标该说的是范围，不是来源。
 *
 * 开时染品牌蓝、关时压 muted：图标是一份颜色烤死的 data URI，拿不到状态属性，
 * 「开 / 关」只能靠换一份色值来表达。
 */
const satelliteIcon = computed(() => icon('earth', satellite.value ? 'blue' : 'muted'));

/** 路况键的图标。配色规则同卫星键 */
const trafficIcon = computed(() => icon('road', traffic.value ? 'blue' : 'muted'));

/**
 * 新建键上的加号。
 *
 * 用 ink 而不是品牌蓝：蓝色在这条工具条里已经被「开关打开」占用了
 * （卫星 / 路况打开时图标染蓝），新建键要是也是蓝的，就分不清
 * 「这一层开着」和「这是一个动作」。
 *
 * 也不套实心圆：一枚实心的蓝块压在一列细键中间，它就成了整条工具条
 * 唯一被看见的东西，而这四枚键里没有哪一枚比另一枚更重要。
 */
const createIcon = icon('plus', 'ink');

/**
 * 定位键图标。
 *
 * 定位失败就染红而不是压灰：压灰和「定位中」撞在一起，分不出是暂时在忙还是
 * 根本定位不了，而这两件事用户该做的下一步完全不同（等一下 vs 去设置页开权限）。
 */
const locateIcon = computed(() => (locateFailed.value ? icon('crosshair', 'destructive') : icon('crosshair', 'ink')));

/**
 * 卫星开关。
 *
 * 与路况互不影响：微信的原生地图支持「卫星影像上叠一层实时路况」，
 * 两个键各管各的，谁也不替谁关。
 */
function toggleSatellite() {
  setBaseMap({ satellite: !satellite.value, traffic: traffic.value });
}

/** 路况开关。规则同卫星 */
function toggleTraffic() {
  setBaseMap({ satellite: satellite.value, traffic: !traffic.value });
}

/**
 * 改底图的两个开关。
 *
 * 一次改完再 emit：两个键各自独立，中途只改一个会让父组件拿到半新半旧的状态。
 *
 * 切底图只是让微信换一批瓦片重新渲染，视口不动 —— 因为经纬度 / 缩放在
 * onRegionChange 里始终跟地图内部真实视口同步着，这次 patch 传下去的还是
 * 「本来就在的位置」，不会把用户弹回定位点。
 */
function setBaseMap(next: BaseMapState) {
  satellite.value = next.satellite;
  traffic.value = next.traffic;

  emit('update:satellite', next.satellite);
  emit('update:traffic', next.traffic);
  emit('base-map-change', { satellite: next.satellite, traffic: next.traffic });
}

/**
 * 新建键。
 *
 * 只抛事件：组件不知道「新建钓点」是什么、也不知道该跳去哪一页，
 * 那是业务，交给宿主页去导航（见钓点页的 openCreate）。
 */
function emitCreate() {
  emit('create');
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

/**
 * 定位：把视口挪到用户所在的位置。
 *
 * 坐标由 store 取，这里只负责挪地图 —— 天气取数用的是同一份坐标，
 * 地图中心和数据页的地点名因此永远说的是同一个地方。
 *
 * force=true 是「重新定位」（定位键）：即便已经有坐标也再取一次，
 * 用户可能已经换了个位置。
 */
async function locate(force = false): Promise<void> {
  const location = await mapStore.locateUser(force);
  if (!location) return;

  const [lng, lat] = location;
  latitude.value = lat;
  longitude.value = lng;
  scale.value = 16;
}

/**
 * 引导去设置页开定位。
 *
 * 用户拒绝授权后小程序**不会再次弹权限窗**，唯一能重来的路径就是设置页。
 * openSetting 返回时会带上用户在设置里做的选择：开了就重新定位，
 * 没开就把定位键继续留在染红状态，别让它看起来"点了没反应"。
 */
function openLocationSetting() {
  uni.openSetting({
    success: (res) => {
      if (res.authSetting?.['scope.userLocation']) {
        void locate(true);
      } else {
        mapStore.markLocationDenied();
      }
    },
    fail: () => {
      // 用户没走完设置流程，退回手动重试
      mapStore.markLocationDenied();
    },
  });
}

/**
 * 定位按钮。
 *
 * 只有「用户明确拒绝过授权」才带去设置页 —— 微信在拒绝之后不会再弹权限窗，
 * 设置页是唯一能重来的路径。其余情况（从没问过、系统定位没开、网络差）
 * 都直接重试：跳设置页解决不了它们，只会让用户在一个用不上的页面里干瞪眼。
 *
 * 判据是「被拒」而不是「有没有坐标」：定位失败时 store 保留上一次的坐标，
 * 「还没定位到」和「被拒了」是两回事 —— 把前者也当成被拒，
 * 定位键就成了一把只会跳设置页、永远定位不了的死键。
 */
function recenter() {
  if (locating.value) return;
  if (permissionDenied.value) {
    openLocationSetting();
    return;
  }
  void locate(true);
}

function pixelTolerance(zoomLevel: number): number {
  return 360 / (256 * Math.pow(2, zoomLevel));
}

/**
 * 缩放层级的比对阈值。
 *
 * 缩放层级没有「亚像素」这回事，但同样有浮点误差
 * （地图内部是 16，回报 16.000001 这种）。0.0001 级远小于一次捏合的幅度
 * （捏一次至少半级），看不出来，但足以挡住这类噪声。
 */
const SCALE_EPSILON = 1e-4;

/** 值没真的变就不赋值，省掉一次无意义的 patch */
function syncViewport(target: Ref<number>, next: number | undefined, epsilon: number): void {
  if (typeof next !== 'number') return;
  if (Math.abs(target.value - next) < epsilon) return;
  target.value = next;
}

interface RegionChangeEvent {
  /**
   * 视野变化的原因。
   *
   * update = 地图是被 setData 挪动的，也就是我们自己写回属性引发的回声。
   */
  causedBy: 'gesture' | 'update' | 'drag' | 'scale';
  /** begin（视野开始变化）/ end（视野变化结束） */
  type: 'begin' | 'end';
  detail?: {
    centerLocation?: { latitude?: number; longitude?: number };
    latitude?: number;
    longitude?: number;
    scale?: number;
    rotate?: number;
    skew?: number;
  };
}

function onRegionChange(e: RegionChangeEvent) {
  const detail = e.detail ?? {};
  const center = detail.centerLocation;
  if (e.causedBy === 'scale' || e.causedBy === 'drag') return;
  if (e.causedBy === 'update') return;

  const tolerance = pixelTolerance(typeof detail.scale === 'number' ? detail.scale : scale.value);
  syncViewport(latitude, center?.latitude, tolerance);
  syncViewport(longitude, center?.longitude, tolerance);
  syncViewport(scale, detail.scale, SCALE_EPSILON);

  emit('regionChange', {
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
  if (typeof markerId !== 'number') return;
  emit('markerTap', { markerId });
}

onMounted(() => {
  void locate();
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

.toolbar {
  position: absolute;
  right: 24rpx;
  /* top 由 topInset 动态绑定，这里只留出固定的右边距 */
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 左右只留 8rpx：这一列是压在地图上的一根细柱，白面越宽越像一块招牌 */
  padding: 8rpx;
  border-radius: $fish-radius-lg;
  background-color: rgba(255, 255, 255, 0.88);
  box-shadow: $smooth-shadow-md;
}

/*
 * 工具条按键。
 *
 * 命中区 88rpx 见方（44pt，iOS 判定为可放心点按的最小尺寸），
 * 图标 36rpx 居中 —— 这一列压在地图上，手指是盲按的，点不准最要命。
 */
.toolbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  border-radius: 18rpx;

  /*
   * 这里没套 fish-press：它只带 transform 的 transition，而这一列还要淡
   * opacity（定位中）、淡入淡出底色（开关打开），三条 transition 写全，
   * 省得后写的把先写的覆盖掉。
   *
   * 时长照 fish-press 的规矩：抬手回弹 260ms（$fish-dur-press），
   * 底色与透明度走 100ms（$fish-dur-fast）—— 状态切换是瞬时的，
   * 拉成 500ms 会读成「卡了一下」。
   */
  transition:
    transform $fish-dur-press $fish-spring,
    opacity $fish-dur-fast $fish-ease-out,
    background-color $fish-dur-fast $fish-ease-out;

  &:active {
    transform: scale(0.92);
    transition-duration: $fish-dur-fast;
  }
}

/*
 * 开关打开：淡蓝底 + 品牌蓝图标。
 *
 * 只换图标颜色不够 —— 两个键挨在一起，一个蓝一个灰，
 * 用户得盯着看才知道哪个开着，底色才是「这个开着」的第一眼信号。
 */
.toolbar__btn--on {
  background-color: $fish-accent-tint;
}

/*
 * 定位中：压暗。
 *
 * 不转圈 —— 定位通常几百毫秒就回来了，一个闪一下的 spinner 比压暗更吵。
 * 压暗同时也是「按了没反应」的合理解释：recenter 在 locating 期间本来就直接 return。
 */
.toolbar__btn--busy {
  opacity: 0.35;
}

.toolbar__btn-icon {
  width: 36rpx;
  height: 36rpx;
}

/*
 * 两组之间的发丝线，竖着摞的时候它就横过来。
 *
 * 只画 32rpx 长而不是拉满整个内容宽：满宽的线会和上面两枚键的宽度对齐，
 * 看着像把工具条从中间切开了。短一点才读得出「上面是底图开关、下面是动作」。
 */
.toolbar__divider {
  width: 32rpx;
  height: 1rpx;
  margin: 6rpx 0;
  background-color: $fish-border-40;
}
</style>
