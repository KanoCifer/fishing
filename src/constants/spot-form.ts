/**
 * 钓点表单的文案与选项 —— 唯一出处。
 *
 * 这一份是**新建与编辑共用**的：两页填的是同一张表，字段标签、占位提示、
 * 选项清单、必填提示全都得是同一套字 —— 两处各写一份，改了标签忘了另一处，
 * 用户会发现「新建时叫简介，编辑时叫介绍」。
 *
 * 放这里而不是散在组件里，是因为表单几乎全是文字：文字是最容易出分歧的部分
 * （产品要改一句提示、运营要调一项选项），混在 class 名中间翻，改文案就得先读版式。
 * 集中之后改文案不动版式。
 */

/**
 * 适合的钓法 —— 表单里可以多选的那几档。
 *
 * 存的是**中文字面量**，不是代码：后端不校验这个字段（`[]string` 原样收下），
 * 详情页（SpotDetailInfo）也是原样 join 出来给人看的。
 * 存代码的话，详情页就得再多一次查表，而那次查表没有别的收益。
 */
export const SPOT_SUITABLE_OPTIONS: readonly string[] = ['路亚', '手竿', '夜钓', '矶钓', '海钓', '新手友好'];

/**
 * 表单各字段的标签与占位。
 *
 * 标签是「这一栏要填什么」，占位是「大概要填成什么样」——
 * 两者不是一回事，所以分开写，不合成一张表。
 */
export const SPOT_FORM_FIELDS = {
  location: {
    label: '位置',
    /** 还没选点时占位的那一行 */
    empty: '点这里选个地方',
  },
  name: {
    label: '名称',
    placeholder: '如：东湖芦苇荡',
  },
  kind: {
    label: '水体类型',
    /** 点过提交还没选时说的 */
    error: '选一个水体类型',
  },
  description: {
    label: '简介',
    placeholder: '如：清晨芦苇边能钓鲫鱼，水深 1.5 米',
  },
  fee: {
    label: '收费',
  },
  feeAmount: {
    label: '收费金额',
    placeholder: '如：30',
    unit: '元',
  },
  road: {
    label: '道路情况',
  },
  car: {
    label: '能否车到水边',
  },
  hours: {
    label: '开放时间',
    placeholder: '如：全天 / 06:00-18:00',
  },
  suitable: {
    label: '适合钓法',
    /** 这栏是可不填的，多选 */
    hint: '可多选',
  },
  photos: {
    label: '现场照片',
    /** 这栏是可不填的 */
    hint: '可不填',
  },
} as const;

/** 分组标题 */
export const SPOT_FORM_GROUPS = {
  required: '必填',
  about: '说说这里',
  reach: '怎么去',
  /** 不必填的那几组，标题右边标一句 */
  optional: '选填',
} as const;

/**
 * 「还差几项」的说法。
 *
 * 出现在两个地方：必填那一组标题的右边，和底栏提交条的左边。
 * 说的是同一件事，但语气不同 —— 组标题那边是「还差 1 项」，
 * 提交条那边是「还差 1 项必填」，因为那一条正挨着提交按钮，
 * 得说清缺的是必填项，不然用户以为页面出问题了。
 */
export const SPOT_FORM_MISSING = {
  /** 组标题右边 */
  count: (count: number) => `还差 ${count} 项`,
  /** 都填好了 */
  done: '都填好了',
  /** 提交条左边 */
  dock: (count: number) => `还差 ${count} 项必填`,
  /** 都填好了，提交条左边 */
  dockDone: '都填好了，可以提交',
  /**
   * 提交时兜底的那句。
   *
   * 一次把缺的几项都说完，而不是只报第一个 ——
   * 报一个、填完再报下一个，来回三趟。分组卡里还标着「还差 2 项」，
   * 提示只说一句，和界面上写的不一样，用户会以为漏看了。
   */
  toast: (labels: string[]) => `还差 ${labels.length} 项必填：${labels.join('、')}`,
} as const;

/**
 * 钓点照片最多几张。
 *
 * 定这个数是为了让「我的钓点」列表和详情页的头图排得下 ——
 * 详情页的照片条是横向滚动的，十几张就变成了纯浏览。
 */
export const SPOT_PHOTO_MAX = 6;

/** 上传中的那几格盖着的字 */
export const SPOT_PHOTO_UPLOADING = '上传中';

/**
 * 照片没传完就点提交时的提示。
 *
 * 与盖在格子上的「上传中」区分开：那一处说的是「这一张在传」，
 * 这一处说的是「整个提交被拦住了」，两件事。
 */
export const SPOT_PHOTO_UPLOADING_BLOCK = '照片还在上传，请稍候';

/** 选图失败时的说法 */
export const SPOT_PHOTO_PICK_FAILED = '选图失败，请重试';

/** 选点失败时的说法 */
export const SPOT_FORM_PICK_FAILED = '选点失败，请重试';
