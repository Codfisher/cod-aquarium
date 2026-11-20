<template>
  <ul class="link-list">
    <li
      v-for="summary in summaryList"
      :key="summary.emotion"
    >
      <span
        v-if="summary.emotion === currentEmotion"
        class="link current"
        aria-current="page"
      >
        {{ summary.emotion }}梗圖（{{ summary.total }}）
      </span>
      <a
        v-else
        class="link"
        :href="withBase(summary.path)"
      >
        {{ summary.emotion }}梗圖（{{ summary.total }}）
      </a>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { Emotion } from '../../../site/utils/meme-emotion'
import { seoEmotionSummaryList } from 'virtual:seo-meme-list'
import { withBase } from '#vp'

defineProps<{
  /** 目前所在的分類，不連結自己 */
  currentEmotion?: Emotion;
}>()

const summaryList = seoEmotionSummaryList
</script>

<style scoped lang="sass">
.link-list
  display: flex
  flex-wrap: wrap
  gap: 0.5rem
  margin: 0
  padding: 0
  list-style: none

.link-list li
  margin: 0

.link
  display: inline-block
  padding: 0.25rem 0.75rem
  border: 1px solid var(--vp-c-divider)
  border-radius: 999px
  font-size: 0.875rem
  line-height: 1.6
  color: var(--vp-c-text-1)
  text-decoration: none
  transition: border-color 0.2s, color 0.2s

a.link:hover
  border-color: var(--vp-c-brand-1)
  color: var(--vp-c-brand-1)

.current
  border-color: var(--vp-c-brand-1)
  color: var(--vp-c-brand-1)
</style>
