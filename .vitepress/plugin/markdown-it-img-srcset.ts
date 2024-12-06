import type { RequiredDeep } from 'type-fest'
import type { UserConfig } from 'vitepress'

type MarkdownIt = Parameters<
  RequiredDeep<
    UserConfig['markdown']
  >['config']
>[0]

/** https://vitepress.dev/guide/markdown#advanced-configuration */
export function markdownItImgSrcset(md: MarkdownIt) {

}
