<template>
  <div class="typewriter-challenge vp-raw absolute inset-0 z-20 select-none">
    <div
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
        文字滑進左邊的打字圈時，<br>
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

    <!-- 打字工作檯 -->
    <div
      v-else
      class="typewriter-desk"
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

      <!-- 紙張：已完稿的句子與進行中的句子 -->
      <div class="paper-sheet">
        <div
          v-for="(printedLine, lineIndex) in printedLineList"
          :key="lineIndex"
          class="paper-line is-printed"
        >
          {{ printedLine }}
        </div>
        <!-- v-text＋::after 游標：white-space: pre 下模板換行會變成可見空白，內容不能斷行。
             換句過渡中隱藏，避免完成的句子同時出現在完稿列與進行中列 -->
        <div
          v-if="stage === 'playing' && !isRoundTransitioning"
          class="paper-line is-current"
          v-text="currentLineText"
        />

        <!-- 完稿印章 -->
        <div
          v-if="stage === 'success'"
          class="finish-stamp"
        >
          大功告成
        </div>
      </div>

      <!-- 節奏軌道 -->
      <div
        v-if="stage === 'playing'"
        class="rhythm-lane"
      >
        <!-- 打字圈（判定區） -->
        <div
          class="hit-zone"
          :class="{ 'is-pulsing': hitZonePulseActive }"
        />
        <!-- 滑動的字母鍵 -->
        <div
          v-for="note in visibleNoteList"
          :key="note.index"
          class="beat-note"
          :class="{
            'is-near': note.isNear,
            'is-hit': note.state === 'hit',
            'is-miss': note.state === 'miss',
            'is-space': note.letter === ' ',
          }"
          :data-note-index="note.index"
          :style="{ left: `${note.leftPercent}%` }"
        >
          {{ note.letter === ' ' ? '␣' : note.letter }}
        </div>

        <!-- 倒數 -->
        <div
          v-if="countdownText"
          class="lane-countdown"
        >
          {{ countdownText }}
        </div>
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
        文字滑進圈圈時，敲任意鍵或點畫面
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  playDingSound,
  playJamSound,
  playKeyClickSound,
  playMetronomeTickSound,
  playSuccessSound,
} from './challenge-audio'

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
/** 判定區位置與音符流速（軌道寬度百分比）。流速加大讓音符攤開，避免密集拍疊字 */
const HIT_ZONE_LEFT_PERCENT = 15
const NOTE_SPEED_PERCENT_PER_SECOND = 32

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

const hitZonePulseActive = computed(() => {
  const beatPhase = ((songTimeSeconds.value % beatIntervalSeconds) + beatIntervalSeconds) % beatIntervalSeconds
  return beatPhase < 0.12
})

/** 目前這句在紙上的樣子：命中印字、漏拍印墨點、未到的還空著 */
const currentLineText = computed(() => (
  noteList.value
    .filter((note) => note.state !== 'upcoming')
    .map((note) => (note.state === 'hit' ? note.letter : '·'))
    .join('')
))

/** 軌道上可見的音符（含位置與鄰近判定區狀態） */
const visibleNoteList = computed(() => (
  noteList.value
    .map((note) => {
      const deltaSeconds = note.time - songTimeSeconds.value
      return {
        ...note,
        leftPercent: HIT_ZONE_LEFT_PERCENT + deltaSeconds * NOTE_SPEED_PERCENT_PER_SECOND,
        isNear: note.state === 'upcoming' && Math.abs(deltaSeconds) <= 0.12,
      }
    })
    .filter((note) => note.leftPercent > 2 && note.leftPercent < 98)
))

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
    // 完稿不自動結束，由玩家按「完成」確認
    stage.value = 'success'
    playSuccessSound()
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
    }

    // 整句跑完：結算
    const lastNote = noteList.value[noteList.value.length - 1]
    if (lastNote && songTimeSeconds.value > lastNote.time + 0.5) {
      finishRound()
    }
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
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  cancelAnimationFrame(animationFrameId)
  clearTimeout(judgementTimer)
  clearTimeout(retryHintTimer)
  clearTimeout(roundTimer)
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

// --- 工作檯 ---
// 垂直置中：內嵌區塊在手機上很高，錨定頂端會像吊在半空
.typewriter-desk
  position: absolute
  top: 50%
  left: 50%
  transform: translate(-50%, -50%)
  width: min(94vw, 560px)
  max-height: calc(70dvh - 20px)
  overflow-y: auto
  padding: 20px 22px 22px
  border-radius: 18px
  text-align: center
  background-color: light-dark(rgba(255, 253, 247, 0.97), rgba(36, 46, 52, 0.97))
  background-image: var(--paper-grain-url, none)
  background-repeat: repeat
  background-size: 220px 220px
  color: light-dark(oklch(0.35 0.05 195), oklch(0.9 0.02 195))
  box-shadow: 0 12px 38px rgba(15, 30, 40, 0.32)
  cursor: pointer

.challenge-close
  position: absolute
  top: 10px
  right: 10px
  z-index: 1
  width: 30px
  height: 30px
  border: none
  border-radius: 50%
  font-size: 13px
  line-height: 1
  cursor: pointer
  color: inherit
  background: light-dark(rgba(27, 42, 51, 0.08), rgba(255, 255, 255, 0.1))

  &:hover
    background: light-dark(rgba(27, 42, 51, 0.16), rgba(255, 255, 255, 0.2))

