<script setup lang="ts">
import type { PlateSeries } from '../../../site/plate-series'
import { useElementSize, useEventListener, usePreferredReducedMotion, useScroll } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import ThemeImage from '../../../web/components/theme-image.vue'
import VPLink from '../components/VPLink.vue'
import { toPlateNumber } from './plate-number'

interface Props {
  plateSeries: PlateSeries;
}
const props = defineProps<Props>()

const trackRef = useTemplateRef<HTMLElement>('track')
const { width: trackWidth } = useElementSize(trackRef)
const reducedMotion = usePreferredReducedMotion()
const { x: scrollX, arrivedState } = useScroll(trackRef, {
  behavior: computed(() => reducedMotion.value === 'reduce' ? 'auto' : 'smooth'),
})

const total = computed(() => props.plateSeries.plateList.length)

/** 滑鼠拖曳捲動（觸控與觸控板本來就能原生滑動）。
 * 站內連結攔截在 window 的捕獲階段（app/plugins/vitepress-client.client.ts），拖完放開時沒機會 preventDefault，
 * 所以拖動一開始就讓圖版連結 pointer-events: none，放開後的 click 落在圖版帶本身，不會誤觸換頁
 */
const DRAG_THRESHOLD = 4
const isDragging = ref(false)
let dragStartX = 0
let dragStartScrollLeft = 0
let isPointerDown = false

function handlePointerDown(event: PointerEvent) {
  const track = trackRef.value
  if (!track || event.pointerType !== 'mouse' || event.button !== 0)
    return

  isPointerDown = true
  dragStartX = event.clientX
  dragStartScrollLeft = track.scrollLeft
}

useEventListener(globalThis.window, 'pointermove', (event: PointerEvent) => {
  const track = trackRef.value
  if (!isPointerDown || !track)
    return

  const deltaX = event.clientX - dragStartX
  if (!isDragging.value && Math.abs(deltaX) > DRAG_THRESHOLD)
    isDragging.value = true
  if (isDragging.value)
    track.scrollLeft = dragStartScrollLeft - deltaX
})

useEventListener(globalThis.window, 'pointerup', () => {
  isPointerDown = false
  if (!isDragging.value)
    return
  // 等這次放開產生的 click 派送完，再讓連結恢復可點
  setTimeout(() => {
    isDragging.value = false
  })
})

/** 滑過或聚焦的圖版；沒有時預告下一版，觸控使用者也看得到下一篇在講什麼 */
const activeIndex = ref<number>()
const previewIndex = computed(() => {
  if (activeIndex.value !== undefined)
    return activeIndex.value
  const nextIndex = props.plateSeries.currentIndex + 1
  return nextIndex < total.value ? nextIndex : undefined
})
const previewPlate = computed(() => previewIndex.value === undefined ? undefined : props.plateSeries.plateList[previewIndex.value])
const previewLabel = computed(() => {
  const index = previewIndex.value
  if (index === undefined)
    return ''
  const plateNumber = toPlateNumber(index)
  if (index === props.plateSeries.currentIndex)
    return `本版 ${plateNumber}`
  return activeIndex.value === undefined ? `下一版 ${plateNumber}` : `第 ${plateNumber} 版`
})
const kindText = computed(() => props.plateSeries.isColumn ? '專欄' : '主題')

/** 圖版超出可視寬度才需要左右捲動按鈕 */
const isScrollable = computed(() => {
  const track = trackRef.value
  if (!track || trackWidth.value === 0)
    return false
  return track.scrollWidth > track.clientWidth + 1
})

/** 一次捲動約一個可視寬度的八成，保留前一屏最後幾張當定位參考 */
function scrollByPage(direction: 1 | -1) {
  scrollX.value += direction * trackWidth.value * 0.8
}

/** 讓目前這張置中；直接設 scrollLeft，不用 scrollIntoView，避免連帶捲動整頁 */
function centerCurrentPlate() {
  const track = trackRef.value
  /** 取 li 而非內層連結：li 是 position: relative，連結的 offsetLeft 會以 li 為基準而永遠是 0 */
  const current = track?.querySelector<HTMLElement>('.plate.is-current')
  if (!track || !current)
    return

  track.scrollLeft = current.offsetLeft - (track.clientWidth - current.offsetWidth) / 2
}

/** 預先渲染的 HTML 在首次繪製前就把目前這張捲到中間，不等 hydration：
 * 這張是本篇封面（LCP），水合前若停在 scrollLeft 0 會被裁在可視範圍外。
 * script 緊接在圖版帶之後，解析到這裡就執行，長文章不會先以未置中的狀態繪製。
 * 模板不能直接寫 <script>（Vue 編譯器會忽略），改用 component :is 渲染；v-html 在 SSR 對 script 不輸出內容，改放文字節點。
 * client 端插入的 script 不會再執行，只有 SSR 那份生效。
 * onMounted 與換頁時的 watch 仍負責之後的置中
 */
