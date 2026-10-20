<template>
  <!--
    子页导航栏 —— 返回按钮 + 标题。

    为什么不用原生导航栏：项目里每个页面都配了 navigationStyle: "custom"，
    导航栏是浮在内容之上的透明层，页面底的环境色渐层一路铺到屏幕顶端。
    换回原生导航栏，那层渐层会被一块不透明的纯色切断 —— 推上去的一瞬间
    底色突变，比少一个原生返回手势难看得多。

    代价是原生的侧滑返回手势没了，所以这个返回按钮必须自己做出来，
    而且必须一直留在手边：它是这一屏唯一能离开的动作。

    为什么浮在视口上而不跟着内容滚走：这一页滚起来之后，顶部那行留白里
    就只剩按钮和标题了。返回键滚没了，用户想走只能去底部找 —— 而底部没有出口。

    顶部那层材质是**滚到才显形**的：页面刚进来时导航栏背后是空的（只有渐层），
    铺一块半透明面白反而把渐层切断了；等内容滚到它底下，才需要一块面把内容托住，
    让按钮和标题读得清。
  -->
  <view class="page-nav" :class="{ 'page-nav--scrolled': scrolled }" :style="{ paddingTop: statusBarHeight + 'px' }">
    <!-- 材质层。内容滚到导航栏底下才显形，那时它背后有东西，得有块面托住 -->
    <view class="page-nav__material" />

    <view class="page-nav__row" :style="{ height: navBarHeight + 'px' }">
      <view class="page-nav__back" @tap="onBack">
        <image class="page-nav__back-icon" :src="backIcon" mode="aspectFit" />
      </view>

      <!--
        标题居中于**屏幕**。
        不是居中于「返回键到胶囊」那一段 —— 那段两端不一样长，
        居中于它的标题看着是歪的（偏左半个返回键的宽度）。
      -->
      <view class="page-nav__title-slot">
        <text class="page-nav__title" :style="{ maxWidth: titleMaxWidth + 'px' }">{{ title }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * PageNav —— 二级页面的导航栏。
 *
 * 只负责「返回」和「标题」两件事：高度从胶囊按钮推算，标题居中于屏幕、
 * 又不让它钻到右上角那颗胶囊底下。页面自己决定标题写什么，
 * 返回时回到哪里由页面决定（fallbackUrl）。
 */
import { icon } from '@/constants/icons';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';

const props = withDefaults(
  defineProps<{
    /** 标题 */
    title: string;
    /** 内容是否已滚到导航栏底下。材质层靠它显形，页面按滚动位置给 */
    scrolled?: boolean;
    /** 页面栈里没有上一页时退回哪里（tab 页） */
    fallbackUrl?: string;
  }>(),
  {
    scrolled: false,
    fallbackUrl: '/pages/mine/index',
  },
);

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { statusBarHeight, navBarHeight, capsuleInsetRight } = useNavMetrics();

/** 屏宽（px），用来算标题能占多宽 */
const { windowWidth } = useViewport();

/**
 * 标题能占多宽（px）。
 *
 * 标题居中于屏幕中线 —— 但胶囊占着右上角，标题太宽就会钻到它下面去。
 * 上限取「屏幕中线到胶囊左边缘」的两倍：正好卡在胶囊前面，
 * 再宽就收窄并截断（留 120px 兜底，别让极窄机型上标题被压没）。
 */
const titleMaxWidth = Math.max(120, windowWidth - 2 * capsuleInsetRight);

/** 返回箭头用主色：它是这一屏唯一能离开的动作，得一眼看得见 */
const backIcon = icon('chevron-left', 'blue');

/**
 * 返回上一页。
 *
 * 页面栈里只有这一页时（分享链接直接打开、开发者工具预览），没有上一页可退，
 * navigateBack 会失败。这时候退回 tabBar，而不是让按钮点了没反应。
 */
function onBack() {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.switchTab({ url: props.fallbackUrl });
    },
  });
}
</script>

<style lang="scss" scoped>
/*
 * 导航栏本体。
 *
 * 高度 = 状态栏 + 导航栏本体，由模板分别绑 statusBarHeight / navBarHeight（px）——
 * 胶囊按钮的高度推出来的，不是写死的数。paddingTop 给状态栏，row 才是导航栏那一行。
 *
 * z-index 20：压在页面内容层（1）之上、抽屉（200）之下。
 */
.page-nav {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
}

/*
 * 材质层。
 *
 * 平时完全透明：这时它背后只有环境色渐层，铺一块半透明面白等于把渐层从中间切断，
 * 页面一进来顶部就多出一道横杠。
 *
 * 内容滚上来之后才有必要：一块半透明的面把底下的内容托住（不能叠两层浅色玻璃，
 * 字会糊），底下再压一道 1rpx 发丝线 —— iOS 导航栏滚起来之后就是这个结构。
 *
 * 模糊只在这一层开：它背后真的有内容在滚过去，模糊它才买得到东西；
 * 页面顶上一片空的时候不需要模糊（见 uni.scss 的 fish-glass-blur）。
 */
.page-nav__material {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: $fish-glass-strong;
  box-shadow: inset 0 -1rpx 0 $fish-border-40;
  opacity: 0;
  transition: opacity $fish-dur-base $fish-ease-out;
  @include fish-glass-blur;
}

.page-nav--scrolled .page-nav__material {
  opacity: 1;
}

/*
 * 导航栏那一行。
 *
 * position: relative 有两个用处：让这一行压在材质层之上（材质层是绝对定位，
 * 不加定位的话它会盖住整行内容），以及给标题当定位参照。
 */
.page-nav__row {
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
 * 按下反馈用变暗而不是缩小：缩小会让标题微微位移（见 uni.scss 的 fish-press）。
 */
.page-nav__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  @include fish-press-dim;
}

.page-nav__back-icon {
  width: 40rpx;
  height: 40rpx;
}

/*
 * 标题的定位框。
 *
 * 左右撑满这一行（整屏宽），把标题按**屏幕中线**摆。
 * 走 flex 居中是不行的：这一行左边是返回键、右边是胶囊，
 * 两端不一样长，居中于剩下的那段只会把标题推偏半个返回键的宽度。
 *
 * pointer-events: none —— 这层铺满整行，会盖在返回键上面；
 * 不让它接事件，点击才能落到返回键上（标题是纯文字，本来也不需要交互）。
 */
.page-nav__title-slot {
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
 * 宽度上限由脚本给：居中于屏幕中线不代表可以无限宽，
 * 太宽就会钻到右上角那颗胶囊下面去（见 titleMaxWidth）。
 */
.page-nav__title {
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(headline);

  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
