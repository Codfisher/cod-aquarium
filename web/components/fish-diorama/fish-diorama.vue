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
        {{ moveHintText }}
      </div>
    </transition>

    <!-- WebGL context 遺失的過渡提示：手機切背景、記憶體吃緊時常見。
         Babylon 會嘗試自動重建畫面，這裡只是讓玩家知道畫面暫時卡住不是壞掉；
         逾時仍未恢復就退回既有的失敗畫面（見 handleContextLost） -->
    <transition name="text">
      <div
        v-if="contextLost"
        class="context-lost-overlay vp-raw absolute text-center pointer-events-none"
      >
        畫面連線中斷，正在重新整理...
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
        v-if="nearbySpot && nearbySpotContent && !activeGameId"
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
            @click="startSpotGame"
          >
            <u-icon
              name="i-material-symbols:sports-esports-rounded"
              class="replay-icon"
              aria-hidden="true"
            />
          </button>
        </div>
        <!-- 未解鎖：遊戲說明卡（名稱＋玩法＋過關門檻＋開始按鈕） -->
        <div
          v-else-if="nearbyGameMeta"
          class="spot-challenge-card"
        >
          <div class="challenge-card-title">
            <u-icon
              name="i-material-symbols:lock"
              class="lock-icon"
              aria-hidden="true"
            />
            {{ nearbyGameMeta.title }}
          </div>
          <p class="challenge-card-description">
            {{ nearbyGameMeta.description }}
          </p>
          <button
            type="button"
            class="challenge-card-start"
            @click="startSpotGame"
          >
            開始挑戰
          </button>
          <span class="challenge-card-footer">
            達到 {{ nearbyGameMeta.clearScore }} {{ nearbyGameMeta.scoreUnit }} 解鎖連結
          </span>
        </div>
      </div>
    </transition>

    <!-- 遊戲轉場：墨水暈染蓋過整個畫面，底下趁機把 Scene 換掉。
         進出場都走它，玩家不會看到場景切換的破綻 -->
    <transition name="ink">
      <div
        v-if="inkTransitionVisible"
        class="ink-transition vp-raw absolute inset-0 pointer-events-none"
      />
    </transition>

    <!-- 遊戲 HUD：遊戲進行中接管整個箱庭畫面（lazy chunk，開玩才載入） -->
    <game-hud
      v-if="activeGameMeta"
      :meta="activeGameMeta"
      :phase="hudPhase"
      :score="gameScore"
      :best-score="activeGameBestScore"
      :toast-text="toastText"
      :new-reward-id-list="newRewardIdList"
      :has-just-cleared="hasJustCleared"
      :hud-state="gameHudState"
      @begin="beginActiveGame"
      @retry="restartActiveGame"
      @close="closeGame"
      @hud-action="gameHost?.triggerHudAction($event)"
    />

    <!-- 收藏冊：配件穿脫與最佳紀錄（lazy chunk） -->
    <reward-collection
      v-if="collectionVisible"
      :unlocked-reward-id-list="gameProgress.unlockedRewardIdList"
      :equipped-reward-id-list="gameProgress.equippedRewardIdList"
      :best-score-map="gameProgress.bestScoreMap"
      @close="collectionVisible = false"
      @equip="handleEquipAccessory"
      @unequip="handleUnequipAccessory"
    />

    <!-- 解鎖進度徽章：左下角安靜的小字＋收藏冊＋重置鈕，遊戲進行中隱藏 -->
    <div
      v-if="hasEntered && !activeGameId"
      class="unlock-progress vp-raw absolute"
      aria-label="小遊戲解鎖進度"
    >
      <span class="unlock-progress-text">
        解鎖 {{ unlockedSpotSet.size }}/{{ interactionSpotKeyList.length }}
        ・配件 {{ unlockedAccessoryCount }}/{{ totalAccessoryCount }}
      </span>
      <!-- 收藏冊：看配件與最佳紀錄，也是配件穿脫的唯一入口 -->
      <button
        type="button"
        class="unlock-reset-button"
        aria-label="打開收藏冊"
        title="收藏冊"
        @click="collectionVisible = true"
      >
        <u-icon
          name="i-material-symbols:book-2-outline-rounded"
          class="reset-icon"
          aria-hidden="true"
        />
      </button>
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

    <!-- dev 測試選單：僅開發模式出現，收合式 dropmenu，模擬深夜訪客與各種彩蛋演出 -->
    <div
      v-if="isDevMode && hasEntered"
      class="dev-test-menu vp-raw absolute"
    >
      <transition name="text">
        <div
          v-if="devMenuVisible"
          class="dev-menu-panel"
        >
          <button
            type="button"
            class="dev-menu-item"
            @click="cycleSleepyOverride"
          >
            深夜訪客：{{ sleepyOverrideLabel }}
          </button>
          <button
            type="button"
            class="dev-menu-item"
            @click="toggleDevCelebration"
          >
            慶典模式：{{ devCelebrationActive ? '開' : '關' }}
          </button>
          <button
            type="button"
            class="dev-menu-item"
            @click="unlockAllRewardList"
          >
            解鎖全部獎勵
          </button>
          <!-- 六款遊戲只有三個入口裝飾，其餘三款在正式綁定前先從這裡試玩 -->
          <div class="dev-menu-divider" />
          <button
            v-for="gameMeta in miniGameMetaList"
            :key="gameMeta.id"
            type="button"
            class="dev-menu-item"
            @click="startGame(gameMeta.id)"
          >
            ▸ {{ gameMeta.title }}
          </button>
        </div>
      </transition>
      <button
        type="button"
        class="dev-menu-trigger"
        :class="{ 'is-open': devMenuVisible }"
        @click="devMenuVisible = !devMenuVisible"
      >
        DEV
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DioramaSceneHandle, NearbyInteractionInfo } from './diorama-scene'
import type { GameHudPhase } from './game-hud.vue'
import type { GameHudState, MiniGameId } from './games/game-contract'
import type { GameHost } from './games/game-host'
import type { RewardId } from './rewards/reward-registry'
import type { InteractionSpotKey } from './tank-environment'
import {
  useIntersectionObserver,
  useResizeObserver,
  useWindowFocus,
} from '@vueuse/core'
import { useData } from 'vitepress'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { collectNewMilestoneList } from './games/game-contract'
import { miniGameIdList, miniGameMetaMap, spotGameMap } from './games/game-registry'
import { getGrainCssBlobUrl } from './paper-grain'
import { rewardDefinitionList, rewardIdList } from './rewards/reward-registry'
import {
  clearGameProgress,
  equipAccessory,
  loadGameProgress,
  saveGameProgress,
  unequipAccessory,
} from './rewards/reward-storage'

