---
layout: false
---

<div ref="el" class="w-dvw h-dvh"></div>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { createApp } from 'whyframe:app'

const el = ref<HTMLDivElement>()

onMounted(() => {
  if (!el.value || !window.frameElement) return
  document.documentElement.classList.add('vp-raw')

  createApp(el.value)

  ;(window.frameElement as HTMLIFrameElement).style.visibility = 'visible'
})
</script>
