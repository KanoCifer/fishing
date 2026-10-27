<template>
  <SnapSheet :open="open" :snap-points="SNAP_POINTS" :initial-snap="1" @close="onClose">
    <template #header>
      <view class="analysis__head">
        <image class="analysis__head-icon" :src="sparklesIcon" mode="widthFix" />
        <text class="analysis__title">渔碌建议</text>
      </view>
    </template>

    <view class="analysis__content">
      <!--
        没有天气数据：先说清为什么不能生成。

        这一屏只有一张「问句」，不是一堆说明文字 ——
        问句本身就是入口，用户看到问题就想按按钮。
      -->
      <view v-if="!hasData" class="analysis__empty">
        <text class="analysis__empty-title">等待天气与潮汐数据</text>
        <text class="analysis__empty-text">数据到位后即可生成建议</text>
      </view>

      <template v-else>
        <!--
          还没生成：一句话的问句。

          不写「点下方按钮，拿到今天的出行与垂钓建议」——
          按钮就在下面，写出来是同一件事说两遍。
          问句换一种说法：用户读到的是一个具体的问题，不是一条操作说明。
        -->
        <view v-if="!hasStarted" class="analysis__empty">
          <text class="analysis__empty-title">今天适合几点去？</text>
          <text class="analysis__empty-text">用天气与潮汐给你一个窗口</text>
        </view>

        <!--
          思考过程：一枚胶囊。

          原先把思考过程做成正文上方一个带分隔线的块，占着结论的位置。
          收成一枚胶囊后，它退到背景里 —— 想看的人点开，不关心的人看不见。

          生成中时胶囊上是那句「正在做什么」的提示（跟着滚动轮播），
          生成完才变成「思考过程」这个可展开的标签 ——
          同一枚胶囊，先说进度、后说内容。
        -->
        <view v-if="showChip" class="analysis__chip" @tap="onToggleReasoning">
          <image class="analysis__chip-icon" :src="chevronIcon" mode="widthFix" />
          <text class="analysis__chip-text">{{ chipLabel }}</text>
        </view>

        <!-- 展开的思考过程。胶囊正下方，不另开一块地方 -->
        <view v-if="reasoningOpen && reasoning" class="analysis__reasoning">
          <text class="analysis__reasoning-text">{{ reasoning }}</text>
        </view>

        <!-- 生成中：打字点。骨架屏留给「形状可预知」的加载，回答的形状不可预知 -->
        <view v-if="isStreaming && !summary" class="analysis__bubble analysis__bubble--typing">
          <view class="analysis__typing">
            <view class="analysis__typing-dot" />
            <view class="analysis__typing-dot" />
            <view class="analysis__typing-dot" />
          </view>
        </view>

        <!-- 结果 -->
        <view v-else-if="summary" class="analysis__bubble">
          <MarkdownView :content="summary" />
        </view>

        <!-- 错误 -->
        <view v-if="errorMessage" class="analysis__error">
          <text class="analysis__error-text">{{ errorMessage }}</text>
        </view>

        <!--
          脚注：三行并成一行。

          原来分两行写「天气更新 / 潮汐更新」，那是两行说明文字抢结论的视线。
          并成一行放在最下面：模型名 + 两个时间戳，一眼扫过就行。
        -->
        <text v-if="hasStarted" class="analysis__foot">{{ footText }}</text>
      </template>
    </view>

    <template #footer>
      <!--
        动作区：固定在面板底部，不跟着正文滚。

        原来按钮在正文最上面，AI 写完一屏长建议之后，
        「重新生成」就被推出视野了 —— 而那恰恰是最想按的时候。
      -->
      <view class="analysis__actions">
        <!--
          流光按钮拆两层：外壳管光，内层管面。

          单层做不了 —— transform 会创建层叠上下文，把外壳里
          z-index: -1 的光晕从「垫在按钮底下」翻成「画在按钮底色之上」，
          按下时白色面就整块消失。理由写在 _motion.scss 的 fish-flow-face 里。
        -->
        <view class="analysis__btn" :class="{ 'analysis__btn--disabled': !hasData }" @tap="onAction">
          <view class="analysis__btn-face">
            <text class="analysis__btn-text">{{ actionLabel }}</text>
          </view>
        </view>
      </view>
    </template>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * AI 建议面板 —— SnapSheet 承载，内容来自大模型流式分析。
 *
 * 数据全部来自 store，组件不自己取数 —— 天气和潮汐已经在 store 里了，
 * 再取一次是白花一次往返。
 *
 * 界面走「对话」方向：一枚思考胶囊 + 一枚回答气泡。
 * 规则来自 docs/design-system.md 的「一件事只说一遍」一节 ——
 * 旧版把状态徽章、按钮文案、占位文案放在三处说同一件事，
 * 且结果裸铺在白底上没有材质分层。这一版按「谁来说」分开：
 * 状态由胶囊说，动作由按钮说，占位由问句说。
 *
 * 与源项目（kanocifer-chat-frontend）的 WeatherAnalysis 组件的差异，
 * 除了平台差异，也是版式差异：
 * - 源版是桌面右侧悬浮卡，这里是底部 SnapSheet（小程序没有 hover 下拉）
 * - 源版用 DOMPurify + v-html 渲染 Markdown，这里走 mp-html（小程序不能碰 DOM）
 * - 源版用 AbortController 取消，这里用 RequestTask.abort（小程序没有 AbortController）
 * - 源版模型选择是 HoverDropdown，这里只有静态标签（后端上更多模型时换回 picker）
 * - 源版把状态与动作都摆在正文顶部，这里动作区挪进 SnapSheet 的 footer 插槽
 */
