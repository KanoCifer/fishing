<template>
  <!--
    官方垂钓指数 —— 和风天气的生活指数里那一条「钓鱼指数」。

    为什么单独占一张卡：它是**官方**对今天能不能钓的判断，和我们自己的
    钓鱼指数是两套独立来源。渔碌的指数是从九项子特征加权算出来的，
    官方指数是气象台的结论 —— 两个信号不一致时，恰恰是用户最该知道的时刻。
    把它塞进「指数构成」里当第十项，两个来源会被混成一样的东西。

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
          <!--
            档位做成胶囊色块，而不是把「不宜」写成大红字。

            理由是它同时也是**状态**：胶囊的形状本身就在说「这是一档结论」，
            而一段正文里的红字只会被当成强调。颜色是「不宜」的主信号，
            形状和留白把它抬到和正文分开的一层。
          -->
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
 * LifeIndexCard —— 官方生活指数（当前是钓鱼指数）。
 *
 * 数据来自 enriched 响应的 `weather_indices`。
 * 这一项以前恒为空数组 —— 那时后端根本没往外给，模型只能自己从温度气压反推，
 * 丢掉了「官方说今天适宜垂钓」这个最强的信号。现在后端给了，就该摆出来。
 */
import { computed } from 'vue';

import { useFishingMapStore } from '@/stores/fishingMap';
import { indexCategoryTone } from '@/utils/weather';

const mapStore = useFishingMapStore();

/**
 * 只留有名字和档位的条目。
 *
 * 和风的生活指数接口会按 type 返回若干条（钓鱼、紫外线、感冒…），
 * 但这个 app 只关心跟垂钓直接相关的那些 —— 一张卡塞进八条穿衣洗车建议，
 * 就不是「垂钓指数」了。空壳条目（没名字也没档位）更不能占位。
 */
const entries = computed(() =>
  mapStore.weatherIndices
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

const emptyText = computed(() => (mapStore.weatherLoading ? '加载中…' : '暂无官方指数'));
</script>

<style lang="scss" scoped>
/*
 * 卡片外壳。
 *
 * 分层靠面 + 阴影，区块之间隔多远交给页面（见 pages/data 的 .sect）。
 */
.life {
  @include fish-card;
}

.life__head {
  @include fish-card-head;
}

/* 分区标题统一走 headline 一级（见 WeekStrip 同名注释） */
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
  padding: 8rpx 0;
}

/* 多条指数之间用发丝线分开，理由同 WeatherCard 的行分隔 */
.life__item--divided {
  margin-top: 20rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid $fish-border-40;
}

.life__name {
  color: $fish-muted;
  @include fish-type(subhead);
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
  margin-top: 14rpx;
}

.life__badge {
  flex-shrink: 0;
  padding: 6rpx 20rpx;
  border-radius: $fish-radius-pill;
  @include fish-type(subhead);

  font-weight: 600;
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
  background-color: rgba(52, 199, 89, 0.16);
}

.life__badge--blue {
  color: $fish-blue-600;
  background-color: rgba(0, 122, 255, 0.14);
}

.life__badge--warning {
  color: $fish-warning-ink;
  background-color: rgba(255, 149, 0, 0.16);
}

.life__badge--destructive {
  color: $fish-destructive-ink;
  background-color: rgba(255, 59, 48, 0.14);
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
  @include fish-type(subhead);

  text-align: center;
}
</style>
