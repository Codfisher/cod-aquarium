---
title: HexaZen
description: 組合多種場景並產生不同的自然音效
image: https://codlin.me/hexazen-cover.webp
layout: false
---

<script setup>
import { ClientOnly } from '#components'
import { useHead } from 'nuxt/app'
import { defineAsyncComponent } from 'vue'
import LoadingScreen from './components/loading-screen.vue'

/** app 只在瀏覽器執行（Babylon 需要 window），SSR 不渲染也不載入程式碼。
 * 原本由 whyframe 的 iframe 達成，進出本頁改為整頁載入，見 app/plugins/standalone-navigation.client.ts
 */
const Hexazen = defineAsyncComponent({
  loader: () => import('./hexazen.vue'),
  /** app 本體含整個 Babylon，下載期間顯示與首屏 fallback 相同的載入畫面，不能留白；
   * suspensible 要關：預設會把載入交給 Nuxt 頁面外層的 Suspense，loadingComponent 不會顯示，
   * ClientOnly 換掉 fallback 後到 app 載完前畫面一片空白（實測 hydration 後約 12 秒） */
  loadingComponent: LoadingScreen,
  delay: 0,
  suspensible: false,
})

/** app 以相對路徑載入資源（assets/...、hexazen/...），原本在 iframe 的 /_frame 下從根目錄解析，
 * 這裡以 base 維持同樣的解析基準
 */
useHead({ base: { href: '/' } })
</script>

<div class="fixed inset-0 w-dvw h-dvh">
  <client-only>
    <hexazen />
    <template #fallback>
      <loading-screen />
    </template>
  </client-only>
</div>
