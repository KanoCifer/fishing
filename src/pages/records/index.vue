<template>
  <view class="records" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <!--
      正文从屏幕最顶端开始排：头图一路顶进状态栏和导航栏底下。

      页面配了 navigationStyle: "custom"，导航栏是浮在内容之上的透明层 ——
      头图从顶端起，状态栏那行字就压在照片上（照片顶部压了一道 42% 的暗渐变，
      白字读得清）。这是这一页唯一的主视觉，让它从屏幕顶端开始比让出
      一条导航栏更像一张照片。
    -->
    <view class="records__body">
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
        <image class="records__empty-img" :src="emptyImage" mode="aspectFit" />
        <text class="records__empty-title">{{ login.title }}</text>
        <text class="records__empty-hint">{{ login.hint }}</text>
        <view class="records__empty-action" @tap="onLogin">
          <text class="records__empty-action-text">{{ login.action }}</text>
        </view>
      </view>

      <template v-else>
        <!-- 头图：最近一次出行 -->
        <view class="records__hero">
          <RecordHero :log="heroLog" :today="today" @select="openDetail" />
        </view>

        <!--
          日历卡。

          卡里只放两样东西：格子，和格子颜色各代表什么的说明。
          翻月在卡里完成 —— 日历是这一页的索引，索引的操作就该在索引上。
        -->
        <view class="records__cal">
          <RecordCalendar
            :month="logStore.month"
            :day-states="logStore.dayStates"
            :photo-days="photoDays"
            :today="today"
            :is-current-month="isCurrentMonth"
            @select="onSelect"
            @shift="onShift"
          />

          <view class="records__legend">
            <view class="records__legend-item">
              <view class="records__swatch records__swatch--catch" />
              <text class="records__legend-text">{{ legend.catch }}</text>
            </view>
            <view class="records__legend-item">
              <view class="records__swatch records__swatch--checkin" />
              <text class="records__legend-text">{{ legend.checkin }}</text>
            </view>
          </view>
        </view>

        <!-- 四个数。注脚 -->
        <view class="records__stats">
          <RecordStats :stats="logStore.stats" />
        </view>

        <!--
          往期行程。

          只有这个月除头图之外还有别的记录时才出现 ——
          一次出行的人看到一条空的横滑条，只会觉得页面没加载完。
        -->
        <template v-if="railLogs.length">
          <view class="records__sechead">
            <text class="records__sechead-title">{{ trips.title }}</text>
            <text class="records__sechead-hint">{{ trips.hint }}</text>
          </view>

          <RecordTripRail :logs="railLogs" @select="openDetail" />
        </template>

        <view class="records__bar">
          <view class="records__create" @tap="openCreate">
            <image class="records__create-icon" :src="createIcon" mode="aspectFit" />
            <text class="records__create-text">{{ createLabel }}</text>
          </view>
        </view>
      </template>
    </view>

    <!--
      某一天的详情。

      点日历上的某一天，这一天的行程从底部升起来；
      往下拖或者点遮罩就收回去。
    -->
    <RecordDaySheet
      :open="dayOpen"
      :date="selected"
      :logs="selectedLogs"
      :today="today"
      @close="closeDay"
      @create="openCreate"
      @select="openDetail"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 钓鱼记录页。
 *
 * 取数在 store（`stores/fishingLog`），这一层只负责编排：
 * 把月份切好、把挑出来的那条摆成头图、把那一天送进抽屉。
 *
 * 这一页显示的东西都跟着**当前显示的月份**走：头图、往期行程、日历是同一批数据。
 * 只有四个数是全历史的 —— 那是服务端算的跨月量，翻月不该让它变。
 */
import { computed, ref } from 'vue';
import { onPageShow } from '@dcloudio/uni-app';

import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import RecordCalendar from '@/components/RecordCalendar/RecordCalendar.vue';
import RecordDaySheet from '@/components/RecordDaySheet/RecordDaySheet.vue';
import RecordHero from '@/components/RecordHero/RecordHero.vue';
import RecordStats from '@/components/RecordStats/RecordStats.vue';
import RecordTripRail from '@/components/RecordTripRail/RecordTripRail.vue';
import { useViewport } from '@/composables/useViewport';
import { icon } from '@/constants/icons';
import {
  RECORD_CALENDAR_LEGEND,
  RECORD_CREATE_ENTRY,
  RECORD_EMPTY_IMAGE,
  RECORD_LOGIN_REQUIRED,
  RECORD_TRIPS,
} from '@/constants/record';
import { loginErrorMessage } from '@/api/auth';
import { useFishingLogStore } from '@/stores/fishingLog';
import { useSessionStore } from '@/stores/session';
import { logDateKey, logMonthKey } from '@/utils/date';

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const session = useSessionStore();
const logStore = useFishingLogStore();

