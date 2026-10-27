<template>
  <!--
    顶部标注 —— 表单最上面那一块。

    它回答的是「我发出去的东西会经过谁的手」。所以它排在必填组之前：
    审核员截图审稿时，第一屏就该看到这块，而不是滚到最底下才看见一行小字。

    徽标与正文默认取 @/constants/spot-publish 的那一份；
    编辑页要按这条钓点当前的状态换一套说法，所以留了 props 让它覆盖。
  -->
  <view v-if="mode === 'banner'" class="publish-banner">
    <view class="publish-banner__head">
      <image class="publish-banner__icon" :src="infoIcon" mode="aspectFit" />
      <text class="publish-banner__badge">{{ bannerText }}</text>
    </view>
    <text class="publish-banner__text">{{ bannerBody }}</text>
  </view>

  <!--
    末尾声明 —— 表单最后一组。

    摆在提交条正上方：用户滚到底正要按「提交审核」，这句话就在他眼前。
    后面跟着「内容审核与举报说明」的入口 —— 声明说完了，得让人能读到细则。
  -->
  <view v-else class="publish-notice">
    <text class="publish-notice__line">{{ notice.line1 }}</text>
    <text class="publish-notice__line">{{ notice.line2 }}</text>
    <text class="publish-notice__line">{{ notice.line3 }}</text>

    <view class="publish-notice__link" @tap="emit('openDoc')">
      <text class="publish-notice__link-text">{{ notice.link }}</text>
      <image class="publish-notice__chevron" :src="chevronIcon" mode="aspectFix" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotPublishNotice —— 发布内容时的声明。
 *
 * 两种形态，同一份文案：
 *   banner —— 表单顶部，醒目的一小块（mode="banner"）
 *   notice —— 表单末尾，三行声明加一个规范入口（默认）
 *
 * 为什么不做成两个组件：文案只有一份，形状有两种；拆成两个组件，
 * 改一句文案要记得改两处 —— 而这两处恰恰是审核员会分别看到的地方。
 *
 * 它只管渲染与点击：正文来自 @/constants/spot-publish，
 * 「点开规范」这件事交给页面（抽屉归页面，组件不持有浮层状态）。
 */
import { computed } from 'vue';

import { icon } from '@/constants/icons';
import { SPOT_PUBLISH_BANNER, SPOT_PUBLISH_NOTICE } from '@/constants/spot-publish';

const props = withDefaults(
  defineProps<{
    /** 形态。banner 是顶部那块醒目的标注 */
    mode?: 'banner' | 'notice';
    /**
     * 徽标上的字。覆盖默认的「个人投稿 · 需审核」。
     *
     * 编辑页要按状态换说法：一条已经过审的钓点，改完直接生效，
     * 挂「需审核」的字样就是假的。
     */
    badge?: string;
    /** 徽标下面那段正文。不给就用默认那份 */
    text?: string;
  }>(),
  {
    mode: 'notice',
    badge: '',
    text: '',
  },
);

const emit = defineEmits<{
  /** 点开了「内容审核与举报说明」的入口 */
  openDoc: [];
}>();

/** 徽标上的字 */
const bannerText = computed(() => props.badge || SPOT_PUBLISH_BANNER.badge);

/** 徽标下面的正文 */
const bannerBody = computed(() => props.text || SPOT_PUBLISH_BANNER.text);

const notice = SPOT_PUBLISH_NOTICE;

/** 说明图标。蓝色 —— 它是中性信息，不是错误也不是警告 */
const infoIcon = icon('info', 'blue');

/** 箭头。muted60，与协议区那一列的箭头同一档 */
const chevronIcon = icon('chevron-right', 'muted60');
</script>

<style lang="scss" scoped>
/* ── 顶部标注 ────────────────────────────────────────────────────────────── */

/*
 * 顶部标注。
 *
 * 它是**一张卡**，不是一行字：这一块要能被截图单独拿出去看，
 * 所以它有自己的面与圆角，而不是浮在环境色上的一段说明。
 */
.publish-banner {
  margin: 24rpx 32rpx 0;
  padding: 24rpx 28rpx;
  border-radius: $fish-radius-xl;
  @include fish-glass($fish-radius-xl);
}

/* 徽标那一行 */
.publish-banner__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

/*
 * 徽标前面的信息图标。
 *
 * 20rpx（约 10pt）—— 比正文小一号：它是徽标的一部分，不是正文里的插图。
 */
.publish-banner__icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

/*
 * 徽标上的字。
 *
 * 加粗 + 墨色：它要在这块卡里一眼可辨，但不该抢走整页标题的分量
 * （标题是 title1，徽标是 subhead）。
 */
.publish-banner__badge {
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
}

/* 说明正文 */
.publish-banner__text {
  display: block;
  margin-top: 8rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}

/* ── 末尾声明 ────────────────────────────────────────────────────────────── */

/*
 * 末尾声明。
 *
 * 不套卡：它是**要读**的材料，不是内容。套一张卡会让人以为它也是一栏
 * 可填的东西 —— 跟草稿条一样，它得站在表单之外。
 */
.publish-notice {
  padding: 32rpx 32rpx 0;
}

/*
 * 声明正文。
 *
 * 用 footnote（13pt）而不是 body —— 它是需要被同意的条款说明，
 * 不是这一页要传达的主张。压到辅助灰，让上面的表单仍然是主角。
 */
.publish-notice__line {
  display: block;
  color: $fish-muted;
  @include fish-type(footnote);

  /* 行距给开：连续三行说明，挤在一起会读成一团 */
  line-height: 1.6;
}

.publish-notice__line + .publish-notice__line {
  margin-top: 8rpx;
}

/* 规范入口 */
.publish-notice__link {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 16rpx;
  @include fish-press-dim;
}

/*
 * 入口上的字。
 *
 * 品牌蓝 —— 它是个能点开的去向，色���上要跟表单里的可点元素（链接、下拉）
 * 同一档，不能像声明正文那样压成灰。
 */
.publish-notice__link-text {
  color: $fish-blue-600;
  @include fish-type(footnote);

  font-weight: 600;
}

/*
 * 箭头。
 *
 * 20rpx —— 与 AboutLinks 里的箭头同一档尺寸，它是同一种结构符号
 * （「这一行可以点开」）。
 */
.publish-notice__chevron {
  width: 24rpx;
  height: 24rpx;
  flex-shrink: 0;
}
</style>
