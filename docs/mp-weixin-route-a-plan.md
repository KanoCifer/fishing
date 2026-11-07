# 路线 A 规划：单页容器 + 组件式 Tab 切换

本文是路线 A 的施工计划。路线 A = 把 4 个 tab 页从「独立页面」改成「宿主页里的组件」，切换只改状态，不走 `uni.switchTab`。

**一句话结论：路线 A 在本项目可做，但工作量集中在 4 个「跨层能力」的搬迁上（画布、原生 map、页面级钩子、跨页返回），不在组件本身。** 本文按「先摸清事实 → 定切分边界 → 逐项搬迁 → 验收」组织。

本文所有事实来自本仓库实测（`pnpm build -p mp-weixin` + 产物分析 + 运行时源码），探针页已删除，仓库已恢复干净。

---

## 0. 先纠正一个前提：路线 A 省不了包体

附件方案与常见说法都暗示「单页容器 = 主包瘦身」。本项目实测**不成立**：

| 目录                                          | 体积                            |
| --------------------------------------------- | ------------------------------- |
| `components/`                                 | 720K                            |
| `static/`                                     | 360K（其中 `medals` 268K）      |
| `common/`                                     | 140K                            |
| `pages/data` + `fishing` + `records` + `mine` | 16K + 16K + 16K + 20K = **68K** |
| 主包合计                                      | 2.2M                            |

四个 tab 页**总共只有 68K**。它们搬进主包的 `views/` 后体积不变（本来就是主包），而 `components/` 720K 一分不少 —— 因为组件本来就引用它们。

**真正的收益只有两个**：

1. 切 tab 不再有页面栈切换与转场动画（自定义底栏本来就在遮转场，这项收益有限）
2. `src/custom-tab-bar/` 那 200 行原生代码可以删掉

**代价**：4 个跨层能力要搬迁 + 画布崩溃风险上升 + 5 处 `switchTab` 要重写。

⚠️ 若路线 A 的动机是「主包太大」，那**动机不成立**，应该直接优化 `static/medals`（268K）与 `components/`（720K）。

---

## 1. 事实清单（已实测）

### 1.1 编译器约束

| 写法                     | 结果                               |
| ------------------------ | ---------------------------------- |
| `<component :is>`        | ❌ 不支持                          |
| `<keep-alive>`           | ❌ 不支持                          |
| `v-if` / `v-else`        | ✅ → `wx:if` / `wx:else`           |
| `v-show`                 | ✅ → `data-c-h="{{!x}}"`           |
| `v-if` + `v-show` 同元素 | ✅ → `wx:if` + `data-c-h` 同一节点 |

### 1.2 四个 tab 页的钩子与页面级配置

| 页面                  | 钩子                                                                               | 页面级配置（`pages.json`）    |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| `pages/data/index`    | `onLoad` `onReady` `onShow` `onPageScroll` `onPullDownRefresh` `onShareAppMessage` | `enablePullDownRefresh: true` |
| `pages/fishing/index` | `onLoad` `onReady` `onShow` `onShareAppMessage`                                    | `disableScroll: true`         |
| `pages/records/index` | `onPageShow`                                                                       | —                             |
| `pages/mine/index`    | `onLoad` `onPageShow` `onShareAppMessage`                                          | —                             |

**已确认的钩子归属**（运行时 `vendor.js`）：

```js
const Re = [onInit, onLoad, onShow, onHide, onUnload, onResize, onBackPress,
            onPageScroll, onTabItemTap, onReachBottom, onPullDownRefresh, ...];

function ui(e, t, n = Yi, r = !1) {
  if (n) {
    Re.indexOf(e) > -1 && (n = n.root);   // ← 挂到所属页面，不是组件自己
    ...
  }
}
```

另：`Ta = _a` —— `onPageShow` 与 `onShow` 是**同一个函数**。本项目 mp-weixin 单端，写哪个都一样。

**组件里能感知「我刚被挂载」的只有 `onMounted`**（Vue 生命周期）。`onPageShow` / `onShow` 感知的是「所属页面显示」，组件化后**不再随 tab 切换触发**。

