<template>
  <view class="minutely">
    <view class="minutely__head">
      <text class="minutely__title">分钟降水</text>
      <text class="minutely__meta">{{ windowLabel }}</text>
    </view>

    <!--
      上游给的一句话。

      这是这张卡最该先被看到的东西：「95分钟后雨就停了」比一排柱子更快地
      回答「还能不能钓」。所以它排在图上面，而不是塞进标题行的注脚里。
    -->
    <text v-if="summary" class="minutely__summary">{{ summary }}</text>

    <!--
      骨架照着最终形状摆，不用 SkeletonCard —— 那张是列表卡的形状
      （标题行 + 数值块 + 三列），摆在这里跟最终的样子对不上
      （理由见 VerdictOverview 的加载态注释）。
    -->
    <view v-if="loading && !hasData" class="minutely__skeleton">
      <view class="minutely__skeleton-summary" />
      <view class="minutely__skeleton-plot" />
    </view>

    <view v-else-if="hasData" class="minutely__body">
      <!--
        雨幕。

        一格一根柱子：横排是时间，柱高是这 5 分钟下了多少，柱色是雨强档位。

        为什么不用曲线：上游给的是一格一格的累计量，连成曲线等于替这串
        离散数据编了一段并不存在的连续性 —— 雨是断续的，曲线会把两场雨
        之间的空当描成一条缓缓下滑的线，看着像雨没停。柱子只声称它知道的
        那一格。

        深色面上这排柱子是**浮在面上**的釉柱，不是贴在面上的色块：
        顶端一道亮边（inset shadow）让它读成一根立起来的柱，
        暴雨那档再自带一圈辉光，一眼就看到雨最猛的那一格在哪。
      -->
      <view class="minutely__plot">
        <view class="minutely__band">
          <view v-for="bucket in curtain.buckets" :key="bucket.index" class="minutely__col" @tap="select(bucket.index)">
            <view class="minutely__bar" :class="barClass(bucket)" :style="barStyle(bucket)" />
          </view>
        </view>

        <!--
          读数浮标。

          它长在被读的那根柱子头上：数值 + 档位 + 什么时候。
          跟底部轨道那套「点了柱子再往下找」的读法相反 —— 眼睛不用离开柱子。

          常态浮在峰值那一格上（峰值是这张卡最该被读到的一格）；
          点别的格就跟着换过去。选中的格其余柱子压暗一档（dim to focus）。
        -->
        <view v-if="readout" class="minutely__chip-anchor" :class="chipAnchorClass" :style="chipStyle">
          <view class="minutely__chip">
            <text class="minutely__chip-main">{{ readout.main }}</text>
            <text class="minutely__chip-sub">{{ readout.sub }}</text>
          </view>
        </view>

        <!--
          整段没有降水时的说明。

          没有雨的时候，图上只剩一排 0 高度的短柱 —— 看着像图没加载出来。
          所以在这里把结论写出来：这一格不是空的，是「测过了，是 0」。
        -->
        <view v-if="isDry" class="minutely__dry">
          <text class="minutely__dry-label">{{ dryLabel }}</text>
        </view>
      </view>

      <view class="minutely__ticks">
        <text
          v-for="tick in curtain.ticks"
          :key="tick.offset"
          class="minutely__tick"
          :class="'minutely__tick--' + tick.anchor"
          :style="{ left: tick.leftPct + '%' }"
        >
          {{ tick.label }}
        </text>
      </view>

      <!--
        色卡。

        颜色在这张图里只承载**档位**，不承载大小（大小是柱高），
        所以色卡要写清楚每档叫什么 —— 否则四根深浅不一的蓝柱
        对读者来说只是四根不一样的蓝柱。
      -->
      <view class="minutely__legend">
        <!--
          整段没有降水：四档色卡用不上，只留一枚「无降水」色块 ——
          四档都摆着、图上一根柱子都没有，图例反而会让人以为图漏了。
        -->
        <view v-if="isDry" class="minutely__legend-chip minutely__legend-chip--last">
          <view class="minutely__swatch minutely__swatch--none" />
          <text class="minutely__legend-label">0 毫米</text>
        </view>
        <template v-else>
          <view
            v-for="(level, index) in legendLevels"
            :key="level.key"
            class="minutely__legend-chip"
            :class="{ 'minutely__legend-chip--last': index === legendLevels.length - 1 }"
          >
            <view class="minutely__swatch" :class="'minutely__swatch--' + level.key" />
            <text class="minutely__legend-label">{{ level.label }}</text>
          </view>
        </template>
      </view>

      <!--
        窗口合计。

        浮标读的是「某一格」，这里读的是「整段」—— 两件事，不重复。
        合计只有一行，不做成轨道：轨道是给两套读数交叉淡入用的，
        这里只有一套。
      -->
      <view class="minutely__total">
        <text class="minutely__total-label">两小时累计</text>
        <text class="minutely__total-value">{{ curtain.total.toFixed(1) }} 毫米</text>
      </view>
    </view>

    <text v-else class="minutely__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 分钟降水 —— 未来 2 小时、每 5 分钟一格的降水预报。
 *
 * 为什么值得单独一张卡、还放在天气分区的最上面：
 * 钓鱼最怕的是「雨下起来了才知道」。逐时预报给的是小时粒度，
 * 正在下雨的那一小时里它只能给一个平均值；分钟降水给的是接下来两小时的
 * 逐 5 分钟累计量 —— 雨什么时候到、什么时候停，一眼看得出来。
 *
 * 这张卡是全项目第二块「有颜色的面」（第一块是当前天气卡）：
 * 深色的降水泥面。浅底上的浅蓝柱分不出雨强档位，深底上柱子自己发光，
 * 四档才拉得开。代价是它跟同页的玻璃卡不是一套材质语言。
 *
 * 图用「雨幕」：一格一根柱子，不画曲线。理由写在模板里那段注释中。
 *
 * 上游只覆盖中国区域，所以这张卡取不到数是常态而不是异常：
 * 失败时给一句空态，不弹 toast、不拖垮同一分区的其它卡。
 */
