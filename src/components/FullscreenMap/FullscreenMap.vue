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

/**
 * 底图选项。
 *
 * 卫星图和路况是 <map> 的两个独立布尔属性（enable-satellite / enable-traffic，
 * 均基础库 2.7.0 起），不是三选一的枚举。界面上按一个「当前值」呈现，是为了让
 * 用户心里只有「当前底图」这一件事；两个属性的实际取值由 selectBaseMap 统一翻译。
 *
 * 这个数组同时是三处事实源：按钮上显示的文案、循环切换的顺序、以及标签用的值。
 * 增删一档只改这里，三处一起跟着变。
 *
 * 注意别走 layer-style（个性化地图 style 编号）那条路：它是静态的，
 * 官方明确不支持动态修改，切不动。
 */
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
    /**
     * 地图是否响应手势（拖动 / 缩放）。
     *
     * 浮层盖在地图上时必须关掉。map 是原生组件，同层渲染只解决了层级，
     * 它的平移手势仍是原生处理的，浮层那层 WebView 事件拦不住 ——
     * 表现就是「拖抽屉的时候，背后的地图也跟着手指平移」。
     * 这是 SnapSheet 把遮罩和把手的事件全改成 catch 之后，
     * 唯一还需要单独处理的一环。
     */
    interactive?: boolean;
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
    interactive: true,
  },
);

