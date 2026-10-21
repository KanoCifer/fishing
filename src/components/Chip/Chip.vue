<template>
  <!-- 标签 —— 静态标记，不是可选中的 chip。  -->
  <text class="chip" :class="`chip--${tone}`"><slot /></text>
</template>

<script setup lang="ts">
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
  border-radius: $fish-radius-lg;
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