import { computed, ref, watch } from 'vue';

import { AI_MODELS } from '@/api/ai';
import { useFishingAnalysis } from '@/composables/useFishingAnalysis';
import { useFishingMapStore } from '@/stores/fishingMap';
import { formatDateTime, formatTimeOfDay } from '@/utils/date';
import { icon } from '@/constants/icons';
import type { WeatherAnalysisPayload } from '@/types/fishing';

import MarkdownView from '../MarkdownView/MarkdownView.vue';
import SnapSheet from '../SnapSheet/SnapSheet.vue';

const SNAP_POINTS = [55, 88] as const;

/** 胶囊标签的三种说法。模型名是静态标签，模型多了再换成 picker */
const MODEL_NAME = AI_MODELS[0]?.name ?? '';

/**
 * 生成中轮播的提示文案。
 *
 * 这几句是「正在做什么」的实感，不是装饰 ——
 * 一段十秒的等待，没有这几句就只剩一个转圈，用户不知道卡在哪一步。
 */
const LOADING_HINTS = ['正在整理天气变化…', '正在评估体感与风况…', '正在结合潮汐节奏…'];

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const mapStore = useFishingMapStore();
const { status, summary, reasoning, errorMessage, start, stop } = useFishingAnalysis();

const sparklesIcon = icon('sparkles', 'blue600');
const chevronDownIcon = icon('chevron-down', 'muted60');
const chevronRightIcon = icon('chevron-right', 'muted60');

/** 思考过程默认收起 */
const reasoningOpen = ref(false);

/** 提示文案的轮播下标 */
const hintIndex = ref(0);
let hintTimer: ReturnType<typeof setInterval> | null = null;

const isStreaming = computed(() => status.value === 'streaming');
const hasGenerated = computed(() => status.value === 'done' || status.value === 'stopped');

const loadingHint = computed(() => LOADING_HINTS[hintIndex.value % LOADING_HINTS.length]);

/**
 * 这轮生成开始了没有。
 *
 * 生成中和生成完都算「开始了」—— 胶囊与脚注在这两种状态下都在。
 * 只有从没点过按钮的空闲态才不显示它们。
 */
const hasStarted = computed(() => isStreaming.value || hasGenerated.value || Boolean(errorMessage.value));

/**
 * 胶囊什么时候出现。
 *
 * 三种情况：生成中（正在想）、有思考内容（可展开）、出错了（说明失败）。
 * 空闲态不出现 —— 空闲时面板上该说的是那句问句。
 */
const showChip = computed(() => isStreaming.value || Boolean(reasoning.value) || Boolean(errorMessage.value));

/** 胶囊上的图标：展开时向下，收起时向右 */
const chevronIcon = computed(() => (reasoningOpen.value ? chevronDownIcon : chevronRightIcon));

/**
 * 胶囊文案。
 *
 * 三种状态三种说法，但只有一处说状态：
 * 生成中 → 正在做什么（轮播）；完成 → 「思考过程」这个可展开的标签；
 * 出错 → 「生成失败」。
 * 徽章那种「待生成 / 生成中 / 已生成 / 已停止 / 生成失败」全撤了 ——
 * 动作由按钮说（生成建议 / 停止 / 重新生成），状态再单独列一遍就是重复。
 */
