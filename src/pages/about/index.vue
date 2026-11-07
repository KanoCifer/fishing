<template>
  <view class="about" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <!--
      导航栏。返回按钮 + 标题，标题让开右上角的胶囊。
      浮在视口上不随内容滚走：原生侧滑返回手势已经没了，
      返回键滚没了这一屏就没有出口了。内容滚到它底下时，材质层才显形。
    -->
    <PageNav title="关于渔碌" :scrolled="scrolled" />

    <view class="about__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!-- 身份。图标 + 名字 + 版本 + 一句话介绍，横排一行 -->
      <view class="sect">
        <view class="sect__card" :style="{ animationDelay: enterDelay(0) }">
          <AboutHeader />
        </view>
      </view>

      <!-- 免责。一行摘要，链到《用户协议》全文 -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(1) }">说明</text>

        <view class="sect__card" :style="{ animationDelay: enterDelay(2) }">
          <AboutNotice :notice="notice" @select="openDocByKey" />
        </view>
      </view>

      <!-- 协议与说明。点开是抽屉，正文在抽屉里读 -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(3) }">协议与说明</text>

        <view class="sect__card" :style="{ animationDelay: enterDelay(4) }">
          <AboutLinks :links="entries" @select="openEntry" />
        </view>
      </view>

      <!-- 落款。数据署名在前，版权在后 -->
      <view class="about__foot about__enter" :style="{ animationDelay: enterDelay(5) }">
        <text class="about__foot-line">{{ footer.credit }}</text>
        <text class="about__foot-line">{{ footer.copyright }}</text>
      </view>
    </view>

    <!--
      文档抽屉。容器用已有的 SnapSheet，与钓点分享、行程抽屉同一种浮层 ——
      几处抽屉共用一个容器，才谈得上「同一个手势、同一种落位」。
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
 * 关于页 —— 应用身份、免责摘要与协议文档。
 *
 * 文案全部来自 @/constants/about，这个文件里只有排版和交互：
 * 文字要改，改那个文件，不要改这里。
 *
 * 这一页只回答「这是什么」与「规则在哪儿」两件事。
 * 分享与联系客服在「我的」页（见 src/pages/mine/components/MineActions）——
 * 「我要把这个 App 分享出去」「我有话要说」不是这一页要答的事。
 */
import { ref } from 'vue';
import { onLoad, onPageScroll } from '@dcloudio/uni-app';

import AboutDoc from './components/AboutDoc/AboutDoc.vue';
import AboutHeader from './components/AboutHeader/AboutHeader.vue';
import AboutNotice from './components/AboutNotice/AboutNotice.vue';
import AboutLinks from '@/components/AboutLinks/AboutLinks.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import SnapSheet from '@/components/SnapSheet/SnapSheet.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { ABOUT_ENTRIES, ABOUT_NOTICE, APP_FOOTER, PRIVACY_POLICY_DOC } from '@/constants/about';
import type { AboutDoc as AboutDocItem, AboutLink, PrivacyContractEntry } from '@/constants/about';
import { enterDelay } from '@/utils/motion';
import { openPrivacyContract } from '@/utils/privacy';

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

const notice = ABOUT_NOTICE;
const footer = APP_FOOTER;

/**
 * 协议列表。AboutLinks 只认「一行字 + 一个箭头」，正文不在行里。
 *
 * 顺序与条目都在 @/constants/about 的 ABOUT_ENTRIES —— 那里还定着
 * 每一行点开发生什么（抽屉，还是微信官方的隐私协议页）。
 */
const entries = ABOUT_ENTRIES;

/**
 * key → 条目。
 *
 * 列表点回来时只带得出 key，点开什么得查回来 —— 这里建一张表，
 * 省得每次点开都在数组里 find 一遍。
 */
const entryByKey = new Map(ABOUT_ENTRIES.map((entry) => [entry.key, entry]));

/**
 * key → 本地文档。
 *
 * 协议区之外还有一篇本地文档：隐私政策全文（PRIVACY_POLICY_DOC）。
 * 它不进协议区 —— 那一行叫「隐私政策」，点开走的是微信官方那份；
 * 本地全文只在官方那份弹不出来时兜底，但它得能被查到。
 */
const docEntries = ABOUT_ENTRIES.filter((entry): entry is AboutDocItem => entry.kind === 'doc');

const docByKey = new Map<string, AboutDocItem>([
  ...docEntries.map((doc): [string, AboutDocItem] => [doc.key, doc]),
  [PRIVACY_POLICY_DOC.key, PRIVACY_POLICY_DOC],
]);

/** 当前打开的文档。null 表示抽屉关着 —— 正文随之卸载，不占布局 */
const activeDoc = ref<AboutDocItem | null>(null);
const docOpen = ref(false);

/**
 * 按 key 打开一篇本地文档。
 *
 * 说明区里的《用户协议》走这里 —— 它给的是 key，不给条目。
 */
function openDocByKey(key: string) {
  const doc = docByKey.get(key);
  if (!doc) return;

  activeDoc.value = doc;
  docOpen.value = true;
}

/**
 * 点开协议区的一行。
 *
 * 两种行，走两条路：抽屉里的文档，和微信官方的隐私协议页。
 */
function openEntry(link: AboutLink) {
  const entry = entryByKey.get(link.key);
  if (!entry) return;

  if (entry.kind === 'privacy-contract') {
    openOfficialPrivacy(entry);
    return;
  }

  activeDoc.value = entry;
  docOpen.value = true;
}

/**
 * 打开微信官方的隐私协议。
 *
 * 官方那份是微信后台「用户隐私保护指引」配的文本，平台要求用户能直达；
 * 本地那份完整条款是退路 —— 两者不是同一份文件。
 *
 * 打不开就退回本地全文：官方协议能不能弹，取决于后台配没配
 * 「用户隐私保护指引」（没配直接 fail）。这时候让用户读到本地全文，
 * 好过按下去什么都没发生。
 */
async function openOfficialPrivacy(entry: PrivacyContractEntry) {
  try {
    await openPrivacyContract();
  } catch {
    const fallback = docByKey.get(entry.fallbackKey);
    if (!fallback) return;

    activeDoc.value = fallback;
    docOpen.value = true;
  }
}

function closeDoc() {
  docOpen.value = false;
}

onLoad((options) => {
  const key = options?.doc;
  if (!key) return;

  const doc = docByKey.get(String(key));
  if (!doc) return;

  activeDoc.value = doc;
  docOpen.value = true;
});
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
  一个分区。

  缩进、眉标、卡间距全部走令牌层 _layout.scss 的 fish-section ——
  与数据页、「我的」页是同一条规则，三页的分块节奏因此必然一致。
*/
.sect {
  @include fish-section;
}

/* 落款 */
.about__foot {
  @include fish-foot;
}

/*
  落款的入场。

  落款是这一页最后落位的一件东西，不该在上面的卡片还在淡入时就先亮出来 ——
  它是页面的句号，句号先落，句子就断了。
*/
.about__enter {
  @include fish-enter;
}

.about__foot-line {
  display: block;

  /* 行高单独给：caption 的 1.35 落款挤在一起，两行会读成一段 */
  line-height: 1.7;
}

/* 抽屉头部。SnapSheet 只提供容器，标题区归页面 */
.doc__header {
  padding: 0 40rpx 24rpx;
}

.doc__title {
  display: block;
  color: $fish-ink;
  @include fish-type(title);
}

.doc__subtitle {
  display: block;
  margin-top: 4rpx;
  color: $fish-muted;
  @include fish-type(caption);
}
</style>
