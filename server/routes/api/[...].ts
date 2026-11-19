import type { ExecutionContext } from '@cloudflare/workers-types'
import type { Env } from '../../hono/type'
import app from '../../hono'

interface CloudflareContext {
  env: Env['Bindings'];
  context: ExecutionContext;
}

/** /api/** 全數交給 Hono，路徑與行為與原本獨立 Worker 相同
 *
 * defineEventHandler、toWebRequest、createError 由 Nitro 自動匯入（h3 不是直接依賴，pnpm 下無法直接 import）
 *
 * Hono 程式放在 server/hono/，不在 Nitro 掃描的 api、routes 等目錄內，不會被誤當成 handler
 */
export default defineEventHandler((event) => {
  /** 正式環境由 cloudflare-pages preset 注入；nuxt dev 由 Nitro 的 cloudflare-dev 以 wrangler getPlatformProxy 模擬 */
  const cloudflare: CloudflareContext | undefined = event.context.cloudflare

  if (!cloudflare?.env) {
    throw createError({ statusCode: 503, statusMessage: 'Cloudflare bindings 不存在' })
  }

  return app.fetch(toWebRequest(event), cloudflare.env, cloudflare.context)
})
