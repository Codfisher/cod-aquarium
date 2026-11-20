import path from 'node:path'
import * as pagefind from 'pagefind'

/** 以 Pagefind 為輸出的 HTML 建立全文搜尋索引，輸出到 <outDir>/pagefind/。
 *
 * 只要有任一頁帶 data-pagefind-body，Pagefind 就只索引帶該屬性的頁面。主題在 VPDoc 的內容區標記（草稿與 aquarium/ 底下除外），
 * 所以文章、首頁、總覽可搜尋；梗圖的情緒分類頁雖經過 VPDoc 也排除，layout: false 的應用頁不經過 VPDoc，本來就不會進索引。
 * npm 版附的是 extended 執行檔，依 <html lang="zh-Hant"> 對中文斷詞，不需另外設定
 */
export async function writePagefindIndex(outDir: string) {
  const { index, errors: createErrorList } = await pagefind.createIndex({})
  if (!index)
    throw new Error(`[ pagefind ] 建立索引失敗：${createErrorList.join('; ')}`)

  try {
    const { errors: addErrorList, page_count: pageCount } = await index.addDirectory({
      path: outDir,
    })
    if (addErrorList.length)
      throw new Error(`[ pagefind ] 索引頁面失敗：${addErrorList.join('; ')}`)
    if (pageCount === 0)
      console.warn('[ pagefind ] 沒有可索引的頁面，請確認文章有 data-pagefind-body')

    const { errors: writeErrorList } = await index.writeFiles({
      outputPath: path.join(outDir, 'pagefind'),
    })
    if (writeErrorList.length)
      throw new Error(`[ pagefind ] 寫入索引失敗：${writeErrorList.join('; ')}`)

    console.log(`[ pagefind ] 已處理 ${pageCount} 個 HTML（只有帶 data-pagefind-body 的頁會進索引）`)
  }
  finally {
    await pagefind.close()
  }
}
