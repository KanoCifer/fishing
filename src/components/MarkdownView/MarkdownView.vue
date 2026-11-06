<template>
  <view class="md">
    <!--
      rich-text（小程序原生组件）。

      不用 mp-html：mp-html 自己解析 HTML、自己渲染节点，包体大，
      还带一堆用不上的能力（视频、音频、动画）。这里的输入只是
      一段 Markdown 建议文本，原生 rich-text 够用。

      节点数组而不是 HTML 字符串：官方明说 String 类型「性能会有所下降」
      —— 组件内部要把字符串再解析一遍。给结构化数组，这一步省了。

      样式靠节点自己的内联 style：rich-text 内部节点的 class 只有
      「包含它的那个自定义组件」的 WXSS 才吃得到，而这里的样式是 scoped 的
      （编译成 data-v 类），rich-text 内部的节点没有这个类，匹配不上。
      内联 style 只认自己，不依赖选择器命中。
    -->
    <rich-text :nodes="nodes" :user-select="true" />
  </view>
</template>

<script setup lang="ts">
/**
 * MarkdownView —— 把一段 Markdown 渲染成富文本。
 *
 * 链路：Markdown 文本 → marked.lexer() → token 树 → rich-text nodes。
 *
 * 为什么不让 rich-text 自己解析 Markdown：它不吃 Markdown，只吃 HTML
 * 或节点数组。自己用 marked 走一遍，输出结构化节点，效果一样，
 * 还省掉渲染层的二次解析。
 */
import { computed } from 'vue';

import { markdownToNodes } from '@/utils/markdownNodes';

const props = defineProps<{
  /** Markdown 原文。流式场景下会不断变长 */
  content: string;
}>();

const nodes = computed(() => markdownToNodes(props.content));
</script>

<style lang="scss" scoped>
/*
 * Markdown 容器。
 *
 * 只给一个块级容器和左右留白，不给颜色和字号 ——
 * 那些由节点的内联 style 管（见 @/constants/markdown-style）。
 * 这里再写一份就会和内联 style 打架，两处都要改。
 */
.md {
  display: block;
  padding: 0 4rpx;
}
</style>
