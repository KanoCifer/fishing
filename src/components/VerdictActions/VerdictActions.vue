<template>
  <view class="verdict-actions">
    <view class="verdict-actions__row" :style="enterStyle(1, showAnim)">
      <view class="verdict-actions__btn" @tap="emit('feedback')">
        <image class="verdict-actions__icon" :src="messageIcon" mode="widthFix" />
        <text class="verdict-actions__btn-text">反馈今日鱼口</text>
        <image class="verdict-actions__chevron" :src="chevronIcon" mode="widthFix" />
      </view>

      <view class="verdict-actions__btn" @tap="emit('analysis')">
        <image class="verdict-actions__icon" :src="sparklesIcon" mode="widthFix" />
        <text class="verdict-actions__btn-text">渔碌建议</text>
        <image class="verdict-actions__chevron" :src="chevronIcon" mode="widthFix" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { icon } from '@/constants/icons';
import { useFishingMapStore } from '@/stores/fishingMap';
import { enterStyle } from '@/utils/motion';

const props = withDefaults(defineProps<{ showAnim?: boolean }>(), { showAnim: true });

const emit = defineEmits<{
  /** 去反馈今日鱼口 */
  feedback: [];
  /** 打开渔碌建议 */
  analysis: [];
}>();

const messageIcon = icon('message-square', 'blue');
const sparklesIcon = icon('sparkles', 'blue600');
const chevronIcon = icon('chevron-right', 'muted60');
</script>

<style lang="scss" scoped>
.verdict-actions {
  display: flex;
  flex-direction: column;
}

/* ── 动作 ──────────────────────────────────────────────────────────────── */

.verdict-actions__row {
  display: flex;
  align-items: center;
  @include fish-enter;
}

/*
 * 两枚药丸同一档：都是玻璃面、同样宽、同样 88rpx 高。
 *
 * 88rpx = 44pt，正好是 Apple 判定为「可放心点按」的最小命中尺寸。
 * 反馈在手指落下的那一帧就给出（fish-press），抬手回弹用满 260ms ——
 * 两段时长一短一长，是 iOS 按压手感的关键，缺一段立刻变塑料。
 *
 * 材质是「浮在背景上的一层玻璃」而不是一块实色：
 * 半透明白 + 顶边高光 + 一圈发丝描边。mp-weixin 不保证 backdrop-filter，
 * 所以模糊是加分项，半透明底和描边才是这层材质的地基。
 */
.verdict-actions__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  padding: 0 24rpx;
  @include fish-glass($fish-radius-pill);
  @include fish-glass-blur;

  /* 描边：一圈白色发丝，是玻璃的轮廓线，没有它半透明底会糊进背景 */
  border: 1rpx solid rgba(255, 255, 255, 0.92);

  /*
   * 厚度。玻璃面压在浅底上，一层近乎不可见的影就够；
   * 顶边那道白高光是玻璃的光源方向，跟整块面的朝向一致。
   */
  box-shadow:
    0 10rpx 30rpx rgba(12, 40, 90, 0.1),
    inset 0 1rpx 0 rgba(255, 255, 255, 1),
    inset 0 -1rpx 0 rgba(255, 255, 255, 0.35);

  @include fish-press(0.97);
}

/* 两枚药丸之间用 margin 而不是 gap —— WXSS 不保证支持 flex gap */
.verdict-actions__btn + .verdict-actions__btn {
  margin-left: 16rpx;
}

.verdict-actions__icon {
  width: 34rpx;
  height: 34rpx;
  margin-right: 12rpx;
  flex-shrink: 0;
}

/* 箭头：说的是「点进去还有一层」，所以它不跟图标挤在一起，钉在最右 */
.verdict-actions__chevron {
  width: 26rpx;
  height: 26rpx;
  margin-left: 12rpx;
  flex-shrink: 0;
}

/* 药丸底是浅的，字一律深墨 —— 白字压在白玻璃上读不出来 */
.verdict-actions__btn-text {
  color: $fish-ink;
  @include fish-type(body, 600);
}
</style>
