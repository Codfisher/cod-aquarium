import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const VIEWPORT = { width: 1280, height: 800 }
/** 擋掉分析與廣告腳本：避免灌水正式站流量統計，也讓兩邊截圖不受廣告影響 */
const BLOCKED_HOST_RE = /(?:googletagmanager|google-analytics|clarity\.ms|googlesyndication|doubleclick|adtrafficquality|adservice\.google)\./i
/** 像素任一通道差超過此值才算不同，吸收字型反鋸齒等細微差異 */
const PIXEL_THRESHOLD = 40

/** 載入頁面並收集執行期錯誤與截圖 */
async function loadPage(context, url, screenshotPath, { settleMs }) {
  const page = await context.newPage()
  const consoleErrorList = []
  const pageErrorList = []
  const failedRequestList = []

  page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrorList.push(message.text().slice(0, 500))
  })
  page.on('pageerror', (error) => pageErrorList.push(String(error?.stack ?? error).slice(0, 800)))
  page.on('requestfailed', (request) => {
    if (BLOCKED_HOST_RE.test(request.url()))
      return
    failedRequestList.push({ url: request.url(), reason: request.failure()?.errorText ?? 'failed' })
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && !BLOCKED_HOST_RE.test(response.url()))
      failedRequestList.push({ url: response.url(), reason: `HTTP ${response.status()}` })
  })

  let loadError
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(settleMs)
    await page.screenshot({ path: screenshotPath, animations: 'disabled', caret: 'hide' })
  }
  catch (error) {
    loadError = String(error?.message ?? error).split('\n')[0]
  }
  finally {
    await page.close()
  }

  return { consoleErrorList, pageErrorList, failedRequestList, loadError }
}

/** 兩張截圖的像素差異比例，並輸出差異圖（紅色為不同處） */
export async function comparePixel(remotePath, localPath, diffPath) {
  const [remoteImage, localImage] = await Promise.all([remotePath, localPath].map((filePath) =>
    sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ))
  const width = Math.min(remoteImage.info.width, localImage.info.width)
  const height = Math.min(remoteImage.info.height, localImage.info.height)
  const diffBuffer = Buffer.alloc(width * height * 4)
  let diffCount = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const remoteOffset = (y * remoteImage.info.width + x) * 4
      const localOffset = (y * localImage.info.width + x) * 4
      const targetOffset = (y * width + x) * 4
      let maxDelta = 0
      for (let channel = 0; channel < 3; channel++)
        maxDelta = Math.max(maxDelta, Math.abs(remoteImage.data[remoteOffset + channel] - localImage.data[localOffset + channel]))

      if (maxDelta > PIXEL_THRESHOLD) {
        diffCount++
        diffBuffer.set([255, 0, 0, 255], targetOffset)
      }
      else {
        // 相同處用淡化的灰階本機畫面當底，方便對照位置
        const gray = Math.round((localImage.data[localOffset] + localImage.data[localOffset + 1] + localImage.data[localOffset + 2]) / 3)
        const faded = Math.round(255 - (255 - gray) * 0.3)
        diffBuffer.set([faded, faded, faded, 255], targetOffset)
      }
    }
  }

  await sharp(diffBuffer, { raw: { width, height, channels: 4 } }).png().toFile(diffPath)
  return {
    ratio: diffCount / (width * height),
    isSizeDifferent: remoteImage.info.width !== localImage.info.width || remoteImage.info.height !== localImage.info.height,
  }
}

function toFileSlug(urlPath) {
  return urlPath.replace(/^\/|\/$/g, '').replace(/[^\w-]+/g, '_') || 'index'
}

/**
 * 實際載入本機與正式站頁面：記錄本機的 console error、pageerror、失敗請求，並做首屏截圖比對。
 * 正式站也收集錯誤，用來區分「本機新增」與「原本就有」
 */
