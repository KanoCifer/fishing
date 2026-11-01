<template>
  <view class="mine" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <view class="mine__body">
      <view class="mine__anchor mine__enter" :style="{ animationDelay: enterDelay(0) }">
        <UserCard
          :user="session.user"
          :busy="session.loggingIn || session.uploading"
          :spots-count="spotsCount"
          :spots-pending="spotsPending"
          :top-inset="anchorTop"
          @login="onLogin"
          @edit="openProfile"
          @choose-avatar="onChooseAvatar"
        />
      </view>

      <view class="mine__sheet mine__enter" :style="{ animationDelay: enterDelay(1) }">
        <MineRow :icon-src="spotsIcon" :label="spotsEntry.label" chevron @tap="openMySpots" />

        <MineRow divider :icon-src="aboutIcon" :label="aboutEntry.label" chevron @tap="openAbout" />

        <MineActions />

        <text v-if="session.loggedIn" class="mine__logout" @tap="onLogout">退出登录</text>

        <!-- 落款 -->
        <text class="mine__foot">渔碌 v{{ version }}</text>
      </view>
    </view>

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
import { computed, ref } from 'vue';
import { onLoad, onPageShow, onShareAppMessage } from '@dcloudio/uni-app';

import MineActions from './components/MineActions/MineActions.vue';
import MineRow from '@/components/MineRow/MineRow.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import ProfileSheet from '@/components/ProfileSheet/ProfileSheet.vue';
import UserCard from '@/components/UserCard/UserCard.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { APP_INFO, ABOUT_ENTRY } from '@/constants/about';
import { SHARE_CARDS } from '@/constants/share';
import { MY_SPOTS_COUNT, MY_SPOTS_ENTRY, MY_SPOTS_PENDING } from '@/constants/my-spots';
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
 * 身份锚面的上内边距（px）。
 *
 * 状态栏的高度 + 一段留白。状态栏在深色面上是白字，压在深底上才读得清。
 */
const anchorTop = statusBarHeight + 16;

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const session = useSessionStore();
const mapStore = useFishingMapStore();

const aboutEntry = ABOUT_ENTRY;

/** 通往「我的钓点」的那一行 */
const spotsEntry = MY_SPOTS_ENTRY;

/** 落款上的版本号 */
const version = APP_INFO.version;

const spotsLoaded = ref(false);

/**
 * 我提交的钓点总数。
 *
 * 数的是我提交过的，含还在审核与被驳回的 —— 这一页要回答的是
 * 「我手上有几条」，不是「地图上公开着几条」。
 */
const spotsCount = computed(() => {
  if (!spotsLoaded.value || mapStore.mySpotsError) return '';
  return MY_SPOTS_COUNT(mapStore.mySpots.length);
});

/**
 * 还在等审核的条数。
 *
 * 只数 pending：被驳回的那些要改完再交，那是另一件事。
 * 没有待审的就不出徽标 —— 一枚永远为空的徽标只是噪声。
 */
const spotsPending = computed(() => {
  if (!spotsLoaded.value || mapStore.mySpotsError) return '';
  const pending = mapStore.mySpots.filter((spot) => spot.status === 'pending').length;
  return pending > 0 ? MY_SPOTS_PENDING(pending) : '';
});

/** 行首图标。统一蓝色 —— 一行里图标与文字不同色，就有了两个焦点 */
const spotsIcon = icon('map-pin', 'blue');
const aboutIcon = icon('info', 'blue');

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
 * 而这一页的顶部是用户自己的身份锚面 —— 一张写着「渔碌｜查潮汐、找钓点、看天气。」
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

/* 内容层。定位 + z-index 是为了压在环境色底之上 */
.mine__body {
  position: relative;
  min-height: 100vh;
  z-index: 1;
}

.mine__anchor {
  display: block;
}

.mine__sheet {
  margin-top: -60rpx;
  padding-bottom: 48rpx;
  min-height: 60vh;
  @include fish-sheet;
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
 * 居中：破坏性操作是这一页最后一句，读到它的时候不需要再找左边。
 */
.mine__logout {
  display: block;
  margin-top: 52rpx;
  color: $fish-destructive;
  text-align: center;
  @include fish-type(body);
  @include fish-press-dim;
}

/* 落款 */
.mine__foot {
  display: block;
  margin-top: 36rpx;
  color: $fish-muted-60;
  text-align: center;
  @include fish-type(caption);
}

/*
 * 落位。
 *
 * 延迟按**阅读顺序**给：先是身份面，再是白纸 —— 眼睛跟着往下走一遍。
 */
.mine__enter {
  @include fish-enter;
}
</style>
