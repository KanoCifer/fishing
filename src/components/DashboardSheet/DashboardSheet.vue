<template>
    <!--
      面板本体。靠同层渲染的 z-index 浮在原生 map 之上，不需要地图让位。

      收起档下面板高度为 0（整条不渲染），改由下方的浮层条承载信息 ——
      收起态用户要的正是「地图全屏、一条信息」，浮层条正好干这个。
    -->
    <view v-if="!isPeek" class="dashboard-sheet" :style="panelStyle">
      <!-- 拖拽把手 -->
      <view
        class="dashboard-sheet__handle"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view class="dashboard-sheet__handle-bar" />
      </view>

      <!--
        scroll-view 必须有确定高度。

        这里没写成 flex: 1 —— 小程序端 scroll-view 算不出 flex 父容器给它的
        剩余高度，结果高度为 0，内容不滚动也看不见（面板看起来就少了后面几张卡）。
        改为按「面板高度 − 把手高度」直接算好绑定。
      -->
      <scroll-view
        class="dashboard-sheet__body"
        scroll-y
        :style="{ height: bodyHeight + 'px' }"
      >
        <slot />
      </scroll-view>
    </view>

    <!--
      收起档：一条浮在地图上的信息条。
      点一下直接展开到半开档：只靠「上拖」发现性太差。
    -->
    <view
      v-else
      class="dashboard-sheet-peek"
      :style="{ bottom: peekBottom + 'px' }"
      @tap="expandToHalf"
    >
      <view class="dashboard-sheet-peek__handle" />
      <view class="dashboard-sheet-peek__row">
        <view class="dashboard-sheet-peek__text">
          <text class="dashboard-sheet-peek__title">{{ peekTitle }}</text>
          <text
            v-if="peekSubtitle"
            class="dashboard-sheet-peek__subtitle"
          >
            {{ peekSubtitle }}
          </text>
        </view>
        <view class="dashboard-sheet-peek__cta">
          <text class="dashboard-sheet-peek__cta-text">查看详情 ›</text>
        </view>
      </view>
    </view>
</template>

<script setup lang="ts">
/**
 * DashboardSheet —— 持久的可拖拽数据面板，对应源项目 DashboardSheet.tsx。
 *
 * 与 SnapSheet 的差异（源项目注释里也列了）：
 * - 持久挂载，没有遮罩、没有关闭语义
 * - 收到最小档继续下拖只是收缩，不关闭
 * - 层级低于 modal sheet
 *
 * 档位沿用源项目 160px / 52vh / 88vh。这里 snapPoints 用数值数组而不是
 * 带单位的字符串：字符串要解析 `vh`/`px` 后缀，小程序端纯属多余，
 * 直接给数字（px 或 vh 百分比）由组件统一换算。
 */
import { computed, ref } from 'vue'

import { useNavMetrics } from '@/composables/useNavMetrics'

interface Props {
  /** 初始档位下标。0 = 收起（地图全屏），1 = 半开，2 = 展开 */
  initialSnap?: number
  /** 收起档浮层条的主标题 */
  peekTitle?: string
  /** 收起档浮层条的副标题 */
  peekSubtitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialSnap: 0,
  peekTitle: '钓鱼数据',
  peekSubtitle: '',
})

const nav = useNavMetrics()

const windowHeight = uni.getWindowInfo().windowHeight

/**
 * 档位：收起 / 半开 / 展开。数值见源项目 SNAP_POINTS。
 * 混合了固定 px（收起档 160px）和 vh 比例（其余两档）。
 *
 * 收起档实际渲染高度是 0（见 snapToPx 的 isPeek 分支）—— 地图要全屏，
 * 收起态由浮层信息条承载，面板本体不占任何高度。
 */
const snapPoints = [160, 52, 88] as const

const snap = ref(props.initialSnap)
const heightPx = ref(0)
const dragging = ref(false)

const maxHeight = computed(() => windowHeight - nav.navBarBottom)

const isPeek = computed(() => snap.value === 0)

/**
 * 收起档浮层条的底部偏移（px）。
 *
 * 浮层条用 fixed 定位，不跟页面流，home indicator 那一条要自己让开。
 * 机型没有安全区时退到 16px，不能写死 —— 无刘海屏上凭空多出一截空白。
 */
const peekBottom = (() => {
  const info = uni.getWindowInfo()
  const safe = info.safeArea ? Math.max(0, info.windowHeight - info.safeArea.bottom) : 0
  return safe + 16
})()

