<template>
  <!--
    钓点纠错反馈表单 —— 类型、条件修正值、说明、配图。

    它只管**渲染与交互**：取数在页面，提交也在页面。
    组件自己攒出一份 payload 抛给页面，页面拿去发接口。

    为什么表单自己管状态而不是受控：跟 SpotImagePicker 同一个理由 ——
    几张照片同时传完，谁先 emit 谁后 emit 说不准；
    受控写法里每个回调都读 props，而 props 要等下一轮渲染才更新，
    于是后完成的那张会把先完成的那张盖掉。
  -->
  <view class="feedback-form">
    <!-- 问题类型 -->
    <view class="sect">
      <view class="sect__head" :style="{ animationDelay: enterDelay(0) }">
        <text class="sect__title">{{ groups.type }}</text>
      </view>

      <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(0) }">
        <FormField :label="fields.type.label" required>
          <ChoiceChips :options="typeOptions" :selected="type" @change="onTypeChange" />
          <text v-if="typeError" class="spot-form__error">{{ errors.typeRequired }}</text>
        </FormField>
      </view>
    </view>

    <!-- 说明 -->
    <view class="sect">
      <view class="sect__head" :style="{ animationDelay: enterDelay(1) }">
        <text class="sect__title">{{ groups.about }}</text>
        <text class="sect__meta">{{ groups.required }}</text>
      </view>

      <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(1) }">
        <FormField :label="fields.description.label" required>
          <textarea
            v-model="description"
            class="spot-form__textarea"
            :placeholder="fields.description.placeholder"
            placeholder-class="fish-placeholder"
            :maxlength="descriptionMax"
            auto-height
          />
          <text class="feedback-form__counter">{{ descriptionCount }}/{{ descriptionMax }}</text>
          <text v-if="descriptionError" class="spot-form__error">{{ descriptionError }}</text>
        </FormField>
      </view>
    </view>

    <!--
      修正值。按类型各问各的：
      问一个跟这条反馈无关的字段，用户填了也是白填 ——
      后端只认对应类型的那一个字段，其余一律 400。
    -->
    <view v-if="type === 'fee_wrong'" class="sect">
      <view class="sect__head" :style="{ animationDelay: enterDelay(2) }">
        <text class="sect__title">{{ groups.corrected }}</text>
        <text class="sect__meta">{{ groups.required }}</text>
      </view>

      <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(2) }">
        <FormField :label="fields.fee.label" required>
          <ChoiceChips :options="feeOptions" :selected="feeType" @change="onFeeChange" />
          <text v-if="feeTypeError" class="spot-form__error">{{ errors.feeRequired }}</text>
        </FormField>

        <!-- 金额只在收费时才有意义，平时那一栏是多余的噪声 -->
        <FormRow v-if="feeType === 'paid'" :label="fields.feeAmount.label" required>
          <input
            v-model="feeAmount"
            class="spot-form__input spot-form__input--inline"
            :placeholder="fields.feeAmount.placeholder"
            placeholder-class="fish-placeholder"
            inputmode="decimal"
          />
          <text class="spot-form__unit">{{ fields.feeAmount.unit }}</text>
        </FormRow>

        <!-- 金额那一栏的错话。贴在它下面 -->
        <view v-if="feeAmountError" class="feedback-form__error-block">
          <text class="spot-form__error">{{ feeAmountError }}</text>
        </view>
      </view>
    </view>

    <view v-if="type === 'location_wrong'" class="sect">
      <view class="sect__head" :style="{ animationDelay: enterDelay(2) }">
        <text class="sect__title">{{ groups.corrected }}</text>
        <text class="sect__meta">{{ groups.optional }}</text>
      </view>

      <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(2) }">
        <!--
          选点。

          走微信自带的选点地图：搜索、定位、路网都在，
          用户在自己认得的地方点一下，比我们再画一张地图选得准。
        -->
        <FormRow
          :label="fields.location.label"
          :value="locationName"
          :sub="locationAddress"
          chevron
          @select="pickLocation"
        />

        <text class="feedback-form__hint">{{ fields.location.hint }}</text>
      </view>
    </view>

    <view v-if="type === 'info_stale'" class="sect">
      <view class="sect__head" :style="{ animationDelay: enterDelay(2) }">
        <text class="sect__title">{{ groups.corrected }}</text>
        <text class="sect__meta">{{ groups.optional }}</text>
      </view>

      <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(2) }">
        <FormRow :label="fields.correctedName.label">
          <input
            v-model="correctedName"
            class="spot-form__input spot-form__input--inline"
            :placeholder="fields.correctedName.placeholder"
            placeholder-class="fish-placeholder"
            :maxlength="correctedNameMax"
          />
        </FormRow>
      </view>
    </view>

    <!-- 配图 -->
    <view class="sect">
      <view class="sect__head" :style="{ animationDelay: enterDelay(3) }">
        <text class="sect__title">{{ groups.photos }}</text>
        <text class="sect__meta">{{ fields.photos.hint }}</text>
      </view>

      <view class="sect__card spot-form__group" :style="{ animationDelay: enterDelay(3) }">
        <FormField :label="fields.photos.label" :hint="photosHint">
          <SpotImagePicker :max="imageMax" type="feedback" @change="onImagesChange" @uploading="onUploadingChange" />
        </FormField>
      </view>
    </view>

    <!--
      提交条常驻底部。
      表单有五栏，滚到底才找得到按钮等于没有 —— 按钮得一直在手边。
    -->
    <view class="spot-form__submit">
      <view class="spot-form__submit-row">
        <text class="spot-form__submit-note">{{ submitNote }}</text>
        <view class="spot-form__submit-btn" :class="{ 'spot-form__submit-btn--disabled': disabled }" @tap="submit">
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
 * SpotFeedbackForm —— 钓点纠错反馈的表单。
 *
 * 只管渲染与交互：自己攒状态、自己校验，攒好了抛一个 `submit` 事件。
 * 取数（这条钓点现在写的是什么）与提交（发接口、toast、返回）都在页面那一层。
 */
