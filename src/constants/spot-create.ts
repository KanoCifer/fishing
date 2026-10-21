/**
 * 新建钓点页的文案与选项 —— 唯一出处。
 *
 * 放这里而不是散在模板里，是因为这一页几乎全是文字：字段标签、占位提示、
 * 选项清单。文字是最容易出分歧的部分（产品要改一句提示、运营要调一项选项），
 * 混在 class 名中间翻，改文案就得先读版式。集中之后改文案不动版式。
 */

/**
 * 适合的钓法 —— 表单里可以多选的那几档。
 *
 * 存的是**中文字面量**，不是代码：后端不校验这个字段（`[]string` 原样收下），
 * 详情页（SpotDetailInfo）也是原样 join 出来给人看的。
 * 存代码的话，详情页就得再多一次查表，而那次查表没有别的收益。
 */
export const SPOT_SUITABLE_OPTIONS: readonly string[] = ['路亚', '手竿', '夜钓', '矶钓', '海钓', '新手友好'];

/** 页面标题 */
export const SPOT_CREATE_TITLE = '新建钓点';

/**
 * 表单各字段的标签与占位。
 *
 * 标签是「这一栏要填什么」，占位是「大概要填成什么样」——
 * 两者不是一回事，所以分开写，不合成一张表。
 */
export const SPOT_CREATE_FIELDS = {
  location: {
    label: '位置',
    /** 还没选点时占位的那一行 */
    empty: '点这里选个地方',
  },
  name: {
    label: '名称',
    placeholder: '给这个钓点起个名字',
  },
  kind: {
    label: '水体类型',
    /** 点过提交还没选时说的 */
    error: '选一个水体类型',
  },
  description: {
    label: '简介',
    placeholder: '说说这里怎么钓、有什么讲究',
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

/**
 * 引子 —— 页面开头那一段话。
 *
 * 说清两件事：这一页要干什么、哪几样是必填的。
 * 必填在每一组标题旁边还会再标一次，两处不冲突：
 * 这里是解释，标的是提醒。
 */
export const SPOT_CREATE_LEDE = {
  title: '新建钓点',
} as const;

/** 分组标题 */
export const SPOT_CREATE_GROUPS = {
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
export const SPOT_CREATE_MISSING = {
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
 * 草稿。
 *
 * 草稿条只在**恢复出来**的时候出现：用户得知道这些内容是他上次写的，
 * 而不是这一页自己冒出来的。挂上之后也给一个「丢弃」——
 * 别人替他填的、或者上次填错了的，得能扔掉重来。
 */
export const SPOT_CREATE_DRAFT = {
  restored: '已恢复上次的草稿',
  /** 草稿条第二行。「保存于 10-21 20:15」 */
  savedAt: (time: string) => `保存于 ${time}`,
  /** 丢掉草稿 */
  discard: '丢弃',
  /** 确认丢掉 */
  discardTitle: '丢弃草稿？',
  /** 确认丢掉时说的。丢的是用户自己写的东西，收不回来 */
  discardContent: '上次没写完的内容会清掉，而且找不回来。',
  discardConfirm: '丢弃',
  discardCancel: '留着',
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

/** 提交按钮 */
export const SPOT_CREATE_SUBMIT = '提交审核';

/** 提交中。按钮锁住时显示它 */
export const SPOT_CREATE_SUBMITTING = '提交中…';

/**
 * 提交成功后的提示。
 *
 * 说的是「等待审核」而不是「已添加」—— 后端把普通用户的投稿置为 pending，
 * 公开列表只放已过审的条目，它不会立刻出现在地图上。
 * 说「已添加」会让用户回头找不到自己刚建的那条。
 */
export const SPOT_CREATE_SUBMITTED = '已提交，等待审核';

/** 提交成功后落点提示 */
export const SPOT_CREATE_SUBMITTED_HINT = '审核通过后会出现在地图上';

/** 选点失败时的说法 */
export const SPOT_CREATE_PICK_FAILED = '选点失败，请重试';
