<template>
  <!--
    钓点详情页 —— 一张满幅头图压顶，白卡从照片下沿浮出来。
  -->
  <view class="spot-detail">
    <SpotDetailNav :title="title" :solid="solid" :material="material" shareable @back="onBack" @share="openShare" />

    <!--
      内容区（头图 + 主体卡）。

      外面套一层 v-if，是为了重播入场动画。

      CSS 动画只有节点被**重新创建**才会从头跑 —— 改 key 不行（页面根节点换不动），
      改 delay、时长也不行（同名动画跑完就是跑完了，见 docs/design-system.md）。

      为什么非要重建：钓点数据存在全局 store 里（见 ./store），
      二次进入时首帧这些节点就建好了，动画在用户看见之前已经跑完，
      屏幕上只剩终态。拆掉再挂回去，节点是新的，动画也就从头开始。
    -->
    <view v-if="contentReady" class="spot-detail__stage">
      <SpotDetailHero :src="coverSrc" :has-photo="hasPhoto" :height="heroHeight" />

      <view class="spot-detail__body" :style="{ marginTop: -heroOverlap + 'px' }">
        <view v-if="spot" class="spot-detail__enter" :style="{ animationDelay: enterDelay(1) }">
          <SpotDetailHead :spot="spot" :distance="distanceLabel" />
        </view>

        <!--
          钓况。

          **不看有没有数据就挂上去**：加载中摆骨架、取不到摆失败态，
          三种状态都在这一块里自己轮换。整块不出现的话，
          页面会在「名字卡」和「钓点信息」之间空掉一块 —— 用户以为没有钓况。

          但钓点本体没取到时不挂：那时候连名字都没有，一块钓况卡
          孤零零地杵在页面上，读者不知道自己在看什么。
        -->
        <view v-if="spot" class="spot-detail__enter" :style="{ animationDelay: enterDelay(2) }">
          <SpotDetailConditions
            :cells="cells"
            :verdict="verdict"
            :loading="conditionsBusy"
            :failed="conditionsFailed"
            @retry="retryConditions"
          />
        </view>

        <view v-if="spot" class="spot-detail__enter" :style="{ animationDelay: enterDelay(3) }">
          <SpotDetailInfo :spot="spot" />
        </view>

        <view v-if="images.length" class="spot-detail__enter" :style="{ animationDelay: enterDelay(4) }">
          <SpotDetailGallery :images="images" />
        </view>

        <!--
          页脚两个入口，两端对齐。

          左边是读者动作（信息有误？提交反馈），右边是作者动作（编辑这条钓点）。
          分开两个端是因为它们是两种身份：读者看到左边，属主两边都看到。
          挤在中间一行会让两个身份混成一对按钮，读起来像「这页有两个差不多的操作」。
        -->
        <view class="spot-detail__foot spot-detail__enter" :style="{ animationDelay: enterDelay(5) }">
          <view class="spot-detail__foot-link" @tap="openFeedback">
            <image class="spot-detail__foot-icon" :src="feedbackIcon" mode="aspectFit" />
            <text class="spot-detail__foot-text spot-detail__foot-text--muted">{{ feedbackLabel }}</text>
          </view>

          <view v-if="isOwner" class="spot-detail__foot-link" @tap="openEdit">
            <image class="spot-detail__foot-icon" :src="editIcon" mode="aspectFit" />
            <text class="spot-detail__foot-text spot-detail__foot-text--accent">{{ editLabel }}</text>
          </view>
        </view>
      </view>
    </view>

    <SpotDetailDock @nav="openNavigation" />

    <SpotShareSheet :open="shareOpen" :data="posterData" @close="shareOpen = false" @ready="onPosterReady" />
  </view>
</template>

<script setup lang="ts">
/**
 * 钓点详情页 —— 取代原来的 SnapSheet 抽屉版。
 *
 * 抽屉只能露出半屏，钓点这种「照片 + 档案 + 钓况」的信息量本来就装不下；
 * 推成独立页之后，照片能压满一屏，钓况和档案也能一口气读完。
 *
 * 数据分两段到：钓点本体先回来（照片、名字、地址、路况），
 * 钓况随后到 —— 钓况是按**钓点自己的坐标**取的，跟用户当前位置那份不是一回事
 * （见 stores/spotDetail 的说明）。
 */
