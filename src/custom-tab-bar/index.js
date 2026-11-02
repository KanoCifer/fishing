/**
 * 自定义 tabBar —— 原生小程序组件。
 *
 * ⚠️ 这个目录不经 uni-app 编译：uni-app 把它原样拷到小程序代码根目录，
 * 所以这里只能写原生小程序语法（不能写 TS，不能用 uni.* 的 API）。
 *
 * 选中态的真值在哪
 * ----------------
 *
 * 微信给每个 tab 页各建一个本组件实例（官方文档：「每个 tab 页下的自定义
 * tabBar 组件实例是不同的」），实例之间不共享 data。所以「当前选中哪一格」
 * 这份真值放在模块作用域里 —— 所有实例读同一份。
 *
 * 真值怎么更新
 * ------------
 *
 * 1. 点底栏（onTap）：目标页签是已知的，直接写。**主路径** —— 不依赖任何
 *    时序，点完立刻就是对的。
 *
 * 2. 路由反推：页面栈最后一项就是当前页，由它反推页签。用来兜住「不是点
 *    底栏进来的」那类切换（子页里 uni.switchTab 回某个 tab 页）。
 *
 * 为什么不能只靠路由反推：切 tab 时新页面的组件实例创建（attached）早于
 * 页面栈更新，此刻读到的还是上一个 tab 页 —— 表现就是「点了另一格，高亮还
 * 留在原来那格」。所以路由反推只作兜底，点底栏时一律以点击为准。
 *
 * 兜底怎么做到可靠：模块里跑一个定时器，比对当前路由有没有变。路由一变
 * 就是真发生了一次页面切换，这时反推出来的页签必然是对的。小程序没有全局
 * 的路由变化钩子，只能这样轮询；间隔 200ms，代价是一次 getCurrentPages()
 * 加一次字符串比较。
 */

var LIST = [
  {
    key: 'data',
    type: 'tab',
    text: '天气',
    path: '/pages/data/index',
    icon: '/static/tabbar/data.png',
    activeIcon: '/static/tabbar/data-active.png',
  },
  {
    key: 'spots',
    type: 'tab',
    text: '钓点',
    path: '/pages/fishing/index',
    icon: '/static/tabbar/spots.png',
    activeIcon: '/static/tabbar/spots-active.png',
  },
  {
    key: 'feedback',
    type: 'action',
    text: '',
    icon: '/static/tabbar/plus.png',
  },
  {
    key: 'records',
    type: 'tab',
    text: '记录',
    path: '/pages/records/index',
    icon: '/static/tabbar/records.png',
    activeIcon: '/static/tabbar/records-active.png',
  },
  {
    key: 'mine',
    type: 'tab',
    text: '我的',
    path: '/pages/mine/index',
    icon: '/static/tabbar/mine.png',
    activeIcon: '/static/tabbar/mine-active.png',
  },
];

/** 当前选中的页签 key。模块级 —— 所有实例共享同一份真值 */
var selectedKey = null;

/** 上一次看到的当前路由。变了 = 真的发生了一次页面切换 */
var lastRoute = '';

/** 所有活着的实例。点击时统一刷新，缓存页的实例不必等 show 事件 */
var instances = [];

/** 兜底轮询的间隔（ms） */
var RECONCILE_INTERVAL = 200;

/**
 * 当前页面路由。
 *
 * 形如 pages/data/index（不带前导斜杠），与表里的 path 比时补上。
 */
function currentRoute() {
  var pages = getCurrentPages();
  if (!pages || !pages.length) return '';

  var page = pages[pages.length - 1];
  return page && page.route ? page.route : '';
}

/**
 * 按路由反推选中的页签。非 tab 页返回 null —— 那时不该动选中态
 * （从 tab 页进子页，选中态要留在原处）。
 */
function keyByRoute(route) {
  for (var i = 0; i < LIST.length; i++) {
    if (LIST[i].type === 'tab' && LIST[i].path.slice(1) === route) {
      return LIST[i].key;
    }
  }
  return null;
}

/** 把选中态刷到一个实例上 */
function render(instance, key) {
  if (!instance || instance.data.selectedKey === key) return;
  instance.setData({ selectedKey: key });
}

/** 把选中态刷到所有实例 */
function renderAll(key) {
  for (var i = 0; i < instances.length; i++) {
    render(instances[i], key);
  }
}

/**
 * 兜底：路由变了就按新路由重算选中态。
 *
 * 只在路由真的变了时才动手 —— 路由没变说明还在原页，此时任何反推都没有
 * 新信息，硬套反而会把刚点出来的选中态打回旧值。
 */
function reconcile() {
  var route = currentRoute();
  if (!route || route === lastRoute) return;

  lastRoute = route;

  var key = keyByRoute(route);
  if (!key || key === selectedKey) return;

  selectedKey = key;
  renderAll(selectedKey);
}

/** 兜底轮询。只在有实例活着时跑 */
var timer = null;

function startReconcile() {
  if (timer) return;

  lastRoute = currentRoute();
  timer = setInterval(reconcile, RECONCILE_INTERVAL);
}

function stopReconcile() {
  if (!timer) return;

  clearInterval(timer);
  timer = null;
}

Component({
  data: {
    list: LIST,
    /** 选中的页签 key。null = 还没选中（冷启动先别亮一格错的） */
    selectedKey: null,
  },

  lifetimes: {
    attached: function () {
      instances.push(this);
      startReconcile();

      /*
       * 冷启动：没有点击可依据，按当前路由推断 —— 此时页面栈已经稳定。
       * 之后点过底栏就一律以点击为准，不再被路由反推覆盖。
       */
      if (selectedKey === null) {
        selectedKey = keyByRoute(currentRoute());
      }
      render(this, selectedKey);
    },

    detached: function () {
      var i = instances.indexOf(this);
      if (i >= 0) {
        instances.splice(i, 1);
      }

      if (!instances.length) {
        stopReconcile();
      }
    },
  },

  /**
   * 页面显示。
   *
   * 切回一个缓存过的 tab 页时页面栈已经是最新的，这里读到的路由就是本页，
   * 用它纠正选中态。
   */
  pageLifetimes: {
    show: function () {
      var route = currentRoute();
      lastRoute = route;

      var key = keyByRoute(route);
      if (key) {
        selectedKey = key;
      }
      renderAll(selectedKey);
    },
  },

  methods: {
    onTap: function (e) {
      var key = e.currentTarget.dataset.key;
      var item = null;

      for (var i = 0; i < LIST.length; i++) {
        if (LIST[i].key === key) {
          item = LIST[i];
          break;
        }
      }
      if (!item) return;

      if (item.type === 'action') {
        wx.navigateTo({ url: '/pages/record/create/index' });
        return;
      }

      /*
       * 先切高亮再跳页：跳转有动画，先亮起来才不会有「点了没反应」的停顿。
       * 所有实例一起刷 —— 目标页若是缓存页，它的实例不会重新 attached，
       * 只能靠这一次把选中态带过去。
       */
      selectedKey = key;
      renderAll(selectedKey);

      var route = currentRoute();
      if (route === item.path.slice(1)) return;

      wx.switchTab({ url: item.path });
    },
  },
});
