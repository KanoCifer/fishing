export {};

declare module 'vue' {
  type Hooks = App.AppInstance & Page.PageInstance;
  interface ComponentCustomOptions extends Hooks {}
}

/**
 * 小程序 input / textarea 的 input 事件载荷。
 *
 * 为什么必须补：`@dcloudio/types` 没声明这个事件，而 DOM lib 里有个同名同形状
 * 不符的 `InputEvent`（detail 是 number，是浏览器事件）。tsconfig 的 lib 含 "dom"，
 * 模板上的 `@input` 因此被推断成 DOM 那个类型，Vue 又要求 handler 参数类型与它
 * 双向兼容 —— 组件里写自己的 interface 收窄反而会报 TS2322。
 *
 * 结果就是：类型检查能过，运行时 e.detail.value 却是 undefined（DOM detail 是 number）。
 * 这正是 AGENTS.md 说的「DOM lib 让静态门禁全程放行，vue-tsc 查不出来」。
 *
 * 在这里声明成全局同名类型，模板才会推断到真实的载荷形状。
 */
declare global {
  interface InputEvent {
    detail: {
      value: string;
    };
  }
}
