import process from 'node:process'
import { SitemapStream, streamToPromise } from 'sitemap'
import { serverQueryContent } from '#content/server'

export default defineEventHandler(async (event) => {
  // Fetch all documents
  const docs = await serverQueryContent(event).find()
  const sitemap = new SitemapStream({
    hostname: 'https://codlin.me',
  })

  for (const doc of docs) {
    if (doc._partial) continue;

    if (doc._path?.includes('blog-')) {
      if (!doc.title || !doc.description) {
        throw new Error(`${doc._path} 遺失必要的 meta 資訊`)
      }

      if (!doc.date || doc.date < 20240000) {
        throw new Error(`${doc._path} 遺失日期`)
      }

      if (!doc.tags || doc.tags.length === 0) {
        throw new Error(`${doc._path} 遺失標籤`)
      }

      if (!doc.image || !doc.image.includes('codlin.me')) {
        throw new Error(`${doc._path} og image 設定錯誤`)
      }
    }

    sitemap.write({
      url: doc._path,
      changefreq: 'weekly',
    })
  }
  sitemap.end()

  return streamToPromise(sitemap)
})