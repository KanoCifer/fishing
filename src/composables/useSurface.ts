/**
 * 表面 —— 这一块内容压在什么上面。
 *
 * 有两种表面：普通页面（浅色或深色的页面底）与照片（整页一张照片，
 * 卡片浮在上面）。两者的颜色规则完全不同：普通页面是「面上的字」，
 * 照片上是「深玻璃上的白字」。
 *
 * CSS 那一侧走 theme.scss 的 .on-photo —— 一组 CSS 变量覆盖，
 * 页面挂上那个类，这一块里的令牌就整体翻过去。
 *
 * JS 这一侧走这里。原因有两条，两条都是「CSS 变量传不进去」：
 *   · 图标：色值烤在 data URI 里，CSS 改不动；
 *   · canvas：2d 上下文不解析 var()，取色只能手写（见 utils/chartPalette）。
 *
 * 所以同一个「表面」有两半：CSS 看类名，JS 看上下文。
 * 挂的时候两半要在同一个地方写（见 src/pages/data/index.vue）。
 */
import { inject, provide, type InjectionKey } from 'vue';

export type Surface = 'default' | 'photo';

const SURFACE_KEY: InjectionKey<Surface> = Symbol('fish-surface');

/**
 * 声明这一块的表面。返回它 —— 模板里要挂 .on-photo 那个类，
 * 由这里给出的值决定，两半就不会走散。
 */
export function provideSurface(surface: Surface): Surface {
  provide(SURFACE_KEY, surface);

  return surface;
}

/** 读所在块的表面。读不到就是普通页面 */
export function useSurface(): Surface {
  return inject(SURFACE_KEY, 'default');
}
