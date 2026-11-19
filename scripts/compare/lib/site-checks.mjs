import { compareText, diffList } from './diff.mjs'

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

function getTagValue(xml, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml)
  return match ? decodeXml(match[1]).trim() : undefined
}

/** 讀 sitemap 的網址清單（不分正式站或本機），供頁面比對使用 */
export function parseSitemap(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, block]) => ({
    loc: getTagValue(block, 'loc') ?? '',
    lastmod: getTagValue(block, 'lastmod'),
    imageList: [...block.matchAll(/<image:image>([\s\S]*?)<\/image:image>/g)].map(([, imageBlock]) => ({
      loc: getTagValue(imageBlock, 'image:loc'),
      title: getTagValue(imageBlock, 'image:title'),
      caption: getTagValue(imageBlock, 'image:caption'),
    })),
  }))
}

function createCollector(target) {
  const findingList = []
  return {
    findingList,
    add(severity, category, message, detail) {
      findingList.push({ target, severity, category, message, ...(detail === undefined ? {} : { detail }) })
    },
  }
}

function checkStatus(collector, remoteFetch, localFetch) {
  if (localFetch.status !== remoteFetch.status) {
    collector.add(localFetch.status === 200 ? 'major' : 'critical', 'http', `狀態不同：正式站 ${remoteFetch.status}、本機 ${localFetch.status}`)
    return false
  }
  return remoteFetch.status === 200
}

export function compareSitemap(remoteFetch, localFetch) {
  const collector = createCollector('/sitemap.xml')
  if (!checkStatus(collector, remoteFetch, localFetch))
    return collector.findingList

  if (remoteFetch.body === localFetch.body) {
    collector.add('info', 'sitemap', '與正式站逐字相同')
    return collector.findingList
  }

  const getHeader = (xml) => /^[\s\S]*?<urlset[^>]*>/.exec(xml)?.[0]
  if (getHeader(remoteFetch.body) !== getHeader(localFetch.body))
    collector.add('minor', 'sitemap', 'XML 宣告或命名空間不同', { remote: getHeader(remoteFetch.body), local: getHeader(localFetch.body) })

  const remoteList = parseSitemap(remoteFetch.body)
  const localList = parseSitemap(localFetch.body)
  const urlResult = diffList(remoteList.map((item) => item.loc), localList.map((item) => item.loc))
  if (urlResult.missingList.length)
    collector.add('critical', 'sitemap', `本機缺少 ${urlResult.missingList.length} 個網址`, urlResult.missingList)
  if (urlResult.extraList.length)
    collector.add('major', 'sitemap', `本機多出 ${urlResult.extraList.length} 個網址`, urlResult.extraList)
  if (urlResult.isOrderDifferent)
    collector.add('info', 'sitemap', '網址順序不同')

  const localMap = new Map(localList.map((item) => [item.loc, item]))
  const lastmodDiffList = []
  const imageDiffList = []
  for (const remoteItem of remoteList) {
    const localItem = localMap.get(remoteItem.loc)
    if (!localItem)
      continue
    if (remoteItem.lastmod !== localItem.lastmod)
      lastmodDiffList.push({ loc: remoteItem.loc, remote: remoteItem.lastmod, local: localItem.lastmod })
    if (JSON.stringify(remoteItem.imageList) !== JSON.stringify(localItem.imageList))
      imageDiffList.push({ loc: remoteItem.loc, remoteCount: remoteItem.imageList.length, localCount: localItem.imageList.length })
  }
  if (lastmodDiffList.length)
    collector.add('minor', 'sitemap', `${lastmodDiffList.length} 個網址的 lastmod 不同（多半是 git 時間差異）`, lastmodDiffList)
  if (imageDiffList.length)
    collector.add('major', 'sitemap', `${imageDiffList.length} 個網址的 image:image 不同`, imageDiffList)

  return collector.findingList
}

