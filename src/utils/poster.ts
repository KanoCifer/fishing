/**
 * 海报绘制 —— canvas 2d。
 *
 * 为什么自己画而不是找个海报库：海报上的内容是**这个钓点的此刻** ——
 * 照片、今日鱼口、地址、开放时间。这些数前端已经取在手上了（store 里），
 * 走服务端渲染要多一次往返、多一套模板，值当不上。
 *
 * ⚠️ canvas 2d **不解析 var()**，只认 rgb/hex。所以这里的色值是硬编码的，
 * 与 `src/styles/tokens/_color.scss` 的同名令牌手工保持一致 ——
 * 改那边要记得回来改这里（跟 FishingGauge / TideChart 是同一套约定）。
 *
 * 字号与字距同理：与 `src/styles/tokens/_type.scss` 的字阶角色一一对应，
 * 角色名标在 TYPE 里（见下）。canvas 里没有 mixin，只能手写，
 * 但手写不等于可以乱写 —— 每个字号都要能说出它对应哪一级。
 *
 * 版面是**票根**：
 * 照片满幅在上面，上面只压一行名字（白字）；纸面上是巨大的分数、
 * 一条齿孔线，左栏一列简介，右下角一块小程序码。像一张演出票：
 * 标题、场次、座位、存根。
 *
 * 为什么是票根：这张海报真正的收件人是**没去过这个钓点的人**，
 * 他要在一眼之内知道「哪儿、今天值不值得去」。所以照片上只留名字，
 * 分数给到全篇最大 —— 缩到微信聊天列表里那张 5:4 封面时，
 * 剩下的是「一片水 + 一个名字 + 一个数」，正好是收的人需要的全部。
 *
 * 版面是照着**微信裁卡片的那一刀**排的：
 * 转发卡片用 5:4，从这张 3:4 的海报里裁一刀（见 POSTER.cardTop / cardHeight）。
 * 裁到的是**主票**：照片下缘、名字、副信息、分数都在这条带子里；
 * 齿孔线在带子之外，线以下是存根（简介、码、落款）——
 * 那是补充信息。卡的下沿是那道分界线，不是被切了一半的存根，
 * 读起来才像「一张裁好的票」，而不是「一张被切过的图」。
 */

import { POSTER } from '@/constants/share';

/**
 * canvas 里的图片对象。
 *
 * `canvas.createImage()` 返回的东西没有官方类型，按实际用到的成员局部声明
 * （与 LineChart / FishingGauge 保持一致）。
 */
