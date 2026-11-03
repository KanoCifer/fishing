/**
 * 骨架与实数据的交叉淡入。
 *
 * 为什么需要它：数据一到就把骨架摘掉，中间会露出卡片底色 ——
 * 骨架在消失，新内容还在淡入，两张不在同一时刻，读起来像闪了一下。
 *
 * 做法：新内容淡入的同时骨架淡出，淡完再把骨架从 DOM 里摘掉。
 * 骨架淡出这 160ms 里它还得占着位，所以内容与骨架叠在同一个格子里
 * （grid 同单元），高度由两者中高的那个决定。
 *
 * 时长写在 utils/motion.ts（CROSS_FADE_DURATION）——
 * JS 读不到 Sass 变量，两处要一起改。
 */

import { onBeforeUnmount, ref, watch } from 'vue';

import { CROSS_FADE_DURATION } from '@/utils/motion';

export interface CrossFadeOptions {
  /** 内容到了没有 */
  hasContent: () => boolean;
  /** 还在加载没有 */
  loading: () => boolean;
}

export function useCrossFade({ hasContent, loading }: CrossFadeOptions) {
  /** 骨架还在 DOM 里吗 */
  const skeletonVisible = ref(!hasContent());

  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** 骨架重新占位（回到加载态） */
  function show(): void {
    clearTimer();
    skeletonVisible.value = true;
  }

  /** 骨架淡出：淡完再摘 */
  function hide(): void {
    clearTimer();
    timer = setTimeout(() => {
      skeletonVisible.value = false;
      timer = null;
    }, CROSS_FADE_DURATION);
  }

  /** 骨架立刻摘（加载结束但没有内容：错误或空态接管） */
  function drop(): void {
    clearTimer();
    skeletonVisible.value = false;
  }

  watch(
    () => [loading(), hasContent()] as const,
    ([isLoading, has]) => {
      // 有数据时刷新不算加载 —— 骨架不回来，读数原地更新
      if (isLoading && !has) {
        show();
        return;
      }
      if (has) {
        hide();
        return;
      }
      drop();
    },
    { immediate: true },
  );

  onBeforeUnmount(clearTimer);

  return { skeletonVisible };
}
