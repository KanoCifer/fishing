<template>
  <view class="page">
    <!--
      沉浸式导航栏。它浮在地图之上，所以组件内部用的是 cover-view 而不是 view。
      页面配了 navigationStyle: custom，原生栏已经关掉了。
    -->
    <NavBar title="fishing" />

    <!-- 全屏地图 -->
    <FullscreenMap
      v-if="view === 'map'"
      class="page__map"
      :top-inset="nav.navBarBottom"
      @regionchange="onRegionChange"
    />

    <!-- 图表 -->
    <view v-else class="page__chart" :style="{ paddingTop: chartTop + 'px' }">
      <view class="card">
        <view class="card__header">
          <text class="card__title">近 7 天渔获趋势</text>
          <text class="card__sub">
            <text class="dot" />
            {{ total }} 尾 · 日均 {{ avg }} 尾
          </text>
        </view>

        <LineChart :categories="categories" :series="series" />
      </view>
    </view>

    <!--
      切换按钮必须用 cover-view：它在地图视图时压在原生 map 组件之上，
      普通 view 无论 z-index 多大都会被 map 盖住。
      top 绑定 navBarBottom 是因为导航栏是浮层，按钮得排在它下面而不是被它盖住。
    -->
    <cover-view class="switcher" :style="{ top: nav.navBarBottom + 'px' }">
      <cover-view class="switcher__btn" @tap="toggle">
        {{ view === 'map' ? '看数据' : '看地图' }}
      </cover-view>
    </cover-view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import FullscreenMap from '@/components/FullscreenMap/FullscreenMap.vue'
import LineChart from '@/components/LineChart/LineChart.vue'
import { useNavMetrics } from '@/composables/useNavMetrics'

// 导航栏是浮层，页面里凡是贴在顶部的元素都得按它的高度往下让
const nav = useNavMetrics()

// 图表卡片的上内边距：导航栏底边 + 一段 rpx 间距。
// rpx 和 px 不是同一套单位，相加前必须过 upx2px——这里不换算的话间距会差将近一倍。
const chartTop = nav.navBarBottom + uni.upx2px(20)

const view = ref<'map' | 'chart'>('map')

function toggle() {
  view.value = view.value === 'map' ? 'chart' : 'map'
}

const categories = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const series = reactive([
  { name: '渔获数', data: [12, 28, 45, 38, 62, 80, 55] },
  { name: '出钓次数', data: [3, 4, 6, 5, 7, 9, 6] },
])

const total = computed(() => series[0].data.reduce((a, b) => a + b, 0))
const avg = computed(() => Math.round(total.value / categories.length))

function onRegionChange(e: { latitude: number; longitude: number; scale: number }) {
  console.log('地图视野变化', e)
}
</script>

<style lang="scss" scoped>
.page {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #f5f6f8;
}

.page__map {
  width: 100%;
  height: 100%;
}

.page__chart {
  height: 100%;
  padding: 30rpx;
  /* padding-top 由脚本按导航栏高度动态绑定，这里不能写死 */
  box-sizing: border-box;
  overflow: hidden;
}

.card {
  background: #fff;
  border-radius: 20rpx;
  padding: 30rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);

  animation: card-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(40rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.card__title {
  font-size: 32rpx;
  font-weight: 600;
  color: $uni-text-color;
}

.card__sub {
  display: flex;
  align-items: center;
  font-size: 24rpx;
  color: $uni-text-color-grey;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  margin-right: 10rpx;
  border-radius: 50%;
  background: $uni-color-success;
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.75);
  }
}

/* cover-view 只支持极少的 CSS：不能用 box-shadow，字号必须写具体值 */
.switcher {
  position: absolute;
  left: 30rpx;
  /* top 由脚本按导航栏底边动态绑定，这里只用 margin-top 留出固定间距 */
  margin-top: 20rpx;
}

.switcher__btn {
  display: inline-block;
  padding: 18rpx 32rpx;
  background-color: rgba(0, 0, 0, 0.65);
  border-radius: 999rpx;
  color: #ffffff;
  font-size: 26rpx;
  text-align: center;
}
</style>
