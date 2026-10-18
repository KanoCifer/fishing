<template>
  <!--
    整个导航栏用普通 view + z-index 浮在地图之上。
    微信已支持同层渲染（map 自基础库 2.8.3 起），不再需要 cover-view，
    所以 box-shadow / transform / 渐变这些现在都能用了。
  -->
  <view class="navbar" :style="{ paddingTop: statusBarHeight + 'px', backgroundColor: background }">
    <view class="navbar__bar" :style="{ height: navBarHeight + 'px' }">
      <view v-if="showBack" class="navbar__back" @tap="onBack">‹ 返回</view>

      <!--
        右侧内边距把标题往左推半段，抵消胶囊按钮占掉的宽度，
        这样标题居中的是「胶囊左边那块可用区」，而不是整个屏幕。
      -->
      <view class="navbar__title" :style="{ paddingRight: capsuleInsetRight + 'px' }">
        {{ title }}
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNavMetrics } from '@/composables/useNavMetrics';

const props = withDefaults(
  defineProps<{
    /** 导航栏标题 */
    title?: string;
    /** 是否显示返回入口。首页这类根页面不要开 */
    showBack?: boolean;
    /** 背景色，默认半透明黑——要盖在地图上看清白字 */
    background?: string;
  }>(),
  {
    title: '',
    showBack: false,
    background: 'rgba(0, 0, 0, 0.35)',
  },
);

const emit = defineEmits<{
  (e: 'back'): void;
}>();

// 这些值来自运行时 API，单位是 px，只能以 px 绑定；
// 手写常量仍然是 rpx（manifest 里 transformPx: false，px 不会被换算）。
const nav = useNavMetrics();
const statusBarHeight = nav.statusBarHeight;
const navBarHeight = nav.navBarHeight;
const capsuleInsetRight = computed(() => nav.capsuleInsetRight);

const title = computed(() => props.title);
const showBack = computed(() => props.showBack);

function onBack() {
  // 有页面栈就退回上一页；首页栈里只有自己，退了会白屏，所以直接不发。
  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
    emit('back');
  }
}
</script>

<style lang="scss" scoped>
.navbar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  /* background-color 可以由 props 传入，默认值写在 .navbar 的内联 style 上 */
}

.navbar__bar {
  position: relative;
  display: flex;
  align-items: center;
  padding-left: 24rpx;
  /* 用一层更深的背景色区分导航区和内容区 —— 地图是原生渲染的，
     同层渲染只保证层级，box-shadow 压在地图上看不出来 */
}

.navbar__title {
  flex: 1;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
  text-align: center;
}

.navbar__back {
  color: #ffffff;
  font-size: 28rpx;
  margin-right: 12rpx;
}
</style>
