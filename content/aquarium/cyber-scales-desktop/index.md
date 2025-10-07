---
title: Cyber Scales Desktop
description: 科幻風格的 Web Desktop 應用程式
image: https://codlin.me/cyber-scales-desktop.webp
layout: false
---

<script setup>
import { useMounted } from '@vueuse/core'
import CyberScalesDesktop from './cyber-scales-desktop.vue'

const isMounted = useMounted()
</script>

<cyber-scales-desktop v-if="isMounted" />
