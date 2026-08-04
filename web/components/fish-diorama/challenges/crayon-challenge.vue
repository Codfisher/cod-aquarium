<template>
  <div class="crayon-challenge vp-raw absolute inset-0 z-20 select-none">
    <!-- 開場才鋪暗幕；開始後撤掉，3D 畫架（鏡頭推近的蠟筆組旁）就是舞台 -->
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
        小小畫室
      </div>
      <p class="intro-description">
        蠟筆組旁架起了畫架！<br>
        拿起蠟筆沿畫布上的虛線描出小魚，<br>
        描完會依路徑匹配度評分，<br>
        要衝到 {{ PASS_SCORE_PERCENT }}% 才算完成，手要穩喔 (๑•̀ㅂ•́)و✧
      </p>
      <button
        type="button"
        class="intro-start-button"
        @click="stage = 'draw'"
      >
        開始創作
      </button>
    </div>

    <!-- 3D 舞台 HUD：整面接收描線，工具浮在畫面邊緣 -->
    <div
      v-else
      class="stage-hud"
      :class="{ 'is-drawing-stage': stage === 'draw' }"
      @pointerdown.prevent="handlePointerDown"
      @pointermove.prevent="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @pointerleave="handlePointerUp"
    >
      <button
        type="button"
        class="challenge-close"
        aria-label="關閉挑戰"
        @click.stop="emit('close')"
        @pointerdown.stop
      >
        ✕
      </button>

      <div class="studio-title">
        {{ stage === 'draw' ? '沿畫布上的虛線描出小魚' : '完成！' }}
      </div>

      <!-- 匹配度量表 -->
      <div
        v-if="stage === 'draw'"
        class="score-area"
        @pointerdown.stop
      >
        <div class="score-track">
          <div
            class="score-bar"
            :class="{ 'is-passing': scorePercent >= PASS_SCORE_PERCENT }"
            :style="{ width: `${scorePercent}%` }"
          />
          <span
            class="score-threshold"
            :style="{ left: `${PASS_SCORE_PERCENT}%` }"
          />
          <span class="score-label">匹配度 {{ scorePercent }}%（達 {{ PASS_SCORE_PERCENT }}% 過關）</span>
        </div>
        <transition name="hint">
          <div
            v-if="scoreHintText"
            class="score-hint"
          >
            {{ scoreHintText }}
          </div>
        </transition>
      </div>

      <!-- 蠟筆盒與重畫 -->
      <div
        v-if="stage === 'draw'"
        class="drawing-toolbar"
        @pointerdown.stop
      >
        <div class="crayon-box">
          <button
            v-for="crayon in crayonList"
            :key="crayon.key"
            type="button"
            class="crayon-stick"
            :class="{ 'is-selected': crayon.key === selectedCrayonKey }"
            :style="{ background: crayon.color }"
            :aria-label="`選擇${crayon.name}蠟筆`"
            @click="selectedCrayonKey = crayon.key"
          >
            <span
              class="crayon-tip"
              :style="{ borderBottomColor: crayon.color }"
            />
          </button>
        </div>
        <button
          type="button"
          class="clear-button"
          :disabled="strokeList.length === 0"
          @click="clearDrawing"
        >
          清空重畫
        </button>
      </div>

      <div
        v-if="stage === 'gallery'"
        class="gallery-block"
        @pointerdown.stop
      >
        <div class="gallery-caption">
          <span class="gallery-sparkle">✦</span>
          匹配度 {{ scorePercent }}%，掛上畫架展示！
          <span class="gallery-sparkle">✦</span>
        </div>
        <button
          type="button"
          class="gallery-confirm-button"
          @click="emit('success')"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CrayonStageHandle } from '../diorama-scene'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { playSuccessSound } from './challenge-audio'

const props = defineProps<{
  /** 3D 舞台操作介面：畫架畫布、筆觸與蠟筆跟隨都畫進場景 */
  sceneStage?: CrayonStageHandle;
}>()

const emit = defineEmits<{
  success: [];
  close: [];
}>()

