<template>
  <!--
    表单的一栏 —— 标签在左，值在右。

    和 FormField 是两种形态，各管各的一半：

    - FormField：控件本身有宽度（胶囊组、多行文本、照片网格），
      标签只能放到控件上面去 —— 挤在一行里两边都读不出来。
    - FormRow：值是个短东西（一个名字、一个时间、一个金额），
      标签和值并排放，一行说得完。

    两种形态在一张卡里混着走，靠的是同一个标签列宽（168rpx）。
    标签列宽定死了，值那一列的起点就是定的，
    发丝线也才能从同一个位置起 —— 不然每一行的线各起各的，整列看着是散的。

    这一栏只管怎么排。「值是什么」「点它会发生什么」由外面给。
  -->
  <view class="form-row" :class="{ 'form-row--disclosure': chevron }" @tap="onTap">
    <!--
      发丝线。
      由这一栏自己画，不靠外面用相邻选择器画 ——
      外面画的话，线要落在宿主节点上，那在 WXSS 里不够稳；
      而标签列宽是这一栏自己的事，线从哪儿起也只有它知道。
    -->
    <view v-if="divided" class="form-row__divider" />

    <view class="form-row__main">
      <view class="form-row__labelbox">
        <text class="form-row__label">{{ label }}</text>
        <text v-if="required" class="form-row__req">*</text>
      </view>

      <view class="form-row__value">
        <slot>
          <text class="form-row__text">{{ value }}</text>
        </slot>
      </view>

      <!-- 尖角：这一行点得开别的界面（选点地图）。不是尖角的那几行点它没反应 -->
      <view v-if="chevron" class="form-row__chev" />
    </view>

    <!-- 补充说明。横跨整行，不是待在值那一列里 -->
    <text v-if="sub" class="form-row__sub">{{ sub }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * FormRow —— 表单里「标签在左、值在右」的那一栏。
 *
 * 只管排版和「点这一行」这件事。值是什么由外面给：
 * 给了 `value` 就显示文字，给了插槽就显示插槽里的东西。
 *
 * `chevron` 决定这一行是不是「点得开别的界面」。是才响应点击、
 * 才画尖角 —— 尖角是「这里能点进去」的约定，
 * 画在一个点不动的行上是在骗人。
 */
const props = withDefaults(
  defineProps<{
    /** 栏名 */
    label: string;
    /** 必填。标一个星 */
    required?: boolean;
    /** 值。没有插槽时显示它 */
    value?: string;
    /** 值的补充说明。横跨整行显示在下面 */
    sub?: string;
    /** 右侧画尖角，并且这一行可以点 */
    chevron?: boolean;
    /**
     * 上面画一根发丝线。
     *
     * 只给「上一行也是标签在左」的那种行用 ——
     * 标签在上、控件在下的一行不需要线，它的标签本身就是断点。
     * 由使用方判断，不在这一层猜。
     */
    divided?: boolean;
  }>(),
  {
    required: false,
    value: '',
    sub: '',
    chevron: false,
    divided: false,
  },
);

const emit = defineEmits<{
  /** 这一行被点了。只在 chevron 为真时发 */
  tap: [];
}>();

/** 点这一行 */
function onTap() {
  if (!props.chevron) return;
  emit('tap');
}
</script>

<style lang="scss" scoped>
/*
 * 一栏。
 *
 * 内边距给在这里，不给在卡上：卡里每行的控件形态不同
 * （一行文字、一组胶囊、一块照片网格），行自己知道该留多少。
 * 卡只管把行收在一块儿。
 */
.form-row {
  position: relative; /* 发丝线要相对这一栏定位 */
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 96rpx;
  padding: 24rpx 28rpx;
}

/*
 * 发丝线。
 *
 * 起点在值那一列：这一栏左边 28rpx 内边距 + 168rpx 标签列 + 20rpx 间隙 = 216rpx。
 * 不从左边缘起 —— 线要是从左边缘起，它会横穿标签底下，
 * 看着像把标签和它自己的值切开了。
 */
.form-row__divider {
  position: absolute;
  top: 0;
  left: 216rpx;
  right: 0;
  height: 1rpx;
  background-color: $fish-border-40;
}

/* 标签和值那一行。标签列和值列之间留 20rpx，值那一列的起点就是定的 */
.form-row__main {
  display: flex;
  align-items: center;
  gap: 20rpx;
  width: 100%;
}

/*
 * 标签列。
 *
 * 宽度写死 168rpx（84pt）：标签最长的是「能否车到水边」那一类，
 * 但那几行是控件在上、标签在下，不占这一列。
 * 占这一列的都是「位置」「名称」「开放时间」这种两到四个字的，
 * 84pt 绰绰有余，而且定死了值那一列的起点。
 */
.form-row__labelbox {
  display: flex;
  align-items: baseline;
  width: 168rpx;
  flex-shrink: 0;
}

/* 标签比值弱一档：它是「这一栏叫什么」的引导，不是内容 */
.form-row__label {
  color: $fish-muted;
  @include fish-type(callout);
}

/* 必填的星。用文字专用的深红 —— 填充色的红在白底上读不出来 */
.form-row__req {
  margin-left: 8rpx;
  color: $fish-destructive-ink;
  @include fish-type(caption);
}

/* 值那一列 */
.form-row__value {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  min-width: 0;
}

/* 值。长了截断，不换行 —— 一行就是一行 */
.form-row__text {
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(body);

  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 补充说明。横跨整行 */
.form-row__sub {
  margin-top: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 尖角。
 *
 * 用边框画，不用图标 —— 图标要烤死颜色（小程序端 <image> 拿不到 currentColor），
 * 而这里要的就是「随主题变浅的那一档灰」。
 */
.form-row__chev {
  width: 14rpx;
  height: 14rpx;
  margin-left: 16rpx;
  flex-shrink: 0;
  border-right: 3rpx solid $fish-muted-60;
  border-bottom: 3rpx solid $fish-muted-60;
  transform: rotate(-45deg);
}
</style>
