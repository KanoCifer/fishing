<template>
  <!--
    记录详情 —— 一次出行记了什么。

    只读 + 删除：不做编辑。记错了就删掉重记一条 ——
    这比进编辑页改更符合「记录是往回看的东西」这个场景，
    也省掉了「改了图片怎么办、旧图要不要删」那一堆麻烦事。

    版式是**手账**：一条竖着的脊线串起几段内容 ——
    什么时候在哪儿（情境）→ 钓到了什么 → 照片 → 备注 → 当时的天气。
    按回忆的顺序排，不按字段分组排：回看一条钓鱼记录，
    人先想起在哪儿几点，再想起钓到了什么。

    与新建页在同一个分包里 —— 它们是同一件事的两头。
  -->
  <view class="detail" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <PageNav :title="title" :scrolled="scrolled" fallback-url="/pages/records/index" />

    <view class="detail__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!-- 载入中 -->
      <view v-if="!ready" class="detail__notice">
        <text class="detail__notice-text">{{ loadingText }}</text>
      </view>

      <!-- 取不到 -->
      <view v-else-if="!log" class="detail__empty">
        <text class="detail__empty-text">{{ emptyText }}</text>
      </view>

      <template v-else>
        <!-- 情境。脊线之上的那一段，不在脊线里 -->
        <view class="scene" :style="{ animationDelay: enterDelay(0) }">
          <text class="scene__date">{{ dateText }}</text>
          <text class="scene__weekday">{{ weekdayText }}</text>

          <view v-if="placeText" class="scene__place-row">
            <image class="scene__place-icon" :src="placeIcon" mode="aspectFit" />
            <text class="scene__place">{{ placeText }}</text>
          </view>

          <view class="scene__meta">
            <text v-if="timeText" class="scene__time">{{ timeText }} 开始</text>
            <text v-for="(method, index) in log.methods" :key="index" class="scene__method">{{ method }}</text>
          </view>
        </view>

        <!-- 脊线 -->
        <view class="rail">
          <!-- 钓到了什么 -->
          <view class="sect">
            <view v-if="lastSection !== 'catch'" class="sect__spine" />
            <view class="sect__dot" />
            <view class="sect__body" :style="{ animationDelay: enterDelay(1) }">
              <text class="sect__label">{{ catchLabel }}</text>

              <view v-if="log.catches.length" class="ledger">
                <view v-for="(item, index) in log.catches" :key="index" class="ledger__row">
                  <text class="ledger__name">{{ item.species }}</text>
                  <text class="ledger__qty">{{ item.quantity }}</text>
                </view>

                <view class="ledger__row ledger__row--total">
                  <text class="ledger__name">{{ totalLabel }}</text>
                  <text class="ledger__qty">{{ totalText }}</text>
                </view>
              </view>

              <text v-else class="sect__empty">{{ noCatchText }}</text>
            </view>
          </view>

          <!-- 照片 -->
          <view v-if="log.images.length" class="sect">
            <view v-if="lastSection !== 'photo'" class="sect__spine" />
            <view class="sect__dot" />
            <view class="sect__label-wrap" :style="{ animationDelay: enterDelay(2) }">
              <text class="sect__label">{{ photoLabel }}</text>
            </view>

            <scroll-view class="detail__photos" scroll-x :show-scrollbar="false">
              <view class="detail__photos-row">
                <image
                  v-for="(path, index) in log.images"
                  :key="path + index"
                  class="detail__photo"
                  :src="mediaUrl(path)"
                  mode="aspectFill"
                  lazy-load
                />
              </view>
            </scroll-view>
          </view>

          <!-- 备注 -->
          <view v-if="log.remark" class="sect">
            <view v-if="lastSection !== 'remark'" class="sect__spine" />
            <view class="sect__dot" />
            <view class="sect__body" :style="{ animationDelay: enterDelay(3) }">
              <text class="sect__label">{{ remarkLabel }}</text>
              <text class="detail__remark">{{ log.remark }}</text>
            </view>
          </view>

          <!-- 当时的天气 -->
          <view v-if="weather" class="sect">
            <view class="sect__dot" />
            <!-- 动画挂在普通 view 上，不能挂在组件标签上：组件宿主节点不吃动画 -->
            <view class="sect__body" :style="{ animationDelay: enterDelay(4) }">
              <RecordWeatherCard :weather="weather" />
            </view>
          </view>
        </view>

        <!-- 删除。独居一格，不在脊线里 -->
        <view class="detail__remove" @tap="onRemove">
          <text class="detail__remove-text">{{ removeLabel }}</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 记录详情页。
 *
 * 自己取这条记录（`GET /v3/fish/logs/:id`）：这一页可能从分享链接或
 * 页面栈深处直接进来，不能指望日历页已经取到过它。
 */