import { computed, nextTick, ref } from 'vue';
import { onLoad, onPageScroll, onShareAppMessage, onPageShow } from '@dcloudio/uni-app';

import SpotDetailConditions from './components/SpotDetailConditions/SpotDetailConditions.vue';
import SpotDetailDock from './components/SpotDetailDock/SpotDetailDock.vue';
import SpotDetailGallery from './components/SpotDetailGallery/SpotDetailGallery.vue';
import SpotDetailHead from './components/SpotDetailHead/SpotDetailHead.vue';
import SpotDetailHero from './components/SpotDetailHero/SpotDetailHero.vue';
import SpotDetailInfo from './components/SpotDetailInfo/SpotDetailInfo.vue';
import SpotDetailNav from './components/SpotDetailNav/SpotDetailNav.vue';
import SpotShareSheet from './components/SpotShareSheet/SpotShareSheet.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { SPOT_DETAIL_EDIT, SPOT_HERO_HEIGHT_RPX, SPOT_HERO_OVERLAP_RPX, SPOT_PLACEHOLDER_IMAGE } from './constants';
import { SHARE_TITLES, SHARE_WXACODE } from './share';
import { mediaUrl } from '@/api/upload';
import { icon } from '@/constants/icons';
import { SPOT_FEEDBACK_ENTRY } from '@/constants/spot-feedback';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import { useSpotDetailStore } from './store';
import { enterDelay } from '@/utils/motion';
import { enableShareMenu } from '@/utils/share';
import type { PosterSpot } from './poster';
import { buildConditionCells, buildSpotVerdict, distanceKm, formatDistance } from './spot-conditions';
import { fishingSpotKindLabel } from '@/types/fishing';

const detailStore = useSpotDetailStore();
const mapStore = useFishingMapStore();
const session = useSessionStore();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/**
 * 入场动画重播的时机（ms）。
 *
 * 微信 iOS 端 navigateTo 有约 300ms 的转场，这段时间里页面还没真正露脸。
 * 重建必须落在转场之后 —— 落在之前，动画照旧在用户看不见的时候跑完，
 * 屏幕上只剩终态。
 *
 * 这也解释了「为什么只有第一次进入有入场动画」：第一次是数据回来得晚，
 * 节点是晚建的，动画就晚跑，晚跑反而看见了；后面几次数据是 store 里现成的，
 * 首帧就把节点建好了，动画在页面露脸之前就跑完了。
 */
const REBUILD_DELAY = 400;

/**
 * 内容区是否挂载。
 *
 * 拆和挂分两次提交：先 false 让渲染层把旧节点删掉，再 true 让它建新的。
 * 同一轮更新里 false → true 会被合成一次提交，等于没拆 ——
 * 节点是复用出来的，动画也就不会重播。
 */
const contentReady = ref(false);

/**
 * 重建定时器。
 *
 * onPageShow 可能连着触发（前后台来回切），不留句柄的话会攒下好几个定时器，
 * 到点一起重建 —— 拆一次挂一次，动画会抖一下。
 */
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

onPageShow(() => {
  if (rebuildTimer) clearTimeout(rebuildTimer);

  rebuildTimer = setTimeout(() => {
    contentReady.value = false;

    nextTick(() => {
      contentReady.value = true;
    });
  }, REBUILD_DELAY);
});
/**
 * 头图高度与压住量（px）。
 *
 * 设计尺寸是 rpx，这里过一次 upx2px —— 运行时用的是 px，
 * 而且页面要用同一个数算滚动阈值，两处必须同源。
 */
const heroHeight = uni.upx2px(SPOT_HERO_HEIGHT_RPX);
const heroOverlap = uni.upx2px(SPOT_HERO_OVERLAP_RPX);

/**
 * 导航栏反色的滚动阈值（px）。
 *
 * 主体卡的上沿在文档坐标上是「头图高度 − 压住量」；
 * 它滚到导航栏底边以下时，导航栏背后就不是照片了，该反色。
 *
 * 写死一个数是不行的：头图高度是 rpx，在 375pt 机型上是 372px、
 * 在 414pt 上是 411px —— 同一个阈值在两种机型上会一个早翻一个晚翻。
 */