import { computed, ref, watch } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import type { MinutelyBucket } from '@/types/fishing';
import { buildMinutelyCurtain, formatSpan, offsetLabel, precipLevelLabel, PRECIP_LEGEND_LEVELS } from '@/utils/precip';

const mapStore = useFishingMapStore();

/**
 * 绘图区与柱阵的高度（rpx）。
 *
 * 这两个数跟样式里的 .minutely__plot / .minutely__band 是一对：
 * 柱高按柱阵的高度算百分比，浮标的 bottom 按绘图区的高度算百分比，
 * 两个基准不同，换算的时候要拿它们相除。
 */
const PLOT_HEIGHT = 280;
const BAND_HEIGHT = 200;

const points = computed(() => mapStore.minutelyForecast?.points ?? []);

const summary = computed(() => mapStore.minutelyForecast?.summary ?? '');

/** 换算成「雨幕」的窗口模型。取数在 store，换算在 utils，这里只管画 */
const curtain = computed(() => buildMinutelyCurtain(points.value));

/** 色卡上的四档 */
const legendLevels = PRECIP_LEGEND_LEVELS;

/**
 * 有没有可画的东西。
 *
 * 「上游给了格子」不等于「有格子能画」：整段窗口都可能是空串，
 * 那时候这张卡该说「暂无数据」，而不是画一排空柱子。
 */
const hasData = computed(() => curtain.value.buckets.some((bucket) => bucket.value !== null));

const loading = computed(() => mapStore.minutelyLoading);

/** 标题行右侧的窗口说明 */
const windowLabel = computed(() => `未来 ${formatSpan(curtain.value.spanMinutes)} · 每 5 分钟`);

/**
 * 空态文案分两种：取不到（多为境外坐标，上游没覆盖）和拿到了但没数据。
 */
const emptyText = computed(() => (mapStore.minutelyError ? '分钟降水暂不可用' : '未来两小时暂无降水数据'));

