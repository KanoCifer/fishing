# 不用 tabBar，自实现页面组件动态切换

结论先行：能做，但不是用 Vue 的「动态组件」写法。mp-weixin 端 **`<component :is>` 与 `<keep-alive>` 都不编译**（实测构建直接报错），能用的只有 `v-if / v-show` 分支 + 自己写的 tab 容器。

本文所有结论都在本仓库用 `pnpm build -p mp-weixin` 实测过，探针页已删除，仓库已恢复干净。

---

## 一、编译器硬约束（实测）

| 写法 | mp-weixin 构建结果 |
| --- | --- |
| `<component :is="current" />` | ❌ `[vite:vue] <component is=""/> is not supported` |
| `<keep-alive><X /></keep-alive>` | ❌ `[vite:vue] not supported: keep-alive` |
| `<X v-if="cur === 'a'" /><Y v-else />` | ✅ 编译成 `wx:if` / `wx:else` |
| `<X v-show="cur === 'a'" />` | ✅ 编译成 `data-c-h="{{!a}}"`（glass-easel 隐藏属性） |

产物对照：

```wxml
<!-- v-if / v-else -->
<view><child-a wx:if="{{a}}" .../><child-b wx:else .../></view>

<!-- v-show -->
<view><child-a data-c-h="{{!a}}" .../><child-b data-c-h="{{!b}}" .../></view>
```

`v-if` 与 `v-show` 的差别决定了后面所有设计：

- `v-if`：切换时组件**销毁重建**。状态全丢，`onMounted` 重跑，canvas 节点被回收。
- `v-show`：组件**常驻**，只是被隐藏。状态留着，但隐藏期间的逻辑仍在跑，且**隐藏的原生组件（`<map>`）仍会占层级**。

uni-app 官方文档里 `activated` / `deactivated` 两个钩子在「微信小程序」一列都是 ✗ —— 与编译器拒绝 `keep-alive` 是同一件事的两面。

---

## 二、页面生命周期钩子在子组件里怎么办

这是最容易踩的坑。实测：把 `onLoad / onShow / onReady / onHide / onPullDownRefresh / onShareAppMessage / onPageScroll` 全部写进子组件，编译**不报错**，钩子也确实进了子组件的 `__runtimeHooks`。但运行时源码里有一段分流：

```js
// vendor.js
const Re = [onInit, onLoad, onShow, onHide, onUnload, onResize, onTabItemTap,
            onReachBottom, onPullDownRefresh, onAddToFavorites, ...];

function ui(e, t, n) {
  if (n) {
    // Re 里的钩子 → 挂到 root 页面，不挂组件自己
    Re.indexOf(e) > -1 && (n = n.root);
    ...
  }
}
```

含义是：

| 钩子 | 子组件里的实际行为 |
| --- | --- |
| `onShow` / `onHide` | 走 `injectHook` → 挂到**所属页面**的队列。组件里写和页面里写效果一样（`docs/mp-weixin-platform.md` 已记过这条） |
| `onLoad` | 同样挂到 root —— **不是**「组件创建时」触发 |
| `onReady` | 走 `pageLifetimes` → 组件自身就绪时触发 |
| `onPullDownRefresh` | 挂到 root 页面；且需页面开 `enablePullDownRefresh` |
| `onShareAppMessage` | 挂到 root 页面，且 `__runtimeHooks=3`（onPageScroll:1 + onShareAppMessage:2）才会在页面层注册 |
| `onPageScroll` | 挂到 root 页面，滚动事件由页面派发 |

**结论：子组件里的「页面级钩子」不能用来感知「我这个 tab 现在可见不可见」。** 它们感知的是「所属页面」的生命周期。

在本项目里，这个差异尤其致命 —— 天气页有 `TideGauge` 和 `LineChart` 两块 canvas，而 `docs/mp-weixin-platform.md` 明确写着：切 tab 就是「页面被隐藏」，画布节点被回收，回来时往死画布上画 = **iPhone 原生闪退**。这是仓库里已有的崩溃主因（`baea0d0 fix:尝试修复闪退`）。

组件化方案里 `v-if` 切换 = 组件销毁 = canvas 节点销毁，`v-show` 切换 = 节点留着但可能被隐藏回收 —— 两种都比现在的 `switchTab` 更需要重新取节点。`utils/chartCanvas.ts` 的 `useCanvasPageShow` 依赖 `onShow` 触发 `reset()`，组件化后 `onShow` 只在页面回前台时触发，**不再随 tab 切换触发** —— 现有的画布安全网会失效，必须换成「切 tab 时重置画布层」的机制。

---

## 三、三条可选路线

### 路线 A：单页面 + `v-show` 分支（推荐用于「主包瘦身 + 切 tab 无白屏」）

一个宿主页承载全部 tab 内容，底栏自己画在宿主页里。

```
src/pages/home/index.vue          ← 唯一入口页（替代现在的 4 个 tab 页）
src/views/DataView.vue            ← 原 pages/data/index.vue 的内容
src/views/FishingView.vue
src/views/RecordsView.vue
src/views/MineView.vue
src/components/TabBar.vue         ← 自己实现的底栏（Vue 组件，不再是原生 custom-tab-bar）
```

宿主页：

