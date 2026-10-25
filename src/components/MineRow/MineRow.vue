<template>
  <!--
    入口行 —— 「我的」页分组列表里的一行。

    行的解剖：行首图标 + 行标题 + 右侧的数量/徽标 + 展开箭头。

    为什么行首有图标：这一页的行全是**去处**（我的钓点、关于渔碌），
    图标是它们的起点，扫一眼就知道每行通向哪一类东西。
    图标统一烤成蓝色（见 scripts/gen-icons.mjs）—— 一行里图标与文字不同色，
    就有了两个焦点。

    为什么右侧能挂数量：数量与徽标是这一行的**载荷** ——
    「我的钓点」不是空的链接，它带着我手上有几条。

    ⚠️ 分隔线画成真实的元素而不是 ::after：伪元素挂在自定义组件的宿主节点上
    在小程序端不保险，而这一行的分隔线要跨组件边界（行是组件，卡在页面里）。
  -->
  <view class="mine-row" @tap="emit('tap')">
    <view v-if="divider" class="mine-row__divider" />

    <image class="mine-row__icon" :src="iconSrc" mode="aspectFit" />

    <text class="mine-row__label">{{ label }}</text>

    <!-- 数量。压到第三档灰：它是行的载荷，不是标题 -->
    <text v-if="value" class="mine-row__value">{{ value }}</text>

    <!-- 徽标。淡底 + 深字，与「我的钓点」页里的状态徽标同一套 —— 同一个状态必须是同一种颜色 -->
    <view v-if="badge" class="mine-row__badge">
      <text class="mine-row__badge-text">{{ badge }}</text>
    </view>

    <!--
      箭头用 <image> 而不是文字符号 ›：
      › 在不同字体下粗细和形状差别很大，而箭头是「这一行可以点开」的结构性提示，
      形状稳定比省一张图标重要。图标由 scripts/gen-icons.mjs 生成，颜色烤死。
    -->
    <image v-if="chevron" class="mine-row__chevron" :src="chevronIcon" mode="aspectFit" />
  </view>
</template>

<script setup lang="ts">
/**
 * MineRow —— 「我的」页的入口行。
 *
 * 只管排版：这一行摆什么、点开了什么，由调用方决定。
 * 「更多」那两行不走这里 —— 它们必须是原生 button（转发面板与客服会话
 * 都只能由按钮唤起），排版另有一套（见 pages/mine/components/MineActions）。
 */
import { icon } from '@/constants/icons';

withDefaults(
  defineProps<{
    /** 行首图标（data URI） */
    iconSrc: string;
    /** 行标题 */
    label: string;
    /** 右侧的数量。空串 = 不显示 */
    value?: string;
    /** 右侧的徽标文案。空串 = 不显示 */
    badge?: string;
    /** 有没有展开箭头 */
    chevron?: boolean;
    /** 这一行上方有没有分隔线 */
    divider?: boolean;
  }>(),
  {
    value: '',
    badge: '',
    chevron: false,
    divider: false,
  },
);

const emit = defineEmits<{
  tap: [];
}>();

/**
 * 箭头取 muted60（tertiaryLabel）而不是 muted：箭头是结构符号，
 * 压到第三档灰才不会和它指向的那行标题抢注意力。
 */
const chevronIcon = icon('chevron-right', 'muted60');
</script>

<style lang="scss" scoped>
/*
 * 一行。
 *
 * 命中区 88rpx = 44pt，过 iOS 的 44pt 最小尺寸。
 *
 * 按下反馈用变暗而不是缩小：整行做 scale 会让下面几行跟着往旁边挪一点，
 * 一排条目同时出现时读起来像「整组跳了一下」。iOS 的列表行按压也是变暗。
 */
.mine-row {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 88rpx;
  padding: 24rpx 32rpx;
  @include fish-press-dim;
}

/*
 * 行间的发丝线。
 *
 * 缩到与行首图标左对齐（左边让出 32rpx），一直走到卡片右边 ——
 * 满宽的线读起来像表格；iOS 的 grouped list 用的就是这种缩进分隔线
 * （与 MineActions 的行是同一条规则）。
 */
.mine-row__divider {
  position: absolute;
  top: 0;
  right: 0;
  left: 32rpx;
  height: 1rpx;
  background-color: $fish-border;
}

/*
 * 行首图标 17pt。
 *
 * 方形图标与 17pt 正文字高齐平，它就退成「这一行的起点」；
 * 再大一点它就开始跟字抢注意力，读着像在看图标而不是在读一行。
 */
.mine-row__icon {
  width: 34rpx;
  height: 34rpx;
  flex-shrink: 0;
  margin-right: 20rpx;
}

.mine-row__label {
  flex: 1;
  min-width: 0;
  color: $fish-ink;
  @include fish-type(body);
}

/* 数量。压到第三档灰：它是这一行的载荷，不该跟标题平级 */
.mine-row__value {
  flex-shrink: 0;
  margin-right: 20rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 徽标。
 *
 * 比 Chip 组件矮一档（36rpx vs 48rpx）：Chip 是标签页里独立的一枚，
 * 这里它挤在一行的右侧，跟数量和箭头并排 —— 高度跟 Chip 一样的话，
 * 那一行会被它顶得不像一行。
 */
.mine-row__badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  height: 36rpx;
  margin-right: 20rpx;
  padding: 0 14rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-warning-tint;
}

.mine-row__badge-text {
  color: $fish-warning-ink;
  @include fish-type(caption2);
}

/* 箭头 14pt ≈ iOS 列表右侧的 disclosure indicator。
   尺寸写死不给 flex 拉伸：它是固定的结构符号，跟着文字被拉伸会变形 */
.mine-row__chevron {
  width: 28rpx;
  height: 28rpx;
  flex-shrink: 0;
}
</style>
