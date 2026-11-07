/**
 * canvas 图层的公共件。
 *
 * 为什么单独一个文件：LineChart 与 TideChart 都是「静态层 + 动态层」两块画布，
 * 两边各写一遍取节点、判空、重试、装 ctx 的流程 —— 改一处漏一处就出偏差，
 * 而偏差的表现是「两张图只有一张画不出来」，极难查。
 *
 * 这里只管画布本身：拿到节点、装好 ctx、按 dpr 放大位图、失败重试。
 * 画什么、怎么画归各组件。
 */

import { nextTick } from 'vue';
import type { ComponentInternalInstance } from 'vue';
import { onShow } from '@dcloudio/uni-app';

import { createSelectorQuery } from './selectorQuery';
import { easeOutCubic } from './motion';

/**
 * `fields({ node: true })` 返回的节点没有官方类型，按用到的成员局部声明，不要 any。
 */
export interface CanvasNode2D {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  /**
   * 基础库 2.7.0+ 由 canvas 节点提供的 rAF。
   * 本项目只有小程序端，`type="2d"` 本身就要求 2.9.0+，所以这两个方法一定在，
   * 直接声明为必需，不用再写 H5 的兜底分支。
   */
  requestAnimationFrame(cb: () => void): number;
  cancelAnimationFrame(requestId: number): void;
}

/**
 * 拿不到节点时的重试节奏（毫秒）。
 *
 * 为什么必须重试：同一页挂了多个图时，节点进入合成的时间会飘，
 * 第一次查不到就放弃的话，那张图会一直空白，且没有任何报错可查 ——
 * 只有切数据（触发重新挂载）才恢复。同一页三个图时这不是偶发，是常态。
 */
export const CANVAS_INIT_RETRY_DELAYS = [0, 60, 120, 200, 300, 400, 600] as const;

/**
 * 曲线线宽。两张图用同一档，摆在同一列里才是一套东西。
 *
 * 3.5 不是随手加的：线压粗了，下面的面积才撑得住 —— 线是 2.5 的时候
 * 面积是一层薄雾，看不出是「曲线下面有东西」。
 */
export const CHART_LINE_WIDTH = 3.5;

/** 一层画布的位图尺寸。CSS 尺寸不变，位图按 dpr 放大 */
export interface CanvasMetrics {
  width: number;
  height: number;
  dpr: number;
}

export interface CanvasLayerOptions {
  /** 组件实例。取节点用，作用域限定在组件内 */
  instance: ComponentInternalInstance | null;
  /** 画布节点 id（页面内唯一） */
  id: string;
  /** 位图尺寸。取节点成功的那一刻算一次 */
  metrics(): CanvasMetrics;
  /** 日志里的名字，出错时能分清是哪一层 */
  label: string;
}

/**
 * 一层只管四件事：节点、ctx、就绪与否、重试。
 * 谁该在就绪之后画 —— 那是组件的事，由组件自己 await init()。
 */
export interface CanvasLayer {
  /** 2d 上下文。节点没拿到时是 null */
  readonly ctx: CanvasRenderingContext2D | null;
  /** 画布节点。帧调度要用它自带的 requestAnimationFrame */
  readonly node: CanvasNode2D | null;
  /** 节点在视口里的左边距。触摸换算要用；量不到按 0 */
  readonly left: number;
  /** 节点与 ctx 是否就绪 */
  readonly ready: boolean;
  /**
   * 取节点。
   *
   * 取到返回 true。取不到就按 CANVAS_INIT_RETRY_DELAYS 重试，
   * 重试用尽仍取不到返回 false（并留一条 warn，见 warn 的说明）。
   *
   * 同一时刻并发调 init() 拿到的是同一个 Promise：
   * 节点到手后所有等待者一起 resolve，不会有第二次取节点的尝试。
   */
  init(): Promise<boolean>;
  /**
   * 丢掉节点与 ctx。
   *
   * 节点被移除（v-if 摘掉）后必须调：ctx 指向的是一块已经销毁的画布，
   * 留着只会画到一块死画布上。
   */
  reset(): void;
}

/**
 * 取节点的时机由调用方决定（init()），重试节奏由这一层统一管：
 * 同一页多个图各自重试、各自计数，互不干扰。
 */