/** 选中的格子序号。没选中时为 null */
const selected = ref<number | null>(null);

/**
 * 数据换了就把选择清掉。
 *
 * 下标是这一份数据里的下标，新一份数据的第 12 格可能完全不是同一段时间 ——
 * 留着旧下标，浮标会指在一格不相干的数据上。
 */
watch(
  () => mapStore.minutelyForecast,
  () => {
    selected.value = null;
  },
);

/** 点柱子：读这一格。再点一下同一格，取消读数，回到常态 */
function select(index: number) {
  selected.value = selected.value === index ? null : index;
}

/**
 * 峰值格。
 *
 * 峰值是 0 时不算峰值 —— 整段都是 0 的话「峰值」是句废话，
 * 读者要的「无降水」由干态那段话给。
 */
const peak = computed(() => {
  const bucket = curtain.value.peak;
  if (!bucket || bucket.value === null || bucket.value <= 0) return null;
  return bucket;
});

/**
 * 浮标读哪一格。
 *
 * 常态读峰值：峰值是这张卡最该被读到的一格，不该要用户点一下才看得到。
 * 点了别的格就改读那一格。
 */
const readoutBucket = computed(() => {
  if (selected.value === null) return peak.value;
  return curtain.value.buckets[selected.value] ?? null;
});

/** 浮标上的两行字 */
const readout = computed(() => {
  const bucket = readoutBucket.value;
  if (!bucket) return null;

  if (bucket.value === null) {
    return { main: '无数据', sub: offsetLabel(bucket.offset) };
  }

  const level = precipLevelLabel(bucket.level ?? 'none');
  // 常态（读的是峰值）说「峰值」；点了别的格说「什么时候」。
  const where = selected.value === null ? `峰值 · ${level}` : `${offsetLabel(bucket.offset)} · ${level}`;
  return { main: `${bucket.value.toFixed(2)} 毫米`, sub: where };
});

/**
 * 浮标的横向锚点。
 *
 * 浮标比一根柱子宽，落在最左或最右那一格时会探出卡外。
 * 所以按列的首尾换锚：首格靠左、末格靠右、中间居中。
 *
 * 中间那档的居中位移要用 transform，而入场动画也要用 transform ——
 * 同一个元素上这两个互相覆盖（后写的赢），所以位移放在外层的锚点元素上，
 * 动画留给里面的浮标本体。
 */
const chipAnchorClass = computed(() => {
  const index = readoutBucket.value?.index ?? -1;
  const last = curtain.value.buckets.length - 1;
  if (index <= 0) return 'minutely__chip-anchor--start';
  if (index >= last) return 'minutely__chip-anchor--end';
  return 'minutely__chip-anchor--mid';
});

/**
 * 浮标的位置。
 *
 * 横向钉在被读那一列的中心（中间那档）；首尾两列的横向由类给，
 * 这里不再写 left，免得把「靠左 / 靠右」的锚覆盖掉。
 *
 * 纵向落在柱顶之上。这里有个容易踩的坑：柱高是「柱阵高度」的百分比，
 * 而浮标的 bottom 是「绘图区高度」的百分比 —— 两者基准不同，
 * 不换算的话浮标会浮在柱顶老高一块。
 */
const chipStyle = computed(() => {
  const bucket = readoutBucket.value;
  if (!bucket) return '';

  // 柱阵 200rpx、绘图区 280rpx（常量与样式里的数字要对上）
  const topPct = (bucket.heightPct ?? 0) * (BAND_HEIGHT / PLOT_HEIGHT);

  // 缺测那一格没有柱高，浮标落到图底附近，压在虚线空框的下沿上 ——
  // 它读的是「这一格」，位置得对得上那一列。
  const bottom = bucket.value === null ? 3 : topPct + 1;

  const style = [`bottom: ${bottom.toFixed(1)}%;`];

  const count = curtain.value.buckets.length;
  if (bucket.index > 0 && bucket.index < count - 1) {
    const center = ((bucket.index + 0.5) / count) * 100;
    style.push(`left: ${center.toFixed(2)}%;`);
  }

  return style.join(' ');
});

