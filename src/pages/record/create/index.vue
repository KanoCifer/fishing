<template>
  <!--
    记一笔 —— 新建一条钓鱼记录，顺带反馈今天的鱼口。

    它在**分包**里（日历页是 tab 页，必须在主包；这一页不必），
    所以它能引用主包的组件，不能反过来。

    页面按**情境顺序**排，而不是按字段分组排：
    什么时候、在哪儿（情境）→ 钓到了什么（结果）→ 备注与照片（补充）→ 当时的天气（环境）。
    人回忆一条钓鱼记录就是这个顺序 —— 先想起在哪儿几点，再想起钓到了什么。
    表单顺序按字段分组，跟回忆顺序不是一回事；六个分区平铺，读起来就只是一张清单。

    两条提交路径：
    - 「保存记录」：必须有渔获。这是记一笔的主路径
    - 「仅打卡」：渔获可以为空 —— 当天去了，空军也认

    为什么不让渔获变成「全选填」：随手提交一下就多一条空记录，
    日历上多一个浅色的格子，而那格子代表的是「我今天去了」——
    这件事用户得是有意为之的。

    同一份表单也是鱼口反馈的入口：登录时一次提交两样东西
    （钓鱼记录 + 鱼口反馈），未登录时只剩鱼口反馈那一半。
  -->
  <view class="create" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <PageNav :title="title" :scrolled="scrolled" fallback-url="/pages/records/index" />

    <view class="create__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!-- 会话还在恢复 -->
      <view v-if="!ready" class="create__notice">
        <text class="create__notice-text">{{ loadingText }}</text>
      </view>

      <!--
        未登录：只反馈鱼口概率。

        记录要绑定用户，没有「游客记录」这回事 —— 所以这一档只剩反馈：
        用户照样能对今天的鱼口概率表个态，渔获、照片、地点要登录之后才谈得上。
      -->
      <template v-else-if="!session.loggedIn">
        <view class="scene" :style="{ animationDelay: enterDelay(0) }">
          <text class="scene__place">{{ guestPlace }}</text>

          <view class="scene__meta">
            <text class="scene__meta-item">{{ indexSummary }}</text>
          </view>
        </view>

        <view class="sect">
          <view class="sect__card create__card" :style="{ animationDelay: enterDelay(1) }">
            <FishBiteFeedback :selected="level" @change="onLevelChange" />
          </view>
        </view>

        <view class="create__guest" :style="{ animationDelay: enterDelay(2) }">
          <text class="create__guest-hint">{{ feedback.guestHint }}</text>
          <text class="create__guest-action" @tap="onLogin">{{ feedback.guestLogin }}</text>
        </view>
      </template>

      <template v-else>
        <!-- 情境：什么时候、在哪儿、怎么钓的 -->
        <view class="scene" :style="{ animationDelay: enterDelay(0) }">
          <picker class="scene__picker" mode="time" :value="startTime" @change="onTimeChange">
            <view class="scene__time-row">
              <text class="scene__time">{{ startTime }}</text>
              <image class="scene__time-chevron" :src="chevronIcon" mode="aspectFit" />
            </view>
          </picker>

          <!--
            地点。
            整行可点，点了打开微信自己的选点地图 ——
            地点是「选出来」的：手打名字没法定位，而坐标只能从选点来。
          -->
          <view class="scene__place-row" @tap="pickLocation">
            <text class="scene__place" :class="{ 'scene__place--empty': !placeText }">
              {{ placeText || locationPlaceholder }}
            </text>
            <image class="scene__place-chevron" :src="placeChevronIcon" mode="aspectFit" />
          </view>

          <view class="scene__meta">
            <text class="scene__meta-item scene__meta-item--tap" @tap="toggleMethods">{{ methodsSummary }}</text>
            <text v-if="weatherSummary" class="scene__meta-sep">·</text>
            <text v-if="weatherSummary" class="scene__meta-item">{{ weatherSummary }}</text>
          </view>

          <!-- 钓法。点情境行里那一段才展开 -->
          <view v-if="methodsEditing" class="scene__methods">
            <text class="scene__methods-title">{{ methodTitle }}</text>

            <ChoiceChips :options="methodOptions" :selected="methods" multiple @change="onMethodsChange" />

            <input
              class="create__custom"
              :value="customMethod"
              :placeholder="customMethodPlaceholder"
              placeholder-class="create__placeholder"
              @input="onCustomMethod"
            />
          </view>
        </view>

        <!-- 渔获。这一页的主角，卡给得最大 -->
        <view class="sect">
          <view class="sect__card create__card create__card--lead" :style="{ animationDelay: enterDelay(1) }">
            <view class="create__lead-head">
              <text class="create__lead-title">{{ catchCardTitle }}</text>
              <text class="create__lead-count">{{ catchCountText }}</text>
            </view>

            <RecordCatchEditor :catches="catches" @change="onCatchesChange" />
          </view>
        </view>

        <!--
          鱼口体验。紧挨着渔获 —— 两者说的是同一件事的结果：
          钓到了什么，以及那天的鱼口到底怎么样。

          这一档是喂给模型的：它跟服务端算的专家评分一比，
          差值就是残差模型要学的东西。所以它跟渔获一起提交，不另开一条路。
        -->
        <view class="sect">
          <view class="sect__card create__card" :style="{ animationDelay: enterDelay(2) }">
            <FishBiteFeedback :selected="level" @change="onLevelChange" />
          </view>
        </view>

        <!-- 备注 -->
        <view class="sect">
          <view class="sect__title" :style="{ animationDelay: enterDelay(3) }">{{ remarkTitle }}</view>

          <view class="sect__card create__card" :style="{ animationDelay: enterDelay(3) }">
            <textarea
              class="create__remark"
              :value="remark"
              :placeholder="remarkPlaceholder"
              placeholder-class="create__placeholder"
              :maxlength="200"
              @input="onRemark"
            />
          </view>
        </view>

        <!-- 照片 -->
        <view class="sect">
          <view class="sect__title" :style="{ animationDelay: enterDelay(4) }">{{ imageTitle }}</view>

          <view class="sect__card create__card" :style="{ animationDelay: enterDelay(4) }">
            <ImagePicker :max="imageMax" type="record" @change="onImagesChange" @uploading="onUploadingChange" />
          </view>
        </view>

        <!-- 当时的天气。深色面，收在最后一段 -->
        <view class="sect">
          <view class="sect__card create__weather-card" :style="{ animationDelay: enterDelay(5) }">
            <view class="create__weather-head">
              <text class="create__weather-title">{{ weatherTitle }}</text>
              <text v-if="hasWeather" class="create__weather-action" @tap="weatherEditing = !weatherEditing">
                {{ weatherEditing ? weatherDone : weatherEdit }}
              </text>
            </view>

            <!-- 有天气 -->
            <view v-if="hasWeather" class="create__weather-readings">
              <view v-for="item in weatherItems" :key="item.key" class="create__weather-item">
                <text class="create__weather-label">{{ item.label }}</text>
                <text class="create__weather-value">{{ item.value }}</text>
              </view>
            </view>

            <!-- 没取到天气 -->
            <view v-else class="create__weather-empty">
              <text class="create__weather-empty-text">{{ weatherEmpty }}</text>
              <view class="create__weather-fetch" @tap="fetchWeather">
                <text class="create__weather-fetch-text">{{ weatherFetch }}</text>
              </view>
            </view>

            <!-- 改天气 -->
            <view v-if="weatherEditing" class="create__weather-edit">
              <view v-for="item in editableWeather" :key="item.key" class="create__weather-field">
                <text class="create__weather-field-label">{{ item.label }}</text>
                <input
                  class="create__weather-input"
                  type="digit"
                  :value="String(item.value)"
                  @input="onWeatherInput(item.key, $event)"
                />
              </view>
            </view>
          </view>
        </view>
      </template>
    </view>

    <!-- 提交条。内容从它底下滚过去 -->
    <view v-if="ready" class="create__dock">
      <template v-if="session.loggedIn">
        <view class="create__btn create__btn--ghost" @tap="onCheckinOnly">
          <text class="create__btn-text">{{ checkinLabel }}</text>
        </view>

        <view class="create__btn create__btn--primary" :class="{ 'create__btn--disabled': submitting }" @tap="onSave">
          <text class="create__btn-text">{{ submitting ? savingText : saveLabel }}</text>
        </view>
      </template>

      <!-- 未登录：只有鱼口反馈这一件事可做 -->
      <view
        v-else
        class="create__btn create__btn--primary"
        :class="{ 'create__btn--disabled': submitting }"
        @tap="onSubmitFeedback"
      >
        <text class="create__btn-text">{{ submitting ? feedback.submitting : feedback.guestSubmit }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 新建记录页。
 *
 * 页面负责编排：攒表单的状态、把天气快照从 store 里抄一份、
 * 提交时把载荷发出去、把结果讲给用户听。
 *
 * 表单字段本身由组件负责（渔获清单、照片选择）。
 */
import { computed, ref } from 'vue';
import { onLoad, onPageScroll } from '@dcloudio/uni-app';

import ChoiceChips from '@/components/ChoiceChips/ChoiceChips.vue';
import FishBiteFeedback from '@/components/FishBiteFeedback/FishBiteFeedback.vue';
import ImagePicker from '@/components/ImagePicker/ImagePicker.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import RecordCatchEditor from '@/components/RecordCatchEditor/RecordCatchEditor.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import { loginErrorMessage } from '@/api/auth';
import { fishingApi } from '@/api/fishing';
import { FISHING_FEEDBACK } from '@/constants/feedback';
import { icon } from '@/constants/icons';
import { RECORD_CREATE, RECORD_METHODS } from '@/constants/record';
import { UPLOADING_BLOCK } from '@/constants/upload';
import { useFishingLogStore } from '@/stores/fishingLog';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import { buildFishingFeedbackPayload, deriveFishingIndexLevel, deriveTideMeta } from '@/utils/feedback';
import { logDateKey } from '@/utils/date';
import { toErrorMessage } from '@/utils/error';
import { haptic } from '@/utils/haptics';
import { enterDelay } from '@/utils/motion';
import type { FishingFeedbackLevel } from '@/types/fishing';
import type { FishingLogCatch, FishingLogWeather } from '@/types/record';

/**
 * 选好的地点。
 *
 * 只有名字和坐标 —— 微信给的地址没有去处（后端这条记录没有地址字段），
 * 拿它当名字的兜底就够了。
 */
interface PickedPlace {
  /** 地点名 */
  name: string;
  /** 经度。GCJ-02，经度在前 */
  longitude: number;
  /** 纬度。GCJ-02 */
  latitude: number;
}

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const session = useSessionStore();
const logStore = useFishingLogStore();
const mapStore = useFishingMapStore();

/**
 * 页面标题。
 *
 * 未登录时这一页只做鱼口反馈 —— 标题得说清这一页在干什么，
 * 否则「记一笔」三个字会让人以为有一份记录等着填。
 */
const title = computed(() => (session.loggedIn ? RECORD_CREATE.title : FISHING_FEEDBACK.guestTitle));

/** 鱼口反馈的文案 */
const feedback = FISHING_FEEDBACK;

const catchCardTitle = RECORD_CREATE.catchCardTitle;
const methodTitle = RECORD_CREATE.methodTitle;
const imageTitle = RECORD_CREATE.imageTitle;
const remarkTitle = RECORD_CREATE.remarkTitle;
const weatherTitle = RECORD_CREATE.weatherTitle;
const saveLabel = RECORD_CREATE.save;
const checkinLabel = RECORD_CREATE.checkinOnly;
const savingText = RECORD_CREATE.saving;
const loadingText = '加载中';
const remarkPlaceholder = RECORD_CREATE.remarkPlaceholder;
const locationPlaceholder = RECORD_CREATE.locationPlaceholder;
const locationPickFailed = RECORD_CREATE.locationPickFailed;
const customMethodPlaceholder = RECORD_CREATE.customMethodPlaceholder;
const weatherEmpty = RECORD_CREATE.weatherEmpty;
const weatherFetch = RECORD_CREATE.weatherFetch;
const weatherEdit = RECORD_CREATE.weatherEdit;
const weatherDone = RECORD_CREATE.weatherDone;

/** 时间那一行右边的小箭头。它是「这里能改」的唯一提示 */
const chevronIcon = icon('chevron-down', 'muted60');

/**
 * 地点那一行右边的小箭头。
 *
 * 与时间那行同一套约定（点得开别的界面才有箭头），但方向不同：
 * 时间是往下拉出一张表，地点是往前走一整页地图。
 */
const placeChevronIcon = icon('chevron-right', 'muted60');

/** 导航栏材质层要不要显形 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

/** 会话恢复完了没有 */
const ready = ref(false);

/* ── 表单状态 ──────────────────────────────────────────────────────────── */

/** 渔获清单 */
const catches = ref<FishingLogCatch[]>([]);

/** 钓法。含预设项与自定义的那一条 */
const methods = ref<string[]>([]);

/** 自定义钓法。输入框里的内容不进 methods 数组 —— 它和预设项是两种东西 */
const customMethod = ref('');

/** 钓法那一栏是不是展开着 */
const methodsEditing = ref(false);

/** 图片（服务端相对路径） */
const images = ref<string[]>([]);

/** 照片还在传 */
const uploading = ref(false);

/** 开始时间 `HH:mm` */
const startTime = ref(currentTime());

/**
 * 选好的地点。null = 还没选
 *
 * 地点只有「选出来」这一条路 —— 自由输入砍掉了，
 * 手打的字没法定位，坐标只能从选点来。
 */
const picked = ref<PickedPlace | null>(null);

/** 备注 */
const remark = ref('');

/** 天气快照。自动带入，可手改 */
const weather = ref<FishingLogWeather>({});

/** 天气区块是否展开编辑 */
const weatherEditing = ref(false);

/**
 * 鱼口体验。null = 还没选
 *
 * 它跟渔获是同一件事的两面：渔获是「钓到了什么」，这一档是「那天鱼口怎么样」。
 * 提交时跟记录一起发（见 submit）。
 */
const level = ref<FishingFeedbackLevel | null>(null);

/** 正在提交。锁住按钮，防连点发两次 */
const submitting = ref(false);

/** 钓法选项 */
const methodOptions = RECORD_METHODS.map((name) => ({ value: name, label: name }));

/** 照片上限 */
const imageMax = 3;

/** 今天的日历日。只支持今天 */
const logDate = logDateKey();

/** 现在几点 */
function currentTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/* ── 情境行 ────────────────────────────────────────────────────────────── */

/**
 * 地点行上显示的名字。
 *
 * 选了点的用选点的。没选点、但地图上有选中的钓点，就用那个钓点的名字 ——
 * 用户在地图上点过它，那也是一次明确的选择。
 * 都没有就是空串，界面显示占位。
 */
const placeText = computed(() => {
  if (picked.value) return picked.value.name;
  return mapStore.selectedMarker?.extraData?.name ?? '';
});

/**
 * 未登录时显示的地点。
 *
 * 反馈没有「选点」这一步 —— 游客报的是「我这儿今天的鱼口」，
 * 地点就用当前定位那份地名，定位不到就说钓鱼地点。
 */
const guestPlace = computed(() => mapStore.locationName || placeText.value || '钓鱼地点');

/**
 * 当前鱼口概率。一句话告诉用户「你在给哪一条鱼打分」。
 *
 * 没有数据就说没有 —— 报一个猜出来的分数，比不报更坏。
 */
const indexSummary = computed(() => {
  const data = mapStore.indexData;
  if (!data) return '当前鱼口概率未知';
  return `当前鱼口概率 ${data.fishing_index}（${data.level}）`;
});

/**
 * 提交时用的那一档。
 *
 * 渔获为空时默认「空军」—— 去了、一条没钓到，这本身就是一条信息，
 * 而模型正需要这种「差样本」才能学会区分。
 *
 * 有渔获就不替用户猜：钓到一条到底是「好」还是「一般」，他说才算。
 */
const effectiveLevel = computed<FishingFeedbackLevel | null>(() => {
  if (level.value) return level.value;
  if (session.loggedIn && !catches.value.length) return '空军';
  return null;
});

/**
 * 钓法摘要。
 *
 * 没选的时候给一句「加钓法」而不是留空 —— 情境行上留一个空位，
 * 用户不知道那里本来该有东西。
 */
const methodsSummary = computed(() => {
  const all = collectMethods();
  return all.length ? all.join(' · ') : RECORD_CREATE.methodsHint;
});

/**
 * 天气摘要。
 *
 * 现象取实况（和风给的中文），温度取这份记录自己的快照 ——
 * 用户手改过温度，摘要要跟着改。
 */
const weatherSummary = computed(() => {
  if (!hasWeather.value) return '';

  const condition = mapStore.liveWeather?.text?.trim() ?? '';
  const temperature = withUnit(weather.value.temperature, '');
  if (!temperature) return condition;

  return condition ? `${condition} ${temperature}°` : `${temperature}°`;
});

/** 渔获条数。几条鱼，不是几行 */
const catchCountText = computed(() => {
  const total = catches.value.reduce((sum, item) => sum + item.quantity, 0);
  return RECORD_CREATE.catchCount(total);
});

/** 展开 / 收起钓法 */
function toggleMethods(): void {
  methodsEditing.value = !methodsEditing.value;
}

/**
 * 调微信自带的选点地图。
 *
 * `uni.chooseLocation` 打开的是微信自己那张地图：搜索、定位、路网都在，
 * 用户在自己认得的地方点一下，比我们再画一张地图选得准。
 *
 * 回来的坐标是 GCJ-02 —— 和小程序 `<map>`、和后端存的 location 同一套，
 * 不用再换算。经度在前，写反了不会报错，只会落到地球另一侧。
 */
function pickLocation(): void {
  uni.chooseLocation({
    success: (res) => {
      picked.value = {
        name: res.name || res.address || '未命名地点',
        longitude: res.longitude,
        latitude: res.latitude,
      };
    },
    fail: (err) => {
      // 用户主动取消是正常操作，不该弹一个「失败」把气氛搞砸
      const message = String(err?.errMsg ?? '');
      if (message.includes('cancel')) return;
      uni.showToast({ title: locationPickFailed, icon: 'none' });
    },
  });
}

/* ── 天气 ──────────────────────────────────────────────────────────────── */

/** 有没有取到天气 */
const hasWeather = computed(() => weather.value.temperature !== undefined);

/** 只读的天气读数 */
const weatherItems = computed(() => {
  const w = weather.value;
  return [
    { key: 'temperature', label: '气温', value: withUnit(w.temperature, '°') },
    { key: 'humidity', label: '湿度', value: withUnit(w.humidity, '%') },
    { key: 'pressure', label: '气压', value: withUnit(w.pressure, 'hPa', 0) },
    { key: 'wind', label: '风速', value: withUnit(w.wind_speed, 'km/h') },
    { key: 'precipitation', label: '降水', value: withUnit(w.precipitation, 'mm') },
  ];
});

/** 能手改的五项 */
const editableWeather = computed(() => {
  const w = weather.value;
  return [
    { key: 'temperature', label: '气温', value: w.temperature ?? 0 },
    { key: 'humidity', label: '湿度', value: w.humidity ?? 0 },
    { key: 'pressure', label: '气压', value: w.pressure ?? 0 },
    { key: 'wind_speed', label: '风速', value: w.wind_speed ?? 0 },
    { key: 'precipitation', label: '降水', value: w.precipitation ?? 0 },
  ];
});

/**
 * 把数字配上单位。
 *
 * 缺值不画「--°」这种空壳：读数没有的时候画一个空壳，
 * 那个空壳会骗人（读成「零度」）。
 *
 * `digits` 是小数位数：气压取整 —— 一格放五个读数，
 * 「1018.1hPa」会把它右边的「6.3km/h」顶出格子。
 */
function withUnit(value: number | undefined, unit: string, digits = 1): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  const factor = 10 ** digits;
  return `${Math.round(value * factor) / factor}${unit}`;
}

