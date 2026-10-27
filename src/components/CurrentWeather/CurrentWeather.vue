<template>
  <!--
    加载中。骨架照着最终形状摆 —— 用 SkeletonCard 会跳版，
    理由见 VerdictOverview 的加载态注释。
  -->
  <view v-if="loading" class="current-weather">
    <view class="current-weather__temp-row">
      <view class="current-weather__skeleton current-weather__skeleton--temp" />
    </view>
    <view class="current-weather__skeleton current-weather__skeleton--icon" />
    <view class="current-weather__skeleton current-weather__skeleton--place" />

    <view class="current-weather__bottom">
      <view class="current-weather__skeleton current-weather__skeleton--cond" />
      <view class="current-weather__skeleton current-weather__skeleton--range" />
    </view>
  </view>

  <!-- 有数据 -->
  <view v-else-if="live" class="current-weather" :class="`current-weather--${group}`" :data-weather="group">
    <view class="current-weather__temp-row">
      <text class="current-weather__temp">{{ temp }}</text>
      <!--
        温度没有值时，度数符号一起收掉 ——
        「--°」比「--」多一个读不出来的东西，缺值就缺得干净。
      -->
      <text v-if="temp" class="current-weather__deg">°</text>
    </view>

    <!--
      天气图标：绝对定位在右上角，跟大数字分居两头。

      字体没到位时留同样大的空位。私用区的码位在系统字体里没有对应字形，
      字体没到就画 = 画出一排空心方框 —— 理由见 HourlyWeather 的注释。
    -->
    <text v-if="qweatherFontReady" class="current-weather__icon" :class="iconClass" />
    <view v-else class="current-weather__icon current-weather__icon--pending" />

    <text class="current-weather__place">{{ place }}</text>

    <view class="current-weather__bottom">
      <!--
        现象用上游给的原文。我们认不出的码，文字仍然是上游说的那句 ——
        没有配色不等于没有信息。

        上游没给文字就不画这一行 —— 与温度、高低温同一个处置：
        缺值就缺得干净，别拿一句「未知」顶上去假装知道。
      -->
      <text v-if="cond" class="current-weather__cond">{{ cond }}</text>
      <view class="current-weather__range">
        <!--
          最高/最低缺一个就少一个，连箭头一起收掉 ——
          箭头是个读数（「今天比昨天高」），没有数的时候它就是在骗人。
        -->
        <text v-if="max" class="current-weather__hi">↑ {{ max }}</text>
        <text v-if="min" class="current-weather__lo">↓ {{ min }}</text>
      </view>
    </view>
  </view>

  <!--
    出错 / 整块没数据：不画那张有读数的卡。
    一片中性灰的「未知」不是「不知道天气」，是「假装知道」。
  -->
  <view v-else class="current-weather current-weather--plain">
    <text class="current-weather__plain-text">{{ plainText }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * CurrentWeather —— 数据页「天气」分区的第一张卡：当前天气的主视觉（A 原图方案）。
 *
 * 与 `WeatherCard` 的分工：那张是**逐项读数**（体感、湿度、气压……），
 * 这张是**一句话的天气**（现在多少度、什么天、今晚多少度）。
 * 两者不是同一件事说了两遍 —— 一张是气氛，一张是清单。
 *
 * 取数在 store，换算在 utils，这里只管渲染。
 */
import { computed } from 'vue';

import { qweatherFontReady } from '@/composables/useQweatherFont';
import { useFishingMapStore } from '@/stores/fishingMap';
import { forecastDays, num, weatherGroup, weatherIconClass } from '@/utils/weather';

const mapStore = useFishingMapStore();

/** 实况。整块没有 → 不画那张有读数的卡 */
const live = computed(() => mapStore.liveWeather);

/**
 * 加载中。
 *
 * 有数据时刷新不算加载 —— 把已有的读数换成骨架，读的人会以为数据没了。
 *
 * `locating` 一起算进来：定位是取数的前置（授权询问 + 一次往返），
 * 那段时间请求还没发出去，只看 weatherLoading 会把「还没取」当成「没有」，
 * 空态就等于在加载的时候说了句假话。
 */
const loading = computed(() => (mapStore.locating || mapStore.weatherLoading) && !live.value);

/** 当前温度。有值才画 */
const temp = computed(() => {
  const raw = live.value?.temp ?? '';
  return num(raw) === null ? null : raw;
});

/**
 * 天气现象。上游给的原文。
 *
 * 缺值就不画 —— 与温度、高低温同一个处置。
 * 写死一个「未知」是假装知道：那块地方本来就没有这个信息。
 */
const cond = computed(() => live.value?.text || '');

/** 地点 */
const place = computed(() => mapStore.locationName || '钓鱼地点');

/** 外观组：天气码 → 十组之一（认不出的落通用组） */
const group = computed(() => weatherGroup(live.value?.icon));

/** 天气图标。白名单外的码统一落 999（见 utils/weather 的 weatherIconCode） */
const iconClass = computed(() => weatherIconClass(live.value?.icon));

/**
 * 今天的最高 / 最低。
 *
 * 「今天」取的是**有效预报日里的第一条**（见 utils/weather 的 forecastDays）——
 * 与 DayForecast 是同一份出处，两张卡不会对「今天」各说各话。
 *
 * 缺值就不画那一项 —— 见模板里的说明。
 */
const today = computed(() => forecastDays(mapStore.forecasts)[0] ?? null);

const max = computed(() => (today.value ? `${today.value.max}°` : null));

const min = computed(() => (today.value ? `${today.value.min}°` : null));

/**
 * 空态与出错时说同一句话的不同版本。
 *
 * 出错时不说「暂无」：取不到不是没有。
 * 具体原因已经在 toast 里报过、也在结论头那块一直摆着，
 * 这里只说清「这一块没取到」，免得让人以为整页都废了。
 */
const plainText = computed(() => (mapStore.weatherError ? '天气暂时取不到' : '暂无天气数据'));
</script>

<style lang="scss" scoped>
.current-weather {
  position: relative;
  z-index: 0;

  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /*
   * 高度给的是下限，不是定值。
   *
   * 定值配 overflow: hidden，超出的内容会被直接切掉 ——
   * 地点名多换一行、现象多两个字，那一行就被削掉半截，
   * 而页面上看不出是内容被切了，只觉得这张卡矮了一截。
   * 给下限：内容装得下就是 345rpx，装不下就长一截。
   */
  min-height: 345rpx;

  /*
   * 100% 是「跟右边那张一样高」。
   *
   * 并排的两张卡下沿要齐：外层那一行把两张卡拉一样高
   * （见令牌层 _layout 的 .sect__row），卡自己填满拉出来的高度。
   * 外层高度解不出来时它退回内容高度，min-height 兜着，两边都不会塌。
   */
  height: 100%;
  padding: 28rpx 28rpx 24rpx;
  overflow: hidden;
  border-radius: $fish-radius-mid;
  box-shadow: $smooth-shadow-sm;

  /*
   * 默认外观 = 通用外观。
   */
  --weather-grad:
    radial-gradient(circle at 0% 0%, #ffcf90, transparent 50%),
    radial-gradient(circle at 100% -50%, #ffa129, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  --weather-icon: #8e8e93;

  background: var(--weather-grad);
}

/*
 * 每组外观。
 *
 * 写在基础样式之后：两者优先级一样（同为单类选择器），后写的赢。
 */

/*
 * 面的读法（晴组定下的，其余各组照抄）：
 *
 *   左上那团光晕托着大温度 → 必须够亮，黑字才压得住；
 *   右上那团光晕托着天气图标 → 图标色要跟这团颜色分得开，
 *   否则字形埋进同一片色里，等于没画图标。
 *
 * 十组各自的颜色要能一眼认出：这张卡的面就是「现在什么天」的第一眼信号，
 * 十张都发白，它就只剩一个温度数字了。所以除晴组外各组都把两团光晕压深一档，
 * 差别落在**色相**上（云偏灰、雨偏蓝、雪偏青、尘偏土黄、冷偏紫），
 * 不靠饱和度堆 —— 堆上去十组会挤成一团彩虹，反而认不出是哪一组。
 */

/* 晴。暖橙到白，是这套卡最响的一档 */
.current-weather--sunny {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #ffcf90, transparent 50%),
    radial-gradient(circle at 100% -50%, #ffa129, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  --weather-icon: #{$fish-sun-soft};
}

/* 多云 / 阴。冷灰蓝，跟页面底色同一片 —— 但要比底色深一档，
   否则这张卡跟底下的玻璃面邻居糊在一起，分层就没了 */
.current-weather--cloudy {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #cfdfef, transparent 50%),
    radial-gradient(circle at 100% -50%, #93b0cd, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  /* 图标压深灰蓝：中性灰压在蓝晕上，两层都读不出来 */
  --weather-icon: #4a6b8c;
}

/* 夜。整块翻深，字翻白 —— 这是唯一一组要自己给 ink 的 */
.current-weather--night {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #3b4770, transparent 50%),
    radial-gradient(circle at 100% -50%, #1e2743, transparent 50%), #10151f;
  --weather-ink: #{$fish-on-dark};
  --weather-ink-2: rgba(255, 255, 255, 0.72);
  --weather-icon: #{$fish-on-dark};
}

/* 雨。蓝，跟品牌蓝同一片，但压得更深 —— 雨要压得住，
   否则跟「多云」读起来是同一片灰蓝 */
.current-weather--rain {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #a7c9e8, transparent 50%),
    radial-gradient(circle at 100% -50%, #4f86bd, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  /* 白字压在深蓝晕上：蓝晕够深，白字才浮得出来 */
  --weather-icon: #ffffff;
}

/* 雪。冷青，比雨浅、比云冷 —— 雪卡最容易糊成一张白纸，
   靠的就是这层青把「白」和「没上色」分开 */
.current-weather--snow {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #d6ecfa, transparent 50%),
    radial-gradient(circle at 100% -50%, #8fc3e8, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  /* 图标用深青，不用浅青：浅青压在青晕上等于没画 */
  --weather-icon: #0a5f9e;
}

/* 雨夹雪 / 冻雨。介于雨和雪之间，色相偏钢青 */
.current-weather--sleet {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #c9dcea, transparent 50%),
    radial-gradient(circle at 100% -50%, #7fa8c9, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  --weather-icon: #2b6288;
}

/* 尘雾。土黄 —— 跟页面上那团暖色环境撞，整屏会发闷，
   所以面压得比晴组浅一档，气色但不抢 */
.current-weather--dust {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #ecd9b4, transparent 50%),
    radial-gradient(circle at 100% -50%, #c2a06a, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  --weather-icon: #7a5a28;
}

/* 热。橙红，跟钓鱼指数的「不宜出钓」同一档 */
.current-weather--hot {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #ffb894, transparent 50%),
    radial-gradient(circle at 100% -50%, #f2613a, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  /* 白字：原来的 destructive 红压在橙红晕上，两层是一档色，字形埋了 */
  --weather-icon: #ffffff;
}

/* 冷。蓝紫 */
.current-weather--cold {
  --weather-grad:
    radial-gradient(circle at 0% 0%, #c3caea, transparent 50%),
    radial-gradient(circle at 100% -50%, #7d84c8, transparent 50%), #ffffff;
  --weather-ink: #{$fish-ink};
  --weather-ink-2: #{$fish-muted};
  /* 白字：靛蓝压在蓝紫晕上分不开 */
  --weather-icon: #ffffff;
}

/*
 * 空态 / 出错时的面。
 *
 * 玻璃面而不是渐变面 —— 这一档说的是「没有内容」，
 * 拿一张带渐变的卡装一句话，读起来像这张卡坏了。
 *
 * 高度不收：这张卡跟右边那张并排（见 _layout 的 .sect__row），
 * 只有一张塌下去，那一行就参差了。
 */
.current-weather--plain {
  align-items: center;
  justify-content: center;
  @include fish-glass;

  /*
   * 光晕层关掉。
   *
   * 玻璃是半透明白面：底下那层光晕透上来，这张卡就还是一张渐变卡，
   * 「没有内容」这一档就读不出来了。
   *
   * `background: var(--weather-grad)` 是简写，渐变落在 background-image 上；
   * 后面只写 background-color 换不掉它 —— 要显式把 background-image 摘掉。
   */
  background-image: none;
}

.current-weather__plain-text {
  color: $fish-muted;
  @include fish-type(subhead);
}

/*
 * 大温度与度数符号。
 *
 * baseline 对齐：度数符号坐在数字的基线上，再用相对定位提上去 ——
 * 跟参考图里那个「挂在右上角的小圈」是同一个位置关系。
 */
.current-weather__temp-row {
  display: flex;
  align-items: baseline;
}

/*
 * 温度。120rpx = 60pt。
 *
 * 不套字阶，理由见模板顶部那段注释（这一张卡是参考图的复刻）。
 * 字重取 400：参考图那个数字是细体，700 会把它变成另一张卡。
 *
 * 尺寸跟着卡片走：这张卡与多日预报并排，各占一半宽（171pt），
 * 100pt 的数字在这个宽度里放不下 —— 数字必须仍然是这一张卡的主角，
 * 但它得在自己的卡里站得住。
 */
.current-weather__temp {
  color: var(--weather-ink);
  font-size: 96rpx;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

/* 度数符号：挂在数字上沿 */
.current-weather__deg {
  position: relative;
  top: -0.42em;
  margin-left: 4rpx;
  color: var(--weather-ink);
  font-size: 52rpx;
  line-height: 1;
}

/*
 * 天气图标。绝对定位在右上角。
 *
 * 字形不走字阶：和风图标是字体字形，没有「字重 / 字距 / 行高」的排版语义
 * （理由见 HourlyWeather 的 .hourly__icon）。
 */
.current-weather__icon {
  position: absolute;
  top: 28rpx;
  right: 28rpx;
  color: var(--weather-icon);
  font-size: 64rpx;
  line-height: 1;
}

/* 字体没到位时的占位。尺寸对齐上面的字形盒 */
.current-weather__icon--pending {
  width: 64rpx;
  height: 64rpx;
}

/* 地点 */
.current-weather__place {
  display: block;
  margin-top: 16rpx;
  color: var(--weather-ink-2);
  font-size: 30rpx;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

/*
 * 底块：天气现象与最高/最低。
 *
 * margin-top: auto 把它压到卡底 —— 中间那一大片空白是这张卡的样子，
 * 不是没排满。
 */
.current-weather__bottom {
  margin-top: auto;
}

.current-weather__cond {
  display: block;
  color: var(--weather-ink);
  font-size: 36rpx;
  line-height: 1.2;
}

.current-weather__range {
  display: flex;
  margin-top: 8rpx;
  color: var(--weather-ink-2);
  font-size: 28rpx;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.current-weather__hi {
  margin-right: 28rpx;
}

/*
 * 加载骨架。
 *
 * 每一块的尺寸照着上面真实元素的行盒摆：温度行 96rpx、地点行 36rpx、
 * 图标 64rpx、现象行 43rpx、高低温行 34rpx。
 * 占位比真实内容高一截的话，数据到了版式一换，下面会往上跳一下 ——
 * 那一跳读起来就是「页面散架了」。
 *
 * 底色用 $fish-surface，呼吸幅度用 0.35 —— 跟 SkeletonCard、HourlyWeather、
 * VerdictOverview 同一档，否则同一个页面里两种加载态一深一浅，像两套组件。
 */
.current-weather__skeleton {
  border-radius: $fish-radius-sm;
  background-color: $fish-surface;
  animation: fish-pulse 1.8s ease-in-out infinite;
}

.current-weather__skeleton--temp {
  width: 140rpx;
  height: 96rpx;
}

.current-weather__skeleton--icon {
  position: absolute;
  top: 28rpx;
  right: 28rpx;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
}

.current-weather__skeleton--place {
  width: 140rpx;
  height: 36rpx;
  margin-top: 16rpx;
}

.current-weather__skeleton--cond {
  width: 100rpx;
  height: 43rpx;
}

.current-weather__skeleton--range {
  width: 120rpx;
  height: 34rpx;
  margin-top: 8rpx;
}
</style>
