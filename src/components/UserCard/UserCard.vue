<template>
  <view class="anchor" :style="{ paddingTop: topInset + 'px' }">
    <button
      v-if="loggedIn"
      class="anchor__avatar-btn"
      open-type="chooseAvatar"
      hover-class="none"
      @chooseavatar="onChooseAvatar"
    >
      <view class="anchor__avatar">
        <image v-if="avatarSrc" class="anchor__photo" :src="avatarSrc" mode="aspectFill" />
        <image v-else class="anchor__glyph" :src="userGlyph" mode="aspectFit" />

        <view class="anchor__badge">
          <image class="anchor__badge-icon" :src="cameraIcon" mode="aspectFit" />
        </view>
      </view>
    </button>

    <view v-else class="anchor__avatar">
      <image class="anchor__glyph" :src="userGlyph" mode="aspectFit" />
    </view>

    <text class="anchor__name" :class="{ 'anchor__name--empty': !hasName }">{{ displayName }}</text>
    <text class="anchor__handle">{{ handleText }}</text>

    <view class="anchor__cta" @tap="onCta">
      <text class="anchor__cta-text">{{ ctaLabel }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { mediaUrl } from '@/api/upload';
import { icon } from '@/constants/icons';
import type { AuthUser } from '@/types/auth';

const props = withDefaults(
  defineProps<{
    /** 当前用户。null = 未登录 */
    user: AuthUser | null;
    /** 登录 / 上传进行中。用来锁住按钮，避免连点 */
    busy?: boolean;
    /**
     * 上内边距（px）。铺在屏幕顶上时要把状态栏让开，
     * 而状态栏的高度是运行时值，写不进 rpx —— 由页面给。
     */
    topInset?: number;
  }>(),
  {
    busy: false,
    topInset: 0,
  },
);

const emit = defineEmits<{
  /** 点「微信登录」 */
  login: [];
  /** 点「编辑资料」 */
  edit: [];
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
 * 账号标识，不是微信昵称）；未登录时给一句「登录能换来什么」——
 * 登录按钮不能只有「登录」两个字说事。
 */
const handleText = computed(() => {
  if (!props.user) return '登录后同步你的钓点与反馈';
  return props.user?.username ?? '';
});

/** 资料没填全时说「完善资料」，填全了说「编辑资料」 */
const editLabel = computed(() => {
  const photo = props.user?.photo;
  const hasAvatar = !!photo && photo !== 'default.png';
  return hasAvatar && hasName.value ? '编辑资料' : '完善资料';
});

/** 按钮上那个字。未登录时是登录，已登录时是去改资料 */
const ctaLabel = computed(() => {
  if (!loggedIn.value) return props.busy ? '登录中…' : '微信登录';
  return editLabel.value;
});

const userGlyph = icon('user', 'onAccent');
const cameraIcon = icon('camera', 'onAccent');

/**
 * 点了主操作。未登录去登录，已登录去改资料。
 *
 * 这一层只发意图，不自己干活：登录要走接口，头像要上传，
 * 那些是页面与接口层的事。
 */
function onCta() {
  if (loggedIn.value) emit('edit');
  else emit('login');
}

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
 * 锚面。深色材质是令牌层的一块（_material.scss 的 fish-anchor-face），
 * 这一层只管内容怎么摆。
 *
 * 上内边距由页面行内给（topInset）：这一块铺在屏幕最顶上，要让开状态栏，
 * 而状态栏的高度是运行时值（px），写不进 rpx。
 */
.anchor {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-right: 48rpx;
  padding-bottom: 80rpx;
  padding-left: 48rpx;
  text-align: center;
  @include fish-anchor-face;
}

/*
 * 头像。88pt + 6rpx 白环 + 一圈品牌蓝的淡晕。
 *
 * 白环把头像从深色面上切出来，蓝晕把它从深色面上**托**出来 ——
 * 没有这层晕，头像就是一块贴在深底上的圆。
 */
.anchor__avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 176rpx;
  height: 176rpx;
  border: 6rpx solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 0 0 16rpx $fish-accent-tint,
    0 36rpx 80rpx rgba(9, 24, 40, 0.35);
}

/* 微信 button 的默认样式要一项项清掉 */
.anchor__avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 188rpx;
  height: 188rpx;
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
.anchor__photo {
  width: 164rpx;
  height: 164rpx;
  border-radius: 50%;
}

/* 占位人形。图标本身烤成白色（icons.ts 的 user__onAccent）——
   不用 CSS 反色：filter 的支持度不保证，掉一次这个占位人形就压在深底上看不见 */
.anchor__glyph {
  width: 92rpx;
  height: 92rpx;
  opacity: 0.9;
}

/*
 * 相机角标。描边用深色面自身的底色 —— 白描边在深面上会多出一道白圈，
 * 跟头像那圈白环撞在一起。
 */
.anchor__badge {
  position: absolute;
  right: -8rpx;
  bottom: -8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60rpx;
  height: 60rpx;
  border: 4rpx solid $fish-deep-base;
  border-radius: 50%;
  background-color: $fish-accent;
}

.anchor__badge-icon {
  width: 34rpx;
  height: 34rpx;
}

/* 名字。display —— 这一屏里它是最大的字 */
.anchor__name {
  display: block;
  margin-top: 40rpx;
  color: $fish-on-dark;
  @include fish-type(display);
}

/* 还没有昵称时压成次级灰：那不是「名字」，是「这里缺一个名字」 */
.anchor__name--empty {
  color: $fish-deep-muted;
}

/* 账号名 */
.anchor__handle {
  display: block;
  margin-top: 12rpx;
  color: $fish-deep-muted;
  @include fish-type(caption);
}

/* 深色面上的发丝线：这块面里唯一的分隔 */
.anchor__rule {
  height: 1rpx;
  margin: 48rpx 160rpx 0 160rpx;
  background-color: $fish-deep-hairline;
}

/* 资产行 */
.anchor__assets {
  display: flex;
  align-items: center;
  margin-top: 40rpx;
}

.anchor__asset-num {
  color: $fish-on-dark;
  @include fish-type(body);

  font-weight: 600;
}

/* 徽标在深色面上走浅琥珀（--fish-warning-on-dark），
   浅底那一档的深琥珀字压深底读不出来 */
.anchor__asset-badge {
  display: inline-flex;
  align-items: center;
  height: 40rpx;
  margin-left: 16rpx;
  padding: 0 18rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-warning-tint-on-dark;
}

.anchor__asset-badge-text {
  color: $fish-warning-on-dark;
  @include fish-type(caption);
}

/*
 * 主操作。实心白块，深色面上唯一的高对比实心面。
 *
 * 命中区 88rpx = 44pt。
 */
.anchor__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 200rpx;
  height: 88rpx;
  margin-top: 48rpx;
  padding: 0 60rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-page;
  @include fish-press(0.97);
}

.anchor__cta-text {
  color: $fish-deep-base;
  @include fish-type(body);

  font-weight: 600;
}
</style>