import { computed, ref } from 'vue';

import ChoiceChips from '@/components/ChoiceChips/ChoiceChips.vue';
import FormField from '@/components/FormField/FormField.vue';
import FormRow from '@/components/FormRow/FormRow.vue';
import SpotImagePicker from '@/components/SpotImagePicker/SpotImagePicker.vue';
import {
  SPOT_FEEDBACK_DESCRIPTION,
  SPOT_FEEDBACK_ERRORS,
  SPOT_FEEDBACK_FEE_OPTIONS,
  SPOT_FEEDBACK_FIELDS,
  SPOT_FEEDBACK_GROUPS,
  SPOT_FEEDBACK_IMAGE_MAX,
  SPOT_FEEDBACK_SUBMIT,
  SPOT_FEEDBACK_SUBMITTING,
  SPOT_FEEDBACK_TYPE_OPTIONS,
} from '@/constants/spot-feedback';
import { SPOT_PHOTO_UPLOADING_BLOCK } from '@/constants/spot-form';
import type { FishingSpotFeeType, FishingSpotFeedbackPayload, FishingSpotFeedbackType } from '@/types/fishing';
import { enterDelay } from '@/utils/motion';

const props = withDefaults(
  defineProps<{
    /** 正在提交。锁住按钮，防连点发两次 */
    submitting?: boolean;
  }>(),
  {
    submitting: false,
  },
);

const emit = defineEmits<{
  /** 校验通过。抛出去的是一份可以直接发接口的载荷 */
  submit: [payload: FishingSpotFeedbackPayload];
}>();

const fields = SPOT_FEEDBACK_FIELDS;
const errors = SPOT_FEEDBACK_ERRORS;
const typeOptions = SPOT_FEEDBACK_TYPE_OPTIONS;
const feeOptions = SPOT_FEEDBACK_FEE_OPTIONS;
const submitText = SPOT_FEEDBACK_SUBMIT;
const submittingText = SPOT_FEEDBACK_SUBMITTING;
const imageMax = SPOT_FEEDBACK_IMAGE_MAX;
const descriptionMax = SPOT_FEEDBACK_DESCRIPTION.max;

