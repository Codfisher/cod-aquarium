<template>
  <div class="crayon-challenge vp-raw absolute inset-0 z-20 select-none">
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
        小小畫室
      </div>
      <p class="intro-description">
        拿起蠟筆沿虛線描出小魚，<br>
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

    <!-- 畫室工作檯 -->
    <div
      v-else
      class="studio-panel"
      :class="{ 'is-framed': stage === 'gallery' }"
    >
      <button
        type="button"
        class="challenge-close"
        aria-label="關閉挑戰"
        @click="emit('close')"
      >
        ✕
      </button>

      <div class="studio-title">
        {{ stage === 'draw' ? '沿虛線描出小魚' : '完成！' }}
      </div>

      <!-- 裱框膠帶（畫廊階段） -->
      <template v-if="stage === 'gallery'">
        <span class="frame-tape tape-top-left" />
        <span class="frame-tape tape-top-right" />
      </template>

      <svg
        ref="drawingCanvasRef"
        class="drawing-canvas"
        :class="{ 'is-drawing-stage': stage === 'draw' }"
        viewBox="0 0 320 220"
        role="img"
        aria-label="小小畫室畫布"
        @pointerdown.prevent="handlePointerDown"
        @pointermove.prevent="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @pointerleave="handlePointerUp"
      >
        <!-- 參考虛線輪廓 -->
        <polygon
          v-if="stage === 'draw'"
          class="guide-outline"
          :points="outlinePointsText"
        />

        <!-- 過關後自動上色 -->
        <polygon
          v-if="stage === 'gallery'"
          class="crayon-fill"
          :points="outlinePointsText"
          :fill="selectedCrayonColor"
        />

        <!-- 玩家畫的筆觸 -->
        <polyline
          v-for="(stroke, strokeIndex) in strokeList"
          :key="strokeIndex"
          class="crayon-line"
          :points="stroke.pointsText"
          :stroke="stroke.color"
        />

        <!-- 完成後的眼睛 -->
        <g v-if="stage === 'gallery'">
          <circle
            class="crayon-eye"
            cx="252"
            cy="98"
            r="6"
          />
        </g>
      </svg>

      <!-- 匹配度量表 -->
      <div
        v-if="stage === 'draw'"
        class="score-area"
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
      >
        <div class="gallery-caption">
          <span class="gallery-sparkle">✦</span>
          匹配度 {{ scorePercent }}%，掛上畫廊！
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
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { playSuccessSound } from './challenge-audio'

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
  pointsText: string;
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

const drawingCanvasRef = useTemplateRef('drawingCanvasRef')

const stage = ref<'intro' | 'draw' | 'gallery'>('intro')
const strokeList = ref<CrayonStroke[]>([])
const selectedCrayonKey = ref<CrayonKey>('blue')
const scorePercent = ref(0)
const scoreHintText = ref('')
const isDrawing = ref(false)

let scoreHintTimer: ReturnType<typeof setTimeout> | undefined

const outlinePointsText = dotList.map((dot) => `${dot.x},${dot.y}`).join(' ')

const selectedCrayonColor = computed(() => (
  crayonList.find((crayon) => crayon.key === selectedCrayonKey.value)?.color ?? '#4f9ac2'
))

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

/** 事件座標轉 viewBox 座標 */
function toCanvasPoint(event: PointerEvent): PlanarPoint | null {
  const canvasElement = drawingCanvasRef.value
  if (!canvasElement) {
    return null
  }
  const boundingRect = canvasElement.getBoundingClientRect()
  if (boundingRect.width <= 0 || boundingRect.height <= 0) {
    return null
  }
  return {
    x: ((event.clientX - boundingRect.left) / boundingRect.width) * 320,
    y: ((event.clientY - boundingRect.top) / boundingRect.height) * 220,
  }
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
    // 掛上畫廊後不自動結束，由玩家按「完成」確認
    playSuccessSound()
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
    pointsText: `${point.x.toFixed(1)},${point.y.toFixed(1)}`,
  }]
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
  activeStroke.pointsText += ` ${point.x.toFixed(1)},${point.y.toFixed(1)}`
  // 觸發響應式更新（就地 mutate 陣列元素屬性不會被 shallow 比對捕捉）
  strokeList.value = [...strokeList.value]
}