export async function runBrowserCheck({ browser, pathList, remoteOrigin, localOrigin, outputDir, concurrency, onProgress }) {
  const screenshotDir = path.join(outputDir, 'screenshots')
  // 清掉上一次的截圖，避免報告混到舊檔
  fs.rmSync(screenshotDir, { recursive: true, force: true })
  fs.mkdirSync(screenshotDir, { recursive: true })

  const createContext = async () => {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'zh-TW',
    })
    await context.route(BLOCKED_HOST_RE, (route) => route.abort())
    return context
  }

  const resultMap = new Map()
  const queuePathList = [...pathList]
  let doneCount = 0

  async function worker() {
    const context = await createContext()
    try {
      while (queuePathList.length) {
        const urlPath = queuePathList.shift()
        const isAquarium = urlPath.startsWith('/aquarium/')
        // WebGL 應用需要較久才會畫出第一張畫面
        const settleMs = isAquarium ? 4000 : 1500
        const slug = toFileSlug(urlPath)
        const localShot = path.join(screenshotDir, `${slug}.local.png`)
        const remoteShot = path.join(screenshotDir, `${slug}.remote.png`)
        const diffShot = path.join(screenshotDir, `${slug}.diff.png`)

        const local = await loadPage(context, `${localOrigin}${urlPath}`, localShot, { settleMs })
        const remote = await loadPage(context, `${remoteOrigin}${urlPath}`, remoteShot, { settleMs })

        let pixel
        if (!local.loadError && !remote.loadError) {
          try {
            pixel = await comparePixel(remoteShot, localShot, diffShot)
          }
          catch (error) {
            pixel = { error: String(error) }
          }
        }

        resultMap.set(urlPath, {
          isAquarium,
          local,
          remote,
          pixel,
          screenshot: {
            local: path.relative(outputDir, localShot).replace(/\\/g, '/'),
            remote: path.relative(outputDir, remoteShot).replace(/\\/g, '/'),
            diff: pixel && !pixel.error ? path.relative(outputDir, diffShot).replace(/\\/g, '/') : undefined,
          },
        })
        onProgress?.(++doneCount, pathList.length, urlPath)
      }
    }
    finally {
      await context.close()
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
  return resultMap
}

/** 把瀏覽器檢查結果轉成發現項目 */
export function toBrowserFindingList(result) {
  const findingList = []
  const add = (severity, message, detail) => findingList.push({ severity, category: 'browser', message, ...(detail === undefined ? {} : { detail }) })
  const { local, remote, pixel, isAquarium } = result

  if (local.loadError)
    add('critical', `本機頁面載入失敗：${local.loadError}`)

  const remoteMessageSet = new Set([...remote.pageErrorList, ...remote.consoleErrorList].map((message) => message.split('\n')[0]))
  const isNewMessage = (message) => !remoteMessageSet.has(message.split('\n')[0])

  const newPageErrorList = local.pageErrorList.filter(isNewMessage)
  if (newPageErrorList.length)
    add('critical', `本機有 ${newPageErrorList.length} 個未捕捉的 JS 錯誤（pageerror）`, newPageErrorList)
  const knownPageErrorList = local.pageErrorList.filter((message) => !isNewMessage(message))
  if (knownPageErrorList.length)
    add('info', `pageerror 正式站也有（${knownPageErrorList.length} 個）`, knownPageErrorList)

  const newConsoleErrorList = local.consoleErrorList.filter(isNewMessage)
  if (newConsoleErrorList.length)
    add('major', `本機有 ${newConsoleErrorList.length} 個 console error`, newConsoleErrorList)

  const localOriginFailedList = local.failedRequestList
  if (localOriginFailedList.length) {
    const remoteFailedPathSet = new Set(remote.failedRequestList.map((item) => {
      try {
        return new URL(item.url).pathname
      }
      catch {
        return item.url
      }
    }))
    const newFailedList = localOriginFailedList.filter((item) => {
      try {
        return !remoteFailedPathSet.has(new URL(item.url).pathname)
      }
      catch {
        return true
      }
    })
    if (newFailedList.length)
      add('major', `本機有 ${newFailedList.length} 個請求失敗`, newFailedList.slice(0, 30))
  }

  if (pixel?.error) {
    add('minor', `截圖比對失敗：${pixel.error}`)
  }
  else if (pixel) {
    const percent = `${(pixel.ratio * 100).toFixed(1)}%`
    const severity = isAquarium
      ? (pixel.ratio > 0.6 ? 'minor' : 'info')
      : (pixel.ratio > 0.15 ? 'major' : pixel.ratio > 0.03 ? 'minor' : 'info')
    add(severity, `首屏像素差異 ${percent}${isAquarium ? '（WebGL 頁，容忍度高）' : ''}`, result.screenshot)
  }
  return findingList
}