/**
 * 抄一份当前天气。
 *
 * 与训练记录那套派生逻辑共用一份（见 utils/feedback.ts）——
 * 两边口径不同的话，以后没法把「渔获」和「天气」横向比对。
 */
function fillWeather(): void {
  const live = mapStore.liveWeather;
  const tide = deriveTideMeta(mapStore.tideData);

  weather.value = {
    temperature: toNumber(live?.temp),
    humidity: toNumber(live?.humidity),
    pressure: toNumber(live?.pressure),
    wind_speed: toNumber(live?.windSpeed),
    precipitation: toNumber(live?.precip),
    indices: deriveFishingIndexLevel(mapStore.weatherIndices),
    tide_level: tide.level,
    tide_type: tide.type,
    tide_range: tide.range,
    hours_to_next_tide: tide.hoursToNext,
  };
}

/**
 * 上游给的常常是字符串，要转成数字。
 *
 * 0 是合法值（风速 0、降水 0），所以不能用 `||` 兜底 ——
 * 那样 0 会被当成假值换成别的数。
 */
function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 取当前天气。取不到就空着 —— 天气不是这条记录的必需品 */
async function fetchWeather(): Promise<void> {
  try {
    await mapStore.ensureWeatherAndFishing();
    fillWeather();
  } catch {
    uni.showToast({ title: '天气取不到，可以先不记', icon: 'none' });
  }
}

