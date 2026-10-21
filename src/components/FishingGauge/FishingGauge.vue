<template>
  <view class="gauge">
    <view class="gauge__dial">
      <canvas
        :id="canvasId"
        type="2d"
        class="gauge__canvas"
        :style="{ width: cssSizePx + 'px', height: cssSizePx + 'px' }"
      />

      <view class="gauge__center">
        <text class="gauge__score" :class="`gauge__score--${tone}`">{{ score }}</text>
      </view>
    </view>

    <view class="gauge__side">
      <text class="gauge__label">钓鱼指数</text>
      <text class="gauge__level" :class="`gauge__level--${tone}`">{{ level }}</text>
      <text class="gauge__verdict">{{ verdict }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { createSelectorQuery } from '@/utils/selectorQuery';
import type { Tone } from '@/utils/weather';

/**
 * `fields({ node: true })` 返回的 canvas 节点没有官方类型，
 * 按实际用到的成员局部声明（与 LineChart 保持一致）。
 */
interface CanvasNode2D {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  /**
   * 基础库 2.7.0+ 由 canvas 节点提供的 rAF。
   * mp-weixin 逻辑层没有全局 requestAnimationFrame（那是浏览器 API），
   * 取帧只能走节点自带的方法。
   */
  requestAnimationFrame(cb: () => void): number;
  cancelAnimationFrame(requestId: number): void;
}

const props = withDefaults(
  defineProps<{
    /** 钓鱼指数，0–100 */
    score: number;
    /** 等级对应的色调，决定弧的颜色 */
    tone?: Tone;
    /** 等级词，如「爆护」 */
    level: string;
    /** 一句话结论，如「今日爆护」 */
    verdict: string;
    /** 是否播放入场动画 */
    animate?: boolean;
    /** 入场动画时长，毫秒 */
    duration?: number;
  }>(),
  {
    tone: 'muted',
    meta: '',
    animate: true,
    duration: 900,
  },
);

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
const canvasId = `fishing-gauge-${uid}`;

/**
 * 表盘直径，单位 rpx。184rpx = 92pt。
 *
 * 定死而不是自适应：这张卡左右两栏的宽度是固定的，环跟着变会让
 * 侧栏的起始位置跟着飘，一眼看过去就散架。
 */
const DIAL_SIZE = 184;

/**
 * 环的几何比例，按 100×100 的虚拟画布记。
 *
 * 半径 42、线宽 8：环心留出的空档刚好放下一行分数（直径约 68），
 * 再粗一点就挤到数字上，再细就看不出是「刻度」只是「圈」。
 */
const RADIUS_RATIO = 0.42;
const STROKE_RATIO = 0.08;

/**
 * 弧色。canvas 不解析 SCSS 变量，只认 rgb/hex ——
 * 这些值与令牌层 _color.scss 的同名令牌手工保持一致，改那边要记得改这里。
 *
 * 弧色跟着等级走（绿 → 蓝 → 橙 → 红 → 灰，见 utils/weather 的 TONE_BY_LEVEL）。
 * 弧是这张卡上唯一的图形信号，颜色就是它全部的含义 —— 画成黑的等于
 * 把这个位置浪费掉，读的人只能回去读字。
 *
 * muted 档用半透明灰而不是实色：空军/无数据时弧几乎不可见，
 * 但轨道还在，读作「这把尺是空的」而不是「这把尺坏了」。
 */
const ARC_COLORS: Readonly<Record<Tone, string>> = {
  success: '#34c759', // $fish-success
  blue: '#007aff', // $fish-blue
  warning: '#ff9500', // $fish-warning
  destructive: '#ff3b30', // $fish-destructive
  muted: 'rgba(120, 120, 128, 0.55)',
};

/** 轨道色 = $fish-surface */
const TRACK_COLOR = 'rgba(120, 120, 128, 0.16)';

/** 表盘的 CSS 尺寸（px）。rpx 只对样式有效，canvas 内部坐标和位图尺寸都得用 px */
const cssSizePx = computed(() => uni.upx2px(DIAL_SIZE));

const sizeRef = ref<{ size: number } | null>(null);
const ctxRef = ref<CanvasRenderingContext2D | null>(null);
const dprRef = ref(1);

let canvasNode: CanvasNode2D | null = null;
let rafId = 0;

/** 入场动画进度 0→1 */
let progress = 1;

/** 分数钳到 0–100。接口给的是 0–100，但后端加权重算后越界过一次 */
function clampScore(): number {
  if (!Number.isFinite(props.score)) return 0;
  return Math.max(0, Math.min(100, props.score));
}

function draw() {
  const ctx = ctxRef.value;
  const size = sizeRef.value;
  if (!ctx || !size) return;

  const s = size.size;

  // setTransform 是覆盖式：动画每帧都改矩阵，累乘会叠成 dpr^n，
  // 第二帧起弧就飞出画布。每帧重置一次，绘制逻辑继续用 CSS 像素。
  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, s, s);

  const cx = s / 2;
  const cy = s / 2;
  const radius = s * RADIUS_RATIO;

  ctx.lineCap = 'round';

  // 轨道：整圈。弧是叠在轨道上的，轨道先画
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = TRACK_COLOR;
  ctx.lineWidth = s * STROKE_RATIO;
  ctx.stroke();

  const score = clampScore();
  if (score <= 0) return;

  // 弧：从 12 点开始顺时针画，角度 = 分数占比。
  // 仪表盘的读数习惯就是从正上方起，跟钟表一样。
  const sweep = (Math.PI * 2 * score) / 100;
  const start = -Math.PI / 2;

  // 动画第一帧 progress 还是 0，弧长为零 —— 有的实现会拿圆头线帽画出一个
  // 小圆点（凭空多一个「起点」），所以这里直接不画。
  const drawn = sweep * progress;
  if (drawn <= 0.001) return;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + drawn);
  ctx.strokeStyle = ARC_COLORS[props.tone] ?? ARC_COLORS.muted;
  ctx.lineWidth = s * STROKE_RATIO;
  ctx.stroke();
}

