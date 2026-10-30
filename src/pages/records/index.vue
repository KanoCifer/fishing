<template>
  <!--
    钓鱼记录页 —— tabBar 的第三页。

    这一页回答三件事，按顺序从上到下：**我钓了多少**（四个数）、
    **哪天钓的**（月历）、**那天具体记了什么**（当天的记录）。

    为什么先给数再给日历：数字是结论，日历是索引。
    先看到「连着 12 天」的人，才会去翻日历找是哪几天 ——
    反过来先给一整屏格子，数字就埋在下面没人看。

    为什么「记一笔」排在日历下面而不是浮在角上：这一页要记的东西很轻
    （当天去了、钓到啥），浮层按钮会把它变成一个需要「打开」的功能；
    而日历下面那个按钮就在视线落到的位置，点一下就是新建页。
  -->
  <view class="records" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <view class="records__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!--
        会话还在恢复。这段期间不该显示成「未登录」——
        小程序冷启动时 store 是空的，但 Storage 里还留着上一轮的 token。
      -->
      <view v-if="!ready" class="records__notice">
        <text class="records__notice-text">{{ loadingText }}</text>
      </view>

      <!--
        未登录。
        记录要绑定用户，没有「游客记录」这回事 —— 所以给一条登录的出路，
        而不是给一个空日历（那会让人以为记录丢了）。
      -->
      <view v-else-if="!session.loggedIn" class="records__empty">
        <text class="records__empty-title">{{ login.title }}</text>
        <text class="records__empty-hint">{{ login.hint }}</text>
        <view class="records__empty-action" @tap="onLogin">
          <text class="records__empty-action-text">{{ login.action }}</text>
        </view>
      </view>

      <template v-else>
        <!-- 统计 -->
        <view class="sect">
          <view class="sect__card records__stats">
            <RecordStats :stats="logStore.stats" />
          </view>
        </view>

        <!-- 日历 -->
        <view class="sect">
          <view class="sect__card records__calendar">
            <RecordCalendar
              :month="logStore.month"
              :day-states="logStore.dayStates"
              :photo-days="photoDays"
              :today="today"
              :is-current-month="isCurrentMonth"
              @select="onSelect"
              @shift="onShift"
            />

            <view class="records__create" @tap="openCreate">
              <image class="records__create-icon" :src="createIcon" mode="aspectFit" />
              <text class="records__create-text">{{ createLabel }}</text>
            </view>
          </view>
        </view>

        <!-- 选中的那天 -->
        <view class="sect">
          <view class="sect__card records__day">
            <view class="records__day-head">
              <text class="records__day-title">{{ selectedTitle }}</text>
              <text v-if="selectedLogs.length" class="records__day-count">{{ dayCount }}</text>
            </view>

            <!-- 这天有记录 -->
            <view v-if="selectedLogs.length" class="records__list">
              <view v-for="log in selectedLogs" :key="log.log_id" class="records__row" @tap="openDetail(log.log_id)">
                <image
                  v-if="log.images.length"
                  class="records__thumb"
                  :src="mediaUrl(log.images[0])"
                  mode="aspectFill"
                  lazy-load
                />

                <view class="records__row-body">
                  <RecordCatchList v-if="log.catches.length" :catches="log.catches" />
                  <text v-else class="records__row-nocatch">{{ noCatchText }}</text>

                  <view class="records__row-meta">
                    <text class="records__row-time">{{ logTime(log.started_at) }}</text>
                    <text v-if="log.methods.length" class="records__row-methods">
                      {{ log.methods.join(' · ') }}
                    </text>
                  </view>
                </view>
              </view>
            </view>

            <!-- 这天没记录 -->
            <view v-else class="records__day-empty">
              <text class="records__day-empty-text">{{ emptyText }}</text>
              <text class="records__day-empty-hint">{{ emptyHint }}</text>
            </view>
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 钓鱼记录页。
 *
 * 取数在 store（`stores/fishingLog`），这一层只负责编排：
 * 把月份切好、把选中的那天摆出来、把结果讲给用户听。
 *
 * ⚠️ 这一页只支持记录**今天**（后端也只收今天）。
 * 所以「记一笔」永远是记今天 —— 日历里翻到过去的某天，
 * 那一段只读，不能补记。翻到未来也没用，未来没到。
 */
