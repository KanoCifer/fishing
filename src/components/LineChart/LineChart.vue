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

    <!--
      读数轨道。

      为什么是「轨道」而不是浮在曲线上的气泡：气泡要压在绘图区里，就得
      自己算翻转、自己算边界、自己算一个宽度上限（这一版的旧实现为了做
      边界收拢，把 120px 这个数同时写进了 CSS 和脚本两处）。轨道是图表
      下面的一条固定行，它不遮挡任何数据，也不需要任何落位逻辑 ——
      所有几何都在 CSS 里，写完了就不会再坏。

      两组内容叠在同一个格子里交叉淡入。用 position: absolute 叠过一版，
      结果常态那组一转绝对定位就退出了 flex 流，「当日概览」被挤走、
      布局塌掉；grid 叠同一个单元就没有这个问题。
    -->
    <view class="line-chart__rail">
      <!-- 常态：没有选中任何点时显示当日概览，而不是留一条空轨道 -->
      <view class="line-chart__slot" :class="{ 'line-chart__slot--idle': !isActive }">
        <text class="line-chart__rail-label">当日概览</text>
        <text class="line-chart__rail-summary">{{ summaryText }}</text>
      </view>

      <!-- 激活：当前时刻的读数 -->
      <view class="line-chart__slot" :class="{ 'line-chart__slot--active': isActive }">
        <text class="line-chart__rail-label">{{ activeLabel }}</text>
        <view class="line-chart__rows">
          <view v-for="row in activeRows" :key="row.key" class="line-chart__row">
            <view class="line-chart__dot" :style="{ backgroundColor: row.color }" />
            <!-- 单系列时系列名是废话：标题上已经写着「气温 · 未来 24 小时」 -->
            <text v-if="isMultiSeries" class="line-chart__name">{{ row.name }}</text>
            <text class="line-chart__number">{{ row.text }}</text>
            <text v-if="unit" class="line-chart__unit">{{ unit }}</text>
          </view>
        </view>
      </view>
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

/** 轨道上的一行读数 */
interface ActiveRow {
  key: string;
  name: string;
  color: string;
  text: string;
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
    /**
     * 数值单位，显示在读数轨道上。
     *
     * 为什么不留在图表外面当脚注：脚注是「这张图是 °C」，
     * 轨道上跟数字挨着的是「这个点是 27.5 °C」。用户读的是后者。
     */
    unit?: string;
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
    gridColor: 'rgba(60, 60, 67, 0.29)',
    axisColor: 'rgba(60, 60, 67, 0.29)',
    textColor: 'rgba(60, 60, 67, 0.6)',
    unit: '',
    animate: true,
    duration: 700,
  },
);

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
const canvasId = `line-chart-${uid}`;

/**
 * 系列配色。取 iOS 系统色蓝、红、黄、绿、紫五色，顺序刻意从主色蓝起，
 * 让首条曲线与页面主题一致。
 *
 * 同样是 canvas 硬编码，改主题时要和 uni.scss 的 $fish-* 一起看。
 */
const PALETTE = ['#007aff', '#ff3b30', '#ffcc00', '#34c759', '#af52de'];

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
const isActive = computed(() => activeIndex.value >= 0);
const isMultiSeries = computed(() => props.series.length > 1);

/**
 * 绘图区相对画布左边的偏移与宽度，触摸换算要用。
 *
 * 之前连 Y 一起记在一个 geo 里，是因为旧的气泡要跟着数据点的 Y 走；
 * 轨道固定在图表下方、位置与数据无关，这两个值就是全部了。
 */
let plotLeft = 0;
let plotWidth = 0;

/**
 * 画布在**视口**里的左边距。
 *
 * 触摸换算必须先减掉它：touches[0].clientX 是视口坐标，而 plotLeft /
 * plotWidth 是画布坐标，两者差的就是这个值。之前直接拿 clientX 去减
 * 画布坐标，整条曲线的取值都偏右了整整一个画布宽度 —— 贴着右端按，
 * 选中的却是倒数第二三个点。
 *
 * 只测一次：画布是定宽块、在页面里横向居中，位置不会变。
 * 每次 touchmove 都走一遍 SelectorQuery 得不偿失。
 */
let canvasLeft = 0;

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

/** 数值格式。跟 Y 轴刻度用同一套：四舍五入到一位小数，再按整数输出 */
function formatValue(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : '—';
}