export interface PosterImage {
  src: string;
  width: number;
  height: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

/** 海报要画的那些内容。全部是**已经换算好的展示值**，不碰 DTO */
export interface PosterSpot {
  /** 钓点名 */
  name: string;
  /** 水体类型 label，如「水库」 */
  kind: string;
  /** 地点，如「东莞大岭山」 */
  place: string;
  /** 距离，如「12.1 km」 */
  distance: string;
  /** 开放时间，如「全天」 */
  hours: string;
  /** 一句话介绍 */
  description: string;
  /**
   * 文字地址。
   *
   * 用户建钓点时从选点地图拿的（见 spot-create 的选点），后端 omitempty —— 没填就不发。
   * 它是**可选的长文本**：短的五个字，长的能到八十几个字。
   * 所以海报上给它自己的一行，超宽截断，不跟别的东西挤在一行里。
   */
  address?: string;
  /** 今日鱼口 0–100 */
  score: number;
  /** 鱼口等级，如「好」 */
  level: string;
  /** 封面图地址 */
  cover: string;
  /**
   * 小程序码图片地址。
   *
   * 没有就退化成「微信搜小程序」的文字引导 —— **不画一个扫不出来的假码**。
   * 真码要后端出（微信的码只能由服务端拿 access_token 调 getUnlimited 生成），
   * 这一格就是留给它的位置。
   *
   * 现在给的是**一张固定的小程序码**（见 SHARE_WXACODE）：扫出来落在小程序入口，
   * 不是直接落在这条钓点上。要按钓点生成，得后端出无限码。
   */
  codeUrl?: string;
}

/* ── 色值（与 tokens/_color.scss 手工对齐）───────────────────────────── */
const INK = '#000000'; // $fish-ink · label
const MUTED = 'rgba(60, 60, 67, 0.6)'; // $fish-muted · secondaryLabel
const BLUE_600 = '#0062cc'; // $fish-blue-600
const HAIRLINE = 'rgba(60, 60, 67, 0.29)'; // $fish-border · separator
const WHITE = '#ffffff';

/* ── 字阶 ────────────────────────────────────────────────────────────── */

/**
 * 一个字阶角色。
 *
 * 字距用 em（跟字号走），不是绝对像素 —— Apple 的字是**成组**的：
 * 每一级自带字号 / 字重 / 字距，大字收紧、小字放开。
 */
interface PosterType {
  /** 字号（海报位图像素） */
  size: number;
  /** 字重 */
  weight: number;
  /** 字距（em） */
  tracking: number;
}

/**
 * 海报这一屏用到的字阶。
 *
 * 与 `src/styles/tokens/_type.scss` 的角色一一对应 —— 角色名标在这儿，
 * 是为了改字阶时对得上号，而不是在海报上另编一套字号。
 *
 * ⚠️ 小程序 canvas **没有 `ctx.letterSpacing`**（浏览器 canvas 有，Chromium 99+）。
 * 所以字距只能自己算：逐字量、逐字推进（见 drawType）。
 * 好处是原型那边跑的是同一套算法 —— 量出来的宽度就是画出来的宽度。
 */
const TYPE = {
  /** large-title —— 名字。照片上最大的一行字 */
  name: { size: 68, weight: 700, tracking: -0.022 },
  /** caption —— 副信息（照片上那行） */
  meta: { size: 24, weight: 400, tracking: 0 },
  /** caption2 —— 「今日鱼口」。小字放开一点才读得清 */
  label: { size: 22, weight: 400, tracking: 0.006 },
  /**
   * display —— 分数。全篇最大的字。
   *
   * 字距 -0.03 比 large-title 的 -0.022 更紧：字越大，字心距看着越松，
   * 所以越要往回收。
   *
   * 170 太大：那个数字压住了整张纸面，读着像在喊。
   * 收到 150 —— 仍然是全篇最大的字（下一级 large-title 才 68），
   * 但纸面重新有了呼吸。
   */
  score: { size: 150, weight: 700, tracking: -0.03 },
  /**
   * 等级词 —— 数字的注脚
   *
   * 60 → 54：分数从 170 收到 150，注脚要跟着缩。
   * 比例不变（0.36 左右），它才一直是「贴在旁边的注脚」；
   * 分数一小而注脚不动，注脚就成了主角 —— 蓝色本来就抓眼。
   */
  level: { size: 54, weight: 700, tracking: 0 },
  /** footnote —— 简介 */
  desc: { size: 26, weight: 400, tracking: 0 },
  /**
   * caption2 —— 地址。存根里最小的一级
   *
   * 跟详情页同一个比例：那边地址是 footnote 26、描述是 subhead 30，
   * 这边地址 caption2 22、简介 footnote 26 —— 差的都是 4px，
   * 主次关系在两个界面上是同一套。
   */
  address: { size: 22, weight: 400, tracking: 0.006 },
  /** 品牌落款 */
  brand: { size: 30, weight: 700, tracking: 0 },
  /** caption2 —— 品牌副句 */
  tagline: { size: 22, weight: 400, tracking: 0.006 },
} as const;

/* ── 版面 ────────────────────────────────────────────────────────────── */

/**
 * 几何常量。
 *
 * 单位是海报位图的像素（750 宽 = 375pt @2x），不是屏幕像素 ——
 * canvas 的绘制坐标就是位图坐标，跟 dpr 无关。
 */
const LAYOUT = {
  /** 照片带高度 */
  photoHeight: 400,
  /** 左右留白 */
  padding: 48,
  /**
   * 压暗的起点。
   *
   * 名字是白字，压在照片上。压暗从照片上沿就开始起 —— 因为缺图时
   * 顶上的是那张**浅色**的占位插画，白字压浅色等于没压。
   */
  scrimTop: 40,
  /** 压暗的浓度（到照片下沿时） */
  scrimAlpha: 0.86,
  /** 名字基线（白字，压在照片上） */
  nameBaseline: 320,
  /** 副信息基线（白字，压在照片上） */
  metaBaseline: 362,
  /** 「今日鱼口」标签基线 */
  scoreLabelBaseline: 496,
  /**
   * 分数基线 —— 全篇最大的字。
   *
   * 数字这一块是**浮在主票正中的**：上面的标签离照片下沿 96，
   * 下面的齿孔线离数字也是 96 —— 两边一样远，它才是浮着的，
   * 而不是被照片和发丝线挤在中间。
   */
  scoreBaseline: 660,
  /**
   * 等级词基线。
   *
   * 与分数**差 10**，不是同一条基线。
   *
   * 「好」是分数的注脚。跟数字踩同一条基线，它就吊在数字底下 ——
   * 一个蓝字挂在黑数字的右下角，读着像掉下来了。
   * 抬 10 之后它落在数字的身子里，是「贴在旁边的注脚」，不是「挂在下面的东西」。
   */
  levelBaseline: 650,
  /**
   * 分数与等级词之间的距离。
   *
   * 16 —— 按等级词自己的字号算，一个空格（0.25em）。
   * 拿大字的间距标准去卡小字，缝就开大了：一个蓝字离黑数字太远，
   * 读着就不像同一个词组的两个部分。
   */
  levelGap: 16,
  /**
   * 齿孔线的 y。
   *
   * 这条线是**票的主票与存根的分界** —— 微信的 5:4 封面裁在它上面，
   * 裁到的是「主票」：照片、名字、副信息、分数。线以下是存根：
   * 简介、码、落款。
   */
  ruleY: 740,
  /**
   * 地址基线 —— 存根的第一行。
   *
   * 为什么在存根而不是照片上：地址是**长文本**（短的五个字，长的八十几个字），
   * 白纸上的长字才读得清，压在照片下沿既挤又看不清；
   * 而且票根的「座位号」本来就在存根这一半。
   *
   * 为什么自己占一行：副信息那行（类型 · 地点 · 距离 · 时间）已经满了，
   * 地址塞进去只能被截掉尾巴 —— 而被截掉的恰好是门牌号，
   * 也就是「找到了但不知道是哪一栋」的那半条信息。
   *
   * 780 —— 离齿孔线 24，离简介基线 50。
   * 地址与简介都是灰字，挨太近会读成同一段话；
   * 50 是这段纸面上能给的最多：再往下压就贴着齿孔线了，
   * 再往下挪简介就顶到落款（946）上。
   */
  addressBaseline: 780,
  /**
   * 地址前的定位针。
   *
   * 24 —— 与地址字号（22）同一量级。图标比字大一点才立得住，
   * 缩到 20 就成了字边上的碎屑。
   */
  addressIconSize: 24,
  /** 定位针左上角 x —— 与左留白对齐 */
  addressIconX: 48,
  /** 定位针左上角 y —— 圆头落在地址字的 x-height 带上（随地址基线一起挪） */
  addressIconY: 760,
  /** 地址文字的 x —— 让开定位针（48 + 24 + 8） */
  addressTextX: 80,
  /**
   * 地址的宽度上限。
   *
   * 428 —— 右沿仍落在 508（与简介同一列），与码位（x 552）之间留着 44 的缝。
   */
  addressMaxWidth: 428,
  /**
   * 简介首行基线。
   *
   * 往下挪了 18：给地址让出那一行。
   * 挪完的节奏是 —— 齿孔线 740 / 地址 780 / 简介 830·866·902 / 落款 946。
   * 地址与简介之间留 50：两行都是灰字，挨太近会读成同一段话。
   * 简介行与行之间 36（字号 26），简介与落款之间 24 —— 段与段拉开，行与行贴近。
   */
  descBaseline: 830,
  /** 简介行高 —— footnote 的 leading 1.35 */
  descLineHeight: 36,
  /** 简介最多几行 */
  descLines: 3,
  /**
   * 简介的宽度上限。
   *
   * 右边要让开那块码 —— 左边一栏字、右边一块存根，是票根的排法。
   * 460 是让开码位（x 552）之后还剩下的宽度：48 + 460 = 508，
   * 与码之间留着 44 的缝 —— 码是图形，字是字，两者挤在一起读不清。
   */
  descMaxWidth: 460,
  /** 品牌落款基线 */
  brandBaseline: 946,
  /** 品牌副句基线 —— 与落款同一条基线 */
  taglineBaseline: 946,
  /** 品牌副句 x（跟在落款后面） */
  taglineX: 136,
  /**
   * 码位边长。
   *
   * 150 是个下限值：海报宽 750，这块码落到手机上约 75pt ——
   * 再小就扫不出来了（微信自己的码也建议不小于 100px）。
   */
  codeSize: 150,
  /** 码位右上角 x（右边距 padding） */
  codeRight: POSTER.width - 48,
  /** 码位上沿 —— 与简介首行同一条带子上 */
  codeTop: 802,
} as const;

/* ── 绘图小工具 ──────────────────────────────────────────────────────── */

/**
 * 画布用的字体栈。
 *
 * 与 `src/styles/tokens/_type.scss` 的 `$fish-font` 是同一份字面量 ——
 * canvas 不解析 var()，只能手抄（跟上面的色值同一个约定）。
 *
 * 为什么不能图省事写 `sans-serif`：**iOS 上裸 `sans-serif` 落到的是 Helvetica**，
 * `-apple-system` 才是 SF Pro。分数那个「78」用哪套字，一眼就看得出来。
 * 抄这份栈，原型（跑的是同一份栈）与线上才是同一套字。
 */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif";

/**
 * 设字体。
 *
 * 只管字重与字号 —— **字距不在这里**。见 drawType。
 */
function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number): void {
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
}

