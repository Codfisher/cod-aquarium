import path from 'node:path'
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig(async () => {
  /** migrations 只能在 Node 端讀取，透過 binding 交給 workerd 內的測試套用 */
  const migrationList = await readD1Migrations(path.join(import.meta.dirname, 'server/drizzle'))

  return {
    test: {
      name: 'server',
      include: ['./server/**/*.{test,spec}.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          /** wrangler.jsonc 是 Pages 設定、沒有 main，SELF 的進入點在這裡指定 */
          main: './server/hono/index.ts',
          wrangler: { configPath: './wrangler.jsonc' },
          miniflare: {
            /** workerd 原生 node:console 尚未實作 Console 類別，vitest 會呼叫它；測試環境改回 polyfill */
            compatibilityFlags: ['nodejs_compat', 'disable_nodejs_console_module'],
            bindings: { TEST_MIGRATION_LIST: migrationList },
          },
        },
      },
    },
  }
})
