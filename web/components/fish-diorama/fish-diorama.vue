<template>
  <!-- vp-raw：整個箱庭與小遊戲的動畫一律播放，不受系統 reduced-motion 全域歸零影響 -->
  <section
    v-if="!hasFailed"
    ref="sectionRef"
    class="fish-diorama vp-raw relative w-full overflow-hidden select-none"
    aria-label="鱈魚箱庭互動場景：點擊沙地讓鱈魚跳過去"
    :style="{ '--paper-grain-url': grainUrl ? `url(${grainUrl})` : 'none' }"
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

    <!-- is-scroll-locked：進場後鎖定觸控捲動，拖曳互動不會誤捲頁面；
         進場前維持 pan-y，訪客滑過文末的迎賓畫面不會被卡住 -->
    <canvas
      ref="canvasRef"
      class="diorama-canvas relative block h-full w-full"
      :class="{ 'is-ready': isReady && hasEntered, 'is-scroll-locked': hasEntered }"
      @click="handleCanvasClick"
    />

    <!-- 迎賓頁：場景進場前只鋪漸層與紙紋，點擊後才啟動渲染與進場演出。
         這也讓背景分頁開啟（視窗無 focus、渲染暫停）時不會是一片空白 -->
    <transition name="text">
      <div
        v-if="welcomeVisible"
        class="welcome-overlay vp-raw absolute text-center pointer-events-none"
      >
        <div class="welcome-title">
          歡迎來到鱈魚的魚缸
        </div>
        <div class="welcome-subtitle">
          {{ welcomeSubtitleText }}
        </div>
      </div>
    </transition>

    <!-- 進場後的移動提示（vp-raw：淡出動畫不受 reduced-motion 歸零影響） -->
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
      <!-- 錨點以 clamp 限制在畫面內：留出說明卡半寬與上方卡高，貼近邊緣的裝飾不會讓卡片破圖 -->
      <div
        v-if="nearbySpot && nearbySpotContent && !activeChallengeKey"
        :key="nearbySpot.key"
        class="spot-popup-anchor vp-raw absolute z-10"
        :style="{
          left: `clamp(120px, ${nearbySpot.xRatio * 100}%, calc(100% - 120px))`,
          top: `clamp(215px, ${nearbySpot.yRatio * 100}%, calc(100% - 20px))`,
        }"
      >
        <!-- 已解鎖：單一膠囊泡泡＝作品連結＋分隔線＋重玩鈕，尾巴對齊膠囊中央 -->
        <div
          v-if="isNearbySpotUnlocked"
          class="spot-popup-row"
        >
          <a
            :href="nearbySpotContent.url"
            target="_blank"
            rel="noopener"
            class="spot-popup-link"
          >
            {{ nearbySpotContent.text }}
          </a>
          <span class="spot-popup-divider" />
          <button
            type="button"
            class="spot-replay"
            aria-label="再玩一次"
            title="再玩一次"
            @click="startChallenge"
          >
            <u-icon
              name="i-material-symbols:sports-esports-rounded"
              class="replay-icon"
              aria-hidden="true"
            />
          </button>
        </div>
        <!-- 未解鎖：遊戲說明卡（名稱＋玩法＋獎勵提示＋開始按鈕） -->
        <div
          v-else-if="nearbyChallengeInfo"
          class="spot-challenge-card"
        >
          <div class="challenge-card-title">
            <u-icon
              name="i-material-symbols:lock"
              class="lock-icon"
              aria-hidden="true"
            />
            {{ nearbyChallengeInfo.title }}
          </div>
          <p class="challenge-card-description">
            {{ nearbyChallengeInfo.description }}
          </p>
          <button
            type="button"
            class="challenge-card-start"
            @click="startChallenge"
          >
            開始挑戰
          </button>
          <span class="challenge-card-footer">過關即可解鎖連結</span>
        </div>
      </div>
    </transition>

    <!-- 小遊戲挑戰 overlay（lazy chunk，開啟才載入） -->
    <component
      :is="activeChallengeComponent"
      v-if="activeChallengeComponent"
      :key="activeChallengeKey ?? 'none'"
      v-bind="activeChallengeKey === 'camera'
        ? { getFishShotInfo: getChallengeFishShotInfo, captureSnapshot: captureChallengeSnapshot }
        : {}"
      @success="handleChallengeSuccess"
      @close="closeChallenge"
      @typed="handleTypewriterTyped"
    />

    <!-- 解鎖進度徽章：左下角安靜的小字＋重置鈕，遊戲進行中隱藏 -->
    <div
      v-if="hasEntered && !activeChallengeKey"
      class="unlock-progress vp-raw absolute"
      aria-label="小遊戲解鎖進度"
    >
      <span class="unlock-progress-text">解鎖進度 {{ unlockedSpotSet.size }}/{{ interactionSpotKeyList.length }}</span>
      <!-- 重置遊戲紀錄：兩段式確認防誤觸 -->
      <button
        v-if="unlockedSpotSet.size > 0"
        type="button"
        class="unlock-reset-button"
        :class="{ 'is-confirming': resetConfirmVisible }"
        :aria-label="resetConfirmVisible ? '確定重置遊戲紀錄' : '重置遊戲紀錄'"
        :title="resetConfirmVisible ? '' : '重置遊戲紀錄'"
        @click="handleResetClick"
      >
        <template v-if="resetConfirmVisible">
          確定重置？
        </template>
        <u-icon
          v-else
          name="i-material-symbols:refresh-rounded"
          class="reset-icon"
          aria-hidden="true"
        />
      </button>
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
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { getGrainCssBlobUrl } from './paper-grain'