const activeLabel = computed(() => (activeIndex.value >= 0 ? (props.categories[activeIndex.value] ?? '') : ''));

const activeRows = computed<ActiveRow[]>(() => {
  const i = activeIndex.value;
  if (i < 0) return [];
  return props.series.map((s, si) => ({
    key: String(si),
    name: s.name,
    color: s.color || PALETTE[si % PALETTE.length],
    text: formatValue(s.data[i]),
  }));
});

/**
 * 常态读数：当日最高 / 最低。
 *
 * 跨所有系列取极值。这只在**各系列同单位**时成立 —— 现在唯一的调用方
 * MetricChart 一次只画一条线，成立。将来若要多线共用一张图，这里得换成
 * 真正的图例（每系列一个小色块 + 当前值），而不是一句「最高 / 最低」。
 */
const summaryText = computed(() => {
  const values: number[] = [];
  for (const s of props.series) {
    for (const v of s.data) {
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
  }
  if (!values.length) return '—';
  const suffix = props.unit;
  const high = formatValue(Math.max(...values));
  const low = formatValue(Math.min(...values));
  return `最高 ${high}${suffix}　最低 ${low}${suffix}`;
});

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

  plotLeft = left;
  plotWidth = plotW;

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
    ctx.fillText(formatValue(value), left - 6, y);
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
    ctx.lineWidth = 2.5; // iOS Charts 默认 3pt，2.5 在 690rpx 画布上视觉重量相当
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

    // 数据点：随动画进度逐个出现。白心 + 彩色描边，和 iOS Charts 的数据点一致。
    // 有选中点时把其余压到 0.3 —— 读数轨道的数字是给某一个点写的，
    // 眼睛却要在二十几个点里找哪一个是它，这是读数层最费劲的地方。
    points.forEach((p, i) => {
      if (i > cut + 0.5) return;
      if (activeIndex.value >= 0 && i !== activeIndex.value) {
        ctx.save();
        ctx.globalAlpha = 0.3;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (activeIndex.value >= 0 && i !== activeIndex.value) {
        ctx.restore();
      }
    });

    // 选中点的两笔：底下圈白底把点从线上「拔」出来，上面点本色。
    // 没有底下那圈，准星交点上的点和线上其它点分不出主次。
    if (activeIndex.value >= 0 && activeIndex.value < points.length) {
      const p = points[activeIndex.value];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  });

  // 准星：画在所有系列之后（它属于当前选中点，是这一次的焦点），
  // 但用低透明度，视觉上退到数据后面。
  if (activeIndex.value >= 0 && activeIndex.value < len) {
    ctx.save();
    const primary = props.series[0];
    ctx.strokeStyle = primary?.color || PALETTE[0];
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    const x = Math.round(len > 1 ? left + labelGap * activeIndex.value : left + plotW / 2) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  }
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
 * 查 canvas 节点，同时量出它相对视口的左边距。
 *
 * 回调参数交给上下文推断、再在内部收窄：官方 `fields` 的回调类型是 NodeInfo，
 * 而 node 在 NodeCallbackResult 里（官方标成 any），NodeInfo 本身在应用代码里
 * 也无法按名引用。写法与 TideChart.queryCanvas 保持一致。
 *
 * 量不到矩形（left 为 undefined）时按 0 处理：这时取值会整体偏右，
 * 但总比拿 NaN 去算索引、把选中态彻底弄丢要好。
 */
function queryCanvas(): Promise<{ node: CanvasNode2D | null; left: number }> {
  return new Promise((resolve) => {
    uni
      .createSelectorQuery()
      .in(instance)
      .select(`#${canvasId}`)
      .fields({ node: true, rect: true }, (res) => {
        const item = Array.isArray(res) ? res[0] : res;
        const node = (item as { node?: unknown } | undefined)?.node;
        const left = (item as { left?: unknown } | undefined)?.left;
        resolve({
          node: typeof node === 'object' && node !== null ? (node as CanvasNode2D) : null,
          left: typeof left === 'number' && Number.isFinite(left) ? left : 0,
        });
      })
      .exec();
  });
}

async function initCanvas() {
  if (initializing || initialized) return;
  initializing = true;

  try {
    await nextTick();

    const { node: canvas, left } = await queryCanvas();
    if (!canvas) {
      scheduleRetry();
      return;
    }
    canvasLeft = left;

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
    // 换数据后旧的选中点不再有意义，留着会显示另一组数据里的下标
    activeIndex.value = -1;
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

/**
 * 触摸换算。
 *
 * clientX 是**视口**坐标，plotLeft / plotWidth 是**画布**坐标，
 * 两者之间隔着画布自己的左边距 canvasLeft —— 不减它，整条曲线偏右一个画布宽。
 *
 * 选中后必须重绘：准星和选中点都画在 canvas 上，而 draw() 之前只在挂载和
 * 数据变化时跑，光改 activeIndex 的话轨道上的数字会变、图上却毫无反应。
 */
function pick(clientX: number) {
  const len = props.categories.length;
  if (!len || plotWidth <= 0) return;
  const gap = len > 1 ? plotWidth / (len - 1) : plotWidth;
  const x = clientX - canvasLeft - plotLeft;
  const rel = len > 1 ? x / gap : 0;
  const i = Math.round(rel);
  if (i < 0 || i >= len) {
    if (activeIndex.value !== -1) {
      activeIndex.value = -1;
      draw();
    }
    return;
  }
  if (i === activeIndex.value) return;
  activeIndex.value = i;
  draw();
}

function onTouchStart(e: any) {
  pick(e.touches[0].clientX);
}
function onTouchMove(e: any) {
  pick(e.touches[0].clientX);
}
function onTouchEnd() {
  // 保留选中态，方便用户看清数值。
  // 抬手就收是错的：抬手正是要读数的时刻，一抬手数字没了，
  // 等于逼用户用一根手指同时看和记。iOS 的 Health / Stocks 也是留着的。
  // 回到常态只需要切指标或重新挂载。
}
</script>

<style lang="scss" scoped>
.line-chart {
  position: relative;
}

.line-chart__canvas {
  display: block; // 微信端必须是 block，否则 canvas 是 inline 元素，尺寸计算会偏
}

/*
 * 读数轨道。
 *
 * 用 $fish-fill 而不是卡片白底：这一节本身就直接坐在页面灰底上，
 * 给它一块白底会凭空多出一层「卡片里还有一块卡片」的套嵌感。
 * 轨道是 secondarySystemFill 这一档 —— 浅、有边界、不抢戏。
 */
.line-chart__rail {
  position: relative;
  overflow: hidden; // 切槽位时不至于溢到圆角外面
  height: 88rpx;
  margin-top: 12rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

/*
 * 两个状态叠在同一个格子里交叉淡入。
 *
 * 基态是「藏起来并下移 4rpx」，两个修饰类都是「显出来」。
 * 写成这样而不是给两个状态各写一套显隐，是因为两边的可见态完全相同 ——
 * 差异只在从哪个方向进来，由基态的位移天然承担。
 *
 * 位移只有 4rpx。再大就从「换了一组值」读作「飞进来了」，
 * 而且拖动的时候一直有东西在动，反而看不清当前读数。
 */
.line-chart__slot {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24rpx;
  opacity: 0;
  transform: translateY(4rpx);

  @if $fish-motion {
    transition:
      opacity $fish-dur-cross $fish-ease-out,
      transform $fish-dur-cross $fish-ease-out;
  }
}

.line-chart__slot--idle,
.line-chart__slot--active {
  opacity: 1;
  transform: translateY(0);
}

.line-chart__rail-label {
  color: $fish-muted;
  @include fish-type(caption);
}

.line-chart__rail-summary {
  color: $fish-muted;
  @include fish-type(subhead);
}

/* 不用 flex 的 gap：小程序的 flex gap 在低版本基础库上不生效，
   这里跟着全项目的做法走 margin */
.line-chart__rows {
  display: flex;
  align-items: baseline;
}

.line-chart__row {
  display: flex;
  align-items: baseline;
}

.line-chart__row + .line-chart__row {
  margin-left: 24rpx;
}

.line-chart__dot {
  align-self: center;
  width: 12rpx;
  height: 12rpx;
  margin-right: 10rpx;
  border-radius: 50%;
}

.line-chart__name {
  margin-right: 20rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

.line-chart__number {
  color: $fish-ink;
  @include fish-type(title3);
}

.line-chart__unit {
  margin-left: 6rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}
</style>
