/**
 * 用 Chromium 解析 HTML（停用 JS、擋下所有子資源），只讀伺服器輸出的原始內容，
 * 跟搜尋引擎第一次抓到的一致，不受 hydration 影響
 */

/** 在頁面內執行，回傳比對所需的欄位 */
function extractInPage() {
  const normalizeText = (value) => (value ?? '').replace(/[\s\u200B]+/g, ' ').trim()
  const getContent = (selector) => document.querySelector(selector)?.getAttribute('content') ?? null

  const metaMap = {}
  for (const element of document.querySelectorAll('meta[property], meta[name]')) {
    const key = element.getAttribute('property') ?? element.getAttribute('name') ?? ''
    if (!/^(?:og|twitter|article):/.test(key))
      continue
    metaMap[key] ??= []
    metaMap[key].push(element.getAttribute('content') ?? '')
  }

  const jsonLdList = [...document.querySelectorAll('script[type="application/ld+json"]')].map((element) => {
    try {
      return JSON.parse(element.textContent ?? '')
    }
    catch (error) {
      return { __parseError: String(error), raw: element.textContent }
    }
  })

  /** 只看真正的頁面資源宣告，略過帶 hash 的 JS/CSS（框架不同必然不同） */
  const headLinkList = [...document.querySelectorAll('head link[rel]')]
    .filter((element) => {
      const rel = element.getAttribute('rel') ?? ''
      const as = element.getAttribute('as') ?? ''
      return !['stylesheet', 'modulepreload', 'prefetch', 'dns-prefetch'].includes(rel) && !['script', 'style', 'font'].includes(as)
    })
    .map((element) => [
      element.getAttribute('rel'),
      element.getAttribute('href'),
      element.getAttribute('as'),
      element.getAttribute('imagesrcset'),
    ].filter(Boolean).join(' | '))

  const doc = document.querySelector('.vp-doc')
  let docText = null
  if (doc) {
    const clone = doc.cloneNode(true)
    for (const element of clone.querySelectorAll('.header-anchor, style, script, template, .line-numbers-wrapper, button.copy, span.lang, noscript'))
      element.remove()
    // 區塊元素之間補換行，讓句子切割不會黏在一起
    for (const element of clone.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre, tr, div, blockquote, figcaption'))
      element.append('\n')
    docText = (clone.textContent ?? '')
      // Cloudflare 把 email 改寫成「[email protected]」，本機沒有這層
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email protected]')
      .replace(/[ \t\u200B]+/g, ' ')
      .replace(/\n\s*/g, '\n')
      .trim()
  }

  const getHrefList = (selector) => [...document.querySelectorAll(selector)].map((element) => element.getAttribute('href') ?? '')
  const scope = doc ?? document.body

  return {
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    metaDescription: getContent('meta[name="description"]'),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    robots: getContent('meta[name="robots"]'),
    metaMap,
    jsonLdList,
    headLinkList,
    h1List: [...document.querySelectorAll('h1')].map((element) => {
      const clone = element.cloneNode(true)
      clone.querySelector('.header-anchor')?.remove()
      return normalizeText(clone.textContent)
    }),
    hasDoc: !!doc,
    docText,
    headingIdList: doc ? [...doc.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')].map((element) => element.id) : [],
    imageSrcList: [...scope.querySelectorAll('img')].map((element) => element.getAttribute('src') ?? element.getAttribute('data-src') ?? ''),
    codeBlockCount: doc ? doc.querySelectorAll('div[class*="language-"]').length : 0,
    preCount: doc ? doc.querySelectorAll('pre').length : 0,
    contentLinkList: doc ? getHrefList('.vp-doc a[href]') : getHrefList('main a[href]'),
    sidebarLinkList: getHrefList('.VPSidebar a[href]'),
    navLinkList: getHrefList('.VPNavBar a[href]'),
    hasPagefindBody: !!document.querySelector('[data-pagefind-body]'),
  }
}

/** 建立解析器：共用一個停用 JS 的瀏覽器 context，逐頁 setContent */
export async function createHtmlParser(browser) {
  const context = await browser.newContext({ javaScriptEnabled: false })
  // 解析不需要任何子資源，全部擋掉，避免對正式站或第三方發出請求
  await context.route('**/*', (route) => route.abort())

  async function parse(html) {
    const page = await context.newPage()
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
      return await page.evaluate(extractInPage)
    }
    finally {
      await page.close()
    }
  }

  return { parse, close: () => context.close() }
}
