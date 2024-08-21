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
    }


    sitemap.write({
      url: doc._path,
      changefreq: 'weekly',
    })
  }
  sitemap.end()

  return streamToPromise(sitemap)
})