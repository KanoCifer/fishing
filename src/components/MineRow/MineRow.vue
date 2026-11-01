<template>
  <!--
    入口行 —— 「我的」页白纸面上的一行。

    这一页的四行（我的钓点 / 关于渔碌 / 分享渔碌给朋友 / 联系客服）
    共用这一个组件：行高、字阶、图标尺寸、折痕位置全在这里定一次。

    为什么整页都用原生 <button>：微信的转发面板与客服会话只认带 open-type
    的原生按钮，页面没有任何 API 能打开它们（onShareAppMessage 只是**提供
    内容**，不是入口）。既然有两行必须是 button，剩下两行就用同一种元素 ——
    一页两套行，读起来像两页拼起来的。

    代价是微信 button 自带的一套默认样式（外边距、内边距、背景、边框、
    字号、行高，以及 ::after 伪元素带来的描边），得一项项清干净。

    hover-class="none"：关掉微信自带的按压态。它那一套是
    `{background-color: rgba(0,0,0,0.1); opacity: 0.7}` —— 压在一行**透明底**
    的条目上会刷出一条灰带，读着不像「这一行被按住了」，
    按下反馈由 :active 自己给（fish-press-dim）。

    ⚠️ 分隔线画成真实的元素而不是 ::after：伪元素挂在自定义组件的宿主节点上
    在小程序端不保险，而这一行的分隔线要跨组件边界（行是组件，纸在页面里）。
  -->
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

    <!--
      箭头用 <image> 而不是文字符号 ›：
      › 在不同字体下粗细和形状差别很大，而箭头是「这一行可以点开」的结构性提示，
      形状稳定比省一张图标重要。图标由 scripts/gen-icons.mjs 生成，颜色烤死。
    -->
    <image v-if="chevron" class="mine-row__chevron" :src="chevronIcon" mode="aspectFit" />
  </button>
</template>

<script setup lang="ts">
/**
 * MineRow —— 「我的」页白纸面上的行。
 *
 * 只管排版：这一行摆什么、点开了什么，由调用方决定。
 *
 * open-type 为空时是普通行，点它由调用方接；
 * open-type 为 share / contact 时，这一行是微信的入口 ——
 * 转发面板与客服会话都只能由按钮唤起（见 docs/mp-weixin-network.md）。
 */
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
/*
 * 一行。
 *
 * 命中区 120rpx = 60pt，过 iOS 的 44pt 最小尺寸。
 *
 * 按下反馈用变暗不是缩小：整行做 scale 会让下面几行跟着往旁边挪一点，
 * 一排条目同时出现时读起来像「整组跳了一下」。iOS 的列表行按压也是变暗。
 *
 * 微信 button 的默认样式在这一层一项项清干净（外边距、内边距、背景、
 * 边框、字号、行高、对齐），清完它就是一行。
 */
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
  @include fish-type(title);
}

/* 箭头 15pt ≈ iOS 列表右侧的 disclosure indicator。
   尺寸写死不给 flex 拉伸：它是固定的结构符号，跟着文字被拉伸会变形 */
.mine-row__chevron {
  width: 30rpx;
  height: 30rpx;
  flex-shrink: 0;
}
</style>