/* ── 交互 ──────────────────────────────────────────────────────────────── */

function onCatchesChange(next: FishingLogCatch[]): void {
  catches.value = next;
}

/** 选了哪一档鱼口体验 */
function onLevelChange(value: FishingFeedbackLevel): void {
  level.value = value;
}

function onMethodsChange(next: string | string[]): void {
  methods.value = Array.isArray(next) ? next : [next];
}

function onCustomMethod(event: { detail: { value: string } }): void {
  customMethod.value = event.detail.value;
}

function onImagesChange(next: string[]): void {
  images.value = next;
}

function onUploadingChange(value: boolean): void {
  uploading.value = value;
}

function onTimeChange(event: { detail: { value: string } }): void {
  startTime.value = event.detail.value;
}

function onRemark(event: { detail: { value: string } }): void {
  remark.value = event.detail.value;
}

function onWeatherInput(key: string, event: { detail: { value: string } }): void {
  const parsed = Number.parseFloat(event.detail.value);
  if (!Number.isFinite(parsed)) return;
  weather.value = { ...weather.value, [key]: parsed };
}

/* ── 提交 ──────────────────────────────────────────────────────────────── */

/** 钓法：预设项 + 自定义的那一条 */
function collectMethods(): string[] {
  const custom = customMethod.value.trim();
  return custom ? [...methods.value, custom] : [...methods.value];
}

