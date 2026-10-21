<template>
  <!--
    现场照片 —— 横向滚动的一条。

    用 scroll-view 而不是 CSS 的 overflow-x：WXSS 里 view 的横向溢出
    不会产生滚动，横向滚动必须走 scroll-view 组件。

    缩略图跟上面的卡左对齐，最后一张被切掉一截 —— 那截切口就是
    「右边还有」的唯一提示，比加个箭头干净。
  -->
  <view class="gallery">
    <text class="gallery__title">现场照片</text>

    <scroll-view class="gallery__scroll" scroll-x :show-scrollbar="false">
      <view class="gallery__row">
        <image v-for="(src, index) in images" :key="src + index" class="gallery__thumb" :src="src" mode="aspectFill" />
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailGallery —— 现场照片条。
 *
 * 只管渲染。图片从哪来是页面和 store 的事。
 */
defineProps<{
  /** 图片地址列表 */
  images: string[];
}>();
</script>

<style lang="scss" scoped>
/* 分区。标题上方的留白是 $fish-space-sectitle */
.gallery {
  margin-top: $fish-space-sectitle;
}

.gallery__title {
  display: block;
  margin-bottom: 20rpx;
  color: $fish-ink;
  @include fish-type(headline);
}

/*
 * 横向滚动容器。
 *
 * white-space: nowrap + 里面的 inline-flex 是小程序里做横向滚动条的写法：
 * nowrap 让子节点不换行，inline-flex 让它们排成一行且不被压缩。
 */
.gallery__scroll {
  width: 100%;
  white-space: nowrap;
}

.gallery__row {
  display: inline-flex;
  gap: 16rpx;
}

/*
 * 缩略图。
 *
 * 264×184rpx（132×92pt）—— 3:2 的横图，比正方形的占位更接近现场照片的样子。
 * flex-shrink: 0 不写的话会被压扁成一条。
 */
.gallery__thumb {
  width: 264rpx;
  height: 184rpx;
  flex-shrink: 0;
  border-radius: $fish-radius-lg;
}
</style>
