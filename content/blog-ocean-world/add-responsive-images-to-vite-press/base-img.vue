<template>
  <picture v-if="!isReplacedByPlate">
    <template v-if="sourceVisible">
      <!-- 用 v-bind 物件而非個別 :srcset、:sizes，原因見 getSourceProps -->
      <source
        v-if="hasDarkImage"
        v-bind="getSourceProps(darkSrcset, darkMedia)"
      >
      <source v-bind="getSourceProps(lightSrcset)">
    </template>

    <img
      v-bind="imgProps"
      @error="darkSrcError = true"
    >
  </picture>
</template>

<script setup lang="ts">
import type { ImgHTMLAttributes } from 'vue'
import { useData } from '#vp'
import { useMounted } from '@vueuse/core'
import { join, map, pipe } from 'remeda'
import { computed, ref, useAttrs } from 'vue'

interface Props extends /* @vue-ignore */ ImgHTMLAttributes {
  src: string;
  /** 指定特定尺寸 */
  useSize?: typeof WIDTH_LIST[number];
  /** 圖片 sizes 屬性，用於搭配 srcset 讓瀏覽器選擇正確尺寸 */
  sizes?: string;
}

const props = withDefaults(defineProps<Props>(), {
  useSize: undefined,
  sizes: '(max-width: 700px) 100vw, 700px',
})

const { isDark, page } = useData()
const darkSrcError = ref(false)

const attrs = useAttrs()

const WIDTH_LIST = [700, 300] as const

// 去除附檔名
const fileName = computed(() => props.src
  .split('.')
  .slice(0, -1)
  .join('.'),
)

const darkImageSet = new Set(__DARK_IMAGE_LIST__)

const isMounted = useMounted()

/** 只有確定存在暗色版才輸出暗色來源，src 可能是完整網址，比對前取 pathname */
const hasDarkImage = computed(() => !darkSrcError.value
  && darkImageSet.has(new URL(props.src, 'https://codlin.me').pathname))

/** 暗色來源的 media。伺服器不知道使用者偏好，若依 isDark 決定輸出內容，暗色模式下每頁都會 hydration 不一致。
 * 掛載前一律用系統偏好的媒體查詢（主題預設跟隨系統，首次繪製就選對圖、也命中預載）；
 * 掛載後改依實際的 isDark，涵蓋手動切換、與系統相反的使用者
 */
const darkMedia = computed(() => {
  if (!isMounted.value)
    return '(prefers-color-scheme: dark)'
  return isDark.value ? 'all' : 'not all'
})

/** <img> 的 src 只在沒有 <source> 時（dev、gif）實際使用，同樣掛載後才依 isDark 切換 */
const src = computed(() => isMounted.value && isDark.value && hasDarkImage.value
  ? props.src.replace('.webp', '-dark.webp')
  : props.src)

/** 封面圖為首屏 LCP 元素，需優先載入；其餘圖片延後載入以釋放頻寬 */
const isCover = computed(() => String(attrs.class ?? '').includes('cover'))

/** 主題與專欄文章的封面改由圖版帶上目前這張呈現（見 app/theme/custom/doc-plate-band.vue），
 * 內文的封面不渲染，也就不會下載第二次；圖版帶那張沿用相同 srcset 與 sizes，head 的 LCP preload 仍然命中
 */
const isReplacedByPlate = computed(() => isCover.value && !!page.value.plateSeries)

/** 呼叫端明確指定的載入屬性優先，例如首頁封面沒有 cover class，但在 md 寫了 loading="eager" */
const imgProps = computed(() => ({
  ...props,
  ...attrs,
  src: src.value,
  loading: attrs.loading ?? (isCover.value ? 'eager' : 'lazy'),
  fetchpriority: attrs.fetchpriority ?? (isCover.value ? 'high' : undefined),
  decoding: attrs.decoding ?? (isCover.value ? undefined : 'async'),
}))

/** 抽取邏輯：根據傳入的檔名 (baseName) 產生對應的 srcset 字串
 */
function getSrcset(baseName: string) {
  // 指定特定尺寸
  if (props.useSize) {
    return `${baseName}-${props.useSize}.webp`
  }

  // 產生響應式清單
  return pipe(
    WIDTH_LIST,
    map((size) => `${baseName}-${size}.webp ${size}w`),
    join(', '),
  )
}

/** 一般模式的 srcset */
const lightSrcset = computed(() => getSrcset(fileName.value))

/** 暗黑模式的 srcset
 * 邏輯：在原檔名後加上 -dark
 * 例如：image-700.webp -> image-dark-700.webp
 */
const darkSrcset = computed(() => getSrcset(`${fileName.value}-dark`))

/** Vue 3.5 hydration 會把個別綁定的屬性重設一次，只略過值沒變的 src、srcset，不含 sizes。
 * <source> 的 sizes 即使設成同樣的值，瀏覽器也會重新選圖、重新載入封面，
 * LCP 因而被推遲到 hydration 之後（實測慢約 1 秒）。改用 v-bind 物件則 hydration 不會重設
 */
function getSourceProps(srcset: string, media?: string) {
  return {
    srcset,
    sizes: props.sizes,
    type: 'image/webp',
    media,
  }
}

const sourceVisible = computed(() => {
  /** DEV 模式不顯示響應式圖片 */
  if (import.meta.env.DEV) {
    return false
  }

  /** gif 不特別處理 */
  return !props.src.includes('.gif')
})
</script>
