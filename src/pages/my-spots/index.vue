<template>
  <view class="my-spots" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <PageNav :title="title" :scrolled="scrolled" fallback-url="/pages/mine/index" />

    <view class="my-spots__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!-- 未登录：这一页的数据全在服务端，登录了才有得看 -->
      <view v-if="!session.loggedIn" class="sect sect--first">
        <view class="my-spots__empty">
          <text class="my-spots__empty-title">{{ loggedOut.title }}</text>
          <text class="my-spots__empty-hint">{{ loggedOut.hint }}</text>
          <view class="my-spots__empty-action" @tap="onLogin">
            <text class="my-spots__empty-action-text">登录</text>
          </view>
        </view>
      </view>

      <!-- 一条都没有 -->
      <view v-else-if="!mapStore.mySpots.length && !mapStore.mySpotsLoading" class="sect sect--first">
        <view class="my-spots__empty">
          <text class="my-spots__empty-title">{{ empty.title }}</text>
          <text class="my-spots__empty-hint">{{ empty.hint }}</text>
          <view class="my-spots__empty-action" @tap="openCreate">
            <text class="my-spots__empty-action-text">{{ emptyAction }}</text>
          </view>
        </view>
      </view>

      <!-- 清单 -->
      <view v-else class="sect sect--first">
        <!--
          分段筛选。这一页是清单不是动态：待审核、未通过、已通过是
          三件不同的事（等 / 改 / 存档），各看各的。
        -->
        <view class="my-spots__filter">
          <view
            v-for="item in filters"
            :key="item.value"
            class="my-spots__filter-item"
            :class="{ 'my-spots__filter-item--on': item.value === filter }"
            @tap="setFilter(item.value)"
          >
            <text class="my-spots__filter-label">{{ item.label }}</text>
            <text class="my-spots__filter-count">{{ counts[item.value] }}</text>
          </view>
        </view>

        <!-- 这一档没有东西 -->
        <view v-if="!shown.length" class="my-spots__blank">
          <text class="my-spots__blank-title">{{ blank.title }}</text>
          <text class="my-spots__blank-hint">{{ blank.hint }}</text>
        </view>

        <!-- 清单本身。一张面罩住全部行，行之间一根发丝线 -->
        <view v-else class="my-spots__list">
          <view
            v-for="(spot, i) in shown"
            :key="spot.id"
            class="my-spots__row"
            :style="{ animationDelay: enterDelay(i) }"
          >
            <view class="my-spots__row-main" @tap="openSpot(spot.id)">
              <!--
                缩略图。没有照片就不占位 ——
                空出来一个方框，比不放更让人以为是图没加载出来。
              -->
              <image v-if="coverSrc(spot)" class="my-spots__row-thumb" :src="coverSrc(spot)" mode="aspectFill" />
              <view v-else class="my-spots__row-thumb my-spots__row-thumb--glyph">
                <text class="my-spots__row-glyph">{{ kindGlyph(spot) }}</text>
              </view>

              <view class="my-spots__row-text">
                <view class="my-spots__row-head">
                  <text class="my-spots__row-name">{{ spot.name }}</text>
                  <Chip :tone="statusTone(spot.status)">{{ statusLabel(spot.status) }}</Chip>
                </view>

                <text class="my-spots__row-meta">{{ metaText(spot) }}</text>
              </view>

              <image class="my-spots__row-chevron" :src="chevronIcon" mode="aspectFit" />
            </view>

            <!--
              驳回理由只有作者看得到。
              它是给作者改稿用的 —— 不说清楚为什么被驳回，
              作者只能猜，下次交还是同样的问题。

              理由摆在行里而不是行外：它跟这一条是同一件事，
              拆成两块反而要人自己对上是哪一条。
            -->
            <view v-if="spot.review_note" class="my-spots__row-note">
              <text class="my-spots__row-note-text">{{ spot.review_note }}</text>

              <view class="my-spots__row-act" @tap="openEdit(spot.id)">
                <text class="my-spots__row-act-text">{{ resubmit }}</text>
              </view>
            </view>
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
 * 版式：分段筛选 + 紧凑行清单。
 *
 * 为什么是清单而不是流水：这一页回答的是「我提交的那些，现在怎么样了」。
 * 待审核是等，未通过是改，已通过是存档 —— 三件不同的事，
 * 混在一条流水里，用户得自己从列表里挑出有事的那条。
 * 给一段筛选，各看各的。
 *
 * 数据从 store 的 mySpots 读（`GET /v3/fish/spots/mine`）。
 * 这个端点是**唯一**能看到待审核和已驳回条目的地方：公开列表把
 * status 写死成 approved。
 *
 * 页面只管把状态翻译给人看 —— 「待审核 / 已通过 / 未通过」，
 * 措辞按作者视角来：作者还要能改完再交，所以不说「被拒绝」。
 */
import { computed, ref } from 'vue';
import { onPageScroll, onPageShow } from '@dcloudio/uni-app';