const chipLabel = computed(() => {
  if (errorMessage.value) return '获取失败';
  if (isStreaming.value) return loadingHint.value;
  return '思考过程';
});

/** 按钮文案。空闲与出错是同一件事：还没拿到结果，按钮就是让它发生 */
const actionLabel = computed(() => {
  if (isStreaming.value) return '停止';
  if (hasGenerated.value) return '重新获取';
  return '获取建议';
});

/** 有没有足够的数据能给出建议 */
const hasData = computed(() => {
  const live = mapStore.liveWeather;
  const forecasts = mapStore.forecasts;
  const tide = mapStore.tideData;
  return Boolean(live || (forecasts && forecasts.length > 0) || tide);
});

const weatherUpdated = computed(() => formatTimeOfDay(mapStore.liveWeather?.obsTime));
const tideUpdated = computed(() => formatTimeOfDay(mapStore.tideData?.updateTime));

/**
 * 脚注：模型 + 两个时间戳，挤成一行。
 *
 * 原来分两行写「天气更新 / 潮汐更新」，两行说明文字会跟结论抢视线。
 * 并成一行后它是一句落款，一眼扫过就行。
 */
const footText = computed(() => {
  /*
   * 显式标成 string[]：
   * 不标的话 parts 被推成 ("DeepSeek Flash")[] —— 元素类型窄成了那个字面量，
   * 往里 push 「天气 10:24」就推不进去了。
   */
  const parts: string[] = [MODEL_NAME];
  if (weatherUpdated.value) parts.push(`天气 ${weatherUpdated.value}`);
  if (tideUpdated.value) parts.push(`潮汐 ${tideUpdated.value}`);
  return parts.join(' · ');
});

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

function onAction() {
  // 生成中按这个键是「停」，不是「再生成一次」
  if (isStreaming.value) {
    stop();
    return;
  }
  onGenerate();
}

function onGenerate() {
  if (!hasData.value || isStreaming.value) return;
  reasoningOpen.value = false;
  start(payload.value, AI_MODELS[0].id);
}

function onToggleReasoning() {
  reasoningOpen.value = !reasoningOpen.value;
}

function onClose() {
  // 关闭时掐断流：面板没了还在跑，网络和 token 都在白烧
  stop();
  emit('close');
}

/* 面板重新打开时清掉上一轮的结果，别让旧内容躺在那儿冒充这次的建议 */
watch(
  () => props.open,
  (open) => {
    if (open) return;
    reasoningOpen.value = false;
  },
);

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
</script>

<style lang="scss" scoped>
/*
 * 头部
 *
 * 图标 + 标题一行：这一屏的标题是「谁在说话」，不是一句说明。
 * 副标题撤了 —— 「基于当前天气与潮汐综合判断」是解释，
 * 而这一屏只有它一个主角，不需要解释自己是谁。
 */
.analysis__head {
  display: flex;
  align-items: center;
  padding: 0 40rpx 20rpx;
}

.analysis__head-icon {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
  margin-right: 12rpx;
}

.analysis__title {
  color: $fish-ink;
  @include fish-type(title3);
}

/* 内容区 */
.analysis__content {
  padding: 0 40rpx 40rpx;
}

/*
 * 空态与问句
 *
 * 两种空态共用一套版式：一个问句 + 一行注解。
 * 问句是主体，注解压到最弱 —— 它只是补一句上下文。
 */
.analysis__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 96rpx 0 120rpx 0;
}

.analysis__empty-title {
  color: $fish-ink;
  @include fish-type(title3);
}

