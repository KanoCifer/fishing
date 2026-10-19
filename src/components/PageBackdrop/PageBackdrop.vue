<template>
  <!--
    页面环境色底 —— 固定在视口上，不随内容滚走。

    数据页与关于页共用这一层。两个页面的底色是同一片环境色，
    切页签时看到的底色不会突变，「这是同一个 app」的直觉才立得住。
  -->
  <view class="page-backdrop" />
</template>

<script setup lang="ts">
/**
 * PageBackdrop —— 页面底的环境色渐层。
 *
 * 为什么是组件而不是各页写一个固定层：这份渐层是这套设计的**底**，
 * 两页共用才叫「同一个 app 的底」。各写一份的话，改一次色要记得改两处，
 * 漏一处就会出现「一页冷、一页暖」这种没法一眼说清、但一眼能看出的怪。
 *
 * 为什么不放到全局 page 底色上（那才是常规做法）：全局 page 底色还得给
 * tabBar 切换时露出的那一帧兜底，也给钓点页的原生地图边缘兜底 ——
 * 一旦全局换成渐变，地图边缘会跟着染上颜色。渐层只属于「有内容的页面」，
 * 所以它是一个可以按页放下的元素。
 */
</script>

<style lang="scss" scoped>
/*
 * z-index 0 而不是负数：内容层是 z-index 1 的定位元素，
 * 两者都在同一个层叠上下文里比大小，0 < 1，内容一定在上面。
 * 负数会掉到 page 的背景色下面去，那层渐变就白画了。
 */
.page-backdrop {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  background: $fish-page-bg;
  pointer-events: none;
}
</style>
