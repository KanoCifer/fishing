<template>
  <view class="tide-chart">
    <!--
      canvas 的宽高必须是确定的数值，不能用百分比：
      小程序端拿不到百分比的实际尺寸，会画成 0 宽。
      另：display: block 写在样式里，否则微信端 canvas 是 inline 元素，尺寸计算会偏。
      数值在 setup 里就算好绑定（cssWidthPx/cssHeightPx），不是 onMounted 里补的 ——
      少一次「先空串渲染、再补值」的往返，节点首帧就带着确定宽高。
    -->
    <canvas
      :id="canvasId"
      type="2d"
      class="tide-chart__canvas"
      :style="{ width: cssWidthPx + 'px', height: cssHeightPx + 'px' }"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    />

    <!--
      读数轨道。与 LineChart 同一套形状（见那边的注释），两处必须一起改：
      同一个应用里两张图、同一套交互，读数却在两个地方。

      常态这一行显示「现在」而不是最高/最低 —— 潮汐卡片下方本来就有一块
      最高潮 / 最低潮（带时刻和潮高），再放一遍是重复；而「此刻的潮高」
      全页没有任何地方说过，它才是缺的。语义上也正对图上那条橙色虚线。

      没有落位逻辑：位置与数据无关，所有几何都在 CSS 里。
      旧的浮层为了不出界，把 120px 这个数同时写进了 CSS 和脚本两处，
      改文案就得记得改两个地方 —— 换成轨道之后这个坑直接没了。
    -->
    <view class="tide-chart__rail">
      <view class="tide-chart__slot" :class="{ 'tide-chart__slot--idle': !isActive }">
        <text class="tide-chart__rail-label">现在</text>
        <text class="tide-chart__rail-summary">{{ nowHeight }} m</text>
      </view>

      <view class="tide-chart__slot" :class="{ 'tide-chart__slot--active': isActive }">
        <text class="tide-chart__rail-label">{{ activeTime }}</text>
        <view class="tide-chart__rows">
          <text class="tide-chart__number">{{ activeHeight }}</text>
          <text class="tide-chart__unit">m</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onPageShow } from '@dcloudio/uni-app';
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * `fields({ node: true })` 返回的 canvas 节点没有官方类型，按用到的成员局部声明。
 */
interface CanvasNode2D {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  /** 基础库 2.7.0+ 由 canvas 节点提供（type="2d" 本身要求 2.9.0+，所以一定在） */
  requestAnimationFrame(cb: () => CanvasFrameCallback | void): number;
  cancelAnimationFrame(requestId: number): void;
}

type CanvasFrameCallback = () => void;

/**
 * SelectorQuery 里取出来的 canvas 节点，以及它相对视口的左边距。
 *
 * 官方 `fields` 回调的类型是 `NodeInfo`，但它里面没有 `node` 字段
 * （node 在 `NodeCallbackResult` 里，官方把它标成了 any），而 `NodeInfo` 本身
 * 在应用代码里也无法按名引用 —— 它在未导出的 `UniNamespace` 内。
 * 所以这里按实际用到的成员自己声明，值在回调里收窄一次。
 *
 * 宽高不取自查询结果：那是布局测量值，画布尺寸由 rpx 自己算，见 cssWidthPx。
 */
interface CanvasQueryResult {
  node?: CanvasNode2D;
  left?: number;
}

interface Props {
  /** 逐时潮高，形如 [{ fxTime, height }] */
  points: ReadonlyArray<{ fxTime: string; height: number | string }>;
  /** X 轴时刻文案，长度须与 points 一致 */
  labels: readonly string[];
  /** 当前时刻在 points 中的下标，-1 表示不在范围内 */
  nowIndex?: number;
  /** 画布宽（rpx） */
  width?: number;
  /** 画布高（rpx） */
  height?: number;
  /** 数据切换时是否播放入场动画（首次出图始终直接展示，不播） */
  animate?: boolean;
  /** 入场时长（ms），仅数据切换的动画用 */
  duration?: number;
}

