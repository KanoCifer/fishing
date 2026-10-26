<template>
  <!--
    今日钓况 —— 结论在前，四格数值在后。

    这一块的读法是「先看判断，再看依据」：
    等级词（"极好" / "好" …）与一句话结论占主位，
    气压、风力、气温、潮汐四格退成支撑 —— 它们是判断的依据，
    不是判断本身。

    四格用 flex + 50% 宽而不是 CSS grid：老基础库不认 grid，
    只有 flex 是底线保证。发丝线画在格子的边上，奇数格画右边、
    前两格画下边 —— 十字正好落在四格中间。
  -->
  <view class="conditions">
    <text class="conditions__section">今日钓况</text>

    <view class="conditions__card">
      <!--
        加载中。

        骨架照着真实内容的**行盒**摆（不是字面高度）：
        等级词一行、结论一行、四格各三行。占位比真实内容矮一截的话，
        数据到了版式一换，下面的东西会往上跳一下 —— 那一跳读起来就是「页面散架了」。
      -->
      <view v-if="loading" class="conditions__skeleton">
        <view class="conditions__skeleton-level" />
        <view class="conditions__skeleton-say" />

        <view class="conditions__skeleton-grid">
          <view v-for="n in 4" :key="n" class="conditions__skeleton-cell">
            <view class="conditions__skeleton-label" />
            <view class="conditions__skeleton-value" />
            <view class="conditions__skeleton-status" />
          </view>
        </view>
      </view>

      <!--
        失败。

        这一块自己站着：说清「只是钓况没取到」，并给一个重试。
        钓点本体是好的，不该因为天气接口挂了就整页都读不出来。
      -->
      <view v-else-if="failed" class="conditions__state">
        <text class="conditions__state-text">{{ failText }}</text>
        <text class="conditions__state-retry" @tap="emit('retry')">{{ retryLabel }}</text>
      </view>

      <!-- 有数据 -->
      <view v-else class="conditions__live">
        <!--
          等级词。

          配色走 levelTone —— 与数据页首屏那一句是同一个词、同一个颜色，
          两页之间切过来时它不变色（见 spot-conditions 的 buildSpotVerdict）。
        -->
        <text class="conditions__level" :class="`conditions__level--${verdict.tone}`">{{ verdict.word }}</text>

        <!--
          一句话结论。

          墨色而不是 muted：数据页里这句话是配角（上面压着一个大分数），
          详情页没有那个分数，这句话就是结论本身 —— 该给正文色。
        -->
        <text class="conditions__verdict">{{ verdict.text }}</text>

        <view class="conditions__grid">
          <view v-for="cell in cells" :key="cell.key" class="conditions__cell">
            <text class="conditions__cell-label">{{ cell.label }}</text>

            <view class="conditions__value">
              <text class="conditions__number">{{ cell.value }}</text>
              <text v-if="cell.unit" class="conditions__unit">{{ cell.unit }}</text>
            </view>

            <text class="conditions__status">{{ cell.status }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailConditions —— 今日钓况。
 *
 * 组件只管渲染。等级词、配色、结论文案、四格评价全在 spot-conditions 里做完再传进来 ——
 * 同一份数据在数据页和详情页说的话必须一样。
 */
import type { SpotConditionCell, SpotVerdict } from '../../spot-conditions';
import { SPOT_DETAIL_CONDITIONS } from '../../constants';

defineProps<{
  /** 四格。顺序即展示顺序 */
  cells: SpotConditionCell[];
  /** 结论：等级词、色调、一句话 */
  verdict: SpotVerdict;
  /** 钓况在飞 */
  loading?: boolean;
  /** 钓况没取到，而且手上也没有一份能显示的 */
  failed?: boolean;
}>();

const emit = defineEmits<{
  /** 重新取一次钓况 */
  retry: [];
}>();

/**
 * 失败时摆的那句话。
 *
 * 后端给的错误消息（"timeout" / "internal server error"）直接摆出来没有意义，
 * 用户要的是「现在缺了什么、还能不能继续看」—— 说清这一句就够了。
 */
const failText = SPOT_DETAIL_CONDITIONS.failed;

/** 重试按钮上的字 */
const retryLabel = SPOT_DETAIL_CONDITIONS.retry;
</script>

<style lang="scss" scoped>
/* 分区。标题上方的留白是 $fish-space-sectitle —— 「另起一段」的那一截 */
.conditions {
  margin-top: $fish-space-sectitle;
}

/*
 * 分区标签。
 *
 * eyebrow（12pt / 600 / 字距放开 / tertiaryLabel），与数据页、我的页同一档 ——
 * 一页里三个分区标题必须是同一种声音，混着来就会读成三页拼起来的。
 */
.conditions__section {
  display: block;
  margin-bottom: 20rpx;
  @include fish-eyebrow;
}

/*
 * 钓况卡。
 *
 * 结论与四格在**同一张卡**里：它们是一件事的两半
 * （判断 + 判断的依据），分成两张卡就得靠滚动去把它们连起来。
 */
.conditions__card {
  padding: $fish-card-padding;
  border-radius: $fish-radius-card;
  background-color: $fish-page;
  box-shadow: $smooth-shadow-md;
}

/* ── 结论 ──────────────────────────────────────────────────────────────── */

/*
 * 等级词。
 *
 * title2（22pt）—— 与数据页首屏那一句同字号同颜色。
 * 它是这一屏的判断，四格数字比它小一档是版式的意思，不是重要性。
 */
.conditions__level {
  display: block;
  @include fish-type(title2);
}

.conditions__level--success {
  color: $fish-success-ink;
}

.conditions__level--blue {
  color: $fish-blue-600;
}

.conditions__level--warning {
  color: $fish-warning-ink;
}

.conditions__level--destructive {
  color: $fish-destructive-ink;
}

.conditions__level--muted {
  color: $fish-muted;
}

/* 一句话结论 */
.conditions__verdict {
  display: block;
  margin-top: 8rpx;
  color: $fish-ink;
  @include fish-type(callout);
}

/* ── 四格 ──────────────────────────────────────────────────────────────── */

/*
 * 四格网格。
 *
 * flex + 50% 宽。发丝线画在格子的边上：奇数格画右边、前两格画下边，
 * 十字正好落在四格中间。
 */
.conditions__grid {
  display: flex;
  flex-wrap: wrap;
  margin-top: 24rpx;
  border-top: 1rpx solid $fish-border-40;
}

.conditions__cell {
  box-sizing: border-box;
  width: 50%;
  padding-top: 24rpx;
}

/* 奇数格是左边那一列，画右边线 */
.conditions__cell:nth-child(odd) {
  padding-right: 24rpx;
  border-right: 1rpx solid $fish-border-40;
}

/* 偶数格是右边那一列：左侧留出同样的 24rpx，线才不会贴住字 */
.conditions__cell:nth-child(even) {
  padding-left: 24rpx;
}

.conditions__cell-label {
  display: block;
  color: $fish-muted;
  @include fish-type(caption);

  line-height: 1;
}

/*
 * 主数值 + 单位。
 *
 * baseline 对齐：单位比数值小一号，两者的**基线**对齐才是
 * 「1006 hPa」而不是「1006 悬着个 hPa」。
 */
.conditions__value {
  display: flex;
  align-items: baseline;
  margin-top: 16rpx;
  color: $fish-ink;
  @include fish-type(title3);
}

.conditions__number {
  font-variant-numeric: tabular-nums;
}

/* 单位要把大数值的字重和字距压回去 —— 否则 "hPa" 会跟数字一样重 */
.conditions__unit {
  margin-left: 6rpx;
  color: $fish-muted;
  @include fish-type(caption);

  font-weight: 500;
  letter-spacing: 0;
}

.conditions__status {
  display: block;
  margin-top: 14rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

/* ── 加载中 ────────────────────────────────────────────────────────────── */

/*
 * 骨架。
 *
 * 底色 $fish-surface、呼吸幅度 0.35 —— 与 SkeletonCard / HourlyWeather 同一档，
 * 同一个页面里两种加载态一深一浅会读成两套组件。
 */
.conditions__skeleton-level,
.conditions__skeleton-say,
.conditions__skeleton-label,
.conditions__skeleton-value,
.conditions__skeleton-status {
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

/* 等级词那一行：与 title2 的行盒同高（22pt × 1.25） */
.conditions__skeleton-level {
  width: 132rpx;
  height: 54rpx;
  border-radius: $fish-radius-sm;
}

/* 结论那一行：与 callout 的行盒同高（16pt × 1.45） */
.conditions__skeleton-say {
  width: 380rpx;
  height: 46rpx;
  margin-top: 8rpx;
  border-radius: $fish-radius-sm;
}

.conditions__skeleton-grid {
  display: flex;
  flex-wrap: wrap;
  margin-top: 24rpx;
  border-top: 1rpx solid $fish-border-40;
}

.conditions__skeleton-cell {
  box-sizing: border-box;
  width: 50%;
  padding-top: 24rpx;
}

.conditions__skeleton-cell:nth-child(odd) {
  padding-right: 24rpx;
}

.conditions__skeleton-cell:nth-child(even) {
  padding-left: 24rpx;
}

/* 标签行 */
.conditions__skeleton-label {
  width: 56rpx;
  height: 24rpx;
  border-radius: $fish-radius-sm;
}

/* 数值行：与 title3 的行盒同高（20pt × 1.3） */
.conditions__skeleton-value {
  width: 108rpx;
  height: 52rpx;
  margin-top: 16rpx;
  border-radius: $fish-radius-sm;
}

/* 评价行：与 caption 的行盒同高（12pt × 1.3） */
.conditions__skeleton-status {
  width: 140rpx;
  height: 31rpx;
  margin-top: 14rpx;
  border-radius: $fish-radius-sm;
}

/* ── 失败 ──────────────────────────────────────────────────────────────── */

/*
 * 失败态。
 *
 * display 保持 flex 列：改成 block 的话「重新获取」会跟上一句挤在同一行里折断
 * （这一条在原型阶段真踩过）。
 */
.conditions__state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8rpx 0 4rpx;
}

.conditions__state-text {
  color: $fish-muted;
  @include fish-type(subhead);
}

/* 重试。蓝色 —— 它是这一块里唯一可做的事 */
.conditions__state-retry {
  margin-top: 20rpx;
  color: $fish-blue-600;
  @include fish-type(subhead);

  font-weight: 600;
  @include fish-press-dim;
}
</style>
