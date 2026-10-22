<template>
  <!--
    抽屉里的文档正文：标题 + 一句话摘要 + 若干段落。

    SnapSheet 只提供容器和头部，这里负责「这篇文档怎么排版」，标题区归页面
    （见关于页的 doc__header 同款写法）。
  -->
  <view class="about-doc">
    <view class="about-doc__summary">
      <text class="about-doc__summary-text">{{ doc.summary }}</text>
    </view>

    <view v-for="(paragraph, i) in doc.paragraphs" :key="i" class="about-doc__paragraph">
      <text class="about-doc__paragraph-text">{{ paragraph }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * AboutDoc —— 一篇文档的正文排版。
 *
 * 段落之间用 margin 而不是空行：正文在抽屉里可以滚动，
 * 靠 margin 排版才不会因为缩进而让首末段少一截留白。
 */
import type { AboutDoc } from '@/constants/about';

defineProps<{
  doc: AboutDoc;
}>();
</script>

<style lang="scss" scoped>
/* 左右 40rpx 与 SnapSheet 的头部保持一致，两侧对不齐会立刻看出来 */
.about-doc {
  padding: 0 40rpx 64rpx;
}

/* 摘要在标题之下、正文之上：它交代这篇讲什么，读完就不用再读一遍正文 */
.about-doc__summary {
  padding-bottom: 24rpx;
}

.about-doc__summary-text {
  color: $fish-muted;
  @include fish-type(subhead);
}

/*
 * 段间距 20rpx。
 *
 * 正文用 footnote 而不是 body：抽屉里这段文字是要被「读」的，
 * 但它是说明性材料，不该占和首页结论一样的字号。
 */
.about-doc__paragraph + .about-doc__paragraph {
  margin-top: 20rpx;
}

.about-doc__paragraph-text {
  color: $fish-ink;
  @include fish-type(footnote);

  /* 中文长段落两端对齐会让行末的字距忽宽忽窄，正文里读着更累 */
  text-align: left;
}
</style>