### 1.3 跨层能力清单（组件化的真正工作量）

| #   | 能力                                              | 涉及页面                                          | 复杂度 |
| --- | ------------------------------------------------- | ------------------------------------------------- | ------ |
| A   | canvas 画布节点                                   | data（TideGauge/TideChart/MetricChart→LineChart） | **高** |
| B   | 原生 `<map>`                                      | fishing                                           | **高** |
| C   | 页面级钩子                                        | data / fishing / records / mine                   | 中     |
| D   | 跨页返回（`switchTab`）                           | 5 处调用点                                        | 中     |
| E   | 分享（`onShareAppMessage` + `open-type="share"`） | data / fishing / mine                             | 中     |
| F   | `onPageScroll` 滚动位置                           | data                                              | 低     |
| G   | 下拉刷新                                          | data                                              | 低     |
| H   | `disableScroll`（钓点页禁滚）                     | fishing                                           | 低     |

---

## 2. 切分边界：什么进容器，什么留在外面

### 2.1 目标结构

```
src/pages/home/index.vue              ← 唯一 tab 页（替代 4 个 tab 页）
src/views/DataView.vue                ← pages/data/index.vue 的内容
src/views/FishingView.vue
src/views/RecordsView.vue
src/views/MineView.vue
src/components/AppTabBar.vue          ← 新底栏（Vue 组件）
src/stores/tabNav.ts                  ← 当前 tab（供跨页返回用）
```

### 2.2 留在外面（一律不动）

- 8 个分包页（about / my-spots / spot-create / spot-detail / spot-edit / spot-feedback / record / tide）—— 它们是二级页，走 `navigateTo`
- `pages.json` 的 `subPackages` 配置
- `utils/chartCanvas.ts` 的画布封装本身（改用法，不改实现）

### 2.3 「页面」还是「组件」的判据

一个 view 组件被切走时，它的 DOM 与画布节点会怎样？

| view 内容特征   | 归类                   | 手段          |
| --------------- | ---------------------- | ------------- |
| 含原生 `<map>`  | **`v-if`**（独占层级） | fishing       |
| 含 canvas       | `v-if`                 | data          |
| 纯视图 + 轻状态 | `v-show`（保状态）     | records, mine |

**本项目建议：data 与 fishing 用 `v-if`，records 与 mine 用 `v-show`。**

理由：

- data 有 4 块 canvas，`v-show` 隐藏时画布节点是否被回收**官方无明确定义** —— 这正是 iPhone 闪退的根源，赌不得
- fishing 有原生 map，`v-show` 隐藏**不保证解除层级遮挡**
- records / mine 是纯视图，`v-show` 保留状态（记录页的月份选择、我的页的滚动位置）是实打实的体验收益，且无 canvas / map

---

## 3. 逐项搬迁方案

### A. canvas（最高风险，必须先做）

**问题**：`docs/mp-weixin-platform.md` 记着 —— 切 tab 时画布节点被回收，往死画布上画 = **iPhone 原生崩溃**（`baea0d0 fix:尝试修复闪退`）。现有防护是 `useCanvasPageShow(layers, redraw)`，靠 `onShow` 触发 `reset()`。

**组件化后**：`onShow` 只在页面回前台触发，**不再随 tab 切换触发** → 防护失效。

**方案**：`v-if` 切换下，组件销毁 = 画布节点随组件销毁，**不会画到死画布上**。但「切回来」时会重新挂载 → 需要重新取节点。

```ts
// utils/chartCanvas.ts 新增
/**
 * 组件因 v-if 切换而被销毁时，丢弃缓存的节点与 ctx。
 *
 * 与 useCanvasPageShow 的区别：那个管「页面回前台」（节点被小程序回收），
 * 这个管「组件被卸载」（节点随组件销毁）。两者都会让 ctx 变成死引用，
 * 但触发时机不同，得分开重置。
 */
export function useCanvasUnmount(layers: CanvasLayer[]): void {
  onUnmounted(() => {
    layers.forEach((layer) => layer.reset());
  });
}
```

