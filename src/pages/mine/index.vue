<template>
  <!--
    我的页 —— tabBar 的第三个页签，也是关于页。

    为什么这一页只有「关于」的内容：渔碌没有账号体系，也没有需要沉淀的个人数据，
    钓点和反馈都是挂在钓点上的、跨设备同步的，不属于「某个人」。
    在没有真实内容之前，把这一页做成一个正经的关于页 ——
    而不是塞一个登录按钮或空状态，那比不做更让人以为功能坏了。

    关于顶部那段内边距：页面配了 navigationStyle: "custom"，导航栏成了浮层，
    内容从屏幕最顶端开始排，状态栏和胶囊按钮都压在这一屏上。
    这里给 padding-top 让开 navBarBottom，理由与 VerdictHeader 相同。
  -->
  <view class="mine">
    <view class="mine__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <AboutHeader class="mine__enter" :style="{ animationDelay: enterDelay(0) }" />

      <view class="mine__section mine__enter" :style="{ animationDelay: enterDelay(1) }">
        <text class="mine__section-title">免责声明</text>
        <view class="mine__disclaimer">
          <view v-for="(paragraph, i) in disclaimer" :key="i" class="mine__disclaimer-item">
            <text class="mine__disclaimer-text">{{ paragraph }}</text>
          </view>
        </view>
      </view>

      <AboutLinks
        class="mine__section mine__enter"
        :docs="docs"
        :style="{ animationDelay: enterDelay(2) }"
        @select="openDoc"
      />

      <view class="mine__footer mine__enter" :style="{ animationDelay: enterDelay(3) }">
        <text class="mine__footer-line">{{ footer.credit }}</text>
        <text class="mine__footer-line">{{ footer.copyright }}</text>
      </view>
    </view>

    <!--
      文档抽屉。容器用已有的 SnapSheet，与钓点详情同一种浮层 ——
      两处抽屉共用一个容器，才谈得上「同一个手势、同一种落位」。
    -->
    <SnapSheet :open="docOpen" :snap-points="DOC_SNAP_POINTS" :initial-snap="0" @close="closeDoc">
      <template #header>
        <view class="doc__header">
          <text class="doc__title">{{ activeDoc?.key ?? '' }}</text>
          <text class="doc__subtitle">渔碌 · 关于</text>
        </view>
      </template>
      <AboutDoc v-if="activeDoc" :doc="activeDoc" />
    </SnapSheet>
  </view>
</template>

<script setup lang="ts">
/**
 * 我的页 —— 应用身份、免责声明与文档入口。
 *
 * 文案全部来自 @/constants/about，这个文件里只有排版和交互：
 * 文字要改，改那个文件，不要改这里。
 */
import { ref } from 'vue';

import AboutDoc from '@/components/AboutDoc/AboutDoc.vue';
import AboutHeader from '@/components/AboutHeader/AboutHeader.vue';
import AboutLinks from '@/components/AboutLinks/AboutLinks.vue';
import SnapSheet from '@/components/SnapSheet/SnapSheet.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { ABOUT_DOCS, APP_FOOTER, DISCLAIMER } from '@/constants/about';
import type { AboutDoc as AboutDocItem } from '@/constants/about';
import { enterDelay } from '@/utils/motion';

/** 文档两档：够读一段 / 接近满屏。三处抽屉的档位不能各定各的 */
const DOC_SNAP_POINTS = [62, 88] as const;

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

const docs = ABOUT_DOCS;
const disclaimer = DISCLAIMER;
const footer = APP_FOOTER;

/** 当前打开的文档。null 表示抽屉关着 —— 正文随之卸载，不占布局 */
const activeDoc = ref<AboutDocItem | null>(null);
const docOpen = ref(false);

function openDoc(doc: AboutDocItem) {
  activeDoc.value = doc;
  docOpen.value = true;
}

function closeDoc() {
  docOpen.value = false;
}
</script>

<style lang="scss" scoped>
/* 页面底色 = systemGroupedBackground，与 App.vue 的 page 同色，理由见数据页的同名注释 */
.mine {
  min-height: 100vh;
  background-color: $fish-grouped;
}

/* padding-top 由行内样式给（navBarBottom 是 px），这里只管左右留白和下留白 */
.mine__body {
  padding-bottom: 48rpx;
}

/*
 * 分区入场。
 *
 * 规则写在页面而不是各组件里：延迟取决于这一组里第几个分区（由模板给），
 * 组件自己不知道自己排在第几位。这条规则与数据页的 .pane__section 是同一条。
 */
.mine__enter {
  @include fish-enter;
}

/* 左右留白统一在 .mine__section 给：内容组件自己不再带内边距，
   留白是页面级的，留在组件里就等于同一个数抄了三份 */
.mine__section {
  margin-top: $fish-space-section;
  margin-right: 32rpx;
  margin-left: 32rpx;
}

/* 分区标题压到 caption：免责声明是「读过就记住」的东西，
   不该和顶部那张身份卡抢这一屏的注意力 */
.mine__section-title {
  display: block;
  margin-bottom: 16rpx;
  color: $fish-muted;
  @include fish-type(caption);
}

/* 免责段落：白卡浮在页面灰底上，靠面分层而不是描边（见 uni.scss） */
.mine__disclaimer {
  padding: 24rpx 32rpx;
  border-radius: $fish-radius-xl;
  background-color: $fish-page;
}

/* 段间距交给容器：段落之间靠这一个数断开，段落本身不再各带 margin */
.mine__disclaimer-item + .mine__disclaimer-item {
  margin-top: 20rpx;
}

/* 免责文字压成辅助灰而不是主色：它是需要被同意的条款，不是页面要传达的主张 */
.mine__disclaimer-text {
  color: $fish-muted;
  @include fish-type(footnote);
}

/*
 * 落款离列表更远（56rpx，比分区间距多一档）：
 * 它是这一屏的句号，不该紧贴着上面的条目读。
 */
.mine__footer {
  margin-top: 56rpx;
  text-align: center;
}

.mine__footer-line {
  display: block;
  color: $fish-muted-60;
  @include fish-type(caption2);

  /* 行高单独给：caption2 的 1.3 落款挤在一起，两行会读成一段 */
  line-height: 1.7;
}

/* 抽屉头部。SnapSheet 只提供容器，标题区归页面 */
.doc__header {
  padding: 0 40rpx 24rpx;
}

.doc__title {
  display: block;
  color: $fish-ink;
  @include fish-type(title2);
}

.doc__subtitle {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption);
}
</style>
