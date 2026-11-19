<script lang="ts" setup>
import { onKeyStroke } from '@vueuse/core'
import { defineAsyncComponent, ref } from 'vue'
import VPNavBarSearchButton from './VPNavBarSearchButton.vue'

/** 搜尋框（含 Pagefind 與 UCommandPalette）在第一次開啟時才載入 */
const VPPagefindSearchBox = defineAsyncComponent(() => import('./VPPagefindSearchBox.vue'))

/** 曾經開過就保留元件，關閉時讓 UModal 播完收合動畫 */
const isSearchBoxMounted = ref(false)
const isSearchOpen = ref(false)

function openSearch() {
  isSearchBoxMounted.value = true
  isSearchOpen.value = true
}

function isEditingContent(event: KeyboardEvent): boolean {
  const element = event.target as HTMLElement
  const tagName = element.tagName

  return (
    element.isContentEditable
    || tagName === 'INPUT'
    || tagName === 'SELECT'
    || tagName === 'TEXTAREA'
  )
}

onKeyStroke('k', (event) => {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    openSearch()
  }
})

onKeyStroke('/', (event) => {
  if (!isEditingContent(event)) {
    event.preventDefault()
    openSearch()
  }
})
</script>

<template>
  <div class="VPNavBarSearch">
    <VPPagefindSearchBox
      v-if="isSearchBoxMounted"
      v-model:open="isSearchOpen"
    />

    <div id="local-search">
      <VPNavBarSearchButton @click="openSearch" />
    </div>
  </div>
</template>

<style>
.VPNavBarSearch {
  display: flex;
  align-items: center;
}

@media (min-width: 768px) {
  .VPNavBarSearch {
    flex-grow: 1;
    padding-left: 24px;
  }
}

@media (min-width: 960px) {
  .VPNavBarSearch {
    padding-left: 32px;
  }
}
</style>
