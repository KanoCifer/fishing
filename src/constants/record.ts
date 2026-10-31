/**
 * 钓鱼日志的文案与选项 —— 唯一出处。
 *
 * 钓法集合与鱼种候选都定在这里，页面和组件都从这里取：
 * 同一份集合在两个页面各写一遍，迟早会出现「新建页写着台钓、详情页写着架竿」
 * 这种对不上的情况。
 */

import { ENV } from '@/config/env';

import { FISH_IMAGES } from './fish-images';

/** 页面标题（日历页与详情页共用） */
export const RECORD_TITLE = '钓鱼记录';

/**
 * 钓法选项。
 *
 * 多选：打路亚也用手竿，这两件事不互斥。
 * 「其他」给自定义 —— 但自定义文本不进这个集合（那是另一份数据），
 * 集合只管预设项。
 */
export const RECORD_METHODS: readonly string[] = ['路亚', '手竿', '台钓', '筏钓', '矶钓', '海钓', '其他'];

/** 钓法选择器里「自定义」那一项的标签 */
export const RECORD_METHOD_CUSTOM = '自定义钓法';

/**
 * 常用鱼种候选。
 *
 * 直接取自 `constants/fish-images.ts` 那份鱼种清单的中文名 ——
 * 那是鱼种名称的唯一出处（由 `scripts/gen-fish-images.py` 生成）。
 * 这里不再抄一份：抄了以后改了脚本里的名字，候选就成了一份陈旧的副本。
 *
 * 只有名字，没有图 —— 记录页要的是「快选」，不是图鉴。
 */
export const RECORD_SPECIES_SUGGESTIONS: readonly string[] = Object.values(FISH_IMAGES).map((item) => item.name);

/* ── 统计面板 ───────────────────────────────────────────────────────────── */

export const RECORD_STATS = {
  /**
   * 打过卡的天数。
   *
   * 标签只留词，不留「天数」：主角那一行（当前连续）已经带着单位，
   * 这里再写一遍只会把这一行挤窄。
   */
  checkin: '打卡',
  /** 钓到鱼的天数 */
  catch: '渔获',
  /** 当前连续。全称保留 —— 它是这一块的主角，标签要说清是什么 */
  currentStreak: '当前连续',
  /** 最长连续 */
  longest: '最长',
} as const;

/** 连续天数的单位。数字与单位分开拼，是为了让数字大一号 */
export const RECORD_DAY_UNIT = '天';

/* ── 日历页 ─────────────────────────────────────────────────────────────── */

export const RECORD_CALENDAR = {
  /** 上个月 */
  prevMonth: '上个月',
  /** 下个月 */
  nextMonth: '下个月',
  /** 翻到下个月时提示 */
  noFutureMonth: '还没到下个月',
  /** 星期标题，从周一开始 */
  weekdays: ['一', '二', '三', '四', '五', '六', '日'],
  /** 选中的那天没有记录时的空态 */
  emptyTitle: '这天还没有记录',
  /** 选中的就是今天时的提示 */
  emptyToday: '记一笔，今天就算来过了',
  /** 选中的是过去某天时的提示 —— 补不上了 */
  emptyPast: '只支持记录当天，这里补不了',
  /** 统计里的单位 */
} as const;

/** 日历页顶部的「记一笔」按钮 */
export const RECORD_CREATE_ENTRY = '记一笔';

/** 某天的记录数（列表标题右侧） */
export const RECORD_DAY_COUNT = (count: number): string => `${count} 条`;

/** 打卡那天的标记 */
export const RECORD_CHECKIN_TAG = '打卡';

/* ── 记录页（卡历） ──────────────────────────────────────────────────────── */

export const RECORD_HERO = {
  /** 这个月一条记录都没有时，头图上那一句话 */
  emptyMonth: '这个月还没有记录',
} as const;

/**
 * 空态插画。
 *
 * 与钓点详情那张占位图是同一张（`spots.jpg`）：一张浅色的 1:1 插画，
 * 画的是「相机 + 鱼 + 水」，说的是「这里还没有东西」。
 *
 * 走 CDN 不进代码包 —— 主包上限 2MB，而这张图只有空态才用得上。
 * CDN 域名要在微信后台配成 downloadFile 合法域名，否则 `<image>` 拉不到图
 * （不报错，只是空一块）。
 */
