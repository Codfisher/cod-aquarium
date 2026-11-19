<template>
  <!-- 描述與圖中文字一併顯示，讓搜尋引擎有文字可比對圖片內容 -->
  <div class="grid">
    <figure
      v-for="(item, index) in memeList"
      :key="item.file"
      class="card"
    >
      <!-- alt 與圖說相同：alt 是圖片搜尋的主要依據，不為避免報讀重複而縮短 -->
      <img
        :src="getFileSrc(item.file)"
        :alt="getMemeAlt(item)"
        :loading="index < eagerCount ? 'eager' : 'lazy'"
        :fetchpriority="index === 0 && eagerCount > 0 ? 'high' : undefined"
        decoding="async"
        :width="item.width || undefined"
        :height="item.height || undefined"
      >
      <figcaption
        v-if="item.describe?.trim() || item.ocr?.trim()"
        class="caption"
      >
        <span v-if="item.describe?.trim()">{{ getMemeAlt(item) }}</span>
        <span v-if="item.ocr?.trim()">圖中文字：{{ item.ocr.trim() }}</span>
      </figcaption>
    </figure>
  </div>
</template>

<script setup lang="ts">
import type { MemeItem } from './meme-seo'
import { withBase } from '#vp'
import { getMemeAlt } from './meme-seo'

withDefaults(defineProps<{
  memeList: MemeItem[];
  /** 位於首屏時，前幾張不 lazy load，避免拖慢 LCP */
  eagerCount?: number;
}>(), {
  eagerCount: 0,
})

function getFileSrc(file: string) {
  return withBase(`/memes/${file}`)
}
</script>

<style scoped lang="sass">
.grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))
  gap: 1rem

.card
  margin: 0
  background: var(--vp-c-bg-soft)
  border: 1px solid var(--vp-c-divider)
  border-radius: 16px
  overflow: hidden

.card img
  display: block
  width: 100%
  aspect-ratio: 4 / 3
  object-fit: cover
  background: var(--vp-c-bg-alt)

.caption
  display: flex
  flex-direction: column
  gap: 0.25rem
  padding: 0.75rem 1rem
  font-size: 0.875rem
  line-height: 1.6
  color: var(--vp-c-text-2)
</style>