import { computed, ref } from 'vue';
import { onPageShow } from '@dcloudio/uni-app';

import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import RecordCalendar from '@/components/RecordCalendar/RecordCalendar.vue';
import RecordCatchList from '@/components/RecordCatchList/RecordCatchList.vue';
import RecordStats from '@/components/RecordStats/RecordStats.vue';
import { mediaUrl } from '@/api/upload';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { icon } from '@/constants/icons';
import {
  RECORD_CALENDAR,
  RECORD_CREATE_ENTRY,
  RECORD_DAY_COUNT,
  RECORD_DETAIL,
  RECORD_LOGIN_REQUIRED,
} from '@/constants/record';
import { loginErrorMessage } from '@/api/auth';
import { useFishingLogStore } from '@/stores/fishingLog';
import { useSessionStore } from '@/stores/session';
import { formatLocalTimeOfDay, logDateKey, logMonthKey } from '@/utils/date';

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const session = useSessionStore();
const logStore = useFishingLogStore();

const login = RECORD_LOGIN_REQUIRED;
const createLabel = RECORD_CREATE_ENTRY;
const noCatchText = RECORD_DETAIL.noCatch;
const emptyText = RECORD_CALENDAR.emptyTitle;
const loadingText = '加载中';

const createIcon = icon('plus', 'onAccent');

/** 会话恢复完了没有 */
const ready = ref(false);

/** 选中的那天。默认今天 */
const selected = ref(logDateKey());

/** 今天 */
const today = computed(() => logDateKey());

/** 当前显示的月份是不是本月 */
const isCurrentMonth = computed(() => logStore.month === logMonthKey());

/** 有照片的那些天。给日历画角标用 */
const photoDays = computed(() => {
  const days: string[] = [];
  for (const log of logStore.logs) {
    if (log.images?.length) days.push(log.log_date);
  }
  return days;
});

/** 选中那天的记录 */
const selectedLogs = computed(() => logStore.dayLogs(selected.value));

/** 选中那天的记录数 */
const dayCount = computed(() => RECORD_DAY_COUNT(selectedLogs.value.length));

/**
 * 空态的提示。
 *
 * 选中的就是今天 → 「记一笔，今天就算来过了」；
 * 选中的是过去某天 → 那天的记录补不上了（只支持记当天）。
 */
const emptyHint = computed(() =>
  selected.value === today.value ? RECORD_CALENDAR.emptyToday : RECORD_CALENDAR.emptyPast,
);

/** 选中那天的标题。「10月30日」 */
const selectedTitle = computed(() => {
  const [, month, day] = selected.value.split('-');
  return `${Number(month)}月${Number(day)}日`;
});

/* ── 取数 ──────────────────────────────────────────────────────────────── */

/**
 * 进页面。
 *
 * 先恢复会话再取数：token 是从 Storage 异步读进内存的，
 * 冷启动时还没读进来就发请求，必然 401。
 */
onPageShow(async () => {
  await session.restore();
  ready.value = true;

  if (!session.loggedIn) {
    logStore.clear();
    return;
  }

  await logStore.refresh();
});

/* ── 交互 ──────────────────────────────────────────────────────────────── */

/** 选了一天 */
function onSelect(date: string): void {
  selected.value = date;
}

/**
 * 翻月。
 *
 * 翻到过去的月份照样取数 —— 过去的记录是存在的，用户想回看。
 * 往后翻只在「已经是本月」时允许：未来没有记录，翻过去是一片空白。
 */
async function onShift(delta: number): Promise<void> {
  const next = shiftMonth(logStore.month, delta);
  if (next > logMonthKey()) return;

  await logStore.switchMonth(next);
}

/** 翻一个月。加一就跨年 */
function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon - 1 + delta, 1);
  return logMonthKey(date);
}

/** 记一笔 —— 永远是记今天 */
function openCreate(): void {
  uni.navigateTo({ url: '/pages/record/create/index' });
}

