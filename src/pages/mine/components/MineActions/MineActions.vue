<template>
  <view class="mine-actions">
    <MineRow open-type="share" :icon-src="shareIcon" :label="share.label" />

    <MineRow
      divider
      open-type="contact"
      :icon-src="contactIcon"
      :label="contact.label"
      :session-from="contact.sessionFrom"
      :send-message-title="contact.messageTitle"
      :send-message-path="contact.messagePath"
      :show-message-card="true"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * MineActions —— 「我的」页的两个动作行。
 *
 * 只是一层排版：转发面板与客服会话都是微信自己开的，
 * 这里不调接口、不管状态、也没有失败重试 ——
 * 拉不起来是微信侧的事（比如后台没配客服人员），不是这里能兜的。
 *
 * 文案全部来自 @/constants/about。
 */
import MineRow from '@/components/MineRow/MineRow.vue';
import { icon } from '@/constants/icons';
import { CONTACT, SHARE_APP } from '@/constants/about';

const share = SHARE_APP;
const contact = CONTACT;

/** 动作标记。蓝色 —— 它是这一行的动作，跟「展开箭头」不是一回事 */
const shareIcon = icon('share-2', 'blue');
const contactIcon = icon('message-square', 'blue');
</script>

<style lang="scss" scoped>
/* 组件宿主节点要占满一行 */
.mine-actions {
  display: block;
}

/* 行是自定义组件，宿主节点也得占满一行 */
mine-row {
  display: block;
}
</style>
