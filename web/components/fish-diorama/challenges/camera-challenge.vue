<template>
  <div class="camera-challenge vp-raw absolute inset-0 z-20 select-none">
    <!-- 觀景窗四角框 -->
    <span class="viewfinder-corner corner-top-left" />
    <span class="viewfinder-corner corner-top-right" />
    <span class="viewfinder-corner corner-bottom-left" />
    <span class="viewfinder-corner corner-bottom-right" />

    <button
      type="button"
      class="challenge-close"
      aria-label="關閉挑戰"
      @click.stop="emit('close')"
    >
      ✕
    </button>

    <!-- 任務卡開場 -->
    <div
      v-if="stage === 'intro'"
      class="intro-card"
    >
      <div class="intro-title">
        追焦快門
      </div>
      <p class="intro-description">
        按住畫面開始對焦，<br>
        等對焦環縮到最小、鱈魚剛好跳在空中，放開快門！
      </p>
      <p class="intro-goal">
        目標：拍下 3 張清晰跳躍照 (๑•̀ㅂ•́)و✧
      </p>
      <button
        type="button"
        class="intro-start-button"
        @click="startHunting"
      >
        開始拍攝
      </button>
    </div>

    <!-- 拍攝舞台：整面都是快門觸控區 -->
    <div
      v-if="stage === 'hunting'"
      class="hunting-stage"
      @pointerdown.prevent="startFocusing"
      @pointerup.prevent="releaseShutter"
      @pointercancel="cancelFocusing"
      @pointerleave="cancelFocusing"
    >
      <!-- 追焦環：自動跟著魚，按住時收縮 -->
      <div
        v-if="focusRingStyle"
        class="focus-ring"
        :class="{ 'is-sharp': isSharpZone, 'is-focusing': isFocusing }"
        :style="focusRingStyle"
      >
        <span class="focus-tick tick-top" />
        <span class="focus-tick tick-right" />
        <span class="focus-tick tick-bottom" />
        <span class="focus-tick tick-left" />
      </div>

      <div class="hunting-instruction">
        {{ isFocusing ? '放開快門拍下瞬間！' : '按住畫面對焦' }}
      </div>

      <transition name="hint">
        <div
          v-if="missHintText"
          class="miss-hint"
        >
          {{ missHintText }}
        </div>
      </transition>

      <!-- 失敗的模糊照片：抖一下掉出畫面 -->
      <div
        v-if="blurryPhotoUrl"
        :key="blurryPhotoKey"
        class="polaroid blurry-polaroid"
      >
        <img
          :src="blurryPhotoUrl"
          alt="模糊的照片"
        >
        <span class="polaroid-caption">糊掉了…</span>
      </div>
    </div>

    <!-- 膠卷：collect 到的清晰照片 -->
    <div
      v-if="stage !== 'intro'"
      class="film-strip"
    >
      <div
        v-for="slotIndex in SHARP_PHOTO_TARGET"
        :key="slotIndex"
        class="film-slot"
        :class="{ 'is-filled': Boolean(sharpPhotoList[slotIndex - 1]) }"
      >
        <img
          v-if="sharpPhotoList[slotIndex - 1]"
          :src="sharpPhotoList[slotIndex - 1]"
          alt="拍到的照片"
        >
        <span
          v-else
          class="film-slot-placeholder"
        >{{ slotIndex }}</span>
      </div>
    </div>

    <!-- 成果展示：三張拍立得扇形攤開，點擊可放大檢視 -->
    <div
      v-if="stage === 'review'"
      class="review-stage"
    >
      <div class="review-fan">
        <button
          v-for="(photoUrl, photoIndex) in sharpPhotoList"
          :key="photoIndex"
          type="button"
          class="polaroid review-polaroid"
          :style="{ transform: `rotate(${(photoIndex - 1) * 12}deg) translateY(${Math.abs(photoIndex - 1) * 10}px)` }"
          @click="openLightbox(photoIndex)"
        >
          <img
            :src="photoUrl"
            alt="拍到的跳躍照片"
          >
          <span class="polaroid-caption">躍動之魚 #{{ photoIndex + 1 }}</span>
        </button>
      </div>
      <div class="review-title">
        攝影大師誕生！
      </div>
      <p class="review-subtitle">
        點照片可放大欣賞
      </p>
      <button
        type="button"
        class="review-confirm-button"
        @click="emit('success')"
      >
        完成
      </button>
    </div>

    <!-- 照片放大燈箱：點單張照片全螢幕檢視，可左右切換 -->
    <transition name="lightbox">
      <div
        v-if="lightboxIndex !== null"
        class="photo-lightbox"
        @click="closeLightbox"
      >
        <div
          class="lightbox-frame"
          @click.stop
        >
          <img
            :src="sharpPhotoList[lightboxIndex]"
            alt="放大檢視的照片"
          >
          <span class="lightbox-caption">躍動之魚 #{{ lightboxIndex + 1 }}</span>

          <button
            v-if="sharpPhotoList.length > 1"
            type="button"
            class="lightbox-nav lightbox-prev"
            aria-label="上一張"
            @click.stop="stepLightbox(-1)"
          >
            <u-icon
              name="i-material-symbols:chevron-left-rounded"
              aria-hidden="true"
            />
          </button>
          <button
            v-if="sharpPhotoList.length > 1"
            type="button"
            class="lightbox-nav lightbox-next"
            aria-label="下一張"
            @click.stop="stepLightbox(1)"
          >
            <u-icon
              name="i-material-symbols:chevron-right-rounded"
              aria-hidden="true"
            />
          </button>
        </div>
        <button
          type="button"
          class="lightbox-close"
          aria-label="關閉檢視"
          @click.stop="closeLightbox"
        >
          ✕
        </button>
      </div>
    </transition>

    <div
      class="shutter-flash"
      :class="{ 'is-flashing': flashVisible }"
    />
  </div>
