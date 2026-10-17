<template>
  <view v-if="open" class="snap-sheet">
    <!-- 遮罩 -->
    <view class="snap-sheet__mask" @tap="onMaskTap" />

    <!--
      面板本体。

      底边锚定在底部，只改 height 让它向上生长 —— 如果改 translateY，
      面板会整体下移露出下面的地图，那正是源项目注释里要避开的行为。
    -->
    <view class="snap-sheet__panel" :style="panelStyle">
      <!-- 拖拽把手：只有这一条区域响应拖拽 -->
      <view
        class="snap-sheet__handle"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view class="snap-sheet__handle-bar" />
      </view>

      <!-- 头部 -->
      <view v-if="$slots.header" ref="headerRef" class="snap-sheet__header">
        <slot name="header" />
      </view>

      <!--
        内容：独立滚动，不受拖拽影响。

        scroll-view 必须有确定高度 —— 小程序端它算不出 flex 父容器给的剩余高度，
        用 flex: 1 会得到 0 高度，内容既不滚动也看不见。所以按
        「面板高 − 把手 − 头部实测高」算好后直接绑定。
      -->
      <scroll-view
        class="snap-sheet__body"
        scroll-y
        :style="{ height: bodyHeight + 'px' }"
      >
        <slot />
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SnapSheet —— iOS 风格多档底部抽屉。
 *
 * 对应源项目 SnapSheet.tsx。拖拽物理（阈值 + 速度判定 + 档位吸附）整体照搬，
 * 实现从 framer-motion 换成原生 touch 事件：
 * 小程序逻辑层没有 PointerEvent，也没有 requestAnimationFrame，
 * 手写 touchstart/touchmove/touchend 是这里唯一可行的路。
 *
 * 与源版本的差异：
 * - 无 backdrop 模糊。源版用 `backdrop-blur-[2px]`，小程序端毛玻璃只能靠
 *   `-webkit-backdrop-filter`；而遮罩背后是原生 map 的纹理，
 *   模糊大半张地图代价高、收益低，改成纯色半透明遮罩
 * - 无入场/吸附的 spring 动画。档位切换直接落值：
 *   CSS transition 作用在 height 上能做过渡，但拖拽过程中每帧都在改 height，
 *   transition 会让面板"追不上手指"。改成拖拽跟手、抬手后过渡
 * - 无 Esc 键关闭（触屏端无键盘）、无 lockScroll（scroll-view 自带滚动锁）
 */
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'

import { useNavMetrics } from '@/composables/useNavMetrics'

interface Props {
  open: boolean
  /** 档位，按从小到大排列，单位 vh（视口高度的百分比） */
  snapPoints: readonly number[]
  /** 初始档位下标 */
  initialSnap?: number
  /** 是否显示遮罩 */
  mask?: boolean
  /** 点击遮罩是否关闭 */
  maskClosable?: boolean
  /** 最小高度（px），防止拖到负 */
  minHeight?: number
  /** 最大高度占比（视口高度的比例），留出顶部导航的空间 */
  maxHeightRatio?: number
}

const props = withDefaults(defineProps<Props>(), {
  initialSnap: 0,
  mask: true,
  maskClosable: true,
  minHeight: 120,
  maxHeightRatio: 0.95,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const nav = useNavMetrics()
const instance = getCurrentInstance()!

/** 拖拽把手区实测高度（px）：上下 padding + 指示条 */
const HANDLE_HEIGHT = 54

/** 头部实测高度（px）。无 header 时为 0 */
const headerHeight = ref(0)

/**
 * 量一次头部高度。
 *
 * header 是 slot 进来的，内容高度不定（钓点详情有标题+日期，特征详情只有标题），
 * 写死常量必然对不上。用 SelectorQuery 量实际高度最稳。
 */
function measureHeader(): void {
  if (!instance) return

  uni
    .createSelectorQuery()
    .in(instance)
    .select('.snap-sheet__header')
    .boundingClientRect((res) => {
      // 回调可能是单个矩形也可能是数组，与 canvas fields 同理
      const rect = Array.isArray(res) ? res[0] : res
      const height = rect && typeof rect.height === 'number' ? rect.height : 0
      if (height > 0) headerHeight.value = height
    })
    .exec()
}

/** 滚动区高度 = 面板高 − 把手 − 头部 */
const bodyHeight = computed(() =>
  Math.max(0, heightPx.value - HANDLE_HEIGHT - headerHeight.value),
)

const snap = ref(props.initialSnap)

/** 当前高度（px）。拖拽中由手指直驱，抬手后吸附到档位 */
const heightPx = ref(0)

/** 拖拽中为 true，用于关掉 CSS transition，让高度跟手 */
const dragging = ref(false)

const windowHeight = uni.getWindowInfo().windowHeight

/** 面板最大可用高度：视口减去导航栏高度 */
const maxHeight = computed(() => windowHeight - nav.navBarBottom)

/** 档位 → px */
function snapToPx(index: number): number {
  const ratio = props.snapPoints[index]
  if (ratio === undefined) return props.minHeight

  const px = (ratio / 100) * windowHeight
  return Math.max(props.minHeight, Math.min(maxHeight.value, px))
}

const panelStyle = computed(() => ({
  height: `${heightPx.value}px`,
  transition: dragging.value ? 'none' : 'height 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
}))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    snap.value = props.initialSnap
    heightPx.value = snapToPx(props.initialSnap)
    // 等面板真渲染出来再量头部 —— 此刻节点还没进 DOM，量了也是 0
    void nextTick().then(measureHeader)
  },
  { immediate: true },
)

