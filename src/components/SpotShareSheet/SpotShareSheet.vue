<template>
  <!--
    钓点分享浮层 —— 海报方案。

    浮层本身用 SnapSheet（项目里所有浮层共用同一个容器，见 docs/design-system.md），
    这里只负责海报这件事：画出来、给用户看、给出三个去处。

    三个去处对应微信给的三条路：
    - 保存到相册：uni.saveImageToPhotosAlbum
    - 发给朋友：open-type="share" 按钮，唤起微信转发面板
    - 分享到朋友圈：页面**不能自己发起**，只能引导用户从右上角胶囊菜单走

    高度用 fit-content，不给档位：
    这张浮层的内容是定死的（一张海报 + 两颗按钮），
    按视口百分比给高度会在海报和按钮之间空出一大片，
    空白把按钮推远，看着像按钮掉到了屏幕底下。
  -->
  <SnapSheet :open="open" fit-content @close="emit('close')">
    <template #header>
      <view class="share__head">
        <view class="share__head-text">
          <text class="share__title">{{ sheet.title }}</text>
        </view>
        <view class="share__close" @tap="emit('close')">
          <image class="share__close-icon" :src="closeIcon" mode="aspectFit" />
        </view>
      </view>
    </template>

    <view class="share">
      <view class="share__preview">
        <canvas :id="canvasId" type="2d" class="share__canvas" :style="canvasStyle" />

        <!--
          生成中。

          海报要等封面图从网络上回来才能画完 —— 那是一张几百 KB 的图，
          弱网下有一小段空窗。这段空窗是产品的一部分，
          所以给它一个明确的状态，而不是让用户对着一个白框等。
        -->
        <view v-if="status === 'generating'" class="share__overlay">
          <view class="share__spinner" />
          <text class="share__overlay-text">{{ sheet.generating }}</text>
        </view>
        <view v-else-if="status === 'failed'" class="share__overlay">
          <text class="share__overlay-text">{{ sheet.failed }}</text>
        </view>
      </view>
    </view>

    <template #footer>
      <view class="share__actions">
        <view class="share__btn share__btn--ghost" :class="{ 'share__btn--off': !posterPath }" @tap="onSave">
          {{ sheet.saveToAlbum }}
        </view>

        <button
          class="share__btn share__btn--primary"
          :class="{ 'share__btn--off': !cardPath }"
          open-type="share"
          :disabled="!cardPath"
        >
          {{ sheet.sendToFriend }}
        </button>
      </view>
    </template>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * 钓点分享浮层 —— 海报方案。
 *
 * 海报用 canvas 2d 现画（见 @/utils/poster）。
 * 为什么现画而不是后端出图：海报上的数（鱼口、地址、开放时间）前端手里就有，
 * 走服务端要多一次往返、多一套模板，值当不上。
 *
 * 画完导两次文件：
 * - 整张（3:4）存相册
 * - 卡片封面（5:4）转发给好友时当缩略图
 * 两次导出都是同一张海报的裁切，裁切框与绘制共用 @/constants/share 的 POSTER。
 */
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import SnapSheet from '@/components/SnapSheet/SnapSheet.vue';
import { POSTER, POSTER_EXPORT, SHARE_SHEET } from '@/constants/share';
import { SPOT_PLACEHOLDER_IMAGE } from '@/constants/spot-detail';
import { icon } from '@/constants/icons';
import { openAlbumSetting, saveImageToAlbum } from '@/utils/album';
import { toCanvasSource } from '@/utils/canvasImage';
import { CARD_CROP, drawPoster, type PosterImage, type PosterSpot } from '@/utils/poster';
import { createSelectorQuery } from '@/utils/selectorQuery';

const props = defineProps<{
  /** 浮层是否打开 */
  open: boolean;
  /** 海报要画的内容。已经换算好的展示值 */
  data: PosterSpot;
}>();

