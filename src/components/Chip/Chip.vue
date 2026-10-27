<template>
  <!-- 标签 —— 静态标记，不是可选中的 chip。  -->
  <text class="chip" :class="[`chip--${tone}`, { 'chip--pill': pill }]"><slot /></text>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'default' | 'accent' | 'ok' | 'warn' | 'bad';
    pill?: boolean;
  }>(),
  {
    tone: 'default',
    pill: false,
  },
);
</script>

<style lang="scss" scoped>
.chip {
  display: inline-flex;
  align-items: center;
  height: 48rpx;
  padding: 0 18rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-surface;
  color: $fish-muted;
  @include fish-type(caption);

  white-space: nowrap;
}

/* 胶囊：圆角收到高度的一半 */
.chip--pill {
  border-radius: $fish-radius-pill;
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
