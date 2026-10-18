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

      地图操作收成**一列** toolbar：顶上是底图循环键，中间一根发丝线，
      底下是定位和回正北两个动作。排右上角、贴着 topInset（导航栏底边）：
      左侧留给手势，底部留给钓点计数浮层和 tabBar，只有右上角是长期空着的。

      竖着摞在这里比横着排还稳：指南针只在地图转过之后才出现，竖排意味着
      它是往下长一格，上面几项一动不动；横排则整条会往左顶，顶到手势区去。

      之前这三块是各自独立的控件，各自带一套材质，读起来像三个不相干的浮层
      而不是一组操作。合成一个外壳之后它们共享同一张皮，「换底图」和
      「动地图」显然是同一件事。
    -->
    <view class="toolbar" :style="{ top: topInset + 'px' }">
      <!--
        底图切换：点一下在三档之间循环，按钮上直接写着当前是哪一档。

        原来三档并排摆着（~276rpx 宽），竖着摞的话列宽就由最宽的那一项说了算 ——
        低频的「换底图」反而替整列决定了压在地图上的宽度。收成循环键之后最宽的
        变成了下面的指南针键，这一列窄到 ~130rpx，只有原来的一半不到。

        按下来说明的是「现在是什么」而不是「有哪些可选」，所以灰底那套选中态
        一起去掉了：没有并列的兄弟项，就没有需要标出来的选中项。文案本身就是值。
      -->
      <view class="toolbar__mode" @tap="cycleBaseMap">
        <image class="toolbar__mode-icon" :src="layersIcon" mode="aspectFit" />
        <text class="toolbar__mode-label">{{ activeBaseMapOption.label }}</text>
      </view>

      <!-- 发丝线。不用 padding 把两组撑开 —— 撑开的只是一段空白，读起来还是一组 -->
      <view class="toolbar__divider" />

      <!--
        定位：图标键，不再挂文字。

        原来三段文案（定位中… / 回到我的位置 / 重新定位）最长六个字，一行排下来
        会比底图键还长，喧宾夺主 —— 定位是次要操作，不该比底图切换更抢眼。
        换成图标正好压回去。状态改由图标自己说：定位中压暗，权限没开染红
        （见 locateIcon）。
      -->
      <view class="toolbar__action" :class="{ 'toolbar__action--busy': locating }" @tap="recenter">
        <image class="toolbar__action-icon" :src="locateIcon" mode="aspectFit" />
      </view>

      <!--
        自绘指南针。

        原生 show-compass 也能开，但它画死在地图右上角，而右上角被微信的胶囊
        按钮常驻盖着 —— 那是个点不到也看不见的死位置。胶囊在小程序里永远在最上层，
        页面内容盖不过去，只能换地方画。toolbar 已经排在胶囊下方（top 取 navBarBottom），
        所以按钮挂这儿。

        只在旋转时出现：地图 enable-rotate 开着，用户能拧，拧完得给条回来的路。
        MapContext 没有重置角度的接口，只能把 rotate 绑成受控属性手动置 0。

        角度跟着一起留着：光一个指南针图标只能告诉用户「地图歪了」，那个数字才
        告诉他偏了多少、拧回去要多少度。图标本身不跟着 rotate 转 —— 一个会自转的
        图标读起来像 loading，而且 needle 的初始指向是东北不是正北，套一层补偿
        角度的常数纯属自找麻烦。角度排在图标正下方，和上面底图键同一套排法，
        顺带把这个键的宽度也收下来（见 .toolbar__action--stack）。
      -->
      <view v-if="isRotated" class="toolbar__action toolbar__action--stack" @tap="resetRotation">
        <image class="toolbar__action-icon" :src="compassIcon" mode="aspectFit" />
        <text class="toolbar__angle">{{ rotationLabel }}°</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type Ref } from 'vue';

