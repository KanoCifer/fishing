<template>
  <!--
    应用身份卡 —— 「我的」页的头部，也是整屏唯一说明「这是什么」的地方。

    一屏之内的层级从大到小：图标 → 名称 → 版本 → 介绍。介绍与上面三行之间用
    一道 1rpx 发丝线断开，而不是再加一段空白 —— 分隔线把「这是什么」和「它做什么」
    明确切成两件事，空白只让人以为是同组的松散排布。
  -->
  <view class="about-header">
    <image class="about-header__logo" :src="logo" mode="aspectFit" />

    <text class="about-header__name">{{ info.name }}</text>
    <text class="about-header__version">{{ info.version }}</text>

    <view class="about-header__divider" />

    <text class="about-header__tagline">{{ info.tagline }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * AboutHeader —— 应用图标 + 名称 + 版本 + 一句话介绍。
 *
 * 文案不在这里写，全部来自 @/constants/about，改文案不用进这个组件（见该文件注释）。
 *
 * 图标来源：brand/yulu/yulu-logo-256.png 的拷贝。源图是满幅出血的正方形，
 * 圆角在这里用 CSS 裁，不做进图片里 —— brand 是设计侧的源图，裁过的副本
 * 和它长得不一样，换图时容易分不清用的是哪一张。
 */
import { APP_INFO } from '@/constants/about';

const info = APP_INFO;

/** 相对路径写法与 src/static 下的其他资源一致（见 pages.json 的 tabBar iconPath） */
const logo = '/static/logo.png';
</script>

<style lang="scss" scoped>
/*
 * 卡片：玻璃面浮在环境色上，靠面分层而不是描边和阴影，理由见 uni.scss 的分层说明。
 *
 * 圆角用 $fish-radius-2xl（32pt），和钓鱼指数的仪表卡同一级 ——
 * 它是关于页的「结论卡」，和数据页的结论卡是同一个位置上的东西，
 * 圆角就该是同一个尺寸。其余卡片用 $fish-radius-card（24pt）。
 */
.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 40rpx 40rpx;
  @include fish-glass($fish-radius-2xl);
}

/*
 * 60pt：iOS 设置页里应用图标的惯例尺寸。
 *
 * 圆角 22%：源图是满幅方图，直接贴在白卡上会读成一块色块而不是一枚图标 ——
 * 图标和页面的关系必须靠圆角建立。用百分比而不是固定 rpx，是为了让这个圆角
 * 跟着图标尺寸走，改 SIZE 时不必再回来配一个数。
 */
.about-header__logo {
  width: 120rpx;
  height: 120rpx;
  margin-bottom: 24rpx;
  border-radius: 22%;
}

.about-header__name {
  color: $fish-ink;
  @include fish-type(title3);
}

/* 版本号压到 caption2：它是给「确认自己装的是哪一版」用的，
   不该和名称抢视线，更不该和下面的介绍平级 */
.about-header__version {
  margin-top: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/*
 * 发丝线。
 *
 * 缩进成内容宽而不是满宽：一道横贯卡片的白卡分隔线读起来像「表格」，
 * 留出和上下文字对齐的缩进，它就退回成一行字前面的一个小节拍。
 */
.about-header__divider {
  width: 96rpx;
  height: 1rpx;
  margin: 32rpx 0 24rpx;
  background-color: $fish-border;
}

/* 介绍是这一屏里唯一的解释性文字，用 subhead 而不是 caption：
   它要被读，读的段落就该有正文的行距 */
.about-header__tagline {
  color: $fish-muted;
  @include fish-type(subhead);

  text-align: center;
}
</style>