const emit = defineEmits<{
  regionchange: [payload: { latitude: number; longitude: number; scale: number }];
  /** marker 被点中。只回传 markerId，由调用方用 useMapMarkers 的 resolveMarker 换回领域对象 */
  markertap: [payload: { markerId: number }];
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

/** 有没有坐标可用。区分的是「有没有点」，不是「是不是被拒」 */
const hasLocation = computed(() => mapStore.userLocation !== null);

/**
 * 定位失败 / 权限被拒。
 *
 * 两处用：给定位键染红，以及让 recenter 走授权补救那条路（见那个函数）。
 *
 * 之所以要和 hasLocation 分成两个状态：hasLocation 答的是「有没有坐标可用」，
 * 首次进入时它也是 false（还没定位完），拿它当「被拒」的判据会让图标一进来就闪红。
 */
const permissionDenied = computed(() => mapStore.locationDenied);

/** 底图循环键的图层图标。压成 muted，让它和文案读成一个整体而不是「图标 + 标签」 */
const layersIcon = icon('layers', 'muted');

/**
 * 定位键图标。
 *
 * 权限没开就染红而不是压灰：压灰和「定位中」撞在一起，分不出是暂时在忙还是
 * 根本定位不了，而这两件事用户该做的下一步完全不同（等一下 vs 去设置页开权限）。
 */
const locateIcon = computed(() =>
  permissionDenied.value ? icon('crosshair', 'destructive') : icon('crosshair', 'ink'),
);

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
 * 已经拿到过坐标就直接重新定位；拿过且失败说明多半是权限被拒，
 * 这时 getLocation 再调一百遍也是同样的结果，直接带去设置页。
 *
 * 判据是「被拒」而不是「有没有坐标」：定位失败时 store 保留上一次的坐标
 * （靠图标染红告诉用户「定位键按了没用」），hasLocation 因此一直为真。
 * 只看它的话，授权页这条唯一的补救路径就再也进不去了 —— 用户在微信设置里
 * 撤销过权限后，按键只会反复重试注定失败的 getLocation。
 */
function recenter() {
  if (locating.value) return;
  if (!hasLocation.value || permissionDenied.value) {
    openLocationSetting();
    return;
  }
  void locate(true);
}

/**
 * 视口数值的比对阈值：按当前缩放层级换算成「一个像素」。
 *
 * 这个阈值回答的是「地图回报的视口和当前受控属性是不是同一个点」。
 *
 * 定得太小会出事：地图把视口中心换算回经纬度时必然带浮点误差 ——
 * 不少实现是把视口中心吸附到像素网格上再换算回去的，
 * 于是回报值和真实值最多差半个像素。阈值比它还小的话，
 * 地图每次回报都被判成「用户又挪了地图」，于是又写回受控属性 →
 * 又 setData → 地图重载 → 又回报……绕成死循环，电脑端尤其明显。
 *
 * 取「一个像素」而不是更小的数，有两个好处：
 * 1. 误差一定被盖住 —— 像素级的换算误差不可能超过一个像素；
 * 2. 阈值带来的滞后最多一个像素，地图重载时顶多偏一个像素，看不出来，
 *    「受控属性始终贴着真实视口」这条性质也就保住了。
 *
 * 之所以要按缩放层级换算而不是写死一个度数：同一个度数在 12 级和 18 级
 * 下差的米数差了几百倍，写死一个值要么在高层级上放得太松、
 * 要么在低层级上放得太紧。
 */
function pixelTolerance(scale: number): number {
  // 瓦片边长 256px，缩放层级每加 1 瓦片边长翻倍，
  // 整个世界被摊成 256 * 2^scale 个像素宽
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

/**
 * 视口变化事件的形状。
 *
 * 官方结构是 {causedBy, type, detail: {rotate, skew, scale, centerLocation, region}}。
 * causedBy 的取值见微信 map 组件文档「regionchange 返回值」：
 * - begin 阶段：gesture（手势触发）、update（接口触发）
 * - end 阶段：drag（拖动导致）、scale（缩放导致）、update（调用更新接口导致）
 */
interface RegionChangeEvent {
  /**
   * 视野变化的原因。
   *
   * update = 地图是被 setData 挪动的，也就是我们自己写回属性引发的回声。
   */
  causedBy?: string;
  /** begin（视野开始变化）/ end（视野变化结束） */
  type?: string;
  detail?: {
    centerLocation?: { latitude?: number; longitude?: number };
    latitude?: number;
    longitude?: number;
    scale?: number;
  };
}

/**
 * 视口变化（缩放 / 拖动），这三个值必须**一起**同步回本地 ref。
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
 * **中心点在 detail.centerLocation 里，不在 detail 顶层。**
 * 官方结构是 {causedBy, type, detail: {rotate, skew, scale, centerLocation, region}}，
 * 顶层没有 latitude/longitude。之前读顶层拿到的是 undefined，经纬度压根没同步，
 * 于是捏合缩放改了 scale 却留着旧中心 —— 这正是弹回用户位置的直接原因。
 * 顶层那两个字段只是兜底，应对个别基础库把中心拍平的情况。
 *
 * rotate 不在这儿：地图关了旋转（enable-rotate=false），角度恒为 0，
 * 也没有绑成受控属性，不构成回弹来源。
 *
 * skew 同理：组件没绑这个属性，它不受控，patch 不会触发重定位。
 * 倾斜也只有开了 enable-overlooking 才会有，这里没开。
 */
function onRegionChange(e: RegionChangeEvent) {
  const detail = e.detail ?? {};
  const center = detail.centerLocation;

  // 回声事件：视野的变化是我们自己改属性引起的，不是用户操作。
  //
  // 官方语义里 causedBy=update 就是「调用更新接口导致」——地图被 setData
  // 挪动之后回报的那一次。必须把它和用户操作分开，否则就是这个死循环：
  //   regionchange → 写回受控属性 → setData 挪地图 → 地图回报 update
  //   → 又写回受控属性 → setData 挪地图 → ……
  // 每一轮都让地图重新加载一遍瓦片，电脑端表现成地图一直转圈重载。
  //
  // 手机端不容易撞上：地图回报的中心点常常恰好等于写进去的值，
  // 被阈值挡掉了。电脑端的窗口尺寸和缩放比跟手机不一样，
  // 地图把视口中心换算回经纬度时误差更大（亚像素级），
  // 每一轮都超过阈值，每一轮都被误判成「用户又挪了地图」，循环就停不下来。
  //
  // 直接丢掉：此刻受控属性里存的就是我们写进去的值，
  // 也就是地图当前所在的位置，本来就不需要再写一遍。
  if (e.causedBy === 'update') return;

  // 同步赋值落在同一批次，微信只会收到一次合并后的更新，中途不会瞬移
  const tolerance = pixelTolerance(
    typeof detail.scale === 'number' ? detail.scale : scale.value,
  );
  syncViewport(latitude, center?.latitude ?? detail.latitude, tolerance);
  syncViewport(longitude, center?.longitude ?? detail.longitude, tolerance);
  syncViewport(scale, detail.scale, SCALE_EPSILON);

  emit('regionchange', {
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
  emit('markertap', { markerId });
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
  padding: 0px;
  border-radius: $fish-radius-lg;
  background-color: rgba(255, 255, 255, 0.88);
  box-shadow: $smooth-shadow-md;
}

.toolbar__mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 84rpx;
  padding: 0 4rpx;
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
 * 那样字距和行高都没了，正是 uni.scss 反对的那种写法。所以「改小」到底就是
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
  height: 84rpx;
  min-width: 76rpx;
  padding: 0 10rpx;
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
