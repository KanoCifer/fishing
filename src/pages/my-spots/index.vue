<template>
  <!--
    我的钓点 —— 我提交的那些，现在怎么样了。

    这一页存在的理由很简单：公开列表只放已过审的钓点，
    用户刚提交的那条还在待审核，地图上根本看不见。
    没有这一页，提交完就等于消失。
  -->
  <view class="my-spots" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <PageNav :title="title" :scrolled="scrolled" fallback-url="/pages/mine/index" />

    <view class="my-spots__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!-- 未登录：这一页的数据全在服务端，登录了才有得看 -->
      <view v-if="!session.loggedIn" class="sect sect--first">
        <view class="my-spots__empty my-spots__enter">
          <text class="my-spots__empty-title">{{ empty.title }}</text>
          <text class="my-spots__empty-hint">{{ empty.hint }}</text>
          <view class="my-spots__empty-action" @tap="onLogin">
            <text class="my-spots__empty-action-text">登录</text>
          </view>
        </view>
      </view>

      <!-- 一条都没有 -->
      <view v-else-if="!mapStore.mySpots.length && !mapStore.mySpotsLoading" class="sect sect--first">
        <view class="my-spots__empty my-spots__enter">
          <text class="my-spots__empty-title">{{ empty.title }}</text>
          <text class="my-spots__empty-hint">{{ empty.hint }}</text>
          <view class="my-spots__empty-action" @tap="openCreate">
            <text class="my-spots__empty-action-text">{{ emptyAction }}</text>
          </view>
        </view>
      </view>

      <!-- 列表 -->
      <view v-else class="sect sect--first">
        <text class="sect__title" :style="{ animationDelay: enterDelay(0) }">{{ hint }}</text>

        <view
          v-for="(spot, i) in mapStore.mySpots"
          :key="spot.id"
          class="my-spots__item my-spots__enter"
          :style="{ animationDelay: enterDelay(i + 1) }"
        >
          <view class="my-spots__item-row" @tap="openSpot(spot.id)">
            <!--
              缩略图。没有照片就不占位 ——
              空出来一个方框，比不放更让人以为是图没加载出来。
            -->
            <image v-if="coverSrc(spot)" class="my-spots__item-thumb" :src="coverSrc(spot)" mode="aspectFill" />

            <view class="my-spots__item-main">
              <view class="my-spots__item-head">
                <text class="my-spots__item-name">{{ spot.name }}</text>
                <Chip :tone="statusTone(spot.status)">{{ statusLabel(spot.status) }}</Chip>
              </view>

              <view class="my-spots__item-meta">
                <text v-if="spot.kind" class="my-spots__item-kind">{{ fishingSpotKindLabel(spot.kind) }}</text>
                <text v-if="spot.address" class="my-spots__item-address">{{ spot.address }}</text>
              </view>
            </view>
          </view>

          <!--
            驳回理由只有作者看得到。
            它是给作者改稿用的 —— 不说清楚为什么被驳回，
            作者只能猜，下次交还是同样的问题。
          -->
          <view v-if="spot.review_note" class="my-spots__item-note">
            <text class="my-spots__item-note-text">{{ spot.review_note }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 我的钓点页 —— 我提交的钓点及其审核状态。
 *
 * 数据从 store 的 mySpots 读（`GET /v3/fish/spots/mine`）。
 * 这个端点是**唯一**能看到待审核和已驳回条目的地方：公开列表把
 * status 写死成 approved。
 *
 * 页面只管把状态翻译给人看 —— 「待审核 / 已通过 / 未通过」，
 * 措辞按作者视角来：作者还要能改完再交，所以不说「被拒绝」。
 */
import { ref } from 'vue';
import { onPageScroll, onPageShow } from '@dcloudio/uni-app';

import Chip from '@/components/Chip/Chip.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import {
  MY_SPOTS_EMPTY,
  MY_SPOTS_EMPTY_ACTION,
  MY_SPOTS_HINT,
  MY_SPOTS_STATUS_TONES,
  MY_SPOTS_TITLE,
} from '@/constants/my-spots';
import { mediaUrl } from '@/api/upload';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import {
  FISHING_SPOT_STATUS_LABELS,
  fishingSpotKindLabel,
  type FishingSpot,
  type FishingSpotStatus,
} from '@/types/fishing';
import { enterDelay } from '@/utils/motion';

const mapStore = useFishingMapStore();
const session = useSessionStore();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const title = MY_SPOTS_TITLE;
const empty = MY_SPOTS_EMPTY;
const emptyAction = MY_SPOTS_EMPTY_ACTION;
const hint = MY_SPOTS_HINT;

/** 导航栏材质层要不要显形 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

/** 审核状态的徽标文案 */
function statusLabel(status?: FishingSpotStatus): string {
  if (!status) return '';
  return FISHING_SPOT_STATUS_LABELS[status];
}

/** 审核状态的徽标色调 */
function statusTone(status?: FishingSpotStatus): 'default' | 'accent' | 'ok' | 'warn' | 'bad' {
  if (!status) return 'default';
  return MY_SPOTS_STATUS_TONES[status];
}

