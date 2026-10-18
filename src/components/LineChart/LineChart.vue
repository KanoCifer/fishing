<template>
  <view class="line-chart">
    <canvas
      :id="canvasId"
      type="2d"
      class="line-chart__canvas"
      :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }"
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
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface Series {
  name: string;
  data: number[];
  color?: string;
}

/**
 * `fields({ node: true })` 返回的 canvas 节点没有官方类型，
 * 按实际用到的成员局部声明，不要 any。
 */
interface CanvasNode2D {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  /**
   * 基础库 2.7.0+ 由 canvas 节点提供的 rAF。
   * 本项目只有小程序端，`type="2d"` 本身就要求 2.9.0+，所以这两个方法一定在，
   * 直接声明为必需，不用再写 H5 的兑底分支。
   */
  requestAnimationFrame(cb: () => void): number;
  cancelAnimationFrame(requestId: number): void;
}

const props = withDefaults(
  defineProps<{
    categories: string[];
    series: Series[];
    /** 画布宽，单位 rpx */
    width?: number;
    /** 画布高，单位 rpx */
    height?: number;
    /** 网格线颜色 */
    gridColor?: string;
    axisColor?: string;
    textColor?: string;
    /** 是否播放入场动画（逐段绘制） */
    animate?: boolean;
    /** 入场动画时长，毫秒 */
    duration?: number;
    /**
     * 纵轴下界。不传时从 0 起。
     *
     * 为什么需要：默认的「把最大值向上取整」会把 22~31℃ 的气温曲线顶到
     * 0~50 轴的最上面两成，7 天的起伏看着像一条直线。气温这类本身就在
     * 高位波动的量必须给一个贴近数据的下界才有信息量。
     */
    min?: number;
    /** 纵轴上界。不传时按数据自动取整 */
    max?: number;
    /**
     * X 轴每隔几个点画一个标签。不传时 8 个点以内全画、超过就隔一个画一个。
     * 点多且标签长（如 24 小时的时刻）时显式传 3~4，否则标签会糊成一片。
     */
    labelStep?: number;
  }>(),
  {
    width: 690,
    height: 360,
    gridColor: '#dadce0',
    axisColor: '#dadce0',
    textColor: '#5f6368',
    animate: true,
    duration: 700,
  },
);

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
const canvasId = `line-chart-${uid}`;

/**
 * 系列配色。取 Google / Material 色板的蓝、红、黄、绿、紫五色，
 * 顺序刻意从主色蓝起，让首条曲线与页面主题一致。
 *
 * 同样是 canvas 硬编码，改主题时要和 uni.scss 的 $fish-* 一起看。
 */
const PALETTE = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#8f5fd6'];
const colors = computed(() => PALETTE);

/**
 * 画布的 CSS 尺寸（px）。
 *
 * rpx 只对样式有效，canvas 内部坐标和位图尺寸都得用 px。
 *
 * 在 setup 里算好直接绑定，而不是 onMounted 里写进 ref：少一次
 * 「先按空串渲染、再补值」的往返，节点首帧就带着确定宽高 ——
 * 首帧没有尺寸时布局测量会拿到 0，画布就再也画不出来了。
 */
const cssWidthPx = computed(() => uni.upx2px(props.width));
const cssHeightPx = computed(() => uni.upx2px(props.height));

/** 绘图用的像素尺寸。同样自己算，不问 SelectorQuery 要布局测量值 */
const sizeRef = ref<{ width: number; height: number } | null>(null);
const ctxRef = ref<CanvasRenderingContext2D | null>(null);
const dprRef = ref(1);
/**
 * canvas 节点，帧调度要用它自带的 requestAnimationFrame。
 * 不进模板也不需要响应式，普通变量即可。
 */
let canvasNode: CanvasNode2D | null = null;
let rafId = 0;

const activeIndex = ref(-1);
const activePoint = ref<number[] | null>(null);

/** 记录绘图时的像素几何，触摸换算要用 */
let geo: {
  left: number;
  top: number;
  plotW: number;
  plotH: number;
  min: number;
  max: number;
  len: number;
} = { left: 0, top: 0, plotW: 0, plotH: 0, min: 0, max: 1, len: 0 };

/** 入场动画进度 0→1 */
let progress = 1;

const PAD = { left: 8, right: 8, top: 10, bottom: 10 };
const AXIS_H = 22;

