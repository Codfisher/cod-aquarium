<script lang="ts" setup>
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import { useRouter } from 'nuxt/app'
import { computed, ref, shallowRef, watch } from 'vue'

/** Pagefind 的 client API（只列用到的部分），見 https://pagefind.app/docs/api/ */
interface PagefindSubResult {
  title: string;
  url: string;
  excerpt: string;
  /** 命中字詞在此段落的位置，數量越多代表這段越相關 */
  locations?: number[];
}
interface PagefindResultData {
  url: string;
  excerpt: string;
  meta: Record<string, string | undefined>;
  sub_results?: PagefindSubResult[];
}
interface PagefindResult {
  id: string;
  data: () => Promise<PagefindResultData>;
}
interface PagefindSearchResponse {
  results: PagefindResult[];
}
interface PagefindModule {
  options: (option: Record<string, unknown>) => Promise<void>;
  init: () => Promise<void> | void;
  /** 後續呼叫會取代前一次，被取代的回傳 null */
  debouncedSearch: (term: string, option?: Record<string, unknown>, timeout?: number) => Promise<PagefindSearchResponse | null>;
}

/** 建置後由 Pagefind 產生於 dist/pagefind/，dev 沒有這個檔案 */
const PAGEFIND_URL = '/pagefind/pagefind.js'
const RESULT_LIMIT = 20

const isOpen = defineModel<boolean>('open', { default: false })

const router = useRouter()

const searchTerm = ref('')
const resultList = shallowRef<PagefindResultData[]>([])
const isLoading = ref(false)
const isIndexMissing = ref(false)

let pagefindPromise: Promise<PagefindModule> | undefined

/** 第一次開啟搜尋才載入 Pagefind，載入失敗（例如 dev 沒有索引）下次再試 */
function loadPagefind(): Promise<PagefindModule> {
  pagefindPromise ??= import(/* @vite-ignore */ PAGEFIND_URL)
    .then(async (pagefind: PagefindModule) => {
      await pagefind.options({ excerptLength: 30 })
      await pagefind.init()
      isIndexMissing.value = false
      return pagefind
    })
    .catch((error: unknown) => {
      pagefindPromise = undefined
      isIndexMissing.value = true
      throw error
    })
  return pagefindPromise
}

watch(isOpen, (value) => {
  if (value)
    loadPagefind().catch(() => {})
}, { immediate: true })

watch(searchTerm, async (term) => {
  const keyword = term.trim()
  if (!keyword) {
    resultList.value = []
    isLoading.value = false
    return
  }

  isLoading.value = true
  try {
    const pagefind = await loadPagefind()
    const response = await pagefind.debouncedSearch(keyword)
    /** 已被更新的關鍵字取代 */
    if (!response)
      return

    const dataList = await Promise.all(
      response.results.slice(0, RESULT_LIMIT).map((result) => result.data()),
    )
    if (keyword !== searchTerm.value.trim())
      return

    resultList.value = dataList
    isLoading.value = false
  }
  catch {
    resultList.value = []
    isLoading.value = false
  }
})

/** Pagefind 以輸出檔名當網址（/foo.html、/bar/index.html），轉回站內網址 */
function toRoutePath(url: string) {
  return url
    .replace(/\/index\.html(?=$|[?#])/, '/')
    .replace(/\.html(?=$|[?#])/, '')
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, '')
}

function openResult(url: string) {
  isOpen.value = false
  router.push(toRoutePath(url))
}

/** 與 VitePress 本地搜尋相同，結果直接連到最相關的小節（命中最多的段落），沒有小節才連到頁首 */
function getBestSubResult(data: PagefindResultData): PagefindSubResult | undefined {
  return data.sub_results
    ?.filter((subResult) => subResult.url.includes('#'))
    .toSorted((a, b) => (b.locations?.length ?? 0) - (a.locations?.length ?? 0))[0]
}

const groupList = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [{
  id: 'pagefind',
  ignoreFilter: true,
  items: resultList.value.map((data) => {
    const pageTitle = data.meta.title || toRoutePath(data.url)
    const bestSubResult = getBestSubResult(data)
    const excerpt = bestSubResult?.excerpt ?? data.excerpt
    return {
      label: bestSubResult && bestSubResult.title !== pageTitle ? `${pageTitle} › ${bestSubResult.title}` : pageTitle,
      description: stripHtml(excerpt),
      /** excerpt 由 Pagefind 跳脫過，只帶 <mark> 標示命中字詞 */
      descriptionHtml: excerpt,
      onSelect: () => openResult(bestSubResult?.url ?? data.url),
    }
  }),
}])

const emptyText = computed(() => {
  if (isIndexMissing.value)
    return '找不到搜尋索引，建置網站後才會產生（開發模式無法搜尋）'
  if (!searchTerm.value.trim())
    return '輸入關鍵字搜尋文章'
  if (isLoading.value)
    return '搜尋中…'
  return `找不到「${searchTerm.value.trim()}」的相關結果`
})
</script>

<template>
  <u-modal
    v-model:open="isOpen"
    title="站內搜尋"
    :ui="{ content: 'sm:max-w-2xl vp-raw' }"
  >
    <template #content>
      <u-command-palette
        v-model:search-term="searchTerm"
        :groups="groupList"
        :loading="isLoading"
        :fuse="{ resultLimit: RESULT_LIMIT }"
        placeholder="搜尋文章"
        close
        class="h-[min(80vh,640px)]"
        :ui="{
          itemDescription: 'line-clamp-2 whitespace-normal! [&_mark]:bg-transparent [&_mark]:font-semibold [&_mark]:text-primary',
        }"
        @update:open="isOpen = $event"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            {{ emptyText }}
          </p>
        </template>
      </u-command-palette>
    </template>
  </u-modal>
</template>
