<template>
  <!--
    月历 —— 一个月的打卡视图。

    只管画格子，不自己取数：哪天有记录、哪天有渔获，由外面把状态表喂进来
    （见 props）。组件里不出现任何请求。

    两种状态用**背景色深浅**区分：偏深的那格是钓到鱼的，浅的那格是只打了卡的。
    颜色比标记点好在哪：格子是日历上唯一成片的东西，一整月的深浅分布
    一眼就扫得出来；而标记点要一个一个看。

    图片另给一枚角标 —— 「那天有照片」和「那天有渔获」是两件事，
    合成一个颜色就把它们压成一件了。
  -->
  <view class="cal">
    <!-- 月份切换 -->
    <view class="cal__head">
      <view class="cal__nav" @tap="emit('shift', -1)">
        <text class="cal__nav-icon">‹</text>
      </view>

      <text class="cal__month">{{ title }}</text>

      <view class="cal__nav" :class="{ 'cal__nav--off': !canGoNext }" @tap="emit('shift', 1)">
        <text class="cal__nav-icon">›</text>
      </view>
    </view>

    <!-- 星期 -->
    <view class="cal__week">
      <text v-for="(label, index) in weekdays" :key="index" class="cal__week-label">{{ label }}</text>
    </view>

    <!-- 格子 -->
    <view class="cal__grid">
      <view v-for="(cell, index) in cells" :key="index" class="cal__cell" :class="cellClass(cell)" @tap="onTap(cell)">
        <text class="cal__day">{{ cell.day }}</text>

        <!-- 有照片的那天右上角一枚小角标 -->
        <view v-if="cell.hasImage" class="cal__photo" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 月历组件。
 *
 * 受控组件：状态由外面给，点击把日期报上去。
 * 它不知道「记录」是什么，也不管翻月时要不要发请求 —— 那是页面的事。
 */
import { computed } from 'vue';

import { RECORD_CALENDAR } from '@/constants/record';
import type { RecordDayState } from '@/stores/fishingLog';

const props = defineProps<{
  /** 当前月份 `YYYY-MM` */
  month: string;
  /** 每天的状态 */
  dayStates: Record<string, RecordDayState>;
  /** 哪些天有照片 */
  photoDays?: string[];
  /** 今天 `YYYY-MM-DD` */
  today: string;
  /** 当前显示的月份是不是本月 —— 决定「下个月」能不能点 */
  isCurrentMonth: boolean;
}>();

const emit = defineEmits<{
  /** 选中了某一天 */
  select: [date: string];
  /** 翻月，-1 上个月 / 1 下个月 */
  shift: [delta: number];
}>();

const weekdays = RECORD_CALENDAR.weekdays;

interface CalendarCell {
  /** `YYYY-MM-DD`；补位的空格是空串 */
  date: string;
  /** 日号。补位的空格是 0 */
  day: number;
  state: RecordDayState;
  isToday: boolean;
  hasImage: boolean;
  /** 未来的日期不可点 */
  future: boolean;
}

/** 补零 */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 当月的格子。
 *
 * 从周一开始排 —— 中国的日历习惯是周一打头，周日结尾。
 * 月首那一周补空格，让 1 号落在它该在的那一列。
 */
