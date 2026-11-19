import type MarkdownIt from 'markdown-it'
import type { MarkdownEnv } from '../../markdown/renderer'
import fs from 'node:fs'
import path from 'node:path'
import { Feed } from 'feed'
import { getArticleList } from '../../articles'
import { AUTHOR_NAME, CONTENT_PATH, COPYRIGHT, HOSTNAME, SITE_DESCRIPTION, SITE_LANG, SITE_TITLE } from '../../constants'
import { getMarkdownRenderer } from '../../markdown/renderer'
import { getSitePageList } from '../../pages'

/** RSS 項目網址沿用原站帶 .html 的格式。
 *
 * guid 即網址，改成乾淨網址會讓閱讀器把每篇都當成新文章重推一次
 */
function toFeedUrlPath(relativePath: string): string {
  return `/${relativePath}`
    .replace(/(^|\/)index\.md$/, '$1')
    .replace(/\.md$/, '.html')
}

const EXTERNAL_URL_RE = /^(?:[a-z]+:|\/\/)/i
/** 指向 index.md 的連結由 renderer 轉成目錄網址，不補 .html */
const INDEX_MD_RE = /(?:^|\/)index\.md/i
/** VitePress 視為檔案（非頁面）的副檔名，其餘一律當頁面，例如 ./260407.02-vertex-shader */
const ASSET_EXTENSION_SET = new Set(
  ('3g2,3gp,aac,ai,apng,au,avif,bin,bmp,cer,class,conf,crl,css,csv,dll,doc,eps,epub,exe,gif,gz,ics,ief,jar,jpe,jpeg,jpg,js,json,jsonld,m4a,man,mid,midi,mjs,mov,mp2,mp3,mp4,mpe,mpeg,mpg,mpp,oga,ogg,ogv,ogx,opus,otf,p10,p7c,p7m,p7s,pdf,png,ps,qt,roff,rtf,rtx,ser,svg,t,tif,tiff,tr,ts,tsv,ttf,txt,vtt,wav,weba,webm,webp,woff,woff2,xhtml,xml,yaml,yml,zip').split(','),
)

/** 同 VitePress 的 treatAsHtml：副檔名不是已知檔案類型就視為站內頁面 */
function isPageLink(url: string): boolean {
  const { pathname, protocol } = new URL(url, 'http://a.com')
  const extension = pathname.split('.').pop()
  return protocol.startsWith('http')
    && (extension == null || !ASSET_EXTENSION_SET.has(extension.toLowerCase()))
}

/** 站內連結補上 .html。
 *
 * 原站 cleanUrls 關閉，VitePress 會把 ./foo 轉成 ./foo.html；共用的 renderer 只處理 cleanUrls 開啟的情況，
 * 這裡在它處理完 href 後補上同樣的規則
 */
function useHtmlExtensionLink(md: MarkdownIt): () => void {
  const originalRule = md.renderer.rules.link_open
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index]!
    const originalHref = token.attrGet('href') ?? ''
    const hasTarget = token.attrGet('target') !== null
    const rendered = originalRule ? originalRule(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
    const isTarget = !hasTarget
      && token.attrGet('download') === null
      && !EXTERNAL_URL_RE.test(originalHref)
      && !originalHref.startsWith('#')
      && isPageLink(originalHref)
      && !INDEX_MD_RE.test(originalHref)
    if (!isTarget)
      return rendered

    const href = token.attrGet('href') ?? ''
    const pathPart = href.replace(/[?#].*$/, '')
    if (pathPart.endsWith('.html') || pathPart.endsWith('/'))
      return rendered

    token.attrSet('href', `${pathPart}.html${href.slice(pathPart.length)}`)
    return self.renderToken(tokens, index, options)
  }
  return () => {
    md.renderer.rules.link_open = originalRule
  }
}

/** pubDate（YYYYMMDD）轉為 UTC 零時，與原站 build（Cloudflare，時區 UTC）時 dayjs 的結果相同 */
function toPubDate(pubDate: unknown): Date | undefined {
  const value = String(pubDate ?? '')
  if (!/^\d{8}$/.test(value))
    return undefined
  return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))))
}

/** 產生 feed.rss，內容對齊原本 vitepress-plugin-rss 的輸出 */
export async function writeFeed(outDir: string) {
  const articleList = getArticleList()
  const { md, preloadLanguages } = await getMarkdownRenderer()

  const postList = getSitePageList()
    .filter((page) => !page.params)
    .map((page) => ({ page, url: toFeedUrlPath(page.relativePath) }))
    .filter(({ page, url }) => {
      if (page.frontmatter.layout === 'home' || page.frontmatter.publish === false)
        return false
      // 與原設定相同以 includes 比對文章連結
      return articleList.some(({ link }) => url.includes(link))
    })
    .map(({ page, url }) => {
      const date = toPubDate(page.frontmatter.pubDate)
        ?? new Date(typeof page.frontmatter.date === 'string' ? page.frontmatter.date : (page.lastUpdated ?? Date.now()))
      return { page, url, date }
    })
    // 同日的文章維持原本頁面順序（Array.prototype.sort 為穩定排序）
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const feed = new Feed({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    id: HOSTNAME,
    link: HOSTNAME,
    language: SITE_LANG,
    copyright: COPYRIGHT,
    author: { name: AUTHOR_NAME },
  })

  const restoreLinkRule = useHtmlExtensionLink(md)
  try {
    for (const { page, url, date } of postList) {
      const filePath = path.join(CONTENT_PATH, page.filePath)
      const source = fs.readFileSync(filePath, 'utf-8')
      await preloadLanguages(source)
      const env: MarkdownEnv = {
        path: filePath,
        relativePath: page.relativePath,
        cleanUrls: false,
      }
      const html = md.render(source, env).replaceAll('&ZeroWidthSpace;', '')
      const link = `${HOSTNAME}${url}`

      // 原站的 feed 版本不輸出作者與封面 enclosure，這裡也不帶，維持相同內容
      feed.addItem({
        title: page.title,
        id: link,
        link,
        description: page.description,
        content: html,
        date,
      })
    }
  }
  finally {
    restoreLinkRule()
  }

  const xml = feed.rss2()
    // 新版 feed 會在 guid 加上 isPermaLink="false"，原站沒有；guid 本身就是網址，拿掉才一致
    .replaceAll('<guid isPermaLink="false">', '<guid>')
    // 新版 feed 會把頻道網址正規化成帶尾斜線，改回原站的寫法
    .replace(`<link>${HOSTNAME}/</link>`, `<link>${HOSTNAME}</link>`)
  fs.writeFileSync(path.join(outDir, 'feed.rss'), xml)
  console.log(`[ feed ] 已輸出 ${postList.length} 篇文章`)
}
