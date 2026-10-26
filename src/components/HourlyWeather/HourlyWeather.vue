<template>
  <view class="hourly">
    <view class="hourly__header">
      <text class="hourly__title">逐时预报</text>
      <text class="hourly__meta">未来 24 小时</text>
    </view>

    <scroll-view class="hourly__scroll" scroll-x :show-scrollbar="false">
      <view v-if="hours.length" class="hourly__track">
        <view
          v-for="(hour, i) in hours"
          :key="hour.fxTime"
          class="hourly__cell"
          :class="{ 'hourly__cell--first': i === 0 }"
        >
          <!--
            时刻就是时刻，不写「现在」。

            这份逐时序列的第一条是上游的**下一个整点**（13:15 取数时首条是 14:00），
            它覆盖的是「接下来那一小时」，不是「此刻」。
            把它标成「现在」，等于把一小时后的天气说成现在的天气 ——
            钓鱼的人据此决定几点收竿的话，这个标签是会害人的。
            当前的实况由结论头那一块负责（它读的是 current 块，不是逐时）。
          -->
          <text class="hourly__time">{{ parseFxTime(hour.fxTime)?.time ?? '' }}</text>
          <!--
            字体没到位时留一个同样大的空位。

            私用区的码位在系统字体里没有对应字形，字体没到就画 = 画出一排空心方框。
            而这里留空位是有讲究的：图标在竖排里独占一行，字形晚到时
            整排的温度会整体往下跳一格 —— 排好的东西不该因为字体的网络往返而散架。
          -->
          <text v-if="qweatherFontReady" :class="['hourly__icon', weatherIconClass(hour.icon)]" />
          <view v-else class="hourly__icon hourly__icon--pending" />
          <text class="hourly__temp">{{ hour.temp }}°</text>

          <!--
            降水概率：一根水色的短条，长度就是概率。

            轨道恒在、只有填充在变 —— 容器不设底色，所以概率为 0 时看不见东西，
            但那一格的高度不会塌，整排的温度仍在同一条基线上。
          -->
          <view class="hourly__prob">
            <view v-if="hour.prob > 0" class="hourly__prob-fill" :style="`width:${hour.prob}%`" />
          </view>
        </view>
      </view>

      <!-- 空态骨架 -->
      <view v-else class="hourly__track">
        <view v-for="i in 8" :key="i" class="hourly__cell">
          <view class="hourly__skeleton hourly__skeleton--time" />
          <view class="hourly__skeleton hourly__skeleton--icon" />
          <view class="hourly__skeleton hourly__skeleton--temp" />
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
/**
 * 逐时预报 —— iOS Weather 招牌的横向滚动条，对应源项目 HourlyWeather。
 *
 * 小程序端必须用 `<scroll-view>` 而不是 CSS overflow-x：
 * 横向滚动的惯性、边界回弹都是原生组件给的，用 view + overflow 模拟不出来。
 */
import { computed } from 'vue';

import { qweatherFontReady } from '@/composables/useQweatherFont';
import { useFishingMapStore } from '@/stores/fishingMap';
import { parseFxTime } from '@/utils/date';
import { num, weatherIconClass } from '@/utils/weather';

const mapStore = useFishingMapStore();

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
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.hourly {
  @include fish-card;
}

.hourly__header {
  @include fish-card-head;
}

.hourly__title {
  @include fish-card-title;
}

.hourly__meta {
  @include fish-card-meta(caption, $fish-muted);
}

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
 * 图标字形不走字阶。
 *
 * 和风图标是字体字形，没有「字重 / 字距 / 行高」的排版语义 ——
 * 套 fish-type 会把行高顶到 1.25，在字形下面多留一截空白，
 * 整排格子跟着往下坠。字形只认 font-size 和 line-height: 1。
 */
.hourly__icon {
  margin: 12rpx 0;
  font-size: 40rpx;
  line-height: 1;
  /* 单色字形吃 color（emoji 不吃），压成辅助灰让同格的温度数值保持主次 */
  color: $fish-muted;
}

/* 字体没到位时的占位。尺寸对齐上面的字形盒，别让整排温度往下跳 */
.hourly__icon--pending {
  width: 40rpx;
  height: 40rpx;
}

.hourly__temp {
  color: $fish-ink;
  @include fish-type(subhead);

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
  width: 40rpx;
  height: 40rpx;
  margin: 12rpx 0;
  border-radius: 50%;
}

.hourly__skeleton--temp {
  width: 48rpx;
  height: 14rpx;
}
</style>