// SSR 會跳脫文字內容中的 & < > " '，script 只能用反引號當字串引號，也不能出現這幾個字元
/** 放在常數裡給 :is 用：寫成 is="script" 或 :is="'script'" 各會撞到一條 eslint 規則 */
const SCRIPT_TAG = 'script'
const CENTER_SCRIPT = 'document.querySelectorAll(`.plate-track`).forEach(function(t){var c=t.querySelector(`.plate.is-current`);if(c)t.scrollLeft=c.offsetLeft-(t.clientWidth-c.offsetWidth)/2})'

/** 換頁時的置中動畫，長度與 CSS 的圖版寬度過渡（0.7s）一致 */
const SETTLE_DURATION = 700
/** 換頁過渡期間暫停 scroll-snap，否則吸附會把捲動位置拉到別張 */
const isSettling = ref(false)
let settleFrameId: number | undefined

/** 與 CSS 的 --plate-resize-ease（cubic-bezier(0.65, 0, 0.35, 1)）相近的前後平緩曲線 */
function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2
}

/** 讓目前這張保持置中的捲動位置，依圖版當下（動畫中）的實際位置計算 */
function getCenteredScrollLeft(track: HTMLElement) {
  const current = track.querySelector<HTMLElement>('.plate.is-current')
  if (!current)
    return track.scrollLeft
  return current.offsetLeft - (track.clientWidth - current.offsetWidth) / 2
}

/** 換頁後滑到新的那張。不用瀏覽器的 smooth 捲動：圖版寬度動畫中版面一直變，
 * smooth 捲動會被中斷而停在半路。改成每幀追蹤新圖版的即時位置，依進度從起點內插過去，
 * 與放大動畫同時收尾，結束時剛好置中
 */
function settleToCurrentPlate(track: HTMLElement) {
  if (settleFrameId !== undefined)
    cancelAnimationFrame(settleFrameId)

  if (reducedMotion.value === 'reduce') {
    track.scrollLeft = getCenteredScrollLeft(track)
    return
  }

  const startScrollLeft = track.scrollLeft
  const startTime = performance.now()
  isSettling.value = true

  const step = (now: number) => {
    const progress = Math.min((now - startTime) / SETTLE_DURATION, 1)
    const target = getCenteredScrollLeft(track)
    track.scrollLeft = startScrollLeft + (target - startScrollLeft) * easeInOutCubic(progress)

    if (progress < 1) {
      settleFrameId = requestAnimationFrame(step)
      return
    }
    settleFrameId = undefined
    isSettling.value = false
  }
  settleFrameId = requestAnimationFrame(step)
}

onMounted(centerCurrentPlate)
onBeforeUnmount(() => {
  if (settleFrameId !== undefined)
    cancelAnimationFrame(settleFrameId)
})
watch(() => props.plateSeries.plateList[props.plateSeries.currentIndex]?.link, () => {
  nextTick(() => {
    const track = trackRef.value
    if (track)
      settleToCurrentPlate(track)
  })
})
</script>

