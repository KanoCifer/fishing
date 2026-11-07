/**
 * 钓点状态 —— 地图上的公开钓点、我提交过的钓点、当前选中的那条。
 *
 * 三份数据放一个 store，但**分三份存**：它们不是一回事，
 * 合成一份就会出现「待审核的钓点已经画在地图上了」这种假象。
 *
 * 取数归这里管 —— 组件不直接调 api。
 */

import { ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';

import { fishingSpotApi } from '@/api/fishing';
import {
  toMapMarkers,
  type CreateFishingSpotPayload,
  type FishingSpot,
  type MapMarker,
  type UpdateFishingSpotPayload,
} from '@/types/fishing';
import { toErrorMessage } from '@/utils/error';
import { createSingleFlight } from '@/utils/singleFlight';

/**
 * 钓点列表的新鲜窗口。
 *
 * 与服务端那道缓存对齐：`GET /v3/fish/spots` 的响应带
 * `Cache-Control: public, max-age=300`，五分钟内谁都拿同一份。
 * 窗口比这短就是在拿一份被缓存住的数据 —— 白发一条请求。
 */
const SPOTS_TTL = 5 * 60 * 1000;

export const useSpotStore = defineStore('spots', () => {
  // 钓点标记
  const markers = shallowRef<MapMarker[]>([]);
  const spotsLoading = ref(false);
  const spotsError = ref('');
  /**
   * 最近一次**成功**取到钓点的时刻（毫秒）。0 = 还没成功过。
   *
   * 失败不改这一项：失败的那次没有数据可算新鲜。留着旧时间戳，
   * 下一次刷新会以为自己刚取过，白等一个 TTL。
   */
  const spotsFetchedAt = ref(0);

  /**
   * 我提交的钓点。
   *
   * 与 markers 分开存，因为它们是两份不同的数据：markers 是公开列表
   * （后端只放已过审的），这里是「我的」（含待审核、已驳回）。
   * 合成一份的话，待审核那条在地图上就会显示出来 —— 它还没过审。
   */
  const mySpots = shallowRef<FishingSpot[]>([]);
  const mySpotsLoading = ref(false);
  const mySpotsError = ref('');

  /**
   * 当前选中的钓点。
   *
   * 放 store 而不是地图页的局部 state：选中动作发生在钓点页（点 marker），
   * 消费方却是记录新建页（反馈与记录合成一张表单），两边跨页了。
   * 跨页只能靠 URL 传，而 URL 带 marker 还得额外处理刷新和失效，
   * 不如共享状态直接。
   */
  const selectedMarker = shallowRef<MapMarker | null>(null);

  /**
   * 钓点请求的 in-flight 守卫。
   *
   * 页面的 onShow 与用户点的「重试」可能落在同一刻 —— 两条响应先后回来
   * 会互相覆盖。与天气那一路同一个道理，只是这里只有一个 URL。
   */
  const spotsFlight = createSingleFlight();

  async function loadSpots(): Promise<void> {
    spotsLoading.value = true;
    /*
     * 不在这里清 spotsError：重试途中那行错误得留着，
     * 否则浮层一闪就消失，用户不知道自己按的那一下有没有用。
     * 成功之后再清。
     */
    try {
      const spots = await fishingSpotApi.list();
      markers.value = toMapMarkers(spots);
      spotsFetchedAt.value = Date.now();
      spotsError.value = '';
    } catch (err) {
      spotsError.value = toErrorMessage(err, '加载钓点失败');
      /*
       * 这里不弹 toast：这句话已经写在地图上的浮层里了（见钓点页），
       * 再弹一次就是同一件事说两遍。
       *
       * 浮层只在「一个标记都没拿到」时出现 —— 已经画在地图上的旧数据
       * 不需要用户操心，后台那次刷新没成不影响他看钓点。
       */
    } finally {
      spotsLoading.value = false;
    }
  }

  /**
   * 拉钓点列表并转成地图标记。
   *
   * 与原来那一版差在三处：
   *
   * 1. **失败不动已有的标记**。一次网络抖动不该把已经画在地图上的钓点抹掉 ——
   *    空地图比旧地图更糟，它看起来像「这一片真的没有钓点」。
   * 2. **不并发**。页面的 onShow 与用户点的「重试」可能落在同一刻，
   *    两条响应先后回来会互相覆盖（与天气那一路的守卫同一个道理）。
   * 3. **五分钟内不重取**。与服务端那道缓存对齐，切 tab 回来不必每次都发一条。
   *
   * force = true 时无视新鲜度 —— 用户点了「重试」。
   */
  async function fetchSpots(options?: { force?: boolean }): Promise<void> {
    if (options?.force) {
      await spotsFlight.restart('public', loadSpots);
      return;
    }

    // 已在飞：等那一条，不发第二条
    if (spotsFlight.busy) {
      await spotsFlight.run('public', loadSpots);
      return;
    }

    const fresh = spotsFetchedAt.value > 0 && Date.now() - spotsFetchedAt.value <= SPOTS_TTL;
    if (fresh) return;

    await spotsFlight.run('public', loadSpots);
  }

  /**
   * 提交新钓点。
   *
   * 提交成功**不等于**它已经公开：后端把普通用户的投稿置为 pending，
   * 公开列表只放已过审的条目。所以提交完它不会出现在地图上，
   * 只出现在「我的钓点」里，附带审核状态。
   *
   * 失败往上抛，不在这里弹 toast：提交失败时表单要留在原地、告诉用户哪一步没成，
   * 一个 toast 把上下文冲掉了。与 session.login 同策略。
   */
  async function createSpot(payload: CreateFishingSpotPayload): Promise<FishingSpot> {
    const created = await fishingSpotApi.create(payload);

    // 新提的排在最前：它是刚发生的，也是作者最想确认的那一条
    mySpots.value = [created, ...mySpots.value];

    return created;
  }

  /**
   * 拉我提交的钓点。
   *
   * 只有这个端点能看见待审核 / 已驳回的条目 —— 公开列表把 status 写死成 approved。
   *
   * 失败只落到 `mySpotsError`，**不弹 toast**：这一份数据有两个消费方 ——
   * 「我的」页只要一个数量，取不到就当没有；「我的钓点」页才需要说话。
   * 由谁来说话是页面自己的事，store 不替它们选。
   */
  async function fetchMySpots(): Promise<void> {
    mySpotsLoading.value = true;
    mySpotsError.value = '';

    try {
      mySpots.value = await fishingSpotApi.listMine();
    } catch (err) {
      mySpotsError.value = toErrorMessage(err, '加载我的钓点失败');
    } finally {
      mySpotsLoading.value = false;
    }
  }

  /**
   * 更新我提交的钓点。
   *
   * 保存完重新拉一次「我的钓点」：属主改一条没过审的钓点，
   * 后端把它退回 pending 并清掉审核备注 —— 列表里那条的状态变了，
   * 不重拉的话页面上还挂着旧状态，用户会以为没生效。
   */
  async function updateSpot(id: string, payload: UpdateFishingSpotPayload): Promise<void> {
    await fishingSpotApi.update(id, payload);
    await fetchMySpots();
  }

  /**
   * 清掉我提交的钓点。
   *
   * 退出登录时调用：这些是上一个账号的数据。留着的话，
   * 登出之后「我的」页还会显示着别人的条数。
   */
  function clearMySpots(): void {
    mySpots.value = [];
    mySpotsError.value = '';
  }

  /**
   * 记录当前选中的钓点（点 marker 时调用），传 null 表示取消选中。
   *
   * 与标记集合分开而不是合成一个，是因为选中态只改一个引用，
   * 不该顺带触发地图标记的全量 diff。
   */
  function setSelectedMarker(marker: MapMarker | null): void {
    selectedMarker.value = marker;
  }

  return {
    markers,
    spotsLoading,
    spotsError,
    spotsFetchedAt,
    mySpots,
    mySpotsLoading,
    mySpotsError,
    selectedMarker,
    fetchSpots,
    createSpot,
    updateSpot,
    fetchMySpots,
    clearMySpots,
    setSelectedMarker,
  };
});
