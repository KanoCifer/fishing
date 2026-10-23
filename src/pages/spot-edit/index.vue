<template>
  <view class="spot-form" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <PageNav :title="title" :scrolled="scrolled" fallback-url="/pages/my-spots/index" />

    <view class="spot-form__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <!-- 载入中 -->
      <view v-if="loading" class="spot-form__notice">
        <text class="spot-form__notice-text">{{ loadingText }}</text>
      </view>

      <!-- 载入失败 -->
      <view v-else-if="loadFailed" class="spot-form__notice">
        <text class="spot-form__notice-text">{{ loadFailedText }}</text>
      </view>

      <template v-else>
        <view v-if="rejectNote" class="spot-form__reject">
          <text class="spot-form__reject-title">{{ rejectTitle }}</text>
          <text class="spot-form__reject-text">{{ rejectNote }}</text>
        </view>

        <!-- 引子 -->
        <view class="spot-form__lede spot-form__enter" :style="{ animationDelay: enterDelay(0) }">
          <text class="spot-form__title">{{ lede.title }}</text>
        </view>

        <!-- 必填 -->
        <view class="sect">
          <view class="sect__head" :style="{ animationDelay: enterDelay(1) }">
            <text class="sect__title">{{ groups.required }}</text>
            <text class="sect__badge" :class="{ 'sect__badge--done': !missingCount }">{{ missingBadge }}</text>
          </view>

          <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(1) }">
            <FormRow
              :label="fields.location.label"
              required
              chevron
              :value="locationName"
              :sub="locationAddress"
              @select="pickLocation"
            />

            <FormRow :label="fields.name.label" required divided>
              <input
                v-model="name"
                class="spot-form__input spot-form__input--inline"
                :placeholder="fields.name.placeholder"
                placeholder-class="fish-placeholder"
                maxlength="30"
              />
            </FormRow>

            <FormField :label="fields.kind.label" required>
              <ChoiceChips :options="kindOptions" :selected="kind ?? ''" @change="onKindChange" />
              <text v-if="showKindError" class="spot-form__error">{{ fields.kind.error }}</text>
            </FormField>
          </view>
        </view>

        <!-- 说说这里 -->
        <view class="sect">
          <view class="sect__head" :style="{ animationDelay: enterDelay(2) }">
            <text class="sect__title">{{ groups.about }}</text>
            <text class="sect__meta">{{ groups.optional }}</text>
          </view>

          <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(2) }">
            <FormField :label="fields.description.label">
              <textarea
                v-model="description"
                class="spot-form__textarea"
                :placeholder="fields.description.placeholder"
                placeholder-class="fish-placeholder"
                maxlength="200"
                auto-height
              />
            </FormField>

            <FormField :label="fields.photos.label" :hint="fields.photos.hint">
              <SpotImagePicker
                :max="photoMax"
                :initial="photos"
                @change="onPhotosChange"
                @uploading="onUploadingChange"
              />
            </FormField>

            <FormField :label="fields.suitable.label" :hint="fields.suitable.hint">
              <ChoiceChips :options="suitableOptions" :selected="suitableFor" multiple @change="onSuitableChange" />
            </FormField>
          </view>
        </view>

        <!-- 怎么去 -->
        <view class="sect">
          <view class="sect__head" :style="{ animationDelay: enterDelay(3) }">
            <text class="sect__title">{{ groups.reach }}</text>
            <text class="sect__meta">{{ groups.optional }}</text>
          </view>

          <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(3) }">
            <FormField :label="fields.fee.label">
              <ChoiceChips :options="feeOptions" :selected="feeType" @change="onFeeChange" />
            </FormField>

            <FormRow v-if="feeType === 'paid'" :label="fields.feeAmount.label">
              <input
                v-model="feeAmount"
                class="spot-form__input spot-form__input--inline"
                :placeholder="fields.feeAmount.placeholder"
                placeholder-class="fish-placeholder"
                inputmode="decimal"
              />
              <text class="spot-form__unit">{{ fields.feeAmount.unit }}</text>
            </FormRow>

            <FormField :label="fields.road.label">
              <ChoiceChips :options="roadOptions" :selected="roadCondition" @change="onRoadChange" />
            </FormField>

            <FormField :label="fields.car.label">
              <ChoiceChips :options="carOptions" :selected="carAccess" @change="onCarChange" />
            </FormField>

            <FormRow :label="fields.hours.label">
              <input
                v-model="openingHours"
                class="spot-form__input spot-form__input--inline"
                :placeholder="fields.hours.placeholder"
                placeholder-class="fish-placeholder"
                maxlength="30"
              />
            </FormRow>
          </view>
        </view>
      </template>
    </view>

    <!-- 提交条 -->
    <view v-if="!loading && !loadFailed" class="spot-form__submit">
      <view class="spot-form__submit-row">
        <text class="spot-form__submit-note" :class="{ 'spot-form__submit-note--ok': !missingCount }">
          {{ submitNote }}
        </text>
        <view
          class="spot-form__submit-btn"
          :class="{ 'spot-form__submit-btn--disabled': submitting || photoUploading }"
          @tap="submit"
        >
          <text class="spot-form__submit-text">
            {{ submitting ? submittingText : submitText }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPageScroll, onPageShow } from '@dcloudio/uni-app';

