import type { ComponentInternalInstance } from 'vue';

/**
 * 微信原生实例上我们唯一用到的方法。
 *
 * $scope 是 uni-app 挂在 Vue 实例 ctx 上的原生组件实例，
 * 拿到它就能直接调到微信官方推荐的那条路径：this.createSelectorQuery()。
 */
interface MpScope {
  createSelectorQuery?: () => UniApp.SelectorQuery;
}

/**
 * 拿一个「作用域限定在当前组件内」的 SelectorQuery。
 *
 * 为什么不直接写 uni.createSelectorQuery().in(instance)：
 *
 * 1. uni 的 .in() 内部读的是 component.$scope。传 Vue 内部实例
 *    （getCurrentInstance() 的返回值）时 $scope 取不到，会退化成一份
 *    字段全是 undefined 的 mock，作用域等于没限定。
 * 2. glass-easel 下 wx.createSelectorQuery() 走的是兼容层，比实例上的
 *    createSelectorQuery() 慢一截 —— 微信官方适配指引把这条列为
 *    「应尽量使用后者」。
 *
 * 所以统一走原生实例，也就是官方的 this.createSelectorQuery()。
 */
export function createSelectorQuery(
  instance: ComponentInternalInstance | null
): UniApp.SelectorQuery {
  const scope = (instance?.proxy as { $scope?: MpScope } | undefined)?.$scope;

  if (typeof scope?.createSelectorQuery === 'function') {
    return scope.createSelectorQuery();
  }

  // 兜底：拿不到原生实例时退回 uni 的写法，行为退化成页面级查询
  return uni.createSelectorQuery().in(instance);
}