/** 柱子属于哪一档 —— 决定它的颜色 */
function barClass(bucket: MinutelyBucket): string {
  if (bucket.value === null) return 'minutely__bar--gap';

  const level = bucket.level ?? 'none';
  // 选中别格时，这一格不是主角，压暗一档（dim to focus）。
  const dim = selected.value !== null && selected.value !== bucket.index ? ' minutely__bar--dim' : '';
  return `minutely__bar--${level}${dim}`;
}

/**
 * 柱子的高度与入场延迟。
 *
 * 高度是百分比，基准是**柱阵**（200rpx 那段），不是整个绘图区 ——
 * 绘图区顶部留了 80rpx 给浮标，柱子不长在那里。
 * 格子数是上游给的，写死在 CSS 里就得跟着上游改，所以落在行内样式里。
 */
function barStyle(bucket: MinutelyBucket): string {
  let height: string;
  if (bucket.value === null) {
    // 没有数据：整格画成虚线空框（见 .minutely__bar--gap）
    height = '100%';
  } else if (!bucket.heightPct) {
    // 测到 0 雨：留一根极短的淡柱。留这一根是为了跟「没有数据」区分开 ——
    // 0 高度是「这一格测过，是 0」，虚线空框是「这一格没测到」
    height = '4rpx';
  } else {
    height = `${bucket.heightPct}%`;
  }
  // 逐格错开入场：柱子从左到右立起来，像雨幕一档档拉开
  return `height: ${height}; animation-delay: ${bucket.index * 14}ms;`;
}

/**
 * 整段没有降水。
 *
 * 这种窗口下每一格都是 0，图上只剩一排 0 高度的短柱 —— 看着像图没加载出来。
 * 所以要单独认出来：柱子照画（0 高度也是「测过了，是 0」），
 * 另在图上写一句结论、色卡换成一枚「无降水」。
 */
const isDry = computed(() => hasData.value && curtain.value.total === 0);

/**
 * 干态下那句话。
 *
 * 写状态，不写结论 —— 上游那句话（通常是「未来两小时无降水」）已经在卡片
 * 上面了，图上再写一遍同样的句子就是同一句话说两遍。
 *
 * 有格子缺测的时候不能一口咬定整段无雨 —— 缺的那几格是「不知道」，
 * 不是「没下」。所以分开说。
 */
const dryLabel = computed(() => {
  const gap = curtain.value.buckets.some((bucket) => bucket.value === null);
  return gap ? '无降水（部分时段缺测）' : '无降水';
});
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 深色降水材质面（fish-rain-deep）。不是玻璃面 —— 雨强四档是四档明度，
 * 浅底上的浅蓝柱分不出档，深底上柱子自己发光才拉得开。
 */
.minutely {
  @include fish-rain-deep;
  padding: 28rpx;
}

.minutely__head {
  @include fish-card-head;
}

.minutely__title {
  color: $fish-on-dark;
  @include fish-type(headline);
}

.minutely__meta {
  color: $fish-rain-deep-muted;
  @include fish-type(caption2);
}

/*
 * 上游那句话。
 *
 * 它是结论不是注脚，所以给正文的字阶 —— 压成灰色小字就成了一句
 * 容易被划过去的补充说明，而它恰恰是这张卡最该被先读到的内容。
 */
.minutely__summary {
  display: block;
  margin-bottom: 20rpx;
  color: rgba(255, 255, 255, 0.92);
  @include fish-type(subhead);
}

/* 深色面上的骨架块：白字压一点点透明度，跟玻璃面上的那一档不是一个深浅 */
.minutely__skeleton-summary {
  width: 320rpx;
  height: 28rpx;
  margin-bottom: 20rpx;
  border-radius: $fish-radius-sm;
  background-color: rgba(255, 255, 255, 0.12);
  animation: fish-pulse 1.8s ease-in-out infinite;
}