<template>
  <nav
    class="doc-plate-band"
    :aria-label="`${plateSeries.title}${kindText}的所有文章`"
  >
    <div class="band-header">
      <div class="series">
        <span class="series-title">{{ plateSeries.title }}</span>
        <span class="series-meta">{{ kindText }}・共 {{ total }} 版</span>
      </div>

      <div
        v-if="isScrollable"
        class="band-controls"
      >
        <u-button
          icon="i-material-symbols:chevron-left-rounded"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="往前捲動圖版"
          :disabled="arrivedState.left"
          @click="scrollByPage(-1)"
        />
        <u-button
          icon="i-material-symbols:chevron-right-rounded"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="往後捲動圖版"
          :disabled="arrivedState.right"
          @click="scrollByPage(1)"
        />
      </div>
    </div>

    <ol
      ref="track"
      class="plate-track"
      :class="{
        'is-dragging': isDragging,
        'is-settling': isSettling,
        'has-more-before': !arrivedState.left,
        'has-more-after': !arrivedState.right,
      }"
      @pointerdown="handlePointerDown"
      @dragstart.prevent
    >
      <li
        v-for="(plate, index) in plateSeries.plateList"
        :key="plate.link"
        class="plate"
        :class="{ 'is-current': index === plateSeries.currentIndex }"
      >
        <v-p-link
          :href="plate.link"
          class="plate-link"
          no-icon
          :aria-current="index === plateSeries.currentIndex ? 'page' : undefined"
          @mouseenter="activeIndex = index"
          @mouseleave="activeIndex = undefined"
          @focus="activeIndex = index"
          @blur="activeIndex = undefined"
        >
          <span class="plate-frame">
            <!-- 目前這張就是本篇封面（內文封面已隱藏，見 theme-image），也是 LCP 元素：eager 載入，Nuxt Image 會在 head 加上 preload。
              顯示最大 320px（手機 200px），取 640 寬涵蓋桌機 2 倍、手機 3 倍高解析螢幕；其他圖版最大 84px，取 200 寬。
              換頁時沿用同一個 img 元素只換屬性，大圖下載完前仍顯示原本的縮圖，放大過程不會閃白 -->
            <theme-image
              :src="plate.image"
              :alt="index === plateSeries.currentIndex ? plate.title : ''"
              :width="index === plateSeries.currentIndex ? 640 : 200"
              :height="index === plateSeries.currentIndex ? 640 : 200"
              :loading="index === plateSeries.currentIndex ? 'eager' : 'lazy'"
              class="plate-image"
            />
          </span>
          <span class="plate-number">
            {{ toPlateNumber(index) }}
            <transition name="plate-state">
              <span
                v-if="index === plateSeries.currentIndex"
                class="plate-state"
              >閱讀中</span>
            </transition>
          </span>
          <span class="sr-only">{{ plate.title }}</span>
        </v-p-link>
      </li>
    </ol>
    <component :is="SCRIPT_TAG">
      {{ CENTER_SCRIPT }}
    </component>

    <p
      class="plate-preview"
      aria-hidden="true"
    >
      <transition
        name="preview"
        mode="out-in"
      >
        <span
          v-if="previewPlate"
          :key="previewLabel + previewPlate.link"
          class="preview-content"
        >
          <span class="preview-label">{{ previewLabel }}</span>
          <span class="preview-title">{{ previewPlate.title }}</span>
        </span>
      </transition>
    </p>
  </nav>
</template>

<style scoped>
.doc-plate-band {
  /* 文字淡入用的減速曲線：起步快、收尾長 */
  --plate-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* 圖版放大縮小用前後都平緩的曲線，減速曲線前段太快，0.6 秒在 0.15 秒內就走完九成，看起來像瞬間切換 */
  --plate-resize-ease: cubic-bezier(0.65, 0, 0.35, 1);
  --plate-size: 64px;
  /* 目前這張就是本篇封面，放大到足以取代內文封面 */
  --plate-current-size: 200px;
  /* 圓角隨圖版大小：小圖版 10px，目前這張與全站圖片相同的 1rem */
  --plate-radius: 10px;
  --plate-current-radius: 16px;
  border-bottom: 1px solid var(--plate-line);
  margin-bottom: 32px;
}

@media (min-width: 768px) {
  .doc-plate-band {
    --plate-size: 84px;
    --plate-current-size: 320px;
    margin-bottom: 48px;
  }
}

.band-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 32px;
}

.series {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}

.series-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  text-wrap: balance;
}

.series-meta {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.band-controls {
  display: none;
  gap: 4px;
}

@media (hover: hover) and (min-width: 768px) {
  .band-controls {
    display: flex;
  }
}

.plate-track {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  /* 下方保留圖版號的空間，基線畫在圖版底緣 */
  padding: 20px 4px 44px;
  margin: 0;
  list-style: none;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  scrollbar-color: var(--plate-line) transparent;
  cursor: grab;
  /* 只有該側還有圖版時才淡出，捲到盡頭的第一張與最後一張不被遮住 */
  --fade-before: 0px;
  --fade-after: 0px;
  mask-image: linear-gradient(to right, transparent, #000 var(--fade-before), #000 calc(100% - var(--fade-after)), transparent);
}

/* 撐高用的隱形支柱：換頁時舊的一張縮小、新的一張放大，過程中兩張都不到最大尺寸，
   圖版帶的高度會先縮再撐回，下方內容跟著跳動。用一根零寬、等同目前圖版高度的支柱固定住內容高度，
   不直接設 height／min-height：overflow-x: auto 的捲軸佔的是盒子內的高度，算不準。
   負邊距抵銷 flex gap，圖版位置不受影響 */
.plate-track::before {
  content: '';
  flex: none;
  width: 0;
  height: var(--plate-current-size);
  margin-right: -16px;
}

.plate-track.has-more-before {
  --fade-before: 32px;
}

.plate-track.has-more-after {
  --fade-after: 32px;
}

.plate-track.is-settling {
  scroll-snap-type: none;
}

/* 拖曳中：停用吸附避免和手勢搶位置、停用選字，連結不接收滑鼠事件（原因見 script） */
.plate-track.is-dragging {
  cursor: grabbing;
  scroll-snap-type: none;
  user-select: none;
}

.plate-track.is-dragging .plate-link {
  pointer-events: none;
}

.plate {
  position: relative;
  flex: none;
  margin: 0;
  scroll-snap-align: center;
}

/* 所有圖版共用的基線：每張往左右延伸半個間距接成一條，捲動時跟著內容走 */
.plate::after {
  content: '';
  position: absolute;
  left: -8px;
  right: -8px;
  bottom: 0;
  height: 1px;
  background: var(--plate-line);
}

.plate:first-child::after {
  left: -4px;
}

.plate-link {
  display: block;
  color: inherit;
  text-decoration: none;
  border-radius: var(--plate-radius);
}

.plate-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 6px;
}

.plate-frame {
  display: block;
  width: var(--plate-size);
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--plate-line);
  /* 與全站圖片一致的圓角（style.css 的 img 規則）；雙框的外框會跟著圓角走 */
  border-radius: var(--plate-radius);
  /* 外框先透明待命，成為目前這張時才淡入，雙框跟著放大一起出現 */
  outline: 1px solid transparent;
  outline-offset: 4px;
  /* 換頁時舊的一張縮回、新的一張放大，與圖版帶的平滑捲動同步 */
  transition:
    width 0.7s var(--plate-resize-ease),
    border-radius 0.7s var(--plate-resize-ease),
    border-color 0.25s,
    outline-color 0.4s 0.2s;
}