</template>

<script setup lang="ts">
import type { FishShotInfo } from '../diorama-scene'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { playFocusBeepSound, playShutterSound, playSuccessSound } from './challenge-audio'

const props = defineProps<{
  /** 場景回報魚的投影位置與跳躍高度，供追焦環定位與判定 */
  getFishShotInfo: () => FishShotInfo | null;
  /** 以魚為中心截下場景畫面（拍立得內容） */
  captureSnapshot: () => string | null;
}>()

const emit = defineEmits<{
  success: [];
  close: [];
}>()

/** 過關需要的清晰照片數 */
const SHARP_PHOTO_TARGET = 3
/** 對焦環一次收縮＋張開的週期（秒） */
const FOCUS_CYCLE_SECONDS = 1.5
/** 判定「合焦」的對焦程度門檻（0~1） */
const SHARP_FOCUS_THRESHOLD = 0.72
/** 判定「在空中」的跳躍高度比例門檻 */
const AIRBORNE_HEIGHT_THRESHOLD = 0.3
/** 對焦環最大 / 最小直徑（px） */
const FOCUS_RING_MAX_SIZE = 190
const FOCUS_RING_MIN_SIZE = 84

const stage = ref<'intro' | 'hunting' | 'review'>('intro')
const fishScreenPosition = ref<FishShotInfo | null>(null)
const isFocusing = ref(false)
const focusLevel = ref(0)
const sharpPhotoList = ref<string[]>([])
const blurryPhotoUrl = ref('')
const blurryPhotoKey = ref(0)
const missHintText = ref('')
const flashVisible = ref(false)
/** 正在燈箱放大的照片索引，null 表示未開啟 */
const lightboxIndex = ref<number | null>(null)

let focusElapsedSeconds = 0
let lastFrameTimestamp = 0
let animationFrameId = 0
let wasSharpZone = false
let missHintTimer: ReturnType<typeof setTimeout> | undefined
let blurryPhotoTimer: ReturnType<typeof setTimeout> | undefined
let flashTimer: ReturnType<typeof setTimeout> | undefined

