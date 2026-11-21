---
title: 鱈魚的彈珠
description: 此專案沒有偉大的技術願景，純粹就是我想看東西滾來滾去而誕生的專案。(ゝ∀・)b
image: https://codlin.me/codmarbles-cover.webp
layout: false
---

<script setup>
import { ClientOnly } from '#components'
import { useHead } from 'nuxt/app'
import { defineAsyncComponent } from 'vue'
import LoadingOverlay from './components/loading-overlay.vue'

/** app 只在瀏覽器執行（Babylon 需要 window），SSR 不渲染也不載入程式碼。
 * 原本由 whyframe 的 iframe 達成，進出本頁改為整頁載入，見 app/plugins/standalone-navigation.client.ts
 */
const Codmarbles = defineAsyncComponent({
  loader: () => import('./codmarbles.vue'),
  /** app 本體含整個 Babylon（約 2.4 MB JS），下載期間顯示與首屏 fallback、app 內相同的載入畫面，不能留白；
   * suspensible 要關：預設會把載入交給 Nuxt 頁面外層的 Suspense，loadingComponent 不會顯示，
   * ClientOnly 換掉 fallback 後到 app 載完前畫面一片空白（實測 hydration 後約 12 秒） */
  loadingComponent: LoadingOverlay,
  delay: 0,
  suspensible: false,
})

/** app 以相對路徑載入資源（assets/...、codmarbles/...），原本在 iframe 的 /_frame 下從根目錄解析，
 * 這裡以 base 維持同樣的解析基準
 */
useHead({ base: { href: '/' } })
</script>

<div class="fixed inset-0 w-dvw h-dvh">
  <client-only>
    <codmarbles />
    <template #fallback>
      <loading-overlay />
    </template>
  </client-only>
</div>
