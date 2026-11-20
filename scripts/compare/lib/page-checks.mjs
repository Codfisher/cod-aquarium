import { compareText, deepDiff, diffList, normalizeAssetUrl, normalizeUrl } from './diff.mjs'

export const SEVERITY_LIST = ['critical', 'major', 'minor', 'info']

/** 會隨 git 時間或建置時間變動的欄位，差異只算輕微 */
const VOLATILE_PATH_RE = /dateModified|article:modified_time/

function toPreview(value) {
  if (value === undefined)
    return '(無)'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

function createCollector() {
  const findingList = []
  return {
    findingList,
    add(severity, category, message, detail) {
      findingList.push({ severity, category, message, ...(detail === undefined ? {} : { detail }) })
    },
  }
}

function compareScalar(collector, category, label, remote, local, severity = 'major') {
  if ((remote ?? null) !== (local ?? null))
    collector.add(severity, category, `${label}不同`, { remote: toPreview(remote), local: toPreview(local) })
}

function compareLinkList(collector, category, label, remoteList, localList, severity) {
  const result = diffList(remoteList, localList)
  if (result.isSame)
    return
  if (result.missingList.length || result.extraList.length) {
    collector.add(severity, category, `${label}不一致（本機少 ${result.missingList.length}、多 ${result.extraList.length}）`, {
      missingList: result.missingList.slice(0, 20),
      extraList: result.extraList.slice(0, 20),
    })
  }
  else {
    collector.add('minor', category, `${label}內容相同但順序不同`)
  }
}

/**
 * 比較同一網址在正式站與本機的抓取結果。
 * remoteFetch / localFetch 為 http.mjs 的結果；remoteData / localData 為 extract.mjs 解析出的欄位（非 HTML 時為 undefined）
 */
export function comparePage({ path, remoteFetch, localFetch, remoteData, localData, remoteOrigin, localOrigin }) {
  const collector = createCollector()
  const siteOriginList = [remoteOrigin, localOrigin, 'https://codlin.me']
  const toLink = (href, origin) => normalizeUrl(href, `${origin}${path}`, siteOriginList)

  if (localFetch.status === 0) {
    collector.add('critical', 'http', `本機請求失敗：${localFetch.error}`)
    return collector.findingList
  }
  if (remoteFetch.status === 0)
    collector.add('info', 'http', `正式站請求失敗：${remoteFetch.error}`)

  if (localFetch.status !== remoteFetch.status) {
    collector.add('critical', 'http', `HTTP 狀態不同：正式站 ${remoteFetch.status}、本機 ${localFetch.status}`)
  }
  const remoteFinalPath = normalizeUrl(remoteFetch.finalUrl, remoteFetch.finalUrl, siteOriginList)
  const localFinalPath = normalizeUrl(localFetch.finalUrl, localFetch.finalUrl, siteOriginList)
  if (remoteFinalPath !== localFinalPath) {
    collector.add('major', 'http', '最終網址不同', { remote: remoteFetch.finalUrl, local: localFetch.finalUrl })
  }
  else if (remoteFetch.redirectList.length !== localFetch.redirectList.length) {
    collector.add('minor', 'http', `轉址次數不同：正式站 ${remoteFetch.redirectList.length}、本機 ${localFetch.redirectList.length}`, {
      remote: remoteFetch.redirectList,
      local: localFetch.redirectList,
    })
  }

  if (!remoteData || !localData)
    return collector.findingList

  compareScalar(collector, 'head', 'html lang ', remoteData.lang, localData.lang)
  compareScalar(collector, 'head', 'title ', remoteData.title, localData.title)
  compareScalar(collector, 'head', 'meta description ', remoteData.metaDescription, localData.metaDescription)
  compareScalar(collector, 'head', 'canonical ', remoteData.canonical, localData.canonical)
  compareScalar(collector, 'head', 'robots meta ', remoteData.robots, localData.robots)
  if (!localData.title)
    collector.add('critical', 'head', '本機頁面沒有 title')

  // og / twitter / article meta
  const metaKeySet = new Set([...Object.keys(remoteData.metaMap), ...Object.keys(localData.metaMap)])
  for (const key of [...metaKeySet].sort()) {
    const remoteValueList = remoteData.metaMap[key] ?? []
    const localValueList = localData.metaMap[key] ?? []
    if (JSON.stringify(remoteValueList) === JSON.stringify(localValueList))
      continue
    const severity = VOLATILE_PATH_RE.test(key) ? 'minor' : 'major'
    collector.add(severity, 'meta', `meta ${key} 不同`, { remote: remoteValueList.map(toPreview), local: localValueList.map(toPreview) })
  }

  // JSON-LD 深度比較
  const jsonLdDiffList = deepDiff(remoteData.jsonLdList, localData.jsonLdList)
  const majorJsonLdDiffList = jsonLdDiffList.filter((item) => !VOLATILE_PATH_RE.test(item.path))
  const volatileJsonLdDiffList = jsonLdDiffList.filter((item) => VOLATILE_PATH_RE.test(item.path))
  const toDiffDetail = (list) => list.slice(0, 30).map((item) => ({ path: item.path, remote: toPreview(item.remote), local: toPreview(item.local) }))
  if (majorJsonLdDiffList.length)
    collector.add('major', 'json-ld', `JSON-LD 有 ${majorJsonLdDiffList.length} 處不同`, toDiffDetail(majorJsonLdDiffList))
  if (volatileJsonLdDiffList.length)
    collector.add('minor', 'json-ld', `JSON-LD 更新時間不同（${volatileJsonLdDiffList.length} 處）`, toDiffDetail(volatileJsonLdDiffList))

  compareLinkList(collector, 'head', 'head 的 link 宣告', remoteData.headLinkList, localData.headLinkList, 'minor')

  if (JSON.stringify(remoteData.h1List) !== JSON.stringify(localData.h1List))
    collector.add('major', 'content', 'h1 不同', { remote: remoteData.h1List, local: localData.h1List })

  // 內文
  if (remoteData.hasDoc !== localData.hasDoc) {
    collector.add('major', 'content', `.vp-doc ${localData.hasDoc ? '本機多出' : '本機缺少'}`)
  }
  else if (remoteData.hasDoc) {
    const textResult = compareText(remoteData.docText, localData.docText)
    if (textResult.similarity < 0.995) {
      const severity = textResult.similarity < 0.9 ? 'major' : 'minor'
      collector.add(severity, 'content', `內文相似度 ${(textResult.similarity * 100).toFixed(1)}%`, textResult)
    }
  }

  const headingResult = diffList(remoteData.headingIdList, localData.headingIdList)
  if (headingResult.missingList.length || headingResult.extraList.length) {
    collector.add('major', 'content', `標題 id 不一致（既有錨點連結可能失效）`, {
      missingList: headingResult.missingList,
      extraList: headingResult.extraList,
    })
  }
  else if (headingResult.isOrderDifferent) {
    collector.add('minor', 'content', '標題 id 順序不同')
  }

  const toImage = (origin) => (src) => normalizeAssetUrl(toLink(src, origin))
  compareLinkList(
    collector,
    'content',
    '圖片 src',
    remoteData.imageSrcList.map(toImage(remoteOrigin)),
    localData.imageSrcList.map(toImage(localOrigin)),
    'minor',
  )

  if (remoteData.codeBlockCount !== localData.codeBlockCount || remoteData.preCount !== localData.preCount) {
    collector.add('minor', 'content', `程式碼區塊數不同：正式站 ${remoteData.codeBlockCount}（pre ${remoteData.preCount}）、本機 ${localData.codeBlockCount}（pre ${localData.preCount}）`)
  }

  const toLinkList = (list, origin) => list.map((href) => toLink(href, origin))
  compareLinkList(collector, 'links', '內文連結', toLinkList(remoteData.contentLinkList, remoteOrigin), toLinkList(localData.contentLinkList, localOrigin), 'major')
  compareLinkList(collector, 'links', '側欄連結', toLinkList(remoteData.sidebarLinkList, remoteOrigin), toLinkList(localData.sidebarLinkList, localOrigin), 'major')
  compareLinkList(collector, 'links', '導覽列連結', toLinkList(remoteData.navLinkList, remoteOrigin), toLinkList(localData.navLinkList, localOrigin), 'major')

  const isArticle = /^\/(?:blog|column)-/.test(path)
  if (isArticle && !localData.hasPagefindBody)
    collector.add('major', 'search', '文章頁沒有 data-pagefind-body，Pagefind 不會索引')

  return collector.findingList
}

/** 每頁 .md 副本（llms 外掛產生）的比較 */
export function compareMarkdownCopy({ remoteFetch, localFetch }) {
  const collector = createCollector()
  if (remoteFetch.status !== localFetch.status) {
    collector.add(remoteFetch.status === 200 ? 'major' : 'minor', 'llms', `.md 副本狀態不同：正式站 ${remoteFetch.status}、本機 ${localFetch.status}`)
    return collector.findingList
  }
  if (remoteFetch.status !== 200)
    return collector.findingList

  const textResult = compareText(remoteFetch.body, localFetch.body)
  if (textResult.similarity < 0.99)
    collector.add(textResult.similarity < 0.9 ? 'major' : 'minor', 'llms', `.md 副本相似度 ${(textResult.similarity * 100).toFixed(1)}%`, textResult)
  return collector.findingList
}
