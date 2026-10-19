<template>
  <!--
    常驻结论条。

    结论退到顶部的一条窄栏，滚到哪儿都还在。
    数据页改成「一屏」之后，页面有三屏多高 —— 结论若只在第一屏，
    往下滚三屏就把它彻底忘了。所以结论必须常驻。

    用 fixed + onPageScroll 驱动，而不是 CSS 的 position: sticky：
    这一页配了 navigationStyle: "custom"，导航栏是浮层，sticky 的
    粘附基准在自定义导航栏下不可靠（粘到哪儿取决于浮层的高度和
    滚动容器的 overflow），实测的表现是粘在状态栏下面、被胶囊盖住。
    自己算位置反而是确定的。
  -->
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
/**
 * VerdictBar —— 滚过结论头之后，从顶部滑下来的常驻结论条。
 *
 * 高度刻意等于状态栏 + 导航栏：内容正好落在导航栏那一行里，
 * 胶囊按钮占着右边，所以右边让出 capsuleInsetRight。
 * 结果是它看起来就像「导航栏标题从空白变成了结论」——
 * 而导航栏本来就是自定义浮层，那一行原本什么都没有。
 */
import { useNavMetrics } from '@/composables/useNavMetrics';
import { icon } from '@/constants/icons';
import type { Tone } from '@/utils/weather';

withDefaults(
  defineProps<{
    /** 是否显示。页面按滚动位置给 */
    visible: boolean;
    /** 钓鱼指数 */
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
/*
 * 常驻条本身也是一块玻璃面。
 *
 * 它压在内容之上，底下是正在滚的卡片，所以底色要比普通卡片更实一点
 * （$fish-glass-strong）—— 普通卡片的 72% 半透明放在滚动内容上会透出
 * 底下的字，这条要读得清，不能让文字穿过来。
 */
.verdict-bar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 30;
  background-color: $fish-glass-strong;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.05);

  /* 这里才值得开模糊：底下真的有内容在滚过去。
     静态卡片背后是平滑渐变，模糊它等于花钱买不到东西（见 uni.scss 的 fish-glass）。 */
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
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.verdict-bar__level {
  margin-left: 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  line-height: 1;
}

.verdict-bar__level--success {
  color: $fish-success-ink;
}

.verdict-bar__level--blue {
  color: $fish-blue-600;
}

.verdict-bar__level--warning {
  color: $fish-warning;
}

.verdict-bar__level--destructive {
  color: $fish-destructive;
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

/* 刷新键：圆形热区，按下即反馈 */
.verdict-bar__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
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