/**
 * 地点。
 *
 * 选了点的用选点的（名字 + 坐标都是那个点的）。
 * 没选点、但地图上有选中的钓点，就用那个钓点 —— id、名字、坐标都是它的。
 * 都没有就不带位置：一个读不出来源的坐标比没有坐标更坏。
 *
 * 选点会顶掉钓点关联：用户自己选的地方，就是他要记的地方 ——
 * 挂着别的钓点 id、坐标却是他自己选的，两边说的不是一件事。
 */
function collectLocation(): {
  location_id?: string;
  location_name?: string;
  longitude?: number;
  latitude?: number;
} {
  if (picked.value) {
    return {
      location_name: picked.value.name,
      longitude: picked.value.longitude,
      latitude: picked.value.latitude,
    };
  }

  const spot = mapStore.selectedMarker;
  if (spot?.extraData) {
    return {
      location_id: spot.extraData.id,
      location_name: spot.extraData.name,
      longitude: spot.position[0],
      latitude: spot.position[1],
    };
  }

  return {};
}

/**
 * 提交鱼口反馈。
 *
 * 反馈走的是 `v3/fish/records` —— 匿名端点，没有归属人，所以登录与否都能发。
 * 天气快照用记录里那份（用户手改过的那份才是「当时」的）。
 */