interface OutlineDot {
  x: number;
  y: number;
}

interface PlanarPoint {
  x: number;
  y: number;
}

interface CrayonStroke {
  color: string;
  pointList: PlanarPoint[];
}

/** 小魚輪廓的控制點（頭朝右），實際輪廓由 Catmull-Rom 平滑內插產生。
 * 依序：嘴尖 → 額頭 → 背鰭 → 尾柄 → 分叉尾鰭 → 腹部 → 下顎，繞一圈閉合
 */
const outlineControlPointList: readonly OutlineDot[] = [
  { x: 292, y: 112 },
  { x: 276, y: 90 },
  { x: 246, y: 74 },
  { x: 210, y: 66 },
  { x: 184, y: 64 },
  { x: 166, y: 42 },
  { x: 150, y: 64 },
  { x: 116, y: 72 },
  { x: 86, y: 80 },
  { x: 44, y: 58 },
  { x: 74, y: 104 },
  { x: 44, y: 156 },
  { x: 88, y: 130 },
  { x: 120, y: 144 },
  { x: 158, y: 150 },
  { x: 200, y: 148 },
  { x: 246, y: 136 },
]

/** 閉合 Catmull-Rom 內插：把控制點展開成密集取樣點，線條圓潤不見稜角 */
function buildSmoothOutlinePointList(
  controlPointList: readonly OutlineDot[],
  subdivisionCount: number,
): OutlineDot[] {
  const pointList: OutlineDot[] = []
  const controlCount = controlPointList.length
  for (let index = 0; index < controlCount; index++) {
    const point0 = controlPointList[(index - 1 + controlCount) % controlCount]!
    const point1 = controlPointList[index]!
    const point2 = controlPointList[(index + 1) % controlCount]!
    const point3 = controlPointList[(index + 2) % controlCount]!
    for (let step = 0; step < subdivisionCount; step++) {
      const t = step / subdivisionCount
      const t2 = t * t
      const t3 = t2 * t
      pointList.push({
        x: 0.5 * ((2 * point1.x)
          + (-point0.x + point2.x) * t
          + (2 * point0.x - 5 * point1.x + 4 * point2.x - point3.x) * t2
          + (-point0.x + 3 * point1.x - 3 * point2.x + point3.x) * t3),
        y: 0.5 * ((2 * point1.y)
          + (-point0.y + point2.y) * t
          + (2 * point0.y - 5 * point1.y + 4 * point2.y - point3.y) * t2
          + (-point0.y + 3 * point1.y - 3 * point2.y + point3.y) * t3),
      })
    }
  }
  return pointList
}

const dotList: readonly OutlineDot[] = buildSmoothOutlinePointList(outlineControlPointList, 4)

/** 匹配容許誤差（viewBox 單位）：離參考輪廓這個距離內才算描到 */
const MATCH_TOLERANCE = 10
/** 過關門檻（%）：覆蓋率與精準度取低值需達此分數，標準嚴苛 */
const PASS_SCORE_PERCENT = 95
/** 參考輪廓的取樣間距（viewBox 單位），愈小評分愈精細 */
const OUTLINE_SAMPLE_SPACING = 3

const crayonList = [
  { key: 'blue', name: '藍色', color: '#4f9ac2' },
  { key: 'cyan', name: '水藍色', color: '#8fd8e8' },
  { key: 'orange', name: '橘色', color: '#f2a65a' },
  { key: 'green', name: '綠色', color: '#7cc47f' },
] as const

type CrayonKey = (typeof crayonList)[number]['key']

const stage = ref<'intro' | 'draw' | 'gallery'>('intro')
const strokeList = ref<CrayonStroke[]>([])
const selectedCrayonKey = ref<CrayonKey>('blue')
const scorePercent = ref(0)
const scoreHintText = ref('')
const isDrawing = ref(false)

let scoreHintTimer: ReturnType<typeof setTimeout> | undefined