/**
 * 字距（em）折成像素。
 */
function trackGap(type: PosterType): number {
  return type.tracking * type.size;
}

/**
 * 量一段按字阶排出来的文字有多宽。
 */
function measureType(ctx: CanvasRenderingContext2D, type: PosterType, text: string): number {
  setFont(ctx, type.weight, type.size);
  const gap = trackGap(type);
  if (!gap) return ctx.measureText(text).width;

  const chars = Array.from(text);
  let width = 0;
  for (const char of chars) width += ctx.measureText(char).width + gap;
  // 最后一个字后面不补：那一格是「下一个字的位」，这张纸上没有下一个字
  return width - gap;
}

/**
 * 按一个字阶角色写字。
 *
 * 字距跟字号走（tracking 是 em），所以「设字体」和「画字」必须一起做 ——
 * 分成两次调用，早晚有一次忘了传字号，字距就悄悄没了。
 *
 * 字距是**逐字推进**出来的：小程序 canvas 没有 letterSpacing，
 * 而 Apple 的字阶本来就是「每一级自带字距」，大标题收紧、小字放开。
 * 这一层就是把它落地的唯一办法。
 */
function drawType(ctx: CanvasRenderingContext2D, type: PosterType, text: string, x: number, y: number): void {
  setFont(ctx, type.weight, type.size);
  const gap = trackGap(type);
  if (!gap) {
    ctx.fillText(text, x, y);
    return;
  }

  // 逐字推进，所以对齐必须是 left —— 右对齐会把每个字都摆到 x 上
  ctx.save();
  ctx.textAlign = 'left';
  let cursor = x;
  for (const char of Array.from(text)) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + gap;
  }
  ctx.restore();
}

