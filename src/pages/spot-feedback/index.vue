<template>
  <!--
    钓点纠错反馈页 —— 提交一条「这条钓点的信息不对」。

    它是一个**独立分包**里的独立页面：分包之间不能互相引用资源，
    所以这里不能用 spot-detail 分包里的 store，自己取一次钓点。
  -->
  <view class="spot-form" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <PageNav :title="title" :scrolled="scrolled" fallback-url="/pages/fishing/index" />

    <view class="spot-form__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!-- 会话还在恢复。这段期间不该显示成「未登录」 -->
      <view v-if="!ready" class="spot-feedback__notice">
        <text class="spot-feedback__notice-text">{{ loadingText }}</text>
      </view>

      <!--
        未登录。
        反馈要挂一个提交人，后端没有「游客反馈」这回事 —— 所以这里给一条登录的出路，
        而不是把用户丢回上一页。
      -->
      <view v-else-if="!session.loggedIn" class="spot-feedback__empty">
        <text class="spot-feedback__empty-title">{{ empty.title }}</text>
        <text class="spot-feedback__empty-hint">{{ empty.hint }}</text>
        <view class="spot-feedback__empty-action" @tap="onLogin">
          <text class="spot-feedback__empty-action-text">{{ empty.action }}</text>
        </view>
      </view>

      <!-- 取钓点信息 -->
      <view v-else-if="loading" class="spot-feedback__notice">
        <text class="spot-feedback__notice-text">{{ loadingText }}</text>
      </view>

      <template v-else>
        <!--
          上下文：这条钓点现在写的是什么。

          「收费变更」这类反馈要用户对比着填才说得清 ——
          不知道现在写的是多少，他说不出该改成多少。
        -->
        <view v-if="contextName" class="spot-feedback__context">
          <text class="spot-feedback__context-name">{{ contextName }}</text>
          <text v-if="currentFeeLabel" class="spot-feedback__context-fee">{{ currentFeeText }}</text>
        </view>

        <SpotFeedbackForm :submitting="submitting" @submit="onSubmit" />
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点纠错反馈页。
 *
 * 页面负责编排：取这条钓点的当前信息、把表单攒好的载荷发出去、
 * 把结果讲给用户听。表单本身在 `SpotFeedbackForm` 里。
 *
 * ⚠️ **反馈不公开**：提交完只有一句「已提交，我们会核实」，
 * 然后退回详情页。这里没有「我的反馈」入口，后端也没有那个端点 ——
 * 别在这儿加一个。
 */
import { computed, ref } from 'vue';
import { onLoad, onPageScroll } from '@dcloudio/uni-app';

import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import SpotFeedbackForm from '@/components/SpotFeedbackForm/SpotFeedbackForm.vue';
import { fishingSpotApi, fishingSpotFeedbackApi } from '@/api/fishing';
import { ApiError } from '@/api/client';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import {
  SPOT_FEEDBACK_CURRENT,
  SPOT_FEEDBACK_EMPTY,
  SPOT_FEEDBACK_ERRORS,
  SPOT_FEEDBACK_LOADING,
  SPOT_FEEDBACK_SUBMITTED,
  SPOT_FEEDBACK_TITLE,
} from '@/constants/spot-feedback';
import { useSessionStore } from '@/stores/session';
import { fishingSpotFeeLabel, type FishingSpot, type FishingSpotFeedbackPayload } from '@/types/fishing';
import { toErrorMessage } from '@/utils/error';
import { haptic } from '@/utils/haptics';

const session = useSessionStore();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const title = SPOT_FEEDBACK_TITLE;
const empty = SPOT_FEEDBACK_EMPTY;
const errors = SPOT_FEEDBACK_ERRORS;
const loadingText = SPOT_FEEDBACK_LOADING;

/**
 * 提交成功后退回上一页的延时（ms）。
 *
 * toast 要先把字显示出来，再把人送回去 —— 立刻 navigateBack 的话
 * 用户只看见页面一闪，回去了却不知道成没成。
 */
const NAVIGATE_DELAY_MS = 800;

/** 导航栏材质层要不要显形 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

/* ── 状态 ──────────────────────────────────────────────────────────────── */

/** 会话恢复完了没有。这段期间不该显示成「未登录」 */
const ready = ref(false);

/** 钓点的 public id。URL 上带来的 */
const spotId = ref('');

/** 这条钓点。取回来只是为了给用户一个对照 */
const spot = ref<FishingSpot | null>(null);

/** 钓点在飞 */
const loading = ref(false);

/** 正在提交。锁住按钮，防连点发两次 */
const submitting = ref(false);

/* ── 派生 ──────────────────────────────────────────────────────────────── */

/** 上下文那一行显示的钓点名 */
const contextName = computed(() => spot.value?.name ?? '');

/** 现在页面上写的收费 */
const currentFeeLabel = computed(() => {
  const current = spot.value;
  if (!current?.fee_type) return '';
  return fishingSpotFeeLabel(current.fee_type, current.fee_amount);
});

/** 上下文那一行的收费文案 */
const currentFeeText = computed(() => `${SPOT_FEEDBACK_CURRENT}${currentFeeLabel.value}`);

