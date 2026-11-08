<template>
  <view class="backdrop" :style="{ backgroundImage: gradient }" />
</template>

<script setup lang="ts">
import { useWeatherBackdrop } from '@/composables/useWeatherBackdrop';

const { gradient } = useWeatherBackdrop();
</script>

<style lang="scss" scoped>
.backdrop {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
}
</style>
