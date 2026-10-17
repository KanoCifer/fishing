<template>
  <view class="line-chart">
    <!-- canvas 的宽高必须是确定的数值，不能用百分比，否则小程序端拿不到实际尺寸 -->
    <canvas
      :id="canvasId"
      type="2d"
      class="line-chart__canvas"
      :style="{ width: cssWidth, height: cssHeight }"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    />
    <view v-if="activeIndex >= 0 && activePoint" class="line-chart__tooltip" :style="tooltipStyle">
      <text class="line-chart__tooltip-title">{{ categories[activeIndex] }}</text>
      <text v-for="(s, i) in series" :key="i" class="line-chart__tooltip-row">
        <text class="line-chart__tooltip-dot" :style="{ backgroundColor: s.color || colors[i] }" />
        <text class="line-chart__tooltip-name">{{ s.name }}</text>
        <text class="line-chart__tooltip-value">{{ activePoint[i] }}</text>
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'

interface Series {
  name: string
  data: number[]
  color?: string
}

/**
 * `fields({ node: true })` 返回的 canvas 节点没有官方类型，
 * 按实际用到的成员局部声明，不要 any。
 */
interface CanvasNode2D {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D
  /**
   * 基础库 2.7.0+ 由 canvas 节点提供的 rAF。
   * 本项目只有小程序端，`type="2d"` 本身就要求 2.9.0+，所以这两个方法一定在，
   * 直接声明为必需，不用再写 H5 的兑底分支。
   */
  requestAnimationFrame(cb: () => void): number
  cancelAnimationFrame(requestId: number): void
}

/** SelectorQuery 的 fields 回调返回，按实际用到的字段局部声明（宽高依赖 size: true 才带） */
interface CanvasQueryResult {
  node?: CanvasNode2D
  width?: number
  height?: number
}

const props = withDefaults(
  defineProps<{
    categories: string[]
    series: Series[]
    /** 画布宽，单位 rpx */
    width?: number
    /** 画布高，单位 rpx */
    height?: number
    /** 网格线颜色 */
    gridColor?: string
    axisColor?: string
    textColor?: string
    /** 是否播放入场动画（逐段绘制） */
    animate?: boolean
    /** 入场动画时长，毫秒 */
    duration?: number
  }>(),
  {
    width: 690,
    height: 360,
    gridColor: '#EBEDF0',
    axisColor: '#C8C7CC',
    textColor: '#999999',
    animate: true,
    duration: 700,
  },
)

const instance = getCurrentInstance()!
const uid = Math.random().toString(36).slice(2, 8)
const canvasId = `line-chart-${uid}`

const PALETTE = ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6']
const colors = computed(() => PALETTE)

/** rpx 只对样式有效，canvas 内部坐标要用 px，这里先记下 px 值 */
const cssWidth = ref('')
const cssHeight = ref('')
const canvasRef = ref<{ width: number; height: number } | null>(null)
const ctxRef = ref<CanvasRenderingContext2D | null>(null)
const dprRef = ref(1)
/**
 * canvas 节点，帧调度要用它自带的 requestAnimationFrame。
 * 不进模板也不需要响应式，普通变量即可。
 */
let canvasNode: CanvasNode2D | null = null
let rafId = 0

const activeIndex = ref(-1)
const activePoint = ref<number[] | null>(null)

/** 记录绘图时的像素几何，触摸换算要用 */
let geo: {
  left: number
  top: number
  plotW: number
  plotH: number
  max: number
  len: number
} = { left: 0, top: 0, plotW: 0, plotH: 0, max: 1, len: 0 }

/** 入场动画进度 0→1 */
let progress = 1

const PAD = { left: 8, right: 8, top: 10, bottom: 10 }
const AXIS_H = 22

/** 把最大值向上取整到一个好看的刻度值，避免出现 37 这种轴标签 */
function niceMax(value: number): number {
  if (value <= 0) return 10
  const exp = Math.floor(Math.log10(value))
  const base = Math.pow(10, exp)
  const n = value / base
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * base
}