.round-indicator
  font-size: 12px
  letter-spacing: 1px
  opacity: 0.55

// --- 紙張 ---
.paper-sheet
  position: relative
  margin: 10px auto 0
  padding: 14px 18px 16px
  width: min(88%, 420px)
  min-height: 84px
  text-align: left
  background: light-dark(#fffef8, #f4efe2)
  color: #2f3d45
  border-radius: 4px 4px 0 0
  box-shadow: inset 0 1px 4px rgba(27, 42, 51, 0.12), 0 2px 8px rgba(27, 42, 51, 0.15)
  background-image: linear-gradient(90deg, transparent 24px, rgba(226, 105, 79, 0.35) 24px, rgba(226, 105, 79, 0.35) 26px, transparent 26px)

.paper-line
  padding-left: 32px
  font-family: 'Courier New', monospace
  font-size: 17px
  font-weight: 700
  letter-spacing: 2px
  line-height: 1.9
  white-space: pre

  &.is-printed
    opacity: 0.5

.paper-line.is-current::after
  content: ''
  display: inline-block
  width: 10px
  height: 18px
  vertical-align: text-bottom
  background: rgba(47, 61, 69, 0.65)
  animation: cursor-blink 0.9s step-end infinite

@keyframes cursor-blink
  50%
    opacity: 0

// --- 節奏軌道 ---
.rhythm-lane
  position: relative
  margin: 16px auto 0
  width: min(94%, 480px)
  height: 64px
  border-radius: 12px
  overflow: hidden
  background: light-dark(rgba(27, 42, 51, 0.07), rgba(255, 255, 255, 0.07))
  box-shadow: inset 0 2px 6px rgba(27, 42, 51, 0.12)

.hit-zone
  position: absolute
  top: 50%
  left: 15%
  width: 52px
  height: 52px
  transform: translate(-50%, -50%)
  border: 3px dashed light-dark(rgba(47, 61, 69, 0.55), rgba(223, 232, 236, 0.55))
  border-radius: 50%
  transition: transform 0.08s, border-color 0.08s

  &.is-pulsing
    transform: translate(-50%, -50%) scale(1.09)
    border-color: light-dark(#4f9ac2, #8fd8e8)

.beat-note
  position: absolute
  top: 50%
  transform: translate(-50%, -50%)
  width: 32px
  height: 32px
  display: flex
  align-items: center
  justify-content: center
  border-radius: 50%
  font-size: 15px
  font-weight: 700
  color: #f4efe4
  background: light-dark(#3a4a52, #566c76)
  box-shadow: 0 3px 0 light-dark(#26333a, #3d4f58), 0 4px 8px rgba(27, 42, 51, 0.3)
  pointer-events: none

  &.is-space
    color: rgba(244, 239, 228, 0.5)

  &.is-near
    background: light-dark(#4f9ac2, #5aa8cf)
    box-shadow: 0 3px 0 light-dark(#33718f, #3d7ba0), 0 0 14px rgba(143, 216, 232, 0.65)

  &.is-hit
    animation: note-hit 0.3s ease-out both

  &.is-miss
    animation: note-miss 0.4s ease-in both

@keyframes note-hit
  40%
    transform: translate(-50%, -62%) scale(1.25)
    opacity: 1
  100%
    transform: translate(-50%, -80%) scale(0.6)
    opacity: 0

@keyframes note-miss
  100%
    transform: translate(-50%, 30%) rotate(18deg)
    opacity: 0

.lane-countdown
  position: absolute
  inset: 0
  display: flex
  align-items: center
  justify-content: center
  font-size: 26px
  font-weight: 700
  letter-spacing: 6px
  color: light-dark(rgba(47, 61, 69, 0.75), rgba(223, 232, 236, 0.8))
  pointer-events: none

// --- 判定與連擊 ---
// 判定與連擊都絕對定位：新舊判定文字原地交叉淡出，不會撐動排版左右跳
.feedback-row
  position: relative
  margin-top: 10px
  height: 22px

.judgement-text
  position: absolute
  left: 50%
  top: 50%
  transform: translate(-50%, -50%)
  white-space: nowrap
  font-size: 15px
  font-weight: 700
  letter-spacing: 3px
  color: light-dark(#4f9ac2, #8fd8e8)

  &.is-miss
    color: #e2694f

.combo-text
  position: absolute
  right: 8px
  top: 50%
  transform: translateY(-50%)
  white-space: nowrap
  font-size: 13px
  letter-spacing: 2px
  opacity: 0.7

.retry-tag
  position: absolute
  top: 46%
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
  margin-top: 8px
  font-size: 12px
  letter-spacing: 2px
  opacity: 0.5

// --- 完稿 ---
.finish-stamp
  position: absolute
  right: 16px
  bottom: 10px
  padding: 8px 14px
  border: 3px solid #d24b4b
  border-radius: 8px
  color: #d24b4b
  font-size: 18px
  font-weight: 700
  letter-spacing: 5px
  transform: rotate(-10deg)
  animation: stamp-in 0.35s cubic-bezier(0.2, 1.6, 0.4, 1) both

@keyframes stamp-in
  from
    opacity: 0
    transform: rotate(-10deg) scale(2.1)
  to
    opacity: 0.9
    transform: rotate(-10deg) scale(1)

.success-block
  margin-top: 14px
  display: flex
  flex-direction: column
  align-items: center
  gap: 14px

.success-caption
  font-size: 17px
  font-weight: 600
  letter-spacing: 4px

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
