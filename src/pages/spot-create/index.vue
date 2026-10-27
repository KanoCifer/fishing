<template>
  <view class="spot-form" :style="{ minHeight: windowHeight + 'px' }">
    <PageBackdrop />

    <PageNav :title="title" :scrolled="scrolled" fallback-url="/pages/fishing/index" />

    <view class="spot-form__body" :style="{ paddingTop: navBarBottom + 'px' }">
      <view v-if="draftRestored" class="spot-form__draft spot-form__enter" :style="{ animationDelay: enterDelay(0) }">
        <view class="spot-form__draft-text">
          <text class="spot-form__draft-title">{{ draftCopy.restored }}</text>
          <text class="spot-form__draft-time">{{ draftSavedAtText }}</text>
        </view>
        <text class="spot-form__draft-discard" @tap="confirmDiscardDraft">{{ draftCopy.discard }}</text>
      </view>
      <!--
        顶部标注：这条内容提交后要过审。

        排在必填组之前 —— 它是这一页的前提条件，不是又一组要填的东西。
      -->
      <SpotPublishNotice mode="banner" class="spot-form__enter" :style="{ animationDelay: enterDelay(2) }" />

      <!--
        必填。
        放最前面是因为它是整份表单里唯一**必须**从别处搬来的数据 ——
        名字可以想，描述可以想，坐标只能选。
      -->
      <view class="sect">
        <view class="sect__head" :style="{ animationDelay: enterDelay(3) }">
          <text class="sect__title">{{ groups.required }}</text>
          <text class="sect__badge" :class="{ 'sect__badge--done': !missingCount }">{{ missingBadge }}</text>
        </view>

        <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(3) }">
          <FormRow
            :label="fields.location.label"
            required
            chevron
            :value="locationName"
            :sub="locationAddress"
            @select="pickLocation"
          />

          <!--
            名称。
            上面一行也是「标签在左」，所以这一行上面画一根发丝线 ——
            两行标签在左的挨在一起，不画线它们会糊成一块。
          -->
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
        <view class="sect__head" :style="{ animationDelay: enterDelay(4) }">
          <text class="sect__title">{{ groups.about }}</text>
          <text class="sect__meta">{{ groups.optional }}</text>
        </view>

        <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(4) }">
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

          <!--
            照片。
            放在「说说这里」这一组里，而不是另起一组 —— 它是这条钓点的
            补充说明，不是另一组信息。位置和名字定了之后，照片才拍得出来。
          -->
          <FormField :label="fields.photos.label" :hint="fields.photos.hint">
            <SpotImagePicker
              :max="photoMax"
              :initial="draftPhotos"
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
        <view class="sect__head" :style="{ animationDelay: enterDelay(5) }">
          <text class="sect__title">{{ groups.reach }}</text>
          <text class="sect__meta">{{ groups.optional }}</text>
        </view>

        <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(5) }">
          <FormField :label="fields.fee.label">
            <ChoiceChips :options="feeOptions" :selected="feeType" @change="onFeeChange" />
          </FormField>

          <!-- 金额只在收费时才有意义，平时那一栏是多余的噪声 -->
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

      <!--
        末尾声明。放在提交条正上方 —— 用户滚到底正要按「提交审核」，
        这几句话就在他眼前。
      -->
      <SpotPublishNotice
        class="spot-form__enter"
        :style="{ animationDelay: enterDelay(6) }"
        @open-doc="openPublishDoc"
      />
    </view>

    <!--
      提交条常驻底部。
      表单有十栏，滚到底才找得到按钮等于没有 —— 按钮得一直在手边。
      左边那一行是「还差几项」：光有一个灰着的按钮，用户不知道它为什么灰。
    -->
    <view class="spot-form__submit">
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
/**
 * 钓点投稿页 —— 提交一份新的钓点。
 *
 * 表单攒出一份 `CreateFishingSpotPayload` 交给 store 的 createSpot，
 * 页面只管收集用户意图、把状态翻译给组件、把结果讲给用户听。
 *
 * 提交成功之后事情没完：后端把普通用户的投稿置为 pending，
 * 公开列表只放已过审的条目 —— 这条钓点不会立刻出现在地图上。
 * 所以成功提示说的是「等待审核」，并把人送到「我的钓点」去看状态。
 *
 * 草稿（本地 Storage，不进服务端）：
 * 这一页有十栏，填到一半退出是常事。草稿替用户留住已填的内容，
 * 下次进来接着填；提交成功后清掉 —— 那时候内容已经在服务端了。
 */