/** 把最大值向上取整到一个好看的刻度值，避免出现 37 这种轴标签 */
function niceMax(value: number): number {
  if (value <= 0) return 10;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const n = value / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

/** 数据里的最大点。没给 max 时用它推纵轴上界 */
function dataMax(): number {
  return props.series.reduce((acc, s) => Math.max(acc, ...s.data.map((v) => v || 0)), 0);
}

/**
 * 纵轴取值域。
 *
 * 只给 min 不给 max 没用：上界仍会被 niceMax 推到 50，气温 22~31 还是贴着顶。
 * 所以给了 min 就默认也把 max 收到贴近数据（span 至少留 1，避免上下界相等除零）。
 */
function axisRange(): { min: number; max: number } {
  if (props.min !== undefined && props.max !== undefined) {
    return { min: props.min, max: Math.max(props.max, props.min + 1) };
  }
  const max = props.max ?? niceMax(dataMax());
  return { min: props.min ?? 0, max: Math.max(max, (props.min ?? 0) + 1) };
}

/** X 轴标签的绘制间隔 */
function labelStride(len: number): number {
  return Math.max(1, props.labelStep ?? (len > 8 ? 2 : 1));
}

function draw() {
  const ctx = ctxRef.value;
  const size = sizeRef.value;
  if (!ctx || !size) return;

  const { width, height } = size;

  // setTransform 是覆盖式，scale 是累乘式：动画每帧都调 scale，矩阵会叠成 dpr^n，
  // 第二帧起线条就飞出画布。每帧重置一次矩阵，绘制逻辑继续用 CSS 像素。
  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cw = width;
  const ch = height;
  const left = PAD.left + 36; // 左侧留给 Y 轴数字
  const top = PAD.top;
  const right = cw - PAD.right;
  const bottom = ch - AXIS_H - PAD.bottom;
  const plotW = right - left;
  const plotH = bottom - top;

  const { min, max } = axisRange();
  const len = props.categories.length;

  geo = { left, top, plotW, plotH, min, max, len };

  /** 纵轴跨度，至少 1，避免上下界相等时除零 */
  const span = Math.max(1e-6, max - min);

  // 网格 + Y 轴刻度
  ctx.strokeStyle = props.gridColor;
  ctx.fillStyle = props.textColor;
  ctx.lineWidth = 1;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const lines = 4;
  for (let i = 0; i <= lines; i++) {
    const y = Math.round(top + (plotH / lines) * i) + 0.5;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    // 刻度值要从 min 起算，不能再从 0 平分，否则非零基线时轴标签会骗人
    const value = max - (span / lines) * i;
    ctx.fillText(String(Math.round(value * 10) / 10), left - 6, y);
  }

  // X 轴标签
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelGap = len > 1 ? plotW / (len - 1) : 0;
  const stride = labelStride(len);
  props.categories.forEach((c, i) => {
    if (i % stride !== 0) return;
    const x = len > 1 ? left + labelGap * i : left + plotW / 2;
    ctx.fillText(c, x, bottom + 6);
  });

  if (!len) return;

  // 数据线
  props.series.forEach((s, si) => {
    const color = s.color || PALETTE[si % PALETTE.length];
    const points = s.data.map((v, i) => ({
      x: len > 1 ? left + labelGap * i : left + plotW / 2,
      y: bottom - (((v || 0) - min) / span) * plotH,
    }));
    if (!points.length) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    // 入场动画：只画到 progress 对应的位置，线像被"画"出来一样
    const cut = progress * (points.length - 1);
    points.forEach((p, i) => {
      if (i <= Math.floor(cut)) {
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      } else if (i === Math.ceil(cut)) {
        // 最后一个未完成段，按小数比例插值出当前的端点
        const t = cut - i + 1;
        const prev = points[i - 1];
        ctx.lineTo(prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t);
      }
    });
    ctx.stroke();

    // 数据点：随动画进度逐个出现
    ctx.fillStyle = '#fff';
    points.forEach((p, i) => {
      if (i > cut + 0.5) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });
}

/**
 * 拿节点的重试节奏（毫秒）。
 *
 * 为什么必须重试：同一页挂了多个图时，节点进入合成的时间会飘，
 * 第一次查不到就放弃的话，那张图会一直空白，且没有任何报错可查 ——
 * 只有切数据（触发重新挂载）才恢复。同一页三个图时这不是偶发，是常态。
 */
const INIT_RETRY_DELAYS = [0, 60, 120, 200, 300, 400, 600] as const;

/** 同时只允许一次初始化在飞，避免重试和数据变化叠在一起重复建 ctx */
let initializing = false;
let initialized = false;
/** 已经排到第几次重试 */
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
    console.warn(`[LineChart] 画布节点获取失败（已重试 ${INIT_RETRY_DELAYS.length} 次）：未查到 canvas 节点`);
    return;
  }
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = 0;
    void initCanvas();
  }, delay);
}