function parseFeed(xml) {
  const channel = /<channel>([\s\S]*?)<item>/.exec(xml)?.[1] ?? ''
  return {
    channel: Object.fromEntries(['title', 'link', 'description', 'language', 'copyright', 'generator', 'docs'].map((tag) => [tag, getTagValue(channel, tag)])),
    itemList: [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, block]) => ({
      title: getTagValue(block, 'title'),
      link: getTagValue(block, 'link'),
      guid: getTagValue(block, 'guid'),
      guidTag: /<guid[^>]*>/.exec(block)?.[0],
      pubDate: getTagValue(block, 'pubDate'),
      description: getTagValue(block, 'description'),
      content: getTagValue(block, 'content:encoded') ?? '',
    })),
  }
}

function toPlainText(html) {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/g, '\n[code]\n')
    .replace(/<\/(?:p|li|h\d|div|tr|blockquote)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, ' ')
}

export function compareFeed(remoteFetch, localFetch) {
  const collector = createCollector('/feed.rss')
  if (!checkStatus(collector, remoteFetch, localFetch))
    return collector.findingList

  const remoteFeed = parseFeed(remoteFetch.body)
  const localFeed = parseFeed(localFetch.body)
  for (const [key, value] of Object.entries(remoteFeed.channel)) {
    if (value !== localFeed.channel[key])
      collector.add('minor', 'feed', `頻道 ${key} 不同`, { remote: value, local: localFeed.channel[key] })
  }

  const guidResult = diffList(remoteFeed.itemList.map((item) => item.guid), localFeed.itemList.map((item) => item.guid))
  if (guidResult.missingList.length || guidResult.extraList.length) {
    // guid 變動會讓訂閱者重收舊文
    collector.add('critical', 'feed', `guid 不一致（本機少 ${guidResult.missingList.length}、多 ${guidResult.extraList.length}）`, guidResult)
  }
  else if (guidResult.isOrderDifferent) {
    collector.add('minor', 'feed', '文章順序不同')
  }

  const localItemMap = new Map(localFeed.itemList.map((item) => [item.guid, item]))
  const fieldDiffList = []
  const contentDiffList = []
  for (const remoteItem of remoteFeed.itemList) {
    const localItem = localItemMap.get(remoteItem.guid)
    if (!localItem)
      continue
    for (const field of ['title', 'link', 'pubDate', 'description', 'guidTag']) {
      if (remoteItem[field] !== localItem[field])
        fieldDiffList.push({ guid: remoteItem.guid, field, remote: remoteItem[field], local: localItem[field] })
    }
    const textResult = compareText(toPlainText(remoteItem.content), toPlainText(localItem.content), { sampleLimit: 3 })
    if (textResult.similarity < 0.98)
      contentDiffList.push({ guid: remoteItem.guid, similarity: Number(textResult.similarity.toFixed(3)), onlyRemoteList: textResult.onlyRemoteList, onlyLocalList: textResult.onlyLocalList })
  }
  if (fieldDiffList.length)
    collector.add('major', 'feed', `${fieldDiffList.length} 個文章欄位不同`, fieldDiffList)
  if (contentDiffList.length)
    collector.add('minor', 'feed', `${contentDiffList.length} 篇文章內文（去除程式碼後）相似度低於 98%`, contentDiffList)
  if (!fieldDiffList.length && !contentDiffList.length && guidResult.isSame)
    collector.add('info', 'feed', `${remoteFeed.itemList.length} 篇文章的欄位與內文一致`)

  return collector.findingList
}

/** 一般文字檔：逐行比較 */
export function compareTextFile(target, remoteFetch, localFetch, { severity = 'minor' } = {}) {
  const collector = createCollector(target)
  if (!checkStatus(collector, remoteFetch, localFetch))
    return collector.findingList
  if (remoteFetch.body === localFetch.body) {
    collector.add('info', 'text', '與正式站逐字相同')
    return collector.findingList
  }
  const lineResult = diffList(remoteFetch.body.split('\n'), localFetch.body.split('\n'))
  collector.add(severity, 'text', `內容不同（本機少 ${lineResult.missingList.length} 行、多 ${lineResult.extraList.length} 行${lineResult.isOrderDifferent ? '、順序不同' : ''}）`, {
    missingList: lineResult.missingList.slice(0, 30),
    extraList: lineResult.extraList.slice(0, 30),
  })
  return collector.findingList
}