const props = withDefaults(defineProps<Props>(), {
  nowIndex: -1,
  width: 622,
  height: 400,
  animate: true,
  duration: 700,
});

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
// canvasId 必须页面内唯一，同一页面可能画多个图
const canvasId = `tide-chart-${uid}`;

/**
 * 画布的 CSS 尺寸（px）。
 *
 * rpx 只对样式有效，canvas 内部坐标和位图尺寸都得用 px。
 *
 * 在 setup 里就算好直接绑定，而不是 onMounted 里算完再写进 ref —— 少一次
 * 「先空串渲染、再补值」的往返，节点首帧就带着确定宽高。
 */
const cssWidthPx = computed(() => uni.upx2px(props.width));
const cssHeightPx = computed(() => uni.upx2px(props.height));

const sizeRef = ref<{ width: number; height: number } | null>(null);
const ctxRef = ref<CanvasRenderingContext2D | null>(null);
const dprRef = ref(1);

/** 画布节点，帧调度要用它自带的方法。不进模板也不需要响应式 */
let canvasNode: CanvasNode2D | null = null;
let rafId = 0;

const activeIndex = ref(-1);
const isActive = computed(() => activeIndex.value >= 0);

/**
 * 绘图区左边界与相邻点的像素间距，触摸换算要用。
 *
 * 之前连 Y、min/max 一起记在一个 geo 里，是因为旧的浮层要跟着数据点的 Y 走；
 * 轨道固定在图表下方、位置与数据无关，这两个值就是全部了。
 */
let plotLeft = 0;
let pointGap = 0;

/**
 * 画布在**视口**里的左边距。
 *
 * 触摸换算必须先减掉它：touches[0].clientX 是视口坐标，而 plotLeft /
 * pointGap 是画布坐标。之前直接拿 clientX 去减画布坐标，整条曲线的取值
 * 都偏右了整整一个画布宽度 —— 贴着右端按，选中的却是倒数第二三个点。
 * （这里一度被当成「LineChart 的折算范本」写在注释里，其实两个都错。）
 *
 * 只测一次：画布是定宽块、在卡片里横向居中，位置不会变。
 * 每次 touchmove 都走一遍 SelectorQuery 得不偿失。
 */
let canvasLeft = 0;

/** 入场动画进度 0→1 */
let progress = 1;

/**
 * Canvas 色值。**必须与 uni.scss 的 $fish-* 令牌保持一致**。
 *
 * Canvas 2d 只能从 context 读色，解析不了 SCSS 变量和 CSS 变量，
 * 所以这里只能硬编码。改主题时 uni.scss 和这四行要一起改 ——
 * 漏改的话图表会和卡片配色对不上，而这种不一致在编译期完全看不出来。
 */
const TIDE_COLOR = '#007aff'; // $fish-tide（systemBlue）
const GRID_COLOR = 'rgba(60, 60, 67, 0.29)'; // $fish-border（separator）
const TEXT_COLOR = 'rgba(60, 60, 67, 0.6)'; // $fish-muted（secondaryLabel）
const WARNING_COLOR = '#ff9500'; // $fish-warning（systemOrange）

const PAD = { left: 56, right: 16, top: 16, bottom: 48 };

/** 把数值域向上/向下取整到好看的刻度，避免出现 3.37m 这种轴标签 */
function niceBounds(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 1 };

  let lo = Math.min(...values);
  let hi = Math.max(...values);

  // 潮差通常不到 1m，直接取整会把曲线压成一条直线，拉开一档看得清起伏
  const span = hi - lo;
  if (span < 0.5) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }

  lo = Math.floor(lo * 10) / 10;
  hi = Math.ceil(hi * 10) / 10;
  return { min: lo, max: hi === lo ? lo + 1 : hi };
}

