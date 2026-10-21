/**
 * 「我的钓点」页的文案 —— 唯一出处。
 *
 * 这一页回答的是「我提交的那些，现在怎么样了」。文案按**作者视角**写：
 * 状态是「待审核 / 已通过 / 未通过」，不是「pending / approved / rejected」，
 * 也不是「审核中 / 审核失败」—— 后者听起来像出了故障，而不是「还没轮到」。
 */

/** 页面标题 */
export const MY_SPOTS_TITLE = '我的钓点';

/**
 * 「我的」页通往「我的钓点」的那一行。
 *
 * 眉标只说这一段是什么（钓点），行标题说点进去是什么（我的钓点）。
 * 与 ABOUT_ENTRY 同一套写法 —— 两个入口页长得一样，排版也共用一套。
 */
export const MY_SPOTS_ENTRY = {
  /** 分区眉标 */
  section: '钓点',
  /** 行标题 */
  label: '我的钓点',
} as const;

/**
 * 列表为空时的那一段。
 *
 * 说的是「还没提交过」，而不是「暂无数据」—— 「暂无数据」是系统口吻，
 * 用户看到的是自己的操作记录，不是数据库的一个切片。
 */
export const MY_SPOTS_EMPTY = {
  title: '还没有提交过钓点',
  hint: '在地图上找到好地方，就把它记下来',
} as const;

/** 空态里那个按钮 */
export const MY_SPOTS_EMPTY_ACTION = '去新建钓点';

/** 列表顶部的说明 */
export const MY_SPOTS_HINT = '审核通过的钓点会出现在地图上';

/**
 * 审核状态对应的徽标色调。
 *
 * 这是**页面的**视图决定，不是数据：同一份状态在别的页面上可能用别的颜色。
 * 徽标的 tone 取值见 components/Chip 的 tone 联合类型。
 */
export const MY_SPOTS_STATUS_TONES = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'bad',
} as const;
