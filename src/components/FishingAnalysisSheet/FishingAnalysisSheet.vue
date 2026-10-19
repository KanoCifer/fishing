<template>
  <SnapSheet :open="open" :snap-points="SNAP_POINTS" :initial-snap="1" @close="onClose">
    <template #header>
      <view class="analysis__header">
        <view class="analysis__header-text">
          <text class="analysis__title">AI 分析</text>
          <text class="analysis__subtitle">基于当前天气与潮汐综合判断</text>
        </view>
        <view class="analysis__badge" :class="'analysis__badge--' + statusTone">
          <text class="analysis__badge-text">{{ statusLabel }}</text>
        </view>
      </view>
    </template>

    <view class="analysis__content">
      <!--
        工具条：模型选择 + 主操作。

        生成中时换成「停止」——同一个位置换按钮，不新增一行。
        多一行的话面板刚打开时内容就被推到下面去了，首屏看不到结果。
      -->
      <view class="analysis__toolbar">
        <!--
          模型名。静态标签而不是 picker：目前只有一个模型，
          点开一个只含一项的下拉框是白多点一次。
          后端上更多模型时，这里换回 picker（见 api/ai.ts 的 AI_MODELS）。
        -->
        <view class="analysis__model">
          <text class="analysis__model-name">{{ modelName }}</text>
        </view>

        <view v-if="isStreaming" class="analysis__btn analysis__btn--stop" @tap="onStop">
          <text class="analysis__btn-text">停止</text>
        </view>
        <view
          v-else
          class="analysis__btn analysis__btn--primary"
          :class="{ 'analysis__btn--disabled': !hasData }"
          @tap="onGenerate"
        >
          <text class="analysis__btn-text analysis__btn-text--onaccent">
            {{ hasGenerated ? '重新分析' : '生成分析' }}
          </text>
        </view>
      </view>

      <!-- 没有天气数据：先说清为什么不能生成 -->
      <view v-if="!hasData" class="analysis__empty">
        <text class="analysis__empty-title">等待天气与潮汐数据</text>
        <text class="analysis__empty-text">数据到位后即可生成分析</text>
      </view>

      <template v-else>
        <!--
          思考过程。

          折叠起来放在正文上方：思考是过程，正文是结论，
          过程默认不该占着结论的位置。
        -->
        <view v-if="reasoning" class="analysis__reasoning">
          <view class="analysis__reasoning-head" @tap="reasoningOpen = !reasoningOpen">
            <text class="analysis__caret" :class="{ 'analysis__caret--open': reasoningOpen }">›</text>
            <text class="analysis__reasoning-label">思考过程</text>
          </view>
          <text v-if="reasoningOpen" class="analysis__reasoning-text">{{ reasoning }}</text>
        </view>

        <!-- 生成中：先给一句正在做什么，再给骨架 -->
        <view v-if="isStreaming && !summary" class="analysis__loading">
          <text class="analysis__loading-text">{{ loadingHint }}</text>
          <view class="analysis__skeleton">
            <view class="analysis__skeleton-line" />
            <view class="analysis__skeleton-line analysis__skeleton-line--short" />
            <view class="analysis__skeleton-line analysis__skeleton-line--mid" />
          </view>
        </view>

        <!-- 结果 -->
        <view v-else-if="summary" class="analysis__result">
          <MarkdownView :content="summary" />
        </view>

        <!-- 还没生成 -->
        <view v-else class="analysis__placeholder">
          <text class="analysis__placeholder-text">点「生成分析」，拿到今天的出行与垂钓建议。</text>
        </view>

        <view v-if="errorMessage" class="analysis__error">
          <text class="analysis__error-text">{{ errorMessage }}</text>
        </view>

        <!-- 脚注：这份分析是基于哪一刻的数据 -->
        <view class="analysis__foot">
          <text class="analysis__foot-text">天气更新：{{ weatherUpdated || '--' }}</text>
          <text class="analysis__foot-text">潮汐更新：{{ tideUpdated || '--' }}</text>
        </view>
      </template>
    </view>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * AI 分析面板 —— SnapSheet 承载，内容来自大模型流式分析。
 *
 * 结构照抄源项目（kanocifer-chat-frontend）的 WeatherAnalysis 组件：
 * 工具条（状态 + 模型 + 生成/取消）→ 结果区 → 脚注，
 * 外加一块可折叠的「思考过程」。
 *
 * 与源版本的差异，都是平台差异：
 * - 源版是桌面右侧悬浮卡，这里是底部 SnapSheet（小程序没有 hover 下拉）
 * - 源版用 DOMPurify + v-html 渲染 Markdown，这里走 mp-html（小程序不能碰 DOM）
 * - 源版用 AbortController 取消，这里用 RequestTask.abort（小程序没有 AbortController）
 * - 源版模型选择是 HoverDropdown，这里用原生 picker
 *
 * 数据全部来自 store，组件不自己取数 —— 天气和潮汐已经在 store 里了，
 * 再取一次是白花一次往返。
 */
