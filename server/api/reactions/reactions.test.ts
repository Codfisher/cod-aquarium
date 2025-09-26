import { readD1Migrations } from '@cloudflare/vitest-pool-workers/config'
import { applyD1Migrations, env, SELF } from 'cloudflare:test'

import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(async () => {
  const migrations = await readD1Migrations('../../drizzle')
  await applyD1Migrations(env.DB, migrations)
})

describe('reactions api', () => {
  it('responds with not found and proper status for /404', async () => {
    const response = await SELF.fetch('http://example.com/404')
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})