/* ── 取数 ──────────────────────────────────────────────────────────────── */

/**
 * 取这条钓点。
 *
 * 读不到也不拦着提交 —— 上下文只是给用户对照用的，
 * 反馈端点自己会验钓点在不在。所以失败只是把上下文那一行藏掉。
 */
async function loadSpot(): Promise<void> {
  if (!spotId.value) return;

  loading.value = true;

  try {
    spot.value = await fishingSpotApi.getByIdWithSession(spotId.value);
  } catch {
    spot.value = null;
  } finally {
    loading.value = false;
  }
}

/**
 * 进页面。
 *
 * 先恢复会话再取数：冷启动时内存里没有用户，
 * 拿不到 token 就先别发请求 —— 那必然 401。
 */
async function enter(): Promise<void> {
  await session.restore();
  ready.value = true;

  if (session.loggedIn) await loadSpot();
}

onLoad((options) => {
  const id = options?.id;
  if (!id) {
    uni.showToast({ title: errors.spotMissing, icon: 'none' });
    setTimeout(goBack, NAVIGATE_DELAY_MS);
    return;
  }

  spotId.value = id;
  void enter();
});

/* ── 交互 ──────────────────────────────────────────────────────────────── */

/**
 * 登录。
 *
 * `wx.login` 是静默的 —— 用户看不到弹窗，账号也是服务端自动建的。
 */
async function onLogin(): Promise<void> {
  try {
    await session.login();
    await loadSpot();
  } catch {
    uni.showToast({ title: errors.loginFailed, icon: 'none' });
  }
}

/** 提交 */
async function onSubmit(payload: FishingSpotFeedbackPayload): Promise<void> {
  if (submitting.value) return;

  submitting.value = true;

  try {
    await fishingSpotFeedbackApi.submit(spotId.value, payload);

    /*
     * 提交成功只回一句话。
     *
     * 不弹窗、不给「查看我的反馈」的入口 —— 反馈不公开，
     * 提交者看不到状态，也没有地方能看到状态。
     */
    // 确认只靠一条两秒的 toast，两秒后页面就退回去了 —— 震一下把结果留下来
    haptic('medium');
    uni.showToast({ title: SPOT_FEEDBACK_SUBMITTED, icon: 'none', duration: 2000 });
    setTimeout(goBack, NAVIGATE_DELAY_MS);
  } catch (err) {
    submitting.value = false;
    haptic('heavy');
    uni.showToast({ title: errorCopy(err), icon: 'none' });
  }
}

/**
 * 错误文案。
 *
 * 后端给的是「duplicate_feedback: …」这种带错误码的串，
 * 直接甩给用户看不像人话 —— 常见的几种按状态码换成自己的话。
 */
function errorCopy(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.statusCode === 409) return errors.duplicate;
    if (err.statusCode === 404) return errors.spotMissing;
    if (err.statusCode === 401) return errors.loginRequired;
  }
  return stripErrorCode(toErrorMessage(err, errors.submitFailed));
}

/**
 * 去掉后端错误文案前面的机器码。
 *
 * 后端给的是「invalid_feedback_payload: 反馈说明需 5-500 字…」这种串，
 * 前半截是给日志看的，后半截才是给人看的。砍掉前半截，
 * toast 里剩下的才是用户读得懂的那句。
 */
function stripErrorCode(message: string): string {
  return message.replace(/^[a-z_]+:\s*/, '');
}

/** 回上一页 */
function goBack(): void {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.switchTab({ url: '/pages/fishing/index' });
    },
  });
}
</script>

<style lang="scss" scoped>
@use '@/styles/shared/spot-form.scss';

/*
 * 载入提示。
 *
 * 这块不在共用样式里 —— 「载入中」是这一页独有的。
 */
.spot-feedback__notice {
  padding: 96rpx 32rpx;
  text-align: center;
}

.spot-feedback__notice-text {
  color: $fish-muted;
  @include fish-type(callout);
}

/*
 * 未登录时的空态。
 *
 * 不是一张卡，是居中的一段话 —— 空态不是内容，
 * 硬套一张卡反而像坏了。跟「我的钓点」那页的空态同一套。
 */
.spot-feedback__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 48rpx;
  text-align: center;
}

.spot-feedback__empty-title {
  color: $fish-ink;
  @include fish-type(title3);
}

.spot-feedback__empty-hint {
  margin-top: 12rpx;
  color: $fish-muted;
  @include fish-type(callout);
}

/* 空态里的那个按钮 */
.spot-feedback__empty-action {
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

.spot-feedback__empty-action-text {
  color: $fish-on-accent;
  @include fish-type(callout);

  font-weight: 600;
}

/*
 * 上下文：这条钓点现在写的是什么。
 *
 * 放在表单上面，一句话两行 —— 它是这次反馈要对照的那份信息，
 * 不是表单里的一栏，所以不跟表单的卡片混在一起。
 */
.spot-feedback__context {
  padding: 40rpx 32rpx 0;
}

.spot-feedback__context-name {
  display: block;
  color: $fish-ink;
  @include fish-type(title3);
}

.spot-feedback__context-fee {
  display: block;
  margin-top: 8rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}
</style>
