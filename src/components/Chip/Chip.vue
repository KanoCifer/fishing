<template>
  <!--
    标签 —— 静态标记，不是可选中的 chip。

    胶囊形会让人以为能点，所以是圆角矩形（$fish-radius-sm）。
    高度固定 48rpx，文字垂直居中：同一行的标签基线才对得齐。
  -->
  <text class="chip" :class="`chip--${tone}`"><slot /></text>
</template>

<script setup lang="ts">
/**
 * Chip —— 静态标签。
 *
 * 颜色档位跟钓鱼等级、色调那套语义色对齐：accent 是主色的一档，
 * ok / warn / bad 是 iOS 系统色各自的淡底。
 * 底色一律淡一档 + 文字压深 —— 标签只有 12pt 大，
 * 深底白字在这尺寸上过不了 4.5:1，小字容不下那种对比度。
 */
withDefaults(
  defineProps<{
    tone?: 'default' | 'accent' | 'ok' | 'warn' | 'bad';
  }>(),
  {
    tone: 'default',
  },
);
</script>

<style lang="scss" scoped>
.chip {
  display: inline-flex;
  align-items: center;
  height: 48rpx;
  padding: 0 18rpx;
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  color: $fish-muted;
  @include fish-type(caption);

  white-space: nowrap;
}

.chip--accent {
  background-color: $fish-avatar-tint;
  color: $fish-blue-600;
}

.chip--ok {
  background-color: $fish-tone-tint;
  color: $fish-success-ink;
}

.chip--warn {
  background-color: $fish-warning-tint;
  color: $fish-warning-ink;
}

.chip--bad {
  background-color: $fish-destructive-tint;
  color: $fish-destructive-ink;
}
</style>