/**
 * 截断到指定宽度（按字阶的字距量）。
 *
 * 名字特别长（用户自己起的）就得截断 —— 截断比让它把版式撑破好。
 */
function ellipsizeType(ctx: CanvasRenderingContext2D, type: PosterType, text: string, maxWidth: number): string {
  if (measureType(ctx, type, text) <= maxWidth) return text;

  const chars = Array.from(text);
  while (chars.length > 1) {
    chars.pop();
    if (measureType(ctx, type, `${chars.join('')}…`) <= maxWidth) return `${chars.join('')}…`;
  }
  return '…';
}

/**
 * 画一张铺满某个矩形的图（等比缩放 + 居中裁）。
 *
 * 海报里的照片不能被压扁 —— 一张被拉宽的水面会让人以为这是个畸形的地方。
 * 所以按「短边贴满、长边居中裁掉」处理。
 *
 * ⚠️ 必须裁到框里。竖着拍的照（钓点照片大多是竖的）铺进横向色带时，
 * 等比放大后的高度远超色带，不裁的话它会盖住下面整块版面 ——
 * 名字、简介全被压在照片上。
 */
function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: PosterImage,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!image.width || !image.height) return;

  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  // 小程序画布的图片对象不是 DOM 的 CanvasImageSource，类型上对不上，绕过去
  ctx.drawImage(image as unknown as CanvasImageSource, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/**
 * 截断到指定宽度，末尾**一定**补省略号。
 *
 * 与 ellipsizeType 的区别：ellipsizeType 是「名字太长就截」——
 * 后面本来就没字了，补不补省略号都一样；这里是「后面还有字」，
 * 必须让读者看出被吞了。
 */
function ellipsizeMark(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  let cut = text;
  while (cut.length > 0 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/**
 * 画一段自动换行的文字，最多 maxLines 行。
 *
 * 换行按**字**断，不按词 —— 中文没有词边界，按词断会把标点甩到行首。
 */
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const chars = Array.from(text);
  let line = '';
  let lineIndex = 0;

  for (const char of chars) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      if (lineIndex === maxLines - 1) {
        /*
         * 最后一行：把装不下的那个字也算进来再截。
         *
         * 只截 `line` 是不够的 —— `line` 本身就装得下，
         * ellipsize 会原样返回，省略号一个都不会有，
         * 后半句就这么静悄悄地没了。所以走 ellipsizeMark：先补上被挤出去的那个字，
         * 再截到「加省略号也装得下」，末尾一定留一个「…」。
         */
        ctx.fillText(ellipsizeMark(ctx, next, maxWidth), x, y + lineIndex * lineHeight);
        lineIndex += 1;
        return;
      }
      ctx.fillText(line, x, y + lineIndex * lineHeight);
      lineIndex += 1;
      line = char;
      continue;
    }
    line = next;
  }

  if (line && lineIndex < maxLines) {
    ctx.fillText(line, x, y + lineIndex * lineHeight);
  }
}