export function createCanvasLayer(options: CanvasLayerOptions): CanvasLayer {
  let node: CanvasNode2D | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let left = 0;
  let ready = false;

  /** 同时只允许一次取节点在飞，避免数据变化和重试叠在一起重复建 ctx */
  let fetching = false;
  /** 已经排到第几次重试 */
  let retryIndex = 0;
  let retryTimer = 0;
  /**
   * 同一时刻只承诺一次结果：并发调 init() 拿到的是同一个 Promise，
   * 节点到手后所有等待者一起 resolve。
   */
  let pending: Promise<boolean> | null = null;
  let settle: ((ok: boolean) => void) | null = null;
  /**
   * 世代号。reset() 之后在飞的取节点结果作废 ——
   * 那是上一个节点的 ctx，画到一块死画布上等于画了个寂寞。
   */
  let generation = 0;

  function clearRetryTimer(): void {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = 0;
    }
  }

  function scheduleRetry(): void {
    const delay = CANVAS_INIT_RETRY_DELAYS[retryIndex];
    if (delay === undefined) {
      // 重试用尽还是拿不到节点，画布会一直空白。留一条 warn，
      // 下次再遇到空图能直接分清是「节点没进 DOM」还是「绘制逻辑出错」。
      console.warn(
        `[${options.label}] 画布节点获取失败（已重试 ${CANVAS_INIT_RETRY_DELAYS.length} 次）：未查到 canvas 节点`,
      );
      settle?.(false);
      settle = null;
      pending = null;
      return;
    }
    retryIndex += 1;
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      void fetchNode();
    }, delay);
  }

  /** 查节点，顺便量出它相对视口的左边距（触摸换算要用） */
  function queryNode(): Promise<{ node: CanvasNode2D; left: number } | null> {
    return new Promise((resolve) => {
      createSelectorQuery(options.instance)
        .select(`#${options.id}`)
        .fields({ node: true, rect: true }, (res) => {
          const item = Array.isArray(res) ? res[0] : res;
          // node 在官方类型里是 any，这里收窄成本组件实际用到的形状；
          // 顺手做一次判空，省得把 undefined 交给后面 getContext
          const rawNode = (item as { node?: unknown } | undefined)?.node;
          if (typeof rawNode !== 'object' || rawNode === null) {
            resolve(null);
            return;
          }
          const rawLeft = (item as { left?: unknown } | undefined)?.left;
          resolve({
            node: rawNode as CanvasNode2D,
            left: typeof rawLeft === 'number' && Number.isFinite(rawLeft) ? rawLeft : 0,
          });
        })
        .exec();
    });
  }

  async function fetchNode(): Promise<void> {
    // 已有一次查询在飞、或已经排好了下一次重试，就不要再查了
    if (fetching || ready || retryTimer) return;
    fetching = true;
    const gen = generation;
    let stale = false;

    try {
      // 等一拍：调用方多半刚刚把 canvas 挂进 DOM（v-if），这一拍之后才查得到
      await nextTick();

      const found = await queryNode();
      if (gen !== generation) {
        // 期间被 reset 了，这次的结果作废（见下面的 stale 处理）
        stale = true;
        return;
      }
      if (!found) {
        scheduleRetry();
        return;
      }

      const { width, height, dpr } = options.metrics();
      // 按 dpr 放大位图尺寸，避免高分屏发虚；CSS 尺寸不变，由 rpx 决定。
      // 位图尺寸取整：小屏换算下来可能是小数（622rpx @414pt = 343.36），
      // 位图尺寸按整数给，绘制仍按 CSS 像素走 setTransform，肉眼无差。
      found.node.width = Math.round(width * dpr);
      found.node.height = Math.round(height * dpr);

      node = found.node;
      ctx = found.node.getContext('2d');
      left = found.left;
      ready = true;
      clearRetryTimer();

      settle?.(true);
      settle = null;
      pending = null;
    } finally {
      fetching = false;
      // 这次查询的结果作废了，但还有人在等 —— 重新取一次，
      // 否则等待者会一直挂着，直到下一次 init() 才有人管。
      if (stale && pending) void fetchNode();
    }
  }

  function init(): Promise<boolean> {
    if (ready) return Promise.resolve(true);
    // 每次 init 都把重试节奏重新武装一遍：
    // 数据切换、页面回前台时重新发起，等于给这一轮新的机会。
    retryIndex = 0;
    if (!pending) {
      pending = new Promise<boolean>((resolve) => {
        settle = resolve;
      });
    }
    void fetchNode();
    return pending;
  }

  function reset(): void {
    generation += 1;
    clearRetryTimer();
    ready = false;
    node = null;
    ctx = null;
    left = 0;
    retryIndex = 0;
    // 等待者拿一个 false：节点没了，这次取不到就是取不到
    settle?.(false);
    settle = null;
    pending = null;
  }

  return {
    get ctx() {
      return ctx;
    },
    get node() {
      return node;
    },
    get left() {
      return left;
    },
    get ready() {
      return ready;
    },
    init,
    reset,
  };
}

