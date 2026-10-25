<template>
  <!--
    「更多」那一张卡 —— 两个动作：分享渔碌给朋友、联系客服。

    这两行**必须**是原生 <button open-type="...">：
    微信的转发面板与客服会话都只有这一个入口，页面自己没有任何 API 能打开它们
    （onShareAppMessage 只是**提供内容**，不是入口）。
    理由见 docs/mp-weixin-network.md 的「转发面板只能由按钮唤起」。

    代价是微信 button 自带的一套默认样式（外边距、内边距、背景、边框、
    字号、行高，以及 ::after 伪元素带来的描边），得一项项清干净，
    长得才跟这一页上别的行一样（见 MineRow 的说明）。

    hover-class="none"：关掉微信自带的按压态。它那一套是
    `{background-color: rgba(0,0,0,0.1); opacity: 0.7}` ——
    压在一行**透明底**的条目上会刷出一条灰带，读着不像「这一行被按住了」，
    按下反馈由 :active 自己给（fish-press-dim）。
  -->
  <view class="mine-actions">
    <button class="mine-actions__row mine-actions__row--first" open-type="share" hover-class="none">
      <image class="mine-actions__icon" :src="shareIcon" mode="aspectFit" />
      <text class="mine-actions__label">{{ share.label }}</text>
    </button>

    <button
      class="mine-actions__row"
      open-type="contact"
      hover-class="none"
      :session-from="contact.sessionFrom"
      :send-message-title="contact.messageTitle"
      :send-message-path="contact.messagePath"
      :show-message-card="true"
    >
      <image class="mine-actions__icon" :src="contactIcon" mode="aspectFit" />
      <text class="mine-actions__label">{{ contact.label }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
/**
 * MineActions —— 「我的」页「更多」那张卡里的两个动作。
 *
 * 只是一层排版：转发面板与客服会话都是微信自己开的，
 * 这里不调接口、不管状态、也没有失败重试 ——
 * 拉不起来是微信侧的事（比如后台没配客服人员），不是这里能兜的。
 *
 * 文案全部来自 @/constants/about。
 */
import { icon } from '@/constants/icons';
import { CONTACT, SHARE_APP } from '@/constants/about';

const share = SHARE_APP;
const contact = CONTACT;

/** 动作标记。蓝色 —— 它是这一行的动作，跟「展开箭头」不是一回事 */
const shareIcon = icon('share-2', 'blue');
const contactIcon = icon('message-square', 'blue');
</script>

<style lang="scss" scoped>
/*
 * 卡：玻璃面 + 16pt 圆角，和「我的钓点 / 关于渔碌」那一组是同一种材质 ——
 * 这一页上所有卡都该是同一种，不然读起来像拼了几个页面。
 *
 * overflow: hidden 让圆角把子节点的直角裁掉 —— 不裁的话行自己的底
 * 会在四个角上溢出圆角（见 MineRow 的说明）。
 */
.mine-actions {
  overflow: hidden;
  @include fish-glass;
}

/*
 * 一行。
 *
 * 按下反馈用变暗不是缩小：整行做 scale 会让这一行在卡片里挪动，
 * 读起来像「整组跳了一下」—— 与 MineRow 的行是同一条规则。
 */
.mine-actions__row {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  /* 上下 24rpx + 文字行高，命中区约 88rpx，过 iOS 的 44pt 最小尺寸 */
  padding: 24rpx 32rpx;
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
 * 缩到与行首图标左对齐（左边让出 32rpx），一直走到卡片右边 ——
 * 满宽的线读起来像表格；iOS 的 grouped list 用的就是这种缩进分隔线
 * （与 MineRow 的行是同一条规则）。
 */
.mine-actions__row::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  left: 32rpx;
  height: 1rpx;
  background-color: $fish-border;
}

/* 首行不要分隔线：它就在容器顶部，多一条会露出底下的环境色 */
.mine-actions__row--first::before {
  display: none;
}

/*
 * 前置图标 17pt。
 *
 * 方形图标与 17pt 正文字高齐平，它就退成「这一行的起点」；
 * 再大一点它就开始跟字抢注意力，读着像在看图标而不是在读一行。
 *
 * 尺寸与间距跟 MineRow 的行首图标一致 —— 同一个页面上两套行，
 * 图标却大小不同，读起来就像两页拼起来的。
 */
.mine-actions__icon {
  width: 34rpx;
  height: 34rpx;
  flex-shrink: 0;
  margin-right: 20rpx;
}

.mine-actions__label {
  color: $fish-ink;
  @include fish-type(body);
}
</style>
