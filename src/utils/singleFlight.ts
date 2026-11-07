/**
 * 单飞（single flight）—— 同一个 key 在飞时只发一个请求，后来者等它。
 *
 * 项目里到处是「同一条路别并发两个请求」：翻月、换港口、刷新天气、定位。
 * 每一处各写一遍 in-flight 守卫，守卫的语义就各写一遍 ——
 * 有的复用同一个 Promise（等它），有的直接 return（不等），
 * 有的用 key 比对、有的用 Promise 变量。改守卫的语义要挨个改。
 *
 * 这里给出唯一一份实现：
 *
 * - **同 key 在飞 → 后来者拿到的就是那一个 Promise**，等它即可。
 * - **不同 key → 视为新一轮**，旧的请求作废：它的响应回来时
 *   `isCurrent(key)` 为 false，调用方据此丢弃，不让它盖掉新一轮的数据。
 * - **restart** —— 用户明确要重发（刷新）时无视在飞的同 key 请求。
 *
 * 作废判定只看「有没有更新的请求启动过」：latestKey 记最后一次启动的 key，
 * 请求结束也不清（清了就分不清「我是最后一个」和「后面没人了」）。
 */

/** 一个在飞请求的记录 */
interface Flight {
  /** 请求的 key。同一 key 复用同一个 Promise */
  key: string;
  /** 请求本身 */
  promise: Promise<void>;
}

export interface SingleFlight {
  /** 当前是否有请求在飞 */
  readonly busy: boolean;
  /** 最后一次启动的请求的 key */
  readonly latestKey: string | null;
  /**
   * 响应回来时判断自己是不是最新的一轮。
   *
   * false 表示期间启动了更新的请求 —— 这份数据是旧地点/旧月份的，丢掉。
   */
  isCurrent(key: string): boolean;
  /**
   * 发起一轮。key 相同且仍在飞时复用那个 Promise，不发第二条。
   *
   * key 不同则启动新一轮，旧的作废。
   */
  run(key: string, task: () => Promise<void>): Promise<void>;
  /**
   * 强制发起一轮，无视在飞的同 key 请求（用户主动刷新的场景）。
   */
  restart(key: string, task: () => Promise<void>): Promise<void>;
}

export function createSingleFlight(): SingleFlight {
  let current: Flight | null = null;
  let latestKey: string | null = null;

  function start(key: string, task: () => Promise<void>): Promise<void> {
    const base = (async () => task())();

    let settled: Promise<void>;
    settled = base.finally(() => {
      if (current?.promise === settled) current = null;
    });

    current = { key, promise: settled };
    latestKey = key;
    return settled;
  }

  return {
    get busy() {
      return current !== null;
    },
    get latestKey() {
      return latestKey;
    },
    isCurrent(key: string) {
      return latestKey === key;
    },
    run(key, task) {
      if (current && current.key === key) return current.promise;
      return start(key, task);
    },
    restart(key, task) {
      return start(key, task);
    },
  };
}
