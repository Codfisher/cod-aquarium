import type { Token } from 'markdown-it'
import type MarkdownIt from 'markdown-it'

type RuleInline = Parameters<
  MarkdownIt['inline']['ruler']['before']
>[2]

/** 使用 % 包圍文字，即可建立不換行的元素
 * https://vitepress.dev/guide/markdown#advanced-configuration
 *
 * @param md
 */
export function markdownItNowrap(md: MarkdownIt) {
  /** 解析 % 區塊 */
  const parsePercentSyntax: RuleInline = (state, silent) => {
    const start = state.pos
    const marker = '%'

    // 如果不是 %，直接跳過
    if (state.src[start] !== marker) {
      return false
    }

    const end = state.src.indexOf(marker, start + 1)
    if (end === -1) {
      return false
    }

    if (!silent) {
      const token = state.push('nowrap_span', '', 0)
      token.content = state.src.slice(start + 1, end).trim()
    }

    state.pos = end + 1
    return true
  }

  /** 渲染 nowrap_span 區塊內容 */
  function renderPercentSyntax(tokens: Token[], idx: number) {
    if (!tokens[idx]?.content) {
      return ''
    }

    return `<span class="text-nowrap">${tokens[idx].content}</span>`
  }

  // 插件註冊
  md.inline.ruler.before('emphasis', 'nowrap_span', parsePercentSyntax)
  md.renderer.rules.nowrap_span = renderPercentSyntax
}
