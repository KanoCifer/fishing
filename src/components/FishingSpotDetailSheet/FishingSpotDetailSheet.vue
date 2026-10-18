<template>
  <SnapSheet :open="open && !!marker" :snap-points="SNAP_POINTS" :initial-snap="0" @close="onClose">
    <template #header>
      <view class="spot-detail__header">
        <view class="spot-detail__header-text">
          <text class="spot-detail__title">{{ spot?.name || '钓点详情' }}</text>
          <text v-if="dateLabel" class="spot-detail__date">{{ dateLabel }}</text>
        </view>
      </view>
    </template>

    <!-- 编辑态 -->
    <view v-if="editing" class="spot-detail__form">
      <view class="spot-detail__field">
        <text class="spot-detail__label">名称</text>
        <input
          class="spot-detail__input"
          :value="editName"
          placeholder="钓点名称"
          placeholder-class="spot-detail__placeholder"
          @input="onNameInput"
        />
      </view>

      <view class="spot-detail__field">
        <text class="spot-detail__label">描述</text>
        <textarea
          class="spot-detail__textarea"
          :value="editDescription"
          placeholder="这个钓点的情况"
          placeholder-class="spot-detail__placeholder"
          :maxlength="-1"
          @input="onDescriptionInput"
        />
      </view>

      <view class="spot-detail__field">
        <text class="spot-detail__label">标签（逗号分隔）</text>
        <input
          class="spot-detail__input"
          :value="editTags"
          placeholder="例如：矶钓, 深岸, 禁钓区"
          placeholder-class="spot-detail__placeholder"
          @input="onTagsInput"
        />
      </view>

      <view class="spot-detail__field">
        <text class="spot-detail__label">评分</text>
        <view class="spot-detail__stars">
          <text
            v-for="i in 5"
            :key="i"
            class="spot-detail__star"
            :class="{ 'spot-detail__star--on': i <= editRating }"
            @tap="editRating = i"
          >
            ★
          </text>
        </view>
      </view>

      <view class="spot-detail__form-actions">
        <view class="spot-detail__btn spot-detail__btn--ghost" @tap="cancelEdit">
          <text class="spot-detail__btn-text">取消</text>
        </view>
        <view
          class="spot-detail__btn spot-detail__btn--primary"
          :class="{ 'spot-detail__btn--disabled': saving || !editName.trim() }"
          @tap="saveEdit"
        >
          <text class="spot-detail__btn-text">{{ saving ? '保存中…' : '保存' }}</text>
        </view>
      </view>
    </view>

    <!-- 浏览态 -->
    <view v-else class="spot-detail__content">
      <!-- 评分 -->
      <view v-if="spot && spot.rating !== undefined" class="spot-detail__rating">
        <text
          v-for="i in 5"
          :key="i"
          class="spot-detail__star spot-detail__star--readonly"
          :class="{ 'spot-detail__star--on': i <= Math.round(spot.rating) }"
        >
          ★
        </text>
        <text class="spot-detail__rating-value">{{ spot.rating.toFixed(1) }}</text>
      </view>

      <text v-if="spot?.description" class="spot-detail__description">
        {{ spot.description }}
      </text>

      <view v-if="spot?.tags?.length" class="spot-detail__tags">
        <text v-for="tag in spot.tags" :key="tag" class="spot-detail__tag">
          {{ tag }}
        </text>
      </view>

      <!-- 信息组 -->
      <view class="spot-detail__group">
        <view v-if="coordinateLabel" class="spot-detail__row">
          <text class="spot-detail__row-label">位置</text>
          <text class="spot-detail__row-value">{{ coordinateLabel }}</text>
        </view>
        <view v-if="spot?.created_at" class="spot-detail__row">
          <text class="spot-detail__row-label">创建时间</text>
          <text class="spot-detail__row-value">{{ createdLabel }}</text>
        </view>
      </view>

      <!-- 操作 -->
      <view class="spot-detail__actions">
        <view class="spot-detail__btn spot-detail__btn--ghost" @tap="startEdit">
          <text class="spot-detail__btn-text">编辑</text>
        </view>
        <view class="spot-detail__btn spot-detail__btn--danger" @tap="deleteOpen = true">
          <text class="spot-detail__btn-text">删除</text>
        </view>
      </view>

      <!-- 删除确认：二次确认放在原地，不弹第二个 modal 打断上下文 -->
      <view v-if="deleteOpen" class="spot-detail__confirm">
        <text class="spot-detail__confirm-text"> 删除钓点「{{ spot?.name ?? '' }}」？软删可在后端恢复。 </text>
        <view class="spot-detail__form-actions">
          <view class="spot-detail__btn spot-detail__btn--ghost" @tap="deleteOpen = false">
            <text class="spot-detail__btn-text">取消</text>
          </view>
          <view
            class="spot-detail__btn spot-detail__btn--danger-solid"
            :class="{ 'spot-detail__btn--disabled': deleting }"
            @tap="doDelete"
          >
            <text class="spot-detail__btn-text">{{ deleting ? '删除中…' : '确认删除' }}</text>
          </view>
        </view>
      </view>
    </view>
  </SnapSheet>
