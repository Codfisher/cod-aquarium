import serverData from '#site/server-data'

/** headMap 的單一標籤：[標籤名, 屬性, 內容?]，與 VitePress 的 HeadConfig 同格式 */
type HeadTag = [string, Record<string, string>] | [string, Record<string, string>, string]

const headMap = serverData.headMap as Record<string, HeadTag[]>

const VOID_TAG_SET = new Set(['meta', 'link', 'base'])

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** script 內容（JSON-LD）原樣輸出，只擋掉提早結束標籤的 </script */
function escapeScriptContent(value: string) {
  return value.replace(/<\/(script)/gi, '<\\/$1')
}

function renderHeadTag([tagName, attrs, content]: HeadTag) {
  const attrText = Object.entries(attrs)
    .map(([key, value]) => value === '' ? ` ${key}` : ` ${key}="${escapeAttribute(String(value))}"`)
    .join('')

  if (VOID_TAG_SET.has(tagName))
    return `<${tagName}${attrText}>`

  const innerText = content === undefined
    ? ''
    : tagName === 'script' || tagName === 'style'
      ? escapeScriptContent(content)
      : escapeText(content)
  return `<${tagName}${attrText}>${innerText}</${tagName}>`
}

/** 網址查 head，容忍尾斜線與 .html 差異（同 #vp 的 getPageData） */
function getHeadTagList(urlPath: string): HeadTag[] | undefined {
  let decodedPath = urlPath
  try {
    decodedPath = decodeURI(urlPath)
  }
  catch {}

  return headMap[decodedPath]
    ?? headMap[decodedPath.replace(/\/$/, '')]
    ?? headMap[`${decodedPath}/`]
    ?? headMap[decodedPath.replace(/\.html$/, '')]
}

/** 把 build 期算好、與 SEO 無關的 head（LCP preload、meme ndjson preload、llms 連結，見 site/head.ts）
 * 直接寫進 SSR／prerender 的 HTML，附加在 head 最後，client 換頁不更新。
 *
 * canonical、Open Graph、JSON-LD 等 SEO 標籤改由 app/plugins/site-seo.server.ts 交給 Nuxt SEO 模組輸出
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const urlPath = (event.path || '/').split('?')[0] ?? '/'
    const headTagList = getHeadTagList(urlPath)
    if (!headTagList?.length)
      return

    html.head.push(headTagList.map(renderHeadTag).join(''))
  })
})
