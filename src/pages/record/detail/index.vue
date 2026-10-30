<template>
  <!--
    记录详情 —— 一次出行记了什么。

    只读 + 删除：不做编辑。记错了就删掉重记一条 ——
    这比进编辑页改更符合「记录是往回看的东西」这个场景，
    也省掉了「改了图片怎么办、旧图要不要删」那一堆麻烦事。

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
        <!-- 照片 -->
        <view v-if="log.images.length" class="sect">
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

        <!-- 渔获 -->
        <view class="sect">
          <view class="sect__card detail__card">
            <view class="detail__head">
              <text class="detail__label">{{ catchLabel }}</text>
              <text class="detail__date">{{ dateText }}</text>
            </view>

            <RecordCatchList v-if="log.catches.length" :catches="log.catches" />
            <text v-else class="detail__nocatch">{{ noCatchText }}</text>

            <view v-if="log.methods.length" class="detail__methods">
              <text class="detail__label">{{ methodLabel }}</text>
              <view class="detail__method-chips">
                <text v-for="method in log.methods" :key="method" class="detail__method">{{ method }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 时间与地点 -->
        <view class="sect">
          <view class="sect__card detail__card">
            <view class="detail__row">
              <text class="detail__label">{{ timeLabel }}</text>
              <text class="detail__value">{{ timeText }}</text>
            </view>

            <view v-if="log.location_name" class="detail__row">
              <text class="detail__label">{{ locationLabel }}</text>
              <text class="detail__value">{{ log.location_name }}</text>
            </view>
          </view>
        </view>

        <!-- 备注 -->
        <view v-if="log.remark" class="sect">
          <view class="sect__card detail__card">
            <text class="detail__label">{{ remarkLabel }}</text>
            <text class="detail__remark">{{ log.remark }}</text>
          </view>
        </view>

        <!-- 天气 -->
        <view v-if="hasWeather" class="sect">
          <view class="sect__card detail__card">
            <text class="detail__label">{{ weatherLabel }}</text>

            <view class="detail__weather">
              <view v-for="item in weatherItems" :key="item.key" class="detail__weather-item">
                <text class="detail__weather-label">{{ item.label }}</text>
                <text class="detail__weather-value">{{ item.value }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 删除 -->
        <view class="sect">
          <view class="detail__remove" @tap="onRemove">
            <text class="detail__remove-text">{{ removeLabel }}</text>
          </view>
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
import RecordCatchList from '@/components/RecordCatchList/RecordCatchList.vue';
import { mediaUrl } from '@/api/upload';
import { fishingLogApi } from '@/api/record';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { RECORD_DETAIL, RECORD_TITLE } from '@/constants/record';
import { useFishingLogStore } from '@/stores/fishingLog';
import { formatLocalTimeOfDay } from '@/utils/date';
import { toErrorMessage } from '@/utils/error';
import type { FishingLog } from '@/types/record';

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const logStore = useFishingLogStore();

const title = RECORD_TITLE;
const catchLabel = '渔获';
const methodLabel = '钓法';
const timeLabel = '开始时间';
const locationLabel = '地点';
const remarkLabel = '备注';
const weatherLabel = '当时的天气';
const noCatchText = RECORD_DETAIL.noCatch;
const removeLabel = RECORD_DETAIL.remove;
const loadingText = '加载中';
const emptyText = '这条记录找不到了';

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

/** 日期。「2026年10月30日」 */
const dateText = computed(() => {
  const value = log.value?.log_date;
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
});

/** 开始时间 */
const timeText = computed(() => formatLocalTimeOfDay(log.value?.started_at));

/** 有没有天气快照 */
const hasWeather = computed(() => log.value?.weather?.temperature !== undefined);

/** 天气读数 */
const weatherItems = computed(() => {
  const w = log.value?.weather;
  if (!w) return [];

  return [
    { key: 'temperature', label: '气温', value: withUnit(w.temperature, '°') },
    { key: 'humidity', label: '湿度', value: withUnit(w.humidity, '%') },
    { key: 'pressure', label: '气压', value: withUnit(w.pressure, 'hPa') },
    { key: 'wind', label: '风速', value: withUnit(w.wind_speed, 'km/h') },
    { key: 'precipitation', label: '降水', value: withUnit(w.precipitation, 'mm') },
  ].filter((item) => item.value);
});

/**
 * 把数字配上单位。
 *
 * 缺值不画「--°」这种空壳 —— 读数没有的时候画一个空壳，
 * 那个空壳会骗人（读成「零度」）。
 */
function withUnit(value: number | undefined, unit: string): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return `${Math.round(value * 10) / 10}${unit}`;
}

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
 * 一个分区。
 *
 * 缩进、卡间距走令牌层 _layout.scss 的 fish-section —— 与日历页同一套规则。
 */
.sect {
  @include fish-section;
}

/* 分区里的那张卡 */
.detail__card {
  @include fish-card;
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

/*
 * 照片。
 *
 * 横向滚动，不铺满 —— 一张满幅头图会把下面的内容全推到屏幕外，
 * 而记录页的重点是渔获那几行字，不是照片。
 */
.detail__photos {
  width: 100%;
}

.detail__photos-row {
  display: inline-flex;
  padding: 0 32rpx;
}

.detail__photo {
  width: 320rpx;
  height: 320rpx;
  margin-right: 16rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

/*
 * 一栏的标题行：左边标签，右边值。
 *
 * 标签与值分两行还是一行？一行 —— 这一栏的值都很短（一个日期、一个地名），
 * 分两行会让这张卡变成一叠只写了一句话的横条。
 */
.detail__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.detail__label {
  display: block;
  margin-bottom: 12rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 标题行里的标签不该再带下边距 —— 那一行的间距由 head 管 */
.detail__head .detail__label {
  margin-bottom: 0;
}

.detail__date {
  color: $fish-muted;
  @include fish-type(caption);
}

.detail__nocatch {
  color: $fish-muted;
  @include fish-type(callout);
}

/* 钓法 */
.detail__methods {
  margin-top: 28rpx;
}

.detail__method-chips {
  display: flex;
  flex-wrap: wrap;
}

.detail__method {
  padding: 6rpx 18rpx;
  margin: 0 12rpx 12rpx 0;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent-tint;
  color: $fish-blue-600;
  @include fish-type(caption);
}

/* 标签在左、值在右的一行 */
.detail__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16rpx 0;
  border-top: 1rpx solid $fish-border-40;
}

.detail__row:first-child {
  padding-top: 0;
  border-top: none;
}

.detail__row .detail__label {
  margin-bottom: 0;
}

.detail__value {
  color: $fish-ink;
  @include fish-type(callout);
}

/* 备注 */
.detail__remark {
  display: block;
  color: $fish-ink;
  @include fish-type(body);

  white-space: pre-wrap;
}

/*
 * 天气读数。五个数平分一行 —— 同新建页那一套口径。
 */
.detail__weather {
  display: flex;
  margin-top: 16rpx;
}

.detail__weather-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.detail__weather-label {
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.detail__weather-value {
  margin-top: 4rpx;
  color: $fish-ink;
  @include fish-type(callout);

  font-weight: 600;
}

/*
 * 删除。
 *
 * 独居一格，不套在卡里 —— 它跟上面的内容不在一个层级，
 * 套进卡里就又变成卡片里的一条了。
 */
.detail__remove {
  padding: 32rpx 0;
  text-align: center;
  @include fish-press-dim;
}

.detail__remove-text {
  color: $fish-destructive;
  @include fish-type(body);
}
</style>
