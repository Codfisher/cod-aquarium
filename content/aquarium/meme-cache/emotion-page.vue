<template>
  <!-- 結構化資料、標題與描述由 site/head.ts 依路由參數注入（site/pages.ts 產生參數） -->
  <div
    v-if="pageParams"
    class="emotion-page"
  >
    <h1>{{ pageParams.label }}梗圖</h1>

    <p class="lead">
      快取梗圖收錄 {{ pageParams.total }} 張{{ pageParams.label }}梗圖，{{ listScopeText }}。
      想找特定的那一張，可以到梗圖搜尋器用畫面描述或圖中台詞搜尋。
    </p>

    <p>
      <a
        class="cta"
        :href="appUrl"
      >在梗圖搜尋器瀏覽全部{{ pageParams.label }}梗圖 →</a>
    </p>

    <seo-meme-grid
      :meme-list="memeList"
      :eager-count="4"
    />

    <h2>依情緒找梗圖</h2>

    <seo-emotion-link-list :current-emotion="currentEmotion" />
  </div>
</template>

<script setup lang="ts">
import type { ClientEmotionParams } from '../../../app/theme/site-data'
import type { MemeItem } from './meme-seo'
import { useData, withBase } from '#vp'
import { useAsyncData } from 'nuxt/app'
import { computed } from 'vue'
import { isEmotion } from '../../../site/utils/meme-emotion'
import { isEmotionPageParams, MEME_CACHE_PATH } from './meme-seo'
import SeoEmotionLinkList from './seo-emotion-link-list.vue'
import SeoMemeGrid from './seo-meme-grid.vue'

/** client 端頁面資料只有 emotion、label、total，迷因清單太大不放進 #site/data */
const { params } = useData()

const pageParams = computed<ClientEmotionParams | undefined>(() => params.value as ClientEmotionParams | undefined)

const currentEmotion = computed(() => {
  const label = pageParams.value?.label
  return label && isEmotion(label) ? label : undefined
})

/** 迷因清單只在 SSR（prerender）讀 #site/server-data，結果寫進 payload。
 *
 * 首次載入由 HTML 內嵌的 payload 提供，client 換頁時 Nuxt 會抓該頁 prerender 的 _payload.json，
 * 15 頁的清單因此不會打包進 client。dev 沒有 prerender，client 換頁時改直接讀模組，
 * import.meta.dev 在正式打包為 false，這段會被移除
 */
const { data: memeList } = await useAsyncData(
  () => `meme-cache-emotion-${pageParams.value?.emotion ?? ''}`,
  async (): Promise<MemeItem[]> => {
    const emotion = pageParams.value?.emotion
    if (!emotion)
      return []

    if (import.meta.server || import.meta.dev) {
      const { default: serverData } = await import('#site/server-data')
      const emotionParams: unknown = new Map(Object.entries(serverData.emotionParamsMap)).get(emotion)
      return isEmotionPageParams(emotionParams) ? emotionParams.memeList : []
    }

    return []
  },
  { default: () => [] },
)

/** 張數不超過上限時整個分類都列出，避免「收錄 40 張，以下是最新的 40 張」這種重複 */
const listScopeText = computed(() => {
  if (!pageParams.value)
    return ''

  const { total } = pageParams.value
  const { length } = memeList.value
  return length >= total ? '以下全部列出' : `以下是最新的 ${length} 張`
})

/** 帶 ?emotion= 進 app，app 掛載後會套用對應的情緒篩選 */
const appUrl = computed(() => {
  if (!pageParams.value)
    return withBase(MEME_CACHE_PATH)

  return withBase(`${MEME_CACHE_PATH}?emotion=${encodeURIComponent(pageParams.value.label)}`)
})
</script>

<style scoped lang="sass">
.lead
  color: var(--vp-c-text-2)

/** 用外框而非實心底色：brand 色在深淺兩種模式下都配不出足夠對比的白字 */
.cta
  display: inline-block
  padding: 0.5rem 1.25rem
  border: 2px solid var(--vp-c-brand-1)
  border-radius: 999px
  color: var(--vp-c-brand-1)
  font-weight: 600
  text-decoration: none
  transition: background 0.2s

.cta:hover
  background: var(--vp-c-brand-soft)
</style>
