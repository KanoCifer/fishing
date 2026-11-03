<template>
  <button
    class="mine-row"
    :open-type="openType"
    hover-class="none"
    :session-from="sessionFrom"
    :send-message-title="sendMessageTitle"
    :send-message-path="sendMessagePath"
    :show-message-card="showMessageCard"
    @tap="onTap"
  >
    <view v-if="divider" class="mine-row__divider" />

    <image class="mine-row__icon" :src="iconSrc" mode="aspectFit" />

    <text class="mine-row__label">{{ label }}</text>

    <image v-if="chevron" class="mine-row__chevron" :src="chevronIcon" mode="aspectFit" />
  </button>
</template>

<script setup lang="ts">
import { icon } from '@/constants/icons';

withDefaults(
  defineProps<{
    /** 行首图标（data URI） */
    iconSrc: string;
    /** 行标题 */
    label: string;
    /** 有没有展开箭头 */
    chevron?: boolean;
    /** 这一行上方有没有分隔线 */
    divider?: boolean;
    /** 微信入口类型。空 = 普通行；share / contact = 微信自己开的面板 */
    openType?: 'share' | 'contact';
    /** 客服会话的来源标记（open-type=contact 时有效） */
    sessionFrom?: string;
    /** 客服会话里那张卡片的标题（open-type=contact 时有效） */
    sendMessageTitle?: string;
    /** 卡片点开回到小程序的哪一页（open-type=contact 时有效） */
    sendMessagePath?: string;
    /** 客服会话里要不要带那张卡片（open-type=contact 时有效） */
    showMessageCard?: boolean;
  }>(),
  {
    chevron: false,
    divider: false,
    openType: undefined,
    sessionFrom: '',
    sendMessageTitle: '',
    sendMessagePath: '',
    showMessageCard: false,
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

/** 普通行点一下：由调用方决定去哪儿 */
function onTap() {
  emit('tap');
}
</script>

<style lang="scss" scoped>
.mine-row {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 120rpx;
  padding: 0 40rpx;
  margin: 0;
  border: none;
  background-color: transparent;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  text-align: left;
  @include fish-press-dim;

  /* 原生 button 的 ::after 描边，清掉才和别的行一样 */
  &::after {
    border: none;
  }
}

/*
 * 行间的发丝线。
 *
 * 压到纸边（不缩进）：这一行的面就是白纸本身，线是纸上的折痕，
 * 不是某一行的下边框 —— 缩进 40rpx 的线读起来像表格的格线。
 */
.mine-row__divider {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 1rpx;
  background-color: $fish-border-40;
}

/*
 * 行首图标 20pt。
 *
 * 方形图标与 20pt 的行字齐平，它就退成「这一行的起点」；
 * 再大一点它就开始跟字抢注意力。
 */
.mine-row__icon {
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
  margin-right: 28rpx;
}

/*
 * 行标题。title 一级：白纸上的行是「去向」，不是说明文字，
 * 字要比正文重一档 —— 它是这一页上唯一还能被当成入口的东西。
 */
.mine-row__label {
  flex: 1;
  min-width: 0;
  color: $fish-ink;
  @include fish-type(body);
}

/* 箭头 15pt ≈ iOS 列表右侧的 disclosure indicator。
   尺寸写死不给 flex 拉伸：它是固定的结构符号，跟着文字被拉伸会变形 */
.mine-row__chevron {
  width: 30rpx;
  height: 30rpx;
  flex-shrink: 0;
}
</style>