async function submitFeedback(params: {
  level: FishingFeedbackLevel;
  /** 钓鱼时间，RFC3339 */
  fishingTime: string;
  /** 关联钓点 id。没有关联钓点时传 'default' */
  locationId?: string;
  /** 地点名 */
  locationName?: string;
}): Promise<void> {
  await fishingApi.submitFeedback(
    buildFishingFeedbackPayload({
      level: params.level,
      locationId: params.locationId ?? 'default',
      locationName: params.locationName || '钓鱼地点',
      fishingTime: params.fishingTime,
      weather: weather.value,
    }),
  );
}

/**
 * 提交。
 *
 * `withCatch` 为 false 时是「仅打卡」：渔获可以为空。
 *
 * 登录时一次提交两样东西：钓鱼记录（v3/fish/logs）与鱼口反馈（v3/fish/records）。
 * 先写记录 —— 那是这一页的正事，反馈搭车走；反馈失败不回滚记录，
 * 只提示一句：记录已经在了，用户可以再去反馈一次。
 */
async function submit(withCatch: boolean): Promise<void> {
  if (submitting.value) return;

  if (uploading.value) {
    uni.showToast({ title: UPLOADING_BLOCK, icon: 'none' });
    return;
  }

  if (withCatch && !catches.value.length) {
    uni.showToast({ title: RECORD_CREATE.noCatchToast, icon: 'none' });
    return;
  }

  const chosen = effectiveLevel.value;
  if (!chosen) {
    uni.showToast({ title: FISHING_FEEDBACK.noLevelToast, icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    const [hour, minute] = startTime.value.split(':').map(Number);
    const startedAt = new Date();
    startedAt.setHours(hour || 0, minute || 0, 0, 0);

    const location = collectLocation();

    await logStore.create({
      log_date: logDate,
      started_at: startedAt.toISOString(),
      ...location,
      catches: withCatch ? catches.value : [],
      methods: collectMethods(),
      images: images.value,
      weather: hasWeather.value ? weather.value : undefined,
      remark: remark.value.trim() || undefined,
    });

    /*
     * 鱼口反馈。跟记录同一次提交，但它是独立的一件事 ——
     * 它失败不该把已经存下的记录说成没存上。
     */
    try {
      await submitFeedback({
        level: chosen,
        fishingTime: startedAt.toISOString(),
        locationId: location.location_id,
        locationName: location.location_name,
      });
      uni.showToast({ title: RECORD_CREATE.savedToast, icon: 'none' });
    } catch {
      uni.showToast({ title: FISHING_FEEDBACK.recordOnlyToast, icon: 'none' });
    }

    setTimeout(goBack, 600);
  } catch (err) {
    submitting.value = false;
    uni.showToast({ title: toErrorMessage(err, '保存失败，请稍后重试'), icon: 'none' });
  }
}

/** 保存记录。必须有渔获 */
function onSave(): void {
  void submit(true);
}

/** 仅打卡。渔获可以为空 */
function onCheckinOnly(): void {
  void submit(false);
}

/**
 * 未登录时只提交鱼口反馈。
 *
 * 记录要绑定用户，没有游客记录；反馈匿名可写，所以这一半照样能走通。
 */
async function onSubmitFeedback(): Promise<void> {
  if (submitting.value) return;

  const chosen = effectiveLevel.value;
  if (!chosen) {
    uni.showToast({ title: FISHING_FEEDBACK.noLevelToast, icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    await submitFeedback({
      level: chosen,
      fishingTime: new Date().toISOString(),
      locationId: mapStore.selectedMarker?.extraData?.id,
      locationName: guestPlace.value,
    });

    // 结果只以 toast 呈现：两秒后连它一起消失，页面也退了。
    // 那一刻屏幕上什么都不剩，给一次震动把「提交成了」这件事留下来。
    haptic('medium');
    uni.showToast({ title: FISHING_FEEDBACK.submittedToast, icon: 'success' });
    setTimeout(goBack, 600);
  } catch (err) {
    submitting.value = false;
    // 失败与成功必须能盲听区分：失败是重的一下
    haptic('heavy');
    uni.showToast({ title: toErrorMessage(err, '提交反馈失败，请重试'), icon: 'none' });
  }
}

/** 回上一页 */
function goBack(): void {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.switchTab({ url: '/pages/records/index' });
    },
  });
}

/** 微信登录 */
async function onLogin(): Promise<void> {
  try {
    await session.login();
  } catch (err) {
    uni.showToast({ title: loginErrorMessage(err), icon: 'none' });
  }
}

/* ── 进页面 ────────────────────────────────────────────────────────────── */

/**
 * 进页面。
 *
 * 先恢复会话；再从天气 store 里抄一份当时的天气。
 *
 * 不在这里自动取定位 —— 那会弹一次授权窗，而用户点「记一笔」时
 * 想要的是记一笔，不是被问一次位置。天气取不到就空着，
 * 页面里给了「取当前天气」这个出口。
 *
 * 地点也不自动带：手机此刻在哪，不等于钓鱼的那点在哪。
 * 坐标只能从选点来，所以「当前定位解出来的地名」这一路砍掉了 ——
 * 它给的名字对不上坐标，是一份说不清来路的记录。
 */
onLoad(async () => {
  await session.restore();
  ready.value = true;

  /*
   * 天气快照两份用途：记录里那份（手改过的是「当时」的），
   * 鱼口反馈里那份（模型校准要的是同一份气象条件）。
   *
   * 所以无条件抄一份 —— 没取到实况时，实况那几项留空，
   * 而潮汐与官方钓鱼指数跟实况无关，照样带得上。
   */
  fillWeather();
});
</script>

<style lang="scss" scoped>
/*
 * 一个分区。
 *
 * 缩进、卡间距走令牌层 _layout.scss 的 fish-section —— 与日历页同一套规则。
 */
.sect {
  @include fish-section;
}

/* 分区里的那张卡 */
.create__card {
  @include fish-card;
}

/*
 * 底部留出提交条的高度 + 安全区，
 * 否则最后那块深色天气面会被压在按钮底下。
 */
.create__body {
  padding-bottom: calc(160rpx + env(safe-area-inset-bottom));
}

/* ── 情境 ──────────────────────────────────────────────────────────────── */

/*
 * 情境块。
 *
 * 不套卡：这一段是「记一句话」而不是「填一张表」，
 * 套上卡反而把它说成了一张跟下面那些同级的分区。
 *
 * 时间是这一屏最大的字 —— 它是这条记录的坐标：什么时候开始的。
 */
.scene {
  padding: 16rpx 32rpx 0;
  @include fish-enter;
}

.scene__picker {
  display: block;
}

.scene__time-row {
  display: flex;
  align-items: center;
}

.scene__time {
  color: $fish-ink;
  @include fish-type(title1);
}

/* 时间那一行的小箭头。它是「这里能改」的唯一提示 */
.scene__time-chevron {
  width: 28rpx;
  height: 28rpx;
  margin-left: 12rpx;
  opacity: 0.6;
}

/*
 * 地点行。
 *
 * 与时间行同一套写法：一行大字 + 右边一个小箭头。
 * 箭头是「这里能点进去」的唯一提示 —— 地点行看着像一行文字，
 * 没有箭头的话没人会想到点了能打开地图。
 */
.scene__place-row {
  display: flex;
  align-items: center;
}

.scene__place {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: $fish-ink;
  @include fish-type(headline);

  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 还没选点时是占位，不能跟已经选好的地点读得一样重 */
.scene__place--empty {
  color: $fish-muted-60;
}

.scene__place-chevron {
  width: 28rpx;
  height: 28rpx;
  margin-left: 12rpx;
  opacity: 0.6;
}

.scene__meta {
  display: flex;
  align-items: center;
  margin-top: 8rpx;
}

.scene__meta-item {
  color: $fish-muted-60;
  @include fish-type(footnote);
}

/*
 * 钓法那一段是能点的，所以它是主色 ——
 * 情境行里只有这一段可改，不给点提示，用户不会想到点它。
 */
.scene__meta-item--tap {
  color: $fish-blue-600;
  @include fish-press-dim;
}

.scene__meta-sep {
  padding: 0 10rpx;
  color: $fish-muted-60;
  @include fish-type(footnote);
}

/* 展开的钓法 */
.scene__methods {
  margin-top: 24rpx;
}

.scene__methods-title {
  display: block;
  margin-bottom: 16rpx;
  @include fish-eyebrow;
}

/* ── 渔获 ──────────────────────────────────────────────────────────────── */

/*
 * 主角卡。
 *
 * 它是这一页最大的一块：渔获是「记一笔」的正事，
 * 其余五项是注脚。别的卡都比它小一号。
 */
.create__card--lead {
  padding: 28rpx;
}

.create__lead-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.create__lead-title {
  color: $fish-ink;
  @include fish-type(headline);
}

.create__lead-count {
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/* ── 备注 ──────────────────────────────────────────────────────────────── */

/*
 * 备注框没有底色：它已经在一张卡里了，再给一层底就成了「卡里的一块控件」。
 * 眉标（备注）就是它的断点。
 */
.create__remark {
  width: 100%;
  height: 120rpx;
  padding: 4rpx 0 0;
  color: $fish-ink;
  @include fish-type(body);
}

.create__placeholder {
  color: $fish-muted-60;
  font-size: 26rpx;
}

/* 自定义钓法 */
.create__custom {
  width: 100%;
  height: 72rpx;
  padding: 0 24rpx;
  margin-top: 4rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-fill;
  color: $fish-ink;
  @include fish-type(callout);
}

/* ── 当时的天气（深色面）──────────────────────────────────────────────── */

/*
 * 深色面。
 *
 * 这一页只有一块深色面，它压在最后一段：整页因此有了收尾，
 * 而不是一块深色块插在中间抢主角的位置。
 *
 * 白字压深底比灰字压浅底更稳 —— 读数要的是对比，不是存在感。
 */
.create__weather-card {
  padding: 28rpx;
  @include fish-deep-face;
}

.create__weather-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.create__weather-title {
  color: $fish-on-dark;
  @include fish-type(headline);
}

.create__weather-action {
  color: $fish-deep-muted;
  @include fish-type(caption2);

  font-weight: 600;
  @include fish-press-dim;
}

/*
 * 五个读数平分一行 —— 它们是同一件事的五个侧面，不是五个独立指标，
 * 平铺着看比竖着列更像「当时的天气」。
 */
.create__weather-readings {
  display: flex;
}

.create__weather-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.create__weather-label {
  color: $fish-deep-muted;
  @include fish-type(caption2);
}

/*
 * 读数。
 *
 * 比统计卡那排数字小一档：这一行塞了五个带单位的读数，
 * 用 callout（16pt）的话「1018hPa」和「6.3km/h」会挤在一起。
 */
.create__weather-value {
  margin-top: 4rpx;
  color: $fish-on-dark;
  @include fish-type(footnote);

  font-weight: 600;

  white-space: nowrap;
}

/* 改天气 */
.create__weather-edit {
  padding-top: 24rpx;
  margin-top: 24rpx;
  border-top: 1rpx solid $fish-deep-hairline;
}

.create__weather-field {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.create__weather-field:last-child {
  margin-bottom: 0;
}

.create__weather-field-label {
  flex: 1;
  color: $fish-deep-muted;
  @include fish-type(caption);
}

/* 输入框在深色面上，底色用深色面自己的发丝线那一档 */
.create__weather-input {
  width: 200rpx;
  height: 64rpx;
  padding: 0 20rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-deep-hairline;
  color: $fish-on-dark;
  @include fish-type(callout);
}

/* 没取到天气 */
.create__weather-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.create__weather-empty-text {
  flex: 1;
  min-width: 0;
  color: $fish-deep-muted;
  @include fish-type(caption);
}

.create__weather-fetch {
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  margin-left: 20rpx;
  border-radius: $fish-radius-pill;
  background-color: $fish-deep-hairline;
  @include fish-press-dim;
}

.create__weather-fetch-text {
  color: $fish-on-dark;
  @include fish-type(caption);

  font-weight: 600;
}

/* ── 载入 / 未登录 ─────────────────────────────────────────────────────── */

/* 载入提示 */
.create__notice {
  padding: 96rpx 32rpx;
  text-align: center;
}

.create__notice-text {
  color: $fish-muted;
  @include fish-type(callout);
}

/*
 * 未登录时的那一行提示。
 *
 * 一句话加一个入口，不是一张卡：它说的是「还有件事没做」，
 * 不是这一页的内容 —— 内容只有上面那五档。
 */
.create__guest {
  display: flex;
  align-items: center;
  padding: 8rpx 32rpx 0;
  @include fish-enter;
}

.create__guest-hint {
  flex: 1;
  min-width: 0;
  color: $fish-muted-60;
  @include fish-type(caption);
}

/* 去登录。主色，因为它是个能点的动作，不是一句说明 */
.create__guest-action {
  flex-shrink: 0;
  margin-left: 20rpx;
  color: $fish-blue-600;
  @include fish-type(caption);

  font-weight: 600;
  @include fish-press-dim;
}

/* ── 提交条 ────────────────────────────────────────────────────────────── */

/*
 * 常驻底部的提交条。
 *
 * 内容从它底下滚过去。底色不是全透明 —— 半透明白 + 模糊，
 * 模糊在 WXSS 里不保证生效（老基础库会整条丢掉），
 * 所以这层自带半透明底色与上缘发丝线，层次靠底色兜底。
 */
.create__dock {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: flex;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  background-color: $fish-glass-strong;
  box-shadow: inset 0 1rpx 0 $fish-border-40;
  @include fish-glass-blur;
}

/*
 * 两个提交按钮。
 *
 * 「仅打卡」是次要动作：它排出主按钮的位置，但不该跟主按钮一样重 ——
 * 主按钮是「记渔获」，那是这一页的正事。
 */
.create__btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 92rpx;
  border-radius: $fish-radius-pill;
  @include fish-press(0.97);
}

.create__btn--ghost {
  margin-right: 20rpx;
  background-color: $fish-accent-tint;
}

.create__btn--primary {
  background-color: $fish-accent;
}

.create__btn--disabled {
  opacity: 0.5;
}

.create__btn-text {
  color: $fish-on-accent;
  @include fish-type(callout);

  font-weight: 600;
}

/* 次要按钮上的字是蓝的，不是白的 —— 它压的是淡底 */
.create__btn--ghost .create__btn-text {
  color: $fish-blue-600;
}
</style>
