---
layout: false
---

<div ref="el" class="flex h-screen flex-col justify-center px-6 pb-5"></div>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createApp } from 'whyframe:app'

const el = ref<HTMLDivElement>()

onMounted(() => {
  if (!el.value || !window.frameElement) return
  document.documentElement.classList.add('vp-raw')
  createApp(el.value)
  ;(window.frameElement as HTMLIFrameElement).style.visibility = 'visible'
})
</script>
