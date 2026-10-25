<template>
  <!--
    主体卡 —— 名字、距离、评分、标签、地址、描述。

    它是唯一一张从照片底下「浮出来」的卡：上移压住头图下沿，
    层级靠「压」不靠「分」。所以这一张的圆角、阴影都比别的卡重一档 ——
    它是压在照片上的东西，不是平铺在页面底上的东西。
  -->
  <view class="head">
    <view class="head__top">
      <text class="head__name">{{ spot.name }}</text>
      <text class="head__dist">{{ distance }}</text>
    </view>

    <!--
      评分行。

      放在名字之后、标签之前：名字回答「这是哪」，评分回答「值不值得去」，
      而标签（类型、收费、玩法）还在解释「这是个什么样的地方」——
      顺序跟读者心里问题的顺序一致。

      没人评分过就写「暂无评分」，不留空 —— 空着的那一行会被读成
      「这个字段没接上」，而不是「这里还没有人投票」。
    -->
    <view class="head__rating">
      <template v-if="rating.rated">
        <text class="head__rating-star">{{ ratingStar }}</text>
        <text class="head__rating-score">{{ rating.score }}</text>
        <text v-if="rating.count" class="head__rating-count">{{ rating.count }}</text>
      </template>
      <text v-else class="head__rating-empty">{{ ratingEmpty }}</text>
    </view>

    <!--
      标签行。

      每枚标签外面套一层 view：间距要落在标签自己身上（margin），
      而 WXSS 编译器不认通配选择器（`> *` 会让整份样式编译失败），
      在子组件上写类名也不可靠 —— mp-weixin 里父组件的作用域标记
      落在组件宿主节点上，落不到子组件内部的节点上。
      套一层 view 是唯一在两端都成立的做法。
    -->
    <view class="head__meta">
      <view class="head__tag">
        <Chip tone="accent">{{ kindLabel }}</Chip>
      </view>
      <view v-if="feeLabel" class="head__tag">
        <Chip>{{ feeLabel }}</Chip>
      </view>
      <view v-for="tag in spot.tags" :key="tag" class="head__tag">
        <Chip>{{ tag }}</Chip>
      </view>
    </view>

    <view v-if="spot.address" class="head__addr">
      <image class="head__pin" :src="pinIcon" mode="aspectFit" />
      <text class="head__addr-text">{{ spot.address }}</text>
    </view>

    <!--
      描述。

      限两行：这一页是「给人判断要不要去」的，一段三百字的描述会把首屏撑走，
      而首屏里真正该被看见的是「今天能不能钓」。多出来的部分收进「展开」后面。

      钳制挂在**外层盒子**上而不是文本上：文本要保持自己的自然高度，
      量出来的自然行高才准（见 measureDescription）。
    -->
    <view v-if="spot.description" class="head__desc-box" :class="{ 'head__desc-box--full': fullText }">
      <text class="head__desc">{{ spot.description }}</text>
    </view>

    <!--
      展开 / 收起。

      只在**量出来确实超了**才给：给一个按了没反应的按钮比不给更糟。
      量不出来时整段显示、不给按钮（见 measureDescription 的降级）。
    -->
    <view v-if="canExpand" class="head__more" @tap="toggleDescription">
      <text class="head__more-text">{{ expanded ? collapseLabel : expandLabel }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * SpotDetailHead —— 钓点详情页的主体卡。
 *
 * 只管渲染。文案换算（收费、评分）在 utils 里做完再传进来，
 * 组件里不出现任何「如果为空就怎么显示」的判断分支。
 */
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue';

import { icon } from '@/constants/icons';
import { SPOT_DETAIL_DESCRIPTION, SPOT_RATING } from '../../constants';
import { fishingSpotFeeLabel, fishingSpotKindLabel, type FishingSpot } from '@/types/fishing';
import { buildSpotRating } from '../../spot-rating';
import { createSelectorQuery } from '@/utils/selectorQuery';

import Chip from '@/components/Chip/Chip.vue';

const props = defineProps<{
  spot: FishingSpot;
  /** 距离展示文案（"12.1 km" / "距离未知"） */
  distance: string;
}>();

const instance = getCurrentInstance();

/** 地址前面的定位针 */
const pinIcon = icon('map-pin', 'muted');

/** 水体类型。缺这个字段时按未分类渲染（后端 omitempty 会整个省略它） */
const kindLabel = computed(() => fishingSpotKindLabel(props.spot.kind));

/** 收费。paid 时带金额 */
const feeLabel = computed(() => {
  // console.log('fee-type', props.spot.fee_type, 'amount', props.spot.fee_amount);
  const label = fishingSpotFeeLabel(props.spot.fee_type, props.spot.fee_amount);
  // console.log('feeLabel', label);
  return label;
});

/** 评分。分数与人数的换算在 utils 里做完，这里只拿来画 */
const rating = computed(() => buildSpotRating(props.spot.rating, props.spot.rating_count));

/** 星标 */
const ratingStar = SPOT_RATING.star;

/** 还没人评分时的那句话 */
const ratingEmpty = SPOT_RATING.empty;

/** 「展开」 */
const expandLabel = SPOT_DETAIL_DESCRIPTION.expand;

/** 「收起」 */
const collapseLabel = SPOT_DETAIL_DESCRIPTION.collapse;

/**
 * 描述的三个状态。
 *
 * - measuring：正在量自然高度，这时放开钳制
 * - expanded：用户点了「展开」
 * - measureFailed：量不出来，那就整段显示（见下面的降级说明）
 */
const measuring = ref(false);
const expanded = ref(false);
const measureFailed = ref(false);

/** 描述超了两行才有得展开 */
const canExpand = ref(false);

/** 整段显示：展开中、量的时候、或者量不出来的时候 */
const fullText = computed(() => expanded.value || measuring.value || measureFailed.value);

/**
 * 量一个节点的高度（px）。
 *
 * 回调可能是单个矩形也可能是数组 —— 统一按数组取（与 SnapSheet 的 rectHeight 同一口径）。
 */
function queryHeight(selector: string): Promise<number> {
  return new Promise((resolve) => {
    createSelectorQuery(instance)
      .select(selector)
      .boundingClientRect()
      .exec((res) => {
        const rect = (Array.isArray(res?.[0]) ? res?.[0][0] : res?.[0]) as { height?: number } | undefined;
        resolve(typeof rect?.height === 'number' ? rect.height : 0);
      });
  });
}

/**
 * 量一遍描述到底有没有超过两行。
 *
 * **同一个盒子量两次**：一次钳着（两行高），一次放开（自然高度）。
 * 自然高度比钳制高度大，才说明文字被切掉了。
 *
 * 为什么不用「文本节点的高度」：文本节点在钳制盒子里被裁着，
 * 各渲染层给的高度口径不一致（有的给自然高度、有的给裁剪后的），
 * 拿它跟盒子比会得出「永远不溢出」的错误结论。
 * 同一个盒子在两种状态下的高度，差值是确定的。
 *
 * 降级：量不出来就整段显示、不给「展开」——
 * 宁可多显示几行，也不能把文字切掉又没给开的路。
 */
async function measureDescription(): Promise<void> {
  if (!props.spot.description) {
    canExpand.value = false;
    return;
  }

  const clamped = await queryHeight('.head__desc-box');
  if (clamped <= 0) {
    measureFailed.value = true;
    return;
  }

  measuring.value = true;
  await nextTick();

  const full = await queryHeight('.head__desc-box');
  measuring.value = false;

  if (full <= 0) {
    measureFailed.value = true;
    return;
  }

  canExpand.value = full > clamped + 1;
}

/** 展开 / 收起 */
function toggleDescription(): void {
  expanded.value = !expanded.value;
}

onMounted(() => {
  void measureDescription();
});

// 描述换了要重量一遍：换一条钓点时组件可能复用（列表里点进不同的两条）
watch(
  () => props.spot.description,
  () => {
    expanded.value = false;
    measureFailed.value = false;
    void measureDescription();
  },
);
</script>

<style lang="scss" scoped>
/*
 * 主体卡。
 *
 * 圆角用 $fish-radius-2xl（32pt），阴影用 $smooth-shadow-lg ——
 * 比页面里别的卡都重一档，因为它是唯一一张压在照片上的卡：
 * 「浮出来」这个感觉靠的就是它比周围高出一层。
 */
.head {
  padding: 40rpx 32rpx 36rpx;
  border-radius: $fish-radius-2xl;
  background-color: $fish-page;
  box-shadow: $smooth-shadow-lg;
}

/*
 * 名字 + 距离。
 *
 * align-items: flex-start 而不是 center：距离是个药丸，高度只有名字的一半，
 * 居中对齐的话它会浮在名字中间，读起来像夹在字里。
 */
.head__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.head__name {
  flex: 1;
  min-width: 0;
  margin-right: 24rpx;
  color: $fish-ink;
  @include fish-type(title1);
}

/*
 * 距离药丸。
 *
 * 底色用 $fish-fill（tertiarySystemFill）而不是描边 —— 它是参考信息，
 * 不该跟页面里那些卡片抢眼。
 */
.head__dist {
  flex-shrink: 0;
  height: 52rpx;
  padding: 0 22rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-fill;
  color: $fish-muted;
  @include fish-type(caption);

  font-weight: 600;
  line-height: 52rpx;
  white-space: nowrap;
}

/*
 * 评分行：星标 + 分数 + 参与人数。
 *
 * 基线对齐而不是居中：星标是字形、分数是大号数字、人数是小字，
 * 居中对齐会把三样东西按各自盒子的中间摆，星标会浮在数字腰上。
 * 踩同一条基线才读得出「★ 4.5」是一个数。
 *
 * 间距用 margin 而不是 gap：老基础库不认 flex gap，
 * 声明被丢掉的话这几样东西会贴在一起（见 docs/mp-weixin-package.md）。
 */
.head__rating {
  display: flex;
  align-items: baseline;
  margin-top: 12rpx;
}

/*
 * 星标。
 *
 * 字形不是文字 —— 不套字阶，只给字号与行高（见 tokens/_type 的说明）：
 * 套上去会把行高顶到 1.25，星形底下多留一截空白，整行往下坠。
 *
 * 用 $fish-warning 而不是 $fish-warning-ink：星是信号不是正文，
 * 分数本身才是要读准的那个字（它是墨色）。
 */
.head__rating-star {
  margin-right: 10rpx;
  color: $fish-warning;
  font-size: 30rpx;
  line-height: 1;
}

/* 分数。title3 —— 比名字小一档，但比标签重：它是这一行的主角 */
.head__rating-score {
  margin-right: 10rpx;
  color: $fish-ink;
  @include fish-type(title3);

  font-variant-numeric: tabular-nums;
}

/* 参与人数。参考信息，压到 muted */
.head__rating-count {
  color: $fish-muted;
  @include fish-type(caption);
}

/* 还没人评分。不画星标 —— 空着的星比一句「暂无评分」更像出了错 */
.head__rating-empty {
  color: $fish-muted;
  @include fish-type(caption);
}

/*
 * 标签行。flex-wrap 让标签多了自动换行，而不是把卡片撑宽。
 *
 * 间距靠 margin 撑（不写 gap）—— 与 ChoiceChips 同一口径：
 * 老基础库不认 flex gap，声明被丢掉的话标签会连成一片。
 */
.head__meta {
  display: flex;
  flex-wrap: wrap;
  margin-top: 16rpx;
}

/*
 * 一枚标签的外壳。
 *
 * display: flex 而不是 block —— 标签本身是 inline-flex 的，
 * 直接放在块级容器里会多出一截行盒下沿（inline 盒与基线对齐留下的），
 * 一排标签的高度就会参差。做成 flex 容器，标签就是它的 flex item，高度是准的。
 */
.head__tag {
  display: flex;
  margin: 0 12rpx 12rpx 0;
}

/* 地址。图标是 13pt 的针，跟 13pt 的文字一个量级 */
.head__addr {
  display: flex;
  align-items: center;
  margin-top: 24rpx;
  color: $fish-muted;
  @include fish-type(footnote);
}

.head__pin {
  width: 26rpx;
  height: 26rpx;
  margin-right: 10rpx;
  flex-shrink: 0;
}

.head__addr-text {
  flex: 1;
  min-width: 0;
}

/*
 * 描述盒子。
 *
 * 钳制两行：-webkit-box + -webkit-box-orient + -webkit-line-clamp 是
 * 小程序里做多行截断的标准写法（WXSS 不认 line-clamp 这个标准属性）。
 */
.head__desc-box {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  margin-top: 24rpx;
}

/*
 * 整段显示的三种情形：用户展开了、正在量自然高度、量不出来。
 *
 * display 从 -webkit-box 换回 block，钳制就失效了 ——
 * 量自然高度与显示全文用的是同一条规则，不是两套。
 */
.head__desc-box--full {
  display: block;
  overflow: visible;
}

/* 描述 */
.head__desc {
  display: block;
  color: $fish-ink;
  @include fish-type(subhead);
}

/*
 * 「展开 / 收起」。
 *
 * 蓝色小字：它是这一段的补充动作，不该跟上面的正文抢注意力，
 * 但得让人一眼看出这里点得动。
 */
.head__more {
  display: inline-flex;
  align-items: center;
  margin-top: 8rpx;
  @include fish-press-dim;
}

.head__more-text {
  color: $fish-blue-600;
  @include fish-type(footnote);

  font-weight: 600;
}
</style>
