<template>
  <!--
    关于页 —— 应用身份、免责声明、协议与说明。

    这些内容原来挤在「我的」页的下半屏，和身份卡抢同一屏的注意力：
    一个页面同时回答「我是谁」和「这是什么」，两件事互相稀释。
    拆成独立页面之后，「我的」页只回答「我是谁」，这一页回答「这是什么」——
    一页一件事。

    页面骨架照抄数据页与「我的」页那一套：同样的环境色底（PageBackdrop）、
    同样的分区版式（令牌层 _layout.scss 的 fish-section / fish-eyebrow / fish-foot）、
    同样的玻璃卡。三页是同一个 app 的三面，不该像换了个应用。

    关于顶部那段内边距：页面配了 navigationStyle: "custom"，导航栏成了浮层，
    内容从屏幕最顶端开始排。给 padding-top 让开 navBarBottom，
    理由与「我的」页、数据页相同。

    导航栏是浮层（fixed），不在内容流里 —— 所以它放在 about__body 外面，
    让位只由 padding-top 算一次。曾经把导航栏放进带 padding 的内容层里，
    那道导航栏就被顶到 navBarBottom 之下，返回键整整低了一个导航栏的高度。
  -->
  <view class="about" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <!--
      导航栏。返回按钮 + 标题，标题让开右上角的胶囊。
      浮在视口上不随内容滚走：原生侧滑返回手势已经没了，
      返回键滚没了这一屏就没有出口了。内容滚到它底下时，材质层才显形。
    -->
    <PageNav title="关于渔碌" :scrolled="scrolled" />

    <view class="about__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!--
        应用身份卡：这一页的第一件东西。
        它和「我的」页的身份卡是同一个位置上的东西 —— 页面的第一屏，
        所以占位和分量也得一样。
      -->
      <view class="sect">
        <AboutHeader class="sect__card" :style="{ animationDelay: enterDelay(0) }" />
      </view>

      <!-- 免责声明 -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(1) }">免责声明</text>

        <view class="sect__card about__disclaimer" :style="{ animationDelay: enterDelay(2) }">
          <view v-for="(paragraph, i) in disclaimer" :key="i" class="about__disclaimer-item">
            <text class="about__disclaimer-text">{{ paragraph }}</text>
          </view>
        </view>
      </view>

      <!-- 协议与说明。点开是抽屉，正文在抽屉里读 -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(3) }">协议与说明</text>

        <AboutLinks class="sect__card" :links="docLinks" :style="{ animationDelay: enterDelay(4) }" @select="openDoc" />
      </view>

      <!-- 落款。数据署名在前，版权在后 -->
      <view class="about__foot about__enter" :style="{ animationDelay: enterDelay(5) }">
        <text class="about__foot-line">{{ footer.credit }}</text>
        <text class="about__foot-line">{{ footer.copyright }}</text>
      </view>
    </view>

    <!--
      文档抽屉。容器用已有的 SnapSheet，与钓点详情、钓鱼反馈同一种浮层 ——
      三处抽屉共用一个容器，才谈得上「同一个手势、同一种落位」。
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
 * 关于页 —— 应用身份、免责声明与协议文档。
 *
 * 文案全部来自 @/constants/about，这个文件里只有排版和交互：
 * 文字要改，改那个文件，不要改这里。
 */
import { ref } from 'vue';
import { onPageScroll } from '@dcloudio/uni-app';

import AboutDoc from './components/AboutDoc/AboutDoc.vue';
import AboutHeader from './components/AboutHeader/AboutHeader.vue';
import AboutLinks from '@/components/AboutLinks/AboutLinks.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import SnapSheet from '@/components/SnapSheet/SnapSheet.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { ABOUT_DOCS, APP_FOOTER, DISCLAIMER } from '@/constants/about';
import type { AboutDoc as AboutDocItem, AboutLink } from '@/constants/about';
import { enterDelay } from '@/utils/motion';

/** 文档两档：够读一段 / 接近满屏。三处抽屉的档位不能各定各的 */
const DOC_SNAP_POINTS = [62, 88] as const;

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

/**
 * 内容是否已经滚到导航栏底下。
 *
 * 导航栏是浮层，内容从它底下经过 —— 那一刻它背后就有东西了，
 * 材质层得显形把内容托住（两层浅色玻璃叠在一起，字会糊）。
 *
 * 判据留 8px 余量：刚起手那一点滚动不该把材质闪出来。
 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

const disclaimer = DISCLAIMER;
const footer = APP_FOOTER;

/** 协议列表。AboutLinks 只认「一行字 + 一个箭头」，正文不在行里 */
const docLinks = ABOUT_DOCS;

/**
 * key → 文档。
 *
 * 列表点回来时只带得出 key，正文得查回来 —— 这里建一张表，
 * 省得每次点开都在数组里 find 一遍。
 */
const docByKey = new Map(ABOUT_DOCS.map((doc) => [doc.key, doc]));

/** 当前打开的文档。null 表示抽屉关着 —— 正文随之卸载，不占布局 */
const activeDoc = ref<AboutDocItem | null>(null);
const docOpen = ref(false);

function openDoc(link: AboutLink) {
  const doc = docByKey.get(link.key);
  if (!doc) return;

  activeDoc.value = doc;
  docOpen.value = true;
}

function closeDoc() {
  docOpen.value = false;
}
</script>

<style lang="scss" scoped>
/* 页面底色 = systemGroupedBackground，与 App.vue 的 page 同色，理由见数据页的同名注释

   最小高度不写在这里，由模板绑 windowHeight（px）—— 100vh 会把 tabBar
   的高度算进来，页面就多出一截能拖出去的范围，滚到底之后脚下只剩底色。
   详见 useViewport。 */
.about {
  background-color: $fish-grouped;
}

/* 内容层。定位 + z-index 是为了压在环境色底之上 */
.about__body {
  position: relative;
  z-index: 1;
}

/*
 * 一个分区。
 *
 * 缩进、眉标、卡间距全部走令牌层 _layout.scss 的 fish-section ——
 * 与数据页、「我的」页是同一条规则，三页的分块节奏因此必然一致。
 */
.sect {
  @include fish-section;
}

/* 免责段落：玻璃卡浮在环境色上，靠面分层而不是描边（见令牌层 _color.scss 的分层说明） */
.about__disclaimer {
  padding: 28rpx;
  @include fish-glass;
}

/* 段间距交给容器：段落之间靠这一个数断开，段落本身不再各带 margin */
.about__disclaimer-item + .about__disclaimer-item {
  margin-top: 20rpx;
}

/* 免责文字压成辅助灰而不是主色：它是需要被同意的条款，不是页面要传达的主张 */
.about__disclaimer-text {
  color: $fish-muted;
  @include fish-type(footnote);
}

/* 落款 */
.about__foot {
  @include fish-foot;
}

.about__foot-line {
  display: block;

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
