<template>
  <section
    v-if="!hasFailed"
    ref="sectionRef"
    class="fish-diorama relative w-full overflow-hidden select-none"
    aria-label="鱈魚箱庭互動場景：點擊沙地讓鱈魚跳過去"
  >
    <!-- 背景紙紋：墊在透明 canvas 下方，只鋪在 CSS 漸層上（模型的紙紋由材質內混合）。
         上層平鋪負責遠景，下層用 CSS 透視變形傾成地板面（近大遠小） -->
    <div
      v-if="grainUrl"
      class="paper-grain-background absolute inset-0 pointer-events-none"
      :style="{ backgroundImage: `url(${grainUrl})` }"
    />
    <div
      v-if="grainUrl"
      class="paper-grain-floor absolute pointer-events-none"
      :style="{ backgroundImage: `url(${grainUrl})` }"
    />

    <!-- 夜間星空：深色模式時上半部浮現星點（vp-raw：閃爍不受 reduced-motion 歸零） -->
    <div class="night-star-layer vp-raw absolute inset-0 pointer-events-none" />

    <canvas
      ref="canvasRef"
      class="diorama-canvas relative block h-full w-full"
      :class="{ 'is-ready': isReady }"
      @click="hasInteracted = true"
    />

    <!-- 首次點擊前的移動提示（vp-raw：淡出動畫不受 reduced-motion 歸零影響） -->
    <transition name="text">
      <div
        v-if="moveHintVisible"
        class="move-hint vp-raw absolute tracking-wide text-center pointer-events-none"
      >
        點一下地板，鱈魚就會跳過去
      </div>
    </transition>

    <!-- 魚停在裝飾旁時浮出的連結 popup。外層錨點只管定位（錨定物體頂端投影位置），
         內層泡泡負責外觀與進出場動畫，兩層 transform 才不會互相覆蓋。
         動畫掛在內層，Vue 偵測不到根元素時長，需明確給 duration -->
    <transition
      name="popup"
      :duration="{ enter: 400, leave: 180 }"
    >
      <!-- vp-raw：VitePress 在 prefers-reduced-motion 時會全域把動畫時長歸零，
           此 class 是官方逃逸口；桌面裝置常因系統關閉視窗動畫而回報 reduce，
           popup 的輕量回饋動畫不該因此消失 -->
      <div
        v-if="nearbySpot && nearbySpotContent"
        :key="nearbySpot.key"
        class="spot-popup-anchor vp-raw absolute z-10"
        :style="{
          left: `${nearbySpot.xRatio * 100}%`,
          top: `${nearbySpot.yRatio * 100}%`,
        }"
      >
        <a
          :href="nearbySpotContent.url"
          target="_blank"
          rel="noopener"
          class="spot-popup"
        >
          {{ nearbySpotContent.text }}
        </a>
      </div>
    </transition>

    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
      <transition
        name="text"
        mode="out-in"
      >
        <span
          :key="hintText"
          class="hint-text text-sm tracking-wide"
        >
          {{ hintText }}
        </span>
      </transition>

      <svg
        class="hint-arrow w-5 h-5 animate-bounce"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DioramaSceneHandle, NearbyInteractionInfo } from './diorama-scene'
import type { InteractionSpotKey } from './tank-environment'
import {
  useIntersectionObserver,
  useResizeObserver,
  useWindowFocus,
} from '@vueuse/core'
import { useData } from 'vitepress'
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { getGrainCssBlobUrl } from './paper-grain'

const sectionRef = useTemplateRef('sectionRef')
const canvasRef = useTemplateRef('canvasRef')

const { isDark } = useData()
const isFocused = useWindowFocus()

const isReady = ref(false)
const hasFailed = ref(false)
/** 背景紙紋 tile 的 Blob URL（明暗各一版，soft-light 對各自底色解算），
 * 產生失敗就不鋪（優雅降級）
 */
const lightGrainUrl = ref('')
const darkGrainUrl = ref('')
const grainUrl = computed(() => (isDark.value ? darkGrainUrl.value : lightGrainUrl.value))

/** 各可互動裝飾對應的 popup 文字與連結（點擊開新分頁） */
const spotContentMap: Record<InteractionSpotKey, { text: string; url: string }> = {
  typewriter: { text: '點我看文章作品', url: 'https://www.flickr.com/photos/coodfish/albums/72157642297573993/' },
  camera: { text: '點我看攝影作品', url: 'https://www.flickr.com/photos/coodfish/' },
  crayonSet: { text: '點我看繪圖作品', url: 'https://www.flickr.com/photos/coodfish/albums/72157644028504527/' },
}