/**
 * 水体类型的名字。
 *
 * 模板里直接调 fishingSpotKindLabel，不包一层 —— 包一层反而要为了签名
 * 把 kind 断言成后端枚举，那正是这个 helper 想躲开的东西。
 */

/**
 * 缩略图地址。没有照片时返回空串（那一格就不渲染）。
 *
 * 库里存的是服务端相对路径，得过 mediaUrl() 才是能加载的地址。
 */
function coverSrc(spot: FishingSpot): string {
  const first = spot.images?.[0];
  return first ? mediaUrl(first) : '';
}

/** 去新建钓点 */
function openCreate() {
  uni.navigateTo({ url: '/pages/spot-create/index' });
}

/** 看某条钓点的详情。属主看得到自己那条待审核的 */
function openSpot(id: string) {
  uni.navigateTo({ url: `/pages/spot-detail/index?id=${id}` });
}

/**
 * 登录。
 *
 * 这一页的数据全在服务端，登录了才有得看。
 * `wx.login` 是静默的 —— 用户看不到弹窗，账号也是服务端自动建的。
 */
async function onLogin() {
  try {
    await session.login();
    await mapStore.fetchMySpots();
  } catch {
    uni.showToast({ title: '登录失败，请重试', icon: 'none' });
  }
}

/**
 * 进页面拉一次。
 *
 * 先恢复会话再取数：冷启动时内存里没有用户，
 * 拿不到 token 就先别发请求 —— 那必然 401。
 */
onPageShow(async () => {
  await session.restore();
  if (session.loggedIn) {
    await mapStore.fetchMySpots();
  }
});
</script>

<style lang="scss" scoped>
.my-spots {
  position: relative;
  background-color: $fish-grouped;
}

.my-spots__body {
  position: relative;
  z-index: 1;
  padding-bottom: calc(64rpx + env(safe-area-inset-bottom));
}

/* 分区。缩进、眉标、卡间距走令牌层 _layout.scss 的 fish-section */
.sect {
  @include fish-section;
}

.sect--first {
  margin-top: 0;
}

/* 入场。延迟按阅读顺序给 */
.my-spots__enter {
  @include fish-enter;
}

/*
 * 空态。
 *
 * 不是一张卡，是居中的一段话 —— 列表为空时没有「卡片」可言，
 * 硬套一张卡反而像坏了。
 */
.my-spots__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 48rpx;
  text-align: center;
}

.my-spots__empty-title {
  color: $fish-ink;
  @include fish-type(title3);
}

.my-spots__empty-hint {
  margin-top: 12rpx;
  color: $fish-muted;
  @include fish-type(callout);
}

/* 空态里的那个按钮 */
.my-spots__empty-action {
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

.my-spots__empty-action-text {
  color: #ffffff;
  @include fish-type(callout);

  font-weight: 600;
}

/*
 * 一条钓点。
 *
 * 玻璃卡 + 圆角，和数据页的卡片同一级。卡与卡之间 32rpx（16pt），
 * 与页面里同段内两张卡的间距一致。
 */
.my-spots__item {
  margin-bottom: $fish-space-section;
  padding: 28rpx 32rpx;
  border-radius: $fish-radius-card;
  @include fish-glass;
}

/*
 * 缩略图 + 文字。
 *
 * 按下反馈在这一行上，不在整张卡上：驳回理由那一块是给人看的，
 * 不是点进去的入口，整张卡都跟着变暗会显得那一块也能点。
 */
.my-spots__item-row {
  display: flex;
  align-items: center;
  @include fish-press-dim;
}

.my-spots__item-thumb {
  width: 120rpx;
  height: 120rpx;
  flex-shrink: 0;
  margin-right: 20rpx;
  border-radius: $fish-radius-lg;
}

/* 文字列。占满剩余宽度，名字长了才有地方截 */
.my-spots__item-main {
  flex: 1;
  min-width: 0;
}

/* 名字和状态徽标并排。名字占剩余空间，徽标不参与拉伸 */
.my-spots__item-head {
  display: flex;
  align-items: center;
}

.my-spots__item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(headline);

  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 副信息一行：类型 + 地址 */
.my-spots__item-meta {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
}

.my-spots__item-kind {
  flex-shrink: 0;
  color: $fish-muted;
  @include fish-type(caption);
}

.my-spots__item-address {
  margin-left: 16rpx;
  overflow: hidden;
  color: $fish-muted-60;
  @include fish-type(caption);

  white-space: nowrap;
  text-overflow: ellipsis;
}

/*
 * 驳回理由。
 *
 * 单独一块浅底：它是给人看的话，不是元数据 —— 混在副信息里会被当成一行
 * 地址扫过去，作者就错过「为什么没通过」这个最该看的信息。
 */
.my-spots__item-note {
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-destructive-tint;
}

.my-spots__item-note-text {
  color: $fish-destructive-ink;
  @include fish-type(caption);
}
</style>