import Chip from '@/components/Chip/Chip.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import {
  MY_SPOTS_ACTIONS,
  MY_SPOTS_EMPTY,
  MY_SPOTS_EMPTY_ACTION,
  MY_SPOTS_FILTERS,
  MY_SPOTS_FILTER_EMPTY,
  MY_SPOTS_LOGGED_OUT,
  MY_SPOTS_STATUS_TONES,
  MY_SPOTS_TITLE,
  type MySpotsFilter,
} from '@/constants/my-spots';
import { mediaUrl } from '@/api/upload';
import { icon } from '@/constants/icons';
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
/** 没登录时的那一段。与空列表分开说 —— 见 MY_SPOTS_LOGGED_OUT */
const loggedOut = MY_SPOTS_LOGGED_OUT;
/** 筛选档位 */
const filters = MY_SPOTS_FILTERS;
/** 改稿入口的文案 */
const resubmit = MY_SPOTS_ACTIONS.resubmit;

/** 导航栏材质层要不要显形 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

/** 当前看哪一档 */
const filter = ref<MySpotsFilter>('all');

/**
 * 排序用的权重：待办在前，已通过的沉到最后。
 *
 * 同一档内保持服务端给的顺序 —— 那是提交时间的顺序，
 * 客户端再排一次就等于用另一套规则盖掉它。
 */
const STATUS_WEIGHT: Record<FishingSpotStatus, number> = { rejected: 0, pending: 1, approved: 2 };

/**
 * 一条钓点的状态。
 *
 * 缺 status 的按已通过算：公开列表里恒为 approved，
 * 这一页拿到的条目若没有这个字段，它就是已经公开的那条。
 */
function statusOf(spot: FishingSpot): FishingSpotStatus {
  return spot.status ?? 'approved';
}

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
 * 每一档有几条。
 *
 * 「全部」是总数，不是三档之和 —— 待办那一栏的用户心里只有总数。
 */
const counts = computed<Record<MySpotsFilter, number>>(() => {
  const all = mapStore.mySpots;
  const by = (status: FishingSpotStatus): number => all.filter((spot) => statusOf(spot) === status).length;

  return {
    all: all.length,
    pending: by('pending'),
    rejected: by('rejected'),
    approved: by('approved'),
  };
});

/**
 * 当前这一档要显示的那些。
 *
 * 换档时列表整份换掉：新出现的行按落位动画依次进场，
 * 两档都有的那几条原地留着（key 是 id，节点被复用，动画不重播）。
 */
const shown = computed<FishingSpot[]>(() => {
  const spots =
    filter.value === 'all'
      ? mapStore.mySpots
      : mapStore.mySpots.filter((spot) => statusOf(spot) === filter.value);

  return [...spots].sort((a, b) => STATUS_WEIGHT[statusOf(a)] - STATUS_WEIGHT[statusOf(b)]);
});

/** 这一档空着的时候说什么 */
const blank = computed(() => {
  const copy = MY_SPOTS_FILTER_EMPTY[filter.value as Exclude<MySpotsFilter, 'all'>];
  return copy ?? MY_SPOTS_FILTER_EMPTY.approved;
});

/**
 * 换档。
 *
 * 已经在这一档了就不动 —— 再点一次同样的档位，
 * 列表重新落位一遍，看着像页面自己抖了一下。
 */
function setFilter(value: MySpotsFilter): void {
  if (value === filter.value) return;
  filter.value = value;
}

/**
 * 水体类型的头一个字。
 *
 * 没照片时拿它顶位：空出来一个方框，比不放更让人以为是图没加载出来。
 */
function kindGlyph(spot: FishingSpot): string {
  return fishingSpotKindLabel(spot.kind).charAt(0);
}

/**
 * 缩略图地址。没有照片时返回空串（那一格就不渲染）。
 *
 * 库里存的是服务端相对路径，得过 mediaUrl() 才是能加载的地址。
 */
function coverSrc(spot: FishingSpot): string {
  const first = spot.images?.[0];
  return first ? mediaUrl(first) : '';
}

/**
 * 副信息一行：类型 + 地址。
 *
 * 地址缺了就不留空位 —— 「水库 · 」，那个点会孤零零挂在行尾。
 */
function metaText(spot: FishingSpot): string {
  const kind = fishingSpotKindLabel(spot.kind);
  return spot.address ? kind + ' · ' + spot.address : kind;
}

/** 行尾那枚箭头 */
const chevronIcon = computed(() => icon('chevron-right', 'muted60'));

/** 去投稿钓点 */
function openCreate(): void {
  uni.navigateTo({ url: '/pages/spot-create/index' });
}

/** 看某条钓点的详情。属主看得到自己那条待审核的 */
function openSpot(id: string): void {
  uni.navigateTo({ url: `/pages/spot-detail/index?id=${id}` });
}

/** 去改这条钓点 */
function openEdit(id: string): void {
  uni.navigateTo({ url: `/pages/spot-edit/index?id=${id}` });
}

/**
 * 登录。
 *
 * 这一页的数据全在服务端，登录了才有得看。
 * `wx.login` 是静默的 —— 用户看不到弹窗，账号也是服务端自动建的。
 */
