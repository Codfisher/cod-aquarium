import type MarkdownIt from 'markdown-it'

const RULE_NAME = 'nowrap_span'
const MARKER = '%'

/** 緊跟在數字後面的 % 是百分比（4.2%、100%），不是標記 */
function isPercentSign(source: string, markerIndex: number) {
  const previousChar = source[markerIndex - 1]
  return previousChar !== undefined && previousChar >= '0' && previousChar <= '9'
}

/** 使用 MARKER 包圍文字，即可建立不換行的元素
 * https://vitepress.dev/guide/markdown#advanced-configuration
 *
 * 內文的百分比會跟標記衝突，例如「掉 4.2%。[連結](url) 差 50%」，
 * 兩個百分比之間的文字（含連結）會整段被當成顏文字吞掉，
 * 所以數字後面的 % 一律視為百分比，且顏文字不跨行。
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

    if (isPercentSign(state.src, start)) {
      return false
    }

    let end = state.src.indexOf(MARKER, start + markerLength)
    while (end !== -1 && isPercentSign(state.src, end)) {
      end = state.src.indexOf(MARKER, end + markerLength)
    }
    if (end === -1) {
      return false
    }

    // 顏文字不會跨行，跨行代表這個 % 沒有配對
    if (state.src.slice(start, end).includes('\n')) {
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
