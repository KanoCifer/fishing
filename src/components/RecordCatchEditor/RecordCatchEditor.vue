<template>
  <!--
    渔获清单编辑器 —— 一次出行钓到的每一种鱼，各一行。

    两层输入：
    - 上面的常用鱼种是**快选**，点一下就落一行，省掉打字
    - 下面是自由输入，清单外的鱼（鲈鲌、翘嘴、杂鱼）也能记

    一行 = 一种鱼 + 数量。行与行之间不合并同名的鱼 ——
    用户可能真的钓了两条不同大小的鲫鱼，那是两条鱼，不是四个。
  -->
  <view class="catches">
    <!-- 常用鱼种 -->
    <scroll-view class="catches__suggest" scroll-x :show-scrollbar="false">
      <view class="catches__suggest-row">
        <view v-for="name in suggestions" :key="name" class="catches__suggest-item" @tap="addByName(name)">
          <text class="catches__suggest-text">{{ name }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- 已记的渔获 -->
    <view v-if="rows.length" class="catches__list">
      <view v-for="(row, index) in rows" :key="index" class="catches__row">
        <input
          class="catches__species"
          :value="row.species"
          :placeholder="speciesPlaceholder"
          placeholder-class="catches__placeholder"
          @input="onSpeciesInput(index, $event)"
        />

        <view class="catches__quantity">
          <view class="catches__step" @tap="stepQuantity(index, -1)">
            <image class="catches__step-icon" :src="minusIcon" mode="aspectFit" />
          </view>

          <input
            class="catches__quantity-input"
            type="number"
            :value="String(row.quantity)"
            :placeholder="quantityPlaceholder"
            placeholder-class="catches__placeholder"
            @input="onQuantityInput(index, $event)"
          />

          <view class="catches__step" @tap="stepQuantity(index, 1)">
            <image class="catches__step-icon" :src="plusIcon" mode="aspectFit" />
          </view>
        </view>

        <view class="catches__remove" @tap="removeRow(index)">
          <image class="catches__remove-icon" :src="removeIcon" mode="aspectFit" />
        </view>
      </view>
    </view>

    <!-- 空态 -->
    <view v-else class="catches__empty">
      <text class="catches__empty-title">{{ emptyTitle }}</text>
      <text class="catches__empty-hint">{{ emptyHint }}</text>
    </view>

    <!-- 加一条 -->
    <view class="catches__add" @tap="addRow">
      <image class="catches__add-icon" :src="addIcon" mode="aspectFit" />
      <text class="catches__add-text">{{ addLabel }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 渔获清单编辑器。
 *
 * 自己持有一份可编辑的副本，把改动往上抛 —— 输入框要是直接绑 prop，
 * 每次按键都要走一趟「父组件改 state → 回传 prop」，
 * 在小程序里这个回路会让光标跳。
 */
import { ref, watch } from 'vue';

import { icon } from '@/constants/icons';
import { RECORD_CREATE, RECORD_SPECIES_SUGGESTIONS } from '@/constants/record';
import type { FishingLogCatch } from '@/types/record';

const props = withDefaults(
  defineProps<{
    /** 当前的渔获清单 */
    catches?: FishingLogCatch[];
    /** 快选候选 */
    suggestions?: readonly string[];
  }>(),
  {
    catches: () => [],
    suggestions: () => RECORD_SPECIES_SUGGESTIONS,
  },
);

const emit = defineEmits<{
  /** 清单变了 */
  change: [catches: FishingLogCatch[]];
}>();

/** 可编辑的副本 */
const rows = ref<FishingLogCatch[]>(props.catches.map((item) => ({ ...item })));

/** 父组件换了清单就同步过来。但不回写 —— 回写会把用户正在打的字冲掉 */
watch(
  () => props.catches,
  (next) => {
    if (JSON.stringify(next) === JSON.stringify(rows.value)) return;
    rows.value = next.map((item) => ({ ...item }));
  },
  { deep: true },
);

const speciesPlaceholder = RECORD_CREATE.speciesPlaceholder;
const quantityPlaceholder = RECORD_CREATE.quantityPlaceholder;
const emptyTitle = RECORD_CREATE.catchEmpty;
const emptyHint = RECORD_CREATE.catchEmptyHint;
const addLabel = RECORD_CREATE.addCatch;

const addIcon = icon('plus', 'muted');
const removeIcon = icon('x', 'muted');

/**
 * 步进的两个箭头。
 *
 * 减号压灰、加号压蓝：减是收的动作，加是给的动作，
 * 一个是往回退一个是往前要，不该同色。
 */
const minusIcon = icon('minus', 'muted');
const plusIcon = icon('plus', 'blue');

/** 把改动抛上去 */
function commit(next: FishingLogCatch[]): void {
  rows.value = next;
  emit('change', next);
}

/** 加一条空行 */
function addRow(): void {
  commit([...rows.value, { species: '', quantity: 1 }]);
}

/**
 * 按快选加一条。
 *
 * 已经记过这个鱼种就**加数量**，不再加一行 ——
 * 用户连点三次「鲫鱼」想要的显然是三条鲫鱼，不是三行鲫鱼。
 */
function addByName(name: string): void {
  const existing = rows.value.find((row) => row.species === name);
  if (existing) {
    commit(rows.value.map((row) => (row === existing ? { ...row, quantity: row.quantity + 1 } : row)));
    return;
  }
  commit([...rows.value, { species: name, quantity: 1 }]);
}

/** 删一行 */
function removeRow(index: number): void {
  commit(rows.value.filter((_, i) => i !== index));
}

/** 改鱼种 */
function onSpeciesInput(index: number, event: { detail: { value: string } }): void {
  const value = event.detail.value;
  commit(rows.value.map((row, i) => (i === index ? { ...row, species: value } : row)));
}

/**
 * 数量步进。
 *
 * 加减各按一下是最快的路径 —— 连点三次「鲫鱼」走的就是这条路。
 * 中间那个数字仍然是可以直接改的输入框：一次钓了二十条的时候，
 * 按二十下不现实。
 *
 * 减到 1 就不动了。再减该删掉整行，但「删一行」已经有它自己的按钮，
 * 在这里顺手删掉会让人以为数量能减到零。
 */
function stepQuantity(index: number, delta: number): void {
  const row = rows.value[index];
  if (!row) return;

  const next = row.quantity + delta;
  if (next < 1) return;

  commit(rows.value.map((item, i) => (i === index ? { ...item, quantity: next } : item)));
}

/**
 * 改数量。
 *
 * 输入框可能是空的、可能是非数字 —— 这两种都当 1：
 * 数量为空时显示 0，用户会以为「记了 0 条」，而实际是他还没填完。
 */
function onQuantityInput(index: number, event: { detail: { value: string } }): void {
  const parsed = Number.parseInt(event.detail.value, 10);
  const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  commit(rows.value.map((row, i) => (i === index ? { ...row, quantity } : row)));
}
</script>

<style lang="scss" scoped>
/*
 * 容器是竖排的 flex —— 「加一条」那一枚要靠 align-self 收成自己的宽度，
 * 块级布局里 align-self 不起作用，那枚按钮会被拉成整行宽。
 */
.catches {
  display: flex;
  flex-direction: column;
}

/*
 * 快选行。
 *
 * 横向滚动而不是换行 —— 23 个鱼种换行要占三行，把下面的渔获列表挤到屏幕外。
 */
.catches__suggest {
  width: 100%;
  margin-bottom: 24rpx;
  white-space: nowrap;
}

.catches__suggest-row {
  display: inline-flex;
  padding-bottom: 4rpx;
}

.catches__suggest-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56rpx;
  padding: 0 24rpx;
  margin-right: 16rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-fill;
  @include fish-press-dim;
}

.catches__suggest-text {
  color: $fish-muted;
  @include fish-type(caption);
}

/* 已记的渔获。每行三块：鱼种、数量、删除 */
.catches__list {
  display: flex;
  flex-direction: column;
}

.catches__row {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

/*
 * 鱼种输入框。
 *
 * 占满剩下的宽度 —— 鱼种名比数字长得多，数字框给窄了才轮到鱼种。
 *
 * 没有底色：这一行旁边已经有步进器那个圆角块了，
 * 再给鱼种也铺一块底，一行里就有两块灰，像两个控件并排。
 */
.catches__species {
  flex: 1;
  min-width: 0;
  height: 80rpx;
  padding: 0 4rpx;
  border-radius: $fish-radius-lg;
  background-color: transparent;
  color: $fish-ink;
  @include fish-type(body);
}

/*
 * 数量步进。
 *
 * 一颗药丸：减号 · 数字 · 加号。数字那一格仍是可以点的输入框，
 * 一次钓很多条的时候直接改比按很多下快。
 *
 * 整颗药丸不跟着行高走，按下反馈用变暗：缩小会让数字在药丸里跳一下。
 */
.catches__quantity {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 72rpx;
  padding: 0 4rpx;
  margin-left: 16rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-surface;
}

.catches__step {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 72rpx;
  @include fish-press-dim;
}

.catches__step-icon {
  width: 28rpx;
  height: 28rpx;
}

/* 中间那个数字 */
.catches__quantity-input {
  width: 56rpx;
  height: 72rpx;
  background-color: transparent;
  color: $fish-ink;
  @include fish-type(body);

  text-align: center;
}

.catches__placeholder {
  color: $fish-muted-60;
  font-size: 26rpx;
}

/* 删除。命中区 72rpx，比图标大 —— 图标只有 20rpx */
.catches__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  margin-left: 8rpx;
  @include fish-press-dim;
}

.catches__remove-icon {
  width: 24rpx;
  height: 24rpx;
}

/*
 * 空态。
 *
 * 不是一张卡，是一句话 —— 空态不是内容，硬套一张卡反而像坏了。
 */
.catches__empty {
  padding: 32rpx 0;
}

.catches__empty-title {
  display: block;
  color: $fish-ink;
  @include fish-type(callout);
}

.catches__empty-hint {
  display: block;
  margin-top: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 加一条 */
.catches__add {
  display: flex;
  align-items: center;
  align-self: flex-start;
  height: 72rpx;
  padding: 0 24rpx;
  margin-top: 8rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-accent-tint;
  @include fish-press-dim;
}

.catches__add-icon {
  width: 24rpx;
  height: 24rpx;
  margin-right: 8rpx;
}

.catches__add-text {
  color: $fish-blue-600;
  @include fish-type(caption);

  font-weight: 600;
}
</style>