const emit = defineEmits<{
  close: [];
  /**
   * 海报画好了。
   *
   * 带上卡片封面的临时路径 —— 页面的 onShareAppMessage 要拿它当转发卡片的缩略图。
   * 临时路径只在本次会话内有效，所以不能存着不管，得每次重画都重新给一份。
   */
  ready: [payload: { card: string }];
}>();

const sheet = SHARE_SHEET;

const instance = getCurrentInstance()!;
const uid = Math.random().toString(36).slice(2, 8);
const canvasId = `spot-poster-${uid}`;

/* ── 状态 ────────────────────────────────────────────────────────────── */

/** generating | ready | failed */
const status = ref<'generating' | 'ready' | 'failed'>('generating');

/** 整张海报的临时文件路径。存相册用它 */
const posterPath = ref('');

/** 5:4 卡片封面。转发给好友时当缩略图 */
const cardPath = ref('');

/* ── 画布 ────────────────────────────────────────────────────────────── */

/**
 * `fields({ node: true })` 返回的 canvas 节点没有官方类型，
 * 按实际用到的成员局部声明（与 FishingGauge 保持一致）。
 */
interface CanvasNode2D {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D;
  createImage(): PosterImage;
}

let canvasNode: CanvasNode2D | null = null;

/**
 * 预览宽度（rpx）。
 *
 * 480rpx = 375pt 机型上的 240pt。海报是 3:4，所以高度由它推出来。
 * 用 rpx 而不是写死 px —— 宽屏机上预览不该还是那么窄一块。
 */
const PREVIEW_WIDTH_RPX = 480;

const previewWidthPx = computed(() => uni.upx2px(PREVIEW_WIDTH_RPX));
const previewHeightPx = computed(() => Math.round((previewWidthPx.value * POSTER.height) / POSTER.width));

/** 画布的 CSS 尺寸。canvas 2d 的位图尺寸另算，两者不是一回事 */
const canvasStyle = computed(() => ({
  width: `${previewWidthPx.value}px`,
  height: `${previewHeightPx.value}px`,
}));

/* ── 绘制 ────────────────────────────────────────────────────────────── */

/** 画布节点的获取重试节奏（毫秒）。与 FishingGauge 同一套 */
const INIT_RETRY_DELAYS = [0, 60, 120, 200, 300, 400, 600] as const;

let retryIndex = 0;
let retryTimer = 0;
let initializing = false;

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = 0;
  }
}

function scheduleRetry(): void {
  const delay = INIT_RETRY_DELAYS[retryIndex];
  if (delay === undefined) {
    status.value = 'failed';
    return;
  }
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = 0;
    void initCanvas();
  }, delay);
}

function queryCanvas(): Promise<CanvasNode2D | null> {
  return new Promise((resolve) => {
    createSelectorQuery(instance)
      .select(`#${canvasId}`)
      .fields({ node: true }, (res) => {
        const item = Array.isArray(res) ? res[0] : res;
        const node = (item as { node?: unknown } | undefined)?.node;
        resolve(typeof node === 'object' && node !== null ? (node as CanvasNode2D) : null);
      })
      .exec();
  });
}

/**
 * 载一张图。
 *
 * canvas 里的图要自己 createImage 再等 onload —— 画布不会自己去拉网络图。
 * 载不回来就返回 null，那一块画成平色（见 drawPoster）。
 */
