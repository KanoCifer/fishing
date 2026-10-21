<template>
  <!--
    照片选择器 —— 选图、传图、删图。

    一格一张，格子满了就不再显示「添加」那一格。
    正在上传的那几张盖一层「上传中」：它们已经在列表里了，
    但还没拿到服务端地址，此刻还不算提交的一部分。
  -->
  <view class="picker">
    <view class="picker__grid">
      <!-- 已上传完成 -->
      <view v-for="(path, index) in committed" :key="path + index" class="picker__cell">
        <image class="picker__image" :src="mediaUrl(path)" mode="aspectFill" />

        <view class="picker__remove" @tap="remove(path)">
          <image class="picker__remove-icon" :src="removeIcon" mode="aspectFit" />
        </view>
      </view>

      <!-- 正在上传 -->
      <view v-for="item in pending" :key="item.key" class="picker__cell">
        <image class="picker__image" :src="item.local" mode="aspectFill" />
        <view class="picker__mask">
          <text class="picker__mask-text">{{ uploadingText }}</text>
        </view>
      </view>

      <!-- 添加 -->
      <view v-if="canAdd" class="picker__cell picker__cell--add" @tap="choose">
        <image class="picker__add-icon" :src="addIcon" mode="aspectFit" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotImagePicker —— 钓点照片的选择与上传。
 *
 * **组件自己持有已上传列表**，不是受控的。理由是并发上传：
 * 几张照片同时传完，谁先 emit 谁后 emit 说不准 ——
 * 受控写法里每个回调都读 props.images，而 emit 之后 props 要等下一轮
 * 渲染才更新，于是后完成的那张会把先完成的那张盖掉。
 * 自己持有就没有这个竞态。
 *
 * 父组件通过 `change` 拿到当前的完整列表（服务端相对路径），
 * 通过 `uploading` 知道还有没有没传完的 —— 有的话不能提交。
 */
import { computed, ref } from 'vue';

import { mediaUrl, uploadImage } from '@/api/upload';
import { icon } from '@/constants/icons';
import { SPOT_PHOTO_MAX, SPOT_PHOTO_PICK_FAILED, SPOT_PHOTO_UPLOADING } from '@/constants/spot-create';
import { toErrorMessage } from '@/utils/error';

/** 正在上传的一张 */
interface PendingUpload {
  /** 列表 key。临时路径可能重复，带个序号区分开 */
  key: string;
  /** 本地临时路径，上传前先拿它当预览 */
  local: string;
}

const props = withDefaults(
  defineProps<{
    /** 最多几张 */
    max?: number;
    /** 初始已有的图片（服务端相对路径）。编辑页回填用 */
    initial?: string[];
  }>(),
  {
    max: SPOT_PHOTO_MAX,
    initial: () => [],
  },
);

const emit = defineEmits<{
  /** 已上传完成的图片列表变了。给的是服务端相对路径 */
  change: [images: string[]];
  /** 有没有上传在进行中 */
  uploading: [value: boolean];
}>();

/** 已上传完成的图片。服务端相对路径 */
const committed = ref<string[]>([...props.initial]);

/** 正在上传的 */
const pending = ref<PendingUpload[]>([]);

const uploadingText = SPOT_PHOTO_UPLOADING;
const addIcon = icon('plus', 'muted');
const removeIcon = icon('x', 'onAccent');

/** 还能再选几张 */
const canAdd = computed(() => committed.value.length + pending.value.length < props.max);

/**
 * 选图。
 *
 * 用 `uni.chooseMedia` 而不是 `chooseImage`：前者是微信现在的接口，
 * 能一次选多张、能指定只选图片、能指定压缩。`chooseImage` 已经在废弃流程里。
 *
 * 选的是**压缩版**（sizeType: compressed）：钓点照片是给人看现场的样子，
 * 不是拿来当素材的；原图动辄几 MB，弱网下传得等到用户放弃。
 */