const focusRingSize = computed(() => (
  FOCUS_RING_MAX_SIZE - (FOCUS_RING_MAX_SIZE - FOCUS_RING_MIN_SIZE) * focusLevel.value
))

const isSharpZone = computed(() => (
  isFocusing.value
  && focusLevel.value >= SHARP_FOCUS_THRESHOLD
  && (fishScreenPosition.value?.heightRatio ?? 0) >= AIRBORNE_HEIGHT_THRESHOLD
))

/** 對焦環定位：overlay 相對 section（與畫布同座標系），直接用魚的投影比例 */
const focusRingStyle = computed(() => {
  const shotInfo = fishScreenPosition.value
  if (!shotInfo) {
    return null
  }
  const size = focusRingSize.value
  return {
    left: `${shotInfo.xRatio * 100}%`,
    top: `${shotInfo.yRatio * 100}%`,
    width: `${size}px`,
    height: `${size}px`,
  }
})

function updateFrame(timestamp: number) {
  const deltaSeconds = lastFrameTimestamp > 0
    ? Math.min(0.05, (timestamp - lastFrameTimestamp) / 1000)
    : 0
  lastFrameTimestamp = timestamp

  fishScreenPosition.value = props.getFishShotInfo()

  if (isFocusing.value) {
    focusElapsedSeconds += deltaSeconds
    // 三角波：0 → 1 → 0 循環，玩家抓「縮到最小」的節奏
    const cycleRatio = (focusElapsedSeconds % FOCUS_CYCLE_SECONDS) / FOCUS_CYCLE_SECONDS
    focusLevel.value = 1 - Math.abs(1 - cycleRatio * 2)
  }
  else {
    focusLevel.value = Math.max(0, focusLevel.value - deltaSeconds * 3)
  }

  // 進入合焦區的瞬間播提示音
  if (isSharpZone.value && !wasSharpZone) {
    playFocusBeepSound()
  }
  wasSharpZone = isSharpZone.value

  animationFrameId = requestAnimationFrame(updateFrame)
}

function startHunting() {
  stage.value = 'hunting'
}

function startFocusing() {
  if (stage.value !== 'hunting') {
    return
  }
  isFocusing.value = true
  focusElapsedSeconds = 0
}

function cancelFocusing() {
  isFocusing.value = false
}

function showMissHint(text: string) {
  missHintText.value = text
  clearTimeout(missHintTimer)
  missHintTimer = setTimeout(() => {
    missHintText.value = ''
  }, 1200)
}

function releaseShutter() {
  if (stage.value !== 'hunting' || !isFocusing.value) {
    return
  }
  isFocusing.value = false

  const shotInfo = props.getFishShotInfo()
  const isFocusSharp = focusLevel.value >= SHARP_FOCUS_THRESHOLD
  const isFishAirborne = (shotInfo?.heightRatio ?? 0) >= AIRBORNE_HEIGHT_THRESHOLD

  playShutterSound()
  flashVisible.value = true
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flashVisible.value = false
  }, 140)

  const snapshotUrl = props.captureSnapshot()
  if (!snapshotUrl) {
    showMissHint('相機蓋忘了開…再拍一次！')
    return
  }

  if (isFocusSharp && isFishAirborne) {
    sharpPhotoList.value = [...sharpPhotoList.value, snapshotUrl]
    if (sharpPhotoList.value.length >= SHARP_PHOTO_TARGET) {
      // 成果展示不自動結束，由玩家按「收下這些照片」確認
      stage.value = 'review'
      playSuccessSound()
    }
    return
  }

  // 失敗照片：模糊拍立得抖落，附原因提示
  blurryPhotoUrl.value = snapshotUrl
  blurryPhotoKey.value += 1
  clearTimeout(blurryPhotoTimer)
  blurryPhotoTimer = setTimeout(() => {
    blurryPhotoUrl.value = ''
  }, 1300)
  showMissHint(isFocusSharp ? '魚還在地上，等牠跳起來！' : '失焦了！趁對焦環最小時再按')
}

