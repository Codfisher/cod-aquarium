<template>
  <picture v-if="!isReplacedByPlate">
    <!-- 用 v-bind 物件而非個別 :srcset、:sizes：Vue 3.5 hydration 會重設個別綁定的 sizes，
      瀏覽器因此重新選圖、重新下載，LCP 被推遲到 hydration 之後（實測慢約 1 秒） -->
    <source
      v-if="darkSourceAttrs"
      v-bind="darkSourceAttrs"
    >
    <nuxt-img v-bind="imageAttrs" />
  </picture>
</template>

<script setup lang="ts">
import { useData } from '#vp'
import { useMounted } from '@vueuse/core'
import { useNuxtApp } from 'nuxt/app'
import { computed, useAttrs } from 'vue'

/** 站內圖片：網址、尺寸與 webp 轉換全部交給 Nuxt Image（<NuxtImg>），這裡只補 Nuxt Image 沒有的三件事：
 * - 有暗色版的圖片加上暗色 <source>
 * - 主題與專欄文章的內文封面改由圖版帶呈現（見 app/theme/custom/doc-plate-band.vue），內文不渲染
 * - frontmatter 的封面是 https://codlin.me/... 完整網址，轉成站內路徑才會交給 ipx 處理
 */
interface Props {
  src: string;
  alt?: string;
  /** 固定顯示尺寸的圖片（縮圖）：輸出單一寬度 */
  width?: number | string;
  height?: number | string;
  /** 隨版面縮放的圖片：Nuxt Image 的 sizes 語法，例如 100vw md:688px */
  sizes?: string;
  loading?: 'lazy' | 'eager';
  fetchpriority?: 'high' | 'low' | 'auto';
}

defineOptions({ inheritAttrs: false })
const props = defineProps<Props>()
const attrs = useAttrs()
const image = useNuxtApp().$img
const { isDark, page } = useData()
const isMounted = useMounted()

const SITE_ORIGIN = 'https://codlin.me'
/** 只產 1 倍密度：寬度已依顯示尺寸的 2～3 倍挑選（縮圖），文章圖也最多取到欄寬 688，避免高解析螢幕下載過大的圖拖慢 LCP */
const IMAGE_DENSITIES = 'x1'
const imagePath = computed(() => props.src.startsWith(SITE_ORIGIN)
  ? props.src.slice(SITE_ORIGIN.length)
  : props.src)

/** md 裡寫了 {.cover} 的封面 */
const isCover = computed(() => String(attrs.class ?? '').split(/\s+/).includes('cover'))
const isReplacedByPlate = computed(() => isCover.value && !!page.value.plateSeries)
const isEager = computed(() => (props.loading ?? (isCover.value ? 'eager' : 'lazy')) === 'eager')

const darkImageSet = new Set(__DARK_IMAGE_LIST__)
const darkImagePath = computed(() => darkImageSet.has(imagePath.value)
  ? imagePath.value.replace(/\.webp$/, '-dark.webp')
  : undefined)

/** 暗色來源的 media。伺服器不知道使用者偏好，若依 isDark 決定輸出內容，暗色模式下每頁都會 hydration 不一致。
 * 掛載前一律用系統偏好的媒體查詢（主題預設跟隨系統，首次繪製就選對圖）；掛載後改依實際的 isDark，涵蓋手動切換的使用者
 */
const darkMedia = computed(() => {
  if (!isMounted.value)
    return '(prefers-color-scheme: dark)'
  return isDark.value ? 'all' : 'not all'
})

const darkSourceAttrs = computed(() => {
  if (!darkImagePath.value)
    return undefined

  const base = { media: darkMedia.value, type: 'image/webp' }
  if (props.sizes) {
    const { srcset, sizes } = image.getSizes(darkImagePath.value, { sizes: props.sizes, densities: IMAGE_DENSITIES, modifiers: { format: 'webp', quality: 80 } })
    return { ...base, srcset, sizes }
  }
  return { ...base, srcset: image(darkImagePath.value, { width: props.width ? Number(props.width) : undefined, format: 'webp', quality: 80 }) }
})

const imageAttrs = computed(() => ({
  ...attrs,
  src: imagePath.value,
  alt: props.alt ?? '',
  width: props.width,
  height: props.height,
  sizes: props.sizes,
  densities: IMAGE_DENSITIES,
  loading: isEager.value ? 'eager' : 'lazy',
  fetchpriority: props.fetchpriority ?? (isEager.value ? 'high' : undefined),
  decoding: isEager.value ? undefined : 'async',
  /** 首屏圖片由 Nuxt Image 在 head 加上 preload（與 <img> 相同的 srcset、sizes），取代原本 site/head.ts 手寫的封面預載 */
  preload: isEager.value ? { fetchPriority: 'high' as const } : undefined,
}))
</script>