export const RECORD_EMPTY_IMAGE = `${ENV.cdnBaseUrl}/spots.jpg`;

/**
 * 没记地点时的兜底。
 *
 * 头图与行程卡共用一个说法 —— 两处各写一遍的话，改了一处就有一处对不上。
 */
export const RECORD_NO_PLACE = '没记地点';

export const RECORD_TRIPS = {
  /** 分区标题 */
  title: '往期行程',
  /** 分区副标 */
  hint: '横滑看更多',
  /** 只打了卡，没钓到鱼 */
  checkinOnly: '只打卡',
} as const;

/**
 * 日历格子的两档颜色各是什么。
 *
 * 深浅两档底色读得出「钓到鱼」和「只打卡」的分别，
 * 但不解释的话读者得自己猜 —— 猜错一次就会以为深的那档是「去得更多」。
 */
export const RECORD_CALENDAR_LEGEND = {
  /** 深蓝那档 */
  catch: '钓到鱼',
  /** 浅灰那档 */
  checkin: '只打卡',
} as const;

/* ── 新建页 ─────────────────────────────────────────────────────────────── */

export const RECORD_CREATE = {
  /** 页面标题 */
  title: '记一笔',
  /** 主按钮 */
  save: '保存记录',
  /** 提交中 */
  saving: '保存中…',
  /** 次要按钮 */
  checkinOnly: '仅打卡',
  /**
   * 渔获卡标题。
   *
   * 渔获是这一页的主角，它的标题是卡里的标题（headline），
   * 不是分区的眉标（caption）—— 层级差一档，措辞也跟着差一档。
   */
  catchCardTitle: '钓到了什么',
  /** 渔获条数 */
  catchCount: (count: number): string => `${count} 条`,
  /** 渔获区空态 */
  catchEmpty: '还没记渔获',
  /** 渔获区空态的提示 */
  catchEmptyHint: '下面加一条，或者只打卡',
  /** 加一条渔获 */
  addCatch: '加一条',
  /** 鱼种输入框占位 */
  speciesPlaceholder: '鱼种，如 鲫鱼',
  /** 数量输入框占位 */
  quantityPlaceholder: '数量',
  /** 钓法区标题 */
  methodTitle: '钓法',
  /** 情境行里还没选钓法时的提示 */
  methodsHint: '加钓法',
  /** 自定义钓法占位 */
  customMethodPlaceholder: '自定义钓法，如 矶钓',
  /** 图片区标题 */
  imageTitle: '照片',
  /** 备注标题 */
  remarkTitle: '备注',
  /** 备注占位 */
  remarkPlaceholder: '饵料、水情、意外收获…',
  /** 地点占位。地点是选出来的，不是打出来的 */
  locationPlaceholder: '选择钓鱼地点',
  /** 选点失败 */
  locationPickFailed: '选点失败，请重试',
  /** 天气标题 */
  weatherTitle: '当时的天气',
  /** 天气卡的副标：说明这五个读数从哪来 */
  weatherAuto: '自动带入 · 可改',
  /** 没取到天气时的那句话 */
  weatherEmpty: '还没取到天气，这条记录会没有天气',
  /** 取天气 */
  weatherFetch: '取当前天气',
  /** 改天气 */
  weatherEdit: '修改',
  /** 改完天气 */
  weatherDone: '完成',
  /** 主按钮提交前提示：渔获一条都没填 */
  noCatchToast: '还没记渔获，或者只打卡',
  /** 保存成功的提示 */
  savedToast: '记好了',
} as const;

/* ── 详情页 ─────────────────────────────────────────────────────────────── */

export const RECORD_DETAIL = {
  /** 删除按钮 */
  remove: '删除',
  /** 删除确认 */
  removeConfirm: '删掉这条记录？',
  /** 删除确认的说明 */
  removeConfirmHint: '照片会留在服务器上，但这条记录没了',
  /** 确认删除 */
  removeConfirmAction: '删除',
  /** 取消 */
  cancel: '取消',
  /** 删除成功的提示 */
  removedToast: '删掉了',
  /** 这天没有渔获时的说明 */
  noCatch: '这天没有渔获',
} as const;

/** 未登录时的空态 */
export const RECORD_LOGIN_REQUIRED = {
  title: '登录后记录你的钓鱼',
  hint: '记录会绑定你的账号，只你自己能看到',
  action: '去登录',
} as const;
