<template>
  <!--
    一句话免责摘要。

    为什么是一行 + 一个链接：免责的完整表述在《用户协议》第五章里。
    同一件事在页面上说两遍，等于一次都没说 —— 页面上留一句摘要，
    读者要细节时点《用户协议》就有。

    三段文字套在一个 <text> 里，不拆成三个平级的 <text>：
    平级的多个 <text> 之间，模板里的换行与缩进会被渲染成空格，
    摘要前面就多出一截空档。套进同一个 <text> 里，句子才是连着的。
  -->
  <view class="about-notice">
    <image class="about-notice__icon" :src="infoIcon" mode="aspectFit" />

    <text class="about-notice__text"
      ><text class="about-notice__lead">{{ notice.lead }}</text
      ><text class="about-notice__link" @tap="emit('select', notice.linkKey)">{{ notice.link }}</text
      ><text class="about-notice__tail">{{ notice.tail }}</text></text
    >
  </view>
</template>

<script setup lang="ts">
/**
 * AboutNotice —— 关于页上那一行免责摘要。
 *
 * 文案在 @/constants/about 的 ABOUT_NOTICE：那里还定着摘要指向哪篇文档。
 */
import { icon } from '@/constants/icons';
import type { ABOUT_NOTICE } from '@/constants/about';

defineProps<{
  notice: typeof ABOUT_NOTICE;
}>();

const emit = defineEmits<{
  select: [key: string];
}>();

/**
 * 图标取 muted60（tertiaryLabel）。
 *
 * 它是结构符号不是内容 —— 跟文字一样的灰才不会把读者的视线从免责那句话上拉走。
 */
const infoIcon = icon('info', 'muted60');
</script>

<style lang="scss" scoped>
/*
  免责声明这一段：玻璃面浮在环境色上，靠面分层而不是描边（见令牌层 _color.scss 的分层说明）。
*/
.about-notice {
  display: flex;
  align-items: flex-start;
  padding: 24rpx 28rpx;
  @include fish-card;
}

/*
  14pt 图标。顶对齐而不是居中：它跟第一行文字的上沿对齐，
  居中会让它在两行文字里显得浮在中间，读起来像另一个东西。
*/
.about-notice__icon {
  width: 28rpx;
  height: 28rpx;
  flex-shrink: 0;
  margin-top: 4rpx;
}

/* 摘要正文。左边让出图标那一档 */
.about-notice__text {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
}

/* 免责文字压成辅助灰而不是主色：它是需要被同意的条款，不是页面要传达的主张 */
.about-notice__lead,
.about-notice__tail {
  color: $fish-muted;
  @include fish-type(caption);
}

/*
  链接：主色 + 下划线。

  下划线是必要的：这一段全是灰色小字，光靠颜色区分不出哪几个字能点。
*/
.about-notice__link {
  color: $fish-blue-600;
  @include fish-type(caption, 600);

  text-decoration: underline;
}
</style>