.plate-frame :deep(picture),
.plate-frame :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
}

.plate-frame :deep(img) {
  /* 封面完整呈現、不放大裁切，多數封面的主體貼近邊緣。
     全站 img 預設有圓角與 1px 邊框（style.css），框線與圓角已由 .plate-frame 負責，這裡拿掉以免框中有框 */
  object-fit: cover;
  border: none;
  border-radius: 0;
  /* 未讀的圖版退後一點，目前這張與滑過的那張完整呈現 */
  filter: saturate(0.55);
  opacity: 0.82;
  transition: filter 0.4s, opacity 0.4s;
}

/* 滑過時框線轉墨色，不位移：圖版始終站在同一條基線上 */
.plate-link:hover .plate-frame,
.plate-link:focus-visible .plate-frame {
  border-color: var(--plate-ink);
}

.plate-link:hover .plate-frame :deep(img),
.plate-link:focus-visible .plate-frame :deep(img) {
  filter: none;
  opacity: 1;
}

.plate-number {
  position: absolute;
  left: 0;
  top: calc(100% + 10px);
  display: flex;
  gap: 8px;
  white-space: nowrap;
  font-family: var(--display-font-family);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--vp-c-text-2);
  transition: color 0.4s;
}

.plate-state {
  font-family: var(--vp-font-family-base);
  font-weight: 400;
  color: var(--plate-ink);
}

.plate.is-current {
  /* 支援的瀏覽器在首次繪製就停在目前這張；其餘靠 body 結尾的置中 script */
  scroll-initial-target: nearest;
}

.is-current .plate-frame {
  width: var(--plate-current-size);
  border-radius: var(--plate-current-radius);
  border-color: var(--plate-ink);
  /* 雙框：目前這張多一圈外框，與其他圖版用形狀區分，不只靠顏色 */
  outline-color: var(--plate-line);
}

.is-current .plate-frame :deep(img) {
  filter: none;
  opacity: 1;
}

.is-current .plate-number {
  color: var(--plate-ink);
}

/* 預告下一版（或滑過、聚焦的那版）標題 */
.plate-preview {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-height: 24px;
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 24px;
  color: var(--vp-c-text-2);
}

.preview-label {
  flex: none;
  font-family: var(--display-font-family);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--plate-ink);
}

.preview-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vp-c-text-1);
}

.preview-content {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

/* 預告列與「閱讀中」從下方淡入。
   預告列不做離場：out-in 要等舊文字淡出才放新的，換頁時內文已是新文章、預告卻還停在舊的，看起來新舊並存；
   滑過圖版時也會慢半拍。舊的立刻移除，新的直接淡入。「閱讀中」跟著縮小的舊圖版一起淡出，保留離場 */
.preview-enter-active,
.plate-state-enter-active {
  transition: opacity 0.35s var(--plate-ease), transform 0.35s var(--plate-ease);
}

.plate-state-leave-active {
  transition: opacity 0.15s ease-in, transform 0.15s ease-in;
}

.preview-enter-from,
.plate-state-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.plate-state-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .plate-frame,
  .plate-frame :deep(img),
  .preview-enter-active,
  .plate-state-enter-active,
  .plate-state-leave-active {
    transition: none;
  }
}
</style>
