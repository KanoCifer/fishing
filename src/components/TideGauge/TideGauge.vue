<template>
  <!--
    弧形表 —— 一条 270° 的弧，弧长就是量程里占掉的那一段。

    为什么画在 canvas 上而不是用 WXML 元素拼：
    WXML 不认 `<svg>` 标签（见 docs/mp-weixin-platform.md），
    能画弧的只有 canvas 2d。

    表上的数字**不在 canvas 里**，放在中间的 slot 里 ——
    canvas 里画字只能用硬编码色值和 px 字号，跟令牌层对不上；
    放在 DOM 里就能直接吃样式层的字阶与颜色。
  -->
  <view class="gauge" :style="{ width: sizePx + 'px', height: sizePx + 'px' }">
    <!--
      宽高必须是确定的数值，不能用百分比：小程序端拿不到百分比的实际尺寸，
      会画成 0 宽。display: block 写在样式里，否则微信端 canvas 是 inline 元素，
      尺寸计算会偏。
    -->
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
 */
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue';

import { windowMetrics } from '@/composables/windowMetrics';
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
  /** 值弧起始色 */
  fromColor?: string;
  /** 值弧结束色 */
  toColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 3,
  size: 180,
  stroke: 12,
  // 默认值取深色面那一档：弧形表现在只用在深色面上，
  // 轨道与深色面上的发丝线同一档，弧线是深色面上唯一亮起来的东西。
  trackColor: 'rgba(255, 255, 255, 0.14)',
  fromColor: '#4f8cff',
  toColor: '#82d4ff',
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

/** 极坐标 → 画布坐标 */
function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
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

  // 值弧。渐变沿弧的两端连成的弦铺，颜色从起端走到末端。
  const from = polar(cx, cy, r, START_ANGLE);
  const to = polar(cx, cy, r, START_ANGLE + SWEEP_ANGLE);
  const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
  gradient.addColorStop(0, props.fromColor);
  gradient.addColorStop(1, props.toColor);

  ctx.beginPath();
  ctx.arc(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP_ANGLE * value, false);
  ctx.strokeStyle = gradient;
  ctx.stroke();
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
  () => [props.value, props.min, props.max, props.fromColor, props.toColor, props.trackColor],
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
