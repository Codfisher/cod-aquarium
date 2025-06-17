import type MarkdownIt from 'markdown-it'

/** 讓在 code-block 前且僅有 code 的 p 加上 .code-block-name，變成 code-block name */
export function markdownItCodeBlockName(md: MarkdownIt) {
  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    // 下一個 token 是 paragraph_open 的內容
    const nextToken = tokens[idx + 1]
    const closingToken = tokens[idx + 2]

    // 判斷是否僅有 code（<p><code>...</code></p>）
    if (
      nextToken
      && nextToken.type === 'inline'
      && nextToken.children?.length === 1
      && nextToken.children[0]?.type === 'code_inline'
      && closingToken
      && closingToken.type === 'paragraph_close'
    ) {
      tokens[idx]?.attrJoin('class', 'code-block-name')
    }

    return self.renderToken(tokens, idx, options)
  }
}
