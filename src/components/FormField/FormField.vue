<template>
  <!--
    表单的一栏 —— 标签在上，内容在下。

    这一栏只给「控件本身有宽度」的那些：胶囊组、多行文本、照片网格。
    值是个短东西的（名字、时间、金额）用 FormRow —— 标签在左、值在右。

    标签单独一行，不和内容并排：这几行的控件形态差别很大，
    标签若跟着内容走，每一栏的行高都得单独调一遍。
    统一放一行上，所有栏的节奏就一致了。
  -->
  <view class="form-field">
    <view class="form-field__head">
      <text class="form-field__label">{{ label }}</text>
      <text v-if="required" class="form-field__req">*</text>
      <text v-if="hint" class="form-field__hint">{{ hint }}</text>
    </view>

    <slot />
  </view>
</template>

<script setup lang="ts">
/**
 * FormField —— 表单的一栏，标签在上、控件在下。
 *
 * 只管标签怎么排、内容往哪放。输入框、胶囊组、照片网格这些内容的形态
 * 各不一样，由使用方在插槽里自己写 —— 这一层不替它们做决定。
 */
withDefaults(
  defineProps<{
    /** 栏目名 */
    label: string;
    /** 必填。标一个星 */
    required?: boolean;
    /** 标签右边的补充说明，可不填 */
    hint?: string;
  }>(),
  {
    required: false,
    hint: '',
  },
);
</script>

<style lang="scss" scoped>
/*
 * 一栏。
 *
 * 内边距给在这一层，不给在卡上：卡里的行形态不一，
 * 每行自己知道该留多少（这一行的标签在上、控件在下，留白比 FormRow 多一点）。
 */
.form-field {
  padding: 24rpx 28rpx;
}

/*
 * 标签行。
 *
 * 标签用眉标那一档（12pt / 600 / 字距放开 / tertiaryLabel）：
 * 它是「这一栏叫什么」的引导，字号比内容小一号才不会跟内容抢。
 */
.form-field__head {
  display: flex;
  align-items: baseline;
  margin-bottom: 16rpx;
}

.form-field__label {
  color: $fish-muted-60;
  @include fish-eyebrow;
}

/* 必填的星。文字专用的深红 —— 填充色的红在白底上读不出来 */
.form-field__req {
  margin-left: 8rpx;
  color: $fish-destructive-ink;
  @include fish-type(caption2);
}

/* 补充说明。跟在标签右边，不换行 */
.form-field__hint {
  margin-left: 12rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}
</style>
