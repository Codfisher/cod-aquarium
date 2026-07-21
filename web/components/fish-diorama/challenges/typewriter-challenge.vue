<template>
  <div class="typewriter-challenge vp-raw absolute inset-0 z-20 select-none">
    <!-- 開場才鋪暗幕；開始後撤掉，3D 場景（鏡頭推近的打字機）就是舞台 -->
    <div
      v-if="stage === 'intro'"
      class="challenge-backdrop"
      @click="emit('close')"
    />

    <!-- 任務卡開場 -->
    <div
      v-if="stage === 'intro'"
      class="intro-card"
    >
      <div class="intro-title">
        節奏打字機
      </div>
      <p class="intro-description">
        打字機的喀嗒聲自有節奏，<br>
        字塊滑進打字機上方的判定圈時，<br>
        敲任意鍵（或點畫面）就能印出那個字！<br>
        整句一字不漏才算完稿，之後節奏越來越快。
      </p>
      <button
        type="button"
        class="intro-start-button"
        @click="startGame"
      >
        開始打字
      </button>
    </div>

    <!-- 3D 舞台 HUD：整面接收敲擊，文字資訊浮在畫面邊緣 -->
    <div
      v-else
      class="stage-hud"
      @pointerdown.prevent="handleBeatInput"
    >
      <button
        type="button"
        class="challenge-close"
        aria-label="關閉挑戰"
        @click.stop="emit('close')"
      >
        ✕
      </button>

      <div
        v-if="stage === 'playing'"
        class="round-indicator"
      >
        第 {{ roundIndex + 1 }} / {{ ROUND_LIST.length }} 句（速度 {{ ROUND_LIST[roundIndex]?.beatPerMinute }}）
      </div>

      <!-- 倒數 -->
      <div
        v-if="countdownText"
        class="lane-countdown"
      >
        {{ countdownText }}
      </div>

      <!-- 判定回饋與連擊 -->
      <div
        v-if="stage === 'playing'"
        class="feedback-row"
      >
        <transition name="hint">
          <span
            v-if="judgementText"
            :key="judgementKey"
            class="judgement-text"
            :class="{ 'is-miss': judgementText === '卡紙！' }"
          >{{ judgementText }}</span>
        </transition>
        <span
          v-if="comboCount >= 2"
          class="combo-text"
        >連擊 ×{{ comboCount }}</span>
      </div>

      <transition name="hint">
        <div
          v-if="retryHintVisible"
          class="retry-tag"
        >
          節奏跑掉了…這句再來一次！
        </div>
      </transition>

      <div
        v-if="stage === 'playing'"
        class="desk-instruction"
      >
        字塊滑進圈圈時，敲任意鍵或點畫面
      </div>

      <div
        v-if="stage === 'success'"
        class="success-block"
      >
        <div class="success-caption">
          三句完稿，節奏感真好 (๑•̀ㅂ•́)و✧
        </div>
        <button
          type="button"
          class="success-confirm-button"
          @click="emit('success')"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TypewriterStageHandle } from '../diorama-scene'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  playDingSound,
  playJamSound,
  playKeyClickSound,
  playMetronomeTickSound,
  playSuccessSound,
} from './challenge-audio'

const props = defineProps<{
  /** 3D 舞台操作介面：節奏字塊、紙張文字與演出都畫進場景 */
  sceneStage?: TypewriterStageHandle;
}>()

const emit = defineEmits<{
  success: [];
  close: [];
  /** 每命中一拍通知外層，讓 3D 打字機同步演出 */
  typed: [];
}>()

interface RhythmRound {
  sentence: string;
  beatPerMinute: number;
}

type NoteState = 'upcoming' | 'hit' | 'miss'

interface RhythmNote {
  index: number;
  /** 抵達判定區的時間（歌曲時間，秒） */
  time: number;
  letter: string;
  state: NoteState;
}

/** 三句稿子，節奏逐句加快 */
const ROUND_LIST: RhythmRound[] = [
  { sentence: '今天也要摸魚', beatPerMinute: 132 },
  { sentence: '鱈魚躍出了水面', beatPerMinute: 156 },
  { sentence: '最後擱淺在岸邊', beatPerMinute: 180 },
]
/** 前導拍數：倒數對拍用 */
const LEAD_IN_BEAT_COUNT = 4
/** 逐字的節拍間距倍率（循環取用）：長短混合，打起來像真人打字的頓挫。
 * 最小 0.8：間距換算成畫面百分比後仍需大於音符寬，窄軌道才不會疊字
 */