function choose() {
  const room = props.max - committed.value.length - pending.value.length;
  if (room <= 0) return;

  uni.chooseMedia({
    count: room,
    mediaType: ['image'],
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const files = res.tempFiles ?? [];
      if (!files.length) return;
      void uploadAll(files);
    },
    fail: (err) => {
      // 用户主动取消是正常操作，不该弹一个「失败」
      const message = String(err?.errMsg ?? '');
      if (message.includes('cancel')) return;
      uni.showToast({ title: SPOT_PHOTO_PICK_FAILED, icon: 'none' });
    },
  });
}

/**
 * 传刚才选的那几张。
 *
 * 一起传，不一张一张等：几张照片串行传要等好几秒，并行发出去只等最慢的那一张。
 */
async function uploadAll(files: UniNamespace.MediaFile[]): Promise<void> {
  const items: PendingUpload[] = files.map((file, index) => ({
    key: `${file.tempFilePath}-${index}`,
    local: file.tempFilePath,
  }));

  pending.value = [...pending.value, ...items];
  emit('uploading', true);

  await Promise.all(items.map((item, index) => uploadOne(item, files[index])));

  pending.value = pending.value.filter((item) => !items.some((done) => done.key === item.key));
  emit('uploading', pending.value.length > 0);
}

/**
 * 传一张。
 *
 * 成功就把服务端给的**相对路径**记进列表。存相对路径而不是完整 URL：
 * 部署域名是客户端配置项，把域名烤进数据等于把一份部署拓扑写死进库里
 * （见 api/upload 的说明）。
 */
async function uploadOne(item: PendingUpload, file: UniNamespace.MediaFile): Promise<void> {
  try {
    const result = await uploadImage(file.tempFilePath);
    committed.value = [...committed.value, result.filename];
    emit('change', [...committed.value]);
  } catch (err) {
    uni.showToast({
      title: toErrorMessage(err, '照片上传失败，请重试'),
      icon: 'none',
    });
  }
}

/** 删一张已经传好的 */
function remove(path: string) {
  committed.value = committed.value.filter((item) => item !== path);
  emit('change', [...committed.value]);
}
</script>

<style lang="scss" scoped>
/*
 * 网格。
 *
 * gap 而不是 margin：格子数会变（删一张、传完一张），
 * 用 margin 就要处理「最后一行右边多出来的那一截」。
 */
.picker__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

/*
 * 一格。
 *
 * flex-basis 取三等分之一：固定三列一行，格子随容器宽度走。
 * 高度写死 200rpx —— 高度用百分比在 WXSS 里没有确定参照，
 * 那就定死一个接近正方形的值（宽约 202rpx）。
 */
.picker__cell {
  position: relative;
  flex: 0 0 calc((100% - 32rpx) / 3);
  height: 200rpx;
  overflow: hidden;
  border-radius: $fish-radius-lg;
}

/*
 * 缩略图。
 *
 * aspectFill：照片比例各不相同，裁成同一个形状才排得齐。
 */
.picker__image {
  width: 100%;
  height: 100%;
}

/*
 * 添加格子。
 *
 * 虚线边框 + 灰底：它不是一个内容，是「这里可以再加一张」的邀请，
 * 画得轻一点，免得看着像已经有了一张。
 */
.picker__cell--add {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed $fish-border;
  background-color: $fish-fill;
  @include fish-press-dim;
}

.picker__add-icon {
  width: 48rpx;
  height: 48rpx;
}

/*
 * 删除角标。
 *
 * 压在缩略图右上角，直径 40rpx（20pt）—— 小一点会点不准。
 * 半透明黑底而不是实色：它盖在照片上，实色太抢眼。
 */
.picker__remove {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
  border-radius: $fish-radius-pill;
  background-color: rgba(0, 0, 0, 0.5);
}

.picker__remove-icon {
  width: 22rpx;
  height: 22rpx;
}

/*
 * 上传中的遮罩。
 *
 * 半透明黑 + 白字：照片本身可能很亮，遮罩不清的话那行字读不出来。
 */
.picker__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.4);
}

.picker__mask-text {
  color: #ffffff;
  @include fish-type(caption2);
}
</style>
