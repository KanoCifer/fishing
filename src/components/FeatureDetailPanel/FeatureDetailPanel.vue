<template>
  <view v-if="visible && data" class="feature-detail">
    <view class="feature-detail__header">
      <view class="feature-detail__header-text">
        <text class="feature-detail__title">特征详情</text>
        <text class="feature-detail__subtitle">
          {{ tiles.length }} 项子特征 · 综合指数 {{ data.fishing_index }} · {{ data.level }}
        </text>
      </view>
      <view class="feature-detail__close" @tap="onClose">
        <text class="feature-detail__close-icon">✕</text>
      </view>
    </view>

    <!-- 双列指标网格 -->
    <view class="feature-detail__grid">
      <view v-for="tile in tiles" :key="tile.key" class="feature-detail__tile">
        <view class="feature-detail__tile-head">
          <text class="feature-detail__tile-label">{{ tile.label }}</text>
          <text class="feature-detail__tile-value">{{ tile.value }}</text>
        </view>
        <view class="feature-detail__gauge">
          <view
            class="feature-detail__gauge-fill"
            :class="`feature-detail__gauge-fill--${tile.tone}`"
            :style="{ width: tile.percent + '%' }"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 特征详情面板 —— 对应源项目 FishingIndexDetailSheet 的内容部分。
 *
 * 与源版本的差异：源版本套在 SnapSheet 里做三档吸附拖拽（33vh/60vh/80vh）。
 * 拖拽容器属于步骤 4 的交互外壳范围，本步骤只交付内容，
 * 所以这里出的是无容器的内容面板，由页面决定怎么摆进浮层。
 */
import { computed } from 'vue'

import type { FishingIndexData } from '@/types/fishing'

const props = defineProps<{
  data: FishingIndexData | null
  visible?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

/** 后端 feature_breakdown 的 key → 中文 label */
const LABELS: Readonly<Record<string, string>> = {
  w1_temp: '气温',
  w2_humidity: '湿度',
  w3_pressure: '气压',
  w4_wind: '风速',
  w5_rain: '降水',
  w6_tide_rising: '涨潮',
  w7_hours_to_tide: '距潮',
  w8_tide_range: '潮差',
  w9_indices: '指数',
}

/**
 * 进度条填充色按"这一项在全部特征里的相对水位"分档，而不是按绝对值。
 *
 * 钓鱼指数是加权求和，各子项量纲不一（气温 20 和湿度 80 不能比），
 * 只有归一化后的相对位置才能横向比较颜色。
 */
function gaugeTone(percent: number): string {
  if (percent >= 85) return 'success'
  if (percent >= 70) return 'accent'
  if (percent >= 50) return 'warning'
  if (percent <= 30) return 'destructive'
  return 'muted'
}

const tiles = computed(() => {
  const breakdown = props.data?.feature_breakdown ?? {}
  const entries = Object.entries(breakdown)
  if (!entries.length) return []

  // 一次算出最大值，避免每个 tile 里重算整组
  const max = Math.max(...entries.map(([, value]) => value))

  return entries.map(([key, value]) => ({
    key,
    label: LABELS[key] ?? key,
    value,
    percent: max > 0 ? Math.round((value / max) * 100) : 50,
    tone: gaugeTone(max > 0 ? (value / max) * 100 : 50),
  }))
})

function onClose() {
  emit('close')
}
</script>

<style lang="scss" scoped>
.feature-detail {
  padding: 0 40rpx 64rpx;
}

.feature-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 24rpx;
}

.feature-detail__header-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.feature-detail__title {
  color: $fish-ink;
  font-size: 32rpx;
  font-weight: 600;
}

.feature-detail__subtitle {
  margin-top: 4rpx;
  color: $fish-muted;
  font-size: 24rpx;
}

.feature-detail__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  flex-shrink: 0;
  border-radius: 50%;
}

.feature-detail__close-icon {
  color: $fish-muted;
  font-size: 32rpx;
}

.feature-detail__grid {
  display: flex;
  flex-wrap: wrap;
  padding-top: 8rpx;
}

/*
 * 双列网格：w50% + 内部 padding 会让总宽超过 100%（盒模型默认 content-box），
 * 所以外层用 flex 换行 + 内部固定 padding，而不是 w50% + box-sizing。
 */
.feature-detail__tile {
  width: 324rpx;
  margin-right: 16rpx;
  margin-bottom: 16rpx;
  padding: 24rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-surface;
}

/* 一行放两个，最后两个要占满整行（324*2 + 16 = 664，两侧 padding 40*2 = 80，正好 744） */
.feature-detail__tile:nth-child(2n) {
  margin-right: 0;
}

.feature-detail__tile-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.feature-detail__tile-label {
  color: $fish-muted;
  font-size: 24rpx;
  font-weight: 500;
}

.feature-detail__tile-value {
  color: $fish-ink;
  font-size: 28rpx;
  font-weight: 600;
}

.feature-detail__gauge {
  position: relative;
  width: 100%;
  height: 12rpx;
  overflow: hidden;
  border-radius: 999rpx;
  background-color: rgba(32, 33, 36, 0.1);
}

.feature-detail__gauge-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 999rpx;
}

.feature-detail__gauge-fill--success {
  background-color: $fish-success;
}

.feature-detail__gauge-fill--accent {
  background-color: $fish-accent;
}

.feature-detail__gauge-fill--warning {
  background-color: $fish-warning;
}

.feature-detail__gauge-fill--destructive {
  background-color: $fish-destructive;
}

.feature-detail__gauge-fill--muted {
  background-color: $fish-border;
}
</style>