import { computed, ref } from 'vue';
import { onLoad, onPageScroll } from '@dcloudio/uni-app';

import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import RecordWeatherCard from './components/RecordWeatherCard/RecordWeatherCard.vue';
import { mediaUrl } from '@/api/upload';
import { fishingLogApi } from '@/api/record';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { icon } from '@/constants/icons';
import { RECORD_CALENDAR, RECORD_DETAIL, RECORD_TITLE } from '@/constants/record';
import { useFishingLogStore } from '@/stores/fishingLog';
import { formatLocalTimeOfDay } from '@/utils/date';
import { toErrorMessage } from '@/utils/error';
import { enterDelay } from '@/utils/motion';
import type { FishingLog, FishingLogWeather } from '@/types/record';

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const logStore = useFishingLogStore();

const title = RECORD_TITLE;
const catchLabel = '钓到了什么';
const photoLabel = '照片';
const remarkLabel = '备注';
const totalLabel = '合计';
const noCatchText = RECORD_DETAIL.noCatch;
const removeLabel = RECORD_DETAIL.remove;
const loadingText = '加载中';
const emptyText = '这条记录找不到了';

/** 地点那一行前面的图钉 */
const placeIcon = icon('map-pin', 'muted');

/** 导航栏材质层要不要显形 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

/** 记录 id。URL 上带来的 */
const logId = ref('');

/** 这条记录 */
const log = ref<FishingLog | null>(null);

/** 取完了没有 */
const ready = ref(false);

/** 正在删除 */
const removing = ref(false);

/* ── 派生 ──────────────────────────────────────────────────────────────── */

/**
 * 日期。「10月30日」
 *
 * 不带年份：年份在下面一行（周五 · 2026）里。
 */
const dateText = computed(() => {
  const value = log.value?.log_date;
  if (!value) return '';

  const parts = value.split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return '';

  return `${month}月${day}日`;
});

/**
 * 星期与年份。「周五 · 2026」
 *
 * 用 UTC 算星期：`log_date` 是没有时区的日历日，
 * 拿它 new Date() 会被按运行设备的时区重解释，
 * 算出来的星期可能差一天（只在新旧时区区间的设备上复现）。
 */
const weekdayText = computed(() => {
  const value = log.value?.log_date;
  if (!value) return '';

  const parts = value.split('-').map(Number);
  const [year, month, day] = parts;
  if (!year || !month || !day) return '';

  const date = new Date(Date.UTC(year, month - 1, day));
  // 星期表从周一开始，而 getUTCDay 是周日起算 —— 挪一下
  const weekday = RECORD_CALENDAR.weekdays[(date.getUTCDay() + 6) % 7];

  return `周${weekday} · ${year}`;
});

/** 地点 */
const placeText = computed(() => log.value?.location_name ?? '');

/** 开始时间 */
const timeText = computed(() => formatLocalTimeOfDay(log.value?.started_at));

/** 一共钓了几尾 */
const totalText = computed(() => {
  const catches = log.value?.catches ?? [];
  const total = catches.reduce((sum, item) => sum + item.quantity, 0);
  return `${total} 尾`;
});

/**
 * 天气快照。
 *
 * null = 这条记录没有可写的天气。
 *
 * 判断的不是「气温有没有」：一条记录可能只有潮汐没有气温，
 * 那时候天气那一段照样有东西可写（潮位、鱼口指数）。
 */
const weather = computed<FishingLogWeather | null>(() => {
  const w = log.value?.weather;
  if (!w) return null;

  const hasAny = [
    w.temperature,
    w.humidity,
    w.pressure,
    w.wind_speed,
    w.precipitation,
    w.indices,
    w.tide_level,
    w.tide_range,
    w.hours_to_next_tide,
  ].some((value) => value !== undefined && Number.isFinite(value));

  return hasAny ? w : null;
});

