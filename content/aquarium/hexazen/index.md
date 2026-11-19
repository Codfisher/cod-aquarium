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

/** app 只在瀏覽器執行（Babylon 需要 window），SSR 不渲染也不載入程式碼。
 * 原本由 whyframe 的 iframe 達成，進出本頁改為整頁載入，見 app/plugins/standalone-navigation.client.ts
 */
const Hexazen = defineAsyncComponent(() => import('./hexazen.vue'))

/** app 以相對路徑載入資源（assets/...、hexazen/...），原本在 iframe 的 /_frame 下從根目錄解析，
 * 這裡以 base 維持同樣的解析基準
 */
useHead({ base: { href: '/' } })
</script>

<div class="fixed inset-0 w-dvw h-dvh">
  <client-only>
    <hexazen />
  </client-only>
</div>
