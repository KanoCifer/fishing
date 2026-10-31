<template>
  <!--
    头图 —— 最近一次出行。

    为什么是照片当主角：一次出行最值得回看的往往就是那张照片，
    而它在原来的版式里只能当一个 54pt 的小方块。把它放大到满幅，
    这一页第一眼给的是「上次钓到了什么」，而不是一屏要人先去选日期的格子。

    没有照片时摆空态插画（`spots.jpg`），不摆一张别处的照片 ——
    拿旧照片冒充这次出行是撒谎，而插画说的是「这次没留照片」。

    插画按 Fill 铺满整块：它跟照片占的是同一块面，
    铺一半会让这一屏读成「照片加载到一半」。

    文字压在图上，所以图上还要压一层从上到下的暗渐变：
    逆光的水面能把白字吃掉，这层渐变是给底下那块面保证一个下限对比度。
    插画那一档也压 —— 它上半截是白天空，不压的话白字浮在上面找不着。
  -->
  <view class="hero" :class="{ 'hero--placeholder': !photo }" @tap="onTap">
    <image v-if="photo" class="hero__img" :src="photo" mode="aspectFill" />
    <image v-else class="hero__img" :src="emptyImage" mode="aspectFill" />

    <!-- 压暗。只压照片那半边，渐变下面是页面底色 -->
    <view class="hero__scrim" />

    <view v-if="log" class="hero__body">
      <text class="hero__date">{{ dateText }}</text>
      <text class="hero__place">{{ place }}</text>

      <!-- 渔获与钓法。一行放不下就截断 -->
      <view v-if="chips.length" class="hero__chips">
        <text v-for="(chip, index) in chips" :key="index" class="hero__chip">{{ chip }}</text>
      </view>
    </view>

    <!-- 这个月一条记录都没有 -->
    <view v-else class="hero__empty">
      <text class="hero__empty-text">{{ emptyText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 头图组件。
 *
 * 只管摆：哪一条记录、哪一张照片、几个字。
 * 挑哪一条是页面的事 —— 组件拿到什么就摆什么。
 */
import { computed } from 'vue';

import { mediaUrl } from '@/api/upload';
import { RECORD_EMPTY_IMAGE, RECORD_HERO, RECORD_NO_PLACE } from '@/constants/record';
import type { FishingLog } from '@/types/record';
import { formatLocalTimeOfDay } from '@/utils/date';

const props = defineProps<{
  /** 头图那条记录。null 表示这个月还没有记录 */
  log: FishingLog | null;
  /** 今天 `YYYY-MM-DD` */
  today: string;
}>();

const emit = defineEmits<{
  /** 点头图看这条记录的详情 */
  select: [id: string];
}>();

const emptyText = RECORD_HERO.emptyMonth;

/** 空态插画 */
const emptyImage = RECORD_EMPTY_IMAGE;

/** 头图那张照片 */
const photo = computed(() => {
  const images = props.log?.images;
  return images && images.length ? mediaUrl(images[0]) : '';
});

/**
 * 日期行：「10月30日 · 今天 · 05:30」。
 *
 * 三段各回答一件事：哪一天、是不是今天、几点下的竿。
 * 「今天」只在真是今天时出现 —— 平时那两个字是废话，
 * 而今天是唯一值得单独标出来的那天（今天还能补记）。
 */
const dateText = computed(() => {
  const log = props.log;
  if (!log) return '';

  const [, month, day] = log.log_date.split('-');
  const parts = [`${Number(month)}月${Number(day)}日`];

  if (log.log_date === props.today) parts.push('今天');

  const time = formatLocalTimeOfDay(log.started_at);
  if (time) parts.push(time);

  return parts.join(' · ');
});

/** 地点。没记地点就说没记，不拿钓点名凑数 */
const place = computed(() => props.log?.location_name || RECORD_NO_PLACE);

/**
 * 渔获与钓法做成一枚枚胶囊。
 *
 * 渔获在前：钓到了什么比用什么钓重要。
 * 只留前四个 —— 头图上摊开一串胶囊会盖住照片，而照片才是这一块的主体。
 */
const chips = computed(() => {
  const log = props.log;
  if (!log) return [];

  const catches = log.catches.map((item) => `${item.species} ×${item.quantity}`);
  return [...catches, ...log.methods].slice(0, 4);
});

function onTap(): void {
  if (!props.log) return;
  emit('select', props.log.log_id);
}
</script>

<style lang="scss" scoped>
/*
 * 令牌层不用在这里 @use —— uni.scss 已经把 tokens 拼到每个组件前面了
 * （见 src/uni.scss 的说明）。
 */

/*
 * 满幅头图。
 *
 * 472rpx = 236pt。高于这个数，日历卡就被推到首屏之外了；
 * 低于这个数，照片不够撑起「主角」这件事。
 */
.hero {
  position: relative;
  height: 472rpx;
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
    rgba(0, 0, 0, 0.42) 0%,
    rgba(0, 0, 0, 0) 38%,
    rgba(0, 0, 0, 0.62) 78%,
    rgba(0, 0, 0, 0.72) 100%
  );
}

/* 文字块。贴着底边 */
.hero__body {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 0 36rpx 32rpx;
}

/* 日期行。照片上最弱的一档 */
.hero__date {
  display: block;
  color: $fish-on-dark;
  @include fish-type(caption);
}

/* 地点。头图上最大的字 */
.hero__place {
  display: block;
  margin-top: 6rpx;
  color: $fish-on-dark;
  @include fish-type(title2);

  font-weight: 700;
}

.hero__chips {
  display: flex;
  flex-wrap: wrap;
  margin-top: 18rpx;
}

/*
 * 胶囊。
 *
 * 半透明白底：压在照片上要能读清，又不能盖成一块实色。
 */
.hero__chip {
  margin-right: 12rpx;
  margin-bottom: 6rpx;
  padding: 6rpx 18rpx;
  border-radius: $fish-radius-pill;
  background-color: rgba(255, 255, 255, 0.22);
  color: $fish-on-dark;
  @include fish-type(caption2);
}

/* 这个月没有记录时的兜底 */
.hero__empty {
  position: absolute;
  right: 0;
  bottom: 32rpx;
  left: 0;
  display: flex;
  justify-content: center;
}

.hero__empty-text {
  color: $fish-on-dark;
  @include fish-type(title3);
}
</style>