const flipAt = heroHeight - heroOverlap - navBarBottom;

/** 当前滚动位置（px）。onPageScroll 给的 */
const scrollTop = ref(0);

onPageScroll((event) => {
  scrollTop.value = event.scrollTop;
});

const spot = computed(() => detailStore.spot);

/** 编辑按钮上的字 */
const editLabel = SPOT_DETAIL_EDIT.label;

/** 纠错入口上的字 */
const feedbackLabel = SPOT_FEEDBACK_ENTRY.label;

/**
 * 页脚两个入口的图标。
 *
 * 纠错是读者动作 —— 灰色小图标，13pt，跟 12pt 的字一个量级；
 * 编辑是作者动作 —— 品牌蓝，跟它那行字的蓝色是同一个蓝。
 *
 * 图标不是可有可无的装饰：页脚这两个入口是这一页仅有的两处文字，
 * 没有图标的话它们读起来像版权声明，而不是点得动的东西。
 */
const feedbackIcon = icon('message-square', 'muted');
const editIcon = icon('pencil', 'blue600');

/**
 * 这条钓点是不是我的。
 *
 * 认的是钓点上的属主快照（owner.user_id）与当前登录用户 —— 不是
 * 「我能不能编辑」，而是「这是不是我提交的那条」。
 */
const isOwner = computed(() => {
  const ownerId = spot.value?.owner?.user_id;
  const myId = session.user?.id;
  return !!ownerId && !!myId && ownerId === myId;
});

/** 去改这条钓点 */
function openEdit(): void {
  const id = spot.value?.id;
  if (!id) return;
  uni.navigateTo({ url: `/pages/spot-edit/index?id=${id}` });
}

/**
 * 去提交纠错反馈。
 *
 * 反馈页是独立分包 —— 分包之间不能互相引用资源，
 * 所以它自己取数，这里只把钓点的 public id 递过去。
 */
function openFeedback(): void {
  const id = spot.value?.id;
  if (!id) return;
  uni.navigateTo({ url: `/pages/spot-feedback/index?id=${id}` });
}

/**
 * 照片地址。
 *
 * 库里存的是**服务端相对路径**（如 `gallery/42/xxx.jpg`），
 * 直接当 src 用会 404 —— 得过 mediaUrl() 拼成能加载的地址。
 * 已经是 http 开头的原样返回（迁移过来的老数据可能是完整 URL）。
 */
const images = computed(() => (spot.value?.images ?? []).map(mediaUrl));

/** 有没有真实照片。没有的话头图用占位插画 */
const hasPhoto = computed(() => images.value.length > 0);

/** 头图地址：没有照片时用占位插画 */
const coverSrc = computed(() => (hasPhoto.value ? (images.value[0] ?? '') : SPOT_PLACEHOLDER_IMAGE));

/** 导航栏标题 */
const title = computed(() => spot.value?.name ?? '');

/**
 * 导航栏的两态。
 *
 * **solid 与 material 是两件事**：solid 管图标颜色（蓝箭头 + 黑字），
 * material 管那条磨砂带。它们不再一起翻。
 *
 * 分开的理由是缺图的时候：头图换成浅色占位插画，
 * 白色箭头压在浅插画上根本读不出来 —— 但这时候底下也没有照片在滚，
 * 那条磨砂带没有存在意义（它的作用是「托住滚过去的内容」，
 * 底下什么都没有时铺一块半透明白面，只是把插画切开）。
 *
 * 所以：没有照片时**从头**就用实底图标，但不铺磨砂带。
 */
const past = computed(() => scrollTop.value >= flipAt);
const solid = computed(() => !hasPhoto.value || past.value);

/** 材质层：内容滚到导航栏底下才显形 */
const material = computed(() => past.value);

/** 钓况四格 */
const cells = computed(() => buildConditionCells(detailStore.now, detailStore.tide));

/**
 * 结论：等级词、色调、一句话。
 *
 * 换算在 spot-conditions 里做完（见 buildSpotVerdict），
 * 组件只管把它们摆上去。
 */
const verdict = computed(() => buildSpotVerdict(detailStore.index));