import ChoiceChips from '@/components/ChoiceChips/ChoiceChips.vue';
import FormField from '@/components/FormField/FormField.vue';
import FormRow from '@/components/FormRow/FormRow.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import SpotImagePicker from '@/components/SpotImagePicker/SpotImagePicker.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import {
  SPOT_EDIT_LEDE,
  SPOT_EDIT_LOADING,
  SPOT_EDIT_LOAD_FAILED,
  SPOT_EDIT_REJECTED_TITLE,
  SPOT_EDIT_SAVE_FAILED,
  SPOT_EDIT_SAVED,
  SPOT_EDIT_SAVED_CONFIRM,
  SPOT_EDIT_SUBMIT,
  SPOT_EDIT_SUBMITTING,
  SPOT_EDIT_TITLE,
} from './constants';
import {
  SPOT_FORM_FIELDS,
  SPOT_FORM_GROUPS,
  SPOT_FORM_MISSING,
  SPOT_FORM_PICK_FAILED,
  SPOT_PHOTO_MAX,
  SPOT_PHOTO_UPLOADING_BLOCK,
  SPOT_SUITABLE_OPTIONS,
} from '@/constants/spot-form';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import {
  FISHING_SPOT_CAR_LABELS,
  FISHING_SPOT_FEE_LABELS,
  FISHING_SPOT_KIND_LABELS,
  FISHING_SPOT_KINDS,
  FISHING_SPOT_ROAD_LABELS,
  type FishingSpot,
  type FishingSpotCarAccess,
  type FishingSpotFeeType,
  type FishingSpotKind,
  type FishingSpotRoadCondition,
  type FishingSpotStatus,
  type UpdateFishingSpotPayload,
} from '@/types/fishing';
import { toErrorMessage } from '@/utils/error';
import { enterDelay } from '@/utils/motion';

const mapStore = useFishingMapStore();
const session = useSessionStore();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const title = SPOT_EDIT_TITLE;
const lede = SPOT_EDIT_LEDE;
const fields = SPOT_FORM_FIELDS;
const groups = SPOT_FORM_GROUPS;
const submitText = SPOT_EDIT_SUBMIT;
const submittingText = SPOT_EDIT_SUBMITTING;
const loadingText = SPOT_EDIT_LOADING;
const loadFailedText = SPOT_EDIT_LOAD_FAILED;
const rejectTitle = SPOT_EDIT_REJECTED_TITLE;

/** 导航栏材质层要不要显形 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

/* ── 载入 ──────────────────────────────────────────────────────────────── */

/** 这条钓点的 id，从页面参数拿 */
const spotId = ref('');

/** 载入过了没有。只载一次 —— 见 onPageShow 那里的说明 */
let loaded = false;

/** 载入中 / 载入失败 */
const loading = ref(true);
const loadFailed = ref(false);

/** 原始那条钓点。回填与「保存前是什么状态」都以它为准 */
const original = ref<FishingSpot | null>(null);

/** 驳回理由。被驳回时才有 */
const rejectNote = ref('');

