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
 * 写和删同时更新副本。**这份副本是这一轮会话里的唯一真源** ——
 * 别的模块不再各自留一份 token 副本，值只存在这里。
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
 * 每个 key 的「写入代数」。
 *
 * 用途：异步读回来的值可能晚于一次同步写 —— 写进去会把新值盖成旧值。
 * 记下这个 key 被动过几次，异步读只在代数没变过时才落副本。
 */
const generations = new Map<string, number>();

/** 记一次「这个 key 的值动过了」 */
function bumpGeneration(key: string): void {
  generations.set(key, (generations.get(key) ?? 0) + 1);
}

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

  // 同步读也算一次「读」：此刻在飞的异步读不能覆盖它
  bumpGeneration(key);
  cache.set(key, value);
  return value as T;
}

/**
 * 只读内存副本，不碰宿主。
 *
 * 用途：拼请求头这类**启动链路上**要用的值 —— 不能为它同步读一次 Storage
 * （同步 API 会阻塞 JS 线程，微信体检会数首屏前的同步调用次数）。
 * 拿不到就是拿不到，宁可给空串。
 *
 * 与 readStorage 的区别就这一条：不落下去读。
 */
export function peekStorage<T = unknown>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
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
 * 读回来后会落进内存副本，但**只在期间没人动过这个 key 时**才落 ——
 * 异步读可能晚于一次写入，落进去就把新值盖成旧值。
 */
export function readStorageAsync<T = unknown>(key: string): Promise<T | undefined> {
  const startedAt = generations.get(key) ?? 0;

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
  }).then((value) => {
    if ((generations.get(key) ?? 0) === startedAt) {
      cache.set(key, value);
    }
    return value;
  });
}

/**
 * 写一个 key。返回是否真的写进了宿主存储。
 *
 * 内存副本**无论宿主写成功与否都会更新** —— 副本是这一轮会话的唯一真源，
 * 宿主写失败只说明「这次没落盘」（重启后会读回旧值），
 * 不说明「这一轮的值不算数」：登录刚成功时写失败的话，
 * 这一轮所有请求都不带 Authorization，用户会以为自己登了个寂寞。
 */
export function writeStorage(key: string, value: unknown): boolean {
  bumpGeneration(key);
  cache.set(key, value);

  try {
    uni.setStorageSync(key, value);
  } catch {
    return false;
  }

  return true;
}

/**
 * 删一个 key。返回是否真的从宿主存储里删掉了。
 *
 * 副本一律删掉，理由同 writeStorage：用户这一轮已经「退出了」，
 * 留着副本就等于一枚已经作废的 token 还在发请求。
 */
export function removeStorage(key: string): boolean {
  bumpGeneration(key);
  cache.delete(key);

  try {
    uni.removeStorageSync(key);
  } catch {
    return false;
  }

  return true;
}
