/**
 * 把领域层的 MapMarker 翻成 <map> 组件认的 markers 数组。
 *
 * 为什么需要这一层：领域层用 [lng, lat] 和 kind 描述一个点，
 * 而 <map> 组件要的是扁平的 latitude/longitude 加一个本地图片路径 ——
 * 两边形状不一样，中间必须有地方翻译，不然业务组件里会到处散着
 * "从数组下标推 id"、"按 kind 选图标" 这类和业务无关的细节。
 */

import { computed } from 'vue';

import type { FishingSpotKind, MapMarker } from '@/types/fishing';

/**
 * <map> 组件的 markers 元素没有官方类型（@dcloudio/types 里只有 MapContext 的方法，
 * 没有 marker 属性），按实际用到的字段局部声明，不写 any。
 */
export interface MapMarkerItem {
  /**
   * marker 标识，markertap 回调只给这个值。
   * 微信要求它是非 0 的 number —— 用数组下标 +1 既满足要求又天然唯一。
   */
  id: number;
  latitude: number;
  longitude: number;
  /** 本地图片路径。marker 只吃图片，塞不进 HTML —— 这是高德 JS API 时代作废的那套做法 */
  iconPath: string;
  /** 屏幕上显示的边长，单位 px。marker 尺寸不走 rpx */
  width: number;
  height: number;
  /** 锚点，0~1 相对图片宽高。落在针尖上，缩放时钉点才不会飘 */
  anchor: { x: number; y: number };
}

/** marker 显示边长。图标源文件是 80px，缩到 40 显示在高分屏上不糊 */
const MARKER_SIZE = 40;

/**
 * kind → 图标。
 *
 * src/static 下的文件在小程序里挂在根路径，所以是 /static/... 而不是 @/static/...。
 * 拆成子包后这些路径要跟着改，这里集中一处就是为了那时候只改这一行。
 *
 * 图标源文件在 scripts/markers/*.svg，PNG 由 `bash scripts/gen-markers.sh` 烧出来。
 * 新增 kind 时三处都要动：这张表、scripts/markers/ 下那张 SVG、以及 src/constants 之外
 * 的 types/fishing.ts 枚举 —— 少一处，地图上那一片点就会全是同一个图标。
 */
const ICON_BY_KIND: Record<FishingSpotKind, string> = {
  lake: '/static/markers/lake.png',
  river: '/static/markers/river.png',
  reservoir: '/static/markers/reservoir.png',
  pond: '/static/markers/pond.png',
  sea: '/static/markers/sea.png',
  bay: '/static/markers/bay.png',
  estuary: '/static/markers/estuary.png',
  fishing_ground: '/static/markers/fishing_ground.png',
};

/** 未分类（后端 omitempty 把 kind 整个省略了，见 FishingSpot.kind 注释） */
const ICON_UNKNOWN = '/static/markers/unknown.png';

export function markerIconFor(kind: FishingSpotKind | null | undefined): string {
  return kind ? (ICON_BY_KIND[kind] ?? ICON_UNKNOWN) : ICON_UNKNOWN;
}

/**
 * @param source 领域层标记的读取函数，传 getter 而不是数组本身，
 *               这样内部 computed 才会在数据变化时正确重算。
 */
export function useMapMarkers(source: () => MapMarker[]) {
  const markerItems = computed<MapMarkerItem[]>(() =>
    source().map((marker, index) => {
      const [lng, lat] = marker.position;
      return {
        id: index + 1,
        latitude: lat,
        longitude: lng,
        iconPath: markerIconFor(marker.kind),
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        anchor: { x: 0.5, y: 1 },
      };
    }),
  );

  /**
   * markertap 只回传 markerId，靠"id = 下标 + 1"这条约定换回领域对象。
   * 约定只在 markerItems 里建立一次，两边不会错位。
   */
  function resolveMarker(markerId: number): MapMarker | null {
    return source()[markerId - 1] ?? null;
  }

  return { markerItems, resolveMarker };
}
