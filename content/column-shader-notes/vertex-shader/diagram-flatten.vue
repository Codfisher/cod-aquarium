<template>
  <div class="not-prose flex items-stretch overflow-hidden rounded-xl border border-gray-500/20 bg-gray-500/3 font-mono text-[13px] max-sm:flex-col">
    <!-- 左側：頂點卡片 -->
    <div class="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
      <div class="mb-0.5 flex items-center gap-2">
        <span class="rounded bg-blue-600/8 px-1.5 py-0.5 text-xs font-bold tracking-wider text-blue-600">INPUT</span>
        <span class="text-xs font-semibold opacity-55">頂點資料</span>
      </div>

      <div class="flex flex-col gap-1.5">
        <transition-group name="df-card">
          <div
            v-for="(vertex, index) in vertexList"
            :key="vertex.id"
            class="df-card flex overflow-hidden rounded-lg border border-gray-500/15 transition-all duration-200"
            :class="{ 'df-card--active': hoverVertexIndex === index }"
            :style="{ '--c': getColor(index), '--c-bg': getColorBg(index) }"
            @pointerenter="hoverVertexIndex = index"
            @pointerleave="hoverVertexIndex = -1"
          >
            <div class="w-0.75 shrink-0 transition-opacity duration-200" :style="{ background: getColor(index), opacity: hoverVertexIndex === index ? 1 : 0.6 }" />
            <div class="flex min-w-0 flex-1 flex-col p-2">
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-xs font-semibold" :style="{ color: getColor(index) }">
                  頂點 {{ index + 1 }}
                </span>
                <button
                  v-if="vertexList.length > 1"
                  class="flex size-5 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 opacity-25 transition-all duration-150 hover:bg-red-500/8 hover:text-red-600 hover:opacity-80"
                  title="移除頂點"
                  @click="removeVertex(index)"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
              <div class="flex gap-1.5">
                <label class="flex min-w-0 flex-1 items-center gap-1.5">
                  <span class="shrink-0 text-xs opacity-40">x</span>
                  <input
                    v-model="vertex.x"
                    type="number"
                    step="0.1"
                    class="df-input"
                    :style="{ '--c': getColor(index), '--c-bg': getColorBg(index) }"
                  >
                </label>
                <label class="flex min-w-0 flex-1 items-center gap-1.5">
                  <span class="shrink-0 text-xs opacity-40">y</span>
                  <input
                    v-model="vertex.y"
                    type="number"
                    step="0.1"
                    class="df-input"
                    :style="{ '--c': getColor(index), '--c-bg': getColorBg(index) }"
                  >
                </label>
              </div>
            </div>
          </div>
        </transition-group>
      </div>

      <button
        class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-500/25 bg-transparent p-2 font-inherit text-xs opacity-35 transition-all duration-200 hover:border-gray-500/50 hover:bg-gray-500/4 hover:opacity-70"
        @click="addVertex"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2.5V9.5M2.5 6H9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        新增頂點
      </button>
    </div>

    <!-- 中間：箭頭 -->
    <div class="flex shrink-0 items-center px-0.5 max-sm:justify-center max-sm:px-0 max-sm:py-1">
      <div class="opacity-20 max-sm:rotate-90">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M5 12H19M19 12L14 7M19 12L14 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    </div>

    <!-- 右側：攤平陣列 -->
    <div class="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
      <div class="mb-0.5 flex items-center gap-2">
        <span class="rounded bg-green-600/8 px-1.5 py-0.5 text-xs font-bold tracking-wider text-green-600">OUTPUT</span>
        <span class="text-xs font-semibold opacity-55">Float32Array({{ flattenedList.length }})</span>
      </div>

      <div class="flex flex-col">
        <transition-group name="df-row">
          <div
            v-for="(item, index) in flattenedList"
            :key="`${item.vertexIndex}-${item.component}`"
            class="df-row flex items-center rounded-md px-2 py-1 transition-colors duration-150"
            :class="{
              'df-row--active': hoverVertexIndex === item.vertexIndex,
              'mb-1': item.component === 'y' && index < flattenedList.length - 1,
            }"
            :style="{ '--c': getColor(item.vertexIndex), '--c-bg': getColorBg(item.vertexIndex) }"
            @pointerenter="hoverVertexIndex = item.vertexIndex"
            @pointerleave="hoverVertexIndex = -1"
          >
            <span class="mr-2 min-w-4 text-right text-xs opacity-30">{{ index }}</span>
            <span
              class="df-row-dot mr-2 size-1.5 shrink-0 rounded-full transition-all duration-150"
              :style="{ background: getColor(item.vertexIndex), opacity: hoverVertexIndex === item.vertexIndex ? 1 : 0.7 }"
              :class="{ 'scale-130': hoverVertexIndex === item.vertexIndex }"
            />
            <span
              class="mr-2.5 min-w-12 text-right text-[13px] font-semibold"
              :style="{ color: getColor(item.vertexIndex) }"
            >{{ formatNumber(item.value) }}</span>
            <span
              class="whitespace-nowrap text-xs transition-opacity duration-150"
              :class="hoverVertexIndex === item.vertexIndex ? 'opacity-60' : 'opacity-30'"
            >
              ← 頂點{{ item.vertexIndex + 1 }}.{{ item.component }}
            </span>
          </div>
        </transition-group>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