/** 使用者是否點擊過場景（點過就收掉移動提示） */
const hasInteracted = ref(false)

const moveHintVisible = computed(() => isReady.value && !hasInteracted.value)

/** 魚目前停靠的裝飾與 popup 錨點位置，由場景每幀回報 */
const nearbySpot = ref<NearbyInteractionInfo | null>(null)

const nearbySpotContent = computed(() => (
  nearbySpot.value ? spotContentMap[nearbySpot.value.key] : undefined
))

/** Babylon 場景控制器。非響應式資料，不放進 ref */
let dioramaHandle: DioramaSceneHandle | undefined

const visible = ref(false)
useIntersectionObserver(sectionRef, ([entry]) => {
  visible.value = entry?.isIntersecting || false
})

const shouldRun = computed(() => (
  isReady.value && visible.value && isFocused.value
))

const hintText = computed(() => {
  if (!isReady.value) {
    return '正在佈置魚缸...(´,,•ω•,,)'
  }
  return '下面還有很多內容 (ゝ∀・)b'
})

onMounted(async () => {
  // 背景紙紋非關鍵路徑：失敗就維持純漸層
  getGrainCssBlobUrl('light')
    .then((url) => {
      lightGrainUrl.value = url
    })
    .catch(() => {})
  getGrainCssBlobUrl('dark')
    .then((url) => {
      darkGrainUrl.value = url
    })
    .catch(() => {})

  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  try {
    // Babylon 相關模組延後到瀏覽器端才載入，避免佔用首屏 bundle
    const { createDioramaScene } = await import('./diorama-scene')

    dioramaHandle = createDioramaScene(canvas, {
      isDark: isDark.value,
      onNearbySpotChange(info) {
        nearbySpot.value = info
      },
    })
    dioramaHandle.resize()
    isReady.value = true
  }
  catch (error) {
    // WebGL 不可用或載入失敗：收起整個箱庭，首頁維持原樣
    console.error('[fish-diorama] 場景初始化失敗', error)
    hasFailed.value = true
  }
})

watch(shouldRun, (value) => {
  dioramaHandle?.setRunning(value)
})

watch(isDark, (value) => {
  dioramaHandle?.setDarkMode(value)
})

useResizeObserver(sectionRef, () => {
  dioramaHandle?.resize()
})

onUnmounted(() => {
  dioramaHandle?.dispose()
  dioramaHandle = undefined
})
</script>

<style scoped lang="sass">
.fish-diorama
  // 紙紋濃度：light-dark() 只適用於顏色值，數字得用變數＋.dark 覆寫。
  // 亮色 tile 烘焙對比已拉高（讓地板紋理讀得到），背景層壓回原本的清爽濃度
  --grain-background-opacity: 0.6
  --grain-floor-opacity: 1
  // 手機版導覽列佔版面高度，扣掉才剛好一屏；桌機導覽列為 fixed 覆蓋，用整屏
  height: calc(100vh - var(--vp-nav-height))
  height: calc(100dvh - var(--vp-nav-height))
  background: linear-gradient(180deg, light-dark(oklch(0.97 0.015 195), oklch(0.26 0.03 220)) 0%, light-dark(oklch(0.93 0.03 180), oklch(0.22 0.035 205)) 55%, light-dark(oklch(0.9 0.045 170), oklch(0.19 0.04 195)) 100%)

  @media (min-width: 960px)
    height: 100vh
    height: 100dvh

.diorama-canvas
  opacity: 0
  transition: opacity 0.8s ease
  cursor: pointer
  touch-action: pan-y
  -webkit-tap-highlight-color: transparent
  outline: none

  &.is-ready
    opacity: 1

// 深色模式用深底色烘焙的專屬紋理，濃度壓到極低、若有似無
:global(html.dark .fish-diorama)
  --grain-background-opacity: 0.2
  --grain-floor-opacity: 0.5

.paper-grain-background
  background-repeat: repeat
  opacity: var(--grain-background-opacity)
  // 下半部（地板區）淡出，交給透視變形的地板層，避免重複疊加
  mask-image: linear-gradient(to bottom, black 0%, black 26%, transparent 48%)
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 26%, transparent 48%)

.paper-grain-floor
  background-repeat: repeat
  opacity: var(--grain-floor-opacity)
  // 傾成地板面：以上緣（地平線附近）為軸做透視旋轉，紋理近大遠小。
  // 寬度左右外擴，旋轉後才不會在畫面兩側露出缺角
  top: 24%
  bottom: -30%
  left: -40%
  right: -40%
  transform-origin: top center
  transform: perspective(900px) rotateX(54deg)
  // 上緣淡入，與上方平鋪層平滑銜接
  mask-image: linear-gradient(to bottom, transparent 0%, black 18%)
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 18%)

