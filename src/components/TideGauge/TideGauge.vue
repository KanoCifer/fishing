<template>
  <view class="gauge" :style="{ width: sizePx + 'px', height: sizePx + 'px' }">
    <canvas :id="canvasId" type="2d" class="gauge__canvas" :style="{ width: sizePx + 'px', height: sizePx + 'px' }" />
    <view class="gauge__center">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * TideGauge —— 弧形表。
 *
 * 量程由 min / max 给，值由 value 给：弧长是值在量程里占的比例。
 * 组件本身不管这个数是什么意思（潮位、气压、别的什么）——
 * 语义在调用方。
 *
 * 颜色也是按量程位置给的：色阶的每一档落在量程的一个位置上，
 * 弧尖那一段的颜色就是值落在哪一档。档位叫什么名字仍然归调用方。
 */
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue';

import { windowMetrics } from '@/composables/windowMetrics';
import { rampColor } from '@/utils/canvas';
import { createSelectorQuery } from '@/utils/selectorQuery';

/**
 * `fields({ node: true })` 返回的 canvas 节点没有官方类型，按用到的成员局部声明。
 */
interface CanvasNode2D {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
}

interface Props {
  /** 当前值 */
  value: number;
  /** 量程下限 */
  min?: number;
  /** 量程上限 */
  max?: number;
  /** 画布边长（rpx） */
  size?: number;
  /** 弧线粗细（rpx） */
  stroke?: number;
  /** 轨道色 */
  trackColor?: string;
  /**
   * 值弧的色阶。
   *
   * 每一档落在量程的一个位置上：值落在量程的哪一段，弧上那一段就是那个颜色。
   * 所以颜色直接承载数值 —— 弧尖那一段的颜色就是当前值落在色阶的哪一档。
   *
   * 一档是实色，两档以上才有过渡。
   */
  stops?: readonly string[];
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 3,
  size: 180,
  stroke: 12,
  // 默认值取深色面那一档：弧形表现在只用在深色面上，
  // 轨道与深色面上的发丝线同一档，弧线是深色面上唯一亮起来的东西。
  trackColor: 'rgba(255, 255, 255, 0.14)',
  // 蓝 → 浅蓝。潮位表走这一档：潮位是米数，不是好坏，不能拿红黄绿去上色。
  stops: () => ['#4f8cff', '#82d4ff'],
});

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
// canvasId 必须页面内唯一，同一页面可能画多个表
const canvasId = `tide-gauge-${uid}`;

/** 画布的 CSS 尺寸（px）。rpx 只对样式有效，canvas 内部坐标用 px */
const sizePx = computed(() => uni.upx2px(props.size));
const strokePx = computed(() => uni.upx2px(props.stroke));

const ctxRef = ref<CanvasRenderingContext2D | null>(null);
const dprRef = ref(1);

/**
 * 弧的起止角。
 *
 * canvas 的角度以 +x 轴为 0，y 向下、顺时针为正。
 * 135° 在左下，45° 在右下 —— 从 135° 顺时针扫 270°，
 * 正好过左、上、右，缺口留在正下方。
 */
const START_ANGLE = Math.PI * 0.75;
const SWEEP_ANGLE = Math.PI * 1.5;

/** 值在量程里占的比例，0–1 */
function ratio(): number {
  const span = props.max - props.min;
  if (!Number.isFinite(span) || span <= 0) return 0;

  const value = (props.value - props.min) / span;
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * 值弧切段的段数上限。
 *
 * 一段就是一笔绘制命令，而这块画布在数字滚动时每帧都要重画 ——
 * 段数给够就行，不做无意义的细分。
 */
const MAX_SEGMENTS = 96;

/**
 * 每段弧长不超过线宽的这个倍数。
 *
 * 圆头线帽伸出段端之外，段太长就接不上，弧上会露出一圈缺口。
 */
const SEGMENT_SPAN = 0.6;

/**
 * 值弧。
 *
 * 弧切成若干段，每段按它在**量程**上的位置取色 —— 弧尖那一段的颜色
 * 就是当前值落在色阶的哪一档，颜色直接承载数值。
 *
 * 为什么不用 createLinearGradient：线性渐变沿一条直线铺，铺不出
 * 「颜色跟着角度走」。沿弧两端连成的弦铺出来的是「颜色跟着 x 走」——
 * 左下那一整段被压成同一个颜色，值落在 20 还是 40 看不出区别。
 */
function drawValueArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  stroke: number,
  value: number,
  stops: readonly string[],
): void {
  // 段长要短于线宽，圆头线帽才接得上
  const byWidth = Math.ceil((SWEEP_ANGLE * r) / (stroke * SEGMENT_SPAN));
  const segments = Math.min(MAX_SEGMENTS, Math.max(8, byWidth));

  // 段按量程切：第 i 段覆盖量程的 [i / segments, (i + 1) / segments]
  const count = Math.ceil(value * segments);
  for (let i = 0; i < count; i += 1) {
    const from = i / segments;
    // 末段在值的位置截断 —— 弧长就是值
    const to = Math.min((i + 1) / segments, value);
    ctx.beginPath();
    ctx.arc(cx, cy, r, START_ANGLE + SWEEP_ANGLE * from, START_ANGLE + SWEEP_ANGLE * to, false);
    ctx.strokeStyle = rampColor(stops, (from + to) / 2);
    ctx.stroke();
  }
}

