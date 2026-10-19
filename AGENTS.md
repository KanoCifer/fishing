# 渔碌

uni-app + Vue 3 + TypeScript，**只有微信小程序（mp-weixin）一个目标平台**。使用`pnpm`

**不要写浏览器 API**

## 设计系统

- 偏好 `/apple-design`，苹果设计风格。
- 页面骨架统一：环境色底用 `PageBackdrop` 组件，分区版式用 `uni.scss` 的
  `fish-section` / `fish-eyebrow` / `fish-foot`。数据页与关于页共用同一套，
  新页面照抄这两页的骨架，不要另起一套。

## 代码约定

- 组件 `src/components/<Name>/<Name>.vue`，页面 `src/pages/<name>/index.vue`
