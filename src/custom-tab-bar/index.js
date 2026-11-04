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

/**
 * 导航中标记。
 *
 * 连点底栏会把 wx.switchTab 调多次，多个并发的 switchTab 会互相打断
 * 页面栈，导致卡住或崩溃。所以发导航请求时上锁，请求回来
 * 才解锁。
 *
 * 解锁时机分两种：成功要等一段（转场动画走完才允许下一次点击），失败
 * 立即放。
 *
 * 锁放在模块作用域而不是组件 data：各 tab 页的实例互相独立，但共用这份
 * 模块状态 —— 页面切换过程中新旧实例同时存在，需要它们看到同一个锁。
 */
var navigating = false;

/**
 * 导航成功后到允许下一次点击的等待时长（ms）。
 *
 * switchTab 的 success 回调在切换动作发起时就回来了，那一刻转场动画还没
 * 走完 —— 马上放开锁，连点仍能打断动画。所以在 success 里不解锁，等这
 * 段时间过去再放。
 */
var NAV_UNLOCK_DELAY = 1000;

/**
 * 兜底：回调彻底不来的最坏锁定时长（ms）。
 *
 * 成功走 NAV_UNLOCK_DELAY，失败立即解锁，但万一两个回调都丢了，没有
 * 兜底就会把底栏永久锁死 —— 那比多调一次 switchTab 更糟。
 */
var NAV_FALLBACK_TIMEOUT = 3000;

/** 成功后的延迟解锁定时器 */
var navUnlockTimer = null;

/** 兜底解锁定时器 */
var navFallbackTimer = null;

/** 上锁 */
function lockNavigation() {
  navigating = true;

  if (navFallbackTimer) {
    clearTimeout(navFallbackTimer);
  }
  navFallbackTimer = setTimeout(function () {
    navFallbackTimer = null;
    navigating = false;
  }, NAV_FALLBACK_TIMEOUT);
}

/**
 * 解锁。
 *
 * delay 为 0 立即放开；给正数则等这么久再放开 —— 成功导航走这条。
 */
function unlockNavigation(delay) {
  if (navFallbackTimer) {
    clearTimeout(navFallbackTimer);
    navFallbackTimer = null;
  }

  if (navUnlockTimer) {
    clearTimeout(navUnlockTimer);
    navUnlockTimer = null;
  }

  if (!delay) {
    navigating = false;
    return;
  }

  navUnlockTimer = setTimeout(function () {
    navUnlockTimer = null;
    navigating = false;
  }, delay);
}

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
      /*
       * 上一次导航还没回来就再点，会把 wx.switchTab 调多次 —— 并发的页面切换
       * 会互相打断页面栈，表现是卡住或崩溃。所以导航期间直接忽略这次点击。
       */
      if (navigating) return;

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
        /*
         * 加号键也是导航：连点会开好几个建档页。一并上锁。
         */
        lockNavigation();

        wx.navigateTo({
          url: '/pages/record/create/index',
          success: function () {
            unlockNavigation(NAV_UNLOCK_DELAY);
          },
          fail: function () {
            unlockNavigation(0);
          },
        });
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

      /*
       * 上锁到导航回来为止。成功走延迟解锁（转场动画走完才允许下一次点击），
       * 失败立即解锁 —— 失败的场景更常见（比如目标页还没注册），锁住不让重试
       * 等于底栏失灵。
       */
      lockNavigation();

      wx.switchTab({
        url: item.path,
        success: function () {
          unlockNavigation(NAV_UNLOCK_DELAY);
        },
        fail: function () {
          unlockNavigation(0);
        },
      });
    },
  },
});