const NOTE_GAP_MULTIPLIER_LIST = [1, 0.8, 1.25, 1, 1.5, 0.8, 1.25]
/** 判定窗（秒）：完美與普通命中 */
const PERFECT_WINDOW_SECONDS = 0.1
const HIT_WINDOW_SECONDS = 0.18
/** 過關需要的命中率：一字不漏，全部命中才算完稿 */
const PASS_HIT_RATIO = 1
/** 音符鄰近判定圈的提示窗（秒），3D 字塊在此範圍內放大發亮 */
const NOTE_NEAR_WINDOW_SECONDS = 0.12

const stage = ref<'intro' | 'playing' | 'success'>('intro')
const roundIndex = ref(0)
const noteList = ref<RhythmNote[]>([])
const songTimeSeconds = ref(-999)
const comboCount = ref(0)
const judgementText = ref('')
const judgementKey = ref(0)
const retryHintVisible = ref(false)
const printedLineList = ref<string[]>([])
/** 換句過渡中：完成的句子已加進完稿列，過渡期間隱藏進行中那行避免同句殘留重複 */
const isRoundTransitioning = ref(false)

let beatIntervalSeconds = 0.6
let roundElapsedSeconds = 0
let lastBeatIndex = -1
let lastFrameTimestamp = 0
let animationFrameId = 0
let judgementTimer: ReturnType<typeof setTimeout> | undefined
let retryHintTimer: ReturnType<typeof setTimeout> | undefined
let roundTimer: ReturnType<typeof setTimeout> | undefined

const countdownText = computed(() => {
  if (songTimeSeconds.value >= 0) {
    return ''
  }
  const beatCountLeft = Math.ceil(-songTimeSeconds.value / beatIntervalSeconds)
  return beatCountLeft <= 3 ? String(beatCountLeft) : '預備'
})

/** 目前這句在紙上的樣子：命中印字、漏拍印墨點、未到的還空著 */
const currentLineText = computed(() => (
  noteList.value
    .filter((note) => note.state !== 'upcoming')
    .map((note) => (note.state === 'hit' ? note.letter : '·'))
    .join('')
))

// 紙張文字畫在 3D 打字機的紙上
watch([printedLineList, currentLineText], ([lineList, currentLine]) => {
  props.sceneStage?.setPaperText(lineList, isRoundTransitioning.value ? '' : currentLine)
})

function startRound(index: number) {
  const round = ROUND_LIST[index]
  if (!round) {
    return
  }
  roundIndex.value = index
  beatIntervalSeconds = 60 / round.beatPerMinute
  // 逐字累積時間，間距依倍率表變化
  let noteTimeSeconds = 0
  noteList.value = round.sentence.split('').map((letter, letterIndex) => {
    const note = {
      index: letterIndex,
      time: noteTimeSeconds,
      letter,
      state: 'upcoming' as NoteState,
    }
    noteTimeSeconds += beatIntervalSeconds
      * (NOTE_GAP_MULTIPLIER_LIST[letterIndex % NOTE_GAP_MULTIPLIER_LIST.length] ?? 1)
    return note
  })
  roundElapsedSeconds = 0
  songTimeSeconds.value = -LEAD_IN_BEAT_COUNT * beatIntervalSeconds
  lastBeatIndex = -LEAD_IN_BEAT_COUNT - 1
  comboCount.value = 0
  isRoundTransitioning.value = false
}

function startGame() {
  stage.value = 'playing'
  printedLineList.value = []
  startRound(0)
}

function showJudgement(text: string) {
  judgementText.value = text
  judgementKey.value += 1
  clearTimeout(judgementTimer)
  judgementTimer = setTimeout(() => {
    judgementText.value = ''
  }, 600)
}

function finishRound() {
  isRoundTransitioning.value = true
  const hitCount = noteList.value.filter((note) => note.state === 'hit').length
  const hitRatio = hitCount / Math.max(1, noteList.value.length)

  if (hitRatio >= PASS_HIT_RATIO) {
    playDingSound()
    printedLineList.value = [...printedLineList.value, currentLineText.value]
    if (roundIndex.value + 1 < ROUND_LIST.length) {
      roundTimer = setTimeout(() => startRound(roundIndex.value + 1), 1100)
      return
    }
    // 完稿不自動結束，由玩家按「完成」確認；3D 紙張飛向鏡頭＋彩帶
    stage.value = 'success'
    playSuccessSound()
    props.sceneStage?.playSuccess()
    return
  }

  // 命中率不足：同一句重來
  playJamSound()
  retryHintVisible.value = true
  clearTimeout(retryHintTimer)
  retryHintTimer = setTimeout(() => {
    retryHintVisible.value = false
  }, 1300)
  roundTimer = setTimeout(() => startRound(roundIndex.value), 1400)
}