function openLightbox(photoIndex: number) {
  lightboxIndex.value = photoIndex
}

function closeLightbox() {
  lightboxIndex.value = null
}

function stepLightbox(direction: number) {
  if (lightboxIndex.value === null || sharpPhotoList.value.length === 0) {
    return
  }
  const count = sharpPhotoList.value.length
  lightboxIndex.value = (lightboxIndex.value + direction + count) % count
}

function handleKeydown(event: KeyboardEvent) {
  // 燈箱開啟時鍵盤只操作燈箱，不觸發拍攝流程
  if (lightboxIndex.value !== null) {
    if (event.key === 'Escape') {
      closeLightbox()
    }
    else if (event.key === 'ArrowLeft') {
      stepLightbox(-1)
    }
    else if (event.key === 'ArrowRight') {
      stepLightbox(1)
    }
    return
  }

  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    if (stage.value === 'intro') {
      startHunting()
    }
    else if (stage.value === 'review') {
      emit('success')
    }
    else if (!isFocusing.value) {
      startFocusing()
    }
  }
}

function handleKeyup(event: KeyboardEvent) {
  if (lightboxIndex.value !== null) {
    return
  }
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    releaseShutter()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  animationFrameId = requestAnimationFrame(updateFrame)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
  cancelAnimationFrame(animationFrameId)
  clearTimeout(missHintTimer)
  clearTimeout(blurryPhotoTimer)
  clearTimeout(flashTimer)
})
</script>

<style scoped lang="sass">
.viewfinder-corner
  position: absolute
  width: 46px
  height: 46px
  border: 4px solid rgba(255, 255, 255, 0.85)
  filter: drop-shadow(0 1px 4px rgba(15, 30, 40, 0.5))
  pointer-events: none

.corner-top-left
  top: 84px
  left: 18px
  border-right: none
  border-bottom: none

.corner-top-right
  top: 84px
  right: 18px
  border-left: none
  border-bottom: none

.corner-bottom-left
  bottom: 18px
  left: 18px
  border-right: none
  border-top: none

.corner-bottom-right
  bottom: 18px
  right: 18px
  border-left: none
  border-top: none

.challenge-close
  position: absolute
  top: 92px
  right: 30px
  z-index: 3
  width: 34px
  height: 34px
  border: none
  border-radius: 50%
  font-size: 15px
  line-height: 1
  cursor: pointer
  color: #fff
  background: rgba(15, 30, 40, 0.5)

  &:hover
    background: rgba(15, 30, 40, 0.72)

// --- 任務卡 ---
.intro-card
  position: absolute
  top: 50%
  left: 50%
  transform: translate(-50%, -52%)
  width: min(86vw, 360px)
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
  line-height: 1.7

.intro-goal
  margin-top: 10px
  font-size: 12px
  opacity: 0.6

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

// --- 拍攝舞台 ---
.hunting-stage
  position: absolute
  inset: 0
  cursor: crosshair
  touch-action: none

.focus-ring
  position: absolute
  transform: translate(-50%, -50%)
  border: 3px solid rgba(255, 255, 255, 0.85)
  border-radius: 50%
  box-shadow: 0 0 12px rgba(15, 30, 40, 0.35), inset 0 0 12px rgba(15, 30, 40, 0.2)
  pointer-events: none
  transition: border-color 0.08s

  &.is-focusing
    border-width: 4px

  &.is-sharp
    border-color: #7ee787
    box-shadow: 0 0 16px rgba(126, 231, 135, 0.55), inset 0 0 14px rgba(126, 231, 135, 0.3)

.focus-tick
  position: absolute
  width: 4px
  height: 12px
  border-radius: 2px
  background-color: rgba(255, 255, 255, 0.85)