**同时**：canvas 组件自身的 `onMounted` 要触发一次 `init()` 重取节点。现有 `TideChart` / `TideGauge` / `LineChart` 的 `init()` 流程要复核 —— 若它们依赖 `onReady`（页面级），要改成 `onMounted`。

⚠️ **这一步没做完不要往下走。** 建议先单独做一个只含天气页的容器页，在真机上反复切 20 次，确认不闪退，再做其余三个。

### B. 原生 map

fishing 必须用 `v-if`（不与 weather 同时存在）。

**但这带来新问题**：`v-if` 销毁 map → 切回钓点页时 map 重新创建，**地图视图状态丢失**（中心点、缩放、卫星/路况开关）。当前 `useMapMarkers` + `mapStore` 存的是 marker 数据，但**地图视角（center/scale）现在存在 map 组件内部**。

**方案**：把「当前中心点 / 缩放 / 卫星开关」提到 `fishingMap` store，map 组件改为受控。切回时用 store 里的值初始化。

另需确认：`FullscreenMap` 的 `interactive` 开关（决定能否拖动）在 `v-if` 下每次重建都要重设。

### C. 页面级钩子 → 状态分发

**容器页负责注册，view 组件负责响应。**

新增 `src/stores/tabNav.ts`：

```ts
export type TabKey = 'data' | 'fishing' | 'records' | 'mine';

export const useTabNavStore = defineStore('tabNav', () => {
  const active = ref<TabKey>('data');
  /** 已挂载过的 tab —— 决定用 v-if 还是 v-show 的那一支 */
  const visited = ref<TabKey[]>(['data']);

  function switchTo(tab: TabKey) {
    if (active.value === tab) return;
    if (!visited.value.includes(tab)) visited.value.push(tab);
    active.value = tab;
  }
  return { active, visited, switchTo };
});
```

**每个 view 的取数时机改造**：

| view        | 现在                | 改后                                                    |
| ----------- | ------------------- | ------------------------------------------------------- |
| DataView    | `onShow` → 取数     | `watch(() => props.active)` → 取数（`immediate: true`） |
| FishingView | `onShow` → 取数     | 同上                                                    |
| RecordsView | `onPageShow` → 取数 | 同上                                                    |
| MineView    | `onPageShow` → 取数 | 同上                                                    |

⚠️ **`watch` 的 `immediate: true` 与「切回来就取数」要区分**：

- `immediate: true` → 首次挂载取一次（等价于现在的 `onReady`）
- 切回来取数 → `watch` 非 immediate 分支

这两个时机在现有代码里是分开的（`data/index.vue:169` 的 `onReady` vs `:200` 的 `onShow`），改造时要**保持这个区分**，不能合并成一个。

### D. 跨页返回（5 处 `switchTab`）

移除 `tabBar` 后 `uni.switchTab` 对非 tab 页无效。5 处调用：

| 文件                                | 目标                   | 场景               |
| ----------------------------------- | ---------------------- | ------------------ |
| `pages/record/detail/index.vue:341` | `/pages/records/index` | 深链打开时无上一页 |
| `pages/record/create/index.vue:839` | `/pages/records/index` | 同上               |
| `pages/spot-detail/index.vue:441`   | `/pages/fishing/index` | 同上               |
| `pages/spot-create/index.vue:783`   | `/pages/fishing/index` | 同上               |
| `pages/spot-feedback/index.vue:269` | `/pages/fishing/index` | 同上               |

**方案**：改成「设置 store 的 active → `navigateBack` 或 `reLaunch`」。

```ts
// utils/tabNav.ts（新增）
export function goToTab(tab: TabKey) {
  useTabNavStore().switchTo(tab);
  uni.reLaunch({ url: '/pages/home/index' }); // 从二级页回到容器页
}
```

⚠️ `reLaunch` 会销毁整个页面栈。若二级页是 `navigateTo` 进来的，`navigateBack` 更好（保留二级页）。但现有代码的 `fail` 分支恰恰是「**没有上一页**」的情况 —— 那时只能 `reLaunch`。所以：

```ts
function goBack(): void {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      goToTab('records'); // 没有上一页 → 重开容器页
    },
  });
}
```

