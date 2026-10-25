<template>
  <!--
    用户信息卡 —— 「我的」页的第一屏。

    这一页原来只有应用身份（图标 + 名称 + 版本）。有了账号之后，
    「我的」页真正要回答的第一个问题是「**我是谁**」，所以身份卡换成了这一张：
    上面是头像与昵称，下面是能立刻做的动作（编辑资料 / 登录）。

    三种状态共用一张卡：
    - 未登录：占位头像 + 一句「登录能换来什么」+ 登录按钮
    - 已登录、资料没填全：头像 + 「完善资料」把缺口指出来
    - 已登录、资料齐全：头像 + 「编辑资料」

    卡片只负责**摆出信息与出口**，动作由页面去执行（emit 出去）——
    它不知道 token 怎么存、头像怎么传，这些是接口层的事。
  -->
  <view class="user-card">
    <view class="user-card__head">
      <!--
        头像。

        ⚠️ 这里**必须**是原生 <button open-type="chooseAvatar">：
        微信的头像选择器只对带这个 open-type 的按钮开放，没有等价的
        view / 事件接口。

        微信的 button 自带一套样式（外边距、边框、::after 伪元素），
        混进来会多出边距和一圈描边，所以这一处要单独把它们清干净 ——
        项目里其他可点元素都用 view + @tap（见 TideCard 的说明），
        只有这一处不得不例外。
      -->
      <button
        v-if="loggedIn"
        class="user-card__avatar-btn"
        open-type="chooseAvatar"
        hover-class="none"
        @chooseavatar="onChooseAvatar"
      >
        <view class="user-card__avatar-wrap">
          <image v-if="avatarSrc" class="user-card__avatar" :src="avatarSrc" mode="aspectFill" />
          <image v-else class="user-card__avatar-glyph" :src="userGlyph" mode="aspectFit" />

          <!--
            相机角标。

            头像长得就是一张照片，不给角标没人知道它是可点的 ——
            「点头像能换头像」这件事得说出来。这一页里换头像只有两条路：
            点这个角标，或者进「编辑资料」抽屉（那里也有一个头像）。
          -->
          <view class="user-card__badge">
            <image class="user-card__badge-icon" :src="cameraIcon" mode="aspectFit" />
          </view>
        </view>
      </button>

      <view v-else class="user-card__avatar-wrap">
        <image class="user-card__avatar-glyph" :src="userGlyph" mode="aspectFit" />
      </view>

      <view class="user-card__id">
        <text class="user-card__name" :class="{ 'user-card__name--empty': !hasName }">{{ displayName }}</text>
        <text class="user-card__handle">{{ handleText }}</text>
      </view>
    </view>

    <!--
      编辑资料。

      它在身份卡里而不是另起一张卡：改的是「我是谁」，跟上面那块是同一件事。
      以前这里是两个并排的按钮，其中一个是「退出登录」——
      破坏性操作跟常规操作同权并排，是这一版要改掉的主要毛病。
    -->
    <MineRow v-if="loggedIn" divider :icon-src="pencilIcon" :label="editLabel" chevron @tap="emit('edit')" />

    <!--
      登录按钮。

      全宽主按钮用品牌渐变：这个页面上它是唯一的主操作，
      别的可点项都是次级的，一眼能分出该按哪个。
    -->
    <view v-else class="user-card__cta" @tap="emit('login')">
      <view class="user-card__cta-divider" />
      <text class="user-card__cta-text">{{ busy ? '登录中…' : '微信登录' }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * UserCard —— 用户身份卡。
 *
 * 只认三件事：这个人是谁、资料齐不齐、能按哪个按钮。
 * 其余的（token 怎么存、头像怎么传）由页面和接口层处理。
 */
import { computed } from 'vue';

import MineRow from '@/components/MineRow/MineRow.vue';
import { mediaUrl } from '@/api/upload';
import { icon } from '@/constants/icons';
import type { AuthUser } from '@/types/auth';

const props = defineProps<{
  /** 当前用户。null = 未登录 */
  user: AuthUser | null;
  /** 登录 / 上传进行中。用来锁住按钮，避免连点 */
  busy?: boolean;
}>();

const emit = defineEmits<{
  /** 点「微信登录」 */
  login: [];
  /** 点「编辑资料」 */
  edit: [];
  /** 选了新头像。参数是 chooseAvatar 给的临时路径（1–5 分钟有效） */
  chooseAvatar: [tempPath: string];
}>();

const loggedIn = computed(() => props.user !== null);
const hasName = computed(() => !!props.user?.name?.trim());

/**
 * 头像地址。
 *
 * 服务端回的 photo 是相对路径，要拼上媒体根地址才是能加载的 URL。
 * 没头像时留空，模板改渲染占位人形。
 */
const avatarSrc = computed(() => {
  const photo = props.user?.photo;
  if (!photo || photo === 'default.png') return '';
  return mediaUrl(photo);
});

/**
 * 显示名。
 *
 * 昵称是空的账号显示「未设置昵称」而不是把空白留着 ——
 * 空白读起来像没加载出来，一句明说反而是在提示「这里缺东西」。
 */
const displayName = computed(() => {
  if (!props.user) return '未登录';
  return hasName.value ? (props.user?.name ?? '') : '未设置昵称';
});

/**
 * 第二行。
 *
 * 已登录时给账号名（服务端由 openid 派生的 `wx_…`，是这位用户的账号标识，
 * 不是微信昵称）；未登录时给一句「登录能换来什么」—— 登录按钮不能只有
 * 「登录」两个字说事。
 */
const handleText = computed(() => {
  if (!props.user) return '登录后同步你的钓点与反馈';
  return props.user?.username ?? '';
});

/** 资料没填全时说「完善资料」，填全了说「编辑资料」 */
const editLabel = computed(() => {
  const photo = props.user?.photo;
  const hasAvatar = !!photo && photo !== 'default.png';
  return hasAvatar && hasName.value ? '编辑资料' : '完善资料';
});

const userGlyph = icon('user', 'muted60');
const pencilIcon = icon('pencil', 'blue');
const cameraIcon = icon('camera', 'onAccent');

/**
 * 选到了新头像。
 *
 * ⚠️ 事件名是全小写的 `chooseavatar` —— 微信的原生事件就叫这个名字，
 * 写成 `chooseAvatar` **不报错、不回调**，表现是「点了没反应」，极难查。
 *
 * 临时路径只有 1–5 分钟有效，交给上层**立刻**上传，不要攒着。
 */
function onChooseAvatar(e: { detail?: { avatarUrl?: string } }) {
  const tempPath = e.detail?.avatarUrl;
  if (!tempPath) return;
  emit('chooseAvatar', tempPath);
}
</script>

<style lang="scss" scoped>
/*
 * 卡片本体。
 *
 * 玻璃面 + 32pt 圆角，与「我的」页原来的身份卡（AboutHeader）同级 ——
 * 这一张取代了它的位置，就该保持同样的分量。
 *
 * overflow: hidden 让圆角把下面那一行的直角裁掉 —— 不裁的话
 * 行自己的底会在四个角上溢出圆角（见 MineRow 的说明）。
 */
.user-card {
  overflow: hidden;
  @include fish-glass($fish-radius-2xl);
}

/* 头像与文字并排。头像这一侧不参与拉伸 */
.user-card__head {
  display: flex;
  align-items: center;
  padding: 36rpx 32rpx;
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
 * 头像按钮。
 *
 * 微信 button 的默认样式要一项项清掉：外边距、内边距、背景、边框，
 * 以及那个 `::after` 伪元素带来的描边（不清的话头像外面会多一圈灰框）。
 */
.user-card__avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 132rpx;
  height: 132rpx;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: $fish-surface;
  /* 角标要探出按钮的边界，不能被裁掉 */
  overflow: visible;
  line-height: 1;
  font-size: inherit;
  color: inherit;

  &::after {
    border: none;
  }
}

/*
 * 头像的外框。
 *
 * 角标是相对它定位的，所以定位的锚要落在这一层 —— 按钮本身是圆形，
 * 拿它当锚的话角标会跟着圆形走位。
 *
 * 未登录时这一层也是同一个圆，只是里面没有人形、没有按钮。
 */
.user-card__avatar-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 132rpx;
  height: 132rpx;
  border-radius: 50%;
  background-color: $fish-surface;
}