/** llms-full.txt：依每段的 url 對齊後比較 */
export function compareLlmsFull(remoteFetch, localFetch) {
  const collector = createCollector('/llms-full.txt')
  if (!checkStatus(collector, remoteFetch, localFetch))
    return collector.findingList
  if (remoteFetch.body === localFetch.body) {
    collector.add('info', 'llms', '與正式站逐字相同')
    return collector.findingList
  }

  const toSectionMap = (text) => new Map(
    text.split(/\n---\n\n(?=---\nurl: )/).map((section) => [/^---\nurl: (.*)/.exec(section)?.[1] ?? '', section]),
  )
  const remoteMap = toSectionMap(remoteFetch.body)
  const localMap = toSectionMap(localFetch.body)
  const urlResult = diffList([...remoteMap.keys()], [...localMap.keys()])
  if (urlResult.missingList.length || urlResult.extraList.length)
    collector.add('major', 'llms', `收錄頁面不同（本機少 ${urlResult.missingList.length}、多 ${urlResult.extraList.length}）`, urlResult)
  else if (urlResult.isOrderDifferent)
    collector.add('minor', 'llms', '頁面順序不同')

  const sectionDiffList = []
  for (const [url, remoteSection] of remoteMap) {
    const localSection = localMap.get(url)
    if (localSection === undefined || localSection === remoteSection)
      continue
    const lineResult = diffList(remoteSection.split('\n'), localSection.split('\n'))
    sectionDiffList.push({
      url,
      missingLineList: lineResult.missingList.slice(0, 5),
      extraLineList: lineResult.extraList.slice(0, 5),
      diffLineCount: lineResult.missingList.length + lineResult.extraList.length,
    })
  }
  if (sectionDiffList.length)
    collector.add('minor', 'llms', `${sectionDiffList.length} 個頁面內容不同`, sectionDiffList)
  return collector.findingList
}

/** 不存在的網址應回 404 頁 */
export function compareNotFound(remoteFetch, localFetch) {
  const collector = createCollector('404')
  if (localFetch.status !== 404)
    collector.add('critical', 'http', `不存在的網址回 ${localFetch.status}（正式站 ${remoteFetch.status}）`)
  const getTitle = (html) => /<title[^>]*>([\s\S]*?)<\/title>/.exec(html)?.[1]?.trim()
  if (getTitle(remoteFetch.body) !== getTitle(localFetch.body))
    collector.add('minor', 'http', '404 頁 title 不同', { remote: getTitle(remoteFetch.body), local: getTitle(localFetch.body) })
  if (!collector.findingList.length)
    collector.add('info', 'http', `404 行為一致（${localFetch.status}）`)
  return collector.findingList
}

/** 轉址行為：.html → 乾淨網址、目錄補斜線 */
export function compareRedirect(target, remoteFetch, localFetch, normalize) {
  const collector = createCollector(target)
  const summarize = (result) => ({
    status: result.redirectList[0]?.status ?? result.status,
    location: result.redirectList[0] ? normalize(result.redirectList[0].to) : undefined,
    finalStatus: result.status,
  })
  const remoteSummary = summarize(remoteFetch)
  const localSummary = summarize(localFetch)
  if (JSON.stringify(remoteSummary) !== JSON.stringify(localSummary))
    collector.add('major', 'redirect', '轉址行為不同', { remote: remoteSummary, local: localSummary })
  else
    collector.add('info', 'redirect', `轉址行為一致（${remoteSummary.status}${remoteSummary.location ? ` → ${remoteSummary.location}` : ''}）`)
  return collector.findingList
}