import { computed, ref, watch } from 'vue';
import { onHide, onPageScroll, onPageShow, onUnload } from '@dcloudio/uni-app';

import ChoiceChips from '@/components/ChoiceChips/ChoiceChips.vue';
import FormField from '@/components/FormField/FormField.vue';
import FormRow from '@/components/FormRow/FormRow.vue';
import PageBackdrop from '@/components/PageBackdrop/PageBackdrop.vue';
import PageNav from '@/components/PageNav/PageNav.vue';
import SpotImagePicker from '@/components/SpotImagePicker/SpotImagePicker.vue';
import SpotPublishNotice from '@/components/SpotPublishNotice/SpotPublishNotice.vue';
import { useNavMetrics } from '@/composables/useNavMetrics';
import { useViewport } from '@/composables/useViewport';
import {
  SPOT_CREATE_DRAFT,
  SPOT_CREATE_LEDE,
  SPOT_CREATE_SUBMIT,
  SPOT_CREATE_SUBMITTED,
  SPOT_CREATE_SUBMITTED_CONFIRM,
  SPOT_CREATE_SUBMITTED_HINT,
  SPOT_CREATE_SUBMITTING,
  SPOT_CREATE_TITLE,
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
import { SPOT_PUBLISH_CONFIRM, SPOT_PUBLISH_REPORT_DOC } from '@/constants/spot-publish';
import { useFishingMapStore } from '@/stores/fishingMap';
import { useSessionStore } from '@/stores/session';
import {
  FISHING_SPOT_CAR_LABELS,
  FISHING_SPOT_FEE_LABELS,
  FISHING_SPOT_KIND_LABELS,
  FISHING_SPOT_KINDS,
  FISHING_SPOT_ROAD_LABELS,
  type FishingSpotCarAccess,
  type FishingSpotFeeType,
  type FishingSpotKind,
  type FishingSpotRoadCondition,
} from '@/types/fishing';
import type { SpotDraft } from '@/types/draft';
import { clearSpotDraft, isSpotDraftEmpty, readSpotDraft, writeSpotDraft } from './draft';
import { formatShortMoment } from '@/utils/date';
import { toErrorMessage } from '@/utils/error';
import { haptic } from '@/utils/haptics';
import { enterDelay } from '@/utils/motion';

const mapStore = useFishingMapStore();
const session = useSessionStore();

/** px，来自运行时 API，不能用 rpx 代替（见 useNavMetrics 的注释） */
const { navBarBottom } = useNavMetrics();

/** 可用窗口高度（px）。页面最小高度用它，见 useViewport */
const { windowHeight } = useViewport();

const title = SPOT_CREATE_TITLE;
const fields = SPOT_FORM_FIELDS;
const lede = SPOT_CREATE_LEDE;
const groups = SPOT_FORM_GROUPS;
const draftCopy = SPOT_CREATE_DRAFT;
const submitText = SPOT_CREATE_SUBMIT;
const submittingText = SPOT_CREATE_SUBMITTING;
const publishConfirm = SPOT_PUBLISH_CONFIRM;

/** 导航栏材质层要不要显形：内容滚到它底下了才要 */
const scrolled = ref(false);

onPageScroll((event) => {
  scrolled.value = event.scrollTop > 8;
});

/* ── 表单状态 ──────────────────────────────────────────────────────────── */

/** 选好的位置。null = 还没选 */
interface PickedLocation {
  /** 经度 */
  lng: number;
  /** 纬度 */
  lat: number;
  /** 选点地图给的地名 */
  name: string;
  /** 选点地图给的地址 */
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

/**
 * 已上传的照片。存的是**服务端相对路径**，不是能直接显示的地址 ——
 * 显示那一层由 mediaUrl() 负责（见 api/upload）。
 */
const photos = ref<string[]>([]);

/**
 * 有没有照片正在传。
 *
 * 没传完就提交，那几张照片会静默丢掉 —— 提交那一刻它们还没有服务端地址，
 * 但用户明明在界面上看见了它们。传完才让提交。
 */
const photoUploading = ref(false);

/** 正在提交。锁住按钮，避免连点发两次 */
const submitting = ref(false);

/** 照片张数上限 */
const photoMax = SPOT_PHOTO_MAX;

/**
 * 点过提交没有。
 *
 * 没点过就不摆错误提示 —— 一进页面就红一片，用户会以为表单坏了，
 * 而不是以为自己漏了什么。
 */
const validated = ref(false);

/* ── 派生 ──────────────────────────────────────────────────────────────── */

/** 位置那一行显示的地名 */
const locationName = computed(() => (location.value ? location.value.name : fields.location.empty));

/** 位置那一行显示的地址 */
const locationAddress = computed(() => (location.value ? location.value.address : ''));

/** 还差几项必填。位置、名称、水体类型三样 */
const missingCount = computed(() => {
  let count = 0;
  if (!location.value) count += 1;
  if (!name.value.trim()) count += 1;
  if (!kind.value) count += 1;
  return count;
});

/** 还差哪几项。要报给人听，所以给的是标签，不是字段名 */
const missingLabels = computed(() => {
  const labels: string[] = [];
  if (!location.value) labels.push(fields.location.label);
  if (!name.value.trim()) labels.push(fields.name.label);
  if (!kind.value) labels.push(fields.kind.label);
  return labels;
});

/** 分组标题右边那一枚 */
const missingBadge = computed(() =>
  missingCount.value ? SPOT_FORM_MISSING.count(missingCount.value) : SPOT_FORM_MISSING.done,
);

/** 底栏左边那一行 */
const submitNote = computed(() =>
  missingCount.value ? SPOT_FORM_MISSING.dock(missingCount.value) : SPOT_FORM_MISSING.dockDone,
);

/** 水体类型那一栏的错话。点过提交还没选才说 */
const showKindError = computed(() => validated.value && !kind.value);

/** 草稿条第二行。「保存于 10-21 20:15」 */
const draftSavedAtText = computed(() => draftCopy.savedAt(formatShortMoment(draftSavedAt.value)));

/* ── 选项清单 ──────────────────────────────────────────────────────────── */

/**
 * 选项清单。
 *
 * 取值就是后端那三组 oneof 枚举，不另造码 —— 造了码就得再写一张对照表，
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

/** 适合钓法。存的是中文字面量，详情页原样展示 */
const suitableOptions = SPOT_SUITABLE_OPTIONS.map((value) => ({ value, label: value }));

/* ── 草稿 ──────────────────────────────────────────────────────────────── */

/** 草稿是不是被恢复出来的。恢复出来才挂那条提示 */
const draftRestored = ref(false);

/** 草稿存下来的时刻。给那条提示写「保存于 …」 */
const draftSavedAt = ref(0);

/**
 * 照片的初始值。
 *
 * 照片选择器自己持有已上传列表（见 SpotImagePicker 的注释），
 * 恢复草稿时只能通过 initial 把它填进去 —— 那一栏是它唯一的入口。
 */
const draftPhotos = ref<string[]>([]);

/** 存草稿的定时器。null = 现在没有待存的 */
let draftTimer: number | null = null;

/** 提交成功了没有。提交过就不再存草稿 —— 不然退出页面时又把它写回去 */
const submitted = ref(false);

/** 草稿恢复过没有。恢复只做一次 —— 页面来回切时别把用户填的冲掉 */
let restored = false;

/**
 * 表单当前内容的一个快照。
 *
 * 它回答一个问题：用户改过没有？
 *
 * 草稿读回表单时会一次性改掉一堆字段，那一下不算「用户改了」。
 * 不挡住的话，读回来立刻又存一遍，时间戳跟着刷新，
 * 「保存于 …」就变成刚读回来的那一秒，没意义了。
 */
function formSnapshot(): string {
  return JSON.stringify([
    location.value,
    name.value,
    kind.value,
    description.value,
    suitableFor.value,
    feeType.value,
    feeAmount.value,
    roadCondition.value,
    carAccess.value,
    openingHours.value,
    photos.value,
  ]);
}

/** 上一次已存 / 已恢复时的快照。跟当前一样就说明用户没动过 */
let knownSnapshot = formSnapshot();

/**
 * 攒一份草稿。
 *
 * 字段跟页面里的状态一一对应，不翻译 —— 翻译成 DTO 是提交那一刻的事，
 * 草稿只在这台设备上待着，存一份「能原样读回去」的东西最省事。
 */
function buildDraft(): SpotDraft {
  return {
    version: 1,
    savedAt: Date.now(),
    location: location.value ? { ...location.value } : null,
    name: name.value,
    kind: kind.value,
    description: description.value,
    suitableFor: [...suitableFor.value],
    feeType: feeType.value,
    feeAmount: feeAmount.value,
    roadCondition: roadCondition.value,
    carAccess: carAccess.value,
    openingHours: openingHours.value,
    photos: [...photos.value],
  };
}

/**
 * 把草稿读回表单。
 *
 * 照片存的是服务端相对路径，不是本地临时路径 ——
 * 临时路径离开那次会话就没了，存进去等于存了一串废字符。
 */
function applyDraft(draft: SpotDraft): void {
  location.value = draft.location ? { ...draft.location } : null;
  name.value = draft.name;
  kind.value = draft.kind;
  description.value = draft.description;
  suitableFor.value = [...draft.suitableFor];
  feeType.value = draft.feeType;
  feeAmount.value = draft.feeAmount;
  roadCondition.value = draft.roadCondition;
  carAccess.value = draft.carAccess;
  openingHours.value = draft.openingHours;
  photos.value = [...draft.photos];
  draftPhotos.value = [...draft.photos];
}

/**
 * 存草稿。
 *
 * 没填过什么就不存 —— 存一份空草稿，下次进来会弹一条「已恢复上次的草稿」，
 * 而用户根本没写过东西，那条提示就成了噪音。
 */
function saveDraftNow(): void {
  if (draftTimer !== null) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
  if (submitted.value) return;
  // 用户没动过就别写：白写一遍只是让时间戳乱跳
  if (formSnapshot() === knownSnapshot) return;

  const draft = buildDraft();
  if (isSpotDraftEmpty(draft)) {
    clearSpotDraft();
    knownSnapshot = formSnapshot();
    return;
  }
  writeSpotDraft(draft);
  knownSnapshot = formSnapshot();
}

/**
 * 排一次存草稿。
 *
 * 延后 800ms 再存：打字是一个字一个字来的，
 * 每敲一下就写一次 Storage，写得太勤只是白费气。
 */
function scheduleDraftSave(): void {
  if (draftTimer !== null) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    draftTimer = null;
    saveDraftNow();
  }, 800);
}