/**
 * 潮高文案。
 *
 * `height` 的后端类型是 `number | string`，实测会出现 `""` / `null`。
 * 这里必须逐个判空：直接 `Number(x)` 会把 `""` 和 `null` 都变成 0，
 * 读数轨道上于是显示「0.00 m」——一个凭空长出来的、看着还挺可信的数字。
 * 脏值一律显示破折号，和图上「跳过该点」的处理保持一致。
 */
function formatHeight(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

/**
 * 把逐时潮高清洗成可绘制的数值数组。
 *
 * 为什么必须清洗：后端 `height` 字段类型是 `number | string`，实测会出现
 * `""` / `null` 这类脏值。此前这里用 `values.some(...)` 一票否决 ——
 * 24 个点里任意一个是脏的就整张图不画，且没有任何提示，表现就是
 * 「潮汐卡片一片空白」。改为逐点剔除非有限值：脏点跳过、其余照常画，
 * 曲线最多短一截，而不会整张图消失。
 */
function finiteValues(): number[] {
  return props.points.map((point) => Number(point.height)).filter((value) => Number.isFinite(value));
}

/**
 * 画布内空态：数据全脏时给一行说明，别让用户对着空白猜。
 *
 * canvas 里画文字要注意 ctx.font 只认 px。
 */
function drawEmptyHint(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('暂无潮位数据', width / 2, height / 2);
}

/** 轨道常态：此刻的潮高 */
const nowHeight = computed(() => {
  const i = props.nowIndex;
  if (i < 0 || i >= props.points.length) return '—';
  return formatHeight(props.points[i].height);
});

/** 轨道激活：选中时刻与该时刻的潮高 */
const activeTime = computed(() => props.labels[activeIndex.value] ?? '');
const activeHeight = computed(() => {
  const i = activeIndex.value;
  if (i < 0 || i >= props.points.length) return '—';
  return formatHeight(props.points[i].height);
});

function draw() {
  const ctx = ctxRef.value;
  const size = sizeRef.value;
  if (!ctx || !size) return;

  const { width, height } = size;

  // setTransform 覆盖式，scale 累乘式：动画每帧调 scale 会叠成 dpr^n，
  // 第二帧起曲线就飞出画布。每帧重置矩阵，后续绘制继续用 CSS 像素。
  ctx.setTransform(dprRef.value, 0, 0, dprRef.value, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const values = finiteValues();
  // 只有全是脏值才没得画；零星脏值上面已经滤掉了
  if (!values.length) {
    // 几何作废：上一轮的数据可能画过，触摸换算不能继续用旧的间距
    plotLeft = 0;
    pointGap = 0;
    drawEmptyHint(ctx, width, height);
    return;
  }

  const { min, max } = niceBounds(values);
  const len = values.length;

  const left = PAD.left;
  const top = PAD.top;
  const right = width - PAD.right;
  const bottom = height - PAD.bottom;
  const plotW = right - left;
  const plotH = bottom - top;
  const gap = len > 1 ? plotW / (len - 1) : plotW;

  plotLeft = left;
  pointGap = gap;

  const valueToY = (v: number) => bottom - ((v - min) / (max - min)) * plotH;
  const indexToX = (i: number) => (len > 1 ? left + gap * i : left + plotW / 2);

  // 网格 + Y 轴刻度
  ctx.strokeStyle = GRID_COLOR;
  ctx.fillStyle = TEXT_COLOR;
  ctx.lineWidth = 1;
  // canvas 的 ctx.font 只认 px，rpx 会被解析失败并静默退化成默认字号。
  // 绘制坐标已由 setTransform 归一到 CSS 像素，这里跟着用 px（对应 20rpx 上下）。
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

    const value = max - ((max - min) / lines) * i;
    ctx.fillText(`${value.toFixed(1)}`, left - 10, y);
  }

  // X 轴标签。点多时隔开画，否则 24 个标签会糊成一片
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelStep = Math.max(1, Math.ceil(len / 5));
  props.labels.forEach((label, i) => {
    if (i % labelStep !== 0) return;
    ctx.fillText(label, indexToX(i), bottom + 14);
  });

  // 面积渐变（竖直方向：上浓下淡）。底色跟 TIDE_COLOR 同源，见上面「必须同步」的说明
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, 'rgba(0, 122, 255, 0.24)');
  gradient.addColorStop(0.7, 'rgba(0, 122, 255, 0.05)');
  gradient.addColorStop(1, 'rgba(0, 122, 255, 0)');

  // 入场动画：只画到 progress 对应的位置，曲线像被"画"出来
  const cut = progress * (len - 1);
  const lastIndex = Math.min(len - 1, Math.ceil(cut));

  const pathPoints: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= lastIndex; i++) {
    const p = { x: indexToX(i), y: valueToY(values[i]) };
    if (i === lastIndex && i > Math.floor(cut)) {
      // 最后一个未完成段，按小数比例插值出当前端点
      const t = cut - Math.floor(cut);
      const prev = { x: indexToX(i - 1), y: valueToY(values[i - 1]) };
      pathPoints.push({ x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t });
    } else {
      pathPoints.push(p);
    }
  }

  if (pathPoints.length >= 2) {
    // 面积：沿曲线走到底再回到底边闭合
    ctx.beginPath();
    ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
    ctx.lineTo(pathPoints[1].x, pathPoints[1].y);
    for (let i = 2; i < pathPoints.length; i++) {
      ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
    }
    ctx.lineTo(pathPoints[pathPoints.length - 1].x, bottom);
    ctx.lineTo(pathPoints[0].x, bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // 曲线本体。
  //
  // length >= 2 的判断不能省：入场动画第一帧 progress=0，此时 cut=0、lastIndex=0，
  // pathPoints 里只有 1 个点。不判断就直接取 pathPoints[1] 会抛
  // TypeError，而异常从 rAF 回调里抛出去会连带这一帧的绘制一起作废 ——
  // 表现就是整张图一片空白，连网格线都没有，且控制台不报任何错。
  // 单点画不出线，直接跳过，下一帧 progress>0 自然就画出来了。
  if (pathPoints.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
  ctx.lineTo(pathPoints[1].x, pathPoints[1].y);
  for (let i = 2; i < pathPoints.length; i++) {
    ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
  }
  ctx.strokeStyle = TIDE_COLOR;
  ctx.lineWidth = 3; // 与 iOS Charts 的默认线宽（3pt）对齐，2.5 在小画布上偏细
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // 「现在」标线：只在当前时刻落在数据范围内、且曲线已画完时画
  if (props.nowIndex >= 0 && props.nowIndex < len && progress >= 1) {
    const x = Math.round(indexToX(props.nowIndex)) + 0.5;
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = WARNING_COLOR;
    ctx.lineWidth = 1.5;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = WARNING_COLOR;
    // canvas 的 ctx.font 只认 px，rpx 会被解析失败并静默退化成默认字号。
    // 绘制坐标已由 setTransform 归一到 CSS 像素，这里跟着用 px（对应 20rpx 上下）。
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('现在', x, top - 2);
  }

  // 选中标记：准星 + 曲线上的点。
  //
  // 必须重绘才能有：这些画在 canvas 上，而 draw() 平时只在挂载、数据变化、
  // 布局落定时跑。光改 activeIndex 的话轨道数字会变、图却纹丝不动。
  //
  // 与上面那条橙色虚线可以共存、语义也不同：「现在」是时间参照，
  // 准星是当前正在看的位置。两者可能重合，准星画在上层。
  if (activeIndex.value >= 0 && activeIndex.value < len && progress >= 1) {
    const x = indexToX(activeIndex.value);
    const y = valueToY(values[activeIndex.value]);

    ctx.save();
    ctx.strokeStyle = TIDE_COLOR;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    const crossX = Math.round(x) + 0.5;
    ctx.beginPath();
    ctx.moveTo(crossX, top);
    ctx.lineTo(crossX, bottom);
    ctx.stroke();
    ctx.restore();

    // 底下圈一圈白底把点从曲线和渐变上「拔」出来，
    // 没有它，处在渐变最浓处的那个点几乎看不见。
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = TIDE_COLOR;
    ctx.fill();
  }
}

/**
 * 初始化画布。
 *
 * 宽高**不**从 SelectorQuery 要 —— 那是布局测量值，画布的 CSS 宽高
 * 本来就由我们按 rpx 算好绑在节点上，数值在手上，问布局是引入了一个
 * 既不必要又会失败的依赖。
 *
 * 拿不到节点时按 INIT_RETRY_DELAYS 的节奏继续试，**不**一次就放弃：
 * 本组件挂在 TideCard 的 `v-else-if` 分支里，节点是在「数据到了、
 * 面板正在展开」那一刻创建的。面板展开带 0.28s 的高度过渡，节点和
 * 布局就绪的时间点会飘 —— 之前只重试 3 次（约 360ms）就永久放弃，
 * 放弃之后没有任何东西会再触发一次，图表就一直空白，只有切港口/日期
 * 触发重新挂载才恢复。数据变化时会把整条重试链重新武装一次。
 */
const INIT_RETRY_DELAYS = [0, 60, 120, 200, 300, 400, 600] as const;

/**
 * 布局落定后补画。
 *
 * 画布建好时如果容器还在过渡、或节点还没进入合成，首帧会画上但不显示，
 * 而布局稳定之后小程序不会自己补画 —— 表现就是「进页面图表空白，
 * 点一下港口/日期才出来」。这几个时间点各补画一次，覆盖过渡结束
 * 和节点合成；补画直接落到最终态，不再重播入场动画。
 */
const SETTLE_REDRAW_DELAYS = [0, 320, 800] as const;

/**
 * 取节点，顺便量出它相对视口的左边距（触摸换算要用，见 canvasLeft）。
 *
 * 量不到时按 0 处理：这时取值会整体偏右，但总比拿 NaN 去算下标、
 * 把选中态彻底弄丢要好。
 */
function queryCanvas(): Promise<CanvasQueryResult | null> {
  return new Promise((resolve) => {
    uni
      .createSelectorQuery()
      .in(instance)
      .select(`#${canvasId}`)
      .fields({ node: true, rect: true }, (res) => {
        const item = Array.isArray(res) ? res[0] : res;
        // node 在官方类型里是 any，这里收窄成本组件实际用到的形状；
        // 顺手做一次判空，省得把 undefined 交给后面 getContext
        const node = (item as { node?: unknown } | undefined)?.node;
        if (typeof node !== 'object' || node === null) {
          resolve(null);
          return;
        }
        const left = (item as { left?: unknown } | undefined)?.left;
        resolve({
          node: node as CanvasNode2D,
          left: typeof left === 'number' && Number.isFinite(left) ? left : 0,
        });
      })
      .exec();
  });
}

/** ctx 是否就绪。没就绪时 play()/draw() 都是空转，调用方要先看这个 */
let initialized = false;
/**
 * 是否已经出过「有数据的」图。
 *
 * 决定数据变化时是播入场动画还是直接出最终态：第一次拿到数据直接出图
 * （那一帧 progress=0，曲线还没画出来，用户看到的是一块空白等它慢慢画），
 * 之后切港口/日期才播动画。
 *
 * 只认「有数据」这一种出图：卡片先于潮位数据挂载，画布会先画一张空图
 * （画布被 v-show 藏着，看不见），那时如果就把标记置上，首屏真正出图时
 * 就会走动画路径，又变回空白等它慢慢画。
 */
let hasPaintedData = false;
/** 同时只允许一次初始化在飞，避免数据变化和重试叠在一起重复建 ctx */
let initializing = false;
/** 已经排到第几次重试 */
let retryIndex = 0;
let retryTimer = 0;
const settleTimers: number[] = [];

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = 0;
  }
}

