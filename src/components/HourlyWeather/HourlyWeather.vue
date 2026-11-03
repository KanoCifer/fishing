<template>
  <view class="hourly">
    <scroll-view class="hourly__scroll" scroll-x :show-scrollbar="false">
      <view v-if="hours.length" class="hourly__track">
        <view
          v-for="(hour, i) in hours"
          :key="hour.fxTime"
          class="hourly__cell"
          :class="{ 'hourly__cell--first': i === 0 }"
        >
          <text class="hourly__time">{{ parseFxTime(hour.fxTime)?.time ?? '' }}</text>
          <image class="hourly__icon" :src="weatherIconUri(hour.icon)" mode="aspectFit" />
          <text class="hourly__temp">{{ hour.temp }}°</text>
          <view class="hourly__prob">
            <view v-if="hour.prob > 0" class="hourly__prob-fill" :style="`width:${hour.prob}%`" />
          </view>
        </view>
      </view>

      <!-- 加载中：骨架照着真实格子的行盒摆 -->
      <view v-else-if="!settled" class="hourly__track">
        <view v-for="i in 8" :key="i" class="hourly__cell">
          <view class="hourly__skeleton hourly__skeleton--time" />
          <view class="hourly__skeleton hourly__skeleton--icon" />
          <view class="hourly__skeleton hourly__skeleton--temp" />
        </view>
      </view>
    </scroll-view>
    <!--
      空态不是加载态。取不到逐时数据的时候，这张卡要是继续摆骨架，
      它会一直呼吸下去 —— 用户读到的是「还在取」，其实早就没有数据了。
    -->
    <text v-if="!hours.length && settled" class="hourly__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 逐时预报 —— iOS Weather 招牌的横向滚动条，对应源项目 HourlyWeather。
 *
 * 现在是「未来 24 小时」卡的**逐时态**（见 Next24Hours）：卡壳与标题行
 * 由外层那张卡给，这里只管逐时格子本身 —— 它和指标曲线说的是同一份
 * 数据，拆成两张卡就是同一批温度说了两遍。
 *
 * 小程序端必须用 `<scroll-view>` 而不是 CSS overflow-x：
 * 横向滚动的惯性、边界回弹都是原生组件给的，用 view + overflow 模拟不出来。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import { parseFxTime } from '@/utils/date';
import { num, weatherIconUri } from '@/utils/weather';

const mapStore = useFishingMapStore();

const loading = computed(() => mapStore.locating || mapStore.weatherLoading);

const settled = computed(() => !loading.value && (mapStore.indexData !== null || mapStore.weatherError !== ''));

const emptyText = computed(() => {
  if (mapStore.weatherError) return '逐时预报暂时取不到，其余天气数据不受影响';
  return '未来 24 小时没有逐时数据';
});

const hours = computed(() =>
  mapStore.weatherHourly.slice(0, 24).map((hour) => {
    const prob = num(hour.precipProbability);
    return {
      fxTime: hour.fxTime,
      temp: hour.temp ?? '',
      icon: hour.icon ?? '',
      // 概率为 0 归一成 0：模板里只判「有没有」，不判「是不是 0」
      prob: prob !== null && prob > 0 ? prob : 0,
    };
  }),
);
</script>

<style lang="scss" scoped>
/*
 * 这一块现在是「未来 24 小时」卡的一个态（见 Next24Hours）——
 * 玻璃面、卡内留白、标题行都由外层那张卡给。
 *
 * 所以这里没有 @include fish-card：卡里再套一层玻璃面，
 * 里面就多了一张贴纸（见 _material 的 fish-glass）。
 */

.hourly__scroll {
  width: 100%;
  white-space: nowrap;
}

.hourly__track {
  display: flex;
  padding: 0 4rpx;
}

.hourly__cell {
  display: flex;
  width: 108rpx;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 0;
}

.hourly__time {
  color: $fish-muted;
  @include fish-type(caption);
}

/* 「最近的一小时」这一格靠字重站出来，不靠颜色 —— 加了颜色就变成在提示，
   而它其实是状态，不是提醒 */
.hourly__cell--first .hourly__time {
  color: $fish-blue-600;
  font-weight: 600;
}

/*
 * 图标是一张图，不是一行字。
 *
 * 所以它不吃字阶：尺寸用宽高给，位置靠外边距 ——
 * 图标在竖排里独占一行，这一行的高度得跟同格的其他两行对得上。
 */
.hourly__icon {
  width: 64rpx;
  height: 64rpx;
  margin: 12rpx 0;
}

.hourly__temp {
  color: $fish-ink;
  @include fish-type(body);

  font-weight: 600;
}

/*
 * 降水概率的轨道与填充。
 *
 * 轨道没有底色 —— 它只是给填充条留出位置，让整排格子的温度落在同一条基线上。
 * 真给它一个灰底，每格就都多了一条没意义的横杠。
 */
.hourly__prob {
  display: flex;
  align-items: center;
  width: 56rpx;
  height: 6rpx;
  margin-top: 10rpx;
}

.hourly__prob-fill {
  height: 100%;
  border-radius: $fish-radius-pill;
  background-color: $fish-tide;
}

.hourly__skeleton {
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.hourly__skeleton--time {
  width: 64rpx;
  height: 12rpx;
}

.hourly__skeleton--icon {
  width: 64rpx;
  height: 64rpx;
  margin: 12rpx 0;
  border-radius: 50%;
}

.hourly__skeleton--temp {
  width: 48rpx;
  height: 14rpx;
}
.hourly__empty {
  display: block;
  padding: 64rpx 0;
  color: $fish-muted-60;
  @include fish-type(body);
  text-align: center;
}
</style>
