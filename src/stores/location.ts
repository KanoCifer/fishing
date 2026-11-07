/**
 * 定位状态 —— Pinia 全局单例。
 *
 * 只管「用户在哪」：GPS 坐标、用户自己挑的点、授权状态。
 * 取数（天气 / 潮汐 / 钓点）不在这里 —— 见 stores/conditions 与 stores/spots。
 *
 * 为什么单独一个 store：定位是全应用唯一一份。地图的定位键、结论头的刷新键、
 * 数据页的取数都读它 —— 各存一份会拿到两个略有差异的点，
 * 页面上表现为「地点名闪一下」，而微信权限窗也只会弹一次。
 */

import { ref } from 'vue';
import { defineStore } from 'pinia';

import type { LngLat } from '@/types/fishing';
import { showToast } from '@/utils/toast';

/**
 * 地图默认中心。
 *
 * 还没定位到时用它兜底：先给一份数据，定位到了再覆盖。
 */
export const MAP_CENTER: LngLat = [113.389549, 23.050067];

/**
 * 定位授权状态。
 * - granted 已授权，getLocation 直接给坐标
 * - denied  用户明确拒绝过，微信不会再弹权限窗，只剩设置页一条路
 * - unset   从没问过（第一次进小程序就是这个），getLocation 会弹授权窗
 */
type LocationAuth = 'granted' | 'denied' | 'unset';

function queryLocationAuth(): Promise<LocationAuth> {
  return new Promise((resolve) => {
    uni.getSetting({
      success: (res) => {
        const granted = res.authSetting?.['scope.userLocation'];
        resolve(granted === true ? 'granted' : granted === false ? 'denied' : 'unset');
      },
      fail: () => resolve('unset'),
    });
  });
}

/** 从回调的 errMsg 里取出原因文字，微信给的是字符串 */
function readErrMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'errMsg' in err) {
    return String((err as { errMsg?: unknown }).errMsg ?? '');
  }
  return '';
}

/**
 * 把定位失败翻译成一句能照着做的话。
 *
 * 不给原始 errMsg：那串英文对用户没用（"getLocation:fail system permission denied"），
 * 用户需要知道的是「该开什么」。文案短到能塞进一个 toast。
 */
function describeLocationError(errMsg: string): string {
  if (/system permission denied/i.test(errMsg)) return '请开启手机定位服务';
  if (/privacy|requiredPrivateInfos/i.test(errMsg)) return '定位未获授权';
  if (/timeout/i.test(errMsg)) return '定位超时，请重试';
  return '定位失败，请重试';
}

