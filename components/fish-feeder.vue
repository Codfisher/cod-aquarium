<template>
  {{ articleId }}
</template>

<script setup lang="ts">
import type { AppType } from '../server'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { useAsyncState } from '@vueuse/core'
import { hc } from 'hono/client'
import { pipe, prop } from 'remeda'
import { useRoute } from 'vitepress'
import { computed } from 'vue'
import { then } from '../common/remeda'

const route = useRoute()

const {
  isLoading,
  state: userId,
} = useAsyncState(async () => pipe(
  FingerprintJS.load(),
  then((agent) => agent.get()),
  then(prop('visitorId')),
), undefined)

const articleId = computed(() => {
  // 去除頭尾 /、.html
  const value = encodeURIComponent(
    route.path.replace(/^\/|\.html$/g, ''),
  )

  return value.includes('blog-') || value.includes('column-') ? value : ''
})

const client = hc<AppType>('https://cod-aquarium-server.codfish-2140.workers.dev/')

client.api.reactions.$get({
  query: {
    articleId: articleId.value,
  },
}).then((res) => {
  console.log(res)
})
</script>

<style scoped lang="sass">
</style>
