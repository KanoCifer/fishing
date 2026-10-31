<template>
  <!--
    某一天的详情 —— 底部抽屉。

    为什么点一天升起抽屉，而不是把那一天就地展开在日历卡里：
    就地展开会把日历卡撑高，格子跟着往下挪，展开的那一天反倒从眼前滑走了；
    而且展开态没有边界，用户不知道点哪儿能收回去。
    抽屉是这一屏唯一的浮层，进来就在最下面、出去也回最下面 ——
    从哪来，回哪去。

    抽屉用项目里已有的 SnapSheet：与钓点分享、资料编辑、AI 建议同一种容器，
    才谈得上「同一个手势、同一种落位」。
  -->
  <SnapSheet :open="open" :fit-content="true" @close="emit('close')">
    <template #header>
      <view class="day-sheet__head">
        <text class="day-sheet__title">{{ title }}</text>
        <text v-if="logs.length" class="day-sheet__count">{{ countText }}</text>
      </view>
    </template>

    <view class="day-sheet__body">
      <!-- 这天有记录 -->
      <view v-if="logs.length" class="day-sheet__list">
        <view v-for="log in logs" :key="log.log_id" class="day-sheet__row" @tap="emit('select', log.log_id)">
          <image v-if="photo(log)" class="day-sheet__thumb" :src="photo(log)" mode="aspectFill" lazy-load />

          <view class="day-sheet__rowbody">
            <RecordCatchList v-if="log.catches.length" :catches="log.catches" />
            <text v-else class="day-sheet__nocatch">{{ noCatchText }}</text>

            <view class="day-sheet__rowmeta">
              <text class="day-sheet__time">{{ time(log) }}</text>
              <text v-if="log.methods.length" class="day-sheet__methods">{{ log.methods.join(' · ') }}</text>
              <text v-if="log.location_name" class="day-sheet__place">{{ log.location_name }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 这天没记录 -->
      <view v-else class="day-sheet__empty">
        <text class="day-sheet__empty-title">{{ emptyTitle }}</text>
        <text class="day-sheet__empty-hint">{{ emptyHint }}</text>
      </view>
    </view>

    <!--
      底部动作：只有今天才给「记一笔」。

      过去某天补不上了（后端只收今天），给一个按不动的按钮不如不给。
    -->
    <template v-if="isToday" #footer>
      <view class="day-sheet__action" @tap="emit('create')">
        <text class="day-sheet__action-text">{{ createLabel }}</text>
      </view>
    </template>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * 某一天的详情抽屉。
 *
 * 内容由页面喂进来：抽屉只管摆，不取数也不改数。
 */
import { computed } from 'vue';

import { mediaUrl } from '@/api/upload';
import { RECORD_CALENDAR, RECORD_CREATE_ENTRY, RECORD_DAY_COUNT, RECORD_DETAIL } from '@/constants/record';
import type { FishingLog } from '@/types/record';
import { formatLocalTimeOfDay } from '@/utils/date';

import RecordCatchList from '../RecordCatchList/RecordCatchList.vue';
import SnapSheet from '../SnapSheet/SnapSheet.vue';

const props = defineProps<{
  /** 抽屉开没开 */
  open: boolean;
  /** 选中那天 `YYYY-MM-DD` */
  date: string;
  /** 那天的记录 */
  logs: FishingLog[];
  /** 今天 `YYYY-MM-DD` */
  today: string;
}>();

const emit = defineEmits<{
  close: [];
  /** 点「记一笔」 */
  create: [];
  /** 点某条记录，看它的详情 */
  select: [id: string];
}>();

const createLabel = RECORD_CREATE_ENTRY;
const noCatchText = RECORD_DETAIL.noCatch;
const emptyTitle = RECORD_CALENDAR.emptyTitle;

/** 标题。「10月30日」 */
const title = computed(() => {
  if (!props.date) return '';
  const [, month, day] = props.date.split('-');
  return `${Number(month)}月${Number(day)}日`;
});

/** 记录条数 */
const countText = computed(() => RECORD_DAY_COUNT(props.logs.length));

/** 选中的是不是今天 */
const isToday = computed(() => props.date === props.today);

/**
 * 空态的提示。
 *
 * 今天 → 「记一笔，今天就算来过了」；
 * 过去某天 → 那天的记录补不上了（只支持记录当天）。
 */
const emptyHint = computed(() => (isToday.value ? RECORD_CALENDAR.emptyToday : RECORD_CALENDAR.emptyPast));

/** 缩略图。没有照片就不占位 */
function photo(log: FishingLog): string {
  return log.images?.length ? mediaUrl(log.images[0]) : '';
}

/** 开始时间 */
function time(log: FishingLog): string {
  return formatLocalTimeOfDay(log.started_at);
}
</script>

<style lang="scss" scoped>
/*
 * 令牌层不用在这里 @use —— uni.scss 已经把 tokens 拼到每个组件前面了。
 */

/*
 * 头部：日期 + 条数。
 *
 * 两条对齐基线：日期是标题，条数是它的注脚。
 */
.day-sheet__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 40rpx 24rpx;
}

.day-sheet__title {
  color: $fish-ink;
  @include fish-type(title3);
}

.day-sheet__count {
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.day-sheet__body {
  padding: 0 40rpx 40rpx;
}

/* 记录行 */
.day-sheet__row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-top: 1rpx solid $fish-border-40;
  @include fish-press-dim;
}

/*
 * 缩略图。
 *
 * 108rpx = 54pt：够看清是张照片，又不至于把一行撑成两行。
 */
.day-sheet__thumb {
  width: 108rpx;
  height: 108rpx;
  flex-shrink: 0;
  margin-right: 20rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

.day-sheet__rowbody {
  flex: 1;
  min-width: 0;
}

/* 这天只有打卡，没有渔获 */
.day-sheet__nocatch {
  color: $fish-muted;
  @include fish-type(callout);
}

/* 时间 · 钓法 · 地点 */
.day-sheet__rowmeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.day-sheet__time {
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.day-sheet__methods {
  margin-left: 16rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.day-sheet__place {
  margin-left: 16rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* 这天什么也没有 */
.day-sheet__empty {
  padding: 40rpx 0 24rpx;
}

.day-sheet__empty-title {
  display: block;
  color: $fish-ink;
  @include fish-type(callout);
}

.day-sheet__empty-hint {
  display: block;
  margin-top: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 「记一笔」。
 *
 * 实心蓝：抽屉里只有这一个动作，它是这一屏唯一能改变数据的地方。
 */
.day-sheet__action {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  margin: 0 40rpx 32rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent;
  @include fish-press(0.97);
}

.day-sheet__action-text {
  color: $fish-on-accent;
  @include fish-type(callout);

  font-weight: 600;
}
</style>
