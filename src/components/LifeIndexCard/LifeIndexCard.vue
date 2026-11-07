<template>
  <!--
    官方垂钓指数 —— 和风天气的生活指数里那一条「钓鱼指数」。

    为什么单独占一张卡：它是**官方**对今天能不能钓的判断，和我们自己的
    鱼口概率是两套独立来源。渔碌的鱼口概率是从九项子特征加权算出来的，
    官方指数是气象台的结论 —— 两个信号不一致时，恰恰是用户最该知道的时刻。
    把它塞进「鱼口概率构成」里当第十项，两个来源会被混成一样的东西。

    卡片自己的标题不写「钓鱼指数」：下面每条已经带了自己的名字。
  -->
  <view class="life">
    <view class="life__head">
      <text class="life__title">{{ title }}</text>
      <text class="life__meta">和风天气</text>
    </view>

    <view v-if="entries.length" class="life__list">
      <view
        v-for="(entry, i) in entries"
        :key="`${entry.name}-${entry.date}-${i}`"
        class="life__item"
        :class="{ 'life__item--divided': i > 0 }"
      >
        <text class="life__name">{{ entry.name }}</text>
        <view class="life__body">
          <text class="life__badge" :class="`life__badge--${entry.tone}`">{{ entry.category }}</text>

          <text v-if="entry.text" class="life__text">{{ entry.text }}</text>
        </view>
      </view>
    </view>

    <text v-else class="life__empty">{{ emptyText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * LifeIndexCard —— 官方生活指数（当前是官方垂钓指数）。
 *
 * 数据来自 enriched 响应的 `weather_indices`。
 * 这一项以前恒为空数组 —— 那时后端根本没往外给，模型只能自己从温度气压反推，
 * 丢掉了「官方说今天适宜垂钓」这个最强的信号。现在后端给了，就该摆出来。
 */
import { computed } from 'vue';

import { useConditionsStore } from '@/stores/conditions';
import { indexCategoryTone } from '@/utils/weather';

const conditionsStore = useConditionsStore();

/**
 * 只留有名字和档位的条目。
 *
 * 和风的生活指数接口会按 type 返回若干条（钓鱼、紫外线、感冒…），
 * 但这个 app 只关心跟垂钓直接相关的那些 —— 一张卡塞进八条穿衣洗车建议，
 * 就不是「垂钓指数」了。空壳条目（没名字也没档位）更不能占位。
 */
const entries = computed(() =>
  conditionsStore.weatherIndices
    .filter((item) => item.name && item.category)
    .map((item) => ({
      name: item.name,
      date: item.date,
      category: item.category,
      text: item.text,
      tone: indexCategoryTone(item.category),
    })),
);

/**
 * 卡片标题。
 *
 * 全是垂钓相关的条目时叫「官方垂钓指数」—— 这是这张卡存在的理由，
 * 标题要直接说出它回答什么问题。混进了别的类型就退回「官方生活指数」，
 * 别拿一个更响的标题去盖住实际内容。
 */
const title = computed(() =>
  entries.value.length && entries.value.every((entry) => entry.name.includes('钓鱼')) ? '官方垂钓指数' : '官方生活指数',
);

const emptyText = computed(() => {
  if (conditionsStore.weatherLoading) return '加载中…';
  if (conditionsStore.weatherError) return '官方指数暂时取不到，刷新可重试';
  return '暂无官方指数数据';
});
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.life {
  /* 这张卡装的是一组行：横向留白交给行自己给，
     纵向留给行自己的上下留白 —— 最后一行的那一档就是卡的下沿 */
  @include fish-list-card($fish-card-padding, 0);
}

.life__head {
  @include fish-card-head;

  /* 标题到下面那组行的距离，由行自己的上留白给（12pt）——
     标题再带一份 12pt，两份叠起来就成了 24pt，那是另起一段的距离 */
  margin-bottom: 0;
  padding: 0 $fish-list-pad-x;
}

/* 分区标题统一走 fish-card-title（见 DayForecast 同名注释） */
.life__title {
  @include fish-card-title;
}

.life__meta {
  @include fish-card-meta;
}

.life__list {
  display: flex;
  flex-direction: column;
}

.life__item {
  display: flex;
  flex-direction: column;
  @include fish-list-row;
}

/* 多条指数之间用发丝线分开，理由同 WeatherCard 的行分隔。
   线压到纸边：线是纸上的一道折痕，缩进就成表格的格线了。 */
.life__item--divided {
  border-top: 1rpx solid $fish-border-40;
}

.life__name {
  display: block;
  margin-bottom: $fish-space-label;
  color: $fish-muted;
  @include fish-type(body);
  font-weight: 500;
}

/*
 * 档位 + 建议。
 *
 * 胶囊和正文靠 20rpx 拉开：胶囊是「结论」，正文是「为什么」，
 * 挤在一起会读成同一句话。胶囊不参与基线对齐（align-items: center）——
 * 它有自己的一行高，跟正文的中线对齐更好看。
 */
.life__body {
  display: flex;
  align-items: center;
}

.life__badge {
  flex-shrink: 0;
  padding: 6rpx 20rpx;
  border-radius: $fish-radius-pill;
  @include fish-type(body);

  font-weight: 500;
}

/*
 * 徽标是「淡底 + 深字」，不是「深底 + 白字」。
 *
 * 深底白字在 12pt 上要过 4.5:1 才读得清，$fish-warning / $fish-destructive
 * 都过不了 —— 徽标字号小、字重要少，容不下那种对比度。
 * 淡底深字反过来：底色保持「这一档的颜色」这个信号，
 * 字用压深档（见令牌层 _color.scss 的 ink 档说明），两边都不牺牲。
 */
.life__badge--success {
  color: $fish-success-ink;
  background-color: $fish-tone-tint;
}

.life__badge--blue {
  color: $fish-blue-600;
  background-color: $fish-accent-tint;
}

.life__badge--warning {
  color: $fish-warning-ink;
  background-color: $fish-warning-tint;
}

.life__badge--destructive {
  color: $fish-destructive-ink;
  background-color: $fish-destructive-tint;
}

.life__badge--muted {
  color: $fish-muted;
  background-color: $fish-surface;
}

.life__text {
  margin-left: 20rpx;
  color: $fish-ink;
  @include fish-type(body);
}

.life__empty {
  display: block;
  padding: 48rpx 0;
  color: $fish-muted-60;
  @include fish-type(body);

  text-align: center;
}
</style>