/** 恢复上次的草稿。进页面时调一次 */
function restoreDraft(): void {
  const draft = readSpotDraft();
  if (!draft || isSpotDraftEmpty(draft)) return;

  applyDraft(draft);
  knownSnapshot = formSnapshot();
  draftSavedAt.value = draft.savedAt;
  draftRestored.value = true;
}

/**
 * 丢弃草稿。
 *
 * 丢的是用户自己写的东西，收不回来 —— 所以先问一句。
 */
function confirmDiscardDraft(): void {
  uni.showModal({
    title: draftCopy.discardTitle,
    content: draftCopy.discardContent,
    confirmText: draftCopy.discardConfirm,
    cancelText: draftCopy.discardCancel,
    success: (res) => {
      if (!res.confirm) return;

      clearSpotDraft();
      draftRestored.value = false;
      draftSavedAt.value = 0;
      draftPhotos.value = [];
      location.value = null;
      name.value = '';
      kind.value = null;
      description.value = '';
      suitableFor.value = [];
      feeType.value = 'unknown';
      feeAmount.value = '';
      roadCondition.value = 'unknown';
      carAccess.value = 'unknown';
      openingHours.value = '';
      photos.value = [];
      // 表单已经空了，别让 watcher 又把它存回去
      knownSnapshot = formSnapshot();
    },
  });
}

