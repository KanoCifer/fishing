<template>
  <view class="identity">
    <button
      v-if="loggedIn"
      class="identity__avatar-btn"
      open-type="chooseAvatar"
      hover-class="none"
      @chooseavatar="onChooseAvatar"
    >
      <view class="identity__avatar">
        <image v-if="avatarSrc" class="identity__photo" :src="avatarSrc" mode="aspectFill" />
        <image v-else class="identity__glyph" :src="userGlyph" mode="aspectFit" />

        <view class="identity__badge">
          <image class="identity__badge-icon" :src="cameraIcon" mode="aspectFit" />
        </view>
      </view>
    </button>

    <view v-else class="identity__avatar">
      <image class="identity__glyph" :src="userGlyph" mode="aspectFit" />
    </view>

    <view class="identity__text">
      <text class="identity__name" :class="{ 'identity__name--empty': !hasName }">{{ displayName }}</text>
      <text class="identity__handle">{{ handleText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * UserCard —— 压在头图上的身份块。
 *
 * 这一块只回答「这是谁」：头像、昵称、账号名。能不能改、能不能登录，
 * 由页面上的那颗胶囊按钮说 —— 一件事只说一遍（见 docs/design-system.md）。
 */
import { computed } from 'vue';

import { mediaUrl } from '@/api/upload';
import { icon } from '@/constants/icons';
import type { AuthUser } from '@/types/auth';

const props = defineProps<{
  /** 当前用户。null = 未登录 */
  user: AuthUser | null;
}>();

const emit = defineEmits<{
  /** 选了新头像。参数是 chooseAvatar 给的临时路径（1–5 分钟有效） */
  chooseAvatar: [tempPath: string];
}>();

const loggedIn = computed(() => props.user !== null);
const hasName = computed(() => !!props.user?.name?.trim());

/**
 * 头像地址。服务端回的 photo 是相对路径，要拼上媒体根地址才是能加载的 URL。
 * 没头像时留空，模板改渲染占位人形。
 */
const avatarSrc = computed(() => {
  const photo = props.user?.photo;
  if (!photo || photo === 'default.png') return '';
  return mediaUrl(photo);
});

/**
 * 显示名。昵称是空的账号显示「未设置昵称」而不是把空白留着 ——
 * 空白读起来像没加载出来，一句明说反而是在提示「这里缺东西」。
 */
const displayName = computed(() => {
  if (!props.user) return '未登录';
  return hasName.value ? (props.user?.name ?? '') : '未设置昵称';
});

/**
 * 第二行。已登录时给账号名（服务端由 openid 派生的 `wx_…`，是这位用户的
 * 账号标识，不是微信昵称）；未登录时给一句「登录能换来什么」。
 */
const handleText = computed(() => {
  if (!props.user) return '登录后同步你的钓点与反馈';
  return props.user?.username ?? '';
});

const userGlyph = computed(() => icon('user', 'onAccent'));
const cameraIcon = computed(() => icon('camera', 'onAccent'));

/**
 * 选到了新头像。
 *
 * ⚠️ 事件名是全小写的 `chooseavatar` —— 微信的原生事件就叫这个名字，
 * 写成 `chooseAvatar` **不报错、不回调**，表现是「点了没反应」，极难查。
 *
 * 临时路径只有 1–5 分钟有效，交给上层**立刻**上传，不要攒着。
 */
function onChooseAvatar(e: { detail?: { avatarUrl?: string } }) {
  const tempPath = e.detail?.avatarUrl;
  if (!tempPath) return;
  emit('chooseAvatar', tempPath);
}
</script>

<style lang="scss" scoped>
/*
 * 身份块。一行：头像在左，字在右。
 *
 * 为什么不做成上下（头像压中间）：这一页的头图是**湖面**，
 * 主体在右半边（钓鱼人）。身份在左上下半屏，正好跟主体错开 ——
 * 两样东西各占一边，画面才不是一团。
 */
.identity {
  display: flex;
  align-items: center;
}

/*
 * 头像。88pt + 白环。
 *
 * 白环把头像从照片上切出来：照片本身有亮部（天光）也有暗部（山影），
 * 没有环，头像的下沿会化进湖面。
 */
.identity__avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 176rpx;
  height: 176rpx;
  box-sizing: border-box;
  border: 6rpx solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  background-color: rgba(9, 24, 40, 0.28);
  box-shadow: 0 12rpx 32rpx rgba(9, 24, 40, 0.28);
}

/* 微信 button 的默认样式要一项项清掉 */
.identity__avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 176rpx;
  height: 176rpx;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: transparent;
  overflow: visible;
  line-height: 1;
  font-size: inherit;
  color: inherit;

  &::after {
    border: none;
  }
}

/* 真头像 */
.identity__photo {
  width: 164rpx;
  height: 164rpx;
  border-radius: 50%;
}

/* 占位人形。图标本身烤成白色（icons.ts 的 user__onAccent）——
   不用 CSS 反色：filter 的支持度不保证，掉一次这个占位人形就压在照片上看不见 */
.identity__glyph {
  width: 92rpx;
  height: 92rpx;
  opacity: 0.92;
}

/*
 * 相机角标。压在照片上，所以描边用半透明的深色 ——
 * 白描边在湖面高光上会多出一道白圈，跟头像那圈白环撞在一起。
 */
.identity__badge {
  position: absolute;
  right: -10rpx;
  bottom: -10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60rpx;
  height: 60rpx;
  border: 4rpx solid rgba(9, 24, 40, 0.35);
  border-radius: 50%;
  background-color: $fish-accent;
}

.identity__badge-icon {
  width: 34rpx;
  height: 34rpx;
}

/* 名字。title 一级：这一屏里它是最大的字 */
.identity__text {
  flex: 1;
  min-width: 0;
  margin-left: 28rpx;
}

.identity__name {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: $fish-on-dark;
  @include fish-type(title, 500);
}

/* 还没有昵称时压成半透明白：那不是「名字」，是「这里缺一个名字」 */
.identity__name--empty {
  color: rgba(255, 255, 255, 0.72);
}

/* 账号名 */
.identity__handle {
  display: block;
  margin-top: 8rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.78);
  @include fish-type(caption);
}
</style>
