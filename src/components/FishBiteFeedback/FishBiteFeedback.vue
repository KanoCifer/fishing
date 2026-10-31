<template>
  <!--
    鱼口体验 —— 反馈「今天钓得怎么样」的那一档。

    这不是分段控件：分段控件的隐含语义是切视图，而这里是作答。
    选中态给一枚实心蓝胶囊，比白块更明确地表示「我选了这个」。
  -->
  <view class="bite">
    <text class="bite__title">{{ title }}</text>

    <view class="bite__options">
      <view
        v-for="option in FISHING_FEEDBACK_LEVELS"
        :key="option.value"
        class="bite__option"
        :class="{ 'bite__option--active': selected === option.value }"
        @tap="select(option.value)"
      >
        <text class="bite__option-text" :class="{ 'bite__option-text--active': selected === option.value }">
          {{ option.label }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 五档鱼口体验的单选。
 *
 * 受控组件：自己不存选中态，只在点击时把新的取值报上去 ——
 * 表单页要把所有字段的取值攒成一份载荷再提交。
 *
 * 事件名用 `change` 而不是 `update:modelValue`：小程序端的自定义事件名
 * 带冒号时绑定写法不确定，而这个项目里其它受控组件（ChoiceChips、
 * ImagePicker、RecordCatchEditor）一律用 `change`。
 */
import { FISHING_FEEDBACK, FISHING_FEEDBACK_LEVELS } from '@/constants/feedback';
import type { FishingFeedbackLevel } from '@/types/fishing';

withDefaults(
  defineProps<{
    /** 当前选中的那一档。null = 还没选 */
    selected: FishingFeedbackLevel | null;
    /** 卡片标题 */
    title?: string;
  }>(),
  {
    title: FISHING_FEEDBACK.title,
  },
);

const emit = defineEmits<{
  /** 选中的那一档变了 */
  change: [value: FishingFeedbackLevel];
}>();

function select(value: FishingFeedbackLevel): void {
  emit('change', value);
}
</script>

<style lang="scss" scoped>
.bite__title {
  display: block;
  margin-bottom: 16rpx;
  color: $fish-ink;
  @include fish-type(subhead);
}

/*
 * 五个选项平分一行。
 *
 * 这是「单选一组」，不是分段控件 —— 段控件的隐含语义是切视图，
 * 而这里是作答。选中态给一枚实心蓝胶囊，比白块更明确地表示「我选了这个」，
 * 白块 + 蓝字在五个挨着的选项里容易看成「高亮了一行」。
 */
.bite__options {
  display: flex;
  padding: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
}

.bite__option {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 72rpx;
  border-radius: $fish-radius-pill;
  @include fish-press-dim;
}

.bite__option--active {
  background-color: $fish-accent;
}

.bite__option-text {
  color: $fish-muted;
  @include fish-type(callout);
}

.bite__option-text--active {
  color: $fish-on-accent;
  font-weight: 600;
}
</style>
