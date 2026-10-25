<template>
  <!--
    我的页 —— tabBar 的第三个页签。

    这一页回答两件事：**我是谁**，以及**我要往哪儿走、我要做什么**。
    「这是什么」搬去了关于页（见 pages/about）：一个页面同时讲身份和讲应用，
    两件事互相稀释，拆开各答各的更清楚。

    底下三段是这一页的目录：钓点、关于、更多。
    前两段是**入口**（通往别的页面），第三段是**动作**（转发与客服会话）。
    动作和入口分开放 —— 用户点下去之前就知道会发生什么，
    不会以为「联系客服」点进去又是一页文档。

    这一页与数据页、关于页共用一套页面骨架（见令牌层 _layout.scss 的 fish-section /
    fish-eyebrow / fish-foot 与 PageBackdrop）：同样的环境色底、同样的玻璃卡、
    同样的分区眉标与间距。三页是同一个 app 的三面，切页签时不该像换了个应用。

    关于顶部那段内边距：页面配了 navigationStyle: "custom"，导航栏成了浮层，
    内容从屏幕最顶端开始排，状态栏和胶囊按钮都压在这一屏上。
    这里给 padding-top 让开 navBarBottom，理由与 VerdictOverview 相同。
  -->
  <view class="mine" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <view class="mine__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!--
        身份卡：这一页的第一件东西。
        它是全页唯一解释「我是谁」的地方，所以做成卡片而不是列表里的一条 ——
        和数据页的仪表卡同级，撑起第一屏。
      -->
      <view class="sect sect--hero mine__enter" :style="{ animationDelay: enterDelay(0) }">
        <UserCard
          :user="session.user"
          :busy="session.loggingIn || session.uploading"
          @login="onLogin"
          @edit="openProfile"
          @logout="onLogout"
          @choose-avatar="onChooseAvatar"
        />
      </view>

      <!--
        钓点：通往「我的钓点」的那一行。
        单独一段而不是塞进下面那段里 —— 下面那段的眉标是「关于」，
        把钓点混进去，读者会以为它在讲应用本身。
      -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(1) }">{{ spotsEntry.section }}</text>

        <view class="sect__card" :style="{ animationDelay: enterDelay(2) }">
          <AboutLinks :links="spotsLinks" @select="openMySpots" />
        </view>
      </view>

      <!--
        关于：内容搬去了独立页面，这里只留一个入口。
        关于页答「这是什么」，这一页不答 —— 想读的人自己点进去。
      -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(3) }">{{ aboutEntry.section }}</text>

        <view class="sect__card" :style="{ animationDelay: enterDelay(4) }">
          <AboutLinks :links="aboutLinks" @select="openAbout" />
        </view>
      </view>

      <!--
        更多：分享渔碌给朋友、联系客服。

        这两行是**动作**，不是通往别处的入口 —— 它们自己就是终点。
        单独一段而不是塞进上面那段里：上面那两段点进去都是「另一页」，
        混进来用户会以为这两行也是，点下去却是微信自己的面板，反差很大。
      -->
      <view class="sect">
        <text class="sect__title" :style="{ animationDelay: enterDelay(5) }">{{ moreEntry.section }}</text>

        <view class="sect__card" :style="{ animationDelay: enterDelay(6) }">
          <MineActions />
        </view>
      </view>
    </view>

    <!--
      资料编辑抽屉。容器用已有的 SnapSheet，与钓点详情、钓鱼反馈同一种浮层 ——
      三处抽屉共用一个容器，才谈得上「同一个手势、同一种落位」。
    -->
    <ProfileSheet
      :open="profileOpen"
      :user="session.user"
      :saving="savingNickname"
      :uploading="session.uploading"
      @close="closeProfile"
      @choose-avatar="onChooseAvatar"
      @save="onSaveNickname"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 我的页 —— 账号身份、通往别处的入口，以及两个常用动作（分享、联系客服）。
 *
 * 文案全部来自 @/constants/about，这个文件里只有排版和交互：
 * 文字要改，改那个文件，不要改这里。
 *
 * 账号相关的动作（登录、传头像、写昵称）都交给 @/stores/session，
 * 这一层只负责把用户的意图翻译成对 store 的调用，并把结果讲给用户听。
 */