/* 图区的高度照着真图来：数据到了不换版，页面不会往下跳一截 */
.minutely__skeleton-plot {
  width: 100%;
  height: 280rpx;
  border-radius: $fish-radius-xl;
  background-color: rgba(255, 255, 255, 0.12);
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.minutely__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-rain-deep-muted;
  @include fish-type(subhead);
  text-align: center;
}

/* ===========================================================================
   雨幕
   =========================================================================== */

/*
 * 绘图区。
 *
 * 顶部留 80rpx 给浮标（它要浮在柱顶之上），下面 200rpx 是柱阵。
 * 这段留白是给读数留的：柱子最高就是柱顶，浮标没有地方站。
 */
.minutely__plot {
  position: relative;
  height: 280rpx;
}

.minutely__band {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: flex-end;
  height: 200rpx;
}

.minutely__col {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex: 1;
  height: 100%;
}

/*
 * 釉柱。
 *
 * 顶端一道 1rpx 亮边（inset shadow）让它读成一根立起来的柱，
 * 而不是一块贴在深色面上的浅蓝方块。
 */
.minutely__bar {
  width: 18rpx;
  border-radius: 6rpx 6rpx 2rpx 2rpx;
  transform-origin: bottom center;
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.35);

  @if $fish-motion {
    animation: curtain-rise 520ms $fish-ease-out both;
  }
}

/*
 * 暴雨那档自带一圈辉光：它是雨最猛的一格，整张卡最该被先看到的一格。
 */
.minutely__bar--storm {
  background-color: $fish-rain-deep-storm;
  box-shadow:
    inset 0 1rpx 0 rgba(255, 255, 255, 0.6),
    0 0 16rpx rgba(255, 255, 255, 0.4);
}

/*
 * 测到 0 雨的那一格。
 *
 * 用 $fish-rain-deep-none 而不是 $fish-surface：surface 那一档淡到几乎看不见，
 * 整段无雨的时候图上就只剩一片空白，看着像图没加载出来。
 */
.minutely__bar--none {
  background-color: $fish-rain-deep-none;
}

.minutely__bar--light {
  background-color: $fish-rain-deep-light;
}

.minutely__bar--medium {
  background-color: $fish-rain-deep-medium;
}

.minutely__bar--heavy {
  background-color: $fish-rain-deep-heavy;
}

/*
 * 选中别格时，这一格不是主角，压暗一档。
 *
 * 只压柱身不动高度：高度是数据，压高度等于改数据。
 */
.minutely__bar--dim {
  opacity: 0.45;

  @if $fish-motion {
    transition: opacity $fish-dur-cross $fish-ease-out;
  }
}

/*
 * 没有数据的那一格。
 *
 * 画成虚线空框，而不是一根 0 高度的柱子：0 高度是「这一格测到没下雨」，
 * 虚线空框是「这一格没测到」。两件事在图上必须长得不一样。
 */
.minutely__bar--gap {
  border: 1rpx dashed $fish-rain-deep-hairline;
  background-color: transparent;
  box-shadow: none;

  @if $fish-motion {
    animation-name: curtain-fade;
  }
}

/*
 * 读数浮标。
 *
 * 一块白牌浮在柱子上：深色面上它是全图唯一的高对比小块，
 * 眼睛先落在它身上，再往下找到那根柱 —— 与其在图底开一条轨道让视线上下跑，
 * 不如把读数钉在它所描述的那一格头上。
 *
 * 分成锚点 + 本体两层：锚点负责「在哪」（横向位移 + 纵向位置），
 * 本体负责「长什么样」以及入场动画。
 * 横向居中靠 transform，而入场动画也要用 transform —— 同一个元素上
 * 这两个会互相覆盖（后写的赢），所以各占一层。
 */
.minutely__chip-anchor {
  position: absolute;
}

.minutely__chip {
  padding: 6rpx 14rpx;
  border-radius: $fish-radius-lg;
  background-color: #ffffff;
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.32);

  @if $fish-motion {
    animation: chip-in 260ms $fish-spring both;
  }
}

/* 首格靠左、末格靠右：浮标比柱子宽，不换锚会探出卡外 */
.minutely__chip-anchor--start {
  left: 0;
}