function draw() {
  const ctx = ctxRef.value
  const size = canvasRef.value
  if (!ctx || !size) return

  const { width, height } = size

  // setTransform 是覆盖式，scale 是累乘式：动画每帧都调 scale，矩阵会叠成 dpr^n，
  // 第二帧起线条就飞出画布。每帧重置一次矩阵，绘制逻辑继续用 CSS 像素。
  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const cw = width
  const ch = height
  const left = PAD.left + 36 // 左侧留给 Y 轴数字
  const top = PAD.top
  const right = cw - PAD.right
  const bottom = ch - AXIS_H - PAD.bottom
  const plotW = right - left
  const plotH = bottom - top

  const max = niceMax(
    props.series.reduce((acc, s) => Math.max(acc, ...s.data.map((v) => v || 0)), 0),
  )
  const len = props.categories.length

  geo = { left, top, plotW, plotH, max, len }

  // 网格 + Y 轴刻度
  ctx.strokeStyle = props.gridColor
  ctx.fillStyle = props.textColor
  ctx.lineWidth = 1
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'

  const lines = 4
  for (let i = 0; i <= lines; i++) {
    const y = Math.round(top + (plotH / lines) * i) + 0.5
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    ctx.fillText(String(Math.round((max / lines) * (lines - i))), left - 6, y)
  }

  // X 轴标签
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const labelGap = len > 1 ? plotW / (len - 1) : 0
  props.categories.forEach((c, i) => {
    const x = len > 1 ? left + labelGap * i : left + plotW / 2
    // 标签太密时隔一个画一个
    if (len > 8 && i % 2 === 1) return
    ctx.fillText(c, x, bottom + 6)
  })

  if (!len) return

  // 数据线
  props.series.forEach((s, si) => {
    const color = s.color || PALETTE[si % PALETTE.length]
    const points = s.data.map((v, i) => ({
      x: len > 1 ? left + labelGap * i : left + plotW / 2,
      y: bottom - ((v || 0) / max) * plotH,
    }))
    if (!points.length) return

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    // 入场动画：只画到 progress 对应的位置，线像被"画"出来一样
    const cut = progress * (points.length - 1)
    points.forEach((p, i) => {
      if (i <= Math.floor(cut)) {
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
      } else if (i === Math.ceil(cut)) {
        // 最后一个未完成段，按小数比例插值出当前的端点
        const t = cut - i + 1
        const prev = points[i - 1]
        ctx.lineTo(prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t)
      }
    })
    ctx.stroke()

    // 数据点：随动画进度逐个出现
    ctx.fillStyle = '#fff'
    points.forEach((p, i) => {
      if (i > cut + 0.5) return
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    })
  })
}

async function initCanvas() {
  await nextTick()
  uni
    .createSelectorQuery()
    .in(instance)
    .select(`#${canvasId}`)
    .fields({ node: true, size: true }, (res: CanvasQueryResult | CanvasQueryResult[]) => {
      const item = Array.isArray(res) ? res[0] : res
      // 宽高只在 fields 里声明了 size 时才返回，缺了就画不了，别拿 NaN 去设位图尺寸
      if (!item?.node || !item.width || !item.height) return
      const canvas = item.node
      // getSystemInfoSync 在微信端已废弃（控制台告警），dpr 从 getWindowInfo 取
      const dpr = uni.getWindowInfo().pixelRatio || 1

      // 按 dpr 放大位图尺寸，避免高分屏发虚；CSS 尺寸不变，由 rpx 决定
      canvas.width = item.width * dpr
      canvas.height = item.height * dpr

      canvasRef.value = { width: item.width, height: item.height }
      dprRef.value = dpr
      ctxRef.value = canvas.getContext('2d')
      canvasNode = canvas

      if (props.animate) {
        play()
      } else {
        progress = 1
        draw()
      }
    })
    .exec()
}

function cancelFrame() {
  if (canvasNode && rafId) {
    canvasNode.cancelAnimationFrame(rafId)
  }
  rafId = 0
}

