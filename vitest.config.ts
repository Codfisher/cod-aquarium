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
          name: 'unit',
          environment: 'node',
        },
      },
      {
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
    ],
  },
})
