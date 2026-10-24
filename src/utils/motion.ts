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
 * 第 index 项的入场延迟，形如 "180ms"，直接写进 :style 的 animationDelay。
 *
 * 同时也是 fish-enter 的总闸 $fish-motion 关掉之后唯一会残留的行内样式，
 * 那时它引用不到任何 animation，自动失效 —— 模板不需要为此再开一层判断。
 */
export function enterDelay(index: number): string {
  return `${Math.min(Math.max(index, 0), CAP) * STEP}ms`;
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