/**
 * 拿节点的重试节奏（毫秒）。
 *
 * 为什么必须重试：canvas 节点进入合成的时间会飘，第一次查不到就放弃的话，
 * 环会一直空白，而且没有任何报错可查。与 LineChart 同一套节奏。
 */
const INIT_RETRY_DELAYS = [0, 60, 120, 200, 300, 400, 600] as const;

let initializing = false;
let initialized = false;
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
    console.warn(`[FishingGauge] 画布节点获取失败（已重试 ${INIT_RETRY_DELAYS.length} 次）：未查到 canvas 节点`);
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
        const node = (item as { node?: unknown } | undefined)?.node;
        resolve(typeof node === 'object' && node !== null ? (node as CanvasNode2D) : null);
      })
      .exec();
  });
}

async function initCanvas() {
  if (initializing || initialized) return;
  initializing = true;

  try {
    await nextTick();

    const canvas = await queryCanvas();
    if (!canvas) {
      scheduleRetry();
      return;
    }

    const dpr = uni.getWindowInfo().pixelRatio || 1;
    const size = cssSizePx.value;

    // 位图尺寸按 dpr 放大、CSS 尺寸不变，否则高分屏发虚
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    sizeRef.value = { size };
    dprRef.value = dpr;
    ctxRef.value = canvas.getContext('2d');
    canvasNode = canvas;
    initialized = true;
    clearRetryTimer();

    if (props.animate) {
      play();
    } else {
      progress = 1;
      draw();
    }
  } finally {
    initializing = false;
  }
}

function cancelFrame() {
  if (canvasNode && rafId) {
    canvasNode.cancelAnimationFrame(rafId);
  }
  rafId = 0;
}

/**
 * 入场动画：弧从 0 画到分数。
 *
 * 弧的起点始终钉在 12 点，只有末端在长 —— 这是「刻度盘被充上去」的读法，
 * 起点跟着动就变成了「表针在转」，读成另一件事。
 */