import { ref } from 'vue';
import { onLoad, onPageShow, onShareAppMessage } from '@dcloudio/uni-app';

import MineActions from './components/MineActions/MineActions.vue';
import AboutLinks from '@/components/AboutLinks/AboutLinks.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import ProfileSheet from '@/components/ProfileSheet/ProfileSheet.vue';
import UserCard from '@/components/UserCard/UserCard.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { ABOUT_ENTRY, MORE_ENTRY, SHARE_APP } from '@/constants/about';
import type { AboutLink } from '@/constants/about';
import { MY_SPOTS_ENTRY } from '@/constants/my-spots';
import { loginErrorMessage } from '@/api/auth';
import { useSessionStore } from '@/stores/session';
import { toErrorMessage } from '@/utils/error';
import { enterDelay } from '@/utils/motion';

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const session = useSessionStore();

const aboutEntry = ABOUT_ENTRY;

/** 通往关于页的那一行。AboutLinks 只管排版，点开了什么由页面决定 */
const aboutLinks: readonly AboutLink[] = [{ key: aboutEntry.label }];

/** 「更多」那一段的眉标。那两行自己的文案在 MineActions 里面（各自是常量） */
const moreEntry = MORE_ENTRY;

/** 通往「我的钓点」的那一行 */
const spotsEntry = MY_SPOTS_ENTRY;
const spotsLinks: readonly AboutLink[] = [{ key: spotsEntry.label }];

/** 资料编辑抽屉是否打开 */
const profileOpen = ref(false);

/** 正在写昵称。用来锁住保存按钮 */
const savingNickname = ref(false);

function openProfile() {
  profileOpen.value = true;
}

function closeProfile() {
  profileOpen.value = false;
}

/**
 * 去关于页。
 *
 * 关于页是子页不是 tab 页，所以走 navigateTo 而不是 switchTab。
 */
function openAbout() {
  uni.navigateTo({ url: '/pages/about/index' });
}

/**
 * 去「我的钓点」页。
 *
 * 那一页要登录才看得到东西（数据全在服务端），所以点进去时若还没登录，
 * 那一页自己会问 —— 这里不拦，拦了就成了「先登录才能看我的钓点」的
 * 死胡同式提示，绕一步反而更清楚。
 */
function openMySpots() {
  uni.navigateTo({ url: '/pages/my-spots/index' });
}

/**
 * 转发渔碌。
 *
 * 标题、路径、封面凑成微信聊天里那张卡片。
 *
 * 封面**显式指定**应用图标：不指定的话，微信会拿当前页面的截图当封面，
 * 而这一页的顶部是用户自己的身份卡 —— 一张写着「渔碌｜查潮汐、找钓点、看天气。」
 * 的卡片上摆着分享者的头像，说不对（理由见 SHARE_APP.cover）。
 */
onShareAppMessage(() => ({
  title: SHARE_APP.title,
  path: SHARE_APP.path,
  imageUrl: SHARE_APP.cover,
}));

/**
 * 胶囊菜单里的项要显式开。
 *
 * 只开转发，不开「分享到朋友圈」—— 与钓点详情页同一套：
 * 朋友圈那一项留着只会多一个走不通的出口。
 */
onLoad(() => {
  uni.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage'],
  });
});

/**
 * 进页面先恢复会话。
 *
 * 小程序冷启动时内存里没有用户，但 Storage 里还留着上一轮的 token。
 * 不恢复的话，用户看到的是「未登录」，而实际上他上一轮登录过 ——
 * 一进「我的」就退登录是最容易失去信任的一种小毛病。
 *
 * 恢复失败（token 过期且刷新也失败）就退回未登录，不留一枚必然失败的 token。
 */
