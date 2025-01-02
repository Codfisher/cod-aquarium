import type { Token } from 'markdown-it'
import type MarkdownIt from 'markdown-it'

type RuleInline = Parameters<
  MarkdownIt['inline']['ruler']['before']
>[2]

/**
 * https://vitepress.dev/guide/markdown#advanced-configuration
 *
 * @param md
 */
export function markdownItNowrap(md: MarkdownIt) {
  // 定義內聯規則
  const parsePercentSyntax: RuleInline = (state, silent) => {
    const start = state.pos
    const marker = '%'

    // 如果不是 %，直接跳過
    if (state.src[start] !== marker) {
      return false
    }

    const end = state.src.indexOf(marker, start + 1)
    if (end === -1) {
      return false // 如果找不到結尾的 %，跳過
    }

    if (!silent) {
      const token = state.push('percent_syntax', '', 0)
      token.content = state.src.slice(start + 1, end).trim()
    }

    state.pos = end + 1 // 更新解析位置
    return true
  }

  // Token 渲染器
  function renderPercentSyntax(tokens: Token[], idx: number) {
    if (!tokens[idx]?.content) {
      return ''
    }

    return tokens[idx].content
  }

  // 插件註冊
  md.inline.ruler.before('emphasis', 'nowrap_span', parsePercentSyntax)
  md.renderer.rules.nowrap_span = renderPercentSyntax
}