const login = RECORD_LOGIN_REQUIRED;
const createLabel = RECORD_CREATE_ENTRY;
const legend = RECORD_CALENDAR_LEGEND;
const trips = RECORD_TRIPS;
const emptyImage = RECORD_EMPTY_IMAGE;
const loadingText = '加载中';

const createIcon = icon('plus', 'onAccent');

/** 会话恢复完了没有 */
const ready = ref(false);

/** 抽屉里看的是哪天 */
const selected = ref(logDateKey());

/** 抽屉开没开 */
const dayOpen = ref(false);

/** 今天 */
const today = computed(() => logDateKey());

/** 当前显示的月份是不是本月 */
const isCurrentMonth = computed(() => logStore.month === logMonthKey());

/**
 * 当月的记录，新的在前。
 *
 * 同一天有多条时按开始时间倒序 —— 一天出去两趟时，先看到后出去的那趟。
 */
const monthLogs = computed(() => {
  return [...logStore.logs].sort((a, b) => {
    if (a.log_date !== b.log_date) return a.log_date < b.log_date ? 1 : -1;
    return a.started_at < b.started_at ? 1 : -1;
  });
});

/**
 * 头图那一条。
 *
 * 挑**最近一次带照片的**出行，不是最近一次出行 ——
 * 满幅头图上是一张空白，比换一张旧照片更糟。
 * 一次照片都没留过的月份，就用最近那次的渐变兜底面。
 */
const heroLog = computed(() => {
  const logs = monthLogs.value;
  if (!logs.length) return null;
  return logs.find((log) => log.images?.length) ?? logs[0];
});

/**
 * 往期行程：头图之外的那些。
 *
 * 最多六张 —— 再多就不是「扫一眼」，是「翻页」了。
 */
const railLogs = computed(() => {
  const hero = heroLog.value;
  return monthLogs.value.filter((log) => log.log_id !== hero?.log_id).slice(0, 6);
});

/** 有照片的那些天。给日历画角标用 */
const photoDays = computed(() => {
  const days: string[] = [];
  for (const log of logStore.logs) {
    if (log.images?.length) days.push(log.log_date);
  }
  return days;
});

/** 抽屉里那天的记录 */
const selectedLogs = computed(() => logStore.dayLogs(selected.value));

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

/**
 * 点了日历上的一天。
 *
 * 升起抽屉看那天的行程 —— 抽屉里才有「记一笔」，因为只有今天能记，
 * 按钮该出现在真正放得下的地方。
 */
function onSelect(date: string): void {
  selected.value = date;
  dayOpen.value = true;
}

/** 收起抽屉 */
function closeDay(): void {
  dayOpen.value = false;
}

/**
 * 翻月。
 *
 * 翻到过去的月份照样取数 —— 过去的记录是存在的，用户想回看。
 * 往后翻只在「已经是本月」时允许：未来没有记录，翻过去是一片空白。
 *
 * 翻月之前先收起抽屉：抽屉里是上一个月的那一天，
 * 月份都换了它还开着，读起来是内容没更新。
 */
async function onShift(delta: number): Promise<void> {
  closeDay();

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
  closeDay();
  uni.navigateTo({ url: '/pages/record/create/index' });
}

/**
 * 看一条记录的详情。
 *
 * 先收起抽屉：抽屉浮在这一页上，详情页是压上来的，
 * 抽屉不收的话返回时它还开着，白占掉一屏。
 */