export const useLocationStore = defineStore('location', () => {
  /**
   * 用户当前位置。
   *
   * 全应用唯一一份：地图的定位键、结论头的刷新键、数据页取数都读它。
   * null = 还没定位到（未授权 / 定位失败 / 还没定位完）。
   */
  const userLocation = ref<LngLat | null>(null);

  /**
   * 用户自己挑的地点。null = 没挑过，看的是定位。
   *
   * 不并进 userLocation：那是 GPS 的位置，地图页的定位键与它是一份。
   * 自己挑的地方只管数据页这一屏，但它得留住 —— 切 tab 回来又跳回定位，
   * 用户会以为地点标签在乱跳。
   */
  const manualLocation = ref<LngLat | null>(null);

  /**
   * 用户明确拒绝过定位授权。
   *
   * 只有这一种情况才值得引导去设置页 —— 微信在用户拒绝之后不会再弹权限窗，
   * 设置页是唯一能重来的路径。其余失败（系统定位没开、隐私协议没同意、网络差）
   * 都能靠重试解决，混进来会让定位键变成只会跳设置页的死键。
   */
  const locationDenied = ref(false);

  /**
   * 最近一次定位失败的说明。空串 = 没有失败。
   *
   * 定位键据此换成「定位已关」的图标：按了没反应这件事必须看得见，
   * 否则用户既不知道出了什么事，也不知道该重试还是该去设置。
   */
  const locationError = ref('');

  /** 正在定位。定位键与刷新键的转圈状态 */
  const locating = ref(false);

  /**
   * 请求用户坐标。
   *
   * 全应用只有这一处调 uni.getLocation：地图的定位键、结论头的刷新键、
   * 数据页的取数共用它。两处各调一次会弹两次权限窗，也会拿到两个略有差异的点，
   * 页面上表现为「地点名闪一下」。
   *
   * force=true 时重新定位（用户主动按定位键或点了刷新）；
   * 否则已有坐标直接复用，定位失败过也不再重试 —— 微信在用户拒绝之后不会再弹
   * 权限窗，反复调只是反复失败。
   */
  let locatePending: Promise<LngLat | null> | null = null;

  async function locateUser(force = false): Promise<LngLat | null> {
    if (!force) {
      if (userLocation.value) return Promise.resolve(userLocation.value);
      if (locationDenied.value) return Promise.resolve(null);
    }

    /*
     * 强制重新定位 = 回到「我这儿」。
     *
     * 用户自己挑的地点在这刻作废：定位键与刷新键都是「重新定位」的意思，
     * 定位回来的是真实现位 —— 留着用户挑的地方，等于拿那个地方的数据
     * 冒充当前位置报账。
     */
    if (force) manualLocation.value = null;
    // 已有请求在飞就等它，不并发第二个
    if (locatePending) return locatePending;

    locating.value = true;

    const pending = (async (): Promise<LngLat | null> => {
      /*
       * 先问授权状态再调 getLocation。
       *
       * 顺序反了会踩两个坑：用户已经拒绝过时，getLocation 不会再弹窗，
       * 只会 fail 回来 —— 调它一百遍也是同一个结果，白白浪费一次交互；
       * 而「明确拒绝」和「从没问过」在界面上要给的引导完全不同，
       * 光看 getLocation 的失败回调区分不出来。
       */
      const auth = await queryLocationAuth();
      if (auth === 'denied') {
        locationDenied.value = true;
        locationError.value = '';
        return null;
      }

      return new Promise<LngLat | null>((resolve) => {
        uni.getLocation({
          // 必须是 gcj02 —— 小程序 <map> 组件用的是 GCJ-02 火星坐标系。
          // 传 wgs84（GPS 原始坐标）会偏移几百米，这是最常见的对不上问题。
          type: 'gcj02',
          success: (res) => {
            userLocation.value = [res.longitude, res.latitude];
            locationDenied.value = false;
            locationError.value = '';
            resolve(userLocation.value);
          },
          fail: async (err) => {
            /*
             * 到这一步授权是 granted 或 unset，仍然失败说明是别的原因。
             *
             * 唯一例外是用户在授权弹窗上点了「拒绝」—— 问授权时用户还没表态，
             * 那一刻拿到的还是 unset，得等弹窗关掉再问一次才准。
             */
            const errMsg = readErrMsg(err);
            const after = await queryLocationAuth();
            const denied = after === 'denied' || /auth deny|authorize:fail/i.test(errMsg);

            locationDenied.value = denied;
            if (denied) {
              // 被拒不是「出错」，是用户做了决定。图标换掉，但别拿一句报错去打扰他
              locationError.value = '';
            } else {
              // 保留上一次的坐标，靠图标换掉告诉用户「定位键按了没用」
              locationError.value = describeLocationError(errMsg);
              showToast(locationError.value);
            }
            resolve(null);
          },
        });
      });
    })().finally(() => {
      locatePending = null;
      locating.value = false;
    });

    locatePending = pending;
    return pending;
  }

  /**
   * 标记定位不可用。
   *
   * 设置页里没开权限时用 —— 这时用户已经明确表态了，定位键就该一直留在「定位不可用」状态，
   * 别让它看起来「点了没反应」。
   */
  function markLocationDenied(): void {
    locationDenied.value = true;
    locationError.value = '';
  }

  return {
    userLocation,
    manualLocation,
    locationDenied,
    locationError,
    locating,
    locateUser,
    markLocationDenied,
  };
});
