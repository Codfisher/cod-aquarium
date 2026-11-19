import type { Plugin } from 'vite'
import type { MarkdownEnv } from './renderer'
import path from 'node:path'
import { CONTENT_PATH } from '../constants'
import { toRewrittenPath } from '../pages'
import { getMarkdownRenderer } from './renderer'

/** content 底下的 md（排除 public 與 node_modules）才轉成 Vue 元件 */
function isContentMarkdown(id: string): boolean {
  const filePath = id.split('?')[0]!.replace(/\\/g, '/')
  const contentPath = CONTENT_PATH.replace(/\\/g, '/')
  return filePath.endsWith('.md')
    && filePath.startsWith(`${contentPath}/`)
    && !filePath.includes('/node_modules/')
    && !filePath.startsWith(`${contentPath}/public/`)
}

/** 把 md 編譯成 Vue SFC，輸出格式與原本 VitePress 相同：
 * <script> 區塊原樣保留，內文包在 <template><div> 內，<style> 附在最後
 */
export async function compileMarkdownToVue(source: string, filePath: string): Promise<string> {
  const { md, preloadLanguages } = await getMarkdownRenderer()
  await preloadLanguages(source)

  const relativePath = path.relative(CONTENT_PATH, filePath).replace(/\\/g, '/')
  const env: MarkdownEnv = {
    path: filePath,
    relativePath: toRewrittenPath(relativePath),
    cleanUrls: true,
  }
  /** 首頁開頭給 LLM 爬蟲的隱藏提示，原本由 vitepress-plugin-llms 插入 */
  const llmsHint = env.relativePath === 'index.md'
    ? '<div style="display:none;" hidden data-nosnippet>Are you an LLM? View /llms.txt for optimized Markdown documentation, or /llms-full.txt for full documentation bundle</div>'
    : ''
  const html = llmsHint + md.render(source, env)
  const sfcBlocks = env.sfcBlocks

  return [
    ...(sfcBlocks?.scripts.map((item) => item.content) ?? []),
    `<template><div>${html}</div></template>`,
    ...(sfcBlocks?.styles.map((item) => item.content) ?? []),
    ...(sfcBlocks?.customBlocks.map((item) => item.content) ?? []),
  ].join('\n')
}

/** md 轉 Vue 的 Vite 外掛，需排在 @vitejs/plugin-vue 之前 */
export function viteMarkdown(): Plugin {
  return {
    name: 'site:markdown',
    enforce: 'pre',
    async transform(code, id) {
      // ?vue&type=style 這類子請求是 Vue 外掛拆出的區塊，不是原始 md；
      // Nuxt 頁面另有 ?macro=true 的請求，仍要轉成 SFC
      if (!isContentMarkdown(id) || /[?&]vue\b/.test(id))
        return

      const filePath = id.split('?')[0]!.replace(/\\/g, '/')
      return {
        code: await compileMarkdownToVue(code, filePath),
        map: null,
      }
    }
  }
}
