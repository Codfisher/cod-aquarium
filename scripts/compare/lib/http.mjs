import PQueue from 'p-queue'

/** 通用名稱，不帶個人或專案資訊 */
export const USER_AGENT = 'Mozilla/5.0 (compatible; site-compare/1.0)'
const MAX_REDIRECT_COUNT = 5

/** 每個來源一個佇列，正式站併發上限 4，避免對線上站造成負擔 */
export function createFetcher({ concurrency }) {
  const queue = new PQueue({ concurrency })

  /** 手動跟隨轉址，保留每一跳的狀態碼 */
  async function fetchWithChain(url, { headOnly = false } = {}) {
    return queue.add(async () => {
      const redirectList = []
      let currentUrl = url
      for (let count = 0; count <= MAX_REDIRECT_COUNT; count++) {
        let response
        try {
          response = await fetch(currentUrl, {
            method: headOnly ? 'HEAD' : 'GET',
            redirect: 'manual',
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(30_000),
          })
        }
        catch (error) {
          return { url, finalUrl: currentUrl, status: 0, redirectList, error: String(error?.cause ?? error), headers: {}, body: '' }
        }

        const location = response.headers.get('location')
        if (response.status >= 300 && response.status < 400 && location) {
          const nextUrl = new URL(location, currentUrl).href
          redirectList.push({ status: response.status, from: currentUrl, to: nextUrl })
          await response.body?.cancel()
          currentUrl = nextUrl
          continue
        }

        return {
          url,
          finalUrl: currentUrl,
          status: response.status,
          redirectList,
          headers: Object.fromEntries(response.headers.entries()),
          body: headOnly ? '' : await response.text(),
        }
      }
      return { url, finalUrl: currentUrl, status: 0, redirectList, error: '轉址次數過多', headers: {}, body: '' }
    })
  }

  return { fetchWithChain, queue }
}
