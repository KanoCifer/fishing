/**
 * 钓鱼日志的 store —— 当前月的记录与统计。
 *
 * 为什么要有这个 store：日历页要按天聚合，记录页（新建/详情）要读同一条数据，
 * 统计面板要的是跨月的量 —— 三处都是同一份记录的不同切面。
 * 不放 store 的话，页面之间只能靠 URL 传 id 再各拉一次，
 * 而统计那一份无论如何得单独请求一次。
 *
 * 请求归这家管 —— 组件不直接调 api。翻月时组件只说「翻到 X 月」，
 * 取数、发请求、防并发都在这里。
 */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { fishingLogApi } from '@/api/record';
import { logMonthKey } from '@/utils/date';
import type { CreateFishingLogPayload, FishingLog, FishingLogStats } from '@/types/record';

/** 某一天在日历上的状态 */
export type RecordDayState = 'none' | 'checkin' | 'catch';

export const useFishingLogStore = defineStore('fishingLog', () => {
  /** 当前显示的月份，`YYYY-MM` */
  const month = ref(logMonthKey());

  /** 当月的记录 */
  const logs = ref<FishingLog[]>([]);

  /** 统计 */
  const stats = ref<FishingLogStats | null>(null);

  /** 正在取当月记录 */
  const loading = ref(false);

  /** 正在取统计 */
  const statsLoading = ref(false);

  /* ── 派生 ──────────────────────────────────────────────────────────────── */

  /**
   * 按日历日归组的记录。
   *
   * 用对象而不是 Map：模板里取 `dayLogs['2026-10-30']` 是直接的下标，
   * Map 得写 `.get()`，而 Map 在小程序模板里的响应式追踪也不如普通对象稳。
   */
  const logsByDate = computed<Record<string, FishingLog[]>>(() => {
    const grouped: Record<string, FishingLog[]> = {};
    for (const log of logs.value) {
      const key = log.log_date;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(log);
    }
    return grouped;
  });

  /**
   * 每天的状态。
   *
   * 「有渔获」优先于「仅打卡」：一天里既有渔获记录又有空打卡记录时，
   * 日历上只画一个格子，颜色得选**信息量更大的那个** —— 那是用户真正想看到的。
   */
  const dayStates = computed<Record<string, RecordDayState>>(() => {
    const states: Record<string, RecordDayState> = {};
    for (const log of logs.value) {
      const key = log.log_date;
      const hasCatch = (log.catches?.length ?? 0) > 0;
      if (hasCatch) states[key] = 'catch';
      else if (states[key] !== 'catch') states[key] = 'checkin';
    }
    return states;
  });

  /** 某天的状态。空态返回 'none' */
  function dayState(date: string): RecordDayState {
    return dayStates.value[date] ?? 'none';
  }

  /** 某天的记录 */
  function dayLogs(date: string): FishingLog[] {
    return logsByDate.value[date] ?? [];
  }

  /** 当月的打卡天数（含渔获天） */
  const monthCheckinDays = computed(() => Object.keys(dayStates.value).length);

  /* ── 取数 ──────────────────────────────────────────────────────────────── */

  /**
   * 并发守卫。
   *
   * 同一个 in-flight 请求只发一次：连点两次翻月，后一次拿到的响应可能更早到，
   * 两个响应互相覆盖，月份标题与格子内容会对不上。
   */
  let inflight: Promise<void> | null = null;

  /**
   * 取某月的记录。
   *
   * `force` 是给「刷新」用的：正常翻月靠守卫挡住重复请求，
   * 但用户主动下拉刷新时就是要重发一次。
   */
  async function fetchMonth(target?: string, options?: { force?: boolean }): Promise<void> {
    const key = target ?? month.value;
    if (inflight && !options?.force) return inflight;

    inflight = (async (): Promise<void> => {
      loading.value = true;
      try {
        const result = await fishingLogApi.list(key);
        // 回来的时候月份已经被翻走了 —— 这份数据不是当前月份要的，丢掉
        if (month.value !== key) return;
        logs.value = result ?? [];
      } catch {
        logs.value = [];
      } finally {
        loading.value = false;
      }
    })().finally(() => {
      inflight = null;
    });

    return inflight;
  }

  /** 取统计。跨月的量只能由服务端算 */
  async function fetchStats(): Promise<void> {
    if (statsLoading.value) return;

    statsLoading.value = true;
    try {
      stats.value = await fishingLogApi.stats();
    } catch {
      // 统计取不到不该挡住日历 —— 日历本身是主要信息
      stats.value = null;
    } finally {
      statsLoading.value = false;
    }
  }

  /** 把月份切到 target 并取数 */
  async function switchMonth(target: string): Promise<void> {
    month.value = target;
    await fetchMonth(target, { force: true });
  }

  /* ── 写 ────────────────────────────────────────────────────────────────── */

  /**
   * 新建一条记录。
   *
   * 建完立刻把当月数据重取一遍 —— 服务端的统计（连续天数、总天数）
   * 会跟着变，而统计是跨月的量，前端算不出来，只能重取。
   */
  /**
   * 新建一条记录。
   *
   * 写完**不**在这里取数：日历页在 `onPageShow` 里统一刷一次 ——
   * 存与刷分两处做，新建的记录会在两个请求之间短暂缺一份，
   * 而多发一遍请求的代价更实在。
   */
  async function create(payload: CreateFishingLogPayload): Promise<void> {
    await fishingLogApi.create(payload);
  }

  /**
   * 删除一条记录。
   *
   * 先本地把它摘掉，让界面立刻反映操作；数据本身等日历页刷新时对齐。
   */
  async function remove(id: string): Promise<void> {
    await fishingLogApi.remove(id);
    logs.value = logs.value.filter((log) => log.log_id !== id);
  }

  /** 刷新当月记录与统计。日历页在 onPageShow 里调 */
  async function refresh(): Promise<void> {
    await Promise.all([fetchMonth(month.value, { force: true }), fetchStats()]);
  }

  /** 退出登录时清掉上一个账号的记录 */
  function clear(): void {
    month.value = logMonthKey();
    logs.value = [];
    stats.value = null;
  }

  return {
    month,
    logs,
    stats,
    loading,
    statsLoading,
    logsByDate,
    dayStates,
    monthCheckinDays,
    dayState,
    dayLogs,
    fetchMonth,
    fetchStats,
    switchMonth,
    create,
    remove,
    refresh,
    clear,
  };
});
