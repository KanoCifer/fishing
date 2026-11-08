<template>
  <!--
    圆环 —— 一条整圈的进度环。

    为什么画在 canvas 上而不是用 WXML 元素拼：
    WXML 不认 `<svg>` 标签（见 docs/mp-weixin-platform.md），
    能画弧的只有 canvas 2d。

    环心的数字**不在 canvas 里**，放在中间的 slot 里 ——
    canvas 里画字只能用硬编码色值和 px 字号，跟令牌层对不上；
    放在 DOM 里就能直接吃样式层的字阶与颜色（与 TideGauge 同一套做法）。

    环从正上方起，顺时针走。
  -->
  <view class="ring" :style="{ width: sizePx + 'px', height: sizePx + 'px' }">
    <!--
      宽高必须是确定的数值，不能用百分比：小程序端拿不到百分比的实际尺寸，
      会画成 0 宽。display: block 写在样式里，否则微信端 canvas 是 inline 元素，
      尺寸计算会偏。
    -->
    <canvas :id="canvasId" type="2d" class="ring__canvas" :style="{ width: sizePx + 'px', height: sizePx + 'px' }" />

    <view class="ring__mid">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * ProgressRing —— 圆环。
 *
 * 环长是值在量程里占的比例：value / max。
 * 组件本身不管这个数是什么意思（连续天数、别的什么）—— 语义在调用方。
 */
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useSurface } from '@/composables/useSurface';
import { windowMetrics } from '@/composables/windowMetrics';
import { createCanvasLayer, useCanvasPageShow } from '@/utils/chartCanvas';
import { chartPalette } from '@/utils/chartPalette';
import { themeMode } from '@/utils/theme';

interface Props {
  /** 当前值 */
  value: number;
  /** 量程上限 */
  max?: number;
  /** 画布边长（rpx） */
  size?: number;
  /** 环线粗细（rpx） */
  stroke?: number;
  /** 轨道色 */
  trackColor?: string;
  /** 值弧色 */
  fillColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  max: 0,
  size: 152,
  stroke: 8,
  /**
   * 轨道色与值弧色不设默认值 —— canvas 不解析 SCSS 变量与 CSS 变量，
   * 默认值必须是编译期常量，深色下就翻不了。
   *
   * 取色走 utils/chartPalette（轨道 = $fish-surface，值弧 = $fish-accent），
   * 调用方显式传色时才用传入的（见 utils/canvas.ts 的说明）。
   */
  trackColor: undefined,
  fillColor: undefined,
});

/**
 * 这一块压在什么上面。
 *
 * 照片面上的环要走照片面那套色板（深玻璃上的白字与亮档图形）——
 * 同一块环在浅色页面与整页照片上不是同一个颜色。
 */
const surface = useSurface();

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
// canvasId 必须页面内唯一，同一页面可能画多个环
const canvasId = `progress-ring-${uid}`;

/** 画布的 CSS 尺寸（px）。rpx 只对样式有效，canvas 内部坐标用 px */
const sizePx = computed(() => uni.upx2px(props.size));
const strokePx = computed(() => uni.upx2px(props.stroke));

const dprRef = ref(1);

/**
 * 一层画布。取节点、判空、重试、世代作废都在 utils/chartCanvas 里。
 *
 * 这一层原来是自己抄的一份取节点的流程，少了「世代号」与 reset()：
 * 节点被回收之后，那份缓存下来的 ctx 还能继续用 —— 画到一块死画布上，
 * 小程序端是原生崩溃，不是 JS 异常（见下面 onShow 那段）。
 */
const layer = createCanvasLayer({
  instance,
  id: canvasId,
  metrics: () => {
    const dpr = windowMetrics().pixelRatio;
    const size = sizePx.value;
    dprRef.value = dpr;
    return { width: size, height: size, dpr };
  },
  label: 'ProgressRing',
});

/** 起点：正上方。canvas 的角度以 +x 轴为 0、顺时针为正，所以正上方是 -90° */
const START_ANGLE = -Math.PI / 2;

/** 值在量程里占的比例，0–1 */
function ratio(): number {
  const span = props.max - 0;
  if (!Number.isFinite(span) || span <= 0) return 0;
  const value = props.value / span;
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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

  // 轨道：整圈
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
  ctx.strokeStyle = props.trackColor ?? chartPalette(surface).ringTrack;
  ctx.stroke();

  const value = ratio();
  if (value <= 0) return;

  // 值弧：从正上方顺时针走
  ctx.beginPath();
  ctx.arc(cx, cy, r, START_ANGLE, START_ANGLE + Math.PI * 2 * value, false);
  ctx.strokeStyle = props.fillColor ?? chartPalette(surface).ringFill;
  ctx.stroke();
}

/** 取节点，取到了就画一遍。取不到由画布层自己按节奏重试 */
async function initCanvas(): Promise<void> {
  if (!(await layer.init())) return;
  draw();
}

onMounted(() => {
  void initCanvas();
});

/**
 * 主题变了要重画。canvas 上的颜色是烤进去的，跟不上 WXSS 的媒体查询。
 */
watch(themeMode, () => {
  if (!layer.ready) return;
  draw();
});

/**
 * 页面回到前台时重新取一次节点再画。
 *
 * 小程序在后台期间会回收画布节点（见 TideChart 那段同样的说明）。
 * 页面被切走时缓存下来的 ctx 指向的是一块已经被回收的画布 ——
 * 在它上面绘制**不会抛 JS 异常**：canvas 2d 是原生实现，
 * 对着一块死画布画会直接把小程序带崩（闪退），开发者工具里看不出来。
 *
 * 所以回前台不是「拿旧 ctx 补画一帧」，而是把节点重新取一遍：
 * 拿到新节点、重新装 ctx，再画。取不到时画布层会按重试节奏等节点回来。
 */
useCanvasPageShow([layer], () => {
  void initCanvas();
});

/** 节点已经没了，重试定时器也得停 —— 否则它会一直查一个不存在的节点 */
onBeforeUnmount(() => {
  layer.reset();
});

watch(
  () => [props.value, props.max, props.fillColor, props.trackColor],
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
.ring {
  position: relative;
}

.ring__canvas {
  display: block;
}

/*
 * 环心的内容。
 *
 * 绝对定位铺满整块环，文字居中 —— 环心正是这块区域的中心。
 */
.ring__mid {
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