/**
 * 画一枚定位针。
 *
 * 为什么不用项目里那枚 lucide 图标（`icon('map-pin', 'muted')`）：
 * 图标是 **SVG data URI**（见 @/constants/icons）。`<image>` 组件能显示它，
 * 但小程序 canvas 的 `createImage()` 吃 SVG 并不有把握 ——
 * 押这一条上，结果可能是真机上地址前面**什么都没有**。
 * 用路径画就没有这个风险，而且缩放不糊。
 *
 * 形状照 lucide 的 map-pin：圆头、收到底的尖尾、中间一个圈。
 * 24×24 的画法，按 size 缩放。
 */
function mapPin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  const k = size / 24;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 外形：从圆的右边出发，两段贝塞尔收到尖尾，再绕回圆的左边
  ctx.beginPath();
  ctx.moveTo(x + 20 * k, y + 10 * k);
  ctx.bezierCurveTo(x + 20 * k, y + 16 * k, x + 12 * k, y + 22 * k, x + 12 * k, y + 22 * k);
  ctx.bezierCurveTo(x + 12 * k, y + 22 * k, x + 4 * k, y + 16 * k, x + 4 * k, y + 10 * k);
  ctx.arc(x + 12 * k, y + 10 * k, 8 * k, Math.PI, Math.PI * 2, false);
  ctx.stroke();

  // 中间那个圈
  ctx.beginPath();
  ctx.arc(x + 12 * k, y + 10 * k, 3 * k, 0, Math.PI * 2, false);
  ctx.stroke();

  ctx.restore();
}

/* ── 海报 ────────────────────────────────────────────────────────────── */