/**
 * 页面回前台时把画布层作废，并让调用方重取节点、重画一遍。
 *
 * 为什么必须作废：页面隐藏期间小程序会回收 canvas 节点。缓存下来的 ctx
 * 指向的是一块死画布，在它上面绘制不是 JS 异常，是**原生崩溃**
 * （小程序直接闪退），开发者工具里看不出来，只有真机上会炸。
 *
 * 所以页面一回前台不能拿旧 ctx 补画一帧 —— 节点得重新取一遍。
 *
 * 为什么子组件里也能监听页面显示：uni-app 的 onShow 走 injectHook，
 * 页面类钩子（isRootHook）会挂到 target.root 上，也就是**所属页面**的
 * onShow 队列 —— 组件里写和页面里写效果一样，不必让页面把信号往下传。
 *
 * ⚠️ 必须在 setup 里调用（onShow 要挂在当前组件实例上）。
 *
 * @param layers 这一页上的画布层
 * @param redraw 层作废了：重新取节点、重画（怎么 init 由调用方决定）
 * @param keep 层没作废（节点还在）：也要做的事。补一帧最终态这类。
 */
export function useCanvasPageShow(
  layers: CanvasLayer[],
  redraw: () => void,
  keep?: () => void,
): void {
  onShow(() => {
    // 只有已经拿到 ctx 的层才有死画布的风险。还没拿到节点的层不用管：
    // 那一轮取节点本来就是在页面显示之后做的，拿到的就是新节点。
    const stale = layers.filter((layer) => layer.ready);
    if (!stale.length) {
      keep?.();
      return;
    }

    stale.forEach((layer) => layer.reset());
    redraw();
  });
}

/** 入场动画的播放状态 */
export interface EntryAnimator {
  /** 进度 0→1。外部可以置 1 表示「直接落到最终态」 */
  progress: number;
  /** 是否正在播 */
  running: boolean;
  /** 从 0 播到 1，时长 duration 毫秒 */
  play(duration: number): void;
  /** 停掉正在播的动画 */
  cancel(): void;
}

/**
 * 入场动画：逐帧推进 progress，让曲线「画」出来。
 *
 * mp-weixin 逻辑层没有全局 requestAnimationFrame（那是浏览器 API，连 window 都没有），
 * 取帧走 canvas 节点自带的方法（基础库 2.7.0+），帧率跟随系统刷新、页面隐藏自动暂停。
 * 取消必须用同一个节点：节点的 requestId 交给别处的 cancelAnimationFrame 会静默失效，
 * 不报错、循环也停不下来，页面反复进出就一直漏帧。
 */
export function createEntryAnimator(options: {
  /** 取帧用的画布节点。必须与 cancel 用的是同一个 */
  getNode(): CanvasNode2D | null;
  /** 每一帧调用，参数是当前进度 */
  onFrame(progress: number): void;
}): EntryAnimator {
  let rafId = 0;
  /**
   * 排帧时用的那个节点。
   *
   * cancel 必须用**排帧时**的节点去取消，不能现去 getNode()：
   * 画布层被 reset 之后 getNode() 返回 null，旧节点上那一串帧就停不下来 ——
   * 它会一直往一块已经死掉的画布上排帧。新节点不认识旧的 requestId。
   */
  let rafNode: CanvasNode2D | null = null;

  const animator: EntryAnimator = {
    progress: 1,
    running: false,

    play(duration: number) {
      const node = options.getNode();
      if (!node) return;

      animator.cancel();
      const start = Date.now();
      animator.progress = 0;
      animator.running = true;

      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / duration);
        // easeOutCubic，末尾减速，比线性自然
        animator.progress = easeOutCubic(t);
        options.onFrame(animator.progress);
        if (t < 1) {
          rafId = node.requestAnimationFrame(tick);
        } else {
          // t=1 时 progress 已经是 1，这一帧画完循环自然结束
          rafId = 0;
          rafNode = null;
          animator.running = false;
        }
      };
      rafNode = node;
      rafId = node.requestAnimationFrame(tick);
    },

    cancel() {
      if (rafNode && rafId) rafNode.cancelAnimationFrame(rafId);
      rafId = 0;
      rafNode = null;
      animator.running = false;
    },
  };

  return animator;
}