function clearSettleTimers(): void {
  while (settleTimers.length) {
    clearTimeout(settleTimers.pop()!);
  }
}

function scheduleRetry(): void {
  const delay = INIT_RETRY_DELAYS[retryIndex];
  if (delay === undefined) {
    // 重试用尽还是拿不到节点，画布会一直空白。留一条 warn，
    // 下次再遇到空图能直接分清是「节点没进 DOM」还是「绘制逻辑出错」。
    console.warn(`[TideChart] 画布节点获取失败（已重试 ${INIT_RETRY_DELAYS.length} 次）：未查到 canvas 节点`);
    return;
  }
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = 0;
    void initCanvas();
  }, delay);
}

/** 布局落定后补画，见 SETTLE_REDRAW_DELAYS */
function scheduleSettleRedraw(): void {
  clearSettleTimers();
  for (const delay of SETTLE_REDRAW_DELAYS) {
    settleTimers.push(
      setTimeout(() => {
        if (!initialized) return;
        progress = 1;
        draw();
      }, delay),
    );
  }
}

async function initCanvas(): Promise<void> {
  if (initializing || initialized) return;
  initializing = true;

  try {
    await nextTick();

    const item = await queryCanvas();
    if (!item?.node) {
      scheduleRetry();
      return;
    }

    const canvas = item.node;
    canvasLeft = item.left ?? 0;
    // getSystemInfoSync 在微信端已废弃，dpr 从 getWindowInfo 取
    const dpr = uni.getWindowInfo().pixelRatio || 1;
    const width = cssWidthPx.value;
    const height = cssHeightPx.value;

    // 按 dpr 放大位图尺寸，避免高分屏发虚；CSS 尺寸不变，由 rpx 决定。
    // 位图尺寸取整：小屏换算下来可能是小数（622rpx @414pt = 343.36），
    // 位图尺寸按整数给，绘制仍按 CSS 像素走 setTransform，肉眼无差。
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    sizeRef.value = { width, height };
    dprRef.value = dpr;
    ctxRef.value = canvas.getContext('2d');
    canvasNode = canvas;
    initialized = true;
    clearRetryTimer();

    scheduleSettleRedraw();

    // 首帧直接出最终态，不播入场动画。
    //
    // 首次出图发生在「数据到位 + 面板正在展开」那一刻，动画的第一帧
    // progress=0、曲线还没画出来（见 draw 里 pathPoints 不足两点就 return
    // 的那段），用户看到的是一块空白等它慢慢画出来。切数据是用户主动
    // 操作，动画才有表达意义，所以动画只留给那一条路径。
    progress = 1;
    draw();
    if (props.points.length > 0) hasPaintedData = true;
  } finally {
    initializing = false;
  }
}

