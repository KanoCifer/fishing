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

/**
 * 取数失败时的文案。
 *
 * 网络层的两条文案（超时 / 异常）本身就写着下一步，原样用；
 * 其余不端上屏 —— 空串交给调用方填各自的兜底。
 *
 * 为什么机器文案不上屏：那是后端信封里的原文，或者是「请求失败（500）」这类
 * 机器话 —— 它既不说明出了什么事，也不说明下一步做什么。同一屏上别的卡
 * 都在说「天气暂时取不到」这类话术，这里得是同一套口气。
 */
export function fetchErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  if (!raw) return '';
  if (/超时|网络|检查网络/.test(raw)) return raw;
  return '';
}

/**
 * 登录失败时给用户看的文案。
 *
 * 分支的依据是**状态码**而不是 message —— 服务端的 message 随时可能改，
 * 而「这一类该怎么处置」是接口契约的一部分，不该跟着文案变：
 *
 * - 401：code 无效或已过期。已经自动重试过一次还是失败，换个说法让用户再点一次
 * - 429：触发频率限制。该退避，不该马上重试
 * - 502：微信侧繁忙。退避重试有用
 * - 503：服务端没配 appid/secret。**重试没用**，该说「功能没开放」
 */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.statusCode) {
      case 401:
        return '登录凭证已过期，请重试';
      case 429:
        return '操作太频繁，请稍后再试';
      case 502:
        return '微信服务繁忙，请稍后重试';
      case 503:
        return '微信登录暂未开放';
      default:
        return err.message;
    }
  }

  return err instanceof Error && err.message ? err.message : '登录失败，请重试';
}