/**
 * 画一张海报。
 *
 * image 是封面照片（可能为 null —— 图还没加载出来或加载失败）。
 * codeImage 是小程序码（可能为 null —— 后端还没出码，见 PosterSpot.codeUrl）。
 */
export function drawPoster(
  ctx: CanvasRenderingContext2D,
  data: PosterSpot,
  image: PosterImage | null,
  codeImage: PosterImage | null,
): void {
  const w = POSTER.width;
  const h = POSTER.height;

  ctx.clearRect(0, 0, w, h);

  // 底：白。海报整体是一张白纸，照片压在上面
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, w, h);

  drawPhoto(ctx, data, image);
  drawScore(ctx, data);
  drawDescription(ctx, data);
  drawFooter(ctx, data, codeImage);
}

/** 照片带 + 压在它上面的名字与副信息 */
function drawPhoto(ctx: CanvasRenderingContext2D, data: PosterSpot, image: PosterImage | null): void {
  const w = POSTER.width;
  const photoH = LAYOUT.photoHeight;
  const x = LAYOUT.padding;

  if (image) {
    drawCoverImage(ctx, image, 0, 0, w, photoH);
  } else {
    // 没图时铺一块中性灰 —— 不能留白，白底上白字直接看不见
    ctx.fillStyle = '#d8dde4';
    ctx.fillRect(0, 0, w, photoH);
  }

  /*
   * 压暗。
   *
   * 名字是白字，压在照片上 —— 而缺图时那张占位插画是**浅色**的，
   * 白字压浅色插画等于没压。所以这层从照片上沿就开始起，
   * 到名字那一行已经有大半层黑：逆光的水面压得住，浅色插画也压得住。
   *
   * 这一层不参与「瘦身」：它保的是**任何一张照片下的可读性**，
   * 拿掉或者减淡，代价是白字压在逆光水面上读不出来 ——
   * 那是用「好看」换「能读」，不划算。
   */
  const scrim = ctx.createLinearGradient(0, LAYOUT.scrimTop, 0, photoH);
  scrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  scrim.addColorStop(1, `rgba(0, 0, 0, ${LAYOUT.scrimAlpha})`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, LAYOUT.scrimTop, w, photoH - LAYOUT.scrimTop);

  ctx.textBaseline = 'alphabetic';

  // 名字：全篇第二大的字，只这一行
  ctx.fillStyle = WHITE;
  drawType(ctx, TYPE.name, ellipsizeType(ctx, TYPE.name, data.name, w - LAYOUT.padding * 2), x, LAYOUT.nameBaseline);

  // 副信息：类型 · 地点 · 距离 · 开放时间
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  const meta = [data.kind, data.place, data.distance, data.hours].filter(Boolean).join(' · ');
  drawType(ctx, TYPE.meta, ellipsizeType(ctx, TYPE.meta, meta, w - LAYOUT.padding * 2), x, LAYOUT.metaBaseline);
}

/** 纸面上的主块：今日鱼口 */
function drawScore(ctx: CanvasRenderingContext2D, data: PosterSpot): void {
  const x = LAYOUT.padding;

  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = MUTED;
  drawType(ctx, TYPE.label, '今日鱼口', x, LAYOUT.scoreLabelBaseline);

  // 分数：全篇最大的字
  ctx.fillStyle = INK;
  const scoreText = String(data.score);
  drawType(ctx, TYPE.score, scoreText, x, LAYOUT.scoreBaseline);
  const scoreWidth = measureType(ctx, TYPE.score, scoreText);

  // 等级词：跟在分数右下角，蓝字
  ctx.fillStyle = BLUE_600;
  drawType(ctx, TYPE.level, data.level, x + scoreWidth + LAYOUT.levelGap, LAYOUT.levelBaseline);
}

