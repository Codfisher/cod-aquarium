---
title: Minespace
description: 戴上耳機，在箱庭一隅聆聽。無盡白沙上散落二十二座木座箱庭，每座只收一種聲音的質地：連綿的風、稀疏的滴水、低頻的蛙鳴。
layout: false
---

<script setup>
import { ClientOnly } from '#components'
import { useHead } from 'nuxt/app'
import { defineAsyncComponent } from 'vue'

/** app 只在瀏覽器執行（Babylon 需要 window），SSR 不渲染也不載入程式碼。
 * 原本由 whyframe 的 iframe 達成，進出本頁改為整頁載入，見 app/plugins/standalone-navigation.client.ts
 */
const Minespace = defineAsyncComponent(() => import('./minespace.vue'))

/** app 以相對路徑載入資源（assets/...、minespace/...），原本在 iframe 的 /_frame 下從根目錄解析，
 * 這裡以 base 維持同樣的解析基準
 */
useHead({ base: { href: '/' } })
</script>

<div class="fixed inset-0 w-dvw h-dvh">
  <client-only>
    <minespace />
  </client-only>
</div>
