import type { Plugin } from 'vite'

/** 建置相容性修補，原因都是套件在 Nuxt（Vite 8）下的邊角問題 */
export function viteBuildWorkaround(): Plugin[] {
  return [
    {
      /** @mlc-ai/web-llm 的打包檔近 7 MB，只有一段註解範例寫了 new URL(..., import.meta.url)，
       * Vite 的 asset-import-meta-url 因此去掃整份檔案，正規式在超長字串上堆疊溢位。
       * 拿掉註解裡的 import.meta.url，該外掛就會略過這個檔案
       */
      name: 'site:web-llm-skip-import-meta-url',
      enforce: 'pre',
      transform(code, id) {
        if (!id.replace(/\\/g, '/').includes('/@mlc-ai/web-llm/lib/index.js'))
          return
        return {
          code: code.replace('new URL(\'./worker.ts\', import.meta.url)', 'new URL(\'./worker.ts\', location.href)'),
          map: null,
        }
      },
    },
  ]
}
