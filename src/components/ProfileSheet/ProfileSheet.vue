<template>
  <!--
    资料编辑 —— 头像与昵称。

    两件事分开处理，因为它们的时机不一样：

    - **头像**：chooseAvatar 给的是临时地址，1–5 分钟就失效，所以一选到就
      当场上传，不等用户点保存。
    - **昵称**：随登录请求提交，服务端在「这个账号还没有昵称」时才写入，
      所以它要等用户点保存（见 saveNickname 的注释）。

    抽屉用项目里已有的 SnapSheet —— 与钓点详情、钓鱼反馈同一种浮层，
    三处抽屉共用一个容器，才谈得上「同一个手势、同一种落位」。
  -->
  <SnapSheet :open="open" :snap-points="SNAP_POINTS" :initial-snap="0" @close="emit('close')">
    <template #header>
      <view class="profile-sheet__header">
        <text class="profile-sheet__title">{{ title }}</text>
        <text class="profile-sheet__subtitle">{{ subtitle }}</text>
      </view>
    </template>

    <view class="profile-sheet__body">
      <!--
        头像。

        ⚠️ 必须是原生 <button open-type="chooseAvatar">：微信的头像选择器
        只对带这个 open-type 的按钮开放，没有等价的 JS 接口。
        微信 button 自带外边距和 ::after 描边，这里要一并清掉。
      -->
      <view class="profile-sheet__avatar-row">
        <button
          class="profile-sheet__avatar-btn"
          open-type="chooseAvatar"
          hover-class="none"
          @chooseavatar="onChooseAvatar"
        >
          <image v-if="avatarSrc" class="profile-sheet__avatar" :src="avatarSrc" mode="aspectFill" />
          <image v-else class="profile-sheet__avatar-glyph" :src="userGlyph" mode="aspectFit" />
        </button>

        <text class="profile-sheet__avatar-hint">{{ avatarHint }}</text>
      </view>

      <!-- 昵称 -->
      <text class="profile-sheet__label">昵称</text>

      <!--
        已经有昵称时不给改。
        不是保守，是服务端目前没有独立的改昵称接口：昵称只在登录请求里带过去，
        且仅在账号昵称为空时才写入（见接入文档 §6「已知缺口」）。
        给一个改不动的输入框，比说清楚更糟。
      -->
      <input
        v-if="!hasName"
        v-model="nickname"
        class="profile-sheet__input"
        type="nickname"
        placeholder="点一下，用微信昵称填入"
        placeholder-class="fish-placeholder"
        :maxlength="20"
        confirm-type="done"
        @blur="onNicknameSync"
        @confirm="onNicknameSync"
      />
      <view v-else class="profile-sheet__locked">
        <text class="profile-sheet__locked-text">{{ user?.name }}</text>
      </view>

      <text class="profile-sheet__note">
        {{
          hasName
            ? '昵称在首次设置后不可修改。头像可以随时更换。'
            : '昵称将作为你在渔碌的称呼。带表情和空格都可以，最多 20 字。'
        }}
      </text>

      <view class="profile-sheet__actions">
        <view class="profile-sheet__btn profile-sheet__btn--ghost" @tap="emit('close')">
          <text class="profile-sheet__btn-text">关闭</text>
        </view>
        <view
          class="profile-sheet__btn profile-sheet__btn--primary"
          :class="{ 'profile-sheet__btn--disabled': !canSave }"
          @tap="save"
        >
          <text class="profile-sheet__btn-text">{{ saving ? '保存中…' : '保存' }}</text>
        </view>
      </view>
    </view>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * ProfileSheet —— 头像与昵称的编辑抽屉。
 *
 * 只管排版和采集，实际动作（上传、保存）交给上层：
 * 头像选到即上传（临时地址等不得），昵称点保存才提交。
 */
import { computed, ref, watch } from 'vue';

import { mediaUrl } from '@/api/upload';
import { icon } from '@/constants/icons';
import type { AuthUser } from '@/types/auth';

import SnapSheet from '../SnapSheet/SnapSheet.vue';

const SNAP_POINTS = [58, 88] as const;

const props = defineProps<{
  open: boolean;
  user: AuthUser | null;
  /** 正在保存昵称 */
  saving?: boolean;
  /** 正在上传头像 */
  uploading?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  /** 选了新头像。参数是 chooseAvatar 的临时路径 */
  chooseAvatar: [tempPath: string];
  /** 保存昵称 */
  save: [nickname: string];
}>();

const nickname = ref('');

const hasName = computed(() => !!props.user?.name?.trim());

const title = computed(() => (hasName.value ? '编辑资料' : '完善资料'));

const subtitle = computed(() => (hasName.value ? '换一张头像，让别人认得出你' : '填上昵称和头像，别人才认得出你'));

/**
 * 头像地址。
 *
 * 服务端回的是相对路径，要拼上媒体根地址才能加载。
 */
const avatarSrc = computed(() => {
  const photo = props.user?.photo;
  if (!photo || photo === 'default.png') return '';
  return mediaUrl(photo);
});

const avatarHint = computed(() => {
  if (props.uploading) return '上传中…';
  return '点这里换一个微信头像';
});

