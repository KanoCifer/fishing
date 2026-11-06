/**
 * Markdown → rich-text nodes 转换。
 *
 * 链路：Markdown 文本 → marked.lexer() → token 树 → rich-text nodes 数组。
 *
 * 为什么走 lexer 而不是 marked.parse()：
 * parse() 出的是 HTML 字符串，交给 rich-text 要在渲染层再解析一遍，
 * 官方明说 String 类型「性能会有所下降」。自己从 token 树生成 nodes，
 * 渲染层拿到的是结构化数据，不需要二次解析。
 *
 * 为什么样式走内联 style 而不是 class：
 * 微信文档写了「仅自定义组件的 wxss 样式对 rich-text 中的 class 生效」——
 * rich-text 内部节点的 class 只有在它**所在的自定义组件**里写样式才吃得到，
 * 而 MarkdownView 的样式是 scoped 的（编译成 data-v 类），rich-text 内部的节点
 * 没有这个类，匹配不上。把样式做进节点的内联 style，就绕开了整套作用域问题：
 * 内联 style 只认自己，不依赖任何选择器命中。
 *
 * 单位是 px 不是 rpx：nodes 的内联 style 不经过 WXSS 编译，rpx 不会被换算，
 * 写进去就是无效值。rpx → px 的换算在 markdown-style.ts 里做。
 */
import { marked } from 'marked';

import { markdownTagStylePx } from '@/constants/markdown-style';

/** rich-text 的节点结构。元素节点用 name/attrs/children，文本节点用 type/text。 */
export interface RichTextNode {
  name?: string;
  attrs?: Record<string, string>;
  children?: RichTextNode[];
  type?: 'text';
  text?: string;
}

/** marked 的 token 结构（只取用到的字段）。 */
interface MarkedToken {
  type: string;
  text?: string;
  raw?: string;
  href?: string;
  depth?: number;
  lang?: string;
  tokens?: MarkedToken[];
  items?: MarkedToken[];
  header?: MarkedToken[];
  rows?: MarkedToken[][];
  ordered?: boolean;
  task?: boolean;
  checked?: boolean;
  escaped?: boolean;
}

/**
 * 拼一个元素节点。
 *
 * attrs 里只放受信任的属性：rich-text 的全局支持是 class 与 style，
 * 不支持 id。
 */
function element(
  name: string,
  children: RichTextNode[],
  extra?: Record<string, string>,
  tagStyle?: string,
): RichTextNode {
  const attrs: Record<string, string> = { ...extra };
  if (tagStyle) attrs.style = tagStyle;
  return { name, attrs, children };
}

/** 文本节点。 */
function text(value: string): RichTextNode {
  return { type: 'text', text: value };
}

/**
 * 转行内 token。
 *
 * marked 的行内 token 是一条扁平序列，靠 type 区分语义。
 * 未识别的 type 按纯文本处理 —— 宁可少一点样式，也不要吞掉内容。
 */
function inlineTokens(tokens: MarkedToken[]): RichTextNode[] {
  const out: RichTextNode[] = [];
  const s = markdownTagStylePx();

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        if (token.text) out.push(text(token.text));
        break;

      case 'escape':
        // marked 已经把转义还原成字面量了，直接当文本
        if (token.text) out.push(text(token.text));
        break;

      case 'strong':
        out.push(element('strong', inlineTokens(token.tokens ?? []), undefined, s.strong));
        break;

      case 'em':
        out.push(element('em', inlineTokens(token.tokens ?? []), undefined, s.em));
        break;

      case 'del':
        out.push(element('del', inlineTokens(token.tokens ?? []), undefined, s.del));
        break;

      case 'codespan':
        out.push(element('code', [text(token.text ?? '')], undefined, s.code));
        break;

      case 'br':
        out.push({ name: 'br' });
        break;

      case 'link':
        // rich-text 屏蔽节点内所有事件，链接点不动。href 仍写上，
        // 长按复制时至少能拿到地址
        out.push(
          element('a', inlineTokens(token.tokens ?? []), { href: token.href ?? '' }, s.a),
        );
        break;

      case 'checkbox':
        // 任务列表：rich-text 没有 input，用文字符号代替
        out.push(text(token.checked ? '☑ ' : '☐ '));
        break;

      case 'html':
        // 行内原始 HTML：rich-text 只认受信任标签，这里丢掉标签本身
        break;

      default:
        if (token.text) out.push(text(token.text));
        break;
    }
  }

  return out;
}

/** 转块级 token。 */
function blockTokens(tokens: MarkedToken[]): RichTextNode[] {
  const out: RichTextNode[] = [];
  const s = markdownTagStylePx();

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        break;

      case 'heading': {
        const depth = Math.min(Math.max(token.depth ?? 1, 1), 6);
        out.push(element(`h${depth}`, inlineTokens(token.tokens ?? []), undefined, s[`h${depth}`]));
        break;
      }

      case 'paragraph':
        out.push(element('p', inlineTokens(token.tokens ?? []), undefined, s.p));
        break;

      case 'blockquote':
        out.push(element('blockquote', blockTokens(token.tokens ?? []), undefined, s.blockquote));
        break;

      case 'list': {
        const tag = token.ordered ? 'ol' : 'ul';
        out.push(
          element(
            tag,
            (token.items ?? []).map((item) =>
              element('li', inlineTokens(item.tokens ?? []), undefined, s.li),
            ),
            undefined,
            s[tag],
          ),
        );
        break;
      }

      case 'code':
        // 代码块。marked 的 code token 里内容已转义（& < > 都成了实体），
        // 而 rich-text 的文本节点要的是字面量，所以在这里转回来
        out.push(element('pre', [text(unescapeEntities(token.text ?? ''))], undefined, s.pre));
        break;

      case 'hr':
        out.push(element('hr', [], undefined, s.hr));
        break;

      case 'table': {
        // rich-text 的受信任节点里有 table/thead/tbody/tr/th/td，表格照常渲染
        const headerCells = token.header ?? [];
        const rows = token.rows ?? [];

        const thead = element(
          'thead',
          [
            element(
              'tr',
              headerCells.map((cell) => element('th', inlineTokens(cell.tokens ?? []), undefined, s.th)),
            ),
          ],
        );
        const tbody = element(
          'tbody',
          rows.map((row) =>
            element(
              'tr',
              row.map((cell) => element('td', inlineTokens(cell.tokens ?? []), undefined, s.td)),
            ),
          ),
        );

        out.push(element('table', [thead, tbody], undefined, s.table));
        break;
      }

      case 'html':
        // 块级原始 HTML：整块丢掉
        break;

      default:
        if (token.text) out.push(element('p', [text(token.text)], undefined, s.p));
        break;
    }
  }

  return out;
}

/**
 * HTML 实体还原。
 *
 * marked 的 code token 内容是转义过的（&amp; &lt; &gt; &#39;），
 * rich-text 的文本节点直接显示字面量，所以要先转回来。
 * 只认这五个 —— Markdown 里真正会出现的就这些。
 */
function unescapeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 把 Markdown 转成 rich-text 的 nodes 数组。
 *
 * 解析失败就退回纯文本：半截 Markdown 在流式过程中本来就可能不合法，
 * 抛错等于整块内容消失，比显示原文差得多。
 */
export function markdownToNodes(markdown: string): RichTextNode[] {
  if (!markdown) return [];

  let tokens: MarkedToken[];
  try {
    tokens = marked.lexer(markdown, { gfm: true, breaks: true }) as MarkedToken[];
  } catch {
    return [{ type: 'text', text: markdown }];
  }

  return blockTokens(tokens);
}