function handlePointerUp() {
  if (stage.value !== 'draw' || !isDrawing.value) {
    return
  }
  isDrawing.value = false
  evaluateDrawing()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  clearTimeout(scoreHintTimer)
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

// --- 畫室工作檯 ---
// 垂直置中：內嵌區塊在手機上很高，錨定頂端會像吊在半空
.studio-panel
  position: absolute
  top: 50%
  left: 50%
  transform: translate(-50%, -50%)
  width: min(92vw, 480px)
  max-height: calc(70dvh - 20px)
  overflow-y: auto
  padding: 20px 20px 22px
  border-radius: 16px
  text-align: center
  background-color: light-dark(rgba(255, 253, 247, 0.97), rgba(36, 46, 52, 0.97))
  background-image: var(--paper-grain-url, none)
  background-repeat: repeat
  background-size: 200px 200px
  color: light-dark(oklch(0.35 0.05 195), oklch(0.9 0.02 195))
  box-shadow: 0 10px 34px rgba(15, 30, 40, 0.3)
  transition: box-shadow 0.5s

  &.is-framed
    box-shadow: 0 0 0 10px light-dark(#c9a86a, #8a744d), 0 0 0 13px light-dark(#a8874b, #6d5a3a), 0 18px 44px rgba(15, 30, 40, 0.45)

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

.studio-title
  font-size: 16px
  font-weight: 600
  letter-spacing: 3px

.frame-tape
  position: absolute
  width: 92px
  height: 26px
  background: rgba(129, 199, 190, 0.6)
  background-image: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.15) 0 5px, transparent 5px 10px)
  clip-path: polygon(0% 12%, 4% 0%, 96% 5%, 100% 16%, 97% 86%, 93% 100%, 5% 95%, 1% 86%)
  z-index: 1

.tape-top-left
  top: -12px
  left: 28px
  transform: rotate(-38deg)

.tape-top-right
  top: -12px
  right: 28px
  transform: rotate(38deg)

// --- 畫布 ---
.drawing-canvas
  display: block
  width: 100%
  margin-top: 10px
  touch-action: none

  &.is-drawing-stage
    cursor: crosshair

.guide-outline
  fill: none
  stroke: light-dark(rgba(58, 74, 82, 0.35), rgba(223, 232, 236, 0.3))
  stroke-width: 2
  stroke-dasharray: 7 6
  stroke-linejoin: round

.crayon-line
  fill: none
  stroke-width: 5
  stroke-linecap: round
  stroke-linejoin: round
  opacity: 0.85

.crayon-fill
  opacity: 0.35

.crayon-eye
  fill: #2f3d45

// --- 匹配度量表 ---
.score-area
  margin-top: 8px

.score-track
  position: relative
  width: min(88%, 340px)
  height: 18px
  margin: 0 auto
  border-radius: 999px
  overflow: hidden
  background: light-dark(rgba(27, 42, 51, 0.1), rgba(255, 255, 255, 0.1))

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
  color: light-dark(#2f3d45, #dfe8ec)

.score-hint
  margin-top: 6px
  font-size: 13px
  letter-spacing: 2px
  color: light-dark(#b3562f, #ffb28a)

// --- 蠟筆盒與重畫 ---
.drawing-toolbar
  margin-top: 10px
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
  border: 1px solid light-dark(rgba(62, 95, 82, 0.3), rgba(255, 255, 255, 0.18))
  border-radius: 999px
  font-family: inherit
  font-size: 13px
  letter-spacing: 2px
  cursor: pointer
  color: inherit
  background: transparent
  transition: background 0.2s, opacity 0.2s

  &:hover:not(:disabled)
    background: light-dark(rgba(27, 42, 51, 0.06), rgba(255, 255, 255, 0.08))

  &:disabled
    opacity: 0.35
    cursor: default

// --- 畫廊 ---
.gallery-block
  margin-top: 12px
  display: flex
  flex-direction: column
  align-items: center
  gap: 12px

.gallery-caption
  font-size: 17px
  font-weight: 600
  letter-spacing: 3px
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
