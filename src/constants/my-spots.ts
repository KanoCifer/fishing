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
 * 只剩行标题，没有分区眉标 —— 与 ABOUT_ENTRY 同一套写法（两个入口页长得一样）。
 * 「我的」页现在只有「我的钓点」与「关于渔碌」两个入口，合成一组放，
 * 不再各配一个章节标题（见 src/pages/mine/index.vue 的说明）。
 */
export const MY_SPOTS_ENTRY = {
  /** 行标题 */
  label: '我的钓点',
} as const;

/**
 * 「我的」页那一行右侧的数量。
 *
 * 数的是**我提交过的**，含还在审核与被驳回的 ——
 * 那一页要回答的是「我手上有几条」，不是「地图上公开着几条」。
 * 公开的那部分只有已过审的，在「我的钓点」页里另有一份清单。
 */
export const MY_SPOTS_COUNT = (count: number): string => `${count} 条`;

/**
 * 还在等审核的条数。
 *
 * 只数 pending。被驳回的那些要改完再交（见 MY_SPOTS_ACTIONS.resubmit），
 * 那是另一件事 —— 跟「还在等审核」混成一类，用户就不知道该等还是该改。
 */
export const MY_SPOTS_PENDING = (count: number): string => `${count} 条待审核`;

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

/**
 * 空态里那个按钮。
 *
 * 写「去投稿」而不是「去新建钓点」：跳过去的那一页叫「钓点投稿」，
 * 按钮说的话得跟目标页对得上。
 */
export const MY_SPOTS_EMPTY_ACTION = '去投稿';

/**
 * 没登录时的那一段。
 *
 * 与 MY_SPOTS_EMPTY 分开：没登录是「看不到」，没提交过是「没有」——
 * 拿「还没有提交过钓点」去说没登录，用户会以为自己白登录了，
 * 或者以为这账号下真的什么都没有。
 */
export const MY_SPOTS_LOGGED_OUT = {
  title: '登录后查看你的钓点',
  hint: '提交记录和审核状态都存在账号里',
} as const;

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

/**
 * 每条钓点下面的操作。
 *
 * 驳回的那条给「修改后重交」—— 它要连着理由一起看，理由就是改稿的说明，
 * 按钮得说的是「改完再交」而不只是「编辑」；别的状态给「编辑」，
 * 说「重交」会让人以为要重新排队。
 */
export const MY_SPOTS_ACTIONS = {
  /** 未通过：改完重新提交 */
  resubmit: '修改后重交',
  /** 其余状态：改一改 */
  edit: '编辑',
} as const;
