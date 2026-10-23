/**
 * 登录会话 —— Pinia 全局单例。
 *
 * 存的是「当前是谁」，以及围绕它的三件事：恢复会话、登录、退出。
 * token 的存取本身在 `@/api/client`，401 的静默刷新在 `@/api/auth`，
 * 这一层只管**状态**——组件读它、要动作时调它。
 *
 * 为什么要有「恢复会话」这一步：小程序冷启动时 store 是空的，
 * 但 Storage 里还留着上一轮的 token。用户看到的是「我的」页，
 * 不该因为进程重启就退回未登录的样子 —— 所以进页面先拿 token 换一次
 * `/me`，把它变成一份可信的用户信息再显示。
 *
 * 选 setup store 而不是 options store，理由与 fishingMap 一致：
 * 这里有三样东西天生属于闭包（恢复守卫、并发刷新守卫、登录中标志）。
 */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { getMe, logout as logoutRequest, uploadAvatar as uploadAvatarRequest, wechatLogin } from '@/api/auth';
import { clearSession, ensureTokensLoaded, getRefreshToken, getToken, setRefreshToken, setToken } from '@/api/client';
import { mediaUrl } from '@/api/upload';
import type { AuthUser, WechatLoginResponse } from '@/types/auth';

/** 服务端的默认头像。等于它就等于「用户没上传过头像」 */
const DEFAULT_PHOTO = 'default.png';

/**
 * 从登录响应里剥出用户字典。
 *
 * 服务端把用户字段和两个 token 铺平在 data 顶层，所以要拆开：
 * token 归 token 管，用户字典归用户管。
 */
function toUser(data: WechatLoginResponse): AuthUser {
  const { access_token: _access, refresh_token: _refresh, ...user } = data;
  return user;
}

export const useSessionStore = defineStore('session', () => {
  /** 当前用户。null = 未登录（或者还没恢复出来） */
  const user = ref<AuthUser | null>(null);

  /** 正在恢复会话（拿本地 token 换 /me）。这段期间不该显示成「未登录」 */
  const restoring = ref(false);

  /** 登录中 */
  const loggingIn = ref(false);

  /** 头像上传中 */
  const uploading = ref(false);

  /** 最近一次失败的提示。空串表示没有 */
  const error = ref('');

  const loggedIn = computed(() => user.value !== null);

  /** 有没有真正上传过头像（不是服务端那张 default.png） */
  const hasAvatar = computed(() => {
    const photo = user.value?.photo;
    return !!photo && photo !== DEFAULT_PHOTO;
  });

  /** 有没有昵称 */
  const hasNickname = computed(() => !!user.value?.name?.trim());

  /**
   * 资料还缺不缺。
   *
   * 缺了才提示「完善资料」—— 资料齐了还一直催，是噪声。
   */
  const needsProfile = computed(() => loggedIn.value && !(hasAvatar.value && hasNickname.value));

  /** 头像的完整地址。服务端回的是相对路径，这里拼好 */
  const avatarUrl = computed(() => mediaUrl(user.value?.photo));

  /**
   * 恢复会话。
   *
   * 只在「本地有 token 但内存里还没有用户」时发一次请求 ——
   * 已经有用户了说明这一轮登录过了，没必要再问服务端一次。
   *
   * 失败（token 过期且刷新也失败）就清掉本地会话，退回未登录。
   * 宁可让用户重新登录一次，也不要留着一枚必然失败的 token 反复撞 401。
   */
  let restorePending: Promise<void> | null = null;

  async function restore(): Promise<void> {
    if (user.value) return;
    if (restorePending) return restorePending;

    restorePending = (async (): Promise<void> => {
      /*
       * token 是从 Storage **异步**读进内存的 —— 启动链路上微信体检不许有
       * 同步 Storage 读（getStorageSync 会阻塞 JS 线程）。
       * 所以这里要等它读完再判断有没有会话，否则会把「还没读」当成「没有」。
       */
      await ensureTokensLoaded();
      if (!getToken() || !getRefreshToken()) return;

      restoring.value = true;

      try {
        const me = await getMe();
        user.value = me;
      } catch {
        // 刷新失败时 clearSession 已经在 auth 层做过了，这里只需要把状态退回未登录
        user.value = null;
        clearSession();
      } finally {
        restoring.value = false;
      }
    })().finally(() => {
      restorePending = null;
    });

    return restorePending;
  }

  /**
   * 微信登录。
   *
   * 服务端在这次登录里自动建号，前端不需要先注册。
   * 带 nickname 时服务端只在「这个账号还没有昵称」的情况下写入它。
   */
  async function login(nickname?: string): Promise<void> {
    if (loggingIn.value) return;

    loggingIn.value = true;
    error.value = '';

    try {
      const data = await wechatLogin(nickname);

      setToken(data.access_token);
      setRefreshToken(data.refresh_token);
      user.value = toUser(data);
    } finally {
      loggingIn.value = false;
    }
  }

  /**
   * 写昵称。
   *
   * ⚠️ 服务端目前**没有独立的改昵称接口**（见接入文档 §6「已知缺口」），
   * 昵称只能在登录请求里带过去，而且服务端只在「昵称为空」时才写入。
   *
   * 所以这条路是：重新走一次微信登录，把昵称带上。服务端看到这枚账号的
   * 昵称还是空的，就把它补上；已经有过昵称的账号则会被忽略 ——
   * 这种情况下这里直接拦下来，不让用户白等一次网络往返。
   */
  async function saveNickname(nickname: string): Promise<void> {
    const trimmed = nickname.trim();
    if (!trimmed) throw new Error('昵称不能为空');

    if (hasNickname.value) {
      throw new Error('账号已有昵称，暂不支持修改');
    }

    const data = await wechatLogin(trimmed);

    // 重新登录会换发一对 token，两个都要覆盖写
    setToken(data.access_token);
    setRefreshToken(data.refresh_token);
    user.value = toUser(data);

    // 服务端可能因为「昵称非空」把昵称忽略了 —— 这时得让用户知道没改成
    if (!user.value.name?.trim()) {
      throw new Error('昵称未生效，请稍后重试');
    }
  }

  /**
   * 上传头像。
   *
   * 上传端点要鉴权，所以必须在登录之后 —— 这条顺序是接口契约决定的，
   * 不是实现上的偏好。
   */
  async function uploadAvatar(filePath: string): Promise<void> {
    if (uploading.value) return;

    uploading.value = true;
    error.value = '';

    try {
      const me = await uploadAvatarRequest(filePath);
      user.value = me;
    } finally {
      uploading.value = false;
    }
  }

  /**
   * 退出登录。
   *
   * 先告诉服务端吊销这一台设备的会话，再清本地。
   * 服务端那一步失败也不拦着本地清理 —— 用户点了退出就是退出，
   * 不该因为网络问题让他「退不掉」。
   */
  async function logout(): Promise<void> {
    try {
      await logoutRequest();
    } catch {
      // 忽略：本地会话照清
    } finally {
      user.value = null;
      clearSession();
    }
  }

  return {
    user,
    restoring,
    loggingIn,
    uploading,
    error,
    loggedIn,
    hasAvatar,
    hasNickname,
    needsProfile,
    avatarUrl,
    restore,
    login,
    saveNickname,
    uploadAvatar,
    logout,
  };
});
