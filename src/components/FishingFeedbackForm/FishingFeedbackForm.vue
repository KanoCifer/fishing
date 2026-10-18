<template>
  <SnapSheet :open="open && !!data" :snap-points="SNAP_POINTS" :initial-snap="0" @close="onCancel">
    <template #header>
      <view class="feedback-form__header">
        <text class="feedback-form__title">钓鱼反馈</text>
        <text class="feedback-form__subtitle">你的反馈会帮助我们改进</text>
      </view>
    </template>

    <view v-if="data" class="feedback-form__body">
      <!-- 上下文 -->
      <view class="feedback-form__context">
        <text class="feedback-form__context-place">地点 · {{ locationName }}</text>
        <text class="feedback-form__context-index">
          当前指数 {{ data.fishing_index }}
          <text class="feedback-form__context-level">（{{ data.level }}）</text>
        </text>
      </view>

      <text class="feedback-form__label">您的钓鱼体验</text>
      <view class="feedback-form__options">
        <view
          v-for="option in FEEDBACK_OPTIONS"
          :key="option.value"
          class="feedback-form__option"
          :class="{ 'feedback-form__option--active': selected === option.value }"
          @tap="selected = option.value"
        >
          <text
            class="feedback-form__option-text"
            :class="{ 'feedback-form__option-text--active': selected === option.value }"
          >
            {{ option.label }}
          </text>
        </view>
      </view>

      <view class="feedback-form__actions">
        <view class="feedback-form__btn feedback-form__btn--ghost" @tap="onCancel">
          <text class="feedback-form__btn-text">取消</text>
        </view>
        <view
          class="feedback-form__btn feedback-form__btn--primary"
          :class="{ 'feedback-form__btn--disabled': !selected || loading }"
          @tap="submit"
        >
          <text class="feedback-form__btn-text">
            {{ loading ? '提交中…' : '确认提交' }}
          </text>
        </view>
      </view>
    </view>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * 钓鱼反馈表单 —— 对应源项目 FishingFeedbackForm.tsx。
 *
 * 提交载荷在 submit() 里现拼：把实时天气和潮汐派生值一起带上，
 * 后端据此校准模型。具体派生规则见 utils/feedback.ts。
 */
import { computed, ref } from 'vue';

import { fishingApi } from '@/api/fishing';
import { useFishingMapStore, toErrorMessage } from '@/composables/useFishingMapStore';
import type { FishingFeedbackLevel, FishingIndexData } from '@/types/fishing';
import { deriveTideMeta, deriveWindLevel } from '@/utils/feedback';

import SnapSheet from '../SnapSheet/SnapSheet.vue';

const SNAP_POINTS = [45, 85] as const;

const FEEDBACK_OPTIONS: ReadonlyArray<{
  value: FishingFeedbackLevel;
  label: string;
}> = [
  { value: '爆护', label: '爆护' },
  { value: '好', label: '好' },
  { value: '一般', label: '一般' },
  { value: '差', label: '差' },
  { value: '空军', label: '空军' },
];

const props = defineProps<{
  open: boolean;
  /** 打开时由父组件传入的当前钓鱼指数快照 */
  data: FishingIndexData | null;
  /** 关联钓点 id；无关联钓点时传 'default' */
  locationId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success'): void;
}>();

const { state } = useFishingMapStore();

const selected = ref<FishingFeedbackLevel | null>(null);
const loading = ref(false);

/** 地点名优先用 enriched 响应带回的，退化到通用文案 */
const locationName = computed(() => state.locationName || '钓鱼地点');

async function submit() {
  const current = props.data;
  if (!current || loading.value) return;

  if (!selected.value) {
    uni.showToast({ title: '请选择钓鱼体验', icon: 'none' });
    return;
  }

  const weather = state.liveWeather;
  const tideMeta = deriveTideMeta(state.tideData);

  loading.value = true;
  try {
    await fishingApi.submitFeedback({
      location_id: props.locationId,
      location_name: locationName.value,
      // 后端要 ISO 时间；小程序端用 Date 构造，不用 dayjs
      fishing_time: new Date().toISOString(),
      feedback: selected.value,

      // 天气字段后端定义为 number，但和风给的是字符串，必须转。
      // || 兜底的写法要注意 0 会被当成假值 —— 风速 0 和降水 0 是合法值，
      // 所以这里统一走 Number.isFinite 判断，0 就原样发 0。
      temperature: finiteOr(Number(weather?.temp), 20),
      humidity: finiteOr(Number(weather?.humidity), 50),
      pressure: finiteOr(Number(weather?.pressure), 1013),
      wind_speed: finiteOr(Number(weather?.windSpeed), 0),
      precipitation: finiteOr(Number(weather?.precip), 0),
      indices: deriveWindLevel(weather?.windScale),

      tide_level: tideMeta.level,
      tide_type: tideMeta.type,
      tide_range: tideMeta.range,
      hours_to_next_tide: tideMeta.hoursToNext,
    });

    selected.value = null;
    uni.showToast({ title: '反馈已提交，感谢分享', icon: 'success' });
    emit('success');
    emit('close');
  } catch (err) {
    uni.showToast({
      title: toErrorMessage(err, '提交反馈失败，请重试'),
      icon: 'none',
    });
  } finally {
    loading.value = false;
  }
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function onCancel() {
  selected.value = null;
  emit('close');
}
</script>

<style lang="scss" scoped>
.feedback-form__header {
  padding: 0 40rpx 24rpx;
}

.feedback-form__title {
  display: block;
  color: $fish-ink;
  font-size: 32rpx;
  font-weight: 600;
}

.feedback-form__subtitle {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted;
  font-size: 24rpx;
}

.feedback-form__body {
  padding: 24rpx 40rpx 64rpx;
}

.feedback-form__context {
  margin-bottom: 32rpx;
  padding: 20rpx 24rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-surface;
}

.feedback-form__context-place {
  display: block;
  color: $fish-muted;
  font-size: 24rpx;
}

.feedback-form__context-index {
  display: block;
  margin-top: 4rpx;
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.feedback-form__context-level {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 400;
}

.feedback-form__label {
  display: block;
  margin-bottom: 16rpx;
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 500;
}

.feedback-form__options {
  display: flex;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-blue-50;
}

.feedback-form__option {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 72rpx;
  border-radius: 10rpx;
}

.feedback-form__option--active {
  background-color: $fish-page;
}

.feedback-form__option-text {
  color: $fish-muted;
  font-size: 26rpx;
  font-weight: 500;
}

.feedback-form__option-text--active {
  color: $fish-ink;
}

.feedback-form__actions {
  display: flex;
  margin-top: 48rpx;
}

.feedback-form__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  margin: 0 8rpx;
  border-radius: 999rpx;
}

.feedback-form__btn--ghost {
  background-color: $fish-surface;
}

.feedback-form__btn--primary {
  background-color: $fish-accent;
}

.feedback-form__btn--disabled {
  opacity: 0.5;
}

.feedback-form__btn-text {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 500;
}
</style>