/* ── 选点 ──────────────────────────────────────────────────────────────── */

/**
 * 调微信自带的选点地图。
 *
 * `uni.chooseLocation` 打开的是微信自己那张地图：搜索、定位、路网都在，
 * 用户在自己认得的地方点一下，比我们再画一张地图选得准。
 *
 * 回来的坐标是 GCJ-02 —— 和小程序 `<map>`、和后端存的 location 同一套，
 * 不用再换算。location 要的是 [lng, lat]，经度在前，写反了不会报错，
 * 只会落到地球另一侧。
 */
function pickLocation() {
  uni.chooseLocation({
    success: (res) => {
      location.value = {
        lng: res.longitude,
        lat: res.latitude,
        name: res.name || '未命名地点',
        address: res.address || '',
      };
    },
    fail: (err) => {
      // 用户主动取消是正常操作，不该弹一个「失败」把气氛搞砸。
      // 只有真的出错（没授权、环境不支持）才提示。
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
  // 从收费切回免费/未知时，金额要跟着走 —— 留着上一个金额，
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

/** 照片列表变了 */
function onPhotosChange(value: string[]) {
  photos.value = value;
}

/** 有没有照片在传 */
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
 * 打开《内容审核与举报说明》。
 *
 * 规范全文在关于页那个分包里 —— 分包之间不能互相引用资源，
 * 所以这里不是引组件，而是跳过去，并把文档的 key 带上，
 * 让关于页一进去就把那一篇展开（见关于页的 onLoad）。
 */
function openPublishDoc(): void {
  uni.navigateTo({
    url: `/pages/about/index?doc=${encodeURIComponent(SPOT_PUBLISH_REPORT_DOC.key)}`,
  });
}

/**
 * 提交前的确认弹窗。
 *
 * 这一页填的是要**公开给别人看**的东西，而「提交审核」这个按钮
 * 和别的按钮长得一样。弹一次窗，是让用户在动手之前知道后果：
 * 提交后它会进入待审核，通过后会出现在公开地图上，还可能被别的钓友转发。
 *
 * 确认了才往下走；用户点了取消，什么都不发生（不发请求、不清草稿）。
 */
function confirmPublish(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: publishConfirm.title,
      content: publishConfirm.content,
      confirmText: publishConfirm.confirm,
      cancelText: publishConfirm.cancel,
      success: (res) => resolve(res.confirm),
      // 弹不出来（参数非法之类）就当没确认 —— 宁可让用户再按一次提交，
      // 也不能在他没看见后果的情况下把内容发出去
      fail: () => resolve(false),
    });
  });
}

