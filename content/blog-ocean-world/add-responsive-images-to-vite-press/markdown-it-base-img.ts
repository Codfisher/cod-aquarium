import type MarkdownIt from 'markdown-it'
import { map, pipe } from 'remeda'

/** 將 img 轉換成 base-img 元件
 *
 * @param md
 */
export function markdownItBaseImg(md: MarkdownIt) {
  md.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx]
    if (!token) {
      return ''
    }

    const attrs = pipe(
      token.attrs ?? [],
      map(([key, value]) => {
        if (key === 'alt') {
          return `alt="${token.content}"`
        }

        return `${key}="${value}"`
      }),
    )

    return [
      `<base-img`,
      ...attrs,
      `/>`,
    ].join(' ')
  }
}