</template>

<script setup lang="ts">
/**
 * 钓点详情面板 —— 对应源项目 FishingSpotDetailSheet.tsx。
 *
 * 支持内联编辑：编辑保存调 fishingSpotApi.update，删除调 remove，
 * 两者都通过 emit 通知父组件同步地图标记。
 *
 * 与源版本的差异：
 * - 导航按钮整个去掉。源版导航调 AMap.Driving 画 Polyline，
 *   小程序端没有路径规划能力（路线规划已确认本期不做），
 *   留一个点不动的按钮比没有更糟
 * - lucide 图标换 emoji / 纯文本
 * - 删除确认内联展开，不套第二层 modal
 */
import { computed, ref, watch } from 'vue';

import { fishingSpotApi } from '@/api/fishing';
import { toErrorMessage } from '@/composables/useFishingMapStore';
import type { MapMarker, UpdateFishingSpotPayload } from '@/types/fishing';

import SnapSheet from '../SnapSheet/SnapSheet.vue';

const SNAP_POINTS = [50, 78] as const;

const props = defineProps<{
  open: boolean;
  /** 完整 MapMarker：extraData 供展示，position 供坐标行 */
  marker: MapMarker | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated', marker: MapMarker): void;
  (e: 'deleted', id: string): void;
}>();

const spot = computed(() => props.marker?.extraData);

const editing = ref(false);
const editName = ref('');
const editDescription = ref('');
const editTags = ref('');
const editRating = ref(0);
const saving = ref(false);

const deleteOpen = ref(false);
const deleting = ref(false);

/** 每次打开重置编辑态 —— 上一次没保存完的草稿不该带进来 */
watch(
  () => props.open,
  (open) => {
    if (!open) {
      editing.value = false;
      deleteOpen.value = false;
    }
  },
);

const dateLabel = computed(() => {
  const created = spot.value?.created_at;
  if (!created) return '';
  return `记于 ${created.slice(0, 10)}`;
});

const createdLabel = computed(() => {
  const created = spot.value?.created_at;
  if (!created) return '';
  return created.slice(0, 16).replace('T', ' ');
});

const coordinateLabel = computed(() => {
  const position = props.marker?.position;
  if (!position) return '';
  return `${position[0].toFixed(4)}, ${position[1].toFixed(4)}`;
});

function startEdit() {
  if (!spot.value) return;
  editName.value = spot.value.name ?? '';
  editDescription.value = spot.value.description ?? '';
  editTags.value = (spot.value.tags ?? []).join(', ');
  editRating.value = spot.value.rating ?? 0;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
}

// ── input 事件 ──
//
// InputEvent 的 detail 形状由 src/shime-uni.d.ts 里的全局声明补齐，
// 官方 @dcloudio/types 缺这一项，补全的原因见那个文件的注释。

function onNameInput(e: InputEvent) {
  editName.value = e.detail.value;
}

function onDescriptionInput(e: InputEvent) {
  editDescription.value = e.detail.value;
}

function onTagsInput(e: InputEvent) {
  editTags.value = e.detail.value;
}

async function saveEdit() {
  const current = spot.value;
  if (!current || saving.value) return;

  const name = editName.value.trim();
  if (!name) {
    uni.showToast({ title: '名称不能为空', icon: 'none' });
    return;
  }

  // 半角逗号切分，前后空白和空项都要滤掉：
  // "a, b ,,c" 应该得到 ["a","b","c"] 而不是带空串的 4 项
  const tags = editTags.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const payload: UpdateFishingSpotPayload = {
    name,
    description: editDescription.value.trim(),
    tags,
    rating: editRating.value,
  };

  saving.value = true;
  try {
    await fishingSpotApi.update(current.id, payload);
    editing.value = false;
    uni.showToast({ title: '已保存', icon: 'success' });

    emit('updated', {
      ...(props.marker as MapMarker),
      extraData: {
        ...current,
        ...payload,
        tags,
      },
    });
  } catch (err) {
    uni.showToast({
      title: toErrorMessage(err, '更新钓点失败'),
      icon: 'none',
    });
  } finally {
    saving.value = false;
  }
}

