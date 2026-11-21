<template>
  <a :href="href">
    <slot>{{ address }}</slot>
  </a>
</template>

<script setup lang="ts">
import { useMounted } from '@vueuse/core'
import { computed } from 'vue'

/**
 * 站長信箱連結。信箱只在 client 掛載後才組出來，prerender 的 HTML 不含明文，
 * Cloudflare 的 Email Address Obfuscation 就不會注入擋渲染的 email-decode.min.js。
 * 不給 slot 時，連結文字顯示信箱本身。
 */
/** site/constants.ts 含 node 模組，不能進 client bundle，所以信箱在此自成一份；
 * 拆成兩段再組合，避免被建置時的常數折疊成明文
 */
const SITE_EMAIL = ['hi', 'codlin.me'].join('@')

const isMounted = useMounted()

const address = computed(() => (isMounted.value ? SITE_EMAIL : ''))
const href = computed(() => (isMounted.value ? `mailto:${SITE_EMAIL}` : undefined))
</script>
