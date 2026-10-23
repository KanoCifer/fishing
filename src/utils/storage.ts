/**
 * 本地存储 —— 全项目读写 Storage 的唯一出入口。
 *
 * 为什么要有这一层：小程序没有 localStorage，存储只能走 uni.*Storage，
 * 而每一次读写都要穿过逻辑层与宿主之间的桥，比读一个普通属性贵得多。
 * 更浪费的是**同一个 key 被反复读**：一条带鉴权的请求链里，
 * 拼 header 读一遍 token、刷新守卫再读一遍 token、恢复会话还要再读一遍 ——
 * 读出来的是同一个字符串，问的还是宿主里同一块存储。
 *
 * 所以这里给每个 key 留一份内存副本：第一次读真的落下去，之后都从副本取；
 * 写和删同时更新副本。副本和 Storage 不会不同步 ——
 * 因为**所有**写入都必须走这个模块，项目里没有第二处直写 Storage 的地方。
 *
 * 同一份道理，useViewport / useNavMetrics 也是「算一次就缓存」：
 * 尺寸在一次启动内不变，存储在一次进程内也不该被反复读。
 *
 * 用法上有一条纪律：**改一个值必须整份写回去**。
 * 缓存里放的是整个值，就地改它既不会同步到 Storage，也不会更新缓存 ——
 * 要改就 writeStorage 一次整份。
 */

/**
 * 内存副本。key → 值。
 *
 * 用 Map 而不是普通对象：key 是任意字符串，普通对象会把 '__proto__' 之类的
 * key 当成原型属性处理，Map 不会。
 */
const cache = new Map<string, unknown>();

/**
 * 读一个 key。
 *
 * 读不出来（宿主抛错）就当这个 key 不存在 —— 调用点本来就得处理「没有」这一种情况。
 *
 * 返回的是缓存里的同一个引用：**不要就地改它**。要改就整份写回去。
 */
export function readStorage<T = unknown>(key: string): T {
  if (cache.has(key)) {
    return cache.get(key) as T;
  }

  let value: unknown;
  try {
    value = uni.getStorageSync(key);
  } catch {
    value = undefined;
  }

  cache.set(key, value);
  return value as T;
}

/**
 * 异步读一个 key。
 *
 * 什么时候用它，什么时候用同步版：
 *
 * - **启动链路上（App.onLaunch ~ 首屏渲染完成）只能用这个。**
 *   `getStorageSync` 是同步 API，会阻塞 JS 线程；微信体检有一条
 *   「首屏渲染前多次调用同步 API」，启动期一次都不该有。
 * - 不在启动链路上、又要立刻拿到值（比如读草稿再决定渲染什么），
 *   用同步版 `readStorage`。
 *
 * 读不出来（宿主抛错或 key 不存在）都返回 undefined —— 调用点本来就得处理
 * 「没有」这一种情况。key 不存在时微信回的是空字符串，不是 undefined，
 * 调用点按 falsy 判就够。
 *
 * 这个函数**不写内存副本**：异步读回来的值可能晚于一次同步写，
 * 写进去会把新值盖成旧值。要缓存就用同步版的 readStorage，
 * 或者让调用方自己持有（见 api/client.ts 的 token 内存副本）。
 */
export function readStorageAsync<T = unknown>(key: string): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    try {
      uni.getStorage({
        key,
        success: (res) => resolve(res.data as T | undefined),
        fail: () => resolve(undefined),
      });
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * 写一个 key。返回是否真的写进去了。
 *
 * 只有宿主写成功才更新缓存 —— 写失败时 Storage 里还是旧值，
 * 副本也该是旧值，两边才是一致的。
 */
export function writeStorage(key: string, value: unknown): boolean {
  try {
    uni.setStorageSync(key, value);
  } catch {
    return false;
  }

  cache.set(key, value);
  return true;
}

/**
 * 删一个 key。返回是否真的删掉了。
 *
 * 删除失败就留着副本 —— Storage 里那个值还在，副本跟着它走。
 */
export function removeStorage(key: string): boolean {
  try {
    uni.removeStorageSync(key);
  } catch {
    return false;
  }

  cache.delete(key);
  return true;
}