/* 真头像 */
.user-card__avatar {
  width: 132rpx;
  height: 132rpx;
  border-radius: 50%;
}

/*
 * 占位人形。
 *
 * 132rpx 的圆里放 60rpx 的人形：再大就挤，再小就看不见。
 * 人形取 tertiaryLabel 的灰 —— 它是「还没有」而不是「你」。
 */
.user-card__avatar-glyph {
  width: 60rpx;
  height: 60rpx;
}

/*
 * 相机角标。
 *
 * 蓝色实心圆压着一枚白色的相机。白字压在品牌蓝上，是全项目最省事的一种强调：
 * 不用再引一档颜色，圆本身已经把「这是个按钮」说清楚了。
 *
 * 描边是白色的一圈：头像换成真实照片之后，角标就压在那张照片上，
 * 没有这一圈它会跟照片糊在一起。
 */
.user-card__badge {
  position: absolute;
  right: -6rpx;
  bottom: -6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  border: 4rpx solid $fish-page;
  border-radius: 50%;
  background-color: $fish-blue;
}

.user-card__badge-icon {
  width: 30rpx;
  height: 30rpx;
}

/* 右侧文字块 */
.user-card__id {
  flex: 1;
  min-width: 0;
  margin-left: 28rpx;
}

/*
 * 昵称。
 *
 * 还没有昵称时压成辅助灰：那不是「名字」，是「这里缺一个名字」，
 * 用主色显示会让人以为已经填好了。
 */
.user-card__name {
  display: block;
  color: $fish-ink;
  @include fish-type(title3);
}

.user-card__name--empty {
  color: $fish-muted;
}

/* 账号名 */
.user-card__handle {
  display: block;
  margin-top: 8rpx;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/*
 * 登录按钮。
 *
 * 全宽主按钮用品牌渐变：这个页面上它是唯一的主操作，
 * 别的可点项都是次级的，一眼能分出该按哪个。
 *
 * 分隔线画成真实元素：它要横跨整张卡，而这一层是被 overflow: hidden 裁过的。
 */
.user-card__cta {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  margin: 0 32rpx 28rpx;
  border-radius: $fish-radius-pill;
  background-image: $fish-gradient;
  box-shadow: $smooth-shadow-sm;
  @include fish-press(0.97);
}

/* 分隔线横在按钮上沿：左右与按钮同宽，与卡内的留白对齐 */
.user-card__cta-divider {
  position: absolute;
  top: -1rpx;
  right: 0;
  left: 0;
  height: 1rpx;
  background-color: $fish-border;
}

.user-card__cta-text {
  color: $fish-on-accent;
  @include fish-type(subhead);

  font-weight: 600;
}
</style>