// 挑戰小遊戲各自拆 chunk，點開挑戰才載入
const CameraChallenge = defineAsyncComponent(() => import('./challenges/camera-challenge.vue'))
const TypewriterChallenge = defineAsyncComponent(() => import('./challenges/typewriter-challenge.vue'))
const CrayonChallenge = defineAsyncComponent(() => import('./challenges/crayon-challenge.vue'))

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

/** 是否已點擊迎賓頁進場（點擊後才啟動渲染迴圈與進場演出） */
const hasEntered = ref(false)
/** 進場後是否已下過移動指令（下過就收掉移動提示） */
const hasCommandedMove = ref(false)
/** 移動提示延後到進場演出大致播完才出現 */
const moveHintDelayDone = ref(false)
let moveHintTimer: ReturnType<typeof setTimeout> | undefined

const welcomeVisible = computed(() => !hasEntered.value)
const welcomeSubtitleText = computed(() => (
  isReady.value ? '點擊任意處繼續' : '正在佈置魚缸...(´,,•ω•,,)'
))
const moveHintVisible = computed(() => (
  hasEntered.value && moveHintDelayDone.value && !hasCommandedMove.value
))

function handleCanvasClick() {
  if (!isReady.value) {
    return
  }
  if (!hasEntered.value) {
    hasEntered.value = true
    moveHintTimer = setTimeout(() => {
      moveHintDelayDone.value = true
    }, 1600)
    return
  }
  hasCommandedMove.value = true
}

/** 魚目前停靠的裝飾與 popup 錨點位置，由場景每幀回報 */
const nearbySpot = ref<NearbyInteractionInfo | null>(null)

const nearbySpotContent = computed(() => (
  nearbySpot.value ? spotContentMap[nearbySpot.value.key] : undefined
))

// --- 挑戰小遊戲與解鎖進度 ---
/** 解鎖進度的 localStorage key（永久保存，過關後回訪直接看到連結） */
const UNLOCK_STORAGE_KEY = 'fish-diorama-unlocked-spot-list'
const interactionSpotKeyList: InteractionSpotKey[] = ['camera', 'typewriter', 'crayonSet']
/** 鎖定說明卡的遊戲名稱與玩法簡介 */
const challengeInfoMap: Record<InteractionSpotKey, { title: string; description: string }> = {
  camera: {
    title: '追焦快門',
    description: '按住畫面對焦，趁鱈魚跳在空中放開快門，拍下 3 張清晰跳躍照。',
  },
  typewriter: {
    title: '節奏打字機',
    description: '文字滑進打字圈的瞬間敲任意鍵，跟上節奏把三句稿子打完！',
  },
  crayonSet: {
    title: '小小畫室',
    description: '拿蠟筆沿虛線描出小魚，路徑匹配度衝到 95% 才算完成，手要穩喔！',
  },
}
const challengeComponentMap = {
  camera: CameraChallenge,
  typewriter: TypewriterChallenge,
  crayonSet: CrayonChallenge,
}

const unlockedSpotSet = ref(new Set<InteractionSpotKey>())
/** 進行中的挑戰；開啟時收起 popup、快門挑戰同時切換場景模式 */
const activeChallengeKey = ref<InteractionSpotKey | null>(null)

