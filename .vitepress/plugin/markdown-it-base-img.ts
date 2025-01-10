import type { RequiredDeep } from 'type-fest'
import type { UserConfig } from 'vitepress'
import { map, pipe } from 'remeda'

type MarkdownIt = Parameters<
  RequiredDeep<
    UserConfig['markdown']
  >['config']
>[0]

/** 將 img 轉換成 base-img 元件
 * https://vitepress.dev/guide/markdown#advanced-configuration
 *
 * @param md
 * @param mode 用於判斷是否為開發模式
 */
export function markdownItBaseImg(md: MarkdownIt, mode: string) {
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