const selectedCrayonColor = computed(() => (
  crayonList.find((crayon) => crayon.key === selectedCrayonKey.value)?.color ?? '#4f9ac2'
))

// 換色時 3D 蠟筆同步換裝
watch(selectedCrayonColor, (color) => {
  props.sceneStage?.setCrayonColor(color)
})

/** 參考輪廓沿邊等距取樣（覆蓋率的比對基準），建構一次重複使用 */
const outlineSamplePointList: PlanarPoint[] = []
for (let index = 0; index < dotList.length; index++) {
  const fromDot = dotList[index]!
  const toDot = dotList[(index + 1) % dotList.length]!
  const edgeLength = Math.hypot(toDot.x - fromDot.x, toDot.y - fromDot.y)
  const sampleCount = Math.max(1, Math.floor(edgeLength / OUTLINE_SAMPLE_SPACING))
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const ratio = sampleIndex / sampleCount
    outlineSamplePointList.push({
      x: fromDot.x + (toDot.x - fromDot.x) * ratio,
      y: fromDot.y + (toDot.y - fromDot.y) * ratio,
    })
  }
}

/** 事件座標轉畫布座標：投影到 3D 畫布平面（沒點到畫布回傳 null） */
function toCanvasPoint(event: PointerEvent): PlanarPoint | null {
  return props.sceneStage?.pickCanvasPoint(event.clientX, event.clientY) ?? null
}

function getDistanceToSegment(point: PlanarPoint, segmentStart: PlanarPoint, segmentEnd: PlanarPoint): number {
  const deltaX = segmentEnd.x - segmentStart.x
  const deltaY = segmentEnd.y - segmentStart.y
  const lengthSquared = deltaX * deltaX + deltaY * deltaY
  if (lengthSquared <= 1e-6) {
    return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y)
  }
  const projection = Math.max(0, Math.min(1, ((point.x - segmentStart.x) * deltaX + (point.y - segmentStart.y) * deltaY) / lengthSquared))
  return Math.hypot(
    point.x - (segmentStart.x + deltaX * projection),
    point.y - (segmentStart.y + deltaY * projection),
  )
}

/** 點到參考輪廓（所有邊）的最短距離 */
function getDistanceToOutline(point: PlanarPoint): number {
  let minDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < dotList.length; index++) {
    const distance = getDistanceToSegment(point, dotList[index]!, dotList[(index + 1) % dotList.length]!)
    if (distance < minDistance) {
      minDistance = distance
    }
  }
  return minDistance
}

/** 路徑匹配度（0~1）＝ min(覆蓋率, 精準度)：
 * 覆蓋率 — 參考輪廓的取樣點有多少比例被筆觸描到（漏段扣分）；
 * 精準度 — 玩家筆觸的點有多少比例貼著輪廓（亂畫、出線扣分）。
 * 取低值代表「描好描滿又不出線」才拿得到高分
 */
function computeMatchScore(): number {
  const drawnPointList = strokeList.value.flatMap((stroke) => stroke.pointList)
  if (drawnPointList.length === 0) {
    return 0
  }

  let coveredCount = 0
  for (const samplePoint of outlineSamplePointList) {
    const hasCovered = drawnPointList.some((drawnPoint) => (
      Math.hypot(drawnPoint.x - samplePoint.x, drawnPoint.y - samplePoint.y) <= MATCH_TOLERANCE
    ))
    if (hasCovered) {
      coveredCount += 1
    }
  }
  const coverageRatio = coveredCount / outlineSamplePointList.length

  let accurateCount = 0
  for (const drawnPoint of drawnPointList) {
    if (getDistanceToOutline(drawnPoint) <= MATCH_TOLERANCE) {
      accurateCount += 1
    }
  }
  const precisionRatio = accurateCount / drawnPointList.length

  return Math.min(coverageRatio, precisionRatio)
}

function showScoreHint(text: string) {
  scoreHintText.value = text
  clearTimeout(scoreHintTimer)
  scoreHintTimer = setTimeout(() => {
    scoreHintText.value = ''
  }, 1800)
}