import { computed, ref, watch } from 'vue';

import { AI_MODELS } from '@/api/ai';
import { useFishingAnalysis } from '@/composables/useFishingAnalysis';
import { useFishingMapStore } from '@/stores/fishingMap';
import { formatDateTime, formatMoment } from '@/utils/date';
import type { WeatherAnalysisPayload } from '@/types/fishing';

import MarkdownView from '../MarkdownView/MarkdownView.vue';
import SnapSheet from '../SnapSheet/SnapSheet.vue';

const SNAP_POINTS = [55, 88] as const;

/** 生成中轮播的提示文案。跟参考实现一样，给一段"正在做什么"的实感 */
const LOADING_HINTS = ['正在整理天气变化…', '正在评估体感与风况…', '正在结合潮汐节奏…'];

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const mapStore = useFishingMapStore();
const { status, summary, reasoning, errorMessage, start, stop } = useFishingAnalysis();

/** 当前模型。目前只有一个，静态显示；上更多模型时这里换成可选择 */
const modelName = computed(() => AI_MODELS[0]?.name ?? '');

/** 思考过程默认收起 */
const reasoningOpen = ref(false);

/** 提示文案的轮播下标 */
const hintIndex = ref(0);
let hintTimer: ReturnType<typeof setInterval> | null = null;

const isStreaming = computed(() => status.value === 'streaming');
const hasGenerated = computed(() => status.value === 'done' || status.value === 'stopped');

const statusLabel = computed(() => {
  switch (status.value) {
    case 'streaming':
      return '分析中';
    case 'done':
      return '已生成';
    case 'stopped':
      return '已停止';
    case 'error':
      return '分析失败';
    default:
      return '待生成';
  }
});

/** 徽章的配色档位 */
const statusTone = computed(() => {
  switch (status.value) {
    case 'streaming':
      return 'accent';
    case 'done':
      return 'success';
    case 'error':
      return 'destructive';
    default:
      return 'idle';
  }
});

const loadingHint = computed(() => LOADING_HINTS[hintIndex.value % LOADING_HINTS.length]);

/** 有没有足够的数据可分析 */
const hasData = computed(() => {
  const live = mapStore.liveWeather;
  const forecasts = mapStore.forecasts;
  const tide = mapStore.tideData;
  return Boolean(live || (forecasts && forecasts.length > 0) || tide);
});

const weatherUpdated = computed(() => formatMoment(mapStore.liveWeather?.obsTime));
const tideUpdated = computed(() => formatMoment(mapStore.tideData?.updateTime));

/**
 * 拼装送进模型的载荷。
 *
 * 形状与后端 `weather_data` 一致，字段名不改 —— 改了后端就认不出。
 * 天气和潮汐都取 store 里已经拿好的那一份，不重新请求。
 *
 * fishingIndex 只挑五个字段，不整份塞进去：
 * enriched 响应里的 indexData 嵌套着 current_weather / forecasts / tide_data，
 * 和上面三项重复。整份送等于同样的数据发两遍，模型那边的上下文也白占。
 */
const payload = computed<WeatherAnalysisPayload>(() => {
  const index = mapStore.indexData;

  return {
    liveWeather: mapStore.liveWeather,
    forecasts: mapStore.forecasts,
    tideData: mapStore.tideData,
    weatherIndices: mapStore.weatherIndices,
    fishingIndex: index
      ? {
          fishing_index: index.fishing_index,
          expert_score: index.expert_score,
          residual: index.residual,
          level: index.level,
          feature_breakdown: index.feature_breakdown,
        }
      : undefined,
    locationName: mapStore.locationName || '钓鱼地点',
    tideSpotName: mapStore.panelTideSpotName,
    generatedAt: formatDateTime(),
  };
});

function onGenerate() {
  if (!hasData.value || isStreaming.value) return;
  reasoningOpen.value = false;
  start(payload.value, AI_MODELS[0].id);
}

function onStop() {
  stop();
}

function onClose() {
  // 关闭时掐断流：面板没了还在跑，网络和 token 都在白烧
  stop();
  emit('close');
}

/* 提示文案轮播：只在生成中转，停下来就停 */
watch(isStreaming, (streaming) => {
  if (streaming) {
    hintTimer = setInterval(() => {
      hintIndex.value += 1;
    }, 1800);
    return;
  }
  if (hintTimer) {
    clearInterval(hintTimer);
    hintTimer = null;
  }
});

/* 面板重新打开时清掉上一轮的结果，别让旧内容躺在那儿冒充这次的分析 */
watch(
  () => props.open,
  (open) => {
    if (open) return;
    reasoningOpen.value = false;
  },
);
</script>

<style lang="scss" scoped>
/* 头部 */
.analysis__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0 40rpx 24rpx;
}

.analysis__header-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

