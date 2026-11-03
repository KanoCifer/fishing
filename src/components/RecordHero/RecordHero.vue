<template>
  <!--
    头图 —— 最近一次出行的照片。

    为什么是照片当主角：一次出行最值得回看的往往就是那张照片，
    而它在原来的版式里只能当一个 54pt 的小方块。把它放大到满幅，
    这一页第一眼给的是「上次钓到了什么」，而不是一屏要人先去选日期的格子。

    这一版头图上**不再摆字**：标题与总览条由 RecordHeroBand 压在上面，
    出行本身的日期、地点、渔获交给下面的行程卡 —— 同一件事说两遍，
    等于一次都没说。

    没有照片时摆空态插画（`spots.jpg`），不摆一张别处的照片 ——
    拿旧照片冒充这次出行是撒谎，而插画说的是「这次没留照片」。

    插画按 Fill 铺满整块：它跟照片占的是同一块面，
    铺一半会让这一屏读成「照片加载到一半」。

    文字压在图上，所以图上还要压一层从上到下的暗渐变：
    逆光的水面能把白字吃掉，这层渐变是给底下那块面保证一个下限对比度。
    插画那一档也压 —— 它上半截是白天空，不压的话白字浮在上面找不着。
  -->
  <view class="hero" :class="{ 'hero--placeholder': !photo }">
    <image v-if="photo" class="hero__img" :src="photo" mode="aspectFill" />
    <image v-else class="hero__img" :src="emptyImage" mode="aspectFill" />

    <!-- 压暗。只压照片那半边，渐变下面是页面底色 -->
    <view class="hero__scrim" />

    <!-- 这个月一条记录都没有 -->
    <view v-if="!log" class="hero__empty">
      <text class="hero__empty-text">{{ emptyText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 头图组件。
 *
 * 只管摆：哪一张照片。挑哪一条记录是页面的事 —— 组件拿到什么就摆什么。
 */
import { computed } from 'vue';

import { mediaUrl } from '@/api/upload';
import { RECORD_EMPTY_IMAGE, RECORD_HERO } from '@/constants/record';
import type { FishingLog } from '@/types/record';

const props = defineProps<{
  /** 头图那条记录。null 表示这个月还没有记录 */
  log: FishingLog | null;
}>();

const emptyText = RECORD_HERO.emptyMonth;

/** 空态插画 */
const emptyImage = RECORD_EMPTY_IMAGE;

/** 头图那张照片 */
const photo = computed(() => {
  const images = props.log?.images;
  return images && images.length ? mediaUrl(images[0]) : '';
});
</script>

<style lang="scss" scoped>
/*
 * 令牌层不用在这里 @use —— uni.scss 已经把 tokens 拼到每个组件前面了
 * （见 src/uni.scss 的说明）。
 */

/*
 * 满幅头图。
 *
 * 560rpx = 280pt。上面要放标题与总览条，下面留给照片本身 ——
 * 472rpx 那版放不下标题，副标只能压在日期那一行上，挤成一团。
 */
.hero {
  position: relative;
  height: 560rpx;
  overflow: hidden;
}

/* 照片。铺满并按短边裁切 */
.hero__img {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/*
 * 没有照片时的兜底面。
 *
 * 冷灰蓝底 —— 比插画的白底深一档，插画才「坐」在上面而不是浮在同色里。
 * 这一档是令牌层给钓点头图缺图时定好的，同一张脸不该两种页面两个色。
 * 插画铺满之后它基本看不见，只在图还没加载出来的那一瞬顶一下。
 */
.hero--placeholder {
  background-color: $fish-photo-placeholder;
}

/*
 * 压暗。
 *
 * 上半段一点点（顶上的字更靠上）、下半段重一点（底下的字压着照片），
 * 两头都不能省：只压下半段的话，中间的地点名会浮在亮水面上读不清。
 *
 * 下半段压得更重（78% 起就到 0.62）：文字全落在那一段里，
 * 而这一段可能是亮天空、也可能是亮水面 —— 压不够，白字就浮在上面读不清。
 */
.hero__scrim {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-image: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.45) 0%,
    rgba(0, 0, 0, 0.12) 30%,
    rgba(0, 0, 0, 0.34) 62%,
    rgba(0, 0, 0, 0.66) 100%
  );
}

/*
 * 这个月没有记录时的兜底。
 *
 * 往上让开总览条 —— 总览条压在头图下缘，两者不能叠在一起。
 */
.hero__empty {
  position: absolute;
  right: 0;
  bottom: 230rpx;
  left: 0;
  display: flex;
  justify-content: center;
}

.hero__empty-text {
  color: $fish-on-dark;
  @include fish-type(title);
}
</style>