/** 点浮层条：直接展开到半开档（index 1），跳过吸附动画 */
function expandToHalf() {
  snap.value = 1
  heightPx.value = snapToPx(1)
}

function snapToPx(index: number): number {
  // 收起档渲染高度为 0：地图全屏，浮层信息由浮层条承载，
  // 面板本体让出全部空间。调用方（钓点页）据此把地图撑满。
  if (index === 0) return 0

  const value = snapPoints[index]
  if (value === undefined) return 0

  const px = value <= 100 ? (value / 100) * windowHeight : value
  return Math.max(120, Math.min(maxHeight.value, px))
}

/**
 * 滚动区高度 = 面板高度 − 拖拽把手高度。
 *
 * HANDLE 是把手区实测高度（上下 padding + 指示条），减掉它 scroll-view
 * 才会正好占满剩余空间 —— 少了它底部会露白，多了它会顶出面板。
 */
const HANDLE_HEIGHT = 54

const bodyHeight = computed(() => Math.max(0, heightPx.value - HANDLE_HEIGHT))

const panelStyle = computed(() => ({
  height: `${heightPx.value}px`,
  transition: dragging.value ? 'none' : 'height 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
}))

heightPx.value = snapToPx(props.initialSnap)

let startY = 0
let startHeight = 0
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

  const deltaY = startY - touch.clientY
  const next = Math.max(
    120,
    Math.min(maxHeight.value, startHeight + deltaY),
  )
  heightPx.value = next

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
    // 已在最小档也只是收缩，不关闭 —— 面板是持久的
    snap.value = Math.max(0, snap.value - 1)
    heightPx.value = snapToPx(snap.value)
    return
  }

  if (delta > DRAG_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
    snap.value = Math.min(snapPoints.length - 1, snap.value + 1)
    heightPx.value = snapToPx(snap.value)
  }
}
</script>

<style lang="scss" scoped>
.dashboard-sheet {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  /* 层级低于 SnapSheet（200）；压在原生 map 之上靠同层渲染的 z-index */
  z-index: 30;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top-left-radius: 36rpx;
  border-top-right-radius: 36rpx;
  background-color: $fish-page;
  box-shadow: 0 -8rpx 28rpx rgba(32, 33, 36, 0.1);
}

.dashboard-sheet__handle {
  padding: 24rpx 40rpx 16rpx;
  flex-shrink: 0;
}

.dashboard-sheet__handle-bar {
  width: 80rpx;
  height: 12rpx;
  margin: 0 auto;
  border-radius: 999rpx;
  background-color: $fish-border;
}

/*
 * 收起档的浮层信息条。
 *
 * 同层渲染下它是普通 view，CSS 完整可用（阴影、透明度都行），
 * 不再受 cover-view 那套限制。
 */
.dashboard-sheet-peek {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  /* bottom 由脚本按安全区动态绑定 */
  z-index: 30;
  padding: 20rpx 28rpx 24rpx;
  /* 深蓝灰而非纯黑：浮在地图上时比黑更协调，也和 Google 蓝同一色相家族 */
  background-color: rgba(32, 33, 36, 0.82);
  border-radius: 28rpx;
  box-shadow: 0 8rpx 28rpx rgba(0, 0, 0, 0.18);
}

.dashboard-sheet-peek__handle {
  width: 72rpx;
  height: 8rpx;
  margin: 0 auto 18rpx;
  border-radius: 999rpx;
  background-color: rgba(255, 255, 255, 0.35);
}

.dashboard-sheet-peek__row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.dashboard-sheet-peek__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.dashboard-sheet-peek__title {
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
}

.dashboard-sheet-peek__subtitle {
  margin-top: 6rpx;
  color: rgba(255, 255, 255, 0.72);
  font-size: 24rpx;
}

.dashboard-sheet-peek__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64rpx;
  margin-left: 24rpx;
  flex-shrink: 0;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background-color: rgba(255, 255, 255, 0.18);
}

.dashboard-sheet-peek__cta-text {
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 500;
}

/*
 * 高度由脚本按面板高度算好后绑定，见模板注释。
 *
 * flex-shrink: 0 不能省 —— 面板是 flex 列容器，内容超高时浏览器默认会让子项
 * 收缩来迁就容器，滚动区被压扁就又变成"看得见但滚不动"。
 */
.dashboard-sheet__body {
  width: 100%;
  flex-shrink: 0;
}
</style>
