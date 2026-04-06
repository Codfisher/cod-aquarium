<template>
  <svg
    viewBox="0 0 400 400"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 鐵軌 -->
    <g>
      <polygon :points="leftRailPoints" fill="currentColor" />
      <polygon :points="rightRailPoints" fill="currentColor" />

      <line
        v-for="tie in tieList" :key="tie.y"
        :x1="tie.x1" :y1="tie.y"
        :x2="tie.x2" :y2="tie.y"
        :stroke-width="tie.strokeWidth"
        stroke="currentColor" stroke-linecap="round"
      />
    </g>

    <!-- 上方黃色橫線（往中間移動） -->
    <line
      :x1="200 - barHalfWidth" :x2="200 + barHalfWidth"
      :y1="upperY + (midY - upperY) * progress"
      :y2="upperY + (midY - upperY) * progress"
      stroke="#f97316" stroke-width="8" stroke-linecap="round"
      class="transition-[y1,y2] duration-50"
    />

    <!-- 下方黃色橫線（往中間移動） -->
    <line
      :x1="200 - barHalfWidth" :x2="200 + barHalfWidth"
      :y1="lowerY - (lowerY - midY) * progress"
      :y2="lowerY - (lowerY - midY) * progress"
      stroke="#f97316" stroke-width="8" stroke-linecap="round"
      class="transition-[y1,y2] duration-50"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const barHalfWidth = 50
const upperY = 100
const lowerY = 310
const midY = (upperY + lowerY) / 2

/** 鐵軌參數 */
const rail = {
  topLeftX: 180,
  topRightX: 220,
  bottomLeftX: 30,
  bottomRightX: 370,
  topY: 10,
  bottomY: 390,
  /** 軌道底部半寬 */
  bottomHalfWidth: 5,
  /** 軌道頂部半寬 */
  topHalfWidth: 1,
}

/** 左軌梯形頂點 */
const leftRailPoints = [
  `${rail.bottomLeftX - rail.bottomHalfWidth},${rail.bottomY}`,
  `${rail.bottomLeftX + rail.bottomHalfWidth},${rail.bottomY}`,
  `${rail.topLeftX + rail.topHalfWidth},${rail.topY}`,
  `${rail.topLeftX - rail.topHalfWidth},${rail.topY}`,
].join(' ')

/** 右軌梯形頂點 */
const rightRailPoints = [
  `${rail.bottomRightX - rail.bottomHalfWidth},${rail.bottomY}`,
  `${rail.bottomRightX + rail.bottomHalfWidth},${rail.bottomY}`,
  `${rail.topRightX + rail.topHalfWidth},${rail.topY}`,
  `${rail.topRightX - rail.topHalfWidth},${rail.topY}`,
].join(' ')

/** 計算枕木位置與粗細 */
const tieList = computed(() => {
  const result: Array<{
    y: number;
    x1: number;
    x2: number;
    strokeWidth: number;
  }> = []

  const tieCount = 18
  for (let i = 1; i <= tieCount; i++) {
    /** 指數 < 1 讓枕木在靠近滅點處越密集 */
    const t = (i / (tieCount + 1)) ** 0.55
    const y = rail.bottomY - t * (rail.bottomY - rail.topY)

    const ratio = (rail.bottomY - y) / (rail.bottomY - rail.topY)
    const leftX = rail.bottomLeftX + (rail.topLeftX - rail.bottomLeftX) * ratio
    const rightX = rail.bottomRightX + (rail.topRightX - rail.bottomRightX) * ratio

    /** 粗細從 5 漸變到 1 */
    const strokeWidth = 5 - ratio * 4

    result.push({ y, x1: leftX, x2: rightX, strokeWidth })
  }
  return result
})
</script>