function draw(): void {
  const ctx = ctxRef.value;
  if (!ctx) return;

  const size = sizePx.value;
  const stroke = strokePx.value;
  const cx = size / 2;
  const cy = size / 2;
  // 半径留出半个线宽：圆头线帽伸出弧端之外，不留这半个线宽就会切边
  const r = Math.max(1, (size - stroke) / 2);

  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, size, size);

  ctx.lineCap = 'round';
  ctx.lineWidth = stroke;

  // 轨道：整条量程
  ctx.beginPath();
  ctx.arc(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP_ANGLE, false);
  ctx.strokeStyle = props.trackColor;
  ctx.stroke();

  const value = ratio();
  if (value <= 0) return;

  drawValueArc(ctx, cx, cy, r, stroke, value, props.stops);
}

/**
 * 初始化画布。
 *
 * 宽高不从 SelectorQuery 要 —— 那是布局测量值，画布的 CSS 宽高本来就由
 * rpx 算好绑在节点上，数值在手上，问布局是引入了一个既不必要又会失败的依赖。
 *
 * 拿不到节点时按 INIT_RETRY_DELAYS 的节奏继续试：组件可能挂在一个
 * 还在做高度过渡的容器里，节点进 DOM 的时间点会飘。
 */
const INIT_RETRY_DELAYS = [0, 60, 120, 200, 300, 400, 600] as const;

let initialized = false;
let initializing = false;
let retryIndex = 0;
let retryTimer = 0;

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = 0;
  }
}

function scheduleRetry(): void {
  const delay = INIT_RETRY_DELAYS[retryIndex];
  if (delay === undefined) {
    // 重试用尽还是拿不到节点，画布会一直空白。留一条 warn，
    // 下次再遇到空图能直接分清是「节点没进 DOM」还是「绘制逻辑出错」。
    console.warn(`[TideGauge] 画布节点获取失败（已重试 ${INIT_RETRY_DELAYS.length} 次）：未查到 canvas 节点`);
    return;
  }
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = 0;
    void initCanvas();
  }, delay);
}

function queryCanvas(): Promise<CanvasNode2D | null> {
  return new Promise((resolve) => {
    createSelectorQuery(instance)
      .select(`#${canvasId}`)
      .fields({ node: true }, (res) => {
        const item = Array.isArray(res) ? res[0] : res;
        // node 在官方类型里是 any，这里收窄成本组件实际用到的形状
        const node = (item as { node?: unknown } | undefined)?.node;
        resolve(typeof node === 'object' && node !== null ? (node as CanvasNode2D) : null);
      })
      .exec();
  });
}

async function initCanvas(): Promise<void> {
  if (initializing || initialized) return;
  initializing = true;

  try {
    await nextTick();

    const node = await queryCanvas();
    if (!node) {
      scheduleRetry();
      return;
    }

    const dpr = windowMetrics().pixelRatio;
    const width = sizePx.value;
    const height = sizePx.value;

    // 按 dpr 放大位图尺寸，避免高分屏发虚；CSS 尺寸不变，由 rpx 决定。
    // 位图尺寸取整：换算下来可能是小数，位图按整数给，绘制仍按 CSS 像素走。
    node.width = Math.round(width * dpr);
    node.height = Math.round(height * dpr);

    dprRef.value = dpr;
    ctxRef.value = node.getContext('2d');
    initialized = true;
    clearRetryTimer();

    draw();
  } finally {
    initializing = false;
  }
}

onMounted(() => {
  void initCanvas();
});

watch(
  // 色阶拼成字符串再比：调用方传的是字面量数组时，每次渲染都是新引用，
  // 按引用比会每渲染一次就重画一遍。
  () => [props.value, props.min, props.max, props.stops.join(','), props.trackColor],
  () => {
    // 画布还没拿到就先补拿，等节点到了再画
    if (!initialized) {
      retryIndex = 0;
      void initCanvas();
      return;
    }
    draw();
  },
);
</script>

<style lang="scss" scoped>
.gauge {
  position: relative;
}

.gauge__canvas {
  display: block;
}

/*
 * 表心的内容。
 *
 * 绝对定位铺满整块表，文字居中 —— 它在弧的开口那一侧，
 * 而弧心正是这块区域的中心。
 */
.gauge__center {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;

  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
