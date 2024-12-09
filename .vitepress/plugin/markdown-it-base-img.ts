import type { RequiredDeep } from 'type-fest'
import type { UserConfig } from 'vitepress'

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
    const src = token.attrGet('src')
    if (!src) {
      return ''
    }

    return [
      `<base-img`,
      `src="${src}"`,
      `alt="${token.content}"`,
      `/>`,
    ].join(' ')
  }
}