/* ── 表单状态 ──────────────────────────────────────────────────────────── */

/** 选好的位置。null = 还没选（进页面时会是已回填的那个） */
interface PickedLocation {
  lng: number;
  lat: number;
  name: string;
  address: string;
}

const location = ref<PickedLocation | null>(null);
const name = ref('');
const description = ref('');
const kind = ref<FishingSpotKind | null>(null);
const suitableFor = ref<string[]>([]);
const feeType = ref<FishingSpotFeeType>('unknown');
const feeAmount = ref('');
const roadCondition = ref<FishingSpotRoadCondition>('unknown');
const carAccess = ref<FishingSpotCarAccess>('unknown');
const openingHours = ref('');

/** 已上传的照片。存的是服务端相对路径，显示那一层由 mediaUrl() 负责 */
const photos = ref<string[]>([]);

/** 有没有照片正在传。没传完就提交，那几张会静默丢掉 */
const photoUploading = ref(false);

/** 正在提交。锁住按钮，避免连点发两次 */
const submitting = ref(false);

/** 照片张数上限 */
const photoMax = SPOT_PHOTO_MAX;

/** 点过提交没有。没点过就不摆错误提示 */
const validated = ref(false);

/* ── 派生 ──────────────────────────────────────────────────────────────── */

const locationName = computed(() => (location.value ? location.value.name : fields.location.empty));
const locationAddress = computed(() => (location.value ? location.value.address : ''));

/** 还差几项必填。位置、名称、水体类型三样，外加「选了收费却没填金额」 */
const missingCount = computed(() => {
  let count = 0;
  if (!location.value) count += 1;
  if (!name.value.trim()) count += 1;
  if (!kind.value) count += 1;
  if (feeType.value === 'paid' && !feeAmount.value.trim()) count += 1;
  return count;
});

/** 还差哪几项。要报给人听，所以给的是标签，不是字段名 */
const missingLabels = computed(() => {
  const labels: string[] = [];
  if (!location.value) labels.push(fields.location.label);
  if (!name.value.trim()) labels.push(fields.name.label);
  if (!kind.value) labels.push(fields.kind.label);
  // 收费却没填金额 —— 这一栏在收费状态下和位置、名称一样是必填的
  if (feeType.value === 'paid' && !feeAmount.value.trim()) labels.push(fields.feeAmount.label);
  return labels;
});

const missingBadge = computed(() =>
  missingCount.value ? SPOT_FORM_MISSING.count(missingCount.value) : SPOT_FORM_MISSING.done,
);

const submitNote = computed(() =>
  missingCount.value ? SPOT_FORM_MISSING.dock(missingCount.value) : SPOT_FORM_MISSING.dockDone,
);

const showKindError = computed(() => validated.value && !kind.value);

/* ── 选项清单 ──────────────────────────────────────────────────────────── */

/**
 * 取值就是后端那几组 oneof 枚举，不另造码 —— 造了码就得再写一张对照表，
 * 而这张表永远和数据源分家。
 */
const kindOptions = FISHING_SPOT_KINDS.map((k) => ({
  value: k,
  label: FISHING_SPOT_KIND_LABELS[k],
}));

const feeOptions = [
  { value: 'free', label: FISHING_SPOT_FEE_LABELS.free },
  { value: 'paid', label: FISHING_SPOT_FEE_LABELS.paid },
  { value: 'unknown', label: FISHING_SPOT_FEE_LABELS.unknown },
];

const roadOptions = [
  { value: 'good', label: FISHING_SPOT_ROAD_LABELS.good },
  { value: 'fair', label: FISHING_SPOT_ROAD_LABELS.fair },
  { value: 'bad', label: FISHING_SPOT_ROAD_LABELS.bad },
  { value: 'unknown', label: FISHING_SPOT_ROAD_LABELS.unknown },
];

const carOptions = [
  { value: 'yes', label: FISHING_SPOT_CAR_LABELS.yes },
  { value: 'no', label: FISHING_SPOT_CAR_LABELS.no },
  { value: 'unknown', label: FISHING_SPOT_CAR_LABELS.unknown },
];

const suitableOptions = SPOT_SUITABLE_OPTIONS.map((value) => ({ value, label: value }));