// HUD 與收藏冊各自拆 chunk：首屏只需要箱庭本身，玩起來才載
const GameHud = defineAsyncComponent(() => import('./game-hud.vue'))
const RewardCollection = defineAsyncComponent(() => import('./reward-collection.vue'))

const sectionRef = useTemplateRef('sectionRef')
const canvasRef = useTemplateRef('canvasRef')

const { isDark } = useData()
const isFocused = useWindowFocus()

const isReady = ref(false)
const hasFailed = ref(false)
/** WebGL context 暫時遺失（手機切背景、記憶體吃緊時常見）。true 時畫面顯示過渡提示，
 * 逾時仍未恢復（見 CONTEXT_LOST_FAIL_MS）就判定救不回來，退回 hasFailed 的失敗畫面
 */
const contextLost = ref(false)
const CONTEXT_LOST_FAIL_MS = 8000
let contextLostFailTimer: ReturnType<typeof setTimeout> | undefined

function handleContextLost() {
  contextLost.value = true
  clearTimeout(contextLostFailTimer)
  contextLostFailTimer = setTimeout(() => {
    // 只有「玩家正看著、卻仍沒恢復」才判定救不回來。
    // 手機切到背景或鎖螢幕時，系統本來就會回收 WebGL context，那是正常現象；
    // 這時若照樣判失敗，玩家切回來會發現整個箱庭消失了——比崩潰本身更糟
    if (!visible.value || !isFocused.value) {
      return
    }
    hasFailed.value = true
  }, CONTEXT_LOST_FAIL_MS)
}

function handleContextRestored() {
  clearTimeout(contextLostFailTimer)
  contextLost.value = false
}

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