const COLOR_LIST = [
  { main: '#d93025', bg: 'rgba(217, 48, 37, 0.08)' },
  { main: '#1e8e3e', bg: 'rgba(30, 142, 62, 0.08)' },
  { main: '#1a73e8', bg: 'rgba(26, 115, 232, 0.08)' },
  { main: '#e8710a', bg: 'rgba(232, 113, 10, 0.08)' },
  { main: '#9334e6', bg: 'rgba(147, 52, 230, 0.08)' },
  { main: '#0d906e', bg: 'rgba(13, 144, 110, 0.08)' },
]

interface Vertex {
  id: number;
  x: number;
  y: number;
}

let nextId = 4

const vertexList = reactive<Vertex[]>([
  { id: 1, x: -1.0, y: -1.0 },
  { id: 2, x: 1.0, y: -1.0 },
  { id: 3, x: -1.0, y: 1.0 },
])

const hoverVertexIndex = ref(-1)

interface FlattenedItem {
  value: number;
  vertexIndex: number;
  component: 'x' | 'y';
}

const flattenedList = computed<FlattenedItem[]>(() => {
  const result: FlattenedItem[] = []
  for (let i = 0; i < vertexList.length; i++) {
    const vertex = vertexList[i]
    result.push({ value: Number(vertex.x), vertexIndex: i, component: 'x' })
    result.push({ value: Number(vertex.y), vertexIndex: i, component: 'y' })
  }
  return result
})

function getColor(index: number): string {
  return COLOR_LIST[index % COLOR_LIST.length].main
}

function getColorBg(index: number): string {
  return COLOR_LIST[index % COLOR_LIST.length].bg
}

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return '0.0'
  const str = String(value)
  return str.includes('.') ? str : `${str}.0`
}

function addVertex() {
  vertexList.push({ id: nextId++, x: 0.0, y: 0.0 })
}

function removeVertex(index: number) {
  vertexList.splice(index, 1)
}
</script>

<style scoped>
/* CSS 變數驅動的動態樣式 + 動畫（tailwind 無法處理） */
.df-card--active {
  border-color: var(--c);
  background: var(--c-bg);
  box-shadow: 0 1px 8px var(--c-bg);
}

.df-row--active {
  background: var(--c-bg);
}

.df-input {
  width: 100%;
  min-width: 0;
  padding: 4px 7px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.04);
  color: inherit;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.df-input:focus {
  border-color: var(--c);
  box-shadow: 0 0 0 2px var(--c-bg);
}

.df-input::-webkit-inner-spin-button,
.df-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.df-input {
  -moz-appearance: textfield;
  appearance: textfield;
}

/* transition-group 動畫 */
.df-card-enter-active,
.df-card-leave-active {
  transition: all 0.25s ease;
}

.df-card-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.df-card-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.df-card-move {
  transition: transform 0.25s ease;
}

.df-row-enter-active,
.df-row-leave-active {
  transition: all 0.2s ease;
}

.df-row-enter-from {
  opacity: 0;
  transform: translateX(6px);
}

.df-row-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

.df-row-move {
  transition: transform 0.25s ease;
}
</style>