const canSave = computed(() => !props.saving && !hasName.value && nickname.value.trim().length > 0);

/**
 * 打开时把输入框里的昵称清掉。
 *
 * 关着的时候还留着上一次的内容，下次打开会误以为那是新填的 ——
 * 抽屉里残留的输入是最容易让人多操作一次的来源。
 */
watch(
  () => props.open,
  (open) => {
    if (open) nickname.value = '';
  },
);

/**
 * 同步昵称。
 *
 * ⚠️ `input type="nickname"` **必须**监听事件，否则拿到的值不同步：
 * 用户在微信键盘里挑好昵称后，值是随事件带回来的，不监听就是空的。
 *
 * `blur` 和 `confirm` 都监听：微信昵称面板关闭时给的是 blur，
 * 用户自己敲完按完成给的是 confirm，两个都接住才不漏。
 *
 * 事件参数标成 unknown：uni-app 的类型给的是 DOM 的 FocusEvent，
 * 而小程序端实际带的是 `detail.value`（见 @dcloudio/types 的 FocusEvent.detail: number
 * —— 那是浏览器那一套的值，跟这里对不上）。参数放宽、内部自己收窄，
 * 比为了迁就类型去写断言干净。
 */
function onNicknameSync(e: unknown) {
  const detail = (e as { detail?: { value?: unknown } } | undefined)?.detail;
  const value = detail?.value;
  if (typeof value === 'string') nickname.value = value;
}

/**
 * 选到了新头像。
 *
 * ⚠️ 事件名全小写 `chooseavatar` —— 写成 `chooseAvatar` 不报错也不回调，
 * 表现是「点了没反应」。见接入文档的踩坑清单第 1 条。
 *
 * 临时地址只有 1–5 分钟有效，所以立刻交给上层上传，不能攒到点保存。
 */
function onChooseAvatar(e: { detail?: { avatarUrl?: string } }) {
  const tempPath = e.detail?.avatarUrl;
  if (!tempPath) return;
  emit('chooseAvatar', tempPath);
}

function save() {
  if (!canSave.value) return;
  emit('save', nickname.value.trim());
}

const userGlyph = icon('user', 'muted60');
</script>

<style lang="scss" scoped>
.profile-sheet__header {
  padding: 0 40rpx 24rpx;
}

.profile-sheet__title {
  display: block;
  color: $fish-ink;
  @include fish-type(title2);
}

.profile-sheet__subtitle {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

.profile-sheet__body {
  padding: 8rpx 40rpx 64rpx;
}

/*
 * 头像行：头像在左，说明在右。
 *
 * 左边那张圆是「点这里换头像」——它是这一屏里唯一能直接动手的地方，
 * 说明文字跟着它走，指的是它。
 */
.profile-sheet__avatar-row {
  display: flex;
  align-items: center;
  margin-bottom: 40rpx;
}

/* 微信 button 的默认样式要清干净：外边距、背景、边框、::after 描边 */
.profile-sheet__avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 144rpx;
  height: 144rpx;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: $fish-surface;
  overflow: visible;
  line-height: 1;
  font-size: inherit;
  color: inherit;

  &::after {
    border: none;
  }
}

.profile-sheet__avatar {
  width: 144rpx;
  height: 144rpx;
  border-radius: 50%;
}

.profile-sheet__avatar-glyph {
  width: 64rpx;
  height: 64rpx;
}

.profile-sheet__avatar-hint {
  flex: 1;
  margin-left: 28rpx;
  color: $fish-muted;
  @include fish-type(subhead);
}

.profile-sheet__label {
  display: block;
  margin-bottom: 16rpx;
  color: $fish-ink;
  @include fish-type(subhead);
}

/*
 * 昵称输入框。
 *
 * 用 fill 色而不是描边：这一屏只有这一个输入框，描边会读成「这里有一张
 * 表要填」，而它是随手改的一个称呼。
 */
.profile-sheet__input {
  width: 100%;
  height: 88rpx;
  padding: 0 24rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-surface;
  color: $fish-ink;
  font-size: 34rpx;
}

/* 已有昵称时的只读展示 */
.profile-sheet__locked {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 24rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

.profile-sheet__locked-text {
  color: $fish-muted;
  @include fish-type(body);
}

/* 说明。压到 caption2：它是附注，不是这一步的主体 */
.profile-sheet__note {
  display: block;
  margin-top: 16rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

.profile-sheet__actions {
  display: flex;
  margin-top: 48rpx;
}

/* 44pt 命中高度；按下即缩，抬手回弹比按下慢两倍（见令牌层 _motion.scss 的 fish-press） */
.profile-sheet__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  margin: 0 8rpx;
  border-radius: $fish-radius-pill;
  @include fish-press(0.97);
}

.profile-sheet__btn--ghost {
  background-color: $fish-surface;
}

.profile-sheet__btn--primary {
  background-color: $fish-accent;
}

.profile-sheet__btn--disabled {
  opacity: 0.4;
}

.profile-sheet__btn-text {
  color: $fish-ink;
  @include fish-type(callout);
}

.profile-sheet__btn--primary .profile-sheet__btn-text {
  color: #ffffff;
  font-weight: 600;
}
</style>