/**
 * 钓况是不是真的取不到。
 *
 * 有旧数据时不摆失败态：手里已经有一份能显示的，就别把它换成一句报错。
 */
const conditionsFailed = computed(() => !!detailStore.conditionsError && !detailStore.index);

/**
 * 钓况还在路上。
 *
 * 「还没取到」也算在飞 —— 请求刚排上队的那一瞬，conditionsLoading 还是 false，
 * 但那一瞬必须摆骨架而不是四格 '--'：摆 '--' 像是「这个钓点没气压数据」，
 * 而真实情况是「还没问完」。
 */
const conditionsBusy = computed(
  () => detailStore.conditionsLoading || (!detailStore.index && !detailStore.conditionsError),
);

/** 重新取一次钓况 */
function retryConditions(): void {
  void detailStore.refreshConditions();
}

/**
 * 距离。
 *
 * 后端的 `distance_km` 只有列表请求带了定位中心才有值，
 * `GET /v3/fish/spots/{id}` 不给这个字段 —— 所以这里自己算，
 * 公式与后端 util.DistanceKm 一致（见 utils/spot-conditions）。
 */
const distanceLabel = computed(() => {
  const current = spot.value;
  const user = mapStore.userLocation;
  if (!current || !user) return formatDistance(null);
  return formatDistance(distanceKm(user, current.location));
});

/* ── 分享 ───────────────────────────────────────────────────────────── */

/** 分享浮层是否打开 */
const shareOpen = ref(false);

/**
 * 转发卡片的封面（临时文件路径）。
 *
 * 微信的转发卡片按 5:4 显示，所以要从海报里裁一条出来（见 ./poster 的 CARD_CROP）。
 *
 * 临时路径只在本次会话内有效，所以每次重画海报都要重新给一份，
 * 这里存的是「最新一版」，不是缓存。
 */
const shareCardPath = ref('');

/** 海报要画的那些内容。全部是已经换算好的展示值 */
const posterData = computed<PosterSpot>(() => {
  const current = spot.value;
  const index = detailStore.index;

  return {
    name: current?.name ?? '钓点',
    kind: fishingSpotKindLabel(current?.kind),
    place: index?.location_name ?? '',
    distance: distanceLabel.value,
    hours: current?.opening_hours ?? '',
    description: current?.description ?? '',
    // 文字地址：后端 omitempty，没填就是空串 —— 海报上那一行就不画
    address: current?.address ?? '',
    score: index?.fishing_index ?? 0,
    level: index?.level ?? '',
    // 缺图时用占位插画顶上 —— 海报上那一块不能空着
    cover: coverSrc.value,
    // 海报右下角的小程序码
    codeUrl: SHARE_WXACODE,
  };
});

/** 转发给好友时聊天列表里显示的那一行 */
const shareTitle = computed(() => {
  const index = detailStore.index;
  return SHARE_TITLES.friend(spot.value?.name ?? '钓点', index?.fishing_index ?? 0, index?.location_name ?? '');
});

/** 打开分享浮层 */
function openShare(): void {
  shareOpen.value = true;
}

/** 海报画好了，把封面收下 */
function onPosterReady(payload: { card: string }): void {
  shareCardPath.value = payload.card;
}

/**
 * 转发给好友。
 *
 * 标题、路径、封面三样凑成微信聊天里那张卡片。
 * 封面是海报裁出来的 5:4 —— 收的人在卡片上先看见的是这条钓点的照片和鱼口，
 * 点进去才是详情页。
 */
onShareAppMessage(() => ({
  title: shareTitle.value,
  path: `/pages/spot-detail/index?id=${spot.value?.id ?? ''}`,
  imageUrl: shareCardPath.value || undefined,
}));