import type { MapMarkerItem } from '@/composables/useMapMarkers';
import { icon } from '@/constants/icons';

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
  (e: 'regionchange', payload: { latitude: number; longitude: number; scale: number }): void;
  /** marker 被点中。只回传 markerId，由调用方用 useMapMarkers 的 resolveMarker 换回领域对象 */
  (e: 'markertap', payload: { markerId: number }): void;
  (e: 'update:satellite', value: boolean): void;
  (e: 'update:traffic', value: boolean): void;
  /** 底图整体切了一档。想把选择持久化的页面听这个就够 */
  (e: 'base-map-change', payload: { mode: BaseMapMode; satellite: boolean; traffic: boolean }): void;
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

/**
 * 定位失败 / 权限被拒。
 *
 * 只驱动定位键的图标配色，不参与 recenter 的分支 —— 那条路由仍旧看
 * hasLocation，因为它要区分的是「有没有坐标可用」，不是「是不是被拒」。
 * 分成两个状态是因为首次进入时 hasLocation 也是 false（还没定位完），
 * 拿它当「被拒」的判据会让图标一进来就闪红。
 */
const permissionDenied = ref(false);

/** 指南针图标。见模板里关于「为什么不跟着 rotate 转」那段 */
const compassIcon = icon('compass', 'muted');

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