```vue
<template>
  <view class="home">
    <DataView v-show="cur === 'data'" />
    <FishingView v-show="cur === 'fishing'" />
    <RecordsView v-show="cur === 'records'" />
    <MineView v-show="cur === 'mine'" />

    <TabBar :model-value="cur" @change="onChange" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DataView from '@/views/DataView.vue';
import FishingView from '@/views/FishingView.vue';
import RecordsView from '@/views/RecordsView.vue';
import MineView from '@/views/MineView.vue';
import TabBar from '@/components/TabBar/TabBar.vue';

const cur = ref<'data' | 'fishing' | 'records' | 'mine'>('data');

function onChange(key: string) {
  if (key === cur.value) return;
  cur.value = key as typeof cur.value;
  // ⚠️ 这里必须通知各 view 重置画布层（见下）
}
</script>
```

**代价（都是真的）：**

1. **`v-show` 下隐藏的 `<map>` 仍占层级。** 钓点页有原生 `map`，微信原生组件层级最高，`display:none` 在部分场景不生效 —— 天气页切过来可能被地图压住。**钓点页必须用 `v-if`**（它需要独占层级），其余用 `v-show`。
2. **画布安全网要重写。** 见上一节。
3. **四个页面的 `onShow` 全部会触发**（都挂到 root）—— 天气页切 tab 时会重复取数，必须改成「只在可见时取数」，判据是宿主页传的 `active` prop，不是 `onShow`。
4. **`onPullDownRefresh` / `onShareAppMessage` 只在宿主页注册一次**，需要按当前 tab 分发。
5. **`onPageScroll` 归属页面**，滚动位置在四个 view 之间会串 —— 天气页现在用 `onPageScroll` 记录滚动位置（`src/pages/data/index.vue:103`），组件化后四个 view 共享一个滚动上下文。

### 路线 B：保留 4 个独立页面，自己画底栏（改动最小）

不碰 `pages.json` 的 `tabBar.custom` 机制之外的任何东西，把底栏从原生 `custom-tab-bar/` 挪成一个 Vue 组件，在每个 tab 页里 `import` 进去。

- ✅ 页面生命周期、`onPageScroll`、`onPullDownRefresh`、`switchTab` 全部原样保留
- ✅ 画布安全网（`useCanvasPageShow`）原样有效
- ❌ 底栏要写 4 遍（或用 mixin / 全局组件）
- ❌ 原生 `custom-tab-bar` 的「模块作用域共享选中态」那套逻辑可以整个删掉 —— 这套逻辑是原生组件特有的痛点，Vue 组件里 `ref` 就够
- ❌ 仍然是 4 个页面实例，切 tab 有转场动画（原生 `switchTab` 的过场）

### 路线 C：`v-if` 分支 + 手动缓存（介于 A/B 之间）

`v-if` 切换，但把每个 view 的状态提到 `store`（本项目已有 Pinia：`src/stores/`），切走时状态存 store，切回时从 store 恢复。

- ✅ 不需要 `keep-alive`，编译能过
- ✅ 状态能保留
- ❌ 每个 view 要把本地状态手动同步进 store —— 改造成本最高
- ❌ canvas 每次都是新节点，反而比现在安全

---

## 四、建议

**本项目选路线 B。**

理由是仓库的硬约束压倒了一致性收益：

1. 画布闪退（`docs/mp-weixin-platform.md` 里的 iPhone 原生崩溃）已经踩过一次，路线 A/C 会让画布生命周期更复杂，不是更简单。
2. 钓点页的原生 `map` 与「底栏浮层」已经有一层交互（`useViewport` 注释专门写了地图页是底栏浮层的例外），再叠一层 `v-show` 隐藏语义，层级问题会很难查。
3. 路线 B 能把现在 `src/custom-tab-bar/index.js` 里约 200 行的「模块作用域共享选中态 + 200ms 轮询反推路由 + 导航锁」全部删掉 —— 那套复杂度是原生自定义 tabBar 的固有代价，换成 Vue 组件后 `ref` 一行就够。这是本次改造**最实在的收益**。

路线 A 值得做的前提是：确实要砍主包体积（四个 tab 页全在主包，见 `pages.json` 的 `pages` 数组），且能把画布与 map 的生命周期问题一并重构掉。这是架构级改动，不是顺手能做的。

---

## 五、如果最终要走路线 A，这里是必须先解决的清单

1. 画布：宿主页切 tab 时，通知当前 view 的 canvas layer `reset()` 并重取节点。现有 `useCanvasPageShow` 只处理「页面回前台」，需要新增「切 tab」路径。
2. map：钓点 view 用 `v-if` 而非 `v-show`。
3. 页面级钩子分发：`onPullDownRefresh`、`onShareAppMessage`、`onPageScroll` 在宿主页注册一次，按当前 tab 转发给对应 view。
4. 可见性判断：各 view 的「要不要取数」不能再靠 `onShow`，改成宿主页下发的 `active` prop。
5. `fish-tabbar-inset`（`src/styles/tokens/_layout.scss:112`）：底栏浮层高度补偿，四个 view 都要让开，位置从「页面自己 include」变成「宿主页统一处理」更干净。
6. 包体：四个 view 放 `src/views/`，仍属主包；真正的瘦身要靠 `subPackages`，但 `v-show` 引用不到分包 —— 路线 A 与分包互斥。

---

## 六、验证方式

改完必须真机验证，不要只看开发者工具：

- `pnpm build -p mp-weixin` → 导入 `dist/build/mp-weixin`
- iPhone 真机：反复切 tab 20 次以上，观察是否闪退（canvas 死节点只在真机炸，开发者工具看不出来）
- 钓点页 → 天气页来回切，确认 map 没有残留遮挡
- 切 tab 时看网络请求，确认没有重复取数（`onShow` 全触发会导致重复）
