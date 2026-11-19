import type { D1Migration } from '@cloudflare/vitest-pool-workers/config'
import type { Env } from '../type'
import { applyD1Migrations, SELF, env as testEnv } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'

const env = testEnv as Env['Bindings'] & { TEST_MIGRATION_LIST: D1Migration[] }

const ARTICLE_ID = 'blog-ocean-world/241210.add-responsive-images-to-vite-press'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATION_LIST)
})

describe('reactions api', () => {
  it('不存在的路徑回應 404', async () => {
    const response = await SELF.fetch('http://example.com/404')
    expect(response.status).toBe(404)
  })

  it('沒有使用者 ID 時拒絕請求', async () => {
    const response = await SELF.fetch(`http://example.com/api/reactions?articleId=${ARTICLE_ID}`)
    expect(response.status).toBe(401)
  })

  it('取得沒人響應過的文章，總數與自己皆為 0', async () => {
    const response = await SELF.fetch(
      `http://example.com/api/reactions?articleId=${ARTICLE_ID}`,
      { headers: { 'x-user-id': 'test-user' } },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ total: 0, yours: 0 })
    expect(response.headers.get('set-cookie')).toContain('user-id=')
  })

  it('無效的文章 ID 回應 400', async () => {
    const response = await SELF.fetch('http://example.com/api/reactions', {
      method: 'POST',
      headers: { 'x-user-id': 'test-user', 'content-type': 'application/json' },
      body: JSON.stringify({ articleId: 'not-an-article', count: 1 }),
    })
    expect(response.status).toBe(400)
  })
})
