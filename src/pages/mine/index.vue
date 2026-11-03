<template>
  <view class="mine" :style="{ minHeight: windowHeight + 'px', paddingBottom: '220rpx' }">
    <PageBackdrop />

    <!--
      头图。照片一路顶进状态栏底下：这一页配了 navigationStyle: "custom"，
      导航栏是浮在内容之上的透明层，所以照片从屏幕最顶端开始。
      状态栏那行字压在照片上 —— 顶部压了一道暗渐变（见 .mine__hero-scrim），
      白字读得清。
    -->
    <view class="mine__hero" :style="{ height: heroHeight + 'px' }">
      <image class="mine__hero-img" :src="MINE_HERO.image" mode="aspectFill" />
      <view class="mine__hero-scrim" />
      <view class="mine__fade" />

      <view class="mine__identity" :style="{ animationDelay: enterDelay(0) }">
        <UserCard :user="session.user" @choose-avatar="onChooseAvatar" />
      </view>
    </view>

    <!--
      胶囊按钮。骑在头图的下沿上：一半在照片里，一半在页面上 ——
      它是「从看这一页」到「做一件事」的那一步，骑在两者的交界上才说得通。
    -->
    <view class="mine__cta-wrap" :style="{ animationDelay: enterDelay(1) }">
      <view class="mine__cta" @tap="onCta">
        <image v-if="ctaIcon" class="mine__cta-icon" :src="ctaIcon" mode="aspectFit" />
        <text class="mine__cta-text">{{ ctaLabel }}</text>
      </view>
    </view>

    <view class="mine__cards">
      <view class="mine__card" :style="{ animationDelay: enterDelay(2) }">
        <MineRow :icon-src="spotsIcon" :label="spotsEntry.label" chevron @tap="openMySpots" />

        <MineRow inset divider :icon-src="aboutIcon" :label="aboutEntry.label" chevron @tap="openAbout" />

        <MineRow inset divider :icon-src="shareIcon" :label="share.label" chevron open-type="share" />
      </view>

      <view class="mine__card" :style="{ animationDelay: enterDelay(3) }">
        <MineRow
          :icon-src="contactIcon"
          :label="contact.label"
          chevron
          open-type="contact"
          :session-from="contact.sessionFrom"
          :send-message-title="contact.messageTitle"
          :send-message-path="contact.messagePath"
          :show-message-card="true"
        />
      </view>
    </view>

    <view v-if="session.loggedIn" class="mine__logout-wrap" :style="{ animationDelay: enterDelay(4) }">
      <view class="mine__logout" @tap="onLogout">
        <image class="mine__logout-icon" :src="logoutIcon" mode="aspectFit" />
        <text class="mine__logout-text">{{ logout.label }}</text>
      </view>
    </view>

    <!-- 落款 -->
    <text class="mine__foot">渔碌 v{{ version }}</text>

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
 * 我的页 —— tabBar 的第四个页签，也是这一页唯一的主语：**你是谁**。
 *
 * 版式：满幅头图压顶 → 身份块（头像 + 昵称 + 账号名）→ 骑在头图下沿的胶囊
 * → 两组白卡（去哪 / 找谁）→ 退出登录 → 落款。
 *
 * 为什么头图是照片而不是深色面：深色面是「应用在说话」，照片是「此刻」——
 * 这一页讲的是用户自己，底就该是渔碌的那片湖，而不是一块品牌色。
 */
import { computed, ref } from 'vue';
import { onLoad, onPageShow, onShareAppMessage } from '@dcloudio/uni-app';

import MineRow from '@/components/MineRow/MineRow.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import ProfileSheet from '@/components/ProfileSheet/ProfileSheet.vue';
import UserCard from '@/components/UserCard/UserCard.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { APP_INFO, ABOUT_ENTRY, CONTACT, SHARE_APP } from '@/constants/about';
import { MINE_CTA, MINE_HERO, MINE_LOGOUT } from '@/constants/mine';
import { SHARE_CARDS } from '@/constants/share';
import { MY_SPOTS_ENTRY } from '@/constants/my-spots';
import { icon } from '@/constants/icons';
import { loginErrorMessage } from '@/api/auth';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import { toErrorMessage } from '@/utils/error';
import { enterDelay } from '@/utils/motion';
import { enableShareMenu } from '@/utils/share';

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { statusBarHeight } = useNavMetrics();

/**
 * 头图的高度（px）。
 *
 * 照片从屏幕最顶端铺下来，包含状态栏那一段 —— 状态栏是半透明压在照片上的，
 * 所以它要算进照片区里，不能在照片外面留一条。
 */
const heroHeight = statusBarHeight + uni.upx2px(520);

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const session = useSessionStore();
const mapStore = useFishingMapStore();

