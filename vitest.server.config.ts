import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  resolve: {
    alias: {
      'node:sqlite': 'unenv/runtime/mock/empty',
      'sqlite': 'unenv/runtime/mock/empty',
    },
  },
  test: {
    name: 'server',
    include: ['./server/**/*.{test,spec}.ts'],
    deps: {
      optimizer: {
        ssr: {
          // 2) 開啟 SSR 依賴優化，並指定要處理的套件
          enabled: true,
          include: ['@cloudflare/vitest-pool-workers'],

          // 3) 讓 esbuild 目標支援 Top-level await
          esbuildOptions: {
            target: 'esnext',
            supported: { 'top-level-await': true },
          },
        },
      },
    },
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
})