/** 建议的新名称最多几个字。跟后端的 max=100 对齐 */
const correctedNameMax = 100;

/** 分组标题 */
const groups = SPOT_FEEDBACK_GROUPS;

/* ── 表单状态 ──────────────────────────────────────────────────────────── */

/** 反馈类型。空串 = 还没选 */
const type = ref<FishingSpotFeedbackType | ''>('');

/** 说明 */
const description = ref('');

/**
 * 已上传的配图。存的是**服务端相对路径**，不是能直接显示的地址 ——
 * 显示那一层由 mediaUrl() 负责（见 api/upload）。
 */
const images = ref<string[]>([]);

/**
 * 有没有配图正在传。
 *
 * 没传完就提交，那几张图会静默丢掉 —— 提交那一刻它们还没有服务端地址，
 * 但用户明明在界面上看见了它们。传完才让提交。
 */
const uploading = ref(false);

/** 现在的收费情况。空串 = 还没选 */
const feeType = ref('');

/** 收费金额。留空串，没填就是没填 */
const feeAmount = ref('');

/** 建议的新名称 */
const correctedName = ref('');

/** 选好的新位置。null = 还没选 */
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

/**
 * 点过提交没有。
 *
 * 没点过就不摆错误提示 —— 一进页面就红一片，用户会以为表单坏了，
 * 而不是以为自己漏了什么。
 */
const validated = ref(false);

/* ── 派生 ──────────────────────────────────────────────────────────────── */

/**
 * 说明的字数。
 *
 * 按字符数算（中文一个字算一个），不是 UTF-16 码元 ——
 * 后端数的是 rune，前端也数 rune，两边才是一回事。
 */
const descriptionCount = computed(() => [...description.value.trim()].length);

/** 类型没选时的错话 */
const typeError = computed(() => validated.value && !type.value);

/** 说明的错话 */
const descriptionError = computed(() => {
  if (!validated.value) return '';
  const count = descriptionCount.value;
  if (count < SPOT_FEEDBACK_DESCRIPTION.min) return errors.descriptionTooShort;
  if (count > SPOT_FEEDBACK_DESCRIPTION.max) return errors.descriptionTooLong;
  return '';
});

/** 收费方式没选时的错话 */
const feeTypeError = computed(() => validated.value && type.value === 'fee_wrong' && !feeType.value);

/** 金额的错话 */
const feeAmountError = computed(() => {
  if (!validated.value) return '';
  if (type.value !== 'fee_wrong' || feeType.value !== 'paid') return '';
  const amount = Number(feeAmount.value);
  if (!feeAmount.value.trim()) return errors.feeAmountRequired;
  if (!Number.isFinite(amount) || amount < 0) return errors.feeAmountInvalid;
  return '';
});

/** 位置那一行显示的地名 */
const locationName = computed(() => (location.value ? location.value.name : fields.location.empty));

/** 位置那一行显示的地址 */
const locationAddress = computed(() => (location.value ? location.value.address : ''));

/** 配图那一栏的补充说明 */
const photosHint = computed(() => fields.photos.maxHint(imageMax));

/** 提交条左边那一行 */
const submitNote = computed(() => (uploading.value ? SPOT_PHOTO_UPLOADING_BLOCK : ''));

/** 按钮按不按得住 */
const disabled = computed(() => props.submitting || uploading.value);

/* ── 选项回调 ──────────────────────────────────────────────────────────── */

function onTypeChange(value: string | string[]) {
  type.value = (Array.isArray(value) ? '' : value) as FishingSpotFeedbackType | '';
}

