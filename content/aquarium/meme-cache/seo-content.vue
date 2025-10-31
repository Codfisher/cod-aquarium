<!-- eslint-disable vue/no-v-text-v-html-on-component vue/no-useless-v-bind -->
<template>
  <section
    v-if="!isMounted"
    aria-labelledby="meme-gallery-title"
    class="gallery-wrap"
  >
    <h1
      id="meme-gallery-title"
      class="page-title"
    >
      最新梗圖
    </h1>

    <!-- 圖片清單 -->
    <div class="grid">
      <figure
        v-for="(item) in items"
        :key="item.file"
        class="card"
      >
        <picture>
          <img
            :src="fileSrc(item.file)"
            :alt="toAlt(item)"
            loading="lazy"
            decoding="async"
            :width="item.width || undefined"
            :height="item.height || undefined"
          >
        </picture>
        <figcaption class="caption">
          <strong class="name">{{ toName(item) }}</strong>
          <span class="desc">{{ toCaption(item) }}</span>
        </figcaption>
      </figure>
    </div>

    <component
      :is="'script'"
      type="application/ld+json"
    >
      {{ jsonLdData }}
    </component>
  </section>
</template>

<script setup lang="ts">
import { useMounted } from '@vueuse/core'
import { filter, isTruthy, map, pipe, takeLast } from 'remeda'
import { withBase } from 'vitepress'
import { computed, ref } from 'vue'
import rawNdjson from '../../public/memes/a-memes-data.ndjson?raw'

interface MemeItem {
  file: string;
  describe?: string;
  ocr?: string;
  keyword?: string;
  width?: number;
  height?: number;
}

const items = ref(parseNdjson(rawNdjson))

function parseNdjson(text: string): MemeItem[] {
  return pipe(
    text.split('\n'),
    map((line) => line.trim()),
    filter(Boolean),
    map((line) => {
      try {
        const row = JSON.parse(line)
        return row as MemeItem
      }
      catch {
        return null
      }
    }),
    filter(isTruthy),
    takeLast(20),
  ) as MemeItem[]
}

const fileSrc = (file: string) => withBase(`/memes/${file}`)

/** 以描述前 18~24 字當標題；沒有就用檔名 */
function toName(item: MemeItem) {
  const d = (item.describe || '').replace(/\s+/g, '')
  return d ? (d.length > 24 ? `${d.slice(0, 24)}…` : d) : item.file
}
function toAlt(item: MemeItem) {
  return (item.describe || '').replace(/\s+/g, ' ').trim() || '迷因圖片'
}
const toCaption = (item: MemeItem) => item.describe || ''

const jsonLdData = computed(() => {
  const parts = items.value.map((it) => ({
    '@type': 'ImageObject',
    'name': toName(it),
    'caption': toAlt(it),
    'contentUrl': absoluteUrl(fileSrc(it.file)),
  }))

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': '鱈魚 - 快取梗圖',
    'inLanguage': 'zh-Hant-TW',
    'hasPart': parts,
  }
})

function absoluteUrl(path: string) {
  if (typeof window !== 'undefined' && path.startsWith('/')) {
    return window.location.origin + path
  }
  return `https://codlin.me/${path}`
}

const isMounted = useMounted()
</script>

<style scoped lang="sass">
.gallery-wrap
  max-width: 1100px
  margin: 0 auto
  padding: 1rem 1rem 2rem
  padding-top: 200vh

.page-title
  font-size: clamp(1.5rem, 2.5vw, 2rem)
  margin: 0 0 1rem

.grid
  display: grid
  grid-template-columns: repeat(1, minmax(0, 1fr))
  gap: 1rem

.card
  display: flex
  flex-direction: column
  background: var(--vp-c-bg-soft)
  border: 1px solid var(--vp-c-divider)
  border-radius: 16px
  overflow: hidden

.card picture, .card img
  display: block
  width: 100%

.card picture
  aspect-ratio: 4 / 3
  background: var(--vp-c-bg-alt)

.card img
  object-fit: cover
  height: 100%

.caption
  padding: .75rem .9rem
  font-size: .95rem
  line-height: 1.35
  color: var(--vp-c-text-2)

.caption .name
  display: block
  font-weight: 600
  color: var(--vp-c-text-1)
  margin-bottom: .2rem
</style>