.focus-ring.is-sharp .focus-tick
  background-color: #7ee787

.tick-top
  top: -16px
  left: 50%
  transform: translateX(-50%)

.tick-bottom
  bottom: -16px
  left: 50%
  transform: translateX(-50%)

.tick-left
  left: -16px
  top: 50%
  transform: translateY(-50%) rotate(90deg)

.tick-right
  right: -16px
  top: 50%
  transform: translateY(-50%) rotate(90deg)

.hunting-instruction
  position: absolute
  bottom: 9%
  left: 0
  right: 0
  text-align: center
  font-size: 15px
  letter-spacing: 3px
  color: #fff
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8), 0 2px 10px rgba(15, 30, 40, 0.6)
  pointer-events: none

.miss-hint
  position: absolute
  bottom: 16%
  left: 0
  right: 0
  text-align: center
  font-size: 14px
  letter-spacing: 2px
  color: #ffd9a0
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8)
  pointer-events: none

// --- 拍立得 ---
.polaroid
  background: #fffdf7
  padding: 8px 8px 24px
  border-radius: 4px
  box-shadow: 0 8px 22px rgba(15, 30, 40, 0.35)

  img
    display: block
    width: 100%
    border-radius: 2px

.polaroid-caption
  display: block
  margin-top: 6px
  text-align: center
  font-size: 12px
  color: #5b6a72

.blurry-polaroid
  position: absolute
  top: 30%
  left: 50%
  width: min(40vw, 190px)
  pointer-events: none
  animation: blurry-drop 1.3s ease-in both

  img
    filter: blur(5px) saturate(0.7)

@keyframes blurry-drop
  0%
    opacity: 0
    transform: translateX(-50%) rotate(0deg) translateY(0)
  12%
    opacity: 1
  30%
    transform: translateX(-52%) rotate(-6deg) translateY(4px)
  50%
    transform: translateX(-48%) rotate(5deg) translateY(10px)
  100%
    opacity: 0
    transform: translateX(-50%) rotate(14deg) translateY(56vh)

// --- 膠卷 ---
.film-strip
  position: absolute
  top: 96px
  left: 50%
  transform: translateX(-50%)
  display: flex
  gap: 10px
  padding: 10px 14px
  border-radius: 12px
  background: rgba(15, 30, 40, 0.4)
  pointer-events: none

.film-slot
  width: 64px
  height: 64px
  border-radius: 6px
  overflow: hidden
  display: flex
  align-items: center
  justify-content: center
  border: 1px dashed rgba(255, 255, 255, 0.5)
  background: rgba(15, 30, 40, 0.3)
  transition: transform 0.25s

  img
    width: 100%
    height: 100%
    object-fit: cover

  &.is-filled
    border-style: solid
    border-color: rgba(255, 255, 255, 0.85)
    transform: scale(1.06)

.film-slot-placeholder
  font-size: 14px
  color: rgba(255, 255, 255, 0.6)

// --- 成果展示 ---
.review-stage
  position: absolute
  inset: 0
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 26px
  padding: 20px
  overflow-y: auto
  background: rgba(15, 30, 40, 0.45)
  pointer-events: none

.review-fan
  display: flex
  align-items: center
  justify-content: center

.review-polaroid
  appearance: none
  border: none
  font: inherit
  pointer-events: auto
  cursor: pointer
  width: min(28vw, 190px)
  margin: 0 -14px
  // 進場用 backwards（非 both）：動畫結束後 transform 交還給下方 transition，
  // hover 轉正才有過渡，不會被 fill-mode 持有的值卡住瞬間跳
  transition: transform 0.25s ease-out
  animation: review-rise 0.5s ease-out backwards

  &:nth-child(2)
    animation-delay: 0.12s
    z-index: 1

  &:nth-child(3)
    animation-delay: 0.24s

  // hover 抽出並挺直，暗示可點
  &:hover
    transform: translateY(-8px) rotate(0deg) scale(1.04) !important
    z-index: 2