function onFeeChange(value: string | string[]) {
  feeType.value = Array.isArray(value) ? '' : value;
  // 从收费切回免费/不清楚时，金额要跟着走 ——
  // 留着上一个金额，提交出去就是「免费，但收费 30 元」，后端直接拒。
  if (feeType.value !== 'paid') feeAmount.value = '';
}

/** 配图列表变了 */
function onImagesChange(value: string[]) {
  images.value = value;
}

/** 有没有配图在传 */
function onUploadingChange(value: boolean) {
  uploading.value = value;
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
      uni.showToast({ title: errors.pickFailed, icon: 'none' });
    },
  });
}

/* ── 校验与提交 ────────────────────────────────────────────────────────── */

/**
 * 校验。
 *
 * 规则与后端 service 层一致（说明 5–500 字；收费变更必须给收费方式，
 * 收费就得给金额；新坐标要么都给要么都不给）。
 * 前端先拦一道，是为了少一次往返，也是为了把错话说在字段旁边。
 */
function validate(): boolean {
  let ok = true;

  if (!type.value) ok = false;

  const count = descriptionCount.value;
  if (count < SPOT_FEEDBACK_DESCRIPTION.min || count > SPOT_FEEDBACK_DESCRIPTION.max) ok = false;

  if (type.value === 'fee_wrong') {
    if (!feeType.value) {
      ok = false;
    } else if (feeType.value === 'paid') {
      const amount = Number(feeAmount.value);
      if (!feeAmount.value.trim() || !Number.isFinite(amount) || amount < 0) ok = false;
    }
  }

  return ok;
}

/**
 * 攒一份载荷。
 *
 * **只写当前类型该有的修正值** —— 后端会拒掉「类型是位置不对却填了收费金额」
 * 这种组合，所以别的类型的字段一个都不带。
 */
function buildPayload(): FishingSpotFeedbackPayload {
  const payload: FishingSpotFeedbackPayload = {
    type: type.value as FishingSpotFeedbackType,
    description: description.value.trim(),
    images: images.value,
  };

  if (type.value === 'fee_wrong') {
    payload.corrected_fee_type = feeType.value as FishingSpotFeeType;
    if (feeType.value === 'paid') {
      const amount = Number(feeAmount.value);
      payload.corrected_fee_amount = Number.isFinite(amount) ? amount : null;
    }
  } else if (type.value === 'location_wrong' && location.value) {
    // 经度在前
    payload.corrected_longitude = location.value.lng;
    payload.corrected_latitude = location.value.lat;
  } else if (type.value === 'info_stale') {
    const name = correctedName.value.trim();
    if (name) payload.corrected_name = name;
  }

  return payload;
}

/** 点提交 */
function submit() {
  if (props.submitting) return;

  validated.value = true;

  // 图没传完就提交，那几张会静默丢掉 —— 用户在界面上明明看见了它们
  if (uploading.value) {
    uni.showToast({ title: SPOT_PHOTO_UPLOADING_BLOCK, icon: 'none' });
    return;
  }

  if (!validate()) return;

  emit('submit', buildPayload());
}
</script>

<style lang="scss" scoped>
@use '@/styles/shared/spot-form.scss';

/*
 * 字数计数。
 *
 * 贴在输入框右下角：它回答的是「还能写多少」，
 * 放在字段标签旁边就变成另一条要读的信息了。
 */
.feedback-form__counter {
  display: block;
  margin-top: 12rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);

  text-align: right;
}

/*
 * 选点那一栏底下的补充说明。
 *
 * 说「新坐标是选填的」—— 不说的话，用户会以为不选就提交不了，
 * 而「我也不知道具体在哪」也是一条有效的反馈。
 */
.feedback-form__hint {
  display: block;
  padding: 0 28rpx 24rpx;
  color: $fish-muted-60;
  @include fish-type(caption2);
}

/*
 * 错话的外框。
 *
 * 左边补上 28rpx —— 错话要跟它上面那一栏的标签对齐，
 * 而标签的缩进是行自己的内边距给的。
 */
.feedback-form__error-block {
  padding: 0 28rpx 24rpx;
}
</style>
