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

    <view class="toolbar" :style="{ top: topInset + 'px' }">
      <view class="toolbar__mode" @tap="cycleBaseMap">
        <image class="toolbar__mode-icon" :src="layersIcon" mode="aspectFit" />
        <text class="toolbar__mode-label">{{ activeBaseMapOption.label }}</text>
      </view>

      <view class="toolbar__divider" />
      <view class="toolbar__action" :class="{ 'toolbar__action--busy': locating }" @tap="recenter">
        <image class="toolbar__action-icon" :src="locateIcon" mode="aspectFit" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type Ref } from 'vue';

import type { MapMarkerItem } from '@/composables/useMapMarkers';
import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';

/** 底图模式：标准 / 卫星影像 / 实时路况 */
type BaseMapMode = 'standard' | 'satellite' | 'traffic';

interface BaseMapOption {
  value: BaseMapMode;
  label: string;
}

const BASE_MAP_OPTIONS: BaseMapOption[] = [
  { value: 'standard', label: '地图' },
  { value: 'satellite', label: '卫星' },
  { value: 'traffic', label: '路况' },
];

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
    traffic: false,
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
  /** 底图整体切了一档。想把选择持久化的页面听这个就够 */
  'base-map-change': [payload: { mode: BaseMapMode; satellite: boolean; traffic: boolean }];
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

/** 底图循环键的图层图标。压成 muted，让它和文案读成一个整体而不是「图标 + 标签」 */
const layersIcon = icon('layers', 'muted');

/**
 * 定位键图标。
 *
 * 定位失败就染红而不是压灰：压灰和「定位中」撞在一起，分不出是暂时在忙还是
 * 根本定位不了，而这两件事用户该做的下一步完全不同（等一下 vs 去设置页开权限）。
 */
const locateIcon = computed(() => (locateFailed.value ? icon('crosshair', 'destructive') : icon('crosshair', 'ink')));

/** 由两个布尔反推当前档位，供按钮显示和循环切换用 */
const activeBaseMap = computed<BaseMapMode>(() =>
  satellite.value ? 'satellite' : traffic.value ? 'traffic' : 'standard',
);

/**
 * 当前档位对应的选项本身。
 *
 * 文案和循环顺序都从这一份选项表推出来，不各自另存一份 —— 否则一旦有一处
 * 漏改，就会出现「按钮写着卫星、切下去却是路况」这种对不上的状态。
 *
 * 兜底取第一档：activeBaseMap 永远返回这三档之一，这里只是让 TS 认得出
 * find 的返回值可能是 undefined。
 */
const activeBaseMapOption = computed(
  () => BASE_MAP_OPTIONS.find((opt) => opt.value === activeBaseMap.value) ?? BASE_MAP_OPTIONS[0],
);

/**
 * 点底图键：往后走一档，到头回开头。
 *
 * 循环而不是弹菜单：底图只有三档，弹一次选择器比结果本身还重。
 * 顺序取自 BASE_MAP_OPTIONS，界面摆过的顺序就是循环的顺序，不另定一个。
 */
function cycleBaseMap() {
  const order = BASE_MAP_OPTIONS.map((opt) => opt.value);
  selectBaseMap(order[(order.indexOf(activeBaseMap.value) + 1) % order.length]);
}

/**
 * 切底图。
 *
 * 两个布尔一起赋值，避免出现「卫星 + 路况」这种界面上选不出来的组合。
 * 切底图只是让微信换一批瓦片重新渲染，视口不动 —— 因为经纬度 / 缩放在
 * onRegionChange 里始终跟地图内部真实视口同步着，这次 patch 传下去的还是
 * 「本来就在的位置」，不会把用户弹回定位点。
 */
function selectBaseMap(mode: BaseMapMode) {
  const nextSatellite = mode === 'satellite';
  const nextTraffic = mode === 'traffic';

  satellite.value = nextSatellite;
  traffic.value = nextTraffic;

  emit('update:satellite', nextSatellite);
  emit('update:traffic', nextTraffic);
  emit('base-map-change', { mode, satellite: nextSatellite, traffic: nextTraffic });
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

function pixelTolerance(scale: number): number {
  return 360 / (256 * Math.pow(2, scale));
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
  if (e.causedBy === 'scale') return;
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
  padding: 8rpx 16rpx;
  border-radius: $fish-radius-lg;
  background-color: rgba(255, 255, 255, 0.88);
  box-shadow: $smooth-shadow-md;
}

.toolbar__mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 64rpx;
  padding: 0;
  border-radius: 14rpx;
  @include fish-press(0.94);
}

.toolbar__mode-icon {
  width: 32rpx;
  height: 32rpx;
}

/*
 * 档位文案，压在图标下面。
 *
 * caption2（11pt）是字阶里最小的一级，再小就只能写字号、绕过整套字阶 ——
 * 那样字距和行高都没了，正是令牌层 _type.scss 反对的那种写法。所以「改小」到底就是
 * 这一级。line-height 收成 1：默认的 1.3 会在这一个两行高的格子里塞进一段
 * 看不见的行距，图标和文案之间看着像隔了双份。
 *
 * secondaryLabel + 加粗：这一列里只有它需要被读出来（另外两个是纯图标），
 * 用 muted 是不跟下面定位键的 ink 抢主色，600 是在 muted 上仍然读得清。
 */
.toolbar__mode-label {
  margin-top: 6rpx;
  color: $fish-muted;
  @include fish-type(caption2);

  font-weight: 600;
  line-height: 1;
}

/*
 * 两组之间的发丝线，竖着摞的时候它就横过来。
 *
 * 只画 32rpx 长而不是拉满整个内容宽：这一列里最宽的是底图键，满宽的线会和
 * 它等长，看着像把底图键从中间切开了。短一点才读得出「这里分两组」，
 * 而不是一条排版线。
 */
.toolbar__divider {
  width: 32rpx;
  height: 1rpx;
  margin: 6rpx 0;
  background-color: $fish-border-40;
}

/*
 * 图标动作键。
 *
 * 84rpx ≈ 42pt，和底图键齐平（见上面那条为什么抬高）。没到 44pt 的原因是
 * 键摞在一起，再大会让这一列长得压到导航栏。定位是高频操作，这块尺寸
 * 是能接受的取舍。
 *
 * min-width 不是 44pt 那种安全尺寸，是拿这一列的总宽倒推的：键都得塞进
 * 一条压在地图上的窄列里，宽度让位给高度。倒推出来的 76rpx ≈ 38pt 偏小，
 * 但仍然远大于图标本身（32rpx），不至于难点。
 *
 * 这里没套 fish-press：它只带 transform 的 transition，而定位状态切换还要淡
 * opacity，两条 transition 写全，省得后写的把先写的覆盖掉。
 */
.toolbar__action {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 64rpx;
  border-radius: 14rpx;

  transition:
    transform $fish-dur-base $fish-spring,
    opacity $fish-dur-fast $fish-ease-out;

  &:active {
    transform: scale(0.92);
    transition-duration: $fish-dur-fast;
  }
}

/*
 * 定位中：压暗。
 *
 * 不转圈 —— 定位通常几百毫秒就回来了，一个闪一下的 spinner 比压暗更吵。
 * 压暗同时也是「按了没反应」的合理解释：recenter 在 locating 期间本来就直接 return。
 */
.toolbar__action--busy {
  opacity: 0.35;
}

.toolbar__action-icon {
  width: 32rpx;
  height: 32rpx;
}
</style>
