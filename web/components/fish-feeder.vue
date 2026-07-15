<template>
  <div
    v-if="!!articleId"
    class="fish-feeder-card flex flex-col items-center gap-4 p-5 rounded-xl"
  >
    <span class="text-sm opacity-70">
      餵個魚飼料吧，會跑出小魚喔！<span class="text-nowrap">(ゝ∀・)b</span>
    </span>

    <button
      ref="btnRef"
      class="feed-btn w-full max-w-sm rounded-full py-6! text-lg tracking-wider select-none font-bold"
      :class="{ 'opacity-40': btnDisabled }"
      @click="addReaction()"
    >
      <transition
        name="text"
        mode="out-in"
      >
        <span :key="btnLabel"> {{ btnLabel }}</span>
      </transition>
    </button>

    <span class="text-xs opacity-50 text-center">
      <transition
        name="text"
        mode="out-in"
      >
        <span :key="totalText">
          {{ totalText }}
        </span>
      </transition>
    </span>

    <label class="text-xs opacity-60 text-center flex justify-center gap-1 cursor-pointer select-none">
      <input
        v-model="isHiddenFish"
        type="checkbox"
      >
      <span> 隱藏魚群 </span>
    </label>

    <transition name="opacity">
      <div
        v-if="canvasVisible"
        class=" fixed w-screen h-screen top-0 left-0 pointer-events-none z-999999999999 duration-300"
        :class="{ 'opacity-0': !btnVisible, 'opacity-100': btnVisible }"
      >
        <bg-flock
          :count="totalReaction"
          :size="fishSize"
          :active="btnVisible"
        />
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import type { AppType } from '../../server'
import { useAsyncState, useIntersectionObserver, useWindowFocus, whenever } from '@vueuse/core'
import { hc } from 'hono/client'
import { debounce } from 'lodash-es'
import { useRoute } from 'vitepress'
import { computed, ref, useTemplateRef, watch } from 'vue'
import BgFlock from './bg-flock/bg-flock.vue'

const MAX_FEED_COUNT = 10

const route = useRoute()

const isFocused = useWindowFocus()

let userIdPromise: Promise<string> | undefined
/** 取得瀏覽器指紋當使用者 ID。
 *
 * FingerprintJS 採集成本高，延後到第一次呼叫 API 才動態載入並執行，
 * 避免佔用頁面載入時的主執行緒
 */
function getUserId() {
  if (!userIdPromise) {
    userIdPromise = import('@fingerprintjs/fingerprintjs')
      .then(({ default: FingerprintJS }) => FingerprintJS.load())
      .then((agent) => agent.get())
      .then((result) => result.visitorId)
  }

  return userIdPromise
}

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

const {
  isLoading,
  state: reactionData,
  execute: refreshReactionData,
} = useAsyncState(
  async () => {
    if (!articleId.value) {
      return { total: 0, yours: 0 }
    }

    const userId = await getUserId()

    const res = await client.api.reactions.$get(
      { query: { articleId: articleId.value } },
      { headers: { 'x-user-id': userId } },
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
const debouncedRefresh = debounce(() => refreshReactionData(), 5000, {
  leading: true,
  trailing: false,
})
watch(articleId, () => {
  loadingOnce.value = false
  debouncedRefresh.cancel()
})

const totalReaction = computed(
  () => reactionData.value.total - reactionData.value.yours + currentReaction.value,
)

const postReaction = debounce(
  async () => {
    const userId = await getUserId()

    const res = await client.api.reactions.$post(
      { json: { articleId: articleId.value, count: currentReaction.value } },
      { headers: { 'x-user-id': userId } },
    )

    if (res.status === 429) {
      // 未來有空再改成比較漂亮的提示
      // eslint-disable-next-line no-alert
      alert('感謝大家的熱情，本文的魚今天吃太飽了，請明天再來 (*´∀`)~♥')
      refreshReactionData()
    }
  },
  1000,
  { leading: false, trailing: true },
)

function addReaction() {
  if (!articleId.value || currentReaction.value >= MAX_FEED_COUNT) {
    return
  }

  // totalReaction 隨之 +1，bg-flock 會依 count 差量長出新的小魚
  currentReaction.value++

  postReaction()
}

const fishSize = computed(() => {
  if (totalReaction.value > 2000) {
    return 6
  }
  if (totalReaction.value > 1000) {
    return 10
  }

  return 13
})
/** 隱藏魚群 */
const isHiddenFish = ref(false)

const btnRef = useTemplateRef('btnRef')
/** 初始需為 false，讓 IntersectionObserver 第一次回報可見時，
 * btnVisible 產生 false → true 的變化，whenever 才會觸發載入
 */
const btnIntersection = ref(false)
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
  return `已累積 ${totalReaction.value} 份魚飼料 ` + '(*´∀`)~♥'
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
.fish-feeder-card
  border: 1px solid light-dark(oklch(0.92 0.02 175), oklch(0.28 0.02 175))

.feed-btn
  background: linear-gradient(135deg, oklch(0.58 0.13 175) 0%, oklch(0.68 0.14 175) 100%)
  color: #fff
  transition-duration: 200ms
  &:active
    scale: 0.98
    transition-duration: 50ms

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
