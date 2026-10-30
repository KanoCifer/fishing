<template>
  <view
    class="verdict-bar"
    :class="{ 'verdict-bar--visible': visible }"
    :style="{ paddingTop: statusBarHeight + 'px', paddingRight: capsuleInsetRight + 'px' }"
  >
    <view class="verdict-bar__inner" :style="{ height: navBarHeight + 'px' }">
      <text class="verdict-bar__score">{{ score }}</text>
      <text class="verdict-bar__level" :class="`verdict-bar__level--${tone}`">{{ level }}</text>

      <view class="verdict-bar__sep" />

      <text class="verdict-bar__place">{{ place }}</text>

      <view class="verdict-bar__refresh" @tap="emit('refresh')">
        <image class="verdict-bar__icon" :src="refreshIcon" mode="widthFix" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useNavMetrics } from '@/composables/useNavMetrics';
import { icon } from '@/constants/icons';
import type { Tone } from '@/utils/weather';

withDefaults(
  defineProps<{
    /** 是否显示。页面按滚动位置给 */
    visible: boolean;
    /** 鱼口概率 */
    score: number;
    /** 等级词 */
    level: string;
    /** 等级色调 */
    tone?: Tone;
    /** 地点名 */
    place?: string;
  }>(),
  {
    tone: 'muted',
    place: '',
  },
);

const emit = defineEmits<{
  refresh: [];
}>();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { statusBarHeight, navBarHeight, capsuleInsetRight } = useNavMetrics();

const refreshIcon = icon('refresh-cw', 'muted');
</script>

<style lang="scss" scoped>
.verdict-bar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 30;
  background-color: $fish-glass-strong;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.05);

  /* 这里才值得开模糊：底下真的有内容在滚过去。
     静态卡片背后是平滑渐变，模糊它等于花钱买不到东西（见令牌层 _material.scss 的 fish-glass）。 */
  @include fish-glass-blur;

  /* 收起时整体退到视口外，而不是停在原地变透明：
     留一条半透明的空条在顶上，读起来像界面出了 bug。 */
  transform: translateY(-100%);
  transition: transform $fish-dur-base $fish-ease-out;

  /* 收起时不接收点击，否则它盖住的那块内容点不动 */
  pointer-events: none;
}

.verdict-bar--visible {
  transform: translateY(0);
  pointer-events: auto;
}

.verdict-bar__inner {
  display: flex;
  align-items: center;
  padding-left: 32rpx;
}

.verdict-bar__score {
  color: $fish-ink;
  @include fish-type(title3);

  /* 数字用 700：这一行里它是主角，字重要压过旁边的等级词 */
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.verdict-bar__level {
  margin-left: 16rpx;
  @include fish-type(subhead);

  font-weight: 600;
}

/*
 * 等级词的颜色。
 *
 * 走文字专用的深档（-ink），不用填充档 —— 这一行是当文字读的，
 * 15pt 的小字撑不住填充档的对比度（见 _color.scss 的说明）。
 * 与首屏概览里的等级词用同一套，一眼能对上。
 */
.verdict-bar__level--success {
  color: $fish-success-ink;
}

.verdict-bar__level--blue {
  color: $fish-blue-600;
}

.verdict-bar__level--warning {
  color: $fish-warning-ink;
}

.verdict-bar__level--destructive {
  color: $fish-destructive-ink;
}

.verdict-bar__level--muted {
  color: $fish-muted;
}

/* 分隔线。1rpx 而不是 2rpx：2rpx 在 375pt 机型上正好 1pt，是 iOS 分隔线的三倍厚 */
.verdict-bar__sep {
  width: 1rpx;
  height: 28rpx;
  margin: 0 20rpx;
  background-color: $fish-border;
}

.verdict-bar__place {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: $fish-muted;
  @include fish-type(caption);

  white-space: nowrap;
  text-overflow: ellipsis;
}

/*
 * 刷新键：圆形热区，按下即反馈。
 *
 * 命中区 88rpx 见方（44pt）：它挂在导航栏那一行的末尾，又是图标键，
 * 拇指过去常常是擦着边按下去的 —— 热区不够大，刷新就按不准。
 */
.verdict-bar__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  margin-left: 16rpx;
  border-radius: 50%;
  @include fish-press-dim;
}

.verdict-bar__icon {
  width: 30rpx;
  height: 30rpx;
}
</style>
