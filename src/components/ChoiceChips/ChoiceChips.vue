<template>
  <!--
    可选项组 —— 表单里「从几个里挑一个（或几个）」的那一栏。

    不是分段控件：分段控件的隐含语义是「切视图」，而这里是在填表。
    选中态给一枚实心蓝胶囊，比白块更明确地表示「我选了这个」。

    单选时点一个就换；多选时点一下加进去，再点一下拿掉。
  -->
  <view class="choice-chips">
    <view
      v-for="option in options"
      :key="option.value"
      class="choice-chips__item"
      :class="{ 'choice-chips__item--active': isActive(option.value) }"
      @tap="toggle(option.value)"
    >
      <text class="choice-chips__text" :class="{ 'choice-chips__text--active': isActive(option.value) }">
        {{ option.label }}
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * ChoiceChips —— 一组可点的选项。
 *
 * 只管排版和「点哪个」，选中态由外面给（受控组件）：
 * 表单页要把所有字段的取值攒成一份载荷再提交，中间没有"就地改状态"这一步，
 * 所以这个组件不持有 selected，只在点击时把新的取值报上去。
 *
 * 组件不 import 其它组件，只认选项的 value / label 两个键。
 */
const props = withDefaults(
  defineProps<{
    /** 选项清单 */
    options: readonly { value: string; label: string }[];
    /** 当前选中的值。单选是字符串，多选是数组 */
    selected: string | string[];
    /** 多选。false（默认）时点一个就换掉原来那个 */
    multiple?: boolean;
  }>(),
  {
    multiple: false,
  },
);

const emit = defineEmits<{
  /** 选中的值变了。单选给字符串，多选给数组 */
  change: [value: string | string[]];
}>();

/** 多选时当前选中的那一组 */
function selectedList(): string[] {
  return Array.isArray(props.selected) ? props.selected : [];
}

/** 某个值在不在选中集合里 */
function isActive(value: string): boolean {
  if (props.multiple) return selectedList().includes(value);
  return props.selected === value;
}

/**
 * 点一个选项。
 *
 * 单选：直接换掉。多选：点一下加进去，再点一下拿掉 —— 拿掉时保留原有顺序，
 * 不做「移到末尾」那种重排，用户看到的顺序始终是他自己点出来的顺序。
 */
function toggle(value: string) {
  if (!props.multiple) {
    // 已经在选中的那个再点一下不动它：单选没有「取消选择」这回事，
    // 而这一栏往往都是必填的
    if (props.selected === value) return;
    emit('change', value);
    return;
  }

  const current = selectedList();
  emit('change', current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
}
</script>

<style lang="scss" scoped>
/*
 * 换行的胶囊组。
 *
 * 不铺成一行：选项数不定（钓法有六档，车到水边只有三档），
 * 铺一行要么挤要么溢出。flex-wrap 让它自己换行，最矮的一行也不会被拉平。
 */
.choice-chips {
  display: flex;
  flex-wrap: wrap;
}

/*
 * 一枚胶囊。
 *
 * 命中区 min-height 64rpx（32pt）—— 表单里一栏有三四枚，
 * 再高就一屏放不下几栏了。行高给足 88rpx 的是按钮，不是选项。
 *
 * 按下反馈用变暗而不是缩小：缩小会让同一行相邻的胶囊跟着挪一点，
 * 读起来像「整组跳了一下」。
 */
.choice-chips__item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64rpx;
  padding: 0 28rpx;
  margin: 0 16rpx 16rpx 0;
  border-radius: $fish-radius-pill;
  background-color: $fish-fill;
  @include fish-press-dim;
}

.choice-chips__item--active {
  background-color: $fish-accent;
}

.choice-chips__text {
  color: $fish-muted;
  @include fish-type(callout);
}

.choice-chips__text--active {
  color: $fish-on-accent;
  font-weight: 600;
}
</style>
