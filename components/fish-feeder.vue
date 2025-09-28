<template>
  <div
    v-if="!!articleId"
    class="flex flex-col gap-4 p-4 border rounded-lg"
  >
    <span class="text-sm  ">
      餵個魚飼料吧，會跑出小魚喔！<span class="text-nowrap">(ゝ∀・)b</span>
    </span>

    <button
      ref="btnRef"
      class="feed-btn rounded-full p-6 text-xl tracking-wider select-none"
      :class="{ 'opacity-10 pointer-events-none': btnDisabled }"
      :disabled="btnDisabled"
      @click="addReaction()"
    >
      <transition
        name="text"
        mode="out-in"
      >
        <span :key="btnLabel"> {{ btnLabel }}</span>
      </transition>
    </button>

    <span class="text-xs opacity-60 text-center">
      <transition
        name="text"
        mode="out-in"
      >
        <span :key="totalText">
          {{ totalText }}

          <span class="text-nowrap"></span>
        </span>
      </transition>

    </span>

    <label class="text-xs opacity-80 text-center flex justify-center gap-1">
      <input
        v-model="isHiddenFish"
        type="checkbox"
      >
      <span> 隱藏魚群 </span>
    </label>

    <transition name="opacity">
      <div
        v-if="canvasVisible"
        :key="reactionData.total"
        class=" fixed w-screen h-screen top-0 left-0 pointer-events-none z-[999999999999] duration-300"
        :class="{ 'opacity-0': !btnVisible, 'opacity-80': btnVisible }"
      >
        <bg-flock
          ref="flockRef"
          :count="totalReaction"
          :size="fishSize"
        />
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import type { AppType } from '../server'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { until, useArraySome, useAsyncState, useIntersectionObserver, useWindowFocus, whenever } from '@vueuse/core'
import { hc } from 'hono/client'
import { debounce } from 'lodash-es'
import { pipe, prop } from 'remeda'
import { useRoute } from 'vitepress'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { then } from '../common/remeda'
import BgFlock from './bg-flock/bg-flock.vue'

const MAX_FEED_COUNT = 10

const route = useRoute()

const flockRef = useTemplateRef('flockRef')
const isFocused = useWindowFocus()

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

const currentReaction = ref(0)

const loadingOnce = ref(false)
watch(articleId, () => {
  loadingOnce.value = false
})

const {
  isLoading: isReactionDataLoading,
  state: reactionData,
  execute: refreshReactionData,
} = useAsyncState(
  async () => {
    await until(isUserLoading).toBe(false)

    if (!articleId.value) {
      return { total: 0, yours: 0 }
    }

    const res = await client.api.reactions.$get(
      { query: { articleId: articleId.value } },
      { headers: { 'x-user-id': userId.value } },
    )

    if (!res.ok) {
      console.error('取得讚數失敗', res.statusText)
      return { total: 0, yours: 0 }
    }

    loadingOnce.value = true
    return res.json()
  },
  { total: 0, yours: 0 },
  {
    immediate: false,
    resetOnExecute: false,
    onSuccess(data) {
      currentReaction.value = data.yours
    },
  },
)
const debouncedRefresh = debounce(refreshReactionData, 5000, {
  leading: true,
  trailing: false,
})

const totalReaction = computed(
  () => reactionData.value.total - reactionData.value.yours + currentReaction.value,
)

const postReaction = debounce(
  async () => {
    const res = await client.api.reactions.$post(
      { json: { articleId: articleId.value, count: currentReaction.value } },
      { headers: { 'x-user-id': userId.value } },
    )

    if (res.status === 429) {
      // 未來有空再改成比較漂亮的提示
      // eslint-disable-next-line no-alert
      alert('感謝大家的熱情，本文的魚今天吃太飽了，請明天再來 (*´∀`)~♥')
    }
  },
  1000,
  { leading: false, trailing: true },
)

function addReaction() {
  if (!articleId.value || currentReaction.value >= MAX_FEED_COUNT) {
    return
  }

  currentReaction.value++
  flockRef.value?.addRandomBoids(1)

  postReaction()
}

const isLoading = useArraySome(
  () => [
    isUserLoading,
    isReactionDataLoading,
  ],
  Boolean,
)

const fishSize = computed(() => {
  if (totalReaction.value > 2000) {
    return 5
  }
  if (totalReaction.value > 1000) {
    return 10
  }

  return 15
})
/** 隱藏魚群 */
const isHiddenFish = ref(false)

const btnRef = useTemplateRef('btnRef')
const btnIntersection = ref(true)
useIntersectionObserver(btnRef, ([entry]) => {
  btnIntersection.value = entry?.isIntersecting || false
})
const btnVisible = computed(() => {
  if (!isFocused.value) {
    return false
  }

  return btnIntersection.value
})

const btnLabel = computed(() => {
  if (isLoading.value) {
    return `正在呼喚小魚們...(´,,•ω•,,)`
  }

  return `餵飼料 (${currentReaction.value}/${MAX_FEED_COUNT})`
})
const btnDisabled = computed(() => (
  isLoading.value || currentReaction.value >= MAX_FEED_COUNT
))

const totalText = computed(() => {
  if (isLoading.value) {
    return `清點飼料中...`
  }

  if (totalReaction.value === 0) {
    return '成為第一個餵飼料的人吧！'
  }
  return `已累積 ${totalReaction.value} 份魚飼料了！`
})

whenever(btnVisible, () => {
  if (loadingOnce.value) {
    return
  }
  debouncedRefresh()
})

const canvasVisible = computed(() => {
  if (isLoading.value || isHiddenFish.value) {
    return false
  }

  return reactionData.value.total !== 0 || totalReaction.value > 0
})
</script>

<style scoped lang="sass">
.feed-btn
  background: linear-gradient(135deg, #5894f5 0%, #06b6d4 100%)
  color: #fff
  transition-duration: 200ms
  &:active
    scale: 0.98
    transition-duration: 10ms

.opacity
  &-enter-active, &-leave-active
    transition-duration: 0.4s
  &-enter-from, &-leave-to
    opacity: 0 !important

.text
  &-enter-active, &-leave-active
    transition-duration: 0.4s
  &-enter-from, &-leave-to
    display: inline-block
    opacity: 0 !important
    transform: translateY(-8px) !important
</style>