/**
 * 查 canvas 节点。
 *
 * 回调参数交给上下文推断、再在内部收窄：官方 `fields` 的回调类型是 NodeInfo，
 * 而 node 在 NodeCallbackResult 里（官方标成 any），NodeInfo 本身在应用代码里
 * 也无法按名引用。写法与 TideChart.queryCanvas 保持一致。
 */
function queryCanvas(): Promise<CanvasNode2D | null> {
  return new Promise((resolve) => {
    uni
      .createSelectorQuery()
      .in(instance)
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
    const width = cssWidthPx.value;
    const height = cssHeightPx.value;

    // 位图尺寸按 dpr 放大、CSS 尺寸不变，否则高分屏发虚。
    // 位图尺寸取整：小屏换算下来可能是小数，按整数给绘制无差。
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    sizeRef.value = { width, height };
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
 * 入场动画：逐帧推进 progress，让折线"画"出来。
 *
 * mp-weixin 逻辑层没有全局 requestAnimationFrame（那是浏览器 API，连 window 都没有），
 * 取帧走 canvas 节点自带的方法（基础库 2.7.0+），帧率跟随系统刷新、页面隐藏自动暂停。
 * 取消必须用同一个节点：节点的 requestId 交给别处的 cancelAnimationFrame 会静默失效，
 * 不报错、循环也停不下来，页面反复进出就一直漏帧。
 */
function play() {
  // watch 可能早于 SelectorQuery 回调触发，那时节点还没拿到，等 initCanvas 里再放
  if (!canvasNode) return;
  const node = canvasNode;
  cancelFrame();
  const duration = props.duration;
  const start = Date.now();
  progress = 0;
  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / duration);
    // easeOutCubic，末尾减速，比线性自然
    progress = 1 - Math.pow(1 - t, 3);
    draw();
    if (t < 1) {
      rafId = node.requestAnimationFrame(tick);
    } else {
      // t=1 时 progress 已经是 1，这一帧画完循环自然结束
      rafId = 0;
    }
  };
  rafId = node.requestAnimationFrame(tick);
}

onMounted(() => {
  // 尺寸在 setup 里就算好了，这里只管把节点拿到手
  void initCanvas();
});

// 数据变化时重播动画（除非显式关掉动画，那就直接画最终态）
// 纵轴上下界也要 watch：数据没变、只是把基线挪了（比如切了指标换量纲）时同样要重画
watch(
  () => [props.categories, props.series, props.min, props.max],
  () => {
    if (props.animate) {
      play();
    } else {
      progress = 1;
      draw();
    }
  },
  { deep: true },
);

onBeforeUnmount(() => {
  cancelFrame();
  // 重试定时器也得停：节点已经没了，再重试只会白白查一个不存在的节点
  clearRetryTimer();
});

const tooltipStyle = computed(() => {
  const { left, plotW, len } = geo;
  const gap = len > 1 ? plotW / (len - 1) : plotW;
  const x = len > 1 ? left + gap * activeIndex.value : left + plotW / 2;
  return {
    left: `${Math.max(0, Math.min(x - 60, geo.left + geo.plotW - 120))}px`,
    top: `${Math.max(0, geo.top - 4)}px`,
  };
});

function pick(clientX: number) {
  const { left, plotW, len } = geo;
  if (!len) return;
  const gap = len > 1 ? plotW / (len - 1) : plotW;
  const rel = (clientX - left) / (len > 1 ? gap : plotW);
  const i = Math.round(rel);
  if (i < 0 || i >= len) {
    activeIndex.value = -1;
    activePoint.value = null;
    return;
  }
  activeIndex.value = i;
  activePoint.value = props.series.map((s) => s.data[i] ?? 0);
}

function onTouchStart(e: any) {
  pick(e.touches[0].clientX);
}
function onTouchMove(e: any) {
  pick(e.touches[0].clientX);
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