function cancelFrame() {
  // 必须同一个节点取消：把 requestId 交给别处的 cancelAnimationFrame 会静默失效
  if (canvasNode && rafId) {
    canvasNode.cancelAnimationFrame(rafId);
  }
  rafId = 0;
}

/**
 * 入场动画。
 *
 * mp-weixin 逻辑层没有全局 requestAnimationFrame（那是浏览器 API，连 window 都没有），
 * 取帧走 canvas 节点自带的方法，帧率跟随系统刷新、页面隐藏自动暂停。
 */
function play() {
  // watch 可能早于 SelectorQuery 回调触发，那时节点还没拿到，等 initCanvas 里再放
  if (!canvasNode) return;

  const node = canvasNode;
  cancelFrame();
  const start = Date.now();
  progress = 0;

  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / props.duration);
    // easeOutCubic，末尾减速，比线性自然
    progress = 1 - Math.pow(1 - t, 3);
    draw();
    if (t < 1) {
      rafId = node.requestAnimationFrame(tick);
    } else {
      rafId = 0;
    }
  };

  rafId = node.requestAnimationFrame(tick);
}

onMounted(() => {
  void initCanvas();
});

watch(
  () => [props.points, props.labels, props.nowIndex],
  () => {
    // 换数据后旧的选中下标不再有意义，留着会显示另一组数据里的点
    activeIndex.value = -1;

    // 画布还没拿到就先补拿。之前这里无条件走 play()，而 play() 拿不到
    // 节点就直接 return，等于白等 —— 数据变了但图表还是空的。
    if (!initialized) {
      retryIndex = 0;
      void initCanvas();
      return;
    }

    scheduleSettleRedraw();

    // 切港口/日期是用户主动操作，这里才播入场动画；
    // 第一次拿到数据（hasPainted 还没置位）直接出最终态。
    if (props.animate && hasPaintedData) {
      play();
    } else {
      progress = 1;
      draw();
      if (props.points.length > 0) hasPaintedData = true;
    }
  },
  { deep: true },
);