async function onLogin(): Promise<void> {
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

/*
 * 分段筛选。
 *
 * 轨道是 tertiarySystemFill，选中块是白面 ——
 * iOS 的分段控件就是这个结构：轨道压着一层，选中块浮在上面。
 *
 * 不粘在顶上：这一页配了 navigationStyle: "custom"，
 * sticky 的粘附基准在自定义导航栏下不可靠（见 SpotDetailDock 的说明）。
 * 清单通常一屏放得下，筛选跟着内容滚走不碍事。
 */
.my-spots__filter {
  display: flex;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

/*
 * 一档。
 *
 * 按下用变暗不是缩小：缩小会让选中块的位置在四档之间跳一下，
 * 读起来像整排跟着动（见令牌层 _motion.scss 的 fish-press-dim）。
 */
.my-spots__filter-item {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 60rpx;
  border-radius: 14rpx;
  @include fish-press-dim;
}

/*
 * 选中块。
 *
 * 圆角比轨道小一档（轨道 18rpx，块 14rpx）：块是浮在轨道里的一层，
 * 跟轨道一样大会顶到轨道外沿，看着像轨道自己变成了白块。
 */
.my-spots__filter-item--on {
  background-color: $fish-card-face;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08); /* color-allow: 阴影在深色下本来就失效，层次靠面 */
}

.my-spots__filter-label {
  color: $fish-muted;
  @include fish-type(caption, 500);
}

.my-spots__filter-item--on .my-spots__filter-label {
  color: $fish-ink;
}

/* 档位上的条数 */
.my-spots__filter-count {
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 清单。
 *
 * 一张面罩住全部行：行与行之间只隔一根发丝线，
 * 分行成卡就把「这是一份清单」这件事拆散了。
 */
.my-spots__list {
  margin-top: 24rpx;
  overflow: hidden;
  @include fish-card-glass($fish-radius-card);
}

/* 一条钓点 */
.my-spots__row {
  @include fish-enter;
}

/* 行与行之间的发丝线 */
.my-spots__row:not(:last-child) {
  border-bottom: 1rpx solid $fish-border-40;
}

/*
 * 行首：缩略图 + 文字 + 箭头。
 *
 * 按下反馈在这一行上，不在整条上：驳回理由那一块是给人看的，
 * 不是点进去的入口，整行都跟着变暗会显得那一块也能点。
 */
.my-spots__row-main {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  @include fish-press-dim;
}

.my-spots__row-thumb {
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  margin-right: 20rpx;
  border-radius: $fish-radius-lg;
}

/* 没照片时用水体类型的头一个字顶位 */
.my-spots__row-thumb--glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $fish-accent-tint;
}

.my-spots__row-glyph {
  color: $fish-blue-600;
  @include fish-type(body, 500);
}

/* 文字列。占满剩余宽度，名字长了才有地方截 */
.my-spots__row-text {
  flex: 1;
  min-width: 0;
}

/* 名字和状态徽标并排。名字占剩余空间，徽标不参与拉伸 */
.my-spots__row-head {
  display: flex;
  align-items: center;
}

.my-spots__row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(body, 500);

  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 副信息一行：类型 + 地址 */
.my-spots__row-meta {
  display: block;
  margin-top: 8rpx;
  overflow: hidden;
  color: $fish-muted-60;
  @include fish-type(caption);

  white-space: nowrap;
  text-overflow: ellipsis;
}

.my-spots__row-chevron {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
  margin-left: 12rpx;
}

/*
 * 驳回理由。
 *
 * 单独一块浅底：它是给人看的话，不是元数据 —— 混在副信息里会被当成一行
 * 地址扫过去，作者就错过「为什么没通过」这个最该看的信息。
 */
.my-spots__row-note {
  margin: 0 24rpx 20rpx;
  padding: 16rpx 20rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-destructive-tint;
}

.my-spots__row-note-text {
  display: block;
  color: $fish-destructive-ink;
  @include fish-type(caption);
}

/*
 * 改稿入口。
 *
 * 右对齐一行：它是这一条的动作，不是这条钓点的属性。
 * 文字用强调色 —— 它是这张卡上唯一能点的东西，得看着像能点。
 */
.my-spots__row-act {
  display: flex;
  justify-content: flex-end;
  margin-top: 12rpx;
  @include fish-press-dim;
}

.my-spots__row-act-text {
  color: $fish-blue-600;
  @include fish-type(caption);

  font-weight: 500;
}

/*
 * 某一档空着的时候。
 *
 * 不是一张卡，是居中的一段话 —— 这一档没有东西时没有「清单」可言，
 * 硬套一张卡反而像坏了。
 */
.my-spots__blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 96rpx 48rpx;
  text-align: center;
}

.my-spots__blank-title {
  color: $fish-ink;
  @include fish-type(body, 500);
}

.my-spots__blank-hint {
  margin-top: 8rpx;
  color: $fish-muted;
  @include fish-type(caption);
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
  @include fish-type(title);
}

.my-spots__empty-hint {
  margin-top: 12rpx;
  color: $fish-muted;
  @include fish-type(body);
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
  color: $fish-on-accent;
  @include fish-type(body);

  font-weight: 500;
}
</style>