onLoad((options) => {
  const id = options?.id;
  if (!id) {
    uni.showToast({ title: '钓点不存在', icon: 'none' });
    return;
  }

  /*
   * 打开胶囊菜单里的「转发」。
   *
   * 只开转发，不开「分享到朋友圈」—— 这一版分享只走两条路：
   * 存相册、转发给好友。朋友圈那一项留着只会多一个走不通的出口。
   */
  enableShareMenu();

  /*
   * 先恢复会话。
   *
   * 这一页要判断「这条是不是我的」—— 属主才给「编辑这条钓点」入口。
   * 冷启动后内存里没有用户（token 还在 Storage 里），不恢复就判断不出来，
   * 属主会看不到那个入口，而入口在不在取决于用户先路过哪个页面。
   */
  void session.restore();

  void detailStore.load(id);

  /*
   * 距离要用用户坐标。
   *
   * 不带 force：已有坐标直接复用，用户拒绝过也不重试 ——
   * 微信在用户拒绝之后不会再弹权限窗，反复调只是反复失败。
   * 从地图页点进来时，那边多半已经问过一轮了。
   */
  void mapStore.locateUser();
});

/**
 * 返回上一页。
 */
function onBack() {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.switchTab({ url: '/pages/fishing/index' });
    },
  });
}

/**
 * 打开微信内置地图的导航入口。
 *
 * 用的是小程序自带的 `uni.openLocation`：它把当前这个点摆到微信自己的地图页上，
 * 用户在那页可以一键唤起路线规划与转向导航。系统那条链本来就是完整的，
 * 自己再画一条 Polyline 只会多一层还少一半能力。
 *
 * 坐标直接传，不做转换：钓点的 location 是 GCJ-02，微信地图原生也用 GCJ-02，
 * 换算错了会偏出几百米 —— 比偏个几十米糟糕得多。location 是 [lng, lat]，
 * 而 openLocation 要的是 lat / lng 两个字段，写反了不会报错，只会落到地球另一侧。
 *
 * scale 16 是街道级：默认的 18 已经是楼栋级，钓点多半在水边、路边，
 * 放到那个倍率反而看不见周围的地形。
 */
function openNavigation() {
  const current = spot.value;
  if (!current) return;

  const [lng, lat] = current.location;

  uni.openLocation({
    latitude: lat,
    longitude: lng,
    name: current.name || '钓点',
    scale: 16,
    fail: () => {
      // 正常不会走到这里（不涉及任何权限），但万一是环境不支持，
      // 给个说法比按钮点了没反应强
      uni.showToast({ title: '无法打开地图', icon: 'none' });
    },
  });
}
</script>

<style lang="scss" scoped>
.spot-detail {
  min-height: 100vh;
  background-color: $fish-grouped;
}

.spot-detail__body {
  position: relative;
  z-index: 2;

  /*
   * 横向留白 32rpx（16pt）。
   *
   * 原先 24rpx（12pt）：主体卡的圆角是 32pt，留白只有 12pt 的时候，
   * 卡片几乎顶到屏幕边，那圈圆角看着是被屏幕切出来的，不是卡片自己的。
   * 16pt 之后圆角才立得住 —— 这也是数据页那一档留白。
   */
  padding: 16rpx 32rpx;

  /* 底栏是浮层的，下面这一截留出来，不然最后一段内容被它盖住 */
  padding-bottom: calc(200rpx + env(safe-area-inset-bottom));
  border-radius: $fish-radius-sheet $fish-radius-sheet 0 0;
  background-color: $fish-grouped;
}

.spot-detail__enter {
  @include fish-enter;
}

/*
 * 页脚两个入口。
 *
 * 两端对齐：左边读者动作、右边作者动作。
 *
 * 以前这两个入口各自独占一行、都是居中 —— 注释写的是「居中偏右」和「左对齐」，
 * 代码里却是同一个 justify-content: center，注释与实现对不上，
 * 读起来就是两个都居中的入口，读者与作者的动作混在一处。
 * 现在按注释原本的意思摆：两个身份，两端。
 */
.spot-detail__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: $fish-space-sectitle;
}

.spot-detail__foot-link {
  display: flex;
  align-items: center;
  @include fish-press-dim;
}

.spot-detail__foot-icon {
  width: 26rpx;
  height: 26rpx;
  margin-right: 8rpx;
  flex-shrink: 0;
}

.spot-detail__foot-text {
  @include fish-type(caption);
}

/* 读者动作。灰色 —— 它是这一页最次要的动作 */
.spot-detail__foot-text--muted {
  color: $fish-muted;
}

/* 作者动作。品牌蓝，跟底栏那颗主按钮同一个蓝 */
.spot-detail__foot-text--accent {
  color: $fish-blue-600;

  font-weight: 600;
}
</style>