async function loadImage(node: CanvasNode2D, src: string): Promise<PosterImage | null> {
  if (!src) return null;

  // 本地包内文件先读成 base64（见 @/utils/canvasImage）
  const source = await toCanvasSource(src);
  if (!source) return null;

  return new Promise((resolve) => {
    const image = node.createImage();
    let settled = false;

    const done = (result: PosterImage | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    image.onload = () => done(image);
    image.onerror = () => done(null);
    image.src = source;
  });
}

async function initCanvas(): Promise<void> {
  if (initializing) return;
  initializing = true;

  try {
    await nextTick();

    const node = await queryCanvas();
    if (!node) {
      scheduleRetry();
      return;
    }

    /*
     * 位图按海报的设计分辨率铺（750×1000），显示尺寸交给 CSS。
     *
     * 原来按「CSS 尺寸 × dpr」铺：2x 机上位图只有 480 宽，
     * 导出时再拉回 750 —— 存进相册的那张是放大出来的，字是糊的、码也糊。
     * 现在位图就是设计分辨率，显示时由渲染器缩到预览尺寸（始终是缩小），
     * 导出时一比一，不放大也不缩小。
     */
    node.width = POSTER.width;
    node.height = POSTER.height;

    canvasNode = node;
    clearRetryTimer();

    await draw();
  } finally {
    initializing = false;
  }
}

/** 画海报 + 导两次文件 */
async function draw(): Promise<void> {
  const node = canvasNode;
  if (!node) return;

  status.value = 'generating';

  const ctx = node.getContext('2d');
  // 位图就是设计分辨率，绘制坐标直接用设计坐标，不需要任何缩放

  /*
   * 封面。
   *
   * 钓点没有照片时，`cover` 拿到的已经是占位插画（见 spot-detail 的 coverSrc）；
   * 这里是第二道兜底 —— 照片本身载不下来的时候，也用那张插画顶上。
   * 不留一块灰：一块灰读作「这里缺东西」，插画读作「这个钓点没照片」。
   *
   * ⚠️ 兜底和被兜底的对象现在都是网络图（占位插画在 CDN 上，见
   * constants/spot-detail）—— 同一个域名、同一条 downloadFile 合法域名。
   * 域名没配的时候不是「这里坏了」，是**整块封面都画不出来**。
   */
  const [cover, code] = await Promise.all([
    loadImage(node, props.data.cover).then((img) => img ?? loadImage(node, SPOT_PLACEHOLDER_IMAGE)),
    props.data.codeUrl ? loadImage(node, props.data.codeUrl) : Promise.resolve(null),
  ]);

  drawPoster(ctx, props.data, cover, code);

  posterPath.value = await exportPoster(
    node,
    { x: 0, y: 0, width: POSTER.width, height: POSTER.height },
    POSTER.width,
    POSTER.height,
  );
  const card = await exportPoster(node, CARD_CROP.friend, CARD_CROP.friend.destWidth, CARD_CROP.friend.destHeight);

  if (!posterPath.value) {
    status.value = 'failed';
    return;
  }

  cardPath.value = card;
  status.value = 'ready';

  // 封面给页面 —— 页面的转发钩子要拿它当缩略图
  emit('ready', { card });
}

/**
 * 导出一块区域。
 *
 * 裁切框是**设计坐标**，位图也是设计分辨率 —— 两套坐标是同一套，直接用。
 */
function exportPoster(
  node: CanvasNode2D,
  crop: { x: number; y: number; width: number; height: number },
  destWidth: number,
  destHeight: number,
): Promise<string> {
  return new Promise((resolve) => {
    uni.canvasToTempFilePath({
      /*
       * 2d 画布要传节点本身（type="2d" 的画布没有 canvas-id）。
       * 类型里既没有 canvas 也没有「canvas 可以不带 canvasId」这件事，
       * 这里整体绕过去 —— 多传一个 canvasId 反而可能被当成老画布去找。
       */
      canvas: node,
      x: crop.x,
      y: crop.y,
      width: crop.width,
      height: crop.height,
      destWidth,
      destHeight,
      fileType: POSTER_EXPORT.fileType,
      success: (res: { tempFilePath: string }) => resolve(res.tempFilePath),
      fail: () => resolve(''),
    } as unknown as UniNamespace.CanvasToTempFilePathOptions);
  });
}

/* ── 动作 ────────────────────────────────────────────────────────────── */

/** 存相册 */
async function onSave(): Promise<void> {
  const path = posterPath.value;
  if (!path) return;

  uni.showLoading({ title: sheet.saveToAlbum, mask: true });

  const result = await saveImageToAlbum(path);

  uni.hideLoading();

  if (result.ok) {
    uni.showToast({ title: sheet.saved, icon: 'success' });
    return;
  }

  if (result.reason === 'denied') {
    // 用户明确拒绝过：微信不会再弹授权窗，只能去设置页
    uni.showToast({ title: sheet.needAlbumAuth, icon: 'none' });
    openAlbumSetting();
    return;
  }

  uni.showToast({ title: sheet.saveFailed, icon: 'none' });
}

/* ── 生命周期 ────────────────────────────────────────────────────────── */

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    // 浮层刚打开，画布节点还没进 DOM —— 等一拍再取
    status.value = 'generating';
    posterPath.value = '';
    cardPath.value = '';
    canvasNode = null;
    retryIndex = 0;
    void nextTick().then(() => void initCanvas());
  },
);