@keyframes review-rise
  from
    opacity: 0
    transform: translateY(40px) rotate(0deg)

.review-title
  font-size: 26px
  font-weight: 600
  letter-spacing: 6px
  color: #fff
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.85), 0 2px 14px rgba(15, 30, 40, 0.6)
  animation: review-title-pop 0.4s 0.4s ease-out both

.review-subtitle
  margin: -14px 0 0
  font-size: 13px
  letter-spacing: 2px
  color: rgba(255, 255, 255, 0.8)
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.7)
  animation: review-title-pop 0.4s 0.5s ease-out both

.review-confirm-button
  pointer-events: auto
  padding: 10px 34px
  border: none
  border-radius: 999px
  font-size: 15px
  font-weight: 600
  letter-spacing: 3px
  cursor: pointer
  color: #fff
  background: light-dark(#4f9ac2, #3d7ba0)
  box-shadow: 0 4px 16px rgba(15, 30, 40, 0.45)
  transition: transform 0.15s, box-shadow 0.15s
  animation: review-title-pop 0.4s 0.6s ease-out both

  &:hover
    transform: translateY(-1px)
    box-shadow: 0 6px 20px rgba(15, 30, 40, 0.6)

@keyframes review-title-pop
  from
    opacity: 0
    transform: scale(0.9)
  to
    opacity: 1
    transform: scale(1)

// --- 照片放大燈箱 ---
.photo-lightbox
  position: absolute
  inset: 0
  z-index: 3
  display: flex
  align-items: center
  justify-content: center
  background: rgba(15, 30, 40, 0.82)
  cursor: zoom-out

.lightbox-frame
  position: relative
  cursor: default
  background: #fffdf7
  padding: 14px 14px 40px
  border-radius: 6px
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6)
  animation: lightbox-pop 0.28s cubic-bezier(0.2, 1.3, 0.4, 1) both

  // 顯示尺寸不超過原圖（max-width/height），避免放大糊化；小於上限就以原生尺寸呈現
  img
    display: block
    width: auto
    height: auto
    max-width: min(78vw, 62vh, 480px)
    max-height: min(78vw, 62vh, 480px)
    border-radius: 3px

.lightbox-caption
  position: absolute
  left: 0
  right: 0
  bottom: 12px
  text-align: center
  font-size: 15px
  letter-spacing: 2px
  color: #5b6a72

.lightbox-nav
  position: absolute
  top: 50%
  transform: translateY(-50%)
  display: flex
  align-items: center
  justify-content: center
  width: 44px
  height: 44px
  border: none
  border-radius: 50%
  font-size: 26px
  cursor: pointer
  color: #fff
  background: rgba(15, 30, 40, 0.55)
  transition: background 0.2s

  &:hover
    background: rgba(15, 30, 40, 0.8)

.lightbox-prev
  left: -22px

.lightbox-next
  right: -22px

.lightbox-close
  position: absolute
  top: 22px
  right: 22px
  width: 40px
  height: 40px
  border: none
  border-radius: 50%
  font-size: 17px
  line-height: 1
  cursor: pointer
  color: #fff
  background: rgba(15, 30, 40, 0.55)

  &:hover
    background: rgba(15, 30, 40, 0.8)

@keyframes lightbox-pop
  from
    opacity: 0
    transform: scale(0.88)
  to
    opacity: 1
    transform: scale(1)

.lightbox-enter-active, .lightbox-leave-active
  transition: opacity 0.25s

.lightbox-enter-from, .lightbox-leave-to
  opacity: 0

.shutter-flash
  position: absolute
  inset: 0
  background: #fff
  opacity: 0
  pointer-events: none

  &.is-flashing
    opacity: 0.75
    transition: none

  &:not(.is-flashing)
    transition: opacity 0.25s ease-out

.hint-enter-active, .hint-leave-active
  transition: opacity 0.25s

.hint-enter-from, .hint-leave-to
  opacity: 0
</style>
