import type { Env } from '../../type'
import { readD1Migrations } from '@cloudflare/vitest-pool-workers/config'
import { env as _env, applyD1Migrations, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'

const env = _env as Env

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