另外 `components/PageNav/PageNav.vue:96` 的 `fallbackUrl` 兜底也要改（它的 `fallbackUrl` 传的是 tab 页路径）。

### E. 分享

三处 `onShareAppMessage`（data / fishing / mine）+ 一处 `open-type="share"`（mine 页的 `MineRow`）。

**问题**：分享是**页面级**能力，一个页面只有一个 `onShareAppMessage`。容器页只有一个，但 tab 有三个，每张卡片文案不同（`SHARE_CARDS` 里 data / fishing / mine 三份）。

**方案**：容器页注册**一个** `onShareAppMessage`，内部按当前 `active` 从 `SHARE_CARDS` 取卡片。

```ts
// 容器页
onShareAppMessage(() => SHARE_CARDS[tabStore.active.value] ?? SHARE_CARDS.data);
```

**注意**：`SHARE_CARDS` 的 key 是 `'fishing' | 'data' | 'mine'`，而 `TabKey` 还有 `'records'`。records 页现在**没有**分享配置 —— 容器页在 records tab 时要退回一个默认值（建议用 `SHARE_CARDS.data` 或加一份 records 卡片）。

**`open-type="share"` 按钮**（mine 页）：它在组件里，`open-type="share"` 会触发**所属页面**的 `onShareAppMessage`。组件化后 mine 是组件、容器是页面 → 仍然走容器的分享 → 正好满足需求，但卡片内容取决于当前 tab（分享时在 mine tab → 拿 mine 卡片）。✅ 这条天然正确。

**路径要改**：`SHARE_CARDS.*.path` 现在是 `/pages/data/index` 等。组件化后 tab 页不再是独立页面 → **必须改成 `/pages/home/index?tab=xxx`**，否则分享出去点开是死链。

### F. 滚动位置

`data/index.vue:103` 用 `onPageScroll` 记录滚动位置（`scrollTop`），供入场动画用。

组件化后 `onPageScroll` 归属页面，**四个 tab 共享一个滚动上下文** —— 天气页记录的位置会被钓点页的滚动覆盖。

**方案**：改用 `<scroll-view>` 包住每个 view，滚动事件绑到各自的 `scroll-view`。但这会改变页面滚动模型（`useViewport` 的注释明确警告过 `100vh` 与滚动范围的问题），**风险不低**。

**低风险替代**：滚动位置只用于天气页的入场动画方向判断 → 可以在 view 内部用 `scroll-view` 自管，或接受这个降级（切 tab 回来后动画方向判断失准，视觉影响极小）。

### G. 下拉刷新

`enablePullDownRefresh: true` 是页面级配置 → 移到容器页。`data/index.vue:190` 的 `onPullDownRefresh` 改成容器页注册一次、按 `active` 判断是否转发给 DataView。

⚠️ 但容器页的 `enablePullDownRefresh` 是**全局**的 —— 钓点页禁滚（`disableScroll: true`），记录页/我的页不需要下拉刷新。开了之后所有 tab 都能下拉 → **钓点页会与地图手势冲突**（`useViewport` 注释专门写过这个问题）。

**方案**：容器页开 `enablePullDownRefresh`，但 `onPullDownRefresh` 里若 `active !== 'data'` 则立即 `stopPullDownRefresh()`。钓点页的地图手势冲突仍需真机验证（可能要按 tab 动态切 `disableScroll`，而那是页面级配置，改不了）。

⚠️ **这是路线 A 的一个未解问题**：`disableScroll` 无法按 tab 动态切换。钓点页在容器里会与页面滚动共存。

### H. `100vh` 与视口

容器页用 `windowHeight`（`useViewport`）而非 `100vh` —— 与项目约定一致。

---

## 4. 施工顺序

分 5 步，每步都可独立验证、可回滚。

### 步骤 1：画布安全网（不动结构）

- 加 `useCanvasUnmount`
- 复核 `TideChart` / `TideGauge` / `LineChart` 的 `init()` 时机（页面钩子 → `onMounted`）
- **验收**：真机反复切 tab 20 次不闪退（这一步先在现有 4 页结构下也验证一遍基线）

### 步骤 2：容器页骨架 + 单个 view