.minutely__chip-anchor--mid {
  transform: translateX(-50%);
}

.minutely__chip-anchor--end {
  right: 0;
}

.minutely__chip-main {
  display: block;
  color: $fish-ink;
  @include fish-type(footnote);
  font-weight: 600;
  white-space: nowrap;
}

.minutely__chip-sub {
  display: block;
  margin-top: 2rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
  white-space: nowrap;
}

/*
 * 干态说明。
 *
 * 绝对定位在绘图区正中：柱子全在底边（0 高度），中间是空的，
 * 结论写在那里，图就不像没加载出来。
 */
.minutely__dry {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  /*
   * 这一层铺满整个绘图区，会盖在柱子上；不让它接事件，
   * 点击才能落到下面的柱子上（这层是纯文字，本来也不需要交互）。
   * 与 PageNav / PageBackdrop 同一套做法。
   */
  pointer-events: none;
}

.minutely__dry-label {
  color: $fish-rain-deep-muted;
  @include fish-type(subhead);
}

/*
 * 横轴刻度。
 *
 * 刻度按各自那一格的位置摆（不等距），所以用绝对定位落在百分比上。
 */
.minutely__ticks {
  position: relative;
  height: 32rpx;
  margin-top: 8rpx;
}

.minutely__tick {
  position: absolute;
  top: 0;
  color: $fish-rain-deep-muted;
  @include fish-type(caption2);
  white-space: nowrap;
}

.minutely__tick--mid {
  transform: translateX(-50%);
}

.minutely__tick--end {
  transform: translateX(-100%);
}

/* ===========================================================================
   色卡
   =========================================================================== */

.minutely__legend {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid $fish-rain-deep-hairline;
}

.minutely__legend-chip {
  display: flex;
  align-items: center;
  margin-right: 28rpx;
}

.minutely__legend-chip--last {
  margin-right: 0;
}

.minutely__swatch {
  width: 20rpx;
  height: 20rpx;
  margin-right: 10rpx;
  border-radius: 6rpx;
}

/* 「无降水」色块：跟「测到 0」的短柱同一个色 */
.minutely__swatch--none {
  background-color: $fish-rain-deep-none;
}

.minutely__swatch--light {
  background-color: $fish-rain-deep-light;
}

.minutely__swatch--medium {
  background-color: $fish-rain-deep-medium;
}

.minutely__swatch--heavy {
  background-color: $fish-rain-deep-heavy;
}

.minutely__swatch--storm {
  background-color: $fish-rain-deep-storm;
}

.minutely__legend-label {
  color: $fish-rain-deep-muted;
  @include fish-type(caption2);
}

/* ===========================================================================
   窗口合计
   =========================================================================== */

.minutely__total {
  display: flex;
  align-items: baseline;
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid $fish-rain-deep-hairline;
}

.minutely__total-label {
  color: $fish-rain-deep-muted;
  @include fish-type(caption2);
}

.minutely__total-value {
  margin-left: 10rpx;
  color: $fish-on-dark;
  @include fish-type(subhead);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ===========================================================================
   入场
   =========================================================================== */

/*
 * 柱子从底边长上来。
 *
 * 只动 transform 与 opacity：这两条在小程序里走合成，不触发布局重排。
 *
 * 关键帧写在组件自己的样式里（SnapSheet 也是这么做的），不进 App.vue ——
 * 全局那份只放跨组件复用的动画。
 */
@keyframes curtain-rise {
  from {
    opacity: 0;
    transform: scaleY(0);
  }

  to {
    opacity: 1;
    transform: scaleY(1);
  }
}

/* 没有数据的那一格不生长，只淡入 —— 让「没数据」看起来是「这一格被跳过」 */
@keyframes curtain-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/*
 * 浮标入场。
 *
 * 从柱顶往上浮一点 + 淡入：它是被「读」出来的，不是从天上掉下来的。
 */
@keyframes chip-in {
  from {
    opacity: 0;
    transform: translateY(8rpx);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
