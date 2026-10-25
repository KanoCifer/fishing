<template>
  <!--
    条目列表 —— 一组可点开的条目，点开有下文（文档抽屉，或另一个页面）。

    容器是玻璃面，浮在页面环境色上（见令牌层 _color.scss 的分层说明），
    行与行之间只靠发丝线分，不再各加一层底。
  -->
  <view class="about-links">
    <view
      v-for="(link, i) in links"
      :key="link.key"
      class="about-links__row"
      :class="{ 'about-links__row--first': i === 0 }"
      @tap="emit('select', link)"
    >
      <text class="about-links__label">{{ link.key }}</text>

      <!--
        箭头用 <image> 而不是文字符号 ›：
        › 在不同字体下粗细和形状差别很大，而箭头是「这一行可以点开」的结构性提示，
        形状稳定比省一张图标重要。图标由 scripts/gen-icons.mjs 生成，颜色烤死。
      -->
      <image class="about-links__chevron" :src="chevronIcon" mode="widthFix" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * AboutLinks —— 一组可点开的条目。
 *
 * 列表内容由调用方给，这里只管排版和点击。
 * 两处在用：关于页给的是协议区那一串条目（「我的」页给的是通往关于页的那一行），
 * 两者是同一种行 —— 一行字 + 一个展开箭头 —— 所以共用一套排版，
 * 不用把关于页的文案一起搬过来，也不用另写一个长得差不多的行。
 *
 * 箭头取 muted60（tertiaryLabel）而不是 muted：箭头是结构符号，
 * 压到第三档灰才不会和它指向的那行标题抢注意力。
 */
import { icon } from '@/constants/icons';
import type { AboutLink } from '@/constants/about';

defineProps<{
  links: readonly AboutLink[];
}>();

const emit = defineEmits<{
  select: [link: AboutLink];
}>();

const chevronIcon = icon('chevron-right', 'muted60');
</script>

<style lang="scss" scoped>
/*
 * 列表外壳：玻璃面 + 24pt 圆角，和数据页的卡片同一级。
 *
 * overflow: hidden 让圆角把子节点的直角裁掉 ——
 * 不裁的话每行自己的白底会在四个角上溢出圆角。
 */
.about-links {
  overflow: hidden;
  @include fish-glass;
}

/*
 * 整行都是热区。
 *
 * 按下反馈用变暗而不是缩小：整行做 scale 会让下面几行跟着往旁边挪一点，
 * 一排条目同时出现时读起来像「整组跳了一下」。iOS 的列表行按压也是变暗。
 *
 * 首行不要圆角容器自己的圆角 —— 它就在容器顶部，多一层圆角会露出底下的灰底。
 */
.about-links__row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 上下 24rpx + 文字行高，命中区约 88rpx，过 iOS 的 44pt 最小尺寸 */
  padding: 24rpx 32rpx;
  @include fish-press-dim;
}

/*
 * 发丝线。
 *
 * 缩到与行首文字左对齐（左边让出 32rpx），一直走到卡片右边 ——
 * 满宽的线读起来像表格；iOS 的 grouped list 用的就是这种缩进分隔线，
 * 数据页卡片里的读数行也是同一套（见 WeatherCard）。
 */
.about-links__row::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  left: 32rpx;
  height: 1rpx;
  background-color: $fish-border;
}

/* 首行不要分隔线：它就在容器顶部，多一条会露出底下的环境色 */
.about-links__row--first::before {
  display: none;
}

.about-links__label {
  color: $fish-ink;
  @include fish-type(body);
}

/* 箭头 16pt ≈ iOS 列表右侧的 disclosure indicator。
   尺寸写死不给 flex 拉伸：它是固定的结构符号，跟着文字被拉伸会变形 */
.about-links__chevron {
  width: 28rpx;
  height: 28rpx;
  flex-shrink: 0;
  margin-left: 16rpx;
}
</style>
