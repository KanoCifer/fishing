/**
 * 错误文案转换。
 *
 * 网络层抛的错有三种形状：ApiError（后端返回了 message）、
 * 普通 Error（本地抛的）、以及非 Error 的意外值（throw 'xxx'）。
 * 每个调用点自己判断一遍又散又容易漏判，收到这里统一收口。
 */

import { ApiError } from '@/api/client';

/** 把网络层错误转成可展示文案，页面里不用重复判断 ApiError */
export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
