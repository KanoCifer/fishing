<template>
  <!--
    头图上的标题与总览条。

    为什么标题压在照片上而不是给一条导航栏：
    这一页整块头图就是主语，给它配一条实心导航栏等于把它切成两半 ——
    照片成了装饰，标题成了工具条上的一个词。

    总览条（累计出钓 / 渔获天数 / 当前连续）说的是**全历史**的量，
    服务端算好（见 api/record.ts 的 stats）。它跟着月份翻动而变，
    所以放在头图这块「一眼看完」的地方，而不是散在下面的卡里。

    这一条只报状态，不给动作 —— 「记一笔」在日历里（点某一天，浮层上就是它），
    两件事各在一处说。
  -->
  <view class="band">
    <view class="band__head" :style="{ paddingTop: headTop + 'px' }">
      <text class="band__title">{{ title }}</text>
      <text class="band__subtitle">{{ subtitle }}</text>
    </view>

    <!--
      总览条。半透明白底，压在照片上。
      不加卡片阴影 —— 它是照片上的一块玻璃，不是浮在页面上的东西。
    -->
    <view class="band__stats">
      <view v-for="item in items" :key="item.key" class="band__stat">
        <image class="band__icon" :src="item.icon" mode="aspectFit" />
        <text class="band__label">{{ item.label }}</text>
        <view class="band__value">
          <text class="band__num">{{ item.value }}</text>
          <text class="band__unit">{{ unit }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 头图上的标题与总览条。
 *
 * 数字由外面给：这个组件不取数，也不算连续天数 ——
 * 那是服务端的活（跨月的量前端算不出来）。
 */
import { computed } from 'vue';

import { icon } from '@/constants/icons';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { RECORD_OVERVIEW, RECORD_SUBTITLE, RECORD_TITLE } from '@/constants/record';
import type { FishingLogStats } from '@/types/record';

const props = defineProps<{
  /** 统计。null 表示还没取回来 */
  stats: FishingLogStats | null;
}>();

/**
 * 标题离屏幕顶端的距离（px）。
 *
 * 让开状态栏与微信胶囊所在的那一行 —— 胶囊压在右上角，
 * 标题在左上角，两者只要不撞上就行，但状态栏的时间必须让开。
 *
 * 用运行时量出来的导航栏高度，不用写死的 rpx：
 * 胶囊位置各机型不一样（刘海、灵动岛），写死一个数必有一档机型被压住。
 */
const { navBarBottom } = useNavMetrics();

/** 标题上方再留一点呼吸的余地 */
const headTop = computed(() => navBarBottom + 8);

const title = RECORD_TITLE;
const subtitle = RECORD_SUBTITLE;
const unit = RECORD_OVERVIEW.unit;

const items = computed(() => [
  {
    key: 'trips',
    label: RECORD_OVERVIEW.trips,
    value: props.stats?.checkin_days ?? 0,
    icon: icon('calendar-days', 'onAccent'),
  },
  {
    key: 'catch',
    label: RECORD_OVERVIEW.catch,
    value: props.stats?.catch_days ?? 0,
    icon: icon('fish', 'onAccent'),
  },
  {
    key: 'streak',
    label: RECORD_OVERVIEW.streak,
    value: props.stats?.current_streak ?? 0,
    icon: icon('flame', 'onAccent'),
  },
]);
</script>

<style lang="scss" scoped>
/*
 * 铺满头图的一块浮层。
 *
 * 标题在下缘、总览条也在下缘 —— 所以这层自己撑不满高度，
 * 上下两段各靠一头：标题贴顶，总览条贴底。
 */
.band {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 32rpx 28rpx;
  pointer-events: none;
}

/*
 * 标题与副标。
 *
 * 上边距由脚本给（见 headTop）：状态栏 + 导航栏本体那一行，
 * 头图从屏幕顶端起，标题压在时间底下会被盖住。
 */
.band__head {
  padding-right: 200rpx;
}

.band__title {
  display: block;
  color: $fish-on-dark;
  @include fish-type(display);

  font-weight: 700;
  text-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.28);
}

.band__subtitle {
  display: block;
  margin-top: 8rpx;
  color: rgba(255, 255, 255, 0.86);
  @include fish-type(body);
}

/*
 * 总览条。
 *
 * 一块半透明的**深色**面：三个数压在一行上，中间用发丝线分开。
 * 不用三张卡 —— 三个数是同一件事的三个切面，拆成三张卡会读成三个并列的结论。
 *
 * 为什么是深色而不是浅色：白面压在照片上等于给照片开了个天窗，
 * 而这一块要读的是数字 —— 深底白字对比度稳，与头图下缘那一带的光线无关。
 */
.band__stats {
  display: flex;
  padding: 20rpx 8rpx;
  border-radius: $fish-radius-mid;
  background-color: rgba(13, 28, 44, 0.2);
  backdrop-filter: blur(2px) saturate(1.8);
  -webkit-backdrop-filter: blur(2px) saturate(1.8);
  box-shadow: 1px 1px rgba(250, 250, 250, 0.9) -1px -1px rgba(250, 250, 250, 0.8);
}

.band__stat {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

/* 分隔线。用左边框画在第二、三格上，最后一格没有线 */
.band__stat + .band__stat {
  border-left: 1rpx solid rgba(255, 255, 255, 0.28);
}

.band__icon {
  width: 32rpx;
  height: 32rpx;
}

/* 标签。照片上最弱的一档 */
.band__label {
  margin-top: 6rpx;
  color: rgba(255, 255, 255, 0.78);
  @include fish-type(caption);
}

/* 数字与单位并排。单位是注脚 */
.band__value {
  display: flex;
  align-items: baseline;
  margin-top: 2rpx;
}

.band__num {
  color: $fish-on-dark;
  @include fish-type(title);

  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.band__unit {
  margin-left: 4rpx;
  color: rgba(255, 255, 255, 0.82);
  @include fish-type(caption);
}
</style>