.night-star-layer
  // 多組不同週期的 radial-gradient 疊出擬隨機星野，只鋪在畫面上半（天空區）
  opacity: 0
  background-image: radial-gradient(1.2px 1.2px at 22% 31%, rgba(255, 255, 255, 0.9), transparent 60%), radial-gradient(1px 1px at 68% 12%, rgba(255, 255, 255, 0.7), transparent 60%), radial-gradient(1.6px 1.6px at 45% 52%, rgba(255, 235, 200, 0.8), transparent 60%), radial-gradient(1px 1px at 85% 40%, rgba(255, 255, 255, 0.6), transparent 60%), radial-gradient(1.3px 1.3px at 8% 66%, rgba(210, 225, 255, 0.7), transparent 60%)
  background-size: 280px 280px, 360px 360px, 440px 440px, 320px 320px, 400px 400px
  background-repeat: repeat
  mask-image: linear-gradient(to bottom, black 0%, black 28%, transparent 52%)
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 28%, transparent 52%)

:global(html.dark) .night-star-layer
  animation: star-breathe 6s ease-in-out infinite

@keyframes star-breathe
  0%, 100%
    opacity: 1
  50%
    opacity: 0.55

.move-hint
  // 上方偏中央：桌機導覽列是 fixed 覆蓋，往下留些距離避開
  top: 13%
  left: 0
  right: 0
  color: #fff
  font-size: 22px
  font-weight: 500
  letter-spacing: 4px
  // 深色多層陰影：襯著淡色背景與遠景丘陵也要讀得清楚
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8), 0 2px 10px rgba(15, 30, 40, 0.6), 0 0 24px rgba(15, 30, 40, 0.4)
  animation: move-hint-breathe 2.6s ease-in-out infinite

  // 淡出時停掉呼吸動畫，opacity 才輪得到 transition 接手
  &.text-leave-active
    animation: none

@keyframes move-hint-breathe
  0%, 100%
    opacity: 0.95
  50%
    opacity: 0.45

.spot-popup-anchor
  // 定位點是物體頂端投影位置，整體上移並留出小尾巴的空間
  transform: translate(-50%, calc(-100% - 10px))

.spot-popup
  position: relative
  display: block
  padding: 6px 14px
  border-radius: 999px
  font-size: 13px
  letter-spacing: 0.02em
  white-space: nowrap
  text-decoration: none
  transform-origin: bottom center
  background: light-dark(rgba(255, 253, 247, 0.94), rgba(36, 46, 52, 0.94))
  color: light-dark(oklch(0.42 0.06 195), oklch(0.88 0.03 195))
  border: 1px solid light-dark(rgba(62, 95, 82, 0.28), rgba(255, 255, 255, 0.14))
  box-shadow: 0 4px 14px light-dark(rgba(27, 42, 51, 0.18), rgba(0, 0, 0, 0.4))
  transition: box-shadow 0.2s

  &:hover
    box-shadow: 0 6px 18px light-dark(rgba(27, 42, 51, 0.28), rgba(0, 0, 0, 0.55))

  // 指向物體的小尾巴
  &::after
    content: ''
    position: absolute
    left: 50%
    top: 100%
    transform: translateX(-50%)
    border: 6px solid transparent
    border-top-color: light-dark(rgba(255, 253, 247, 0.94), rgba(36, 46, 52, 0.94))

// 進場：從尾巴根部長出來的果凍彈跳；離場：快速淡出下沉
@keyframes popup-bounce-in
  0%
    opacity: 0
    transform: translateY(8px) scale(0.6)
  55%
    opacity: 1
    transform: translateY(-3px) scale(1.06)
  80%
    transform: translateY(1px) scale(0.98)
  100%
    opacity: 1
    transform: translateY(0) scale(1)

.popup-enter-active .spot-popup
  animation: popup-bounce-in 0.4s ease-out both

.popup-leave-active
  transition: opacity 0.18s ease-in, margin-top 0.18s ease-in

.popup-leave-to
  opacity: 0
  margin-top: 6px

.hint-text, .hint-arrow
  color: light-dark(oklch(0.45 0.06 175), oklch(0.85 0.05 175))
  opacity: 0.75

.text
  &-enter-active, &-leave-active
    transition: opacity 0.4s, transform 0.4s
  &-enter-from, &-leave-to
    opacity: 0
    transform: translateY(6px)
</style>