.analysis__empty-text {
  margin-top: 12rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

/*
 * 思考胶囊
 *
 * 一枚药丸，不是一块分隔线下的正文。
 * 收进胶囊的代价是它变小了 —— 那是故意的：
 * 思考是过程，结论才是这一屏要说的。
 */
.analysis__chip {
  display: inline-flex;
  align-items: center;
  height: 48rpx;
  padding: 0 20rpx 0 16rpx;
  margin-bottom: 20rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
  @include fish-press-dim;
}

.analysis__chip-icon {
  width: 20rpx;
  height: 20rpx;
  flex-shrink: 0;
  margin-right: 6rpx;
}

.analysis__chip-text {
  color: $fish-muted;
  @include fish-type(caption2);
}

/* 展开的思考过程。紧跟胶囊，不另起一块地方 */
.analysis__reasoning {
  margin-bottom: 20rpx;
  padding: 20rpx 24rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-surface;
}

.analysis__reasoning-text {
  display: block;
  color: $fish-muted;
  @include fish-type(caption);

  line-height: 1.6;
  white-space: pre-wrap;
}

/*
 * 回答气泡
 *
 * 一层浅灰底把正文从面板白底上托起来。
 * 没有这一层，Markdown 正文直接铺在白底上，跟面板底色是同一张面 ——
 * 读起来像「面板里的一段字」，不像「一句回答」。
 */
.analysis__bubble {
  padding: 24rpx 28rpx;
  border-radius: $fish-radius-card;
  background-color: $fish-surface;
}

/* 打字点。气泡在生成中只有这三个点 */
.analysis__bubble--typing {
  padding: 28rpx 28rpx;
}

.analysis__typing {
  display: flex;
  align-items: center;
  height: 36rpx;
}

.analysis__typing-dot {
  width: 10rpx;
  height: 10rpx;
  margin-right: 8rpx;
  border-radius: 50%;
  background-color: $fish-faint;
  animation: fish-typing 1.2s $fish-ease-out infinite;
}

/*
 * 三个点错开 160ms。
 *
 * nth-child 选的是第二个和第三个点，延迟逐个往后挪 ——
 * 三个点同时跳是「加载」，依次跳才是「在打字」。
 */
.analysis__typing-dot:nth-child(2) {
  animation-delay: 160ms;
}

.analysis__typing-dot:nth-child(3) {
  animation-delay: 320ms;
}

/*
 * 错误
 *
 * 文字用 $fish-destructive-ink 而不是 $fish-destructive：
 * 后者是填充色（#ff3b30），白底上只有 2.6:1，15pt 的正文读不清。
 * 底色用令牌层的 $fish-destructive-tint，不写裸 rgba。
 */
.analysis__error {
  margin-top: 20rpx;
  padding: 20rpx 24rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-destructive-tint;
}

.analysis__error-text {
  color: $fish-destructive-ink;
  @include fish-type(subhead);
}

/* 脚注。一行落款 */
.analysis__foot {
  display: block;
  margin-top: 24rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/*
 * 底部动作区
 *
 * 固定在面板底部，正文滚走它留在原地。
 * SnapSheet 的 footer 插槽就是干这个的（见 SnapSheet 的模板注释）。
 */
.analysis__actions {
  padding: 12rpx 40rpx 32rpx;
  border-top: 1rpx solid $fish-border-40;

  /*
   * 自己成为层叠上下文。
   *
   * 流光按钮的外发光是 z-index: -1 的伪元素。这里不成上下文的话，它会一路掉到
   * .snap-sheet 那层去，被抽屉面板的白底盖住，光晕就一点也看不见。
   * 成了上下文，光晕落在动作区这一层的底 —— 正好垫在按钮底下。
   */
  position: relative;
  z-index: 0;
}

/*
 * 按钮 —— 外壳，只负责「光」。
 *
 * 外壳不能带 transform：带了就会建立层叠上下文，
 * 把外壳里的 z-index: -1 光晕从「垫在按钮底下」翻成「压在按钮面上」，
 * 按下时白色面会整块消失（见 _motion.scss 的 fish-flow-face）。
 * 所以按下缩放放在内层。
 */
.analysis__btn {
  @include fish-flow;
}

/*
 * 按钮 —— 内层，负责「面」与手感。
 *
 * 88rpx = 44pt，正好是 Apple 判定为「可放心点按」的最小命中尺寸。
 * 按下即反馈（fish-flow-face 内含），抬手回弹用满 260ms ——
 * 两段时长一短一长，是 iOS 按压手感的关键，缺一段立刻变塑料。
 *
 * 面色留白：这一屏的注意力给流光描边，不给色块。
 * 阴影留着 —— 面板是块裸白底，白面按钮全靠它才浮得起来。
 *
 * 声明写在 @include 之前：fish-flow-face 里有嵌套规则，
 * 排在它后面的声明会触发 Sass 的 mixed-decls 弃用警告。
 */
.analysis__btn-face {
  box-shadow: $smooth-shadow-sm;
  @include fish-flow-face;
}

.analysis__btn--disabled {
  opacity: 0.4;
}

.analysis__btn-text {
  color: $fish-ink;
  @include fish-type(callout);

  font-weight: 600;
}
</style>
