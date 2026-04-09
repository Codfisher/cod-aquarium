<template>
  <div class="diagram-flatten not-prose">
    <!-- 左側：頂點卡片 -->
    <div class="df-panel">
      <div class="df-panel-header">
        <span class="df-panel-tag">INPUT</span>
        <span class="df-panel-title">頂點資料</span>
      </div>

      <div class="df-card-list">
        <transition-group name="df-card">
          <div
            v-for="(vertex, index) in vertexList"
            :key="vertex.id"
            class="df-card"
            :class="{ 'df-card--active': hoverVertexIndex === index }"
            :style="{ '--c': getColor(index), '--c-bg': getColorBg(index) }"
            @pointerenter="hoverVertexIndex = index"
            @pointerleave="hoverVertexIndex = -1"
          >
            <div class="df-card-accent" />
            <div class="df-card-body">
              <div class="df-card-head">
                <span class="df-card-label">
                  頂點 {{ index + 1 }}
                </span>
                <button
                  v-if="vertexList.length > 1"
                  class="df-card-remove"
                  title="移除頂點"
                  @click="removeVertex(index)"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
              <div class="df-card-fields">
                <label class="df-field">
                  <span class="df-field-name">x</span>
                  <input
                    v-model="vertex.x"
                    type="number"
                    step="0.1"
                    class="df-input"
                  >
                </label>
                <label class="df-field">
                  <span class="df-field-name">y</span>
                  <input
                    v-model="vertex.y"
                    type="number"
                    step="0.1"
                    class="df-input"
                  >
                </label>
              </div>
            </div>
          </div>
        </transition-group>
      </div>

      <button class="df-add-btn" @click="addVertex">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2.5V9.5M2.5 6H9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        新增頂點
      </button>
    </div>

    <!-- 中間：箭頭 -->
    <div class="df-arrow-col">
      <div class="df-arrow">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M5 12H19M19 12L14 7M19 12L14 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    </div>

    <!-- 右側：攤平陣列 -->
    <div class="df-panel">
      <div class="df-panel-header">
        <span class="df-panel-tag df-panel-tag--out">OUTPUT</span>
        <span class="df-panel-title">Float32Array({{ flattenedList.length }})</span>
      </div>

      <div class="df-array">
        <transition-group name="df-row">
          <div
            v-for="(item, index) in flattenedList"
            :key="`${item.vertexIndex}-${item.component}`"
            class="df-row"
            :class="{
              'df-row--active': hoverVertexIndex === item.vertexIndex,
              'df-row--y': item.component === 'y',
            }"
            :style="{ '--c': getColor(item.vertexIndex), '--c-bg': getColorBg(item.vertexIndex) }"
            @pointerenter="hoverVertexIndex = item.vertexIndex"
            @pointerleave="hoverVertexIndex = -1"
          >
            <span class="df-row-idx">{{ index }}</span>
            <span class="df-row-dot" />
            <span class="df-row-val">{{ formatNumber(item.value) }}</span>
            <span class="df-row-from">
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
.diagram-flatten {
  display: flex;
  align-items: stretch;
  margin: 1.5rem 0;
  border-radius: 12px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  background: rgba(128, 128, 128, 0.03);
  overflow: hidden;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-size: 13px;
}

/* 面板 */
.df-panel {
  flex: 1;
  min-width: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.df-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.df-panel-tag {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(26, 115, 232, 0.08);
  color: #1a73e8;
}

.df-panel-tag--out {
  background: rgba(30, 142, 62, 0.08);
  color: #1e8e3e;
}

.df-panel-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.55;
}

/* 中間箭頭 */
.df-arrow-col {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 2px;
}

.df-arrow {
  opacity: 0.2;
}

/* 卡片 */
.df-card-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.df-card {
  display: flex;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  overflow: hidden;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  background: transparent;
}

.df-card--active {
  border-color: var(--c);
  background: var(--c-bg);
  box-shadow: 0 1px 8px var(--c-bg);
}

.df-card-accent {
  width: 3px;
  flex-shrink: 0;
  background: var(--c);
  opacity: 0.6;
  transition: opacity 0.2s;
}

.df-card--active .df-card-accent {
  opacity: 1;
}

.df-card-body {
  flex: 1;
  padding: 8px 10px;
  min-width: 0;
}

.df-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.df-card-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--c);
}

.df-card-remove {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: currentColor;
  opacity: 0.25;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  padding: 0;
}

.df-card-remove:hover {
  opacity: 0.8;
  background: rgba(217, 48, 37, 0.08);
  color: #d93025;
}

.df-card-fields {
  display: flex;
  gap: 6px;
}

.df-field {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
}

.df-field-name {
  font-size: 12px;
  opacity: 0.4;
  flex-shrink: 0;
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

/* 新增按鈕 */
.df-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  font-size: 12px;
  font-family: inherit;
  border: 1px dashed rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: transparent;
  color: currentColor;
  opacity: 0.35;
  cursor: pointer;
  transition: all 0.2s;
}

.df-add-btn:hover {
  opacity: 0.7;
  border-color: rgba(128, 128, 128, 0.5);
  background: rgba(128, 128, 128, 0.04);
}

/* 攤平陣列 */
.df-array {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.df-row {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.df-row--active {
  background: var(--c-bg);
}

/* y 列底部加分隔（每組頂點的最後一個） */
.df-row--y {
  margin-bottom: 4px;
}

.df-row--y:last-child {
  margin-bottom: 0;
}

.df-row-idx {
  font-size: 12px;
  opacity: 0.3;
  min-width: 16px;
  text-align: right;
  margin-right: 8px;
}

.df-row-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c);
  flex-shrink: 0;
  margin-right: 8px;
  opacity: 0.7;
  transition: opacity 0.15s, transform 0.15s;
}

.df-row--active .df-row-dot {
  opacity: 1;
  transform: scale(1.3);
}

.df-row-val {
  font-size: 13px;
  font-weight: 600;
  min-width: 48px;
  text-align: right;
  margin-right: 10px;
  color: var(--c);
  transition: opacity 0.15s;
}

.df-row-from {
  font-size: 12px;
  opacity: 0.3;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.df-row--active .df-row-from {
  opacity: 0.6;
}

/* 動畫 */
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

/* RWD */
@media (max-width: 600px) {
  .diagram-flatten {
    flex-direction: column;
  }

  .df-arrow-col {
    padding: 4px 0;
    justify-content: center;
  }

  .df-arrow {
    transform: rotate(90deg);
  }
}
</style>