function play() {
  if (!canvasNode) return;
  const node = canvasNode;
  cancelFrame();

  const duration = props.duration;
  const start = Date.now();
  progress = 0;

  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / duration);
    // easeOutCubic，末尾减速
    progress = 1 - Math.pow(1 - t, 3);
    draw();
    if (t < 1) {
      rafId = node.requestAnimationFrame(tick);
    }
  };

  rafId = node.requestAnimationFrame(tick);
}

/** 分数或色调变了就重画。刷新拿到新指数时，环要跟着长到新位置 */
function redraw() {
  if (!initialized) return;
  if (props.animate) {
    play();
  } else {
    progress = 1;
    draw();
  }
}

onMounted(() => {
  void initCanvas();
});

onBeforeUnmount(() => {
  clearRetryTimer();
  cancelFrame();
  canvasNode = null;
});

watch(() => [props.score, props.tone], redraw);
</script>

<style lang="scss" scoped>
/*
 * 这张卡本身是玻璃面。
 *
 * 层次靠「面 + 阴影」而不是描边：半透明底 + 顶边高光 + 多层阴影。
 * 模糊是增强不是依赖（见令牌层 _material.scss 的 fish-glass），没有模糊它仍然
 * 读得出「一层浮起来的材质」。
 */
.gauge {
  display: flex;
  align-items: center;
  padding: 36rpx 40rpx;
  @include fish-glass($fish-radius-2xl);
}

/* 表盘。relative 是分数叠上去的前提 */
.gauge__dial {
  position: relative;
  width: 184rpx;
  height: 184rpx;
  flex-shrink: 0;
}

.gauge__canvas {
  display: block;
}

/*
 * 环心的分数。
 *
 * 不套字阶：这一处要覆盖的字重（300）和字距（-0.02em）都跟字阶里的
 * 任何一级对不上，套上去只会留下一串被覆盖掉的声明。直写更省事。
 *
 * 字重 300 是在「细得优雅」和「非 Apple 设备上退化成细体后发虚」之间
 * 取的折中 —— 和结论头原来那个大数字同一套理由。
 *
 * 颜色跟着等级走（压深档，见令牌层 _color.scss 的说明）：弧是明色、数字是深色，
 * 同一档色相，一眼能对上。
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

.gauge__score {
  color: $fish-ink;
  font-size: 60rpx;
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.gauge__score--success {
  color: $fish-success-ink;
}

.gauge__score--blue {
  color: $fish-blue-600;
}

.gauge__score--warning {
  color: $fish-warning;
}

.gauge__score--destructive {
  color: $fish-destructive;
}

.gauge__score--muted {
  color: $fish-muted;
}

.gauge__side {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  margin-left: 40rpx;
}

/*
 * 「钓鱼指数」这个名号放在侧栏，不塞进环里 ——
 * 环的内径只有 68pt，一行小字贴着那道弧读不清。
 *
 * 用 $fish-muted 而不是 $fish-muted-60：这一行是给「这堆字是什么」用的，
 * 不是装饰。0.3 的透明度在半透明玻璃卡上几乎读不出来（实测过）。
 */
.gauge__label {
  color: $fish-muted;
  font-size: 20rpx;
  line-height: 1;
  letter-spacing: 0.04em;
}

.gauge__level {
  margin-top: 10rpx;
  @include fish-type(title2);
}

.gauge__level--success {
  color: $fish-success-ink;
}

.gauge__level--blue {
  color: $fish-blue-600;
}

.gauge__level--warning {
  color: $fish-warning;
}

.gauge__level--destructive {
  color: $fish-destructive;
}

.gauge__level--muted {
  color: $fish-muted;
}

.gauge__verdict {
  margin-top: 6rpx;
  color: $fish-muted;
  @include fish-type(subhead);
}

.gauge__meta {
  margin-top: 6rpx;
  color: $fish-muted;
  @include fish-type(caption2);
}
</style>