// --- 深夜訪客：深色模式＋凌晨時段，魚戴睡帽、動作變慢；dev 測試選單可強制切換 ---
const isDevMode = import.meta.env.DEV
type SleepyOverride = 'auto' | 'on' | 'off'
const sleepyOverride = ref<SleepyOverride>('auto')
const currentHour = ref(new Date().getHours())
let hourTimer: ReturnType<typeof setInterval> | undefined

const sleepyActive = computed(() => {
  if (sleepyOverride.value !== 'auto') {
    return sleepyOverride.value === 'on'
  }
  return isDark.value && currentHour.value < 5
})
const sleepyOverrideLabel = computed(() => (
  ({ auto: '自動', on: '開', off: '關' } as const)[sleepyOverride.value]
))
const moveHintText = computed(() => (
  sleepyActive.value ? '噓⋯鱈魚在睡覺，輕輕點一下地板' : '點一下地板，鱈魚就會跳過去'
))

function cycleSleepyOverride() {
  const orderList: SleepyOverride[] = ['auto', 'on', 'off']
  const nextIndex = (orderList.indexOf(sleepyOverride.value) + 1) % orderList.length
  sleepyOverride.value = orderList[nextIndex]!
}

/** dev 選單展開狀態與慶典模式模擬開關（開＝播慶典戴皇冠、關＝摘皇冠） */
const devMenuVisible = ref(false)
const devCelebrationActive = ref(false)

function toggleDevCelebration() {
  devCelebrationActive.value = !devCelebrationActive.value
  if (devCelebrationActive.value) {
    dioramaHandle?.celebrateFullUnlock()
  }
  else {
    dioramaHandle?.setCrownVisible(false)
  }
}

watch(sleepyActive, (value) => {
  dioramaHandle?.setSleepyMode(value)
})