/** 每放開一筆就重新評分，達標直接過關 */
function evaluateDrawing() {
  const previousScorePercent = scorePercent.value
  scorePercent.value = Math.floor(computeMatchScore() * 100)

  if (scorePercent.value >= PASS_SCORE_PERCENT) {
    stage.value = 'gallery'
    // 掛上畫架後不自動結束，由玩家按「完成」確認；3D 畫布上色點睛＋彩帶
    playSuccessSound()
    props.sceneStage?.finishArtwork(selectedCrayonColor.value)
    return
  }

  if (scorePercent.value < previousScorePercent) {
    showScoreHint('這一筆歪掉了…可以清空重畫')
  }
  else if (scorePercent.value >= PASS_SCORE_PERCENT - 10) {
    showScoreHint('就差一點！補上漏掉的線段')
  }
}

function clearDrawing() {
  strokeList.value = []
  scorePercent.value = 0
  scoreHintText.value = ''
  props.sceneStage?.clearCanvas()
}

function handlePointerDown(event: PointerEvent) {
  if (stage.value !== 'draw') {
    return
  }
  const point = toCanvasPoint(event)
  if (!point) {
    return
  }
  isDrawing.value = true
  strokeList.value = [...strokeList.value, {
    color: selectedCrayonColor.value,
    pointList: [point],
  }]
  props.sceneStage?.beginStroke(point, selectedCrayonColor.value)
}

function handlePointerMove(event: PointerEvent) {
  if (stage.value !== 'draw' || !isDrawing.value) {
    return
  }
  const point = toCanvasPoint(event)
  if (!point) {
    return
  }
  const activeStroke = strokeList.value[strokeList.value.length - 1]
  if (!activeStroke) {
    return
  }
  const lastPoint = activeStroke.pointList[activeStroke.pointList.length - 1]!
  // 忽略過密的取樣，維持筆觸節點數量可控
  if (Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 3) {
    return
  }
  activeStroke.pointList.push(point)
  props.sceneStage?.strokeTo(point)
}

function handlePointerUp() {
  if (stage.value !== 'draw' || !isDrawing.value) {
    return
  }
  isDrawing.value = false
  props.sceneStage?.endStroke()
  evaluateDrawing()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  // 進入 3D 舞台：鏡頭推近蠟筆組、畫架長出來、畫布鋪好虛線底圖
  props.sceneStage?.enter(dotList)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  clearTimeout(scoreHintTimer)
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
  width: min(86vw, 370px)
  max-height: calc(70dvh - 20px)
  overflow-y: auto
  padding: 24px 26px
  border-radius: 16px
  text-align: center
  background-color: light-dark(rgba(255, 253, 247, 0.97), rgba(36, 46, 52, 0.97))
  // 深色模式疊一層同色蓋色壓淡紙紋：貼著說明文字的卡片，紙紋比在大面積背景上顯眼很多，
  // 蓋色壓下去才夠淡；淺色模式蓋色 alpha 0，維持原樣
  background-image: linear-gradient(light-dark(rgba(36, 46, 52, 0), rgba(36, 46, 52, 0.6)), light-dark(rgba(36, 46, 52, 0), rgba(36, 46, 52, 0.6))), var(--paper-grain-url, none)
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

// --- 3D 舞台 HUD：工具與資訊浮在場景邊緣，畫布本體在 3D 場景裡 ---
.stage-hud
  position: absolute
  inset: 0
  touch-action: none

  &.is-drawing-stage
    cursor: crosshair

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

.studio-title
  position: absolute
  top: 14px
  left: 0
  right: 0
  text-align: center
  font-size: 14px
  font-weight: 600
  letter-spacing: 3px
  color: #fff
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.85)
  pointer-events: none

// --- 匹配度量表 ---
.score-area
  position: absolute
  top: 40px
  left: 0
  right: 0
  text-align: center

.score-track
  position: relative
  width: min(72%, 320px)
  height: 18px
  margin: 0 auto
  border-radius: 999px
  overflow: hidden
  background: rgba(15, 30, 40, 0.45)