function openDetail(id: string): void {
  closeDay();
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
</script>

<style lang="scss" scoped>
/*
 * 载入提示。
 *
 * 这一页要取会话 + 两个月的数据，恢复期间得有个交代 ——
 * 空着会读成「这天没有记录」。
 *
 * 顶部留出状态栏那一截：正文不再给导航栏让位了（头图从屏幕顶端起），
 * 但这两块没有头图顶着，得自己让开状态栏。
 */
.records__notice {
  padding: 180rpx 32rpx 96rpx;
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
  padding: 180rpx 48rpx 96rpx;
  text-align: center;
}

/*
 * 空态插画。
 *
 * 1:1 的浅色插画放在文案上面：它说的是「这里还没有东西」，
 * 比一句「还没有记录」更快把这句话说清楚。
 */
.records__empty-img {
  width: 320rpx;
  height: 320rpx;
  margin-bottom: 32rpx;
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
 * 页面底。
 *
 * 定位 + z-index 是为了压在环境色底之上 ——
 * PageBackdrop 是 fixed + z-index: 0，而定位元素排在普通流内容之后绘制，
 * 不给这一层定位的话，环境色底会盖住所有没带 transform 的内容
 * （正文里的卡片就是那些）。
 *
 * 与数据页、我的页的 `.data__content` / `.mine__body` 同一套做法。
 *
 * 顶部不给内边距：头图从屏幕顶端起，先撞上状态栏和微信胶囊。
 *
 * 底部留出底部动作条的高度 + 安全区，不然最后一段内容被它盖住。
 */
.records__body {
  position: relative;
  z-index: 1;
  padding-bottom: (160rpx + env(safe-area-inset-bottom));
}

/*
 * 底部动作条。
 *
 * 常驻底部。底色不是透明的 —— 内容从它底下滚过去，
 * 透明的话会看见字从按钮底下穿出来。
 */
.records__bar {
  padding: 16rpx 32rpx;
  box-shadow: inset 0 1rpx 0 $fish-border-40;
}

/*
 * 「记一笔」。
 *
 * 通栏：这一页只有一个主动作，它得是页面上最宽、最重的一件东西。
 * 实心渐变，跟同链路的记录创建页提交按钮一套。
 */
.records__create {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  border-radius: $fish-radius-pill;
  background-image: $fish-gradient;
  @include fish-press(0.97);
}

.records__create-icon {
  width: 30rpx;
  height: 30rpx;
  margin-right: 10rpx;
}

.records__create-text {
  color: $fish-on-accent;
  @include fish-type(callout);

  font-weight: 600;
}

/*
 * 头图外面这一层。
 *
 * 动画挂在这一层而不是组件的宿主节点上：自定义组件的宿主节点不吃动画
 * （见 docs/mp-weixin-platform.md）。这一层没有边距，头图才是真正满幅的。
 */
.records__hero {
  @include fish-enter;
}

/*
 * 日历卡。
 *
 * 左右 32rpx：与页面里其它内容同一条对齐线（分区版式也是这个数）。
 */
.records__cal {
  margin: 24rpx 32rpx 0;
  @include fish-card(32rpx);
  @include fish-enter(60ms);
}

/*
 * 图例。
 *
 * 深浅两档底色读得出分别，但不解释的话读者得自己猜 ——
 * 猜错一次就会以为深的那档是「去得更多」。
 */
.records__legend {
  display: flex;
  align-items: center;
  margin-top: 20rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid $fish-border-40;
}

.records__legend-item {
  display: flex;
  align-items: center;
  margin-right: 28rpx;
}

/* 色块。与日历格子上的两档底色是同一个值 */
.records__swatch {
  width: 20rpx;
  height: 20rpx;
  margin-right: 10rpx;
  border-radius: 6rpx;
}

.records__swatch--catch {
  background-color: $fish-cal-catch;
}

.records__swatch--checkin {
  background-color: $fish-cal-checkin;
}

.records__legend-text {
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/*
 * 四个数。
 *
 * 不套卡：它们是注脚，注脚不需要一张自己的卡。
 * 上下各一道发丝线，把这一行从日历卡和往期行程之间托出来。
 */
.records__stats {
  margin: 28rpx 32rpx 0;
  padding: 24rpx 0;
  border-top: 1rpx solid $fish-border-40;
  border-bottom: 1rpx solid $fish-border-40;
  @include fish-enter(120ms);
}

/* 分区标题行 */
.records__sechead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 44rpx 32rpx 20rpx;
  @include fish-enter(180ms);
}

.records__sechead-title {
  color: $fish-ink;
  @include fish-type(headline);
}

.records__sechead-hint {
  color: $fish-muted-60;
  @include fish-type(caption);
}
</style>