function locate() {
  locating.value = true;

  uni.getLocation({
    // 必须是 gcj02 —— 小程序 <map> 组件用的是 GCJ-02 火星坐标系。
    // 传 wgs84（GPS 原始坐标）会偏移几百米，这是最常见的对不上问题。
    type: 'gcj02',
    success: (res) => {
      latitude.value = res.latitude;
      longitude.value = res.longitude;
      scale.value = 16;
      hasLocation.value = true;
      permissionDenied.value = false;
    },
    fail: () => {
      // 授权被拒或系统定位不可用：保留默认坐标，靠图标染红告诉用户「定位键按了没用」。
      // 不在这里弹 openSetting —— 用户可能只是定位信号不好，
      // 上来就抢设置页很突兀，按键点一下再去。
      hasLocation.value = false;
      permissionDenied.value = true;
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
 * 没开就把定位键继续留在染红状态，别让它看起来"点了没反应"。
 */
function openLocationSetting() {
  uni.openSetting({
    success: (res) => {
      if (res.authSetting?.['scope.userLocation']) {
        locate();
      } else {
        permissionDenied.value = true;
      }
    },
    fail: () => {
      // 用户没走完设置流程，退回手动重试
      permissionDenied.value = true;
    },
  });
}

/**
 * 定位按钮。
 *
 * 已经拿到过坐标就直接重新定位；拿过且失败说明多半是权限被拒，
 * 这时 getLocation 再调一百遍也是同样的结果，直接带去设置页。
 */
function recenter() {
  if (locating.value) return;
  if (!hasLocation.value) {
    openLocationSetting();
    return;
  }
  locate();
}

/**
 * 视口数值的比对阈值。
 *
 * 微信回报的中心点是浮点，和上一步 setData 进去的值可能只差最后一位。
 * 不设阈值的话，每次 regionchange 都会被判成「变了」而触发一次 patch，
 * 而 patch 本身又会引出 causedBy=update 的 regionchange —— 能绕成死循环。
 * 1e-6 在经纬度上约合 0.1 米，远小于一个像素，不影响观感。
 */
const VIEWPORT_EPSILON = 1e-6;

/** 值没真的变就不赋值，省掉一次无意义的 patch */
function syncViewport(target: Ref<number>, next: number | undefined): void {
  if (typeof next !== 'number') return;
  if (Math.abs(target.value - next) < VIEWPORT_EPSILON) return;
  target.value = next;
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
 * **中心点在 detail.centerLocation 里，不在 detail 顶层。**
 * 官方结构是 {causedBy, type, detail: {rotate, skew, scale, centerLocation, region}}，
 * 顶层没有 latitude/longitude。之前读顶层拿到的是 undefined，经纬度压根没同步，
 * 于是捏合缩放改了 scale 却留着旧中心 —— 这正是弹回用户位置的直接原因。
 * 顶层那两个字段只是兜底，应对个别基础库把中心拍平的情况。
 *
 * rotate 同样要在这儿同步：它为了回正北被绑成了受控属性，适用同一条规则。
 * 漏了它，用户转完地图点任意一处触发 patch，角度就被拽回上一次的值。
 *
 * skew 不在这儿：组件没绑这个属性，它不受控，patch 不会触发重定位，
 * 不构成回弹来源。倾斜也只有开了 enable-overlooking 才会有，这里没开。
 */
function onRegionChange(e: {
  detail?: {
    centerLocation?: { latitude?: number; longitude?: number };
    latitude?: number;
    longitude?: number;
    scale?: number;
    rotate?: number;
  };
}) {
  const detail = e.detail ?? {};
  const center = detail.centerLocation;

  // 同步赋值落在同一批次，微信只会收到一次合并后的更新，中途不会瞬移
  syncViewport(latitude, center?.latitude ?? detail.latitude);
  syncViewport(longitude, center?.longitude ?? detail.longitude);
  syncViewport(scale, detail.scale);
  syncViewport(rotate, detail.rotate);

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

/*
 * toolbar —— 整个地图操作区的**一个**外壳，横着一条。
 *
 * 浮在地图上的控件是**材质**：半透明 + 一层实投影。
 *
 * 没有 backdrop-filter（map 是原生组件，模糊它要重采样整屏纹理），所以
 * 靠「半透明的底 + 更重的投影」这两件事把它推离地图 —— 只做前者会像一块
 * 半透明的贴纸浮在瓦片上，做不到层次。投影要比页面内的卡片重，因为它压的
 * 是一张高对比度的地图，任何浅投影都会被底图吃掉。
 *
 * 竖着摞在这一列：三项从上到下是「换底图」「定位」「回正北」，高度统一，
 * 宽度由底图键决定。align-items: center 让下面两个窄的图标键居中，不贴着
 * 左边沿 —— 靠左对齐的话这一列会像个阶梯。
 */
.toolbar {
  position: absolute;
  right: 24rpx;
  /* top 由 topInset 动态绑定，这里只留出固定的右边距 */
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6rpx;
  border-radius: $fish-radius-lg;
  background-color: rgba(255, 255, 255, 0.88);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.16);
}

/*
 * 底图循环键：图标在上，档位文案落在图标正下方。
 *
 * 和下面两个动作键同一套尺寸（84rpx 高、14rpx 圆角）。图标+文案摞起来比纯图标
 * 高一截，所以三个键一起从 72rpx 抬到 84rpx —— 宁可一起长高，也不能让底图键
 * 单独凸出去，凸出去就读成三个不同的控件，而不是一组。
 *
 * 按下用缩放（fish-press）而不是分段控件那套变暗：它现在是个独立按钮了，
 * 跟下面两个动作键的手感保持一致更重要。
 */
.toolbar__mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 84rpx;
  padding: 0 16rpx;
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
 * 三个键摞在一起，再大会让这一列长得压到导航栏。定位是高频操作，这块尺寸
 * 是能接受的取舍。
 *
 * min-width 不是 44pt 那种安全尺寸，是拿这一列的总宽倒推的：三个键都得塞进
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

/*
 * 指南针键：角度改到图标下面，图标和数字不再并排。
 *
 * 并排的时候这个键有 ~116rpx 宽，是整列最宽的一项 —— 列宽全被它撑着，
 * 底图键和定位键都在给它让位。摞起来之后它比底图键还窄，列宽就交回给
 * 底图键，同时和底图键读成同一套「图标 + 小字」排法。
 */
.toolbar__action--stack {
  flex-direction: column;
}

/* 旋转角。跟图标同色，读成一个整体，而不是「图标 + 一个黑数字」 */
.toolbar__angle {
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption2);

  font-weight: 600;
  line-height: 1;
}
</style>
