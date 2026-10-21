<template>
  <!--
    头图 —— 满幅照片压在这一屏的最上面。

    两种形态：
    - 有照片：aspectFill 铺满，顶部压一道暗，白字才压得住
    - 没照片：aspectFit 居中在一张白底上，插画完整地坐着

    缺图这一态不能只当成「图裂了」。占位插画是浅色的、1:1 的，
    直接 cover 会把它裁掉半个鱼；而且头图变浅之后，导航栏就不能再是
    白字浮在图上，得从头就是实底 —— 这一条由页面读 hasPhoto 之后决定。
  -->
  <view class="hero" :class="{ 'hero--empty': empty }" :style="{ height: height + 'px' }">
    <image v-if="src" class="hero__img" :src="src" :mode="hasPhoto ? 'aspectFill' : 'aspectFit'" />
    <view class="hero__scrim" />
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailHero —— 钓点详情页的头图。
 *
 * 只管渲染：图从哪来、缺不缺，是页面和 store 的事。
 */
import { computed } from 'vue';

const props = defineProps<{
  /** 图片地址。有照片时是后端给的 URL，没照片时是本地的占位插画。空串 = 还没取到 */
  src: string;
  /** 有没有真实照片。决定铺满还是居中，也决定要不要压暗 */
  hasPhoto: boolean;
  /** 高度（px）。由页面从 rpx 常量换算而来 —— 见 constants/spot-detail */
  height: number;
}>();

/**
 * 缺图态。
 *
 * 只在「取到了、但这条钓点确实没有照片」时才算缺图。
 * 还在取（src 是空串）时不算 —— 那时候头图是一片灰底，
 * 提前铺成白底会让页面先闪一下白，再闪回照片。
 */
const empty = computed(() => !!props.src && !props.hasPhoto);
</script>

<style lang="scss" scoped>
/*
 * 头图本体。
 *
 * 高度由页面绑进来（px，见 constants/spot-detail 的说明）——
 * 页面要用同一个数算「照片什么时候离开导航栏」的滚动阈值，
 * 高度写死在这里的话，两处就会各说各话。
 *
 * box-sizing: border-box 不能省：小程序默认是 content-box，
 * 缺图态的 padding 会被加在 width 之外 —— 头图比屏幕宽出 48rpx，
 * 占位图右侧被切掉，高度也多了 160rpx。
 */
.hero {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
  background-color: #dfe6ea;
}

.hero__img {
  width: 100%;
  height: 100%;

  /* 照片落位：不是淡入（那读作「图片加载出来了」），是从 1.06 收到 1 */
  @include fish-enter-media;
}

/*
 * 顶部压暗。
 *
 * 不是给照片加滤镜，是给导航栏那一块保证一个下限对比度 ——
 * 逆光的水面能把白字吃掉，没有这道暗，返回键就白浮在照片上找不着。
 *
 * 缺图时也压：占位插画是浅色的，导航栏压在它上面同样是白字，
 * 没有这道暗就压不住。两种状态共用一条，界面上才读得出「这是一张头图」。
 */
.hero__scrim {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0;
  left: 0;
  height: 336rpx;
  background: $fish-photo-scrim;

  /*
   * translateZ(0) 不是装饰 —— 它把这一层提成合成层。
   *
   * 头图有入场动画（transform: scale），而带 transform 的元素会被提升成独立的
   * 合成层。小程序渲染时合成层整个盖在普通绘制层之上，DOM 顺序不再决定谁压谁 ——
   * 于是这道压暗会被照片盖住，一像素都看不见（返回键也跟着白浮在照片上）。
   *
   * 把压暗也提成合成层，两层就回到同一条绘制队列里，按 DOM 顺序来：压暗在后，压在照片上。
   */
  transform: translateZ(0);
}

/*
 * 缺图态。
 *
 * 白底 + 内边距，让 1:1 的插画完整地坐在中间。
 * 底下那张白卡会压上来盖住插画的下半截 —— 这是故意的：
 * 「压」的关系在缺图时也要在，否则这一屏会散成两张不相干的图。
 */
.hero--empty {
  background-color: $fish-page;
  padding: 80rpx 48rpx;
}
</style>
