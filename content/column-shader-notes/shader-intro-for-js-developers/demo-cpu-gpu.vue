<template>
  <div class="root">
    <div class="panel">
      <div class="header">
        <span class="label">CPU</span>
        <span class="sub">逐一處理</span>
      </div>
      <div class="grid-wrap">
        <div class="grid" :style="{ '--cols': COLS }">
          <div
            v-for="i in TOTAL"
            :key="`c-${i}`"
            class="cell"
            :class="{
              'is-fish': fishCellSet.has(i),
              'is-eye': eyeSet.has(i),
              'is-active': cpuIndex === i && fishCellSet.has(i),
              'is-done': cpuIndex > i && fishCellSet.has(i),
              'is-eye-done': cpuIndex > i && eyeSet.has(i),
            }"
          />
        </div>
      </div>
      <div class="footer">
        <span class="counter">{{ cpuFishDone }} / {{ fishCellSet.size }}</span>
      </div>
    </div>

    <div class="panel">
      <div class="header">
        <span class="label">GPU</span>
        <span class="sub">全部同時</span>
      </div>
      <div class="grid-wrap">
        <div class="grid" :style="{ '--cols': COLS }">
          <div
            v-for="i in TOTAL"
            :key="`g-${i}`"
            class="cell"
            :class="{
              'is-fish': fishCellSet.has(i),
              'is-eye': eyeSet.has(i),
              'is-done': gpuLit && fishCellSet.has(i),
              'is-eye-done': gpuLit && eyeSet.has(i),
            }"
          />
        </div>
        <div v-if="gpuFlash" class="flash" />
      </div>
      <div class="footer">
        <span class="counter">
          {{ gpuLit ? fishCellSet.size : 0 }} / {{ fishCellSet.size }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const COLS = 20
const ROWS = 10
const TOTAL = COLS * ROWS

// 20×10 像素魚（面朝右，尾巴在左）
// 用二維陣列標記，1=魚身 2=眼睛 0=空
const FISH_MAP = [
  //1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0], // row 0
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], // row 1
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // row 2
  [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0], // row 3 (眼睛在 col 14)
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 4
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 5
  [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], // row 6
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // row 7
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], // row 8
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0], // row 9
]

// 眼睛位置
const EYE_POSITION_LIST = [
  { row: 3, col: 14 },
]

const fishIndexList: number[] = []
const eyeIndexList: number[] = []

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const index = row * COLS + col + 1 // 1-based
    if (FISH_MAP[row]?.[col] === 1) {
      fishIndexList.push(index)
    }
  }
}

for (const pos of EYE_POSITION_LIST) {
  const index = pos.row * COLS + pos.col + 1
  eyeIndexList.push(index)
}

const fishCellSet = new Set(fishIndexList)
const eyeSet = new Set(eyeIndexList)

const cpuIndex = ref(0)
const gpuLit = ref(false)
const gpuFlash = ref(false)

const cpuFishDone = computed(() => {
  let count = 0
  for (const idx of fishIndexList) {
    if (cpuIndex.value > idx)
      count++
  }
  return count
})

let intervalId = 0
let timeoutIdList: number[] = []

function clearAllTimeoutList() {
  clearInterval(intervalId)
  for (const id of timeoutIdList) clearTimeout(id)
  timeoutIdList = []
}

function startCycle() {
  clearAllTimeoutList()
  cpuIndex.value = 0
  gpuLit.value = false
  gpuFlash.value = false

  intervalId = window.setInterval(() => {
    if (cpuIndex.value < TOTAL) {
      cpuIndex.value++
    }
    else {
      clearInterval(intervalId)
      const id = window.setTimeout(startCycle, 1400)
      timeoutIdList.push(id)
    }
  }, 16)

  const gpuId = window.setTimeout(() => {
    gpuFlash.value = true
    gpuLit.value = true
    const fadeId = window.setTimeout(() => {
      gpuFlash.value = false
    }, 400)
    timeoutIdList.push(fadeId)
  }, 350)
  timeoutIdList.push(gpuId)
}

onMounted(startCycle)
onBeforeUnmount(clearAllTimeoutList)
</script>

<style scoped>
.root {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  padding: 20px;
  border: 1px solid rgba(128, 128, 128, 0.12);
  border-radius: 12px;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.label {
  font-size: 13px;
  font-weight: 700;
  opacity: 0.7;
  letter-spacing: 0.05em;
}

.sub {
  font-size: 11px;
  opacity: 0.3;
}

.grid-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 2px;
}

.cell {
  aspect-ratio: 1;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.05);
  transition: background 0.25s ease, box-shadow 0.25s ease;
}

.cell.is-fish {
  background: rgba(52, 198, 235, 0.06);
}

.cell.is-eye {
  background: rgba(52, 198, 235, 0.06);
}

.cell.is-active {
  background: #34c6eb;
  box-shadow:
    0 0 5px rgba(52, 198, 235, 0.5),
    0 0 12px rgba(52, 198, 235, 0.15);
  transition: none;
}

.cell.is-done {
  background: rgba(52, 198, 235, 0.6);
  box-shadow: 0 0 2px rgba(52, 198, 235, 0.1);
}

.cell.is-eye-done {
  background: rgba(15, 30, 50, 0.85);
  box-shadow: none;
}

.flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at center,
    rgba(52, 198, 235, 0.3) 0%,
    transparent 70%
  );
  border-radius: 6px;
  animation: flash-fade 0.6s ease-out forwards;
  pointer-events: none;
}

@keyframes flash-fade {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

.footer {
  display: flex;
  justify-content: flex-end;
}

.counter {
  font-size: 11px;
  font-family: monospace;
  opacity: 0.25;
  font-variant-numeric: tabular-nums;
}
</style>