/**
 * 数据变了重画。
 *
 * 钓况是会变的（天气、潮汐都在动），浮层开着的时候后台刷新一次，
 * 海报上的鱼口不能还停在打开浮层那一刻 —— 存进相册的图会被别人当成实时的读数。
 */
watch(
  () => props.data,
  () => {
    if (!canvasNode) return;
    void draw();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  clearRetryTimer();
  canvasNode = null;
});

/* ── 图标 ────────────────────────────────────────────────────────────── */

const closeIcon = icon('x', 'muted60');
</script>

<style lang="scss" scoped>
/* 头部 */
.share__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding: 8rpx 32rpx 16rpx;
}

.share__head-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.share__title {
  @include fish-type(headline);
}

.share__subtitle {
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

.share__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  border-radius: 999rpx;
  background-color: $fish-surface;
  @include fish-press-dim;
}

.share__close-icon {
  width: 28rpx;
  height: 28rpx;
}

/* 正文 */
.share {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8rpx 32rpx 24rpx;
}

/*
 * 海报预览。
 *
 * 白底 + 一圈发丝线 —— 海报自己也是一张白纸，
 * 浮层底也是白的，不给点边界就分不清哪儿是图、哪儿是底。
 */
.share__preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $fish-radius-xl;
  overflow: hidden;
  background-color: $fish-page;
  box-shadow: inset 0 0 0 1rpx $fish-border-40;
}

.share__canvas {
  display: block;
}

/* 生成中 / 失败的遮罩 */
.share__overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  background-color: rgba(255, 255, 255, 0.86);
}

.share__overlay-text {
  color: $fish-muted;
  @include fish-type(caption);
}

/* 转圈 */
.share__spinner {
  width: 36rpx;
  height: 36rpx;
  border: 3rpx solid $fish-border-40;
  border-top-color: $fish-blue;
  border-radius: 999rpx;
  animation: share-spin 700ms linear infinite;
}

@keyframes share-spin {
  to {
    transform: rotate(360deg);
  }
}

.share__hint {
  margin-top: 20rpx;
  color: $fish-muted;
  @include fish-type(caption);
  text-align: center;
}

/* 底部动作 */
.share__actions {
  display: flex;
  gap: 16rpx;
  /*
   * 底部留出安全区。
   *
   * 这两颗按钮是浮层贴地的最后一行，不让开 home indicator 的话
   * 会被那道横条压住 —— 按钮看着就悬在屏幕边上。
   */
  padding: 8rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
}

/*
 * 两个动作块。
 *
 * 转发那颗是原生 button —— 微信的转发面板只能由 open-type="share" 唤起。
 * 原生 button 自带一套默认样式（灰底、边框、字号、内边距、::after 的那条边），
 * 全都要清掉才能跟旁边那颗 view 长得一样。
 */
.share__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 88rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: $fish-radius-xl;
  background-color: transparent;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  @include fish-type(body);
  font-weight: 600;
  @include fish-press;
}

.share__btn::after {
  border: none;
}

.share__btn--ghost {
  background-color: $fish-fill;
  color: $fish-blue;
}

.share__btn--primary {
  background-color: $fish-blue;
  color: #ffffff;
}

/* 海报还没画出来时，按下去没反应 —— 压暗说清楚 */
.share__btn--off {
  opacity: 0.4;
}
</style>
