<template>
  <!--
    条目列表 —— inset-grouped 分组，点开是文档抽屉。

    分组容器不投影：它已经是白底浮在页面灰底上了（见 uni.scss 的分层说明），
    再加投影就成了三层，行与行之间的层级会被投影带偏。
  -->
  <view class="about-links">
    <view
      v-for="(doc, i) in docs"
      :key="doc.key"
      class="about-links__row"
      :class="{ 'about-links__row--first': i === 0 }"
      @tap="emit('select', doc)"
    >
      <text class="about-links__label">{{ doc.key }}</text>

      <!--
        箭头用 <image> 而不是文字符号 ›：
        › 在不同字体下粗细和形状差别很大，而箭头是「这一行可以点开」的结构性提示，
        形状稳定比省一张图标重要。图标由 scripts/gen-icons.mjs 生成，颜色烤死。
      -->
      <image class="about-links__chevron" :src="chevronIcon" mode="widthFix" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * AboutLinks —— 一组可点开的条目。
 *
 * 列表内容由调用方给（关于页给的是 ABOUT_DOCS），这里只管排版和点击。
 * 这样别处要复用同一套条目样式时，不用把关于页的文案一起搬过来。
 *
 * 箭头取 muted60（tertiaryLabel）而不是 muted：箭头是结构符号，
 * 压到第三档灰才不会和它指向的那行标题抢注意力。
 */
import { icon } from '@/constants/icons';
import type { AboutDoc } from '@/constants/about';

defineProps<{
  docs: readonly AboutDoc[];
}>();

const emit = defineEmits<{
  (e: 'select', doc: AboutDoc): void;
}>();

const chevronIcon = icon('chevron-right', 'muted60');
</script>

<style lang="scss" scoped>
/* overflow: hidden 让圆角把子节点的直角裁掉 ——
   不裁的话每行自己的分隔线和白底会在四个角上溢出圆角 */
.about-links {
  overflow: hidden;
  border-radius: $fish-radius-xl;
  background-color: $fish-page;
}

/*
 * 整行都是热区。
 *
 * 按下反馈用变暗而不是缩小：整行做 scale 会让下面几行跟着往旁边挪一点，
 * 一排条目同时出现时读起来像「整组跳了一下」。iOS 的列表行按压也是变暗。
 *
 * 首行不要圆角容器自己的圆角 —— 它就在容器顶部，多一层圆角会露出底下的灰底。
 */
.about-links__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 上下 24rpx + 文字行高，命中区约 88rpx，过 iOS 的 44pt 最小尺寸 */
  padding: 24rpx 32rpx;
  border-top: 1rpx solid $fish-border;
  @include fish-press-dim;
}

.about-links__row--first {
  border-top: none;
}

.about-links__label {
  color: $fish-ink;
  @include fish-type(body);
}

/* 箭头 16pt ≈ iOS 列表右侧的 disclosure indicator。
   尺寸写死不给 flex 拉伸：它是固定的结构符号，跟着文字被拉伸会变形 */
.about-links__chevron {
  width: 28rpx;
  height: 28rpx;
  flex-shrink: 0;
  margin-left: 16rpx;
}
</style>