async function doDelete() {
  const current = spot.value;
  if (!current || deleting.value) return;

  deleting.value = true;
  try {
    await fishingSpotApi.remove(current.id);
    deleteOpen.value = false;
    emit('deleted', current.id);
    emit('close');
    uni.showToast({ title: '已删除', icon: 'success' });
  } catch (err) {
    uni.showToast({
      title: toErrorMessage(err, '删除钓点失败'),
      icon: 'none',
    });
  } finally {
    deleting.value = false;
  }
}

function onClose() {
  emit('close');
}
</script>

<style lang="scss" scoped>
.spot-detail__header {
  padding: 0 40rpx 24rpx;
  border-bottom: 2rpx solid $fish-border-40;
}

.spot-detail__header-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.spot-detail__title {
  max-width: 560rpx;
  overflow: hidden;
  color: $fish-ink;
  font-size: 32rpx;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.spot-detail__date {
  margin-top: 4rpx;
  color: $fish-muted;
  font-size: 24rpx;
}

.spot-detail__content,
.spot-detail__form {
  padding: 32rpx 40rpx 64rpx;
}

/* 评分 */
.spot-detail__rating {
  display: flex;
  align-items: center;
  margin-bottom: 32rpx;
}

.spot-detail__star {
  margin-right: 8rpx;
  color: rgba(32, 33, 36, 0.15);
  font-size: 48rpx;
}

.spot-detail__star--on {
  color: $fish-warning;
}

.spot-detail__rating-value {
  margin-left: 12rpx;
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.spot-detail__description {
  display: block;
  margin-bottom: 32rpx;
  color: $fish-ink;
  font-size: 30rpx;
  line-height: 1.7;
}

.spot-detail__tags {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 32rpx;
}

.spot-detail__tag {
  margin: 0 12rpx 12rpx 0;
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  background-color: $fish-surface;
  color: $fish-muted;
  font-size: 24rpx;
}

.spot-detail__group {
  margin-bottom: 32rpx;
  border-radius: $fish-radius-xl;
  overflow: hidden;
  background-color: $fish-page;
}

.spot-detail__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 32rpx;
  border-bottom: 2rpx solid $fish-border-40;
}

.spot-detail__row:last-child {
  border-bottom: none;
}

.spot-detail__row-label {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.spot-detail__row-value {
  color: $fish-ink;
  font-size: 26rpx;
  font-weight: 500;
}

/* 操作 */
.spot-detail__actions {
  display: flex;
}

.spot-detail__form-actions {
  display: flex;
  margin-top: 32rpx;
}

.spot-detail__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  margin: 0 8rpx;
  border-radius: 999rpx;
}

.spot-detail__btn--ghost {
  background-color: $fish-surface;
}

.spot-detail__btn--primary {
  background-color: $fish-accent;
}

.spot-detail__btn--danger {
  background-color: rgba(234, 67, 53, 0.1);
}

.spot-detail__btn--danger-solid {
  background-color: $fish-destructive;
}

.spot-detail__btn--disabled {
  opacity: 0.5;
}

.spot-detail__btn-text {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 500;
}

/* 删除确认 */
.spot-detail__confirm {
  margin-top: 40rpx;
  padding-top: 32rpx;
  border-top: 2rpx solid $fish-border-40;
}

.spot-detail__confirm-text {
  display: block;
  color: $fish-muted;
  font-size: 26rpx;
  line-height: 1.6;
}

/* 表单 */
.spot-detail__field {
  margin-bottom: 28rpx;
}

.spot-detail__label {
  display: block;
  margin-bottom: 12rpx;
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.spot-detail__input {
  width: 100%;
  height: 88rpx;
  padding: 0 28rpx;
  border: 2rpx solid $fish-border;
  border-radius: $fish-radius-lg;
  background-color: $fish-page;
  color: $fish-ink;
  font-size: 28rpx;
  box-sizing: border-box;
}

.spot-detail__textarea {
  width: 100%;
  height: 160rpx;
  padding: 20rpx 28rpx;
  border: 2rpx solid $fish-border;
  border-radius: $fish-radius-lg;
  background-color: $fish-page;
  color: $fish-ink;
  font-size: 28rpx;
  line-height: 1.6;
  box-sizing: border-box;
}

.spot-detail__placeholder {
  color: $uni-text-color-placeholder;
}

.spot-detail__stars {
  display: flex;
}
</style>