watch(snap, (index) => {
  // 拖拽中不跟随 snap 改高度 —— 高度此刻归手指管
  if (dragging.value) return
  heightPx.value = snapToPx(index)
})

// ── 拖拽 ──

/** 拖拽起点：手指 Y + 起始高度 */
let startY = 0
let startHeight = 0
/** 上一次 move 的位置和时间，用来算瞬时速度 */
let lastMoveY = 0
let lastMoveTime = 0
let velocity = 0

const DRAG_THRESHOLD = 80
const VELOCITY_THRESHOLD = 500

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return

  startY = touch.clientY
  startHeight = heightPx.value
  lastMoveY = touch.clientY
  lastMoveTime = Date.now()
  velocity = 0
  dragging.value = true
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return

  // 手指上移为正
  const deltaY = startY - touch.clientY
  const next = Math.max(
    props.minHeight,
    Math.min(maxHeight.value, startHeight + deltaY),
  )
  heightPx.value = next

  // 瞬时速度（px/s）。取最近一次 move 的差值，不做平滑 ——
  // 松手前那一下的手势方向才是用户意图
  const dt = (Date.now() - lastMoveTime) / 1000
  if (dt > 0) {
    velocity = (lastMoveY - touch.clientY) / dt
  }
  lastMoveY = touch.clientY
  lastMoveTime = Date.now()
}

function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false

  const delta = heightPx.value - startHeight

  if (delta < -DRAG_THRESHOLD || velocity < -VELOCITY_THRESHOLD) {
    // 往下拖：已在最小档就关闭，否则收缩一档
    if (snap.value === 0) {
      emit('close')
      return
    }
    snap.value = Math.max(0, snap.value - 1)
    return
  }

  if (delta > DRAG_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
    snap.value = Math.min(props.snapPoints.length - 1, snap.value + 1)
    return
  }

  // 不到阈值：watch(snap) 不触发（snap 没变），手动弹回当前档
  heightPx.value = snapToPx(snap.value)
}

function onMaskTap() {
  if (props.maskClosable) emit('close')
}
</script>

<style lang="scss" scoped>
.snap-sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
}

.snap-sheet__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: rgba(32, 33, 36, 0.3);
  animation: snap-mask-in 0.2s ease-out both;
}

.snap-sheet__panel {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top-left-radius: 36rpx;
  border-top-right-radius: 36rpx;
  background-color: $fish-page;
  /* 投影让面板从地图上"浮起" */
  box-shadow: 0 -8rpx 28rpx rgba(32, 33, 36, 0.1);
}

.snap-sheet__handle {
  padding: 24rpx 40rpx 16rpx;
  flex-shrink: 0;
}

.snap-sheet__handle-bar {
  width: 80rpx;
  height: 12rpx;
  margin: 0 auto;
  border-radius: 999rpx;
  background-color: $fish-border;
}

.snap-sheet__header {
  flex-shrink: 0;
}

/*
 * 高度由脚本算好后绑定，见模板注释。
 * flex-shrink: 0 —— 内容超高时不让 flex 把滚动区压扁，否则又滚不动。
 */
.snap-sheet__body {
  width: 100%;
  flex-shrink: 0;
}

@keyframes snap-mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
