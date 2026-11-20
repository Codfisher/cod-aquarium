/** 比對用的工具函式：網址正規化、物件深度比較、清單差異、內文相似度 */

const HASHED_ASSET_RE = /^(?:.*\/)?([^/.]+)\.[\w-]{8,}\.(js|css|png|jpe?g|webp|svg|gif|avif|woff2?)$/i

/**
 * 站內網址正規化：去掉來源、.html、結尾的 index，讓正式站（VitePress）與本機（Nuxt）的寫法可以互比。
 * 站外網址原樣保留
 */
export function normalizeUrl(href, pageUrl, siteOriginList) {
  if (!href)
    return ''
  // Cloudflare 會把頁面上的 email 改寫成 /cdn-cgi/l/email-protection#亂數，本機沒有這層，兩者視為相同
  if (/^mailto:/i.test(href) || /\/cdn-cgi\/l\/email-protection/.test(href))
    return 'mailto:(email)'
  if (/^(?:tel|javascript|data):/i.test(href))
    return href
  let url
  try {
    url = new URL(href, pageUrl)
  }
  catch {
    return href
  }
  if (!siteOriginList.includes(url.origin))
    return url.href

  let pathname = url.pathname
    .replace(/\.html$/, '')
    .replace(/\/index$/, '/')
  if (pathname === '')
    pathname = '/'
  return `${pathname}${url.search}${url.hash}`
}

/** 帶 hash 的打包資源只比檔名主體，例如 /assets/logo.a1b2c3d4.png → asset:logo.png */
export function normalizeAssetUrl(value) {
  const match = HASHED_ASSET_RE.exec(value)
  return match ? `asset:${match[1]}.${match[2]}` : value
}

function getType(value) {
  if (value === null)
    return 'null'
  if (Array.isArray(value))
    return 'array'
  return typeof value
}

/** 深度比較兩個 JSON 值，回傳每個不同處的路徑與兩邊的值 */
export function deepDiff(remote, local, currentPath = '$') {
  const remoteType = getType(remote)
  const localType = getType(local)
  if (remoteType !== localType)
    return [{ path: currentPath, remote, local }]

  if (remoteType === 'array') {
    const resultList = []
    const maxLength = Math.max(remote.length, local.length)
    for (let index = 0; index < maxLength; index++) {
      if (index >= remote.length)
        resultList.push({ path: `${currentPath}[${index}]`, remote: undefined, local: local[index] })
      else if (index >= local.length)
        resultList.push({ path: `${currentPath}[${index}]`, remote: remote[index], local: undefined })
      else
        resultList.push(...deepDiff(remote[index], local[index], `${currentPath}[${index}]`))
    }
    return resultList
  }

  if (remoteType === 'object') {
    const keySet = new Set([...Object.keys(remote), ...Object.keys(local)])
    return [...keySet].flatMap((key) => {
      const childPath = /^[\w$]+$/.test(key) ? `${currentPath}.${key}` : `${currentPath}[${JSON.stringify(key)}]`
      if (!(key in local))
        return [{ path: childPath, remote: remote[key], local: undefined }]
      if (!(key in remote))
        return [{ path: childPath, remote: undefined, local: local[key] }]
      return deepDiff(remote[key], local[key], childPath)
    })
  }

  return Object.is(remote, local) ? [] : [{ path: currentPath, remote, local }]
}

/** 清單差異（多重集合），另外回報兩邊內容相同但順序不同 */
export function diffList(remoteList, localList) {
  const countMap = new Map()
  for (const item of remoteList)
    countMap.set(item, (countMap.get(item) ?? 0) + 1)

  const extraList = []
  for (const item of localList) {
    const count = countMap.get(item) ?? 0
    if (count > 0)
      countMap.set(item, count - 1)
    else
      extraList.push(item)
  }
  const missingList = [...countMap.entries()].flatMap(([item, count]) => Array.from({ length: count }, () => item))
  const isOrderDifferent = !missingList.length && !extraList.length
    && remoteList.some((item, index) => item !== localList[index])

  return { missingList, extraList, isOrderDifferent, isSame: !missingList.length && !extraList.length && !isOrderDifferent }
}

/** 內文切成句子片段，中英文標點與換行都當分隔 */
function toSegmentList(text) {
  return (text ?? '')
    .split(/\n|(?<=[。！？!?；;])\s*/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * 以句子為單位做 LCS，算出依字數加權的相似度（0～1），並列出只出現在單邊的片段。
 * 句子數過多時改用集合比對，避免 O(n²) 記憶體爆掉
 */
export function compareText(remoteText, localText, { sampleLimit = 8 } = {}) {
  const remoteList = toSegmentList(remoteText)
  const localList = toSegmentList(localText)
  const totalLength = [...remoteList, ...localList].reduce((sum, segment) => sum + segment.length, 0)
  if (totalLength === 0)
    return { similarity: 1, onlyRemoteList: [], onlyLocalList: [] }

  const isRemoteMatchedList = Array.from({ length: remoteList.length }, () => false)
  const isLocalMatchedList = Array.from({ length: localList.length }, () => false)

  if (remoteList.length * localList.length <= 9_000_000) {
    const width = localList.length + 1
    const table = new Uint32Array((remoteList.length + 1) * width)
    for (let i = remoteList.length - 1; i >= 0; i--) {
      for (let j = localList.length - 1; j >= 0; j--) {
        table[i * width + j] = remoteList[i] === localList[j]
          ? table[(i + 1) * width + j + 1] + remoteList[i].length
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < remoteList.length && j < localList.length) {
      if (remoteList[i] === localList[j]) {
        isRemoteMatchedList[i++] = true
        isLocalMatchedList[j++] = true
      }
      else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        i++
      }
      else {
        j++
      }
    }
  }
  else {
    const localSet = new Set(localList)
    const remoteSet = new Set(remoteList)
    remoteList.forEach((segment, index) => {
      isRemoteMatchedList[index] = localSet.has(segment)
    })
    localList.forEach((segment, index) => {
      isLocalMatchedList[index] = remoteSet.has(segment)
    })
  }

  const matchedLength = remoteList.reduce((sum, segment, index) => sum + (isRemoteMatchedList[index] ? segment.length : 0), 0)
    + localList.reduce((sum, segment, index) => sum + (isLocalMatchedList[index] ? segment.length : 0), 0)
  const truncate = (segment) => segment.length > 160 ? `${segment.slice(0, 160)}…` : segment
  const onlyRemoteList = remoteList.filter((_, index) => !isRemoteMatchedList[index])
  const onlyLocalList = localList.filter((_, index) => !isLocalMatchedList[index])

  return {
    similarity: matchedLength / totalLength,
    onlyRemoteCount: onlyRemoteList.length,
    onlyLocalCount: onlyLocalList.length,
    onlyRemoteList: onlyRemoteList.slice(0, sampleLimit).map(truncate),
    onlyLocalList: onlyLocalList.slice(0, sampleLimit).map(truncate),
  }
}