function handleCanvasClick() {
  if (!isReady.value) {
    return
  }
  if (!hasEntered.value) {
    hasEntered.value = true
    // 物理拖到這一刻才載：Havok WASM 的記憶體尖峰不該疊在場景初始化的顯存尖峰上，
    // 而迎賓頁本來就用不到物理（見 createDioramaScene 的 startPhysics）
    dioramaHandle?.startPhysics()
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

// --- 作品連結的解鎖進度（過關即解鎖，與高分獎勵是兩套） ---
/** 解鎖進度的 localStorage key（永久保存，過關後回訪直接看到連結） */
const UNLOCK_STORAGE_KEY = 'fish-diorama-unlocked-spot-list'
const interactionSpotKeyList: InteractionSpotKey[] = ['camera', 'typewriter', 'crayonSet']

const unlockedSpotSet = ref(new Set<InteractionSpotKey>())
/** 畫面上（3D 鎖頭模型）目前已經演出過解鎖的裝飾。
 * 用來跟 unlockedSpotSet 這份紀錄比對，才知道關閉遊戲時該不該補播解鎖演出——
 * 不能直接看 hasJustCleared：玩家過關後選擇再玩一次，那一場的 hasJustCleared
 * 會因為紀錄已經解鎖過而變 false，但畫面上的鎖頭其實還沒真的打開過
 */
const visuallyUnlockedSpotSet = ref(new Set<InteractionSpotKey>())

const isNearbySpotUnlocked = computed(() => (
  nearbySpot.value ? unlockedSpotSet.value.has(nearbySpot.value.key) : false
))
/** 停靠裝飾對應的遊戲資料，說明卡直接讀它 */
const nearbyGameMeta = computed(() => (
  nearbySpot.value ? miniGameMetaMap[spotGameMap[nearbySpot.value.key]] : undefined
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

// --- 高分獎勵進度（配件與彩蛋） ---
const gameProgress = ref(loadGameProgress())
const collectionVisible = ref(false)

const totalAccessoryCount = rewardDefinitionList.length
const unlockedAccessoryCount = computed(() => {
  return gameProgress.value.unlockedRewardIdList.length
})

function persistGameProgress() {
  saveGameProgress(gameProgress.value)
  dioramaHandle?.setEquippedAccessoryList(gameProgress.value.equippedRewardIdList)
}

function handleEquipAccessory(rewardId: RewardId) {
  gameProgress.value = equipAccessory(gameProgress.value, rewardId)
  persistGameProgress()
}

function handleUnequipAccessory(rewardId: RewardId) {
  gameProgress.value = unequipAccessory(gameProgress.value, rewardId)
  persistGameProgress()
}

// --- 迷你遊戲的生命週期 ---
const miniGameMetaList = miniGameIdList.map((gameId) => miniGameMetaMap[gameId])

/** 進行中的遊戲；null = 待在箱庭 */
const activeGameId = ref<MiniGameId | null>(null)
const hudPhase = ref<GameHudPhase>('loading')
const gameScore = ref(0)
const toastText = ref('')
const newRewardIdList = ref<RewardId[]>([])
const hasJustCleared = ref(false)
/** 遊戲自訂 HUD 的內容（電量、大絕槽、生命燈、按鈕）。由遊戲每幀回報、host 過濾沒變的 */
const gameHudState = ref<GameHudState>({ gaugeList: [], pipRowList: [], actionList: [] })
/** 墨水轉場：蓋住畫面的期間偷偷把 Scene 換掉 */
const inkTransitionVisible = ref(false)

let toastTimer: ReturnType<typeof setTimeout> | undefined
let inkTransitionTimer: ReturnType<typeof setTimeout> | undefined
/** 遊戲宿主借用箱庭的 Engine，非響應式資料不放進 ref */
let gameHost: GameHost | undefined

const activeGameMeta = computed(() => (
  activeGameId.value ? miniGameMetaMap[activeGameId.value] : undefined
))
/** 開局當下的歷史最佳分數快照。
 * 不能用 computed 直接讀 bestScoreMap——結算時那份資料已經被本場成績覆蓋，
 * 「新紀錄」的判定會拿本場分數跟自己比，永遠不成立
 */
const activeGameBestScore = ref(0)

/** 建立宿主。箱庭初始化成功後才有 engine 可借 */
function ensureGameHost(): GameHost | undefined {
  if (gameHost || !dioramaHandle || !canvasRef.value) {
    return gameHost
  }
  gameHost = createGameHostLazy(dioramaHandle.engine, canvasRef.value)
  return gameHost
}

/** createGameHost 走動態 import，避免遊戲宿主與契約進首屏 bundle。
 * 宿主本身很輕，但它牽出的 Babylon 後製與物理模組不輕
 */
let createGameHostFactory: typeof import('./games/game-host').createGameHost | undefined

function createGameHostLazy(engine: DioramaSceneHandle['engine'], canvas: HTMLCanvasElement): GameHost | undefined {
  if (!createGameHostFactory) {
    return undefined
  }
  return createGameHostFactory({
    canvas,
    engine,
    isDark: isDark.value,
    onScoreChange(score) {
      gameScore.value = score
    },
    onGameOver(finalScore) {
      finishGame(finalScore)
    },
    onToast(text) {
      toastText.value = text
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => {
        toastText.value = ''
      }, 1400)
    },
    onHudStateChange(state) {
      gameHudState.value = state
    },
    onReady() {
      // 世界建好了但還沒開始跑，先給玩家看說明
      hudPhase.value = 'briefing'
    },
  })
}

async function startGame(gameId: MiniGameId) {
  if (!dioramaHandle || !canvasRef.value) {
    return
  }
  devMenuVisible.value = false
  collectionVisible.value = false
  // 墨水先蓋滿畫面，換 Scene 的破綻藏在蓋滿之後才做
  await showInkCover()
  activeGameId.value = gameId
  activeGameBestScore.value = gameProgress.value.bestScoreMap[gameId] ?? 0
  hudPhase.value = 'loading'
  gameScore.value = 0
  toastText.value = ''
  newRewardIdList.value = []
  hasJustCleared.value = false

  // 箱庭讓出渲染迴圈：Engine 的 render loop 是全域的，
  // 必須先停箱庭再啟遊戲，否則兩邊會互相蓋掉對方的 callback
  dioramaHandle.setRunning(false)
  // 箱庭的後製整組釋放，把顯存讓給遊戲場景：Scene 停止渲染不會歸還 render target，
  // 不主動釋放的話，遊戲期間會有兩套全螢幕後製 RTT 同時佔著記憶體
  dioramaHandle.setLookEnabled(false)

  try {
    createGameHostFactory ??= (await import('./games/game-host')).createGameHost
    const host = ensureGameHost()
    if (!host) {
      throw new Error('遊戲宿主建立失敗')
    }
    await host.launch(miniGameMetaMap[gameId])
  }
  catch (error) {
    // 載入失敗（chunk 抓不到、WebGL 出事）就退回箱庭。
    // 少了這層，箱庭會停在暫停狀態，玩家只剩一片靜止的畫面
    console.error('[fish-diorama] 遊戲啟動失敗', error)
    gameHost?.close()
    activeGameId.value = null
    hudPhase.value = 'loading'
    dioramaHandle.setLookEnabled(true)
    dioramaHandle.setRunning(shouldRun.value)
  }
  finally {
    hideInkCoverAfterHold()
  }
}

function startSpotGame() {
  if (!nearbySpot.value) {
    return
  }
  startGame(spotGameMap[nearbySpot.value.key])
}

/** 玩家看完說明按下開始，世界才真的動起來 */
function beginActiveGame() {
  gameHost?.beginPlay()
  hudPhase.value = 'playing'
}

function restartActiveGame() {
  if (activeGameId.value) {
    startGame(activeGameId.value)
  }
}

/** 全解鎖慶典的延遲計時器：先讓單項解鎖演出播完，再開慶典 */
let fullUnlockTimer: ReturnType<typeof setTimeout> | undefined

/** 遊戲結束：寫入最佳分數、結算里程碑獎勵、判定作品連結是否過關 */
function finishGame(finalScore: number) {
  const gameId = activeGameId.value
  if (!gameId) {
    return
  }
  const meta = miniGameMetaMap[gameId]
  const previousBestScore = gameProgress.value.bestScoreMap[gameId] ?? 0

  const earnedRewardIdList = collectNewMilestoneList(meta, previousBestScore, finalScore)
    .map((milestone) => milestone.rewardId)
    .filter((rewardId) => !gameProgress.value.unlockedRewardIdList.includes(rewardId))

  gameProgress.value = {
    ...gameProgress.value,
    bestScoreMap: {
      ...gameProgress.value.bestScoreMap,
      [gameId]: Math.max(previousBestScore, finalScore),
    },
    unlockedRewardIdList: [...gameProgress.value.unlockedRewardIdList, ...earnedRewardIdList],
  }
  persistGameProgress()
  newRewardIdList.value = earnedRewardIdList

  // 作品連結解鎖：達到門檻且該裝飾尚未解鎖
  const spotKey = (Object.keys(spotGameMap) as InteractionSpotKey[])
    .find((key) => spotGameMap[key] === gameId)
  hasJustCleared.value = Boolean(
    spotKey && finalScore >= meta.clearScore && !unlockedSpotSet.value.has(spotKey),
  )
  if (spotKey && hasJustCleared.value) {
    const nextSet = new Set(unlockedSpotSet.value)
    nextSet.add(spotKey)
    unlockedSpotSet.value = nextSet
    saveUnlockedSpotList()
  }

  gameScore.value = finalScore
  hudPhase.value = 'over'
}

/** 離開遊戲回到箱庭，順便播剛才掙來的解鎖演出。
 * 演出對象照 unlockedSpotSet 這份紀錄跟 visuallyUnlockedSpotSet 比對算出來，
 * 玩家在結算畫面選擇再玩一次也補得到——不看 hasJustCleared 那個只代表「這一場」的旗標
 */
async function closeGame() {
  // 等墨水真的蓋滿才關遊戲、切回箱庭，不然箱庭會在蓋板還半透明時先露出一瞬間，看起來像閃爍
  await showInkCover()
  gameHost?.close()
  activeGameId.value = null
  hudPhase.value = 'loading'
  toastText.value = ''
  clearTimeout(toastTimer)
  // 遊戲場景已釋放，把箱庭的後製建回來（進場時是在墨水蓋板底下重建，看不到過程）
  dioramaHandle?.setLookEnabled(true)
  dioramaHandle?.setRunning(shouldRun.value)

  const newlyUnlockedSpotKeyList = interactionSpotKeyList.filter((key) => (
    unlockedSpotSet.value.has(key) && !visuallyUnlockedSpotSet.value.has(key)
  ))
  if (newlyUnlockedSpotKeyList.length > 0) {
    visuallyUnlockedSpotSet.value = new Set([...visuallyUnlockedSpotSet.value, ...newlyUnlockedSpotKeyList])
    for (const spotKey of newlyUnlockedSpotKeyList) {
      // 解鎖演出：灰白紙模暈染回原色＋鎖頭旗標飛走＋彈跳水花＋彩帶
      dioramaHandle?.setSpotLocked(spotKey, false)
      dioramaHandle?.celebrateSpotUnlock(spotKey)
    }
    if (interactionSpotKeyList.every((key) => unlockedSpotSet.value.has(key))) {
      clearTimeout(fullUnlockTimer)
      fullUnlockTimer = setTimeout(() => {
        dioramaHandle?.celebrateFullUnlock()
      }, 900)
    }
  }
  hasJustCleared.value = false
  hideInkCoverAfterHold()
}

/** 墨水淡入的時間，要跟 .ink-enter-active 的 animation duration 對齊 */
const INK_ENTER_MS = 260
/** 蓋滿之後多停一下才淡出，讓底下剛換好的 Scene 先穩定畫出一幀，揭曉才不會露餡 */
const INK_HOLD_MS = 120

/** 墨水暈染：進出遊戲都走它，蓋住 Scene 切換的瞬間。
 * 回傳的 Promise 要等蓋板真的淡到全遮蔽才 resolve——
 * 呼叫端得等這一刻才能動手換 Scene，不然換場動作在蓋板還半透明時就先做了，
 * 玩家會先瞥見新畫面一閃，蓋板才追上來蓋住，看起來像閃爍
 */
function showInkCover(): Promise<void> {
  inkTransitionVisible.value = true
  clearTimeout(inkTransitionTimer)
  return new Promise((resolve) => {
    inkTransitionTimer = setTimeout(resolve, INK_ENTER_MS)
  })
}

/** Scene 換好之後呼叫，蓋滿再停一下才淡出揭曉 */
function hideInkCoverAfterHold(): void {
  clearTimeout(inkTransitionTimer)
  inkTransitionTimer = setTimeout(() => {
    inkTransitionVisible.value = false
  }, INK_HOLD_MS)
}

/** dev 用：一次解鎖全部獎勵，方便檢查配件建模與收藏冊排版 */
function unlockAllRewardList() {
  gameProgress.value = {
    ...gameProgress.value,
    unlockedRewardIdList: [...rewardIdList],
  }
  persistGameProgress()
  collectionVisible.value = true
  devMenuVisible.value = false
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
  // 畫面也一併鎖回去，往後才會被視為「還沒補畫面」而重新觸發解鎖演出
  visuallyUnlockedSpotSet.value = new Set()
  try {
    localStorage.removeItem(UNLOCK_STORAGE_KEY)
  }
  catch {
    // 寫入失敗就只重置本次瀏覽
  }
  // 連同高分紀錄與獎勵一起清空：玩家按的是「重置遊戲紀錄」，
  // 只清一半反而會讓收藏冊留著解不掉的配件
  gameProgress.value = { bestScoreMap: {}, unlockedRewardIdList: [], equippedRewardIdList: [] }
  clearGameProgress()
  dioramaHandle?.setEquippedAccessoryList([])
  // 模型鎖回灰白紙模＋鎖頭旗標（播過渡，看得出「上鎖」的變化），皇冠一併摘掉
  for (const spotKey of interactionSpotKeyList) {
    dioramaHandle?.setSpotLocked(spotKey, true)
  }
  dioramaHandle?.setCrownVisible(false)
}

/** Babylon 場景控制器。非響應式資料，不放進 ref */
let dioramaHandle: DioramaSceneHandle | undefined

const visible = ref(false)
useIntersectionObserver(sectionRef, ([entry]) => {
  visible.value = entry?.isIntersecting || false
})

// 進場前不啟動渲染：迎賓頁只需要 CSS 漸層與紙紋，
// 也避免視窗無 focus 時（渲染暫停）首屏是一片空白。
// 遊戲進行中箱庭必須停著——Engine 的 render loop 是全域的，兩邊同時跑會互相蓋掉
const shouldRun = computed(() => (
  isReady.value && hasEntered.value && visible.value && isFocused.value && !activeGameId.value
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
      onContextLost: handleContextLost,
      onContextRestored: handleContextRestored,
    })
    dioramaHandle.resize()
    // 依保存的解鎖進度直接套用鎖定視覺（載入時不播過渡）；全解鎖回訪直接戴皇冠
    for (const spotKey of interactionSpotKeyList) {
      dioramaHandle.setSpotLocked(spotKey, !unlockedSpotSet.value.has(spotKey), true)
    }
    // 畫面已經照紀錄套好視覺，等同全部同步過，往後只需要補「紀錄變了但畫面沒補」的差
    visuallyUnlockedSpotSet.value = new Set(unlockedSpotSet.value)
    dioramaHandle.setCrownVisible(
      interactionSpotKeyList.every((key) => unlockedSpotSet.value.has(key)),
      true,
    )
    // 穿戴中的配件在載入時就套上，回訪不會少了裝扮
    dioramaHandle.setEquippedAccessoryList(gameProgress.value.equippedRewardIdList)
    // 深夜訪客：套用當前狀態，並每分鐘刷新時刻（跨過凌晨界線時自動切換）
    dioramaHandle.setSleepyMode(sleepyActive.value)
    hourTimer = setInterval(() => {
      currentHour.value = new Date().getHours()
    }, 60_000)
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

// 遊戲不可見或視窗失焦時也要停：兩邊各自管自己的迴圈
watch(
  () => Boolean(activeGameId.value) && visible.value && isFocused.value,
  (value) => {
    gameHost?.setRunning(value)
  },
)

watch(isDark, (value) => {
  dioramaHandle?.setDarkMode(value)
  gameHost?.setDarkMode(value)
})

useResizeObserver(sectionRef, () => {
  if (activeGameId.value) {
    gameHost?.resize()
    return
  }
  dioramaHandle?.resize()
})

onUnmounted(() => {
  if (moveHintTimer) {
    clearTimeout(moveHintTimer)
  }
  clearTimeout(resetConfirmTimer)
  clearTimeout(fullUnlockTimer)
  clearTimeout(toastTimer)
  clearTimeout(inkTransitionTimer)
  clearTimeout(contextLostFailTimer)
  clearInterval(hourTimer)
  // 宿主先收：它的 Scene 掛在箱庭的 Engine 上，engine.dispose 之後才收會摸到已釋放的資源
  gameHost?.dispose()
  gameHost = undefined
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
  // flex + gap 控制標題與副標的間距：兄弟 margin 會互相合併取大值，gap 不會
  display: flex
  flex-direction: column
  gap: 40px

// 標題字大筆畫粗，陰影收淡就足夠襯底，太深會像描黑邊
.welcome-title
  font-size: clamp(26px, 5vw, 36px)
  font-weight: 600
  letter-spacing: 8px
  // 置中補償 letter-spacing 只加在字後造成的視覺偏左
  text-indent: 8px
  text-shadow: 0 1px 2px rgba(15, 30, 40, 0.55), 0 2px 8px rgba(15, 30, 40, 0.35)

// 副標字小又細，陰影得更深更聚才讀得清楚
.welcome-subtitle
  font-size: 14px
  letter-spacing: 4px
  text-indent: 4px
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.9), 0 2px 8px rgba(15, 30, 40, 0.7), 0 0 16px rgba(15, 30, 40, 0.5)
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

// WebGL context 遺失的過渡提示：疊在畫面偏中央，樣式比照 move-hint 但不佔用同一個位置。
// 不能用 transform: translateY(-50%) 做置中——.text 這個共用 transition 的
// enter-from/leave-to 會覆寫 transform 做位移動畫，兩邊搶同一個屬性會在轉場瞬間跳位置
.context-lost-overlay
  top: 46%
  left: 0
  right: 0
  color: #fff
  font-size: 15px
  font-weight: 500
  letter-spacing: 1px
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8), 0 2px 10px rgba(15, 30, 40, 0.6), 0 0 24px rgba(15, 30, 40, 0.4)
  animation: move-hint-breathe 1.6s ease-in-out infinite

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
  // 紙紋鋪在底色上（背景層，內容自然在上），與整體手作箱庭一致。
  // 深色模式的紙紋預解算對比已經比淺色低（見 paper-grain.ts 的 cssGrainContrastMap），
  // 但這種小面積 DOM 卡片緊貼著文字，紋理還是太搶戲——疊一層跟底色同色的淡淡蓋色壓下去，
  // 淺色模式維持原樣（蓋色 alpha 0，不影響既有外觀）
  background-color: light-dark(rgba(255, 253, 247, 0.94), rgba(36, 46, 52, 0.94))
  background-image: linear-gradient(light-dark(rgba(36, 46, 52, 0), rgba(36, 46, 52, 0.6)), light-dark(rgba(36, 46, 52, 0), rgba(36, 46, 52, 0.6))), var(--paper-grain-url, none)
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
  // 深色模式疊一層同色蓋色壓淡紙紋，理由同 .spot-popup-row
  background-image: linear-gradient(light-dark(rgba(36, 46, 52, 0), rgba(36, 46, 52, 0.6)), light-dark(rgba(36, 46, 52, 0), rgba(36, 46, 52, 0.6))), var(--paper-grain-url, none)
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

// dev 測試選單：右下角收合式 dropmenu（向上展開），僅開發模式出現
.dev-test-menu
  right: 16px
  bottom: 14px
  display: flex
  flex-direction: column
  align-items: flex-end
  gap: 6px
  z-index: 20

.dev-menu-trigger
  appearance: none
  padding: 3px 12px
  border: 1px dashed light-dark(rgba(62, 95, 82, 0.4), rgba(255, 255, 255, 0.3))
  border-radius: 999px
  font-family: inherit
  font-size: 12px
  font-weight: 600
  letter-spacing: 2px
  cursor: pointer
  color: light-dark(oklch(0.4 0.05 195), oklch(0.9 0.02 195))
  background: light-dark(rgba(255, 253, 247, 0.9), rgba(36, 46, 52, 0.9))
  opacity: 0.6
  transition: opacity 0.2s

  &:hover, &.is-open
    opacity: 1

.dev-menu-panel
  display: flex
  flex-direction: column
  padding: 6px
  gap: 2px
  border: 1px solid light-dark(rgba(62, 95, 82, 0.28), rgba(255, 255, 255, 0.16))
  border-radius: 12px
  background: light-dark(rgba(255, 253, 247, 0.95), rgba(36, 46, 52, 0.95))
  box-shadow: 0 6px 18px light-dark(rgba(27, 42, 51, 0.2), rgba(0, 0, 0, 0.45))

.dev-menu-divider
  height: 1px
  margin: 3px 6px
  background: light-dark(rgba(62, 95, 82, 0.2), rgba(255, 255, 255, 0.14))

.dev-menu-item
  appearance: none
  border: none
  padding: 6px 12px
  border-radius: 8px
  text-align: left
  font-family: inherit
  font-size: 12px
  letter-spacing: 1px
  cursor: pointer
  white-space: nowrap
  color: light-dark(oklch(0.4 0.05 195), oklch(0.9 0.02 195))
  background: transparent
  transition: background 0.15s

  &:hover
    background: light-dark(rgba(27, 42, 51, 0.06), rgba(255, 255, 255, 0.08))

// 遊戲轉場：純色淡入淡出蓋住畫面，Scene 就在最深的那一刻換掉。
// 原本用 radial-gradient 縮放模擬墨滴從中心暈開，但圓形要放大好幾倍才蓋滿畫面角落，
// 過程中會看到一圈明顯的圓形邊界（寬螢幕更明顯），改回純色淡入淡出，蓋畫面更乾淨
.ink-transition
  z-index: 25
  background: light-dark(#f5efe2, #1a222b)

.ink-enter-active
  animation: ink-fade 0.26s ease-out both

.ink-leave-active
  animation: ink-fade 0.26s ease-in reverse both

@keyframes ink-fade
  0%
    opacity: 0
  100%
    opacity: 1

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
