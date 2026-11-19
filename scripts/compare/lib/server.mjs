/**
 * 模擬 Cloudflare Pages 靜態路由規則的本機伺服器，直接服務 dist/。
 *
 * - /foo 有 foo.html 就回它；/foo/ 有 foo/index.html 就回它
 * - /foo.html → 308 /foo；/foo/index.html → 308 /foo/
 * - /foo 只有 foo/index.html → 308 /foo/；/foo/ 只有 foo.html → 308 /foo
 * - 找不到時由近到遠找 404.html，狀態 404；整站都沒有 404.html 時回 /index.html（SPA 模式）
 * - 套用 _headers 中的自訂標頭（支援 * 萬用字元）
 *
 * 單獨執行：node scripts/compare/lib/server.mjs [--dist dist] [--port 4174]
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const CONTENT_TYPE_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.rss': 'application/rss+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ndjson': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.pf_meta': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
  '.pagefind': 'application/octet-stream',
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  }
  catch {
    return false
  }
}

/** 解析 _headers：網址樣式 + 縮排的「名稱: 值」，# 開頭為註解 */
function parseHeadersFile(distPath) {
  const filePath = path.join(distPath, '_headers')
  if (!isFile(filePath))
    return []

  const ruleList = []
  let currentRule
  for (const rawLine of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#'))
      continue
    if (!/^\s/.test(rawLine)) {
      const pattern = rawLine.trim()
      const regexSource = pattern
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:\w+/g, '[^/]+'))
        .join('.*')
      currentRule = { pattern: new RegExp(`^${regexSource}$`), headerList: [] }
      ruleList.push(currentRule)
      continue
    }
    const separatorIndex = rawLine.indexOf(':')
    if (currentRule && separatorIndex > 0) {
      currentRule.headerList.push([rawLine.slice(0, separatorIndex).trim(), rawLine.slice(separatorIndex + 1).trim()])
    }
  }
  return ruleList
}

/** 依 Cloudflare Pages 規則解析請求路徑，回傳要送出的檔案或轉址 */
export function resolveRequest(distPath, pathname) {
  const decodedPath = decodeURIComponent(pathname)
  // 防止 ../ 跳出 dist
  const safePath = path.posix.normalize(decodedPath)
  if (!safePath.startsWith('/'))
    return { type: 'notFound' }
  const toFsPath = (urlPath) => path.join(distPath, ...urlPath.split('/').filter(Boolean))

  if (safePath.endsWith('/index.html'))
    return { type: 'redirect', location: safePath.slice(0, -'index.html'.length) }
  if (safePath.endsWith('.html') && isFile(toFsPath(safePath)))
    return { type: 'redirect', location: safePath.slice(0, -'.html'.length) }

  if (safePath.endsWith('/')) {
    if (isFile(path.join(toFsPath(safePath), 'index.html')))
      return { type: 'file', filePath: path.join(toFsPath(safePath), 'index.html') }
    const trimmedPath = safePath.replace(/\/+$/, '')
    if (trimmedPath && isFile(`${toFsPath(trimmedPath)}.html`))
      return { type: 'redirect', location: trimmedPath }
    return { type: 'notFound' }
  }

  if (isFile(toFsPath(safePath)))
    return { type: 'file', filePath: toFsPath(safePath) }
  if (isFile(`${toFsPath(safePath)}.html`))
    return { type: 'file', filePath: `${toFsPath(safePath)}.html` }
  if (isFile(path.join(toFsPath(safePath), 'index.html')))
    return { type: 'redirect', location: `${safePath}/` }
  return { type: 'notFound' }
}

/** 由請求所在目錄往上找最近的 404.html */
function findNotFoundPage(distPath, pathname) {
  const segmentList = pathname.split('/').filter(Boolean)
  for (let depth = segmentList.length; depth >= 0; depth--) {
    const candidate = path.join(distPath, ...segmentList.slice(0, depth), '404.html')
    if (isFile(candidate))
      return candidate
  }
  return undefined
}

export function startServer({ distPath, port = 0, host = '127.0.0.1' }) {
  const headerRuleList = parseHeadersFile(distPath)

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    let result
    try {
      result = resolveRequest(distPath, url.pathname)
    }
    catch {
      result = { type: 'notFound' }
    }

    if (result.type === 'redirect') {
      response.writeHead(308, { Location: `${result.location}${url.search}` })
      response.end()
      return
    }

    let filePath = result.type === 'file' ? result.filePath : findNotFoundPage(distPath, url.pathname)
    let statusCode = result.type === 'file' ? 200 : 404
    if (!filePath) {
      // 沒有任何 404.html 時 Cloudflare 視為 SPA，回首頁
      filePath = path.join(distPath, 'index.html')
      statusCode = isFile(filePath) ? 200 : 404
    }
    if (!isFile(filePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not Found')
      return
    }

    const headers = {
      'Content-Type': CONTENT_TYPE_MAP[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }
    for (const rule of headerRuleList) {
      if (rule.pattern.test(url.pathname)) {
        for (const [name, value] of rule.headerList)
          headers[name] = value
      }
    }

    response.writeHead(statusCode, headers)
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    fs.createReadStream(filePath).pipe(response)
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      const origin = `http://${host}:${typeof address === 'object' && address ? address.port : port}`
      resolve({
        origin,
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      })
    })
  })
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isDirectRun) {
  const { values } = parseArgs({
    options: {
      dist: { type: 'string', default: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist') },
      port: { type: 'string', default: '4174' },
    },
  })
  const { origin } = await startServer({ distPath: path.resolve(values.dist), port: Number(values.port) })
  console.log(`以 Cloudflare Pages 規則服務 ${path.resolve(values.dist)}：${origin}`)
}