const cells = computed<CalendarCell[]>(() => {
  const [year, mon] = props.month.split('-').map(Number);
  const first = new Date(year, mon - 1, 1);
  const daysInMonth = new Date(year, mon, 0).getDate();

  // getDay() 是 0=周日，转成 0=周一
  const offset = (first.getDay() + 6) % 7;

  const list: CalendarCell[] = [];

  for (let i = 0; i < offset; i += 1) {
    list.push({ date: '', day: 0, state: 'none', isToday: false, hasImage: false, future: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${pad(mon)}-${pad(day)}`;
    list.push({
      date,
      day,
      state: props.dayStates[date] ?? 'none',
      isToday: date === props.today,
      hasImage: (props.photoDays ?? []).includes(date),
      future: date > props.today,
    });
  }

  return list;
});

/** 「2026年10月」 */
const title = computed(() => {
  const [year, mon] = props.month.split('-').map(Number);
  return `${year}年${mon}月`;
});

/** 未来的月份不让翻 —— 记录只到今天为止，往后翻是一片空 */
const canGoNext = computed(() => props.isCurrentMonth);

function cellClass(cell: CalendarCell): Record<string, boolean> {
  return {
    'cal__cell--catch': cell.state === 'catch',
    'cal__cell--checkin': cell.state === 'checkin',
    'cal__cell--today': cell.isToday,
    'cal__cell--blank': !cell.date,
    'cal__cell--future': cell.future,
  };
}

function onTap(cell: CalendarCell): void {
  if (!cell.date) return;
  // 未来的日期点不动：只支持记录今天，翻到未来也点不出东西来
  if (cell.future) return;
  emit('select', cell.date);
}
</script>

<style lang="scss" scoped>
/*
 * 令牌层不用在这里 @use —— uni.scss 已经把 tokens 拼到每个组件前面了
 * （见 src/uni.scss 的说明）。再引一遍会把同一批令牌求值两次。
 */

/*
 * 月份切换行。
 *
 * 不用箭头图标字体（iconfont 那套在主包里是内联 SVG data-URI，
 * tabBar 图标走的是另一条路），直接用字符「‹」「›」——
 * 它们在所有系统字体里都有，且左右尖括号的形状本身就是「翻页」的语义。
 */
.cal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.cal__month {
  color: $fish-ink;
  @include fish-type(title3);

  font-weight: 600;
}

/* 翻页键。命中区 72rpx（36pt），比视觉尺寸大 */
.cal__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  margin: -12rpx;
  border-radius: $fish-radius-pill;
  @include fish-press-dim;
}

.cal__nav-icon {
  color: $fish-blue-600;
  @include fish-type(title2);
}

/* 不能翻的时候不响应 —— 变淡就够了，不需要额外的说明文字 */
.cal__nav--off {
  opacity: 0.3;
}

.cal__week {
  display: flex;
  margin-bottom: 8rpx;
}

.cal__week-label {
  flex: 1;
  color: $fish-muted-60;
  @include fish-type(caption2);

  text-align: center;
}

/*
 * 格子。
 *
 * 七列平分。不设固定宽高，用 flex:1 + 固定高 —— 屏幕窄一档，
 * 格子跟着窄，日期数字还在中间。
 */
.cal__grid {
  display: flex;
  flex-wrap: wrap;
}

.cal__cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(100% / 7);
  height: 88rpx;
  margin-bottom: 8rpx;
  border-radius: $fish-radius-lg;
  @include fish-press-dim;
}

/*
 * 补位的空格：不响应点击，也不该占一个可点的样子。
 * 留空而不是画一块 —— 画了会让人以为那天也可以点。
 */
.cal__cell--blank {
  visibility: hidden;
}

/*
 * 钓到鱼的那天：偏深的蓝底。
 *
 * 这是日历上唯一被压深的一档，所以「钓到鱼的日子」在整片浅色里一眼就跳出来。
 */
.cal__cell--catch {
  background-color: $fish-cal-catch;
}

/* 只打了卡的那天：浅灰底，比有渔获那档明显浅一档 */
.cal__cell--checkin {
  background-color: $fish-cal-checkin;
}

.cal__day {
  color: $fish-muted;
  @include fish-type(callout);
}

/* 有渔获的那天，日期用品牌蓝 —— 底是蓝底，字得比底更深一档才读得清 */
.cal__cell--catch .cal__day {
  color: $fish-blue-600;
  font-weight: 600;
}

.cal__cell--checkin .cal__day {
  color: $fish-ink;
}

/*
 * 今天：数字下面加一道短横线。
 *
 * 不用描边：描边要挑一个在三种底色上都看得见的颜色，
 * 而浅灰底、浅蓝底、无底三处的可读底色不同，没有一个颜色能同时压住三者。
 * 数字下那道线是「字的一部分」，跟着字走，底色变了它也不变。
 */
.cal__cell--today .cal__day {
  font-weight: 700;
}

.cal__cell--today::after {
  position: absolute;
  bottom: 10rpx;
  left: 50%;
  width: 24rpx;
  height: 4rpx;
  border-radius: 2rpx;
  background-color: $fish-ink;
  content: '';
  transform: translateX(-50%);
}

/*
 * 未来的日期：淡到读得出是个日期，但一眼就知道点不动。
 */
.cal__cell--future .cal__day {
  color: $fish-muted-60;
  opacity: 0.4;
}

/*
 * 照片角标。
 *
 * 右上角一枚小方块，而不是圆点 —— 圆点在 12rpx 上会糊成一团，
 * 方块的四个角还能保住形状。
 */
.cal__photo {
  position: absolute;
  top: 10rpx;
  right: 12rpx;
  width: 12rpx;
  height: 12rpx;
  border-radius: 3rpx;
  background-color: $fish-blue-600;
}
</style>
