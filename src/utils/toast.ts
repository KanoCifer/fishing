/**
 * 轻提示 —— toast 的唯一出入口。
 *
 * 微信的 toast 标题超长会被截成省略号，而截断后的句子读起来像另一句话：
 * 「服务暂时不可用，请稍后重试」截成「服务暂时不可用，请稍后…」
 * 用户看不出是哪一条出错。
 *
 * 截断规则只此一处：所有 toast 都从这里走，标题长度一致。
 */

const TITLE_MAX = 14;

export interface ToastOptions {
  /** 图标。默认 'none'（纯文字） */
  icon?: 'none' | 'success' | 'error';
  /** 停留时长（毫秒）。默认 2500 */
  duration?: number;
}

export function showToast(title: string, options: ToastOptions = {}): void {
  const { icon = 'none', duration = 2500 } = options;

  uni.showToast({
    title: title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX)}…` : title,
    icon,
    duration,
  });
}