onPageShow(() => {
  void session.restore();
});

/**
 * 微信登录。
 *
 * 服务端在这次登录里自动建号，前端不需要先注册，所以这里没有「注册」分支。
 */
async function onLogin() {
  try {
    await session.login();
    uni.showToast({ title: '登录成功', icon: 'success' });
  } catch (err) {
    uni.showToast({ title: loginErrorMessage(err), icon: 'none' });
  }
}

/**
 * 上传新头像。
 *
 * 头像一选到就传，不等用户点保存：chooseAvatar 给的是临时地址，
 * 1–5 分钟就失效，攒着必定传不上去。
 *
 * 上传端点需要鉴权，所以这一步只能在登录之后发生 —— 未登录时不会有这个事件。
 */
async function onChooseAvatar(tempPath: string) {
  try {
    await session.uploadAvatar(tempPath);
    uni.showToast({ title: '头像已更新', icon: 'success' });
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '头像上传失败，可稍后重试'), icon: 'none' });
  }
}

/**
 * 保存昵称。
 *
 * 服务端目前没有独立的改昵称接口，昵称只能在登录请求里带过去，
 * 且仅在账号昵称为空时才写入（见 store 的 saveNickname）。
 * 已有昵称时 store 会拦下来，这里只负责把那句话讲给用户听。
 */
async function onSaveNickname(nickname: string) {
  if (savingNickname.value) return;

  savingNickname.value = true;
  try {
    await session.saveNickname(nickname);
    closeProfile();
    uni.showToast({ title: '昵称已保存', icon: 'success' });
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '保存失败，请重试'), icon: 'none' });
  } finally {
    savingNickname.value = false;
  }
}

/**
 * 退出登录。
 *
 * 退出会作废这一台设备的会话，属于不可逆操作，所以先确认一次。
 * iOS 上退出登录是有确认弹窗的，不是随手一点就掉。
 */
function onLogout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后本机不再保留登录状态，重新登录后才能同步你的钓点与反馈。',
    confirmText: '退出',
    confirmColor: '#ff3b30',
    success: async (res) => {
      if (!res.confirm) return;
      await session.logout();
      uni.showToast({ title: '已退出登录', icon: 'none' });
    },
  });
}
</script>

<style lang="scss" scoped>
/* 页面底色 = systemGroupedBackground，与 App.vue 的 page 同色，理由见数据页的同名注释

   最小高度不写在这里，由模板绑 windowHeight（px）—— 100vh 会把 tabBar
   的高度算进来，页面就多出一截能拖出去的范围，滚到底之后脚下只剩底色。
   详见 useViewport。 */
.mine {
  background-color: $fish-grouped;
}

/* 内容层。定位 + z-index 是为了压在环境色底之上 */
.mine__body {
  position: relative;
  z-index: 1;
}

/*
 * 一个分区。
 *
 * 缩进、眉标、卡间距全部走令牌层 _layout.scss 的 fish-section ——
 * 与数据页是同一条规则，两页的分块节奏因此必然一致。
 */
.sect {
  @include fish-section;
}

/*
 * 身份卡所在的分区不带上边距。
 *
 * 它是这一屏的第一件东西，紧贴在导航栏下面 —— 和数据页的结论头一样，
 * 页面顶部不留一段没有内容的白。
 */
.sect--hero {
  margin-top: 0;
}

/*
 * 落位。
 *
 * 延迟按**阅读顺序**给：从身份卡到最后一段入口依次落位，
 * 眼睛跟着往下走一遍。数据页一屏只装得下一部分，分区内的标题和卡片
 * 各自按序给延迟即可 —— 那是同一条原则的两种排法。
 */
.mine__enter {
  @include fish-enter;
}
</style>
