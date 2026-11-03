import type { ComponentInternalInstance } from 'vue';

/**
 * 交叉观察器（IntersectionObserver）的创建入口。
 *
 * 直接调微信原生 API，不走 uni.createIntersectionObserver：
 * uni 那层处理 create* 系列时不保留第一个参数（组件实例），
 * 组件作用域就丢了 —— 观察器落在页面作用域，看不见自定义组件里的节点，
 * 回调永远不来。模拟器上不一定复现，真机上图表就是不出来。
 *
 * 官方文档：在自定义组件里应使用 this.createIntersectionObserver([options])；
 * wx.createIntersectionObserver(component, options) 是它的等价写法。
 */

/** 观察器选项 */
export type IntersectionObserverOptions = WechatMiniprogram.CreateIntersectionObserverOption;

/**
 * 创建一个作用域限定在组件内的交叉观察器。
 *
 * 拿不到原生组件实例时返回 null —— 这种情况下没有「组件内」的观察器可用，
 * 调用方得自己决定退路（比如直接画，不做可见性判定）。
 *
 * @param instance Vue 内部实例。取原生作用域用
 */
export function createIntersectionObserver(
  instance: ComponentInternalInstance | null,
  options?: IntersectionObserverOptions,
): WechatMiniprogram.IntersectionObserver | null {
  // $scope 是 uni-app 挂在 Vue 实例 ctx 上的原生组件实例，
  // 只有它能创建组件作用域的观察器（与 utils/selectorQuery 同一套取法）。
  const scope = (instance?.proxy as { $scope?: WechatMiniprogram.IAnyObject } | undefined)?.$scope;
  if (!scope) return null;

  return wx.createIntersectionObserver(scope, options);
}