function updateFrame(timestamp: number) {
  const deltaSeconds = lastFrameTimestamp > 0
    ? Math.min(0.05, (timestamp - lastFrameTimestamp) / 1000)
    : 0
  lastFrameTimestamp = timestamp

  if (stage.value === 'playing' && !isRoundTransitioning.value) {
    roundElapsedSeconds += deltaSeconds
    songTimeSeconds.value = roundElapsedSeconds - LEAD_IN_BEAT_COUNT * beatIntervalSeconds

    // 節拍器：每跨過一拍打一聲（含前導倒數）
    const currentBeatIndex = Math.floor(songTimeSeconds.value / beatIntervalSeconds)
    if (currentBeatIndex > lastBeatIndex) {
      lastBeatIndex = currentBeatIndex
      playMetronomeTickSound()
    }

    // 超出判定窗仍未命中的音符記為漏拍
    let hasMissed = false
    for (const note of noteList.value) {
      if (note.state === 'upcoming' && songTimeSeconds.value - note.time > HIT_WINDOW_SECONDS) {
        note.state = 'miss'
        hasMissed = true
      }
    }
    if (hasMissed) {
      noteList.value = [...noteList.value]
      comboCount.value = 0
      playJamSound()
      showJudgement('卡紙！')
      // 3D 打字機卡紙抖動
      props.sceneStage?.playMiss()
    }

    // 整句跑完：結算
    const lastNote = noteList.value[noteList.value.length - 1]
    if (lastNote && songTimeSeconds.value > lastNote.time + 0.5) {
      finishRound()
    }
  }

  // 同步節奏字塊到 3D 舞台（換句過渡中也照送，讓命中／漏拍動畫收尾）
  if (stage.value === 'playing') {
    props.sceneStage?.syncNoteList(noteList.value.map((note) => ({
      index: note.index,
      letter: note.letter,
      offsetSeconds: note.time - songTimeSeconds.value,
      state: note.state,
      isNear: note.state === 'upcoming'
        && Math.abs(note.time - songTimeSeconds.value) <= NOTE_NEAR_WINDOW_SECONDS,
    })))
  }

  animationFrameId = requestAnimationFrame(updateFrame)
}

/** 敲下任意鍵／點擊畫面：找判定窗內最近的音符 */
function handleBeatInput() {
  if (stage.value !== 'playing' || isRoundTransitioning.value || songTimeSeconds.value < -beatIntervalSeconds) {
    return
  }

  let nearestNote: RhythmNote | undefined
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const note of noteList.value) {
    if (note.state !== 'upcoming') {
      continue
    }
    const distance = Math.abs(note.time - songTimeSeconds.value)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestNote = note
    }
  }

  // 沒有音符在窗內：空敲不懲罰（節奏遊戲的善意）
  if (!nearestNote || nearestDistance > HIT_WINDOW_SECONDS) {
    return
  }

  nearestNote.state = 'hit'
  noteList.value = [...noteList.value]
  comboCount.value += 1
  playKeyClickSound()
  emit('typed')
  showJudgement(nearestDistance <= PERFECT_WINDOW_SECONDS ? 'PERFECT！' : '好！')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key === 'Tab' || event.altKey || event.ctrlKey || event.metaKey) {
    return
  }
  if (stage.value === 'intro' && (event.key === ' ' || event.key === 'Enter')) {
    event.preventDefault()
    startGame()
    return
  }
  if (stage.value === 'playing') {
    event.preventDefault()
    handleBeatInput()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  animationFrameId = requestAnimationFrame(updateFrame)
  // 進入 3D 舞台：鏡頭推近打字機、亮出判定圈
  props.sceneStage?.enter()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  cancelAnimationFrame(animationFrameId)
  clearTimeout(judgementTimer)
  clearTimeout(retryHintTimer)
  clearTimeout(roundTimer)
  props.sceneStage?.exit()
})
</script>

<style scoped lang="sass">
.challenge-backdrop
  position: absolute
  inset: 0
  background: rgba(15, 30, 40, 0.4)

// --- 任務卡 ---
.intro-card
  position: absolute
  top: 50%
  left: 50%
  transform: translate(-50%, -52%)
  width: min(88vw, 380px)
  max-height: calc(70dvh - 20px)
  overflow-y: auto
  padding: 24px 26px
  border-radius: 16px
  text-align: center
  background-color: light-dark(rgba(255, 253, 247, 0.97), rgba(36, 46, 52, 0.97))
  background-image: var(--paper-grain-url, none)
  background-repeat: repeat
  background-size: 200px 200px
  color: light-dark(oklch(0.35 0.05 195), oklch(0.9 0.02 195))
  box-shadow: 0 10px 34px rgba(15, 30, 40, 0.3)
  animation: intro-pop 0.35s ease-out both