/* 抽屉的标题比页面内的分区标题大一档：这一屏只有它一个主角 */
.analysis__title {
  color: $fish-ink;
  @include fish-type(title2);
}

.analysis__subtitle {
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

/* 状态徽章 */
.analysis__badge {
  flex-shrink: 0;
  padding: 6rpx 20rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

.analysis__badge--accent {
  background-color: rgba(0, 122, 255, 0.12);
}

.analysis__badge--success {
  background-color: rgba(52, 199, 89, 0.14);
}

.analysis__badge--destructive {
  background-color: rgba(255, 59, 48, 0.12);
}

.analysis__badge-text {
  color: $fish-muted;
  @include fish-type(caption2);
}

.analysis__badge--accent .analysis__badge-text {
  color: $fish-blue-600;
  font-weight: 600;
}

.analysis__badge--success .analysis__badge-text {
  color: $fish-success-ink;
  font-weight: 600;
}

.analysis__badge--destructive .analysis__badge-text {
  color: $fish-destructive;
  font-weight: 600;
}

/* 内容区 */
.analysis__content {
  padding: 0 40rpx 64rpx;
}

/* 工具条 */
.analysis__toolbar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 28rpx;
}

/* 模型名。做成一枚 chip：它是这一行的说明，不是可点的控件 */
.analysis__model {
  display: flex;
  align-items: center;
  padding: 12rpx 24rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

.analysis__model-name {
  color: $fish-ink;
  @include fish-type(subhead);
}

/*
 * 按钮。
 *
 * 88rpx = 44pt，正好是 Apple 判定为「可放心点按」的最小命中尺寸。
 * 按下即反馈（fish-press），抬手回弹用满 260ms ——
 * 两段时长一短一长，是 iOS 按压手感的关键，缺一段立刻变塑料。
 */
.analysis__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  border-radius: $fish-radius-pill;
  @include fish-press(0.97);
}

/* 主按钮用品牌渐变：一个方向上的三个色标读作同一种品牌色的切面 */
.analysis__btn--primary {
  background-image: $fish-gradient;
  box-shadow: $smooth-shadow-sm;
}

.analysis__btn--stop {
  background-color: $fish-surface;
}

.analysis__btn--disabled {
  opacity: 0.4;
}

.analysis__btn-text {
  color: $fish-ink;
  @include fish-type(callout);
}

/* 实心按钮上的文字必须反色：pill 的蓝底够深，沿用深色文字会糊在底色里 */
.analysis__btn-text--onaccent {
  color: #ffffff;
  font-weight: 600;
}

/* 空态 */
.analysis__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}

.analysis__empty-title {
  color: $fish-muted;
  @include fish-type(callout);
}

.analysis__empty-text {
  margin-top: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 思考过程 */
.analysis__reasoning {
  margin-bottom: 24rpx;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid $fish-border-40;
}

.analysis__reasoning-head {
  display: flex;
  align-items: center;
  @include fish-press-dim;
}

/* 展开时旋转 90°。用 transform 而不是换图标，省一张图 */
.analysis__caret {
  margin-right: 8rpx;
  color: $fish-muted;
  @include fish-type(callout);

  transition: transform 200ms $fish-ease-out;
}

.analysis__caret--open {
  transform: rotate(90deg);
}

.analysis__reasoning-label {
  color: $fish-muted;
  @include fish-type(caption);
}

.analysis__reasoning-text {
  display: block;
  margin-top: 12rpx;
  color: $fish-muted;
  @include fish-type(caption);

  line-height: 1.6;
  white-space: pre-wrap;
}

/* 加载态 */
.analysis__loading {
  padding: 8rpx 0 24rpx;
}

.analysis__loading-text {
  color: $fish-muted;
  @include fish-type(subhead);
}

/* 骨架：三条不等长的灰条，暗示「下面会有内容」 */
.analysis__skeleton {
  margin-top: 24rpx;
}

.analysis__skeleton-line {
  height: 24rpx;
  margin-bottom: 16rpx;
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
}

.analysis__skeleton-line--short {
  width: 60%;
}

.analysis__skeleton-line--mid {
  width: 80%;
}

/* 结果 */
.analysis__result {
  padding-bottom: 8rpx;
}

/* 占位 */
.analysis__placeholder {
  padding: 80rpx 0;
}

.analysis__placeholder-text {
  color: $fish-muted;
  @include fish-type(callout);
}

/* 错误 */
.analysis__error {
  margin-top: 24rpx;
  padding: 20rpx 24rpx;
  border-radius: $fish-radius-sm;
  background-color: rgba(255, 59, 48, 0.1);
}

.analysis__error-text {
  color: $fish-destructive;
  @include fish-type(subhead);
}

/* 脚注 */
.analysis__foot {
  display: flex;
  flex-direction: column;
  margin-top: 40rpx;
}

.analysis__foot-text {
  color: $fish-muted-60;
  @include fish-type(caption2);

  line-height: 1.6;
}
</style>
