/**
 * AI 分析的状态机 —— 流式内容的累积、节流和收尾。
 *
 * 为什么必须有节流：大模型吐 token 很快，一段中等长度的建议能拆成上百帧。
 * 每帧都往页面里写一次，低端机上会明显卡 —— 文字一顿一顿地跳。
 * 120ms 合并一次，人眼读起来就是连续的打字效果。
 *
 * 节流放在这一层而不是组件里：组件只负责把内容显示出来，
 * 「多久刷一次」是数据到达节奏的事，和显示无关。
 */

import { onUnmounted, ref } from 'vue';

import { streamWeatherAnalysis } from '@/api/ai';
import type { StreamHandle } from '@/api/stream';
import type { WeatherAnalysisPayload } from '@/types/fishing';

/** 刷新节流间隔（ms）。120ms ≈ 每秒 8 帧，够顺也够省 */
const FLUSH_MS = 120;

export type AnalysisStatus = 'idle' | 'streaming' | 'done' | 'stopped' | 'error';

export function useFishingAnalysis() {
  const status = ref<AnalysisStatus>('idle');
  /** 正文。Markdown 源文本，交给 MarkdownView 去渲染 */
  const summary = ref('');
  /** 思考过程。纯文本，不渲染 Markdown */
  const reasoning = ref('');
  const errorMessage = ref('');

  let handle: StreamHandle | null = null;
  /** 两路增量各自攒着，等定时器一起刷出去 */
  let contentBuffer = '';
  let reasoningBuffer = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  /** 把攒着的增量刷进响应式状态 */
  function flush() {
    if (contentBuffer) {
      summary.value += contentBuffer;
      contentBuffer = '';
    }
    if (reasoningBuffer) {
      reasoning.value += reasoningBuffer;
      reasoningBuffer = '';
    }
  }

  function ensureTimer() {
    if (timer !== null) return;
    timer = setInterval(flush, FLUSH_MS);
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    // 收尾时把攒着的刷出去，别让最后半句留在缓冲区里
    flush();
  }

  /** 清空所有状态，回到未开始 */
  function reset() {
    stopTimer();
    handle?.abort();
    handle = null;
    status.value = 'idle';
    summary.value = '';
    reasoning.value = '';
    errorMessage.value = '';
    contentBuffer = '';
    reasoningBuffer = '';
  }

  /** 用户主动停止。不算失败，但也不谎称生成完毕 */
  function stop() {
    if (status.value !== 'streaming') return;
    handle?.abort();
    handle = null;
    stopTimer();
    status.value = summary.value ? 'stopped' : 'idle';
  }

  /**
   * 发起一次分析。
   *
   * 会先掐掉上一轮 —— 连点两次「生成分析」不该有两条流同时在写同一个缓冲区。
   */
  function start(payload: WeatherAnalysisPayload, modelId?: string) {
    reset();
    status.value = 'streaming';

    handle = streamWeatherAnalysis({
      weatherData: payload,
      modelId,
      onFrame(frame) {
        const text = frame.content;
        if (text) {
          if (frame.type === 'reasoning') {
            reasoningBuffer += text;
          } else {
            contentBuffer += text;
          }
        }

        /*
         * is_end 是「这个通道到头了」。
         * 思考通道结束不代表正文结束 —— 那时候正文一个字都还没来，
         * 所以只有正文通道的 is_end 才算答完。
         */
        if (frame.is_end && frame.type !== 'reasoning') {
          flush();
          status.value = 'done';
        }
      },
      onDone() {
        stopTimer();
        status.value = 'done';
        handle = null;
      },
      onError(err) {
        stopTimer();
        status.value = 'error';
        errorMessage.value = err.message;
        handle = null;
      },
    });

    ensureTimer();
  }

  onUnmounted(() => {
    stopTimer();
    handle?.abort();
    handle = null;
  });

  return { status, summary, reasoning, errorMessage, start, stop, reset };
}
