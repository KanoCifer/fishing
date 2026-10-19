<template>
  <view class="md">
    <!--
      mp-html。

      用它而不是 rich-text：rich-text 的内容不受页面 CSS 管辖，
      想按设计系统调字号和颜色做不到；mp-html 的 tag-style 会把样式拼进
      每个节点的内联 style，那才是能拿到设计系统控制权的地方。

      组件从 npm 直接引入（mp-html/dist/uni-app/...），不 vendor 进仓库 ——
      vendor 进来就得跟着上游的打补丁流程走，升级时要手工重做一遍。
    -->
    <mp-html :content="html" :tag-style="tagStyle" :selectable="true" />
  </view>
</template>

<script setup lang="ts">
/**
 * MarkdownView —— 把一段 Markdown 渲染成富文本。
 *
 * 链路：Markdown 文本 → marked → HTML 字符串 → mp-html → 节点。
 *
 * 为什么不让 mp-html 自己解析 Markdown：它有 markdown 插件，但那个插件要
 * 给组件源码打补丁才能装上，而组件是从 npm 引入的、拿不到源码。
 * 自己用 marked 转一遍 HTML 效果一样，还少一道构建步骤。
 *
 * 样式走 `tag-style`（见 @/constants/markdown-style），不走 scoped SCSS ——
 * mp-html 渲染的节点在它自己的组件内部，页面的 scoped 样式够不着。
 */
import { computed } from 'vue';
import { marked } from 'marked';
// 路径带 .vue 后缀：tsconfig 用的是 node 解析，不带后缀时 TS 找不到这个模块
// （通配的 `declare module '*.vue'` 只匹配以 .vue 结尾的说明符）
import mpHtml from 'mp-html/dist/uni-app/components/mp-html/mp-html.vue';

import { MARKDOWN_TAG_STYLE } from '@/constants/markdown-style';

const props = defineProps<{
  /** Markdown 原文。流式场景下会不断变长 */
  content: string;
}>();

const tagStyle = MARKDOWN_TAG_STYLE;

const html = computed(() => {
  const source = props.content;
  if (!source) return '';

  /*
   * 中文标点跟在粗体后面时，marked 会把标点一起吞进强调范围，
   * 粗体看着就没了（`**潮汐不错。**` 整段不加粗）。
   * 插一个零宽空格把标点顶出来 —— mp-html 官方 markdown 插件用的是同一招。
   */
  const patched = source.replace(/\*\*([^*]+)\*\*([，。！？；：])/g, '**$1**&#8203;$2');

  try {
    // gfm + breaks 与源项目（参考实现）保持一致：单换行也换行
    return marked.parse(patched, { async: false, gfm: true, breaks: true }) as string;
  } catch {
    // 解析不了就退回原文。半截 Markdown 在流式过程中本来就可能不合法，
    // 抛错等于整块内容消失，比显示原文差得多
    return patched;
  }
});
</script>

<style lang="scss" scoped>
/*
 * Markdown 容器。
 *
 * 只给一个块级容器和左右留白，不给颜色和字号 ——
 * 那些由 tag-style 管（见 @/constants/markdown-style）。
 * 这里再写一份就会和 tag-style 打架，两处都要改。
 */
.md {
  display: block;
  padding: 0 4rpx;
}
</style>
