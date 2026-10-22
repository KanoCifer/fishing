<template>
  <view class="spot-nav" :style="{ paddingTop: statusBarHeight + 'px' }">
    <view class="spot-nav__material" :class="{ 'spot-nav__material--on': material }" />

    <view class="spot-nav__row" :style="{ height: navBarHeight + 'px' }">
      <view class="spot-nav__back" :class="{ 'spot-nav__back--solid': solid }" @tap="emit('back')">
        <image class="spot-nav__back-icon" :src="backIcon" mode="aspectFit" />
      </view>

      <!--
        标题居中于**屏幕**，不是居中于「返回键到胶囊」那一段 ——
        那段两端不一样长，居中于它的标题看着是歪的。理由同 PageNav。
      -->
      <view class="spot-nav__title-slot">
        <text class="spot-nav__title" :class="{ 'spot-nav__title--solid': solid }">{{ title }}</text>
      </view>
      <view
        v-if="shareable"
        class="spot-nav__share"
        :class="{ 'spot-nav__share--solid': solid }"
        :style="{ right: capsuleInsetRight + 'px' }"
        @tap="emit('share')"
      >
        <image class="spot-nav__share-icon" :src="shareIcon" mode="aspectFit" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailNav —— 钓点详情页的导航栏。
 *
 * 只管「返回」和「标题」两件事。高度从胶囊按钮推算（useNavMetrics），
 * 标题居中于屏幕中线、又不让它钻到右上角那颗胶囊底下。
 */
import { computed } from 'vue';

import { useNavMetrics } from '@/composables/useNavMetrics';
import { icon } from '@/constants/icons';

const props = defineProps<{
  /** 标题。钓点名 */
  title: string;
  /** 反色：蓝箭头 + 黑字 */
  solid: boolean;
  /** 材质层显形 */
  material: boolean;
  /** 是否给出分享入口 */
  shareable?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  share: [];
}>();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { statusBarHeight, navBarHeight, capsuleInsetRight } = useNavMetrics();

/**
 * 返回箭头两副面孔。
 *
 * 压在照片上是白的：照片上白字才认得出，返回键要是蓝的，
 * 在逆光的水面上就变成一个几乎看不见的蓝点。
 * 滚到内容上换成主色：浅灰页面底上白箭头直接消失。
 */
const backIcon = computed(() => icon('chevron-left', props.solid ? 'blue' : 'onAccent'));

/** 分享入口的两副面孔，与返回键同一套逻辑 */
const shareIcon = computed(() => icon('share-2', props.solid ? 'blue' : 'onAccent'));
</script>

<style lang="scss" scoped>
/*
 * 导航栏本体。
 *
 * 高度 = 状态栏 + 导航栏本体，由模板分别绑 statusBarHeight / navBarHeight（px）——
 * 胶囊按钮的高度推出来的，不是写死的数。paddingTop 给状态栏，row 才是导航栏那一行。
 *
 * z-index 30：压在内容层之上、底栏（40）之下 —— 两者都在屏幕上占位，
 * 但底栏在下面，导航栏在上面。
 */
.spot-nav {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 30;
}

/*
 * 材质层。
 *
 * 平时完全透明：这时它背后是头图（或白底插画），铺一块半透明面白等于把它切断。
 * 内容滚上来之后才有必要：一块半透明的面把底下的内容托住，
 * 底下再压一道 1rpx 发丝线 —— iOS 导航栏滚起来之后就是这个结构。
 */
.spot-nav__material {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: $fish-glass-strong;
  box-shadow: inset 0 -1rpx 0 $fish-border-40;
  opacity: 0;
  transition: opacity $fish-dur-base $fish-ease-out;

  /* 这里才值得开模糊：底下真的有内容在滚过去。 */
  @include fish-glass-blur;
}

.spot-nav__material--on {
  opacity: 1;
}

/*
 * 导航栏那一行。
 *
 * position: relative 有两个用处：让这一行压在材质层之上（材质层是绝对定位，
 * 不加定位的话它会盖住整行内容），以及给标题当定位参照。
 */
.spot-nav__row {
  position: relative;
  display: flex;
  align-items: center;
}

/*
 * 返回按钮。
 *
 * 命中区 88rpx 见方（44pt，iOS 判定为可放心点按的最小尺寸），
 * 图标 40rpx 居中 —— 命中区比图标大，点得准；图标比命中区小，按下不糊。
 *
 * 浮在照片上时给它一块半透明深色圆底：深色底 + 白色箭头在什么照片上都读得出，
 * 这是「返回键在照片上」这件事唯一稳的做法。
 *
 * 按下反馈用变暗而不是缩小 —— 缩小会让标题微微位移（见令牌层 _motion.scss 的 fish-press）。
 */
.spot-nav__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  margin-left: 12rpx;
  border-radius: 999rpx;
  transition: background-color $fish-dur-base $fish-ease-out;
  @include fish-press-dim;
}

.spot-nav__back-icon {
  width: 40rpx;
  height: 40rpx;
}

.spot-nav__back--solid {
  background-color: transparent;
}

/*
 * 分享按钮。
 *
 * 与返回键同一套处理：浮在照片上时是白图标配半透明深色圆底，
 * 滚过照片后换成主色图标。
 */
.spot-nav__share {
  position: absolute;
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 999rpx;
  transform: translateY(-50%);
  transition: background-color $fish-dur-base $fish-ease-out;
  @include fish-press-dim;
}

.spot-nav__share--solid {
  background-color: transparent;
}

.spot-nav__share-icon {
  width: 32rpx;
  height: 32rpx;
}

/*
 * 标题的定位框。
 *
 * 左右撑满这一行（整屏宽），把标题按**屏幕中线**摆。
 * pointer-events: none —— 这层铺满整行会盖在返回键上面，
 * 不让它接事件，点击才能落到返回键上（标题是纯文字，本来也不需要交互）。
 */
.spot-nav__title-slot {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

/*
 * 标题。
 *
 * 浮在照片上时是白的，滚过之后换回墨色。两种颜色都要压得住背后的东西，
 * 所以过渡用 $fish-ease-out：颜色切换跟着滚动走，末端缓下来更稳。
 */
.spot-nav__title {
  max-width: 420rpx;
  overflow: hidden;
  color: #ffffff;
  @include fish-type(title3);

  white-space: nowrap;
  text-overflow: ellipsis;
  transition: color $fish-dur-base $fish-ease-out;
}

.spot-nav__title--solid {
  color: $fish-ink;
}
</style>
