import type MarkdownIt from 'markdown-it'

/** ```mermaid 區塊改輸出 <mermaid-diagram>，圖表於瀏覽器端才繪製。
 *
 * 原站用 vitepress-plugin-mermaid，SSR 只輸出空的 <div class="mermaid">，這裡維持相同行為：
 * 原始碼以 encodeURIComponent 放進屬性，避免 Vue 模板解析到 {{ }} 或角括號
 */
export function markdownItMermaid(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (...args) => {
    const [tokens, idx] = args
    const token = tokens[idx]!
    if (token.info.trim() !== 'mermaid')
      return fence(...args)

    return `<mermaid-diagram graph="${encodeURIComponent(token.content)}" />\n`
  }
}