/**
 * 提交。
 *
 * 登录是后端的要求（未登录直接 401），而 `wx.login` 是静默的 ——
 * 用户不会看到任何弹窗，账号也是服务端自动建的。所以这里在提交前静默补一次登录，
 * 而不是把用户挡在表单前面让他先去「我的」页登录。
 */
async function submit() {
  if (submitting.value) return;

  validated.value = true;

  // 缺哪几项一次说完。分三回报（先说位置、填完再说名称、再说类型），
  // 用户要来回三趟 —— 而分组卡上明明写着「还差 2 项」。
  if (missingLabels.value.length) {
    uni.showToast({ title: SPOT_FORM_MISSING.toast(missingLabels.value), icon: 'none' });
    return;
  }
  // 照片没传完就提交，那几张会静默丢掉 —— 用户在界面上明明看见了它们
  if (photoUploading.value) {
    uni.showToast({ title: SPOT_PHOTO_UPLOADING_BLOCK, icon: 'none' });
    return;
  }

  /*
   * 把值取出来，顺带让类型收窄。
   *
   * 上面那段已经报过缺哪几项了，走到这里的「位置」和「水体类型」必然都在 ——
   * 这一句纯粹是给类型检查看的，不是又一道校验。
   */
  const picked = location.value;
  const pickedKind = kind.value;
  if (!picked || !pickedKind) return;

  // 确认在登录之前：用户不该为了看一句确认，先被静默登录一次
  if (!(await confirmPublish())) return;

  submitting.value = true;

  try {
    if (!session.loggedIn) {
      await session.login();
    }

    await mapStore.createSpot({
      name: name.value.trim(),
      // location 是 [lng, lat]，经度在前
      location: [picked.lng, picked.lat],
      kind: pickedKind,
      description: description.value.trim(),
      suitable_for: suitableFor.value,
      fee_type: feeType.value,
      fee_amount: feeType.value === 'paid' ? parsedFeeAmount() : null,
      road_condition: roadCondition.value,
      car_access: carAccess.value,
      opening_hours: openingHours.value.trim(),
      address: picked.address,
      // 照片存的是服务端相对路径，显示时由 mediaUrl() 拼地址
      images: photos.value,
      // 用户不能给自己的钓点打分。rating 留 0 = 还没有评分
      rating: 0,
    });

    // 提交成功 ≠ 已经公开：这条还在待审核，公开列表里看不到它。
    // 所以说清楚它去哪了，并把「我的钓点」指给用户 —— 状态在那儿看。
    // 草稿也在这时候清掉：内容已经在服务端了，本地那份留着只会让人
    // 下次进来以为上次没提交成，又填一遍。
    submitted.value = true;
    clearSpotDraft();

    uni.showModal({
      title: SPOT_CREATE_SUBMITTED,
      content: SPOT_CREATE_SUBMITTED_HINT,
      showCancel: false,
      confirmText: SPOT_CREATE_SUBMITTED_CONFIRM,
      success: (res) => {
        if (res.confirm) {
          uni.redirectTo({ url: '/pages/my-spots/index' });
          return;
        }
        uni.navigateBack({
          delta: 1,
          fail: () => {
            uni.switchTab({ url: '/pages/fishing/index' });
          },
        });
      },
      fail: (err) => {
        // 弹窗弹不出来时（参数非法之类），不能让用户停在已经提交过的表单上：
        // 草稿已经清掉了，再按一次提交就是重复建一条。
        // 旧版 Android 点蒙层关闭走的是 fail，那种不算失败，直接放过。
        if (String(err.errMsg ?? '').includes('cancel')) return;
        uni.showToast({ title: SPOT_CREATE_SUBMITTED, icon: 'none' });
        uni.redirectTo({ url: '/pages/my-spots/index' });
      },
    });
  } catch (err) {
    // 提交成功弹的是模态框，确认一直留在屏幕上，不需要再补一次震动；
    // 失败只有一条一闪而过的 toast，重的一下是为了让人不看屏幕也知道没成
    haptic('heavy');
    uni.showToast({
      title: toErrorMessage(err, '提交失败，请重试'),
      icon: 'none',
    });
  } finally {
    submitting.value = false;
  }
}