/** 看一条记录的详情 */
function openDetail(id: string): void {
  uni.navigateTo({ url: `/pages/record/detail/index?id=${id}` });
}

/** 微信登录 */
async function onLogin(): Promise<void> {
  try {
    await session.login();
    await logStore.refresh();
  } catch (err) {
    uni.showToast({ title: loginErrorMessage(err), icon: 'none' });
  }
}

/** 一条记录的开始时间 */
function logTime(value: string): string {
  return formatLocalTimeOfDay(value);
}
</script>

<style lang="scss" scoped>
/*
 * 载入提示。
 *
 * 这一页要取会话 + 两个月的数据，恢复期间得有个交代 ——
 * 空着会读成「这天没有记录」。
 */
.records__notice {
  padding: 96rpx 32rpx;
  text-align: center;
}

.records__notice-text {
  color: $fish-muted;
  @include fish-type(callout);
}

/*
 * 未登录时的空态。
 *
 * 不是一张卡，是居中的一段话 —— 空态不是内容，硬套一张卡反而像坏了。
 * 与钓点反馈页的空态同一套。
 */
.records__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 48rpx;
  text-align: center;
}

.records__empty-title {
  color: $fish-ink;
  @include fish-type(title3);
}

.records__empty-hint {
  margin-top: 12rpx;
  color: $fish-muted;
  @include fish-type(callout);
}

/* 空态里的那个按钮 */
.records__empty-action {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 200rpx;
  min-height: 80rpx;
  margin-top: 40rpx;
  padding: 0 40rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent;
  @include fish-press(0.97);
}

.records__empty-action-text {
  color: $fish-on-accent;
  @include fish-type(callout);

  font-weight: 600;
}

/*
 * 一个分区。
 *
 * 缩进、卡间距走令牌层 _layout.scss 的 fish-section ——
 * 与数据页、我的页是同一条规则，三页的分块节奏因此一致。
 */
.sect {
  @include fish-section;
}

/* 统计卡 */
.records__stats {
  @include fish-card;
}

/* 日历卡 */
.records__calendar {
  @include fish-card;
}

/*
 * 「记一笔」。
 *
 * 放在日历下面而不是浮在角上：这一页要记的东西很轻，
 * 浮层按钮会把它变成一个需要「打开」的功能。
 *
 * 整条是按钮的样子（实心蓝），因为它是这一页唯一的主动作。
 */
.records__create {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  margin-top: 24rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent;
  @include fish-press(0.97);
}

.records__create-icon {
  width: 28rpx;
  height: 28rpx;
  margin-right: 10rpx;
}

.records__create-text {
  color: $fish-on-accent;
  @include fish-type(callout);

  font-weight: 600;
}

/* 当天那一张卡 */
.records__day {
  @include fish-card;
}

/*
 * 标题行：左边是日期，右边是条数。
 *
 * 两条都贴在基线上 —— 日期是标题，条数是它的注脚。
 */
.records__day-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.records__day-title {
  color: $fish-ink;
  @include fish-type(title3);

  font-weight: 600;
}

.records__day-count {
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* 记录行 */
.records__row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-top: 1rpx solid $fish-border-40;
  @include fish-press-dim;
}

/*
 * 缩略图。
 *
 * 81×81（9pt 的三倍）—— 够看清是张照片，又不至于把一行撑成两行。
 * 没有照片就不占位：空出来一个空框比没有更难看。
 */
.records__thumb {
  width: 108rpx;
  height: 108rpx;
  margin-right: 20rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

.records__row-body {
  flex: 1;
  min-width: 0;
}

/* 渔获下面那行：时间与钓法 */
.records__row-meta {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}

.records__row-time {
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.records__row-methods {
  margin-left: 16rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* 这天没有渔获（只有打卡） */
.records__row-nocatch {
  color: $fish-muted;
  @include fish-type(callout);
}

/* 这天什么也没有 */
.records__day-empty {
  padding: 40rpx 0 32rpx;
}

.records__day-empty-text {
  display: block;
  color: $fish-ink;
  @include fish-type(callout);
}

.records__day-empty-hint {
  display: block;
  margin-top: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}
</style>
