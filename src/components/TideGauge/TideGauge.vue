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
 * 颜色也是两端色给的：from 落在弧的起点、to 落在弧的尖端，
 * 中间是同色相的渐变。颜色取哪一档、档位叫什么名字仍然归调用方。
 */
import { computed, getCurrentInstance, onMounted, ref, watch } from 'vue';

import { windowMetrics } from '@/composables/windowMetrics';
import { mixColor } from '@/utils/canvas';
import { createCanvasLayer, useCanvasPageShow } from '@/utils/chartCanvas';

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
   * 值弧渐变的起点色（弧的起点）。
   *
   * 颜色按哪一档取、档位叫什么名字，仍然归调用方。
   */
  fromColor?: string;
  /** 值弧渐变的尖端色（弧的尖端） */
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
  // 深蓝 → 浅蓝。潮位表走这一档：潮位是米数，不是好坏，不能拿红黄绿去上色。
  // 它压在深色面上，所以尖端取最亮的那一档。
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

/**
 * 画布层。取节点、判空、重试都在 utils/chartCanvas 里。
 *
 * 这一层原来是自己抄的一份取节点的流程（queryCanvas + INIT_RETRY_DELAYS），
 * 少了两样东西：世代号（节点被回收后缓存的 ctx 会作废）与页面回前台的作废。
 * 表在天气页上，页面一被切走画布节点就被回收，回来再画就是画到死画布上 ——
 * 那是原生崩溃（小程序闪退），不是 JS 异常，开发者工具里看不出来。
 */
const dprRef = ref(1);

const layer = createCanvasLayer({
  instance,
  id: canvasId,
  metrics: () => {
    const dpr = windowMetrics().pixelRatio;
    const size = sizePx.value;
    dprRef.value = dpr;
    return { width: size, height: size, dpr };
  },
  label: 'TideGauge',
});

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
 * 整条弧铺**一条渐变**：起点色到尖端色，中间线性过渡。
 *
 * 渐变按弧长走，不按量程位置 —— 段 i 的颜色取它在**画出来的那段弧**
 * 上的相对位置。所以 30 分的弧和 90 分的弧，浅端起、浓端止，
 * 颜色只表示「当前是这一档」，不表示「走到哪儿了」。
 *
 * 为什么不用 createLinearGradient：线性渐变沿一条直线铺，铺不出
 * 「颜色跟着角度走」。沿弧两端连成的弦铺出来的是「颜色跟着 x 走」——
 * 左下那一整段被压成同一个颜色，渐变在弧上就不匀了。
 */
function drawValueArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  stroke: number,
  value: number,
  fromColor: string,
  toColor: string,
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
    // 颜色取这一段在**已画弧**上的相对位置 —— 与值无关
    ctx.strokeStyle = mixColor(fromColor, toColor, (from + to) / 2 / value);
    ctx.stroke();
  }
}

function draw(): void {
  const ctx = layer.ctx;
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

  drawValueArc(ctx, cx, cy, r, stroke, value, props.fromColor, props.toColor);
}

/**
 * 取节点、装 ctx、画一遍。
 *
 * 宽高不从 SelectorQuery 要 —— 那是布局测量值，画布的 CSS 宽高本来就由
 * rpx 算好绑在节点上，数值在手上，问布局是引入了一个既不必要又会失败的依赖。
 *
 * 拿不到节点时由画布层自己按节奏重试：组件可能挂在一个还在做高度过渡的
 * 容器里，节点进 DOM 的时间点会飘。
 */
async function initCanvas(): Promise<void> {
  if (!(await layer.init())) return;

  draw();
}

/**
 * 页面回前台：画布节点可能已被回收，缓存的 ctx 作废，重新取节点再画。
 *
 * 不作废就是拿旧 ctx 补画一帧 —— 那是画到一块死画布上，原生崩溃。
 */
useCanvasPageShow([layer], () => {
  void initCanvas();
});

onMounted(() => {
  void initCanvas();
});

watch(
  () => [props.value, props.min, props.max, props.fromColor, props.toColor, props.trackColor],
  () => {
    // 画布还没拿到就先补拿，等节点到了再画
    if (!layer.ready) {
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