.intro-title
  font-size: 20px
  font-weight: 600
  letter-spacing: 4px

.intro-description
  margin-top: 12px
  font-size: 14px
  line-height: 1.75

.intro-start-button
  margin-top: 16px
  padding: 9px 30px
  border: none
  border-radius: 999px
  font-size: 15px
  font-weight: 600
  letter-spacing: 3px
  cursor: pointer
  color: #fff
  background: light-dark(#4f9ac2, #3d7ba0)
  box-shadow: 0 4px 14px rgba(27, 42, 51, 0.3)
  transition: transform 0.15s, box-shadow 0.15s

  &:hover
    transform: translateY(-1px)
    box-shadow: 0 6px 18px rgba(27, 42, 51, 0.4)

@keyframes intro-pop
  from
    opacity: 0
    transform: translate(-50%, -52%) scale(0.92)
  to
    opacity: 1
    transform: translate(-50%, -52%) scale(1)

// --- 3D 舞台 HUD：資訊浮在場景上，白字＋深色陰影 ---
.stage-hud
  position: absolute
  inset: 0
  cursor: pointer

.challenge-close
  position: absolute
  top: 12px
  right: 12px
  z-index: 1
  width: 32px
  height: 32px
  border: none
  border-radius: 50%
  font-size: 13px
  line-height: 1
  cursor: pointer
  color: #fff
  background: rgba(15, 30, 40, 0.45)

  &:hover
    background: rgba(15, 30, 40, 0.65)

.round-indicator
  position: absolute
  top: 14px
  left: 0
  right: 0
  text-align: center
  font-size: 12px
  letter-spacing: 2px
  color: #fff
  opacity: 0.85
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8)
  pointer-events: none

.lane-countdown
  position: absolute
  top: 13%
  left: 0
  right: 0
  text-align: center
  font-size: 34px
  font-weight: 700
  letter-spacing: 8px
  text-indent: 8px
  color: #fff
  text-shadow: 0 2px 8px rgba(15, 30, 40, 0.7)
  pointer-events: none

// --- 判定與連擊 ---
// 都絕對定位：新舊判定文字原地交叉淡出，不會撐動排版左右跳；
// 高度停在判定圈之上，不與 3D 圓圈及字塊重疊
.feedback-row
  position: absolute
  top: 13%
  left: 0
  right: 0
  height: 26px
  pointer-events: none

.judgement-text
  position: absolute
  left: 50%
  top: 50%
  transform: translate(-50%, -50%)
  white-space: nowrap
  font-size: 17px
  font-weight: 700
  letter-spacing: 3px
  color: #8fd8e8
  text-shadow: 0 1px 4px rgba(15, 30, 40, 0.85)

  &.is-miss
    color: #ff9c82

.combo-text
  position: absolute
  left: 50%
  top: 30px
  transform: translateX(-50%)
  white-space: nowrap
  font-size: 13px
  letter-spacing: 2px
  color: #fff
  opacity: 0.85
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8)

.retry-tag
  position: absolute
  top: 44%
  left: 50%
  transform: translateX(-50%) rotate(-3deg)
  padding: 5px 16px
  border-radius: 6px
  font-size: 15px
  font-weight: 700
  letter-spacing: 2px
  color: #fff
  background: #8a6d4f
  box-shadow: 0 4px 12px rgba(27, 42, 51, 0.3)
  pointer-events: none

.desk-instruction
  position: absolute
  bottom: 16px
  left: 0
  right: 0
  text-align: center
  font-size: 12px
  letter-spacing: 2px
  color: #fff
  opacity: 0.75
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8)
  pointer-events: none

// --- 完稿 ---
.success-block
  position: absolute
  bottom: 12%
  left: 0
  right: 0
  display: flex
  flex-direction: column
  align-items: center
  gap: 14px

.success-caption
  font-size: 17px
  font-weight: 600
  letter-spacing: 4px
  color: #fff
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.85), 0 2px 10px rgba(15, 30, 40, 0.6)

.success-confirm-button
  padding: 9px 32px
  border: none
  border-radius: 999px
  font-size: 15px
  font-weight: 600
  letter-spacing: 3px
  cursor: pointer
  color: #fff
  background: light-dark(#4f9ac2, #3d7ba0)
  box-shadow: 0 4px 14px rgba(27, 42, 51, 0.3)
  transition: transform 0.15s, box-shadow 0.15s

  &:hover
    transform: translateY(-1px)
    box-shadow: 0 6px 18px rgba(27, 42, 51, 0.4)

.hint-enter-active, .hint-leave-active
  transition: opacity 0.2s

.hint-enter-from, .hint-leave-to
  opacity: 0
</style>
