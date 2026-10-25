<template>
  <!--
    我的页 —— tabBar 的第三个页签。

    这一页回答两件事：**我是谁**，以及**我要往哪儿走、我要做什么**。
    「这是什么」搬去了关于页（见 pages/about）：一个页面同时讲身份和讲应用，
    两件事互相稀释，拆开各答各的更清楚。

    底下是两组列表：
    - **入口组**：我的钓点、关于渔碌。两行都通向别处（都带展开箭头）。
    - **动作组**：分享渔碌给朋友、联系客服。点下去发生的事就在微信那边，
      不领人去看新的一页（见 MineActions）。

    入口与动作分开放 —— 用户点下去之前就知道会发生什么，
    不会以为「联系客服」点进去又是一页文档。

    ⚠️ 为什么这一版没有分区眉标：
    原来三段各配一个眉标，其中两段各只有**一行**。给一行配一个章节标题，
    是纯粹的版式浪费 —— 标题比它下面那一行还重，读者要停下来想
    「这一段叫什么」。现在两组按**行为**分，不按主题分：
    带箭头的与不带箭头的，读者扫一眼就知道哪一行点进去是另一页。

    这一页与数据页、关于页共用一套页面骨架（见令牌层 _layout.scss 的 fish-section
    与 PageBackdrop）：同样的环境色底、同样的玻璃卡、同样的分区间距。
    三页是同一个 app 的三面，切页签时不该像换了个应用。

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
          @choose-avatar="onChooseAvatar"
        />
      </view>

      <!--
        入口组：两行都通向别处。
        「我的钓点」那一行带着真实数量 —— 那一页要回答的不只是「我是谁」，
        还有「我有什么」。
      -->
      <view class="sect">
        <view class="sect__card mine__group" :style="{ animationDelay: enterDelay(1) }">
          <MineRow
            :icon-src="spotsIcon"
            :label="spotsEntry.label"
            :value="spotsCount"
            :badge="spotsPending"
            chevron
            @tap="openMySpots"
          />

          <MineRow divider :icon-src="aboutIcon" :label="aboutEntry.label" chevron @tap="openAbout" />
        </view>
      </view>

      <!--
        更多：分享渔碌给朋友、联系客服。

        这两行是**动作**，不是通往别处的入口 —— 它们自己就是终点。
        单独一组而不是塞进上面那组：上面那组点进去都是「另一页」，
        混进来用户会以为这两行也是，点下去却是微信自己的面板，反差很大。
      -->
      <view class="sect">
        <view class="sect__card" :style="{ animationDelay: enterDelay(2) }">
          <MineActions />
        </view>
      </view>

      <!--
        退出登录。

        破坏性操作独居一格：不跟别的行挤在一张卡里，也不跟常规操作并排 ——
        原来它跟「编辑资料」是两个同权并排的按钮，放在全页最显眼的位置。
        退出是不可逆的，该被看见，但不该被当成一个普通入口。
      -->
      <view v-if="session.loggedIn" class="sect">
        <text class="mine__logout mine__enter" :style="{ animationDelay: enterDelay(3) }" @tap="onLogout">
          退出登录
        </text>
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
 * 文案全部来自 @/constants/about 与 @/constants/my-spots，
 * 这个文件里只有排版和交互：文字要改，改那两个文件，不要改这里。
 *
 * 账号相关的动作（登录、传头像、写昵称）都交给 @/stores/session，
 * 我提交过的钓点交给 @/stores/fishingMap，
 * 这一层只负责把用户的意图翻译成对 store 的调用，并把结果讲给用户听。
 */
import { computed, ref } from 'vue';
import { onLoad, onPageShow, onShareAppMessage } from '@dcloudio/uni-app';

import MineActions from './components/MineActions/MineActions.vue';
import MineRow from '@/components/MineRow/MineRow.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import ProfileSheet from '@/components/ProfileSheet/ProfileSheet.vue';
import UserCard from '@/components/UserCard/UserCard.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { ABOUT_ENTRY, SHARE_APP } from '@/constants/about';
import { MY_SPOTS_COUNT, MY_SPOTS_ENTRY, MY_SPOTS_PENDING } from '@/constants/my-spots';
import { icon } from '@/constants/icons';
import { loginErrorMessage } from '@/api/auth';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import { toErrorMessage } from '@/utils/error';
import { enterDelay } from '@/utils/motion';

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const session = useSessionStore();
const mapStore = useFishingMapStore();

const aboutEntry = ABOUT_ENTRY;

/** 通往「我的钓点」的那一行 */
const spotsEntry = MY_SPOTS_ENTRY;

/**
 * 钓点数量取到过没有。
 *
 * 没取到过就不显示数字：显示「0 条」跟「真的没提交过钓点」分不清，
 * 而这一页不该替用户下「你没有钓点」这个结论 —— 取不到就当没数，
 * 点进去那一页会给出真正的答案。
 */
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
 * 缩进、卡间距全部走令牌层 _layout.scss 的 fish-section ——
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
 * 入口组的卡。
 *
 * 玻璃面 + 16pt 圆角，与「更多」那张卡是同一种材质 ——
 * 这一页上所有卡都该是同一种，不然读起来像拼了几个页面。
 *
 * overflow: hidden 让圆角把行的直角裁掉 —— 不裁的话
 * 行自己的底会在四个角上溢出圆角（见 MineRow 的说明）。
 */
.mine__group {
  overflow: hidden;
  @include fish-glass;
}

/*
 * 组件宿主节点要占满一行。
 *
 * 自定义组件在 WXML 里就是一个标签，它的默认 display 不是 block ——
 * 宿主节点里的行是块级的，行与行之间却会多出一截行内盒子的高度。
 * 显式钉住，两行之间才是设计好的那个间距。
 */
mine-row {
  display: block;
}

/*
 * 退出登录。
 *
 * 独居一格，不套在卡里：它跟别的行不在一个层级 ——
 * 套进卡里就又变成列表里的一条了。
 *
 * 居中：破坏性操作是这一页最后一句，读到它的时候不需要再找左边。
 */
.mine__logout {
  display: block;
  margin-top: 56rpx;
  color: $fish-destructive;
  text-align: center;
  @include fish-type(body);
  @include fish-press-dim;
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
