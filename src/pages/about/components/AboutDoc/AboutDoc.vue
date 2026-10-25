<template>
  <!--
    抽屉里的文档正文：标题 + 一句话摘要 + 若干章节。

    SnapSheet 只提供容器和头部，这里负责「这篇文档怎么排版」，标题区归页面
    （见关于页的 doc__header 同款写法）。

    章节标题是**法律文件的写法**（带中文序号），不是界面的写法 ——
    读者是来读一份有编号的文件的，编号让他能对照、能引用、也能记住自己看过第几条。
  -->
  <view class="about-doc">
    <view class="about-doc__summary">
      <text class="about-doc__summary-text">{{ doc.summary }}</text>
    </view>

    <text v-if="doc.meta" class="about-doc__meta">{{ doc.meta }}</text>

    <view v-for="section in doc.sections" :key="section.title" class="about-doc__section">
      <text class="about-doc__section-title">{{ section.title }}</text>

      <view v-for="(paragraph, i) in section.paragraphs" :key="i" class="about-doc__paragraph">
        <text class="about-doc__paragraph-text">{{ paragraph }}</text>
      </view>
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
  padding-bottom: 8rpx;
}

.about-doc__summary-text {
  color: $fish-muted;
  @include fish-type(subhead);
}

/*
 * 元信息（生效日期）。
 *
 * 压到全页最低的一档 —— 它是这份文件的元信息，不是内容。
 * 紧跟在摘要下面：两行都是「这份文件的来路」，属于同一块。
 */
.about-doc__meta {
  display: block;
  padding-bottom: 28rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/*
 * 章与章之间 32rpx。
 *
 * 比章内的段落间距（16rpx）大一档：这个差别是分章能不能读出来的关键 ——
 * 一样大的间距会让整篇读成一片平铺的段落，读者找不到「这一段讲什么」。
 */
.about-doc__section + .about-doc__section {
  margin-top: 32rpx;
}

/*
 * 条款标题。
 *
 * 用 headline（17pt / 600）—— 字阶里唯一一档「正文尺寸但加粗」的级别，
 * 正是「分组标签」该用的那一档。下面的正文是 footnote（13pt），
 * 标题比正文大 4pt 且加粗：读者扫一眼就能找到每一条的边界。
 */
.about-doc__section-title {
  display: block;
  margin-bottom: 12rpx;
  color: $fish-ink;
  @include fish-type(headline);
}

/*
 * 段间距 16rpx。
 *
 * 正文用 footnote 而不是 body：抽屉里这段文字是要被「读」的，
 * 但它是说明性材料，不该占和首页结论一样的字号。
 *
 * 章内的段落比章与章之间紧一档（16rpx vs 32rpx），靠这一个差别把
 * 「一条里的几句话」和「一条与下一条」分成两组。
 */
.about-doc__paragraph + .about-doc__paragraph {
  margin-top: 16rpx;
}

.about-doc__paragraph-text {
  color: $fish-ink;
  @include fish-type(footnote);

  /* 中文长段落两端对齐会让行末的字距忽宽忽窄，正文里读着更累 */
  text-align: left;
}
</style>