- 建 `pages/home/index.vue` + `views/DataView.vue`（只做 data 一个）
- `pages.json` 里 `pages/data/index` 改成 `pages/home/index`
- **验收**：data 页功能完整（下拉刷新、分享、滚动动画、canvas 全对）

### 步骤 3：补齐三个 view

- FishingView（**必须 `v-if`**，map 受控化）
- RecordsView（`v-show`）
- MineView（`v-show`，含 `open-type="share"`）
- **验收**：四个 tab 都能切，功能与改造前一致

### 步骤 4：跨页能力

- 5 处 `switchTab` → `goToTab`
- `PageNav` 的 `fallbackUrl`
- 分享路径改 `/pages/home/index?tab=xxx`，容器页读 `tab` 参数初始化
- `SHARE_CARDS` 加 records 卡片
- **验收**：分享链接点开落在对应 tab

### 步骤 5：删除旧结构

- 删 `src/custom-tab-bar/`
- `pages.json` 移除 `tabBar` 配置
- 删 4 个旧 tab 页
- **验收**：全流程真机走查

---

## 5. 验收标准

### 构建期

- [ ] `pnpm build -p mp-weixin` 通过
- [ ] `pnpm check:compat` 通过（WXSS 选择器约束）
- [ ] `pnpm type-check` 通过
- [ ] 产物中无 `<component :is>` / `keep-alive`

### 功能

- [ ] 四个 tab 切换正常，选中态与底栏一致
- [ ] 切 tab 不重复取数（看网络面板）
- [ ] 切 tab 保留 records / mine 的页面状态
- [ ] 下拉刷新只在 data tab 生效
- [ ] 分享卡片文案与当前 tab 匹配，链接点开落在对应 tab
- [ ] 5 处「返回上一页」兜底生效

### 真机专项（开发者工具测不出来）

- [ ] **iPhone**：反复切 tab 20+ 次不闪退（canvas）
- [ ] **iPhone**：钓点页 ↔ 其他页来回切，map 无残留遮挡
- [ ] **iPhone**：钓点页拖动地图不被页面滚动抢走
- [ ] **Android**：同上

---

## 6. 风险登记

| 风险                     | 等级   | 应对                                      |
| ------------------------ | ------ | ----------------------------------------- |
| canvas 死节点 → 原生闪退 | **高** | 步骤 1 单独先做，真机验证不过就不继续     |
| map 视角丢失 / 残留遮挡  | **高** | fishing 强制 `v-if`；视角提到 store       |
| 页面滚动与 map 手势冲突  | **中** | `disableScroll` 无法按 tab 切，需真机验证 |
| 4 页共享滚动上下文       | **中** | data 的滚动动画降级                       |
| 下拉刷新全局生效         | **中** | 按 `active` 拦截                          |
| 分享路径失效             | **中** | 步骤 4 统一改                             |
| 包体无收益（动机不成立） | —      | 见第 0 节，先确认动机                     |

---

## 7. 与路线 B 的对比结论

| 维度                       | 路线 A（单页容器）  | 路线 B（底栏换 Vue 组件） |
| -------------------------- | ------------------- | ------------------------- |
| 跨层能力搬迁               | 8 项全做            | **0 项**                  |
| 画布闪退风险               | 上升                | 不变（现有防护有效）      |
| map 层级风险               | 上升                | 不变                      |
| `switchTab` 改写           | 5 处                | 0 处                      |
| 分享路径改写               | 必须                | 不必须                    |
| 包体收益                   | 0                   | 0                         |
| 删 `custom-tab-bar` 200 行 | ✅                  | ✅                        |
| 切 tab 转场                | 无                  | 有（原生 switchTab）      |
| 页面状态保留               | records/mine 可保留 | 原生 tab 页本来就保留     |

**若动机是「删掉 custom-tab-bar 的复杂度」→ 路线 B。**
**若动机是「切 tab 不能有转场动画 / 想做共享元素动效」→ 路线 A。**

**本项目的现状下，路线 A 的成本收益比不划算。** 除非要做共享元素转场这类 `switchTab` 做不到的效果，否则建议路线 B。
