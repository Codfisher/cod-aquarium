import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    browser: {
      provider: 'playwright',
      enabled: true,
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
})