const aboutEntry = ABOUT_ENTRY;
const contact = CONTACT;
const share = SHARE_APP;
const logout = MINE_LOGOUT;

/** 通往「我的钓点」的那一行 */
const spotsEntry = MY_SPOTS_ENTRY;

/** 落款上的版本号 */
const version = APP_INFO.version;

const spotsLoaded = ref(false);

/**
 * 行首图标。
 *
 * 一行一个色：蓝色是「去哪儿」，绿色是「这是什么」，两行之间才分得开。
 * 图标本身统一 20pt —— 再大就跟行字抢注意力了。
 */
const spotsIcon = icon('map-pin', 'blue');
const aboutIcon = icon('fish', 'success');
const shareIcon = icon('share-2', 'blue');
const contactIcon = icon('message-square', 'blue');

/** 退出登录那一枚 */
const logoutIcon = icon('log-out', 'destructive');

/**
 * 胶囊按钮上的字。
 *
 * 未登录是「微信登录」；登录了看资料齐不齐 —— 齐了说「编辑资料」，
 * 还缺就直说「完善资料」，别让用户以为已经改完了。
 */
const ctaLabel = computed(() => {
  if (!session.loggedIn) {
    return session.loggingIn ? MINE_CTA.loggingIn : MINE_CTA.login;
  }
  const photo = session.user?.photo;
  const hasAvatar = !!photo && photo !== 'default.png';
  const hasName = !!session.user?.name?.trim();
  return hasAvatar && hasName ? MINE_CTA.edit : MINE_CTA.complete;
});

/**
 * 胶囊上的图标。
 *
 * 只有「改资料」这一件事配了图标（铅笔）；登录是页面上唯一的入口，
 * 不配图标 —— 配了反而像另一个可以点的功能。
 */
const ctaIcon = computed(() => (session.loggedIn ? icon('pencil', 'blue') : ''));

/** 资料编辑抽屉是否打开 */
const profileOpen = ref(false);

/** 正在写昵称。用来锁住保存按钮 */
const savingNickname = ref(false);

/**
 * 胶囊按钮。未登录去登录，已登录去改资料。
 *
 * 这一层只发意图，不自己干活：登录要走接口，头像要上传，
 * 那些是页面与接口层的事。
 */
function onCta() {
  if (session.loggedIn) {
    openProfile();
    return;
  }
  onLogin();
}

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
 * 那一页自己会问 —— 这里不拦，拦了就成了「先登录才能看我的钓点」
 * 的死胡同式提示，绕一步反而更清楚。
 */
function openMySpots() {
  uni.navigateTo({ url: '/pages/my-spots/index' });
}

/**
 * 拉我提交的钓点。
 *
 * 这一页要的只是一个数量，所以取不到就当没有（silent）——
 * 不必为一个附属信息弹一个 toast 把用户打断。
 */
async function loadMySpots(): Promise<void> {
  await mapStore.fetchMySpots({ silent: true });
  spotsLoaded.value = true;
}

/**
 * 转发渔碌。
 *
 * 标题、路径、封面凑成微信聊天里那张卡片。
 *
 * 封面**显式指定**应用图标：不指定的话，微信会拿当前页面的截图当封面，
 * 而这一页的顶部是用户自己的身份面 —— 一张写着「渔碌｜查潮汐、找钓点、看天气。」
 * 的卡片上摆着分享者的头像，说不对（理由见 SHARE_APP.cover）。
 *
 * 文案在 @/constants/share（唯一出处）。
 */
onShareAppMessage(() => ({
  title: SHARE_CARDS.mine.title,
  path: SHARE_CARDS.mine.path,
  imageUrl: SHARE_CARDS.mine.cover,
}));

/**
 * 胶囊菜单里的项要显式开。
 *
 * 只开转发，不开「分享到朋友圈」—— 与钓点详情页同一套：朋友圈那一项
 * 留着只会多一个走不通的出口。
 *
 * 放在 onLoad：tab 页的 onLoad 只触发一次（页面实例一直在），
 * 而菜单项是页面级的设置，设一次就够。
 */
onLoad(() => {
  enableShareMenu();
});

/**
 * 进页面先恢复会话，再取我提交的钓点。
 *
 * 小程序冷启动时内存里没有用户，但 Storage 里还留着上一轮的 token。
 * 不恢复的话，用户看到的是「未登录」，而实际上他上一轮登录过 ——
 * 一进「我的」就退登录是最容易失去信任的一种小毛病。
 *
 * 恢复失败（token 过期且刷新也失败）就退回未登录，不留一枚必然失败的 token。
 *
 * 取钓点要等会话恢复完：token 是异步读进内存的，没读进来就发请求必然 401。
 */