/**
 * 哪些段存在，按页面上的顺序。
 *
 * 脊线是**分段**画的：每一段画自己那一截，一直画到下一个圆点。
 * 整条线一次画完做不到 —— 每一段的高度由内容决定，
 * 下一段起点在哪儿没法用固定偏移算出来。
 * 分段就要知道哪一段是最后一段（最后一段不画线），
 * 而哪些段存在是条件决定的，所以这里得先算一遍。
 */
const sections = computed(() => {
  const list = ['catch'];
  if (log.value?.images.length) list.push('photo');
  if (log.value?.remark) list.push('remark');
  if (weather.value) list.push('weather');
  return list;
});

/** 最后一段。它的下面没有线 */
const lastSection = computed(() => sections.value[sections.value.length - 1]);

/* ── 取数 ──────────────────────────────────────────────────────────────── */

async function load(id: string): Promise<void> {
  try {
    log.value = await fishingLogApi.get(id);
  } catch (err) {
    log.value = null;
    uni.showToast({ title: toErrorMessage(err, '载入失败'), icon: 'none' });
  } finally {
    ready.value = true;
  }
}

/* ── 交互 ──────────────────────────────────────────────────────────────── */

/**
 * 删除。
 *
 * 破坏性操作要二次确认 —— 记录删了就没了，而误触一次就再也回不来。
 */
function onRemove(): void {
  if (removing.value || !log.value) return;

  uni.showModal({
    title: RECORD_DETAIL.removeConfirm,
    content: RECORD_DETAIL.removeConfirmHint,
    confirmText: RECORD_DETAIL.removeConfirmAction,
    cancelText: RECORD_DETAIL.cancel,
    confirmColor: '#ff3b30',
    success: async (res) => {
      if (!res.confirm) return;

      removing.value = true;
      try {
        await logStore.remove(log.value!.log_id);
        uni.showToast({ title: RECORD_DETAIL.removedToast, icon: 'none' });
        setTimeout(goBack, 600);
      } catch (err) {
        removing.value = false;
        uni.showToast({ title: toErrorMessage(err, '删除失败，请稍后重试'), icon: 'none' });
      }
    },
  });
}

/** 回上一页 */
function goBack(): void {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.switchTab({ url: '/pages/records/index' });
    },
  });
}

/* ── 进页面 ────────────────────────────────────────────────────────────── */

onLoad((options) => {
  const id = options?.id;
  if (!id) {
    ready.value = true;
    return;
  }

  logId.value = id;
  void load(id);
});
</script>

<style lang="scss" scoped>
/*
 * 页面左右留白。
 *
 * 留白是页面级的，不留在各段里 —— 留在段里就等于同一个数抄了七八份，
 * 抄着抄着就散了。
 */
.detail__body {
  padding: 0 32rpx;
}

/* 载入提示 */
.detail__notice {
  padding: 96rpx 32rpx;
  text-align: center;
}

.detail__notice-text {
  color: $fish-muted;
  @include fish-type(callout);
}

/* 取不到 */
.detail__empty {
  padding: 120rpx 48rpx;
  text-align: center;
}

.detail__empty-text {
  color: $fish-muted;
  @include fish-type(callout);
}

/* ── 情境 ──────────────────────────────────────────────────────────────── */

/*
 * 情境块。
 *
 * 不套卡，也不在脊线里：这一段是「整页的那句话」，
 * 下面几段才是手账上的条目。
 *
 * 缩进比下面的条目浅一档（48rpx vs 72rpx）——
 * 日期是标题，标题不进正文那一列。
 */
.scene {
  padding-left: 48rpx;
  padding-top: 8rpx;
  margin-bottom: 48rpx;
  @include fish-enter;
}

/*
 * 大日期。
 *
 * 这一屏最大的字 —— 它是这条记录的坐标。
 */
.scene__date {
  display: block;
  color: $fish-ink;
  @include fish-type(large-title);
}

.scene__weekday {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted-60;
  @include fish-type(headline);
}

.scene__place-row {
  display: flex;
  align-items: center;
  margin-top: 20rpx;
}

.scene__place-icon {
  width: 30rpx;
  height: 30rpx;
  margin-right: 8rpx;
  opacity: 0.7;
}