/* ── 载入与回填 ────────────────────────────────────────────────────────── */

/**
 * 把服务端那条钓点灌进表单。
 *
 * 每一项都要容错：后端对可空字段用了 omitempty，值是 null 时整个键
 * 不发 —— 直接读会拿到 undefined，界面上会显示「undefined」。
 */
function hydrate(spot: FishingSpot): void {
  const [lng, lat] = spot.location ?? [0, 0];
  location.value = {
    lng,
    lat,
    name: spot.name,
    address: spot.address ?? '',
  };
  name.value = spot.name ?? '';
  description.value = spot.description ?? '';
  kind.value = spot.kind ?? null;
  suitableFor.value = spot.suitable_for ?? [];
  feeType.value = spot.fee_type ?? 'unknown';
  feeAmount.value = spot.fee_amount === null || spot.fee_amount === undefined ? '' : String(spot.fee_amount);
  roadCondition.value = spot.road_condition ?? 'unknown';
  carAccess.value = spot.car_access ?? 'unknown';
  openingHours.value = spot.opening_hours ?? '';
  photos.value = [...(spot.images ?? [])];
  rejectNote.value = spot.review_note ?? '';
}

async function load(): Promise<void> {
  if (!spotId.value) {
    loadFailed.value = true;
    loading.value = false;
    return;
  }
  loading.value = true;
  loadFailed.value = false;
  try {
    const spot = await mapStore.fetchSpot(spotId.value);
    original.value = spot;
    hydrate(spot);
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

/* ── 选点 ──────────────────────────────────────────────────────────────── */

/**
 * 调微信自带的选点地图。
 *
 * `uni.chooseLocation` 打开的是微信自己那张地图：搜索、定位、路网都在，
 * 用户在自己认得的地方点一下，比我们再画一张地图选得准。
 *
 * 回来的坐标是 GCJ-02 —— 和小程序 `<map>`、和后端存的 location 同一套。
 * location 要的是 [lng, lat]，经度在前，写反了不会报错，只会落到地球另一侧。
 */
function pickLocation() {
  uni.chooseLocation({
    latitude: location.value?.lat,
    longitude: location.value?.lng,
    success: (res) => {
      location.value = {
        lng: res.longitude,
        lat: res.latitude,
        name: res.name || '未命名地点',
        address: res.address || '',
      };
    },
    fail: (err) => {
      const message = String(err?.errMsg ?? '');
      if (message.includes('cancel')) return;
      uni.showToast({ title: SPOT_FORM_PICK_FAILED, icon: 'none' });
    },
  });
}

/* ── 选项回调 ──────────────────────────────────────────────────────────── */

function onKindChange(value: string | string[]) {
  kind.value = value as FishingSpotKind;
}

function onFeeChange(value: string | string[]) {
  feeType.value = value as FishingSpotFeeType;
  // 从收费切回免费/未知时金额要跟着走 —— 留着上一个金额，
  // 提交出去就是「免费，但收费 30 元」
  if (feeType.value !== 'paid') feeAmount.value = '';
}

function onRoadChange(value: string | string[]) {
  roadCondition.value = value as FishingSpotRoadCondition;
}

function onCarChange(value: string | string[]) {
  carAccess.value = value as FishingSpotCarAccess;
}

function onSuitableChange(value: string | string[]) {
  suitableFor.value = Array.isArray(value) ? value : [];
}

function onPhotosChange(value: string[]) {
  photos.value = value;
}

function onUploadingChange(value: boolean) {
  photoUploading.value = value;
}

/* ── 提交 ──────────────────────────────────────────────────────────────── */

/** 收费金额转成数字。填了但不是数字就当没填 */
function parsedFeeAmount(): number | null {
  const parsed = Number(feeAmount.value);
  return feeAmount.value.trim() && Number.isFinite(parsed) ? parsed : null;
}

/**
 * 保存。
 *
 * 只传这一页管得着的字段：tags 与 rating 都不传（见文件头那段说明），
 * images 必须传（整组替换语义）。
 */
async function submit() {
  if (submitting.value) return;

  validated.value = true;

  if (missingLabels.value.length) {
    uni.showToast({ title: SPOT_FORM_MISSING.toast(missingLabels.value), icon: 'none' });
    return;
  }
  if (photoUploading.value) {
    uni.showToast({ title: SPOT_PHOTO_UPLOADING_BLOCK, icon: 'none' });
    return;
  }

  const picked = location.value;
  const pickedKind = kind.value;
  if (!picked || !pickedKind) return;

  // 保存**前**的状态 —— 提示语按它分三种（见 SPOT_EDIT_SAVED）
  const before: FishingSpotStatus = original.value?.status ?? 'pending';

  submitting.value = true;

  try {
    if (!session.loggedIn) {
      await session.login();
    }

    const payload: UpdateFishingSpotPayload = {
      name: name.value.trim(),
      // location 是 [lng, lat]，经度在前
      location: [picked.lng, picked.lat],
      kind: pickedKind,
      description: description.value.trim(),
      suitable_for: suitableFor.value,
      fee_type: feeType.value,
      road_condition: roadCondition.value,
      car_access: carAccess.value,
      opening_hours: openingHours.value.trim(),
      address: picked.address,
      // 照片存的是服务端相对路径，显示时由 mediaUrl() 拼地址。
      // 必须整组传 —— 不传等于不动，传空数组才是「全删了」。
      images: photos.value,
    };

    /*
     * 收费金额只在「收费」状态下传。
     *
     * 改成免费/未知时**不传**它：后端在 fee_type 不是 paid 时会把金额一起清掉
     * （FeeAmount 是 *float64，JSON 的 null 解出来是 nil，而 nil 在部分更新里
     * 表示「不动」—— 靠前端传 null 是清不掉金额的）。
     */
    if (feeType.value === 'paid') {
      payload.fee_amount = parsedFeeAmount();
    }

    await mapStore.updateSpot(spotId.value, payload);

    const saved = SPOT_EDIT_SAVED[before];
    uni.showModal({
      title: saved.title,
      content: saved.hint,
      showCancel: false,
      confirmText: SPOT_EDIT_SAVED_CONFIRM,
      success: () => {
        // 回「我的钓点」看状态 —— 那里的徽标是这条钓点当前的真身
        uni.redirectTo({ url: '/pages/my-spots/index' });
      },
    });
  } catch (err) {
    uni.showToast({
      title: toErrorMessage(err, SPOT_EDIT_SAVE_FAILED),
      icon: 'none',
    });
  } finally {
    submitting.value = false;
  }
}

/* ── 生命周期 ──────────────────────────────────────────────────────────── */

onLoad((options) => {
  spotId.value = String(options?.id ?? '');
});

/**
 * 进页面先恢复会话再取数。
 *
 * 冷启动时内存里没有用户，Storage 里还留着上一轮的 token ——
 * 不恢复就判断不出是否已登录，取详情会 401。
 *
 * 只载入一次：从后台切回页面也会触发 onPageShow，每次都重新载入的话，
 * 用户填到一半的表单会被冲掉 —— 编辑页没有草稿机制兜着，填了就没了。
 */
onPageShow(async () => {
  await session.restore();
  if (loaded) return;
  loaded = true;
  await load();
});
</script>

<style lang="scss" scoped>
@use '@/styles/shared/spot-form.scss';

/*
 * 载入提示与驳回理由。
 *
 * 这两块不在共用样式里 —— 它们是编辑页独有的：新建页没有「载入」，
 * 也没有「驳回理由」。
 */
.spot-form__notice {
  padding: 96rpx 32rpx;
  text-align: center;
}

.spot-form__notice-text {
  color: $fish-muted;
  @include fish-type(callout);
}

.spot-form__reject {
  margin: 16rpx 32rpx 0;
  padding: 20rpx 24rpx;
  border-radius: $fish-radius-lg;
  background-color: $fish-destructive-tint;
}

.spot-form__reject-title {
  display: block;
  color: $fish-destructive-ink;
  @include fish-type(caption);

  font-weight: 600;
}

.spot-form__reject-text {
  display: block;
  margin-top: 8rpx;
  color: $fish-destructive-ink;
  @include fish-type(caption);
}
</style>