.score-bar
  height: 100%
  border-radius: 999px
  background: linear-gradient(90deg, #8fd8e8, #4f9ac2)
  transition: width 0.35s ease-out, background 0.3s

  &.is-passing
    background: linear-gradient(90deg, #9ad9a0, #5cab63)

// 過關門檻刻度線
.score-threshold
  position: absolute
  top: 0
  bottom: 0
  width: 2px
  background: light-dark(rgba(27, 42, 51, 0.45), rgba(255, 255, 255, 0.55))

.score-label
  position: absolute
  inset: 0
  font-size: 12px
  line-height: 18px
  letter-spacing: 1px
  color: #fff
  text-shadow: 0 1px 2px rgba(15, 30, 40, 0.7)

.score-hint
  margin-top: 6px
  font-size: 13px
  letter-spacing: 2px
  color: #ffb28a
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.8)

// --- 蠟筆盒與重畫 ---
.drawing-toolbar
  position: absolute
  bottom: 14px
  left: 0
  right: 0
  display: flex
  align-items: center
  justify-content: center
  gap: 18px

.crayon-box
  display: flex
  gap: 14px
  padding: 10px 18px 6px
  border-radius: 10px 10px 4px 4px
  background: light-dark(#e8d9b8, #4a4136)
  box-shadow: inset 0 2px 6px rgba(27, 42, 51, 0.2)

.crayon-stick
  position: relative
  width: 22px
  height: 46px
  border: none
  border-radius: 3px
  cursor: pointer
  transition: transform 0.18s
  box-shadow: 0 2px 6px rgba(27, 42, 51, 0.3)

  &:hover
    transform: translateY(-4px)

  &.is-selected
    transform: translateY(-10px)
    box-shadow: 0 6px 12px rgba(27, 42, 51, 0.35)

.crayon-tip
  position: absolute
  top: -10px
  left: 50%
  transform: translateX(-50%)
  width: 0
  height: 0
  border-left: 11px solid transparent
  border-right: 11px solid transparent
  border-bottom: 10px solid

.clear-button
  appearance: none
  padding: 7px 16px
  border: 1px solid rgba(255, 255, 255, 0.35)
  border-radius: 999px
  font-family: inherit
  font-size: 13px
  letter-spacing: 2px
  cursor: pointer
  color: #fff
  background: rgba(15, 30, 40, 0.45)
  transition: background 0.2s, opacity 0.2s

  &:hover:not(:disabled)
    background: rgba(15, 30, 40, 0.65)

  &:disabled
    opacity: 0.35
    cursor: default

// --- 畫廊 ---
.gallery-block
  position: absolute
  bottom: 12%
  left: 0
  right: 0
  display: flex
  flex-direction: column
  align-items: center
  gap: 12px

.gallery-caption
  font-size: 17px
  font-weight: 600
  letter-spacing: 3px
  color: #fff
  text-shadow: 0 1px 3px rgba(15, 30, 40, 0.85), 0 2px 10px rgba(15, 30, 40, 0.6)
  animation: gallery-caption-pop 0.4s 0.3s ease-out both

.gallery-confirm-button
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
  animation: gallery-caption-pop 0.4s 0.45s ease-out both

  &:hover
    transform: translateY(-1px)
    box-shadow: 0 6px 18px rgba(27, 42, 51, 0.4)

@keyframes gallery-caption-pop
  from
    opacity: 0
    transform: scale(0.9)
  to
    opacity: 1
    transform: scale(1)

.gallery-sparkle
  display: inline-block
  color: #e8a04c
  animation: sparkle-spin 1.6s ease-in-out infinite

@keyframes sparkle-spin
  0%, 100%
    transform: scale(1) rotate(0deg)
    opacity: 1
  50%
    transform: scale(1.4) rotate(180deg)
    opacity: 0.6

.hint-enter-active, .hint-leave-active
  transition: opacity 0.25s

.hint-enter-from, .hint-leave-to
  opacity: 0
</style>
