import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getSitePageList } from '../../pages'

interface ManifestChunk {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
}
type Manifest = Record<string, ManifestChunk>

/** Nuxt 的 client build manifest（nuxt.config 的 buildDir 在 node_modules/.cache/nuxt/.nuxt） */
const CLIENT_MANIFEST_PATH = path.resolve(__dirname, '../../../node_modules/.cache/nuxt/.nuxt/dist/server/client.manifest.mjs')

/** 入口的直接依賴只預載這個大小以上的（未壓縮位元組），通常就是 Vue 執行環境這類大塊 */
const LARGE_CHUNK_SIZE = 50 * 1024

/** 頁面動態載入的 chunk 裡，不要預載的（manifest key 的比對字串）。
 * 這些是 LCP 之後才用到的功能，預載只會與擋渲染的 CSS 搶頻寬：
 * meme-cache 的圖片編輯器（interactjs、snapdom、zod 等），頁面自己會在資料載完後閒置時預取
 */
const PRELOAD_SKIP_KEY_LIST = ['img-editor']

/** aquarium 各 app 頁（frontmatter layout: false）補上 modulepreload。
 *
 * 全站不輸出 modulepreload（見 modules/site.ts 的 build:manifest），是為了不讓 JS 跟文章頁擋渲染的 CSS 搶頻寬；
 * 文章內容就在 HTML 裡，不需要 JS 就能顯示。app 頁的畫面則完全由 JS 繪製（<ClientOnly> 加 defineAsyncComponent），
 * 少了預載就變成「下載入口 → 執行後才發現要 Vue → hydration 後才下載 app 本體」三段瀑布，
 * 快取梗圖的 app 本體到 4 秒才下載完、LCP 5.5 秒。這裡預載關鍵路徑上的幾支大 chunk，讓它們與 HTML 並行下載
 */
export async function addStandalonePreload(outDir: string) {
  if (!existsSync(CLIENT_MANIFEST_PATH)) {
    console.warn(`[ standalone-preload ] 找不到 client manifest，略過：${CLIENT_MANIFEST_PATH}`)
    return
  }
  const { default: manifest } = await import(pathToFileURL(CLIENT_MANIFEST_PATH).href) as { default: Manifest }

  const entryKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry)
  const standalonePageList = getSitePageList().filter((page) => page.frontmatter.layout === false && !page.params)

  for (const page of standalonePageList) {
    const pageKey = `../content/${page.filePath}`
    const pageChunk = manifest[pageKey]
    if (!pageChunk) {
      console.warn(`[ standalone-preload ] manifest 找不到 ${pageKey}`)
      continue
    }

    /** 只預載關鍵路徑上的幾支：入口與頁面各自底下的大依賴、頁面本身、頁面動態載入的 app 本體。
     * 一次預載全部依賴反而更慢：快取梗圖 74 支、3D app 近 300 支（Babylon 拆成大量小 chunk）一起搶頻寬，
     * 擋渲染的 CSS 與梗圖資料都被拖慢，HexaZen 的 TBT 從約 280 暴增到約 2000ms
     */
    const getFileSize = (file: string) => {
      const filePath = path.join(outDir, '_nuxt', file)
      return existsSync(filePath) ? statSync(filePath).size : 0
    }
    const fileSet = new Set<string>()
    const entryChunk = entryKey ? manifest[entryKey] : undefined
    if (entryChunk) {
      fileSet.add(entryChunk.file)
      for (const importKey of entryChunk.imports ?? []) {
        const importFile = manifest[importKey]?.file
        if (importFile && getFileSize(importFile) >= LARGE_CHUNK_SIZE)
          fileSet.add(importFile)
      }
    }
    fileSet.add(pageChunk.file)
    // app 本體通常是頁面的靜態依賴（md 直接 import），一樣只取大塊
    for (const importKey of pageChunk.imports ?? []) {
      const importFile = manifest[importKey]?.file
      if (importFile && getFileSize(importFile) >= LARGE_CHUNK_SIZE)
        fileSet.add(importFile)
    }
    for (const dynamicKey of pageChunk.dynamicImports ?? []) {
      if (PRELOAD_SKIP_KEY_LIST.some((skipKey) => dynamicKey.includes(skipKey)))
        continue
      const dynamicFile = manifest[dynamicKey]?.file
      if (dynamicFile)
        fileSet.add(dynamicFile)
    }

    const htmlPath = path.join(outDir, page.routePath, page.routePath.endsWith('/') ? 'index.html' : '.html')
    const resolvedHtmlPath = existsSync(htmlPath) ? htmlPath : path.join(outDir, `${page.routePath.replace(/\/$/, '')}.html`)
    if (!existsSync(resolvedHtmlPath)) {
      console.warn(`[ standalone-preload ] 找不到 ${page.routePath} 的 HTML`)
      continue
    }

    const html = readFileSync(resolvedHtmlPath, 'utf-8')
    const linkList = [...fileSet]
      .filter((file) => !html.includes(`/_nuxt/${file}"`))
      .map((file) => `<link rel="modulepreload" as="script" crossorigin href="/_nuxt/${file}">`)
    writeFileSync(resolvedHtmlPath, html.replace('</head>', `${linkList.join('')}</head>`))
    console.log(`[ standalone-preload ] ${page.routePath} 預載 ${linkList.length} 支 JS`)
  }
}
