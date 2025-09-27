<template>
  {{ articleId }}
</template>

<script setup lang="ts">
import type { AppType } from '../server'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { until, useAsyncState } from '@vueuse/core'
import { hc } from 'hono/client'
import { pipe, prop } from 'remeda'
import { useRoute } from 'vitepress'
import { computed } from 'vue'
import { then } from '../common/remeda'

const route = useRoute()

const {
  isLoading: isUserLoading,
  state: userId,
} = useAsyncState(async () => pipe(
  FingerprintJS.load(),
  then((agent) => agent.get()),
  then(prop('visitorId')),
), '')

const articleId = computed(() => {
  // 去除頭尾 /、.html
  const value = encodeURIComponent(
    route.path.replace(/^\/|\.html$/g, ''),
  )

  return value.includes('blog-') || value.includes('column-') ? value : ''
})

const client = hc<AppType>('https://cod-aquarium-server.codfish-2140.workers.dev/')

const {
  isLoading: isReactionsLoading,
  state: reactions,
} = useAsyncState(async () => {
  await until(isUserLoading).toBe(false)

  if (!articleId.value) {
    return 0
  }

  const res = await client.api.reactions.$get(
    { query: { articleId: articleId.value } },
    { headers: { 'x-user-id': userId.value } },
  )

  if (!res.ok) {
    throw new Error('Failed to fetch reactions')
  }
  const data = await res.json()
  return data.count ?? 0
}, null)
</script>

<style scoped lang="sass">
</style>
