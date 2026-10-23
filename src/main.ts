import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';

export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());

  /*
   * Vue 3 兼容层：补回实例方法 $set / $delete。
   *
   * 为什么需要：Vue 3 删掉了这两个实例方法，而 mp-html v2 还在用 ——
   * `setContent` 里的 `this.$set(this, 'nodes', …)` 正是它的主路径。
   * 不补这一层，mp-html 第一次渲染就会抛 `this.$set is not a function`，白屏。
   *
   * 为什么这么补是对的：Vue 3 的响应式基于 Proxy，给对象加新属性本来就能被
   * 追踪到，$set 退化成一次普通赋值即可，语义与 Vue 2 的实现一致。
   *
   * 写在 main.ts 而不是各页面：这是全局兼容层，作用域一次就够。
   *
   * ⚠️ 升级 mp-html 时先确认它还要不要 $set —— v3 已经不用了，
   * 那时候这层可以整个删掉。判据是 dist/uni-app/components/mp-html/mp-html.vue
   * 里还有没有 `this.$set(`。
   */
  app.config.globalProperties.$set = (target: Record<string, unknown>, key: string, value: unknown) => {
    target[key] = value;
  };
  app.config.globalProperties.$delete = (target: Record<string, unknown>, key: string) => {
    delete target[key];
  };

  return {
    app,
  };
}
