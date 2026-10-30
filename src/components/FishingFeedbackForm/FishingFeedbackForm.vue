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
          当前鱼口概率 {{ data.fishing_index }}
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
import { useFishingMapStore } from '@/stores/fishingMap';
import type { FishingFeedbackLevel, FishingIndexData } from '@/types/fishing';
import { toErrorMessage } from '@/utils/error';
import { deriveFishingIndexLevel, deriveTideMeta } from '@/utils/feedback';
import { haptic } from '@/utils/haptics';

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
  /** 打开时由父组件传入的当前鱼口概率快照 */
  data: FishingIndexData | null;
  /** 关联钓点 id；无关联钓点时传 'default' */
  locationId: string;
}>();

const emit = defineEmits<{
  close: [];
  success: [];
}>();

const mapStore = useFishingMapStore();

const selected = ref<FishingFeedbackLevel | null>(null);
const loading = ref(false);

/** 地点名优先用 enriched 响应带回的，退化到通用文案 */
const locationName = computed(() => mapStore.locationName || '钓鱼地点');

async function submit() {
  const current = props.data;
  if (!current || loading.value) return;

  if (!selected.value) {
    uni.showToast({ title: '请选择钓鱼体验', icon: 'none' });
    return;
  }

  const weather = mapStore.liveWeather;
  const tideMeta = deriveTideMeta(mapStore.tideData);

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
      indices: deriveFishingIndexLevel(mapStore.weatherIndices),

      tide_level: tideMeta.level,
      tide_type: tideMeta.type,
      tide_range: tideMeta.range,
      hours_to_next_tide: tideMeta.hoursToNext,
    });

    selected.value = null;

    /*
     * 结果只以 toast 呈现：两秒后连它一起消失，浮层也关了。
     * 那一刻屏幕上什么都不剩，给一次震动把「提交成了」这件事留下来。
     */
    haptic('medium');

    // 带 success 图标的 toast 标题最多显示 7 个汉字，超了会被截成「反馈已提交，感…」
    uni.showToast({ title: '反馈已提交', icon: 'success' });
    emit('success');
    emit('close');
  } catch (err) {
    // 失败与成功必须能盲听区分：失败是重的一下
    haptic('heavy');
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
  @include fish-type(title2);
}

.feedback-form__subtitle {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

.feedback-form__body {
  padding: 24rpx 40rpx 64rpx;
}

/* 上下文回显：次级填充的小卡，让用户在作答前先确认自己在给谁打分 */
.feedback-form__context {
  margin-bottom: 32rpx;
  padding: 20rpx 24rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-surface;
}

.feedback-form__context-place {
  display: block;
  color: $fish-muted;
  @include fish-type(caption);
}

.feedback-form__context-index {
  display: block;
  margin-top: 4rpx;
  color: $fish-ink;
  @include fish-type(subhead);

  font-weight: 600;
}

.feedback-form__context-level {
  color: $fish-muted;
  @include fish-type(caption);
}

.feedback-form__label {
  display: block;
  margin-bottom: 16rpx;
  color: $fish-ink;
  @include fish-type(subhead);
}

/*
 * 五个选项横排。
 *
 * 这是「单选一组」，不是分段控件 —— 段控件的隐含语义是切视图，
 * 而这里是作答。选中态给一枚实心蓝胶囊，比白块更明确地表示「我选了这个」，
 * 白块 + 蓝字在五个挨着的选项里容易看成「高亮了一行」。
 */
.feedback-form__options {
  display: flex;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

.feedback-form__option {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 72rpx;
  border-radius: $fish-radius-pill;
  @include fish-press-dim;
}

.feedback-form__option--active {
  background-color: $fish-accent;
}

.feedback-form__option-text {
  color: $fish-muted;
  @include fish-type(callout);
}

.feedback-form__option-text--active {
  color: $fish-on-accent;
  font-weight: 600;
}

.feedback-form__actions {
  display: flex;
  margin-top: 48rpx;
}

/* 44pt 命中高度；按下即缩，抬手回弹比按下慢两倍（见令牌层 _motion.scss 的 fish-press） */
.feedback-form__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  margin: 0 8rpx;
  border-radius: $fish-radius-pill;
  @include fish-press(0.97);
}

.feedback-form__btn--ghost {
  background-color: $fish-surface;
}

.feedback-form__btn--primary {
  background-color: $fish-accent;
}

.feedback-form__btn--disabled {
  opacity: 0.4;
}

.feedback-form__btn-text {
  color: $fish-ink;
  @include fish-type(callout);
}

.feedback-form__btn--primary .feedback-form__btn-text {
  color: $fish-on-accent;
  font-weight: 600;
}
</style>
