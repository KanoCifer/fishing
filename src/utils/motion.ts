/**
 * 入场动画的逐项延迟。
 *
 * 样式那边（令牌层 _motion.scss 的 fish-enter）只管「怎么动」：从哪来、往哪去、多长、什么曲线。
 * 「第几项晚多少」是数据，取决于这一组里有几项、排在第几位 —— 样式表写不出来，
 * 只能在模板里按序号算出来写进行内 style。
 *
 * 所以延迟在这里算，而不是在 SCSS 里再开一组 nth-child。
 * 后者每加一项就要改一次样式，而且组内元素一多就是几十条规则。
 */

/**
 * 步长。
 *
 * 30~80ms 是「看得出先后」和「等起来烦」之间的窗口：低于 30ms 两项几乎同时到，
 * 顺序感没了；高于 80ms 读起来就像在逐条播放，一屏内容要等很久才齐。
 * 取中段 60ms。
 */
const STEP = 60;

/**
 * 第 CAP 项之后不再累加延迟。
 *
 * 这一条不是保守，是必需的。逐时预报 24 项、指数构成 9 项，不封顶的话
 * 24 × 60ms = 1.44s —— 最后一项要等前面全部播完才出现。
 * 那已经不是入场动画，是加载动画：用户等的是内容，不是等动画。
 *
 * 封顶之后第 9 项开始一起到。前面几项的先后已经把「从上往下读」的顺序说清楚了，
 * 后面这批同时到，读者不会察觉到自己漏看了什么。
 */
const CAP = 8;

/**
 * 第 index 项的入场延迟（毫秒）。
 *
 * 给 JS 侧的时序用 —— 数字滚动要和它那一行同时开始（见 createCountUp 的用法）。
 * 行内样式那边要的是带单位的字符串，所以那边用 enterDelay。
 */
export function enterDelayMs(index: number): number {
  return Math.min(Math.max(index, 0), CAP) * STEP;
}

/**
 * 第 index 项的入场延迟，形如 "180ms"，直接写进 :style 的 animationDelay。
 *
 * 同时也是 fish-enter 的总闸 $fish-motion 关掉之后唯一会残留的行内样式，
 * 那时它引用不到任何 animation，自动失效 —— 模板不需要为此再开一层判断。
 */
export function enterDelay(index: number): string {
  return `${enterDelayMs(index)}ms`;
}

/**
 * 入场样式的行内绑定（延迟 + 动画名）。
 *
 * CSS 动画同名跑完就是跑完了：二次进入这一页，它停在终态，不会自己再播一遍。
 * 重播只有一个办法 —— 把 animation-name 摘掉再挂回。
 *
 * show 为 false 时写 'none'：动画没了，元素停在自己「先不在」的状态
 * （opacity: 0 写在 fish-enter mixin 里，见 _motion.scss），
 * 屏幕上不会先亮一下终态再淡入。翻回 true 时名字换回去，动画从头跑一遍。
 *
 * 'fish-enter' 这个名字必须跟 App.vue 里那份 @keyframes 对上 ——
 * 降级开关关掉关键帧后，这条行内样式引用不到动画，自动失效。
 */
export function enterStyle(index: number, show: boolean): Record<string, string> {
  return {
    animationDelay: enterDelay(index),
    animationName: show ? 'fish-enter' : 'none',
  };
}

export function startAnimation(callback: (progress: number) => void, duration: number) {
  // 小程序 / App 环境，使用定时器方案保证兼容性
  const start = Date.now();
  let timerId: number;
  const tick = () => {
    const progress = Math.min((Date.now() - start) / duration, 1);
    callback(progress);
    if (progress < 1) {
      timerId = setTimeout(tick, 16); // 约 60fps
    }
  };
  timerId = setTimeout(tick, 16);
  return () => clearTimeout(timerId);
}

/**
 * 数字滚动的时长。
 *
 * 与 $fish-dur-slow（800ms）同一档：数字滚完的那一刻，这一行也刚好坐到位，
 * 读起来是「一次落位」，不是两件事各演各的。
 *
 * ⚠️ 这里手写 800 而不是引用 SCSS 的变量：JS 读不到 Sass 变量。
 * 改的时候两处一起改（_motion.scss 里那条也有同样的提醒）。
 */
export const COUNT_UP_DURATION = 1200;

/**
 * 数字滚动的缓动。
 *
 * CSS 那条 cubic-bezier(0.32, 0.72, 0, 1)（$fish-ease-out）在 JS 里复刻不了：
 * 小程序没有 getComputedStyle 能把曲线读回来，要自己解贝塞尔方程。
 * 这里用 easeOutCubic —— 同一族的近似：起步快、末端慢停，
 * 和 $fish-ease-out 落位是同一口气。
 *
 * 起步快是有意的：观众先看见「数字在动」，再看见它停在哪儿。
 * 匀速会读成一条机械的进度条。
 */
export function easeOutCubic(progress: number): number {
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  return 1 - Math.pow(1 - p, 3);
}

export interface CountUp {
  /** 当前显示值 */
  readonly value: number;
  /**
   * 滚到某个值。
   *
   * from === target 时什么都不做 —— 没有要滚的差值就没有动画，
   * 免得播一个 0ms 的空转。
   */
  to(target: number, options?: { duration?: number; delay?: number }): void;
  /** 立刻定到某个值，并停掉正在跑的滚动。重播时用它回到起点 */
  set(value: number): void;
  /** 停掉正在跑的滚动，当前值不动。组件卸载时必须调 */
  cancel(): void;
}

/**
 * 数字滚动的控制器。
 *
 * 用法：
 *   const countUp = createCountUp((value) => { display.value = value; });
 *   countUp.to(72, { delay: 60 });  // 60ms 后从当前值滚到 72
 *   countUp.set(0);                // 立刻归零（重播的起点）
 *   countUp.cancel();              // 停（组件卸载）
 *
 * 三条约束都在这里兜住：
 * - 卸载后还在滚：cancel() 把定时器停掉，不留悬空的 setData
 * - 重复调用 to()：后一次会取消前一次，从**当前显示值**接着走，不跳回 0
 * - 定时器还在但值没变：整数没变就不写，跨线 setData 只发真正变了的那一次
 */
export function createCountUp(onValue: (value: number) => void): CountUp {
  let current = 0;
  let stopFrame: (() => void) | null = null;
  let stopDelay: (() => void) | null = null;

  const stop = () => {
    stopFrame?.();
    stopFrame = null;
    stopDelay?.();
    stopDelay = null;
  };

  return {
    get value() {
      return current;
    },
    to(target, options = {}) {
      const duration = options.duration ?? COUNT_UP_DURATION;
      const delay = options.delay ?? 0;

      // 先把上一段停掉：新目标从**当前显示值**接着走，不回到起点重来
      stop();

      const from = current;
      if (from === target) return;

      const run = () => {
        stopFrame = startAnimation((progress) => {
          const next = Math.round(from + (target - from) * easeOutCubic(progress));
          // 整数没变就不写：每一次写都是一次跨线 setData
          if (next !== current) {
            current = next;
            onValue(next);
          }
          if (progress >= 1) {
            stopFrame = null;
          }
        }, duration);
      };

      if (delay > 0) {
        const timer = setTimeout(() => {
          stopDelay = null;
          run();
        }, delay);
        stopDelay = () => clearTimeout(timer);
      } else {
        run();
      }
    },
    set(value) {
      stop();
      if (value === current) return;
      current = value;
      onValue(value);
    },
    cancel: stop,
  };
}