const activeChallengeComponent = computed(() => (
  activeChallengeKey.value ? challengeComponentMap[activeChallengeKey.value] : undefined
))
const isNearbySpotUnlocked = computed(() => (
  nearbySpot.value ? unlockedSpotSet.value.has(nearbySpot.value.key) : false
))
const nearbyChallengeInfo = computed(() => (
  nearbySpot.value ? challengeInfoMap[nearbySpot.value.key] : undefined
))

function loadUnlockedSpotList() {
  try {
    const storedText = localStorage.getItem(UNLOCK_STORAGE_KEY)
    if (!storedText) {
      return
    }
    const storedList = JSON.parse(storedText) as InteractionSpotKey[]
    unlockedSpotSet.value = new Set(
      storedList.filter((key) => interactionSpotKeyList.includes(key)),
    )
  }
  catch {
    // 壞資料視同未解鎖
  }
}

function saveUnlockedSpotList() {
  try {
    localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify([...unlockedSpotSet.value]))
  }
  catch {
    // 無痕模式等寫入失敗就不保存，本次瀏覽仍有效
  }
}

function startChallenge() {
  if (!nearbySpot.value) {
    return
  }
  activeChallengeKey.value = nearbySpot.value.key
}

function closeChallenge() {
  activeChallengeKey.value = null
}

function handleChallengeSuccess() {
  const challengeKey = activeChallengeKey.value
  if (!challengeKey) {
    return
  }
  const nextSet = new Set(unlockedSpotSet.value)
  nextSet.add(challengeKey)
  unlockedSpotSet.value = nextSet
  saveUnlockedSpotList()
  activeChallengeKey.value = null
  // 解鎖演出：灰白紙模暈染回原色＋鎖頭旗標飛走＋彈跳水花
  dioramaHandle?.setSpotLocked(challengeKey, false)
  dioramaHandle?.celebrateSpotUnlock(challengeKey)
}

/** 打字挑戰每敲對一鍵，讓 3D 打字機同步演出 */
function handleTypewriterTyped() {
  dioramaHandle?.playSpotShowcase('typewriter')
}

// --- 重置遊戲紀錄（兩段式確認） ---
const resetConfirmVisible = ref(false)
let resetConfirmTimer: ReturnType<typeof setTimeout> | undefined

function handleResetClick() {
  if (!resetConfirmVisible.value) {
    resetConfirmVisible.value = true
    clearTimeout(resetConfirmTimer)
    resetConfirmTimer = setTimeout(() => {
      resetConfirmVisible.value = false
    }, 3000)
    return
  }
  clearTimeout(resetConfirmTimer)
  resetConfirmVisible.value = false
  unlockedSpotSet.value = new Set()
  try {
    localStorage.removeItem(UNLOCK_STORAGE_KEY)
  }
  catch {
    // 寫入失敗就只重置本次瀏覽
  }
  // 模型鎖回灰白紙模＋鎖頭旗標（播過渡，看得出「上鎖」的變化）
  for (const spotKey of interactionSpotKeyList) {
    dioramaHandle?.setSpotLocked(spotKey, true)
  }
}

function getChallengeFishShotInfo() {
  return dioramaHandle?.getFishShotInfo() ?? null
}

function captureChallengeSnapshot() {
  return dioramaHandle?.captureFishSnapshot() ?? null
}

watch(activeChallengeKey, (key) => {
  dioramaHandle?.setCameraChallengeActive(key === 'camera')
})

/** Babylon 場景控制器。非響應式資料，不放進 ref */
let dioramaHandle: DioramaSceneHandle | undefined

const visible = ref(false)
useIntersectionObserver(sectionRef, ([entry]) => {
  visible.value = entry?.isIntersecting || false
})

// 進場前不啟動渲染：迎賓頁只需要 CSS 漸層與紙紋，
// 也避免視窗無 focus 時（渲染暫停）首屏是一片空白
const shouldRun = computed(() => (
  isReady.value && hasEntered.value && visible.value && isFocused.value
))

