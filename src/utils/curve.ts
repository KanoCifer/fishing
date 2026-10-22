/**
 * 曲线几何 —— 把一串采样点连成一条平滑曲线。
 *
 * 为什么单独放 utils：LineChart 和 TideChart 都要画平滑曲线，
 * 插值算法只能有一份。两处各写一遍，迟早一个用 Catmull-Rom、一个用
 * Hermite，同一张图的两段曲线形状就不一样了，而这种不一致编译期看不出来。
 *
 * 只做几何，不碰 canvas：调用方拿着算好的控制点自己 ctx.bezierCurveTo，
 * 这样这段代码在别的渲染层（SVG、离屏导出）里也能用。
 */

/** 画布坐标系里的一个点（px） */
export interface CurvePoint {
  x: number;
  y: number;
}

/** 一段三次贝塞尔曲线 */
export interface CurveSegment {
  /** 起点 */
  x0: number;
  y0: number;
  /** 第一个控制点 */
  cx1: number;
  cy1: number;
  /** 第二个控制点 */
  cx2: number;
  cy2: number;
  /** 终点 */
  x1: number;
  y1: number;
}

/**
 * 各点的切线斜率（Fritsch–Carlson 单调三次插值）。
 *
 * 为什么不用普通的自然样条：样条会在拐点附近冲出数据范围，
 * 降水量这种「大部分贴着 0」的曲线会被插出一段负值 —— 图上画出
 * 「不存在的降水」，而图不会说谎，看的人只能信。
 *
 * 单调插值保证曲线在相邻两点之间不越过极值：极值处切线压平，
 * 其余地方用两侧斜率的加权调和平均，最后再统一限幅。
 */
export function monotoneTangents(points: CurvePoint[]): number[] {
  const n = points.length;
  if (n < 2) return points.map(() => 0);

  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    h.push(dx);
    delta.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }

  const m: number[] = Array.from({ length: n }, () => 0);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      // 局部极值：切线压平，曲线在这里贴着极值点过去，不越过它
      m[i] = 0;
      continue;
    }
    // 加权调和平均：两侧斜率差得越远，切线越靠近陡的那一侧
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
  }

  // 限幅：α² + β² 超过 9 就整体收缩，兜住前面那步的边界情况
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const sum = a * a + b * b;
    if (sum > 9) {
      const tau = 3 / Math.sqrt(sum);
      m[i] = tau * a * delta[i];
      m[i + 1] = tau * b * delta[i];
    }
  }

  return m;
}

/**
 * 由采样点生成三次贝塞尔段。
 *
 * 控制点的 x 间距刻意取 h/3：这样一段内 x 关于参数 t 严格线性，
 * 动画要按 x 截断曲线时，截断参数可以直接用 x 的比例算出来，
 * 不用再解一次方程。y 方向由切线斜率决定。
 */
export function buildCurve(points: CurvePoint[]): CurveSegment[] {
  if (points.length < 2) return [];
  const m = monotoneTangents(points);
  const segments: CurveSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = p1.x - p0.x;
    segments.push({
      x0: p0.x,
      y0: p0.y,
      cx1: p0.x + h / 3,
      cy1: p0.y + (m[i] * h) / 3,
      cx2: p1.x - h / 3,
      cy2: p1.y - (m[i + 1] * h) / 3,
      x1: p1.x,
      y1: p1.y,
    });
  }

  return segments;
}

/**
 * 直线路径。
 *
 * 每一段用三次贝塞尔表示，控制点取弦的三分之一和三分之二 —— 这样画出来
 * 就是一条严格直线，但和曲线共用同一套「描线 + 按 x 截断」逻辑：
 * 入场动画只有一份实现，不会直线路径和曲线路径各写一遍、
 * 连动画头部的算法都不一致。
 */
export function buildPolyline(points: CurvePoint[]): CurveSegment[] {
  if (points.length < 2) return [];
  const segments: CurveSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = p1.x - p0.x;
    segments.push({
      x0: p0.x,
      y0: p0.y,
      cx1: p0.x + h / 3,
      cy1: p0.y + (p1.y - p0.y) / 3,
      cx2: p1.x - h / 3,
      cy2: p1.y - (p1.y - p0.y) / 3,
      x1: p1.x,
      y1: p1.y,
    });
  }

  return segments;
}

/**
 * 动画头所在的 x。
 *
 * cut 是「点下标的小数形式」：3 表示画到第 4 个点，3.4 表示画到第 4 个点
 * 的 40%。采样点等距，所以头部就在那两点之间按比例插出来的位置。
 *
 * 单独放这里：曲线和直线的头部必须落在同一个 x 上，否则关掉平滑之后
 * 入场动画会「跳」一下。这行插值算错一次，动画就多一次肉眼可见的错位。
 */
export function headX(points: CurvePoint[], cut: number): number {
  if (!points.length) return 0;
  const index = Math.min(points.length - 1, Math.max(0, Math.floor(cut)));
  const next = points[Math.min(index + 1, points.length - 1)];
  return points[index].x + (next.x - points[index].x) * (cut - index);
}

/**
 * 按 t 截取一段曲线（De Casteljau 分割），返回左边那一段。
 *
 * t=0 给原段，t=1 给一个退化段（起点终点重合）。
 */
export function splitSegment(segment: CurveSegment, t: number): CurveSegment {
  const u = 1 - t;
  const ax = u * segment.x0 + t * segment.cx1;
  const ay = u * segment.y0 + t * segment.cy1;
  const bx = u * segment.cx1 + t * segment.cx2;
  const by = u * segment.cy1 + t * segment.cy2;
  const cx = u * segment.cx2 + t * segment.x1;
  const cy = u * segment.cy2 + t * segment.y1;
  const dx = u * ax + t * bx;
  const dy = u * ay + t * by;
  const ex = u * bx + t * cx;
  const ey = u * by + t * cy;
  const fx = u * dx + t * ex;
  const fy = u * dy + t * ey;

  return {
    x0: segment.x0,
    y0: segment.y0,
    cx1: ax,
    cy1: ay,
    cx2: dx,
    cy2: dy,
    x1: fx,
    y1: fy,
  };
}

/**
 * 把曲线截到 clipX（入场动画「画到这里」用）。
 *
 * clipX 落在某一段中间时，那一段按 x 比例切成两半，只留左边。
 * 段内 x 关于 t 线性（见 buildCurve 的说明），所以比例可以直接用 x 算。
 */
export function clipCurve(segments: CurveSegment[], clipX: number): CurveSegment[] {
  const out: CurveSegment[] = [];
  for (const segment of segments) {
    if (segment.x1 <= clipX) {
      out.push(segment);
      continue;
    }
    if (segment.x0 >= clipX) break;
    const span = segment.x1 - segment.x0;
    out.push(splitSegment(segment, span === 0 ? 0 : (clipX - segment.x0) / span));
    break;
  }
  return out;
}
