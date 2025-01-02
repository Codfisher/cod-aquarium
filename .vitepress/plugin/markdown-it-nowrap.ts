import type MarkdownIt from 'markdown-it'

const RULE_NAME = 'nowrap_span'
const MARKER = '%'

/** 使用 MARKER 包圍文字，即可建立不換行的元素
 * https://vitepress.dev/guide/markdown#advanced-configuration
 *
 * @param md
 */
export function markdownItNowrap(md: MarkdownIt) {
  /** 解析 % 區塊
   *
   * 顏文字僅用於 inline 內容，所以註冊在 inline ruler 之前
   */
  md.inline.ruler.before('emphasis', RULE_NAME, (state, silent) => {
    const start = state.pos
    const markerLength = MARKER.length

    // 如果不是 %，直接跳過
    if (state.src.slice(start, start + markerLength) !== MARKER) {
      return false
    }

    const end = state.src.indexOf(MARKER, start + markerLength)
    if (end === -1) {
      return false
    }

    if (!silent) {
      const token = state.push(RULE_NAME, '', 0)
      token.content = state.src.slice(start + markerLength, end).trim()
    }

    state.pos = end + markerLength
    return true
  })

  /** 渲染自定義區塊內容 */
  md.renderer.rules[RULE_NAME] = (tokens, idx) => {
    if (!tokens[idx]?.content) {
      return ''
    }

    return `<span class="text-nowrap">${tokens[idx].content}</span>`
  }
}