/**
 * 页面回到前台时补画。
 *
 * 小程序切后台期间 rAF 会停，回来后不会自动续画 —— 曲线会停在半截，
 * 或者节点在后台被回收后彻底空白。这里直接补一帧最终态。
 */
onPageShow(() => {
  if (!initialized) {
    retryIndex = 0;
    void initCanvas();
    return;
  }
  progress = 1;
  draw();
});

// 页面反复进出会持续漏帧，不取消就一路漏下去；定时器同理
onBeforeUnmount(() => {
  cancelFrame();
  clearRetryTimer();
  clearSettleTimers();
});

/**
 * 触摸换算。
 *
 * clientX 是**视口**坐标，plotLeft / pointGap 是**画布**坐标，
 * 两者之间隔着画布自己的左边距 canvasLeft —— 不减它，整条曲线偏右一个画布宽。
 *
 * 选中后必须重绘：准星和选中点都画在 canvas 上，见 draw 里那段。
 */
function pick(clientX: number) {
  const len = props.points.length;
  if (!len || pointGap <= 0) return;

  const rel = (clientX - canvasLeft - plotLeft) / pointGap;
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

/**
 * 用 `@dcloudio/types` 声明的 TouchEvent，不另造局部 interface。
 */
function onTouchStart(e: TouchEvent) {
  pick(e.touches[0].clientX);
}

function onTouchMove(e: TouchEvent) {
  pick(e.touches[0].clientX);
}

function onTouchEnd() {
  // 保留选中态，方便用户看清数值。
  // 抬手就收是错的：抬手正是要读数的时刻，一抬手数字没了，
  // 等于逼用户用一根手指同时看和记。回到常态靠切港口/日期。
}
</script>

<style lang="scss" scoped>
.tide-chart {
  position: relative;
}

.tide-chart__canvas {
  display: block; // 微信端必须是 block，否则 canvas 是 inline 元素，尺寸计算会偏
}

/*
 * 读数轨道。形状与 LineChart 的同名件一致，两处要一起改。
 *
 * 用 $fish-fill：这一节坐在卡片白底上，浅灰轨道在白底上才分得出来；
 * 给它白底会和卡片糊成一片。
 */
.tide-chart__rail {
  position: relative;
  overflow: hidden; // 切槽位时不至于溢到圆角外面
  height: 88rpx;
  margin-top: 12rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

/*
 * 基态是「藏起来并下移 4rpx」，两个修饰类都是「显出来」。
 * 位移只有 4rpx：再大就从「换了一组值」读作「飞进来了」。
 */
.tide-chart__slot {
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

.tide-chart__slot--idle,
.tide-chart__slot--active {
  opacity: 1;
  transform: translateY(0);
}

.tide-chart__rail-label {
  color: $fish-muted;
  @include fish-type(caption);
}

.tide-chart__rail-summary {
  color: $fish-muted;
  @include fish-type(subhead);
}

/* 不用 flex 的 gap：小程序的 flex gap 在低版本基础库上不生效 */
.tide-chart__rows {
  display: flex;
  align-items: baseline;
}

.tide-chart__number {
  color: $fish-ink;
  @include fish-type(title3);
}

.tide-chart__unit {
  margin-left: 6rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}
</style>
