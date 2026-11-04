<template>
  <!--
    应用身份条 —— 图标 + 名称 + 版本 + 一句话介绍，横排一行。

    为什么横排而不是竖排居中：这一页要回答的问题是「这是什么」，
    答案只有一行字。竖排居中的大卡片把一行字撑成一整屏，
    剩下的空间全被空白吃掉 —— 读者要的信息在第三行才开始出现。
    横排把「图标 / 名字 / 介绍」收在同一视线高度上，一眼扫完。

    版本号跟在名字后面，不单独占一行：它是给「确认自己装的是哪一版」
    用的元信息，不该跟介绍抢位置。
  -->
  <view class="about-header">
    <image class="about-header__logo" :src="APP_LOGO" mode="aspectFit" />

    <view class="about-header__text">
      <view class="about-header__name-row">
        <text class="about-header__name">{{ info.name }}</text>
        <text class="about-header__version">v{{ info.version }}</text>
      </view>

      <text class="about-header__tagline">{{ info.tagline }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * AboutHeader —— 应用图标 + 名称 + 版本 + 一句话介绍。
 */
import { APP_INFO, APP_LOGO } from '@/constants/about';

const info = APP_INFO;
</script>

<style lang="scss" scoped>
/*
  卡片：玻璃面浮在环境色上，靠面分层而不是描边和阴影，理由见令牌层 _color.scss 的分层说明。

  圆角用 $fish-radius-card（16pt）：它跟协议清单那张卡同级 ——
  这一页上是两张同级的卡（身份、清单），不是一张主卡加一张次卡。
*/
.about-header {
  display: flex;
  align-items: center;
  padding: 28rpx 32rpx;
  @include fish-glass($fish-radius-card);
}

/*
  60pt：iOS 设置页里应用图标的惯例尺寸。

  圆角 22%：图标和页面的关系必须靠圆角建立 —— 直接贴上去会读成一块色块
  而不是一枚图标。源图自带的圆角比例（≈21%）和这里几乎一致，所以这层 CSS
  在当前源图下不改变形状，留着是为了让满幅出血的源图也能直接换上。
  用百分比而不是固定 rpx，圆角就跟着图标尺寸走，改尺寸时不必回来配一个数。
*/
.about-header__logo {
  width: 120rpx;
  height: 120rpx;
  flex-shrink: 0;
  border-radius: 22%;
}

/* 文字块。min-width: 0 让长文案能正常收缩，不把图标挤出去 */
.about-header__text {
  min-width: 0;
  margin-left: 28rpx;
}

/* 名字与版本同一行 */
.about-header__name-row {
  display: flex;
  align-items: baseline;
}

.about-header__name {
  color: $fish-ink;
  @include fish-type(title);
}

/*
  版本号压到 caption：它是给「确认自己装的是哪一版」用的，
  不该跟名字抢视线，更不该跟下面的介绍平级。

  左边留一点距：名字与版本挤在一起会读成一个词组，
  留一档空隙才看得出「名字」和「版本」是两件事。
*/
.about-header__version {
  margin-left: 14rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 介绍是这一屏里唯一的解释性文字，用 body 而不是 caption：它要被读 */
.about-header__tagline {
  display: block;
  margin-top: 6rpx;
  color: $fish-muted;
  @include fish-type(body);
}
</style>
