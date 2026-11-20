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

/** md 的 <script setup> 裡同步匯入的相對路徑 .vue 元件（文章內嵌的示範） */
const SYNC_VUE_IMPORT_RE = /^([ \t]*)import\s+(\w+)\s+from\s+(['"])(\.{1,2}\/[^'"]+\.vue)\3;?[ \t]*$/gm

/** 文章內嵌的示範元件改為延遲 hydration：SSR 照常輸出完整 HTML，
 * client 端等元件接近可視範圍（300px 內）才下載它的 JS 並 hydration。
 * 同步匯入時示範元件全部打包進文章 chunk、開頁就執行，與首屏內容搶主執行緒
 */
function toLazyHydratedImports(script: string): string {
  if (!/<script\s[^>]*\bsetup\b/.test(script))
    return script

  let hasMatch = false
  const result = script.replace(SYNC_VUE_IMPORT_RE, (_match, indent: string, name: string, _quote: string, source: string) => {
    hasMatch = true
    return `${indent}const ${name} = __defineLazyHydrated(() => import('${source}'))`
  })
  if (!hasMatch)
    return script

  return result.replace(/(<script\b[^>]*>)/, [
    '$1',
    `import { defineAsyncComponent as __defineAsyncComponent, hydrateOnVisible as __hydrateOnVisible } from 'vue'`,
    `const __defineLazyHydrated = (loader) => __defineAsyncComponent({ loader, hydrate: __hydrateOnVisible({ rootMargin: '300px' }) })`,
  ].join('\n'))
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
  const isStandalonePage = env.frontmatter?.layout === false
  const sfcBlocks = env.sfcBlocks

  return [
    /** aquarium 各 app 頁（layout: false）的 app 元件就在首屏、畫面完全靠它繪製，不能延遲載入：
     * 延遲的話要等 hydration 後偵測到可見才下載 app 本體，快取梗圖的 LCP 因此多出約 1.5 秒
     */
    ...(sfcBlocks?.scripts.map((item) => isStandalonePage ? item.content : toLazyHydratedImports(item.content)) ?? []),
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
    },
  }
}