/* ── 草稿的存与取 ──────────────────────────────────────────────────────── */

/**
 * 表单一变就排一次存草稿。
 *
 * watch 一组源而不是一个对象：这些是彼此独立的 ref，
 * 一个个列出来比 watch 一个大对象更省心，也不会因为多写了一层就漏存。
 */
watch(
  [location, name, kind, description, suitableFor, feeType, feeAmount, roadCondition, carAccess, openingHours, photos],
  () => {
    scheduleDraftSave();
  },
);

/**
 * 离开页面时把待存的草稿立刻写下去。
 *
 * 不等那 800ms：用户是在这一刻离开的，下一次进来是几分钟之后，
 * 这中间差的几百毫秒里他敲的字就白敲了。
 */
onHide(() => {
  saveDraftNow();
});

onUnload(() => {
  saveDraftNow();
});

/**
 * 进页面先恢复会话，再恢复草稿。
 *
 * 小程序冷启动时内存里没有用户，但 Storage 里还留着上一轮的 token ——
 * 不恢复就判断不出是否已登录，提交时只能干等一次 401。
 *
 * 草稿也在这一刻恢复：它跟登录无关，但它要在第一次渲染之前填进表单，
 * 否则用户会先看到一张空表单，再看到内容跳出来。
 */
onPageShow(() => {
  void session.restore();
  if (!restored) {
    restored = true;
    restoreDraft();
  }
});
</script>

<style lang="scss" scoped>
@use '@/styles/shared/spot-form.scss';
</style>