/**
 * 入场动画：逐帧推进 progress，让折线"画"出来。
 *
 * mp-weixin 逻辑层没有全局 requestAnimationFrame（那是浏览器 API，连 window 都没有），
 * 取帧走 canvas 节点自带的方法（基础库 2.7.0+），帧率跟随系统刷新、页面隐藏自动暂停。
 * 取消必须用同一个节点：节点的 requestId 交给别处的 cancelAnimationFrame 会静默失效，
 * 不报错、循环也停不下来，页面反复进出就一直漏帧。
 */
function play() {
  // watch 可能早于 SelectorQuery 回调触发，那时节点还没拿到，等 initCanvas 里再放
  if (!canvasNode) return
  const node = canvasNode
  cancelFrame()
  const duration = props.duration
  const start = Date.now()
  progress = 0
  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / duration)
    // easeOutCubic，末尾减速，比线性自然
    progress = 1 - Math.pow(1 - t, 3)
    draw()
    if (t < 1) {
      rafId = node.requestAnimationFrame(tick)
    } else {
      // t=1 时 progress 已经是 1，这一帧画完循环自然结束
      rafId = 0
    }
  }
  rafId = node.requestAnimationFrame(tick)
}

onMounted(() => {
  // rpx → px：canvas 内部坐标只能用 px
  cssWidth.value = `${uni.upx2px(props.width)}px`
  cssHeight.value = `${uni.upx2px(props.height)}px`
  initCanvas()
})

// 数据变化时重播动画（除非显式关掉动画，那就直接画最终态）
watch(
  () => [props.categories, props.series],
  () => {
    if (props.animate) {
      play()
    } else {
      progress = 1
      draw()
    }
  },
  { deep: true },
)

onBeforeUnmount(() => {
  cancelFrame()
})

const tooltipStyle = computed(() => {
  const { left, plotW, len } = geo
  const gap = len > 1 ? plotW / (len - 1) : plotW
  const x = len > 1 ? left + gap * activeIndex.value : left + plotW / 2
  return {
    left: `${Math.max(0, Math.min(x - 60, (geo.left + geo.plotW) - 120))}px`,
    top: `${Math.max(0, geo.top - 4)}px`,
  }
})

function pick(clientX: number) {
  const { left, plotW, len } = geo
  if (!len) return
  const gap = len > 1 ? plotW / (len - 1) : plotW
  const rel = (clientX - left) / (len > 1 ? gap : plotW)
  const i = Math.round(rel)
  if (i < 0 || i >= len) {
    activeIndex.value = -1
    activePoint.value = null
    return
  }
  activeIndex.value = i
  activePoint.value = props.series.map((s) => s.data[i] ?? 0)
}

function onTouchStart(e: any) {
  pick(e.touches[0].clientX)
}
function onTouchMove(e: any) {
  pick(e.touches[0].clientX)
}
function onTouchEnd() {
  // 保留高亮，方便用户看清数值；如需恢复初始态在这里加 setTimeout 清空
}
</script>

<style lang="scss" scoped>
.line-chart {
  position: relative;
}

.line-chart__canvas {
  display: block; // 微信端必须是 block，否则 canvas 是 inline 元素，尺寸计算会偏
}

.line-chart__tooltip {
  position: absolute;
  z-index: 10;
  min-width: 120px;
  padding: 8rpx 12rpx;
  background: rgba(0, 0, 0, 0.75);
  border-radius: 8rpx;
  pointer-events: none;
}

.line-chart__tooltip-title {
  display: block;
  font-size: 22rpx;
  color: #fff;
  margin-bottom: 4rpx;
}

.line-chart__tooltip-row {
  display: flex;
  align-items: center;
  font-size: 22rpx;
  color: #fff;
  line-height: 1.6;
}

.line-chart__tooltip-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  margin-right: 8rpx;
}

.line-chart__tooltip-name {
  flex: 1;
  margin-right: 16rpx;
}

.line-chart__tooltip-value {
  font-weight: 600;
}
</style>