/** 齿孔线 + 左栏的地址与简介 */
function drawDescription(ctx: CanvasRenderingContext2D, data: PosterSpot): void {
  const x = LAYOUT.padding;
  const w = POSTER.width;

  // 齿孔线：把「主票」（照片、名字、分数）与「存根」（地址、简介、码、落款）分开
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, LAYOUT.ruleY);
  ctx.lineTo(w - x, LAYOUT.ruleY);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';

  /*
   * 地址 —— 存根的第一行。
   *
   * 有就画，没有就不画：**不占位、不留空行**。
   * 后端 omitempty，一半钓点根本没填地址 —— 硬留一行空白，
   * 那些海报的存根上就多出一道没来由的空档。
   *
   * 超宽了截断（末尾一个省略号）。地址的完整内容在详情页有，
   * 海报上认个大概就够 —— 它是定位线索，不是阅读材料。
   */
  if (data.address) {
    /*
     * 定位针。
     *
     * 画在文字前面、让开 8px 的缝 —— 图标紧贴文字会挤，
     * 离得太远又不像是一组的。
     */
    mapPin(ctx, LAYOUT.addressIconX, LAYOUT.addressIconY, LAYOUT.addressIconSize, MUTED);

    ctx.fillStyle = MUTED;
    drawType(
      ctx,
      TYPE.address,
      ellipsizeType(ctx, TYPE.address, data.address, LAYOUT.addressMaxWidth),
      LAYOUT.addressTextX,
      LAYOUT.addressBaseline,
    );
  }

  ctx.fillStyle = MUTED;
  setFont(ctx, TYPE.desc.weight, TYPE.desc.size);
  drawWrapped(
    ctx,
    data.description || '',
    x,
    LAYOUT.descBaseline,
    LAYOUT.descMaxWidth,
    LAYOUT.descLineHeight,
    LAYOUT.descLines,
  );
}

/** 落款：品牌 + 码位 */
function drawFooter(ctx: CanvasRenderingContext2D, data: PosterSpot, codeImage: PosterImage | null): void {
  const x = LAYOUT.padding;

  ctx.textBaseline = 'alphabetic';

  // 品牌落款
  ctx.fillStyle = INK;
  drawType(ctx, TYPE.brand, '渔碌', x, LAYOUT.brandBaseline);

  ctx.fillStyle = MUTED;
  drawType(ctx, TYPE.tagline, '查潮汐、找钓点、看天气', LAYOUT.taglineX, LAYOUT.taglineBaseline);

  /*
   * 码位。
   *
   * 有小程序码就画码；没有就画一句搜索引导，**不画一个扫不出来的假码** ——
   * 一个扫不出东西的方块比没有更糟：人会举着手机扫，然后一脸茫然。
   */
  if (codeImage) {
    const size = LAYOUT.codeSize;
    /*
     * 方方正正地画，不裁圆角。
     *
     * 小程序码的定位图形（那三个回字）贴着角上，裁一刀就毁了 ——
     * 扫不出来的时候没人会怀疑是海报被裁了，只会觉得「这码是坏的」。
     * 码本身是白底，海报底也是白的，边界本来就看不出来。
     */
    drawCoverImage(ctx, codeImage, LAYOUT.codeRight - size, LAYOUT.codeTop, size, size);
    return;
  }

  // 用 muted 不用 muted-60：这是一句要照着做的指示，30% 的透明度读不出来
  ctx.fillStyle = MUTED;
  setFont(ctx, TYPE.tagline.weight, TYPE.tagline.size);
  ctx.textAlign = 'right';
  ctx.fillText('微信搜小程序', LAYOUT.codeRight, LAYOUT.taglineBaseline - 22);
  ctx.fillText('「渔碌」', LAYOUT.codeRight, LAYOUT.taglineBaseline);
  ctx.textAlign = 'left';
}

/**
 * 卡片封面的裁切区。
 *
 * 微信的转发卡片按 5:4 取图，从海报居中裁。
 * 裁切框跟绘制共用 POSTER.cardTop / cardHeight ——
 * 版面一改，裁切跟着走，不会出现「卡片上只剩半张脸」。
 */
export const CARD_CROP = {
  /** 5:4（转发好友） */
  friend: {
    x: 0,
    y: POSTER.cardTop,
    width: POSTER.width,
    height: POSTER.cardHeight,
    destWidth: 500,
    destHeight: 400,
  },
} as const;