.scene__place {
  color: $fish-ink;
  @include fish-type(headline);
}

.scene__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 12rpx;
}

.scene__time {
  margin-right: 16rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}

/* 钓法胶囊 */
.scene__method {
  padding: 4rpx 16rpx;
  margin: 0 12rpx 8rpx 0;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent-tint;
  color: $fish-blue-600;
  @include fish-type(caption);
}

/* ── 脊线 ──────────────────────────────────────────────────────────────── */

/*
 * 脊线。
 *
 * 每一段画自己那一截：从本段的圆心一直画到下一段的圆心。
 * 下一段的圆心在下一段的上沿往下 14rpx，而下一段的上沿在本段下沿往下
 * 48rpx（分区间距）—— 所以下沿要越过 62rpx。
 *
 * 最后一段不画：它下面没有下一段，线画下去就成了一条断头线。
 */
.sect__spine {
  position: absolute;
  top: 14rpx;
  bottom: -62rpx;
  left: 36rpx;
  width: 1rpx;
  background-color: $fish-border-40;
}

/* ── 一段 ──────────────────────────────────────────────────────────────── */

.sect {
  position: relative;
  padding-left: 72rpx;
  margin-bottom: 48rpx;
}

/*
 * 圆点。
 *
 * 实心盖在线上，不加白色光环 —— 线本来就淡，
 * 加一圈白底反而像贴上去的贴纸。
 *
 * 位置：横向对准脊线（36rpx），纵向对准这一段的眉标。
 */
.sect__dot {
  position: absolute;
  top: 8rpx;
  left: 30rpx;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: $fish-blue;
}

/*
 * 段落内容。
 *
 * 动画挂在这一层，**不挂在整段上**：
 * 脊线是骨架，不该跟着内容一起落位 —— 一段一段错开落下来，
 * 那条线就断了。
 */
.sect__body {
  @include fish-enter;
}

.sect__label-wrap {
  @include fish-enter;
}

.sect__label {
  display: block;
  margin-bottom: 16rpx;
  @include fish-eyebrow;
}

.sect__empty {
  display: block;
  color: $fish-muted;
  @include fish-type(callout);
}

/* ── 渔获账 ────────────────────────────────────────────────────────────── */

/*
 * 一行一个鱼种，数量右对齐。
 *
 * 不折成一句话（「鲫鱼3条、草鱼1条」）：
 * 扫一眼就知道有几种、每种几条，
 * 而一句话得从头读到尾才知道断在哪。
 */
.ledger__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 18rpx 0;
  border-top: 1rpx solid $fish-border-40;
}

.ledger__row:first-child {
  padding-top: 0;
  border-top: none;
}

.ledger__name {
  color: $fish-ink;
  @include fish-type(callout);
}

.ledger__qty {
  color: $fish-ink;
  @include fish-type(callout);

  font-weight: 600;
}

/* 合计那一行：线重一档，字轻一档 */
.ledger__row--total {
  border-top: 1rpx solid $fish-border;
}

.ledger__row--total .ledger__name {
  color: $fish-muted;
}

/* ── 照片 ──────────────────────────────────────────────────────────────── */

/*
 * 横向滚动，不铺满 —— 一张满幅头图会把下面的内容全推到屏幕外，
 * 而记录页的重点是渔获那几行字，不是照片。
 */
.detail__photos {
  width: 100%;
}

.detail__photos-row {
  display: inline-flex;
}

.detail__photo {
  width: 180rpx;
  height: 180rpx;
  margin-right: 16rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

.detail__photo:last-child {
  margin-right: 0;
}

/* ── 备注 ──────────────────────────────────────────────────────────────── */

.detail__remark {
  display: block;
  color: $fish-ink;
  @include fish-type(body);

  white-space: pre-wrap;
}

/* ── 删除 ──────────────────────────────────────────────────────────────── */

/*
 * 独居一格，不套在卡里 —— 它跟上面的内容不在一个层级，
 * 套进卡里就又变成卡片里的一条了。
 */
.detail__remove {
  padding: 32rpx 0 96rpx;
  text-align: center;
  @include fish-press-dim;
}

.detail__remove-text {
  color: $fish-destructive;
  @include fish-type(body);
}
</style>
