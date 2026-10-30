<template>
  <!--
    照片选择器 —— 选图、传图、删图。
  -->
  <view class="picker">
    <view class="picker__grid">
      <!-- 已上传完成 -->
      <view v-for="(path, index) in committed" :key="path + index" class="picker__cell">
        <!--
          lazy-load：这些是网络照片（mediaUrl 拼出来的地址）。
          格子多的时候一次下完不划算 —— 露出来的那几张才是要看的。
        -->
        <image class="picker__image" :src="mediaUrl(path)" mode="aspectFill" lazy-load />

        <view class="picker__remove-hit" @tap="remove(path)">
          <view class="picker__remove">
            <image class="picker__remove-icon" :src="removeIcon" mode="aspectFit" />
          </view>
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
 * ImagePicker —— 图片的选择与上传。
 *
 * 从钓点照片里长出来的，现在有两个使用方：钓点投稿与钓鱼记录。
 * 所以它不持有任何业务语义 —— 传进来几张、传到哪个目录，全看调用方给的
 * `max` 与 `type`。
 *
 * 组件自己管已上传列表，不做受控：表单页要把所有字段攒成一份载荷再提交，
 * 中间没有「就地改状态」这一步，让组件内部持有图片列表更省事
 * （上传完成的回调只把结果往上抛）。
 */
import { computed, ref } from 'vue';

import { mediaUrl, uploadImage, type UploadType } from '@/api/upload';
import { icon } from '@/constants/icons';
import { SPOT_PHOTO_MAX } from '@/constants/spot-form';
import { UPLOADING_TEXT, UPLOAD_PICK_FAILED } from '@/constants/upload';
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
    /**
     * 上传用途。透传给服务端的 multipart `type` 字段。
     *
     * 默认 `gallery` —— 钓点照片走那条（它会校验 Content-Type 白名单）。
     * 纠错反馈的配图走 `feedback`，落到 `feedback/{userID}/` 目录。
     * 钓鱼记录的照片走 `record`，落到 `records/{userID}/` 目录 ——
     * 与图片墙素材分开，将来清理或加 CDN 规则时互不牵连。
     */
    type?: UploadType;
  }>(),
  {
    max: SPOT_PHOTO_MAX,
    initial: () => [],
    type: 'gallery',
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

const uploadingText = UPLOADING_TEXT;
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
      uni.showToast({ title: UPLOAD_PICK_FAILED, icon: 'none' });
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
    const result = await uploadImage(file.tempFilePath, props.type);
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
 * 角标压在缩略图右上角，直径 40rpx（20pt）—— 再大就盖住照片了。
 * 半透明黑底而不是实色：它盖在照片上，实色太抢眼。
 *
 * 热区另有 88rpx（44pt），是那一块透明方形：角标本身太小，
 * 而点不准的偏偏是「删掉一张照片」这种不可逆的动作。
 * 角标缩在热区的右上角，热区多出来的那一圈往左、往下。
 */
.picker__remove-hit {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  width: 88rpx;
  height: 88rpx;
  @include fish-press-dim;
}

.picker__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
  margin: 8rpx 8rpx 0 0;
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
  color: $fish-on-dark;
  @include fish-type(caption2);
}
</style>