onMounted(async () => {
  loadUnlockedSpotList()

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
    // 依保存的解鎖進度直接套用鎖定視覺（載入時不播過渡）
    for (const spotKey of interactionSpotKeyList) {
      dioramaHandle.setSpotLocked(spotKey, !unlockedSpotSet.value.has(spotKey), true)
    }
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
  if (moveHintTimer) {
    clearTimeout(moveHintTimer)
  }
  clearTimeout(resetConfirmTimer)
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
  // 內嵌在 index.md 文末：裱框樣式（圓角＋細框＋陰影），像貼在文章裡的箱庭櫥窗
  margin-top: 20px
  border-radius: 18px
  border: 1px solid light-dark(rgba(62, 95, 82, 0.18), rgba(255, 255, 255, 0.1))
  box-shadow: 0 10px 34px light-dark(rgba(27, 42, 51, 0.16), rgba(0, 0, 0, 0.4))
  // 內嵌高度固定 70vh，不佔滿整屏，融入文章版面
  height: 70vh
  height: 70dvh
  background: linear-gradient(180deg, light-dark(oklch(0.97 0.015 195), oklch(0.26 0.03 220)) 0%, light-dark(oklch(0.93 0.03 180), oklch(0.22 0.035 205)) 55%, light-dark(oklch(0.9 0.045 170), oklch(0.19 0.04 195)) 100%)

.diorama-canvas
  opacity: 0
  transition: opacity 0.8s ease
  cursor: pointer
  touch-action: pan-y
  -webkit-tap-highlight-color: transparent
  outline: none

  &.is-ready
    opacity: 1

  // 進場後鎖定觸控捲動：玩遊戲時的拖曳（描線、追焦長按）不會誤捲頁面
  &.is-scroll-locked
    touch-action: none

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

.welcome-overlay
  // 視覺重心略高於正中，迎賓文字不壓到場景主體
  top: 34%
  left: 0
  right: 0
  color: #fff
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8), 0 2px 10px rgba(15, 30, 40, 0.6), 0 0 24px rgba(15, 30, 40, 0.4)

.welcome-title
  font-size: clamp(26px, 5vw, 36px)
  font-weight: 600
  letter-spacing: 8px
  // 置中補償 letter-spacing 只加在字後造成的視覺偏左
  text-indent: 8px

.welcome-subtitle
  margin-top: 16px
  font-size: 14px
  letter-spacing: 4px
  text-indent: 4px
  animation: move-hint-breathe 2.6s ease-in-out infinite

// 淡出時停掉呼吸動畫，opacity 才輪得到 transition 接手
.welcome-overlay.text-leave-active .welcome-subtitle
  animation: none

.move-hint
  // 上方偏中央：桌機導覽列是 fixed 覆蓋，往下留些距離避開
  top: 13%
  left: 0
  right: 0
  color: #fff
  font-size: 18px
  font-weight: 500
  letter-spacing: 2px
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

// 已解鎖：單一膠囊泡泡（連結＋分隔線＋重玩），尾巴對齊膠囊中央
.spot-popup-row
  position: relative
  display: flex
  align-items: stretch
  border-radius: 999px
  transform-origin: bottom center
  // 紙紋鋪在底色上（背景層，內容自然在上），與整體手作箱庭一致
  background-color: light-dark(rgba(255, 253, 247, 0.94), rgba(36, 46, 52, 0.94))
  background-image: var(--paper-grain-url, none)
  background-repeat: repeat
  background-size: 200px 200px
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

.spot-popup-link
  display: flex
  align-items: center
  padding: 6px 12px 6px 15px
  border-radius: 999px 0 0 999px
  font-size: 13px
  letter-spacing: 0.02em
  white-space: nowrap
  text-decoration: none
  color: light-dark(oklch(0.42 0.06 195), oklch(0.88 0.03 195))
  transition: background 0.2s

  &:hover
    background: light-dark(rgba(27, 42, 51, 0.05), rgba(255, 255, 255, 0.06))

.spot-popup-divider
  width: 1px
  margin: 6px 0
  background: light-dark(rgba(62, 95, 82, 0.2), rgba(255, 255, 255, 0.12))

.spot-replay
  appearance: none
  border: none
  display: flex
  align-items: center
  justify-content: center
  padding: 0 12px 0 9px
  border-radius: 0 999px 999px 0
  cursor: pointer
  color: light-dark(oklch(0.5 0.04 195), oklch(0.78 0.03 195))
  background: transparent
  transition: background 0.2s, color 0.2s

  &:hover
    background: light-dark(rgba(27, 42, 51, 0.05), rgba(255, 255, 255, 0.06))
    color: light-dark(oklch(0.38 0.06 195), oklch(0.92 0.02 195))

    .replay-icon
      transform: scale(1.15)

.replay-icon
  font-size: 18px
  transition: transform 0.2s

// 未解鎖：遊戲說明卡
.spot-challenge-card
  position: relative
  width: 216px
  padding: 13px 15px 12px
  border-radius: 12px
  text-align: center
  transform-origin: bottom center
  background-color: light-dark(rgba(255, 253, 247, 0.96), rgba(36, 46, 52, 0.96))
  background-image: var(--paper-grain-url, none)
  background-repeat: repeat
  background-size: 200px 200px
  border: 1px solid light-dark(rgba(62, 95, 82, 0.28), rgba(255, 255, 255, 0.14))
  box-shadow: 0 6px 20px light-dark(rgba(27, 42, 51, 0.22), rgba(0, 0, 0, 0.45))
  color: light-dark(oklch(0.4 0.06 195), oklch(0.88 0.03 195))

  // 指向物體的小尾巴
  &::after
    content: ''
    position: absolute
    left: 50%
    top: 100%
    transform: translateX(-50%)
    border: 7px solid transparent
    border-top-color: light-dark(rgba(255, 253, 247, 0.96), rgba(36, 46, 52, 0.96))

.challenge-card-title
  display: flex
  align-items: center
  justify-content: center
  gap: 6px
  font-size: 15px
  font-weight: 600
  letter-spacing: 3px

.lock-icon
  font-size: 15px
  flex-shrink: 0
  opacity: 0.75

.challenge-card-description
  margin: 7px 0 0
  font-size: 12px
  line-height: 1.7
  text-align: left
  opacity: 0.78

.challenge-card-start
  appearance: none
  margin-top: 10px
  width: 100%
  padding: 7px 0
  border: none
  border-radius: 999px
  font-family: inherit
  font-size: 13px
  font-weight: 600
  letter-spacing: 3px
  cursor: pointer
  color: #fff
  background: light-dark(#4f9ac2, #3d7ba0)
  box-shadow: 0 3px 10px light-dark(rgba(27, 42, 51, 0.25), rgba(0, 0, 0, 0.4))
  transition: transform 0.15s, box-shadow 0.15s

  &:hover
    transform: translateY(-1px)
    box-shadow: 0 5px 14px light-dark(rgba(27, 42, 51, 0.35), rgba(0, 0, 0, 0.55))

.challenge-card-footer
  display: block
  margin-top: 7px
  font-size: 12px
  letter-spacing: 1px
  opacity: 0.5

// 已解鎖：連結＋重玩鈕並排
// 解鎖進度徽章：左下角小字＋重置鈕，避開置中的捲動提示
.unlock-progress
  left: 20px
  bottom: 18px
  display: flex
  align-items: center
  gap: 8px
  pointer-events: none

.unlock-progress-text
  font-size: 12px
  letter-spacing: 1px
  color: light-dark(oklch(0.45 0.06 175), oklch(0.85 0.05 175))
  opacity: 0.7

.unlock-reset-button
  appearance: none
  pointer-events: auto
  display: flex
  align-items: center
  justify-content: center
  min-width: 24px
  height: 24px
  padding: 0 5px
  border: 1px solid light-dark(rgba(62, 95, 82, 0.25), rgba(255, 255, 255, 0.15))
  border-radius: 999px
  font-family: inherit
  font-size: 12px
  letter-spacing: 1px
  cursor: pointer
  color: light-dark(oklch(0.45 0.06 175), oklch(0.85 0.05 175))
  background: light-dark(rgba(255, 253, 247, 0.85), rgba(36, 46, 52, 0.85))
  transition: color 0.2s, border-color 0.2s, background 0.2s, opacity 0.2s
  opacity: 0.65

  &:hover
    opacity: 1

  // 確認狀態：轉為警示紅，再點一次才真的重置
  &.is-confirming
    opacity: 1
    padding: 0 10px
    color: #fff
    border-color: #d24b4b
    background: #d24b4b

.reset-icon
  font-size: 15px

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

.popup-enter-active .spot-popup-row,
.popup-enter-active .spot-challenge-card
  animation: popup-bounce-in 0.4s ease-out both

.popup-leave-active
  transition: opacity 0.18s ease-in, margin-top 0.18s ease-in

.popup-leave-to
  opacity: 0
  margin-top: 6px

.text
  &-enter-active, &-leave-active
    transition: opacity 0.4s, transform 0.4s
  &-enter-from, &-leave-to
    opacity: 0
    transform: translateY(6px)
</style>
