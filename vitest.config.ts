import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    projects: [
      {
        test: {
          include: [
            '**/*.{test,spec}.ts',
          ],
          // 瀏覽器測試在 node 環境必定失敗，交給 browser 專案跑
          exclude: [
            '**/node_modules/**',
            '**/*.browser.{test,spec}.ts',
            // server 測試要在 workerd 跑，由 server 專案負責
            'server/**',
          ],
          name: 'unit',
          environment: 'node',
        },
      },
      {
        // 專案設定不會繼承根層 plugins，少了它就編不了 .vue
        plugins: [vue()],
        test: {
          include: [
            '**/*.browser.{test,spec}.ts',
          ],
          name: 'browser',
          browser: {
            provider: 'playwright',
            enabled: true,
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      },
      'vitest.server.config.ts',
    ],
  },
})