onPageShow(async () => {
  await session.restore();

  if (!session.loggedIn) {
    spotsLoaded.value = false;
    return;
  }

  await loadMySpots();
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
    await loadMySpots();
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
      // 钓点是上一个账号的数据：留着的话，登出之后这一页
      // 还会显示着别人的条数。
      mapStore.clearMySpots();
      spotsLoaded.value = false;
      uni.showToast({ title: '已退出登录', icon: 'none' });
    },
  });
}
</script>

<style lang="scss" scoped>
.mine {
  background-color: $fish-grouped;
}

/*
 * 头图区。
 *
 * 照片一路顶到屏幕最上沿：这一页的导航栏是 custom 的透明层，
 * 上面那条状态栏也是半透明压在照片上的，所以照片从 0 开始，不让位。
 */
.mine__hero {
  position: relative;
  width: 100%;
  overflow: hidden;
}

/*
 * 照片。铺满头图区，裁切由 aspectFill 负责。
 *
 * 入场动的是 scale 不是淡入：淡入一张照片读作「图片加载出来了」，
 * 而这里要做的是「照片落到位」（见 fish-enter-media）。
 */
.mine__hero-img {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  @include fish-enter-media;
}

/*
 * 头图上的两道压暗。
 *
 * 上面一道给状态栏：白字压在湖面的高光上读不出来。
 * 下面一道给身份块与胶囊：名字是白字，压在亮水面上是读不出来的。
 * 不是给照片加滤镜，是给这两段文字保证一个下限对比度。
 */
.mine__hero-scrim {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-image:
    linear-gradient(180deg, rgba(9, 24, 40, 0.5) 0%, rgba(9, 24, 40, 0) 26%),
    linear-gradient(0deg, rgba(9, 24, 40, 0.58) 0%, rgba(9, 24, 40, 0) 46%);
}

.mine__fade {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 90rpx;
  background-image: linear-gradient(0deg, $fish-page-base 0%, rgba($fish-page-base, 0) 100%);
}
/*
 * 身份块。贴在头图区左下，避开右侧的钓鱼人。
 *
 * 下边距 120rpx 是给胶囊让出来的位置 —— 胶囊骑在头图的下沿，
 * 身份块不能跟它撞在一起。
 */
.mine__identity {
  position: absolute;
  right: 40rpx;
  bottom: 120rpx;
  left: 40rpx;
  @include fish-enter;
}

/*
 * 胶囊的容器。
 *
 * 上边距 -44rpx 是胶囊高度的一半：胶囊正好骑在头图的下沿上，
 * 一半在照片里，一半在页面上。
 */
.mine__cta-wrap {
  display: flex;
  justify-content: center;
  margin-top: -44rpx;
  @include fish-enter;
}

/*
 * 胶囊本体。实心白块。
 *
 * 头图上唯一的高对比实心面 —— 照片那一头全是中间调，
 * 白块在这儿是唯一能一眼看清的东西，所以它不能是半透明的。
 */
.mine__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  padding: 0 56rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-card-face;
  box-shadow: $smooth-shadow-md;
  @include fish-press(0.97);
}

.mine__cta-icon {
  width: 34rpx;
  height: 34rpx;
  margin-right: 14rpx;
}

.mine__cta-text {
  color: $fish-deep-base;
  @include fish-type(body);

  font-weight: 600;
}

/* 两组白卡。上下留白 40rpx —— 卡与卡之间 24rpx，段与段之间才分得出段 */
.mine__cards {
  margin-top: 40rpx;
}

.mine__card {
  margin: 0 32rpx;
  border-radius: $fish-radius-card;
  background-color: $fish-card-face;
  overflow: hidden;
  box-shadow: $smooth-shadow-sm;
  @include fish-enter;
}

.mine__card + .mine__card {
  margin-top: 24rpx;
}

/*
 * 组件宿主节点要占满一行。
 *
 * 自定义组件在 WXML 里就是一个标签，它的默认 display 不是 block ——
 * 宿主节点里的行是块级的，行与行之间却会多出一截行内盒子的高度。
 * 显式钉住，行与行之间才是设计好的那个间距。
 */
mine-row {
  display: block;
}

/*
 * 退出登录。
 *
 * 一颗淡红底的胶囊：破坏性操作是这一页最后一句，
 * 读到它的时候不需要再找左边。
 */
.mine__logout-wrap {
  display: flex;
  justify-content: center;
  margin-top: 56rpx;
  @include fish-enter;
}

.mine__logout {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96rpx;
  padding: 0 56rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-destructive-tint;
  @include fish-press-dim;
}

.mine__logout-icon {
  width: 34rpx;
  height: 34rpx;
  margin-right: 14rpx;
}

.mine__logout-text {
  color: $fish-destructive;
  @include fish-type(body);

  font-weight: 600;
}

/* 落款 */
.mine__foot {
  @include fish-foot;
}
</style>
