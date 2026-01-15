<template>
  <div class="page">
    <header class="p-4 border rounded border-gray-200/80">
      <div class="row">
        <label>
          總筆數
          <input
            v-model.number="total"
            type="number"
            min="5"
            max="5000"
            step="5"
          >
        </label>

        <label>
          Item 高度(px)
          <input
            v-model.number="itemHeight"
            type="number"
            min="20"
            max="80"
            step="1"
          >
        </label>

        <label>
          Overscan
          <input
            v-model.number="overscan"
            type="number"
            min="0"
            max="60"
            step="1"
          >
        </label>
      </div>
    </header>

    <div class="grid grid-cols-2 gap-4">
      <div class="panel">
        <div class="mb-2 text-lg font-bold">
          虛擬列表
        </div>
        <div
          ref="scrollerEl"
          class="scroller"
          :style="{ height: `${viewportHeight}px` }"
          @scroll="onScroll"
        >
          <!-- track：撐出完整高度，讓 scrollbar 正常 -->
          <div
            class="track"
            :style="{ 'height': `${totalHeight}px`, '--rowH': `${itemHeight}px` }"
          >
            <!-- render-layer：只放 renderStart~renderEnd，並 translateY 到正確位置 -->
            <div
              class="renderLayer"
              :style="{ transform: `translateY(${renderStart * itemHeight}px)` }"
            >
              <div
                v-for="idx in renderedIndices"
                :key="idx"
                class="item"
                :class="itemClass(idx)"
                :style="{ height: `${itemHeight}px` }"
              >
                <div class="idx">
                  #{{ idx }}
                </div>
                <div class="hint">
                  <span v-if="isVisible(idx)">可視</span>
                  <span v-else>overscan</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="mb-2 text-lg font-bold">
          整體樣貌
        </div>

        <div class="sliceList border rounded border-gray-400/50">
          <div
            v-for="idx in demoIndices"
            :key="`demo-${idx}`"
            class="sliceRow"
            :class="demoClass(idx)"
          >
            <div class="sliceIdx">
              #{{ idx }}
            </div>
            <div class="sliceBar">
              <span v-if="isVisible(idx)">可視區</span>
              <span v-else-if="isRendered(idx)">Overscan</span>
              <span v-else>未渲染</span>
            </div>
          </div>

          <!-- 在剖面上用括號畫出 render window / visible window -->
          <div
            class="bracket renderBracket flex items-start justify-end"
            :style="renderBracketStyle"
          >
            <div class="bLabel">
              渲染區
            </div>
          </div>

          <div
            class="bracket visibleBracket"
            :style="visibleBracketStyle"
          >
            <div class="bLabel">
              可視區
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useWindowSize } from '@vueuse/core'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'

const windowSize = reactive(useWindowSize())

const total = ref(100)
const itemHeight = ref(36)
const viewportHeight = computed(() => windowSize.height * 0.2)
const overscan = ref(4)

const scrollerEl = ref(null)
const scrollTop = ref(0)

const gotoIndex = ref(0)

const totalHeight = computed(() => total.value * itemHeight.value)

// 可視範圍（純 viewport 內）
const visibleCount = computed(() => Math.ceil(viewportHeight.value / itemHeight.value))
const visibleStart = computed(() => {
  const s = Math.floor(scrollTop.value / itemHeight.value)
  return clamp(s, 0, Math.max(0, total.value - 1))
})
const visibleEnd = computed(() => {
  return clamp(visibleStart.value + visibleCount.value - 1, 0, Math.max(0, total.value - 1))
})

// 渲染範圍（可視 + overscan）
const renderStart = computed(() => clamp(visibleStart.value - overscan.value, 0, Math.max(0, total.value - 1)))
const renderEnd = computed(() =>
  clamp(visibleEnd.value + overscan.value, 0, Math.max(0, total.value - 1)),
)

const renderedCount = computed(() => (total.value === 0 ? 0 : renderEnd.value - renderStart.value + 1))

const renderedIndices = computed(() => {
  const out = []
  for (let i = renderStart.value; i <= renderEnd.value; i++) out.push(i)
  return out
})

function onScroll(e) {
  scrollTop.value = e.target.scrollTop
}

function scrollToIndex(idx) {
  const i = clamp(idx, 0, Math.max(0, total.value - 1))
  if (!scrollerEl.value)
    return
  scrollerEl.value.scrollTop = i * itemHeight.value
  scrollTop.value = scrollerEl.value.scrollTop
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function isVisible(idx) {
  return idx >= visibleStart.value && idx <= visibleEnd.value
}
function isRendered(idx) {
  return idx >= renderStart.value && idx <= renderEnd.value
}

function itemClass(idx) {
  // 在「真實列表」中：可視的會標 visible，其他渲染中的就是 overscan（雖然平常看不到）
  return isVisible(idx) ? 'isVisible' : 'isOverscan'
}

/** ====== 剖面示意（含未渲染） ====== */
const demoOutside = 4 // 剖面中額外顯示 render 外上下各幾筆「未渲染」示意
const demoIndices = computed(() => {
  if (total.value <= 0)
    return []
  const start = clamp(renderStart.value - demoOutside, 0, total.value - 1)
  const end = clamp(renderEnd.value + demoOutside, 0, total.value - 1)
  const out = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
})
function demoClass(idx) {
  if (isVisible(idx))
    return 'dVisible'
  if (isRendered(idx))
    return 'dOverscan'
  return 'dNot'
}

// 在剖面列表裡，計算 bracket 的 top/height（以列數為單位）
const demoRowH = 30 // sliceRow 的固定高度（CSS 也要一致）
const demoStartIndex = computed(() => (demoIndices.value.length ? demoIndices.value[0] : 0))

const renderBracketStyle = computed(() => {
  const topRows = renderStart.value - demoStartIndex.value
  const hRows = renderedCount.value
  return {
    top: `${topRows * demoRowH}px`,
    height: `${hRows * demoRowH}px`,
  }
})
const visibleBracketStyle = computed(() => {
  const topRows = visibleStart.value - demoStartIndex.value
  const hRows = (visibleEnd.value - visibleStart.value + 1) || 0
  return {
    top: `${topRows * demoRowH}px`,
    height: `${hRows * demoRowH}px`,
  }
})

onMounted(() => {
  nextTick(() => scrollToIndex(gotoIndex.value))
})
</script>

<style scoped>
.controls .row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: end;
}

label {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

input {
  width: 92px;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 10px;
  outline: none;
}

button {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #fafafa;
  cursor: pointer;
}

button:hover {
  background: #f3f3f3;
}

.goto input {
  width: 110px;
}

.meta {
  margin-top: 10px;
  justify-content: space-between;
  align-items: center;
}

.chip {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid #efefef;
  border-radius: 999px;
  background: #fcfcfc;
  font-size: 12px;
}

.chip .k {
  color: #666;
}

.chip .v {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.legend {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.tag {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid #e9e9e9;
}

.tag.visible {
  background: rgba(0, 200, 0, 0.1);
}

.tag.overscan {
  background: rgba(255, 180, 0, 0.14);
}

.tag.not {
  background: rgba(120, 120, 120, 0.12);
}

.note {
  margin: 10px 0 0;
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}

/* ====== 真實虛擬列表 ====== */
.scroller {
  position: relative;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  overflow: auto;
}

.track {
  position: relative;
  /* 用背景條紋提示「其實有很多 item」 */
  background-image: repeating-linear-gradient(to bottom,
      rgba(0, 0, 0, 0.03) 0,
      rgba(0, 0, 0, 0.03) calc(var(--rowH) - 1px),
      rgba(0, 0, 0, 0) var(--rowH));
}

.renderLayer {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  will-change: transform;
  padding: 6px;
  box-sizing: border-box;
}

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 12px;
  padding: 0 10px;
  margin: 6px 0;
  border: 1px solid #ededed;
  background: #fff;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
  font-variant-numeric: tabular-nums;
}

.item .idx {
  font-weight: 700;
}

.item .hint {
  font-size: 12px;
}

.item.isVisible {
  background: rgba(0, 200, 0, 0.08);
  border-color: rgba(0, 200, 0, 0.22);
}

.item.isOverscan {
  background: rgba(255, 180, 0, 0.10);
  border-color: rgba(255, 180, 0, 0.30);
}

.viewportFrame {
  pointer-events: none;
  position: sticky;
  top: 0;
  height: 100%;
  border: 2px solid rgba(0, 200, 0, 0.35);
  border-radius: 14px;
  box-sizing: border-box;
}

.frameLabel {
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(0, 200, 0, 0.12);
  border: 1px solid rgba(0, 200, 0, 0.25);
}

/* ====== 剖面示意 ====== */
.slice {
  border: 1px solid #e8e8e8;
  border-radius: 14px;
  overflow: hidden;
}

.sliceHeader {
  padding: 10px 12px;
  background: #fafafa;
  border-bottom: 1px solid #eee;
}

.sliceTitle {
  font-size: 13px;
  font-weight: 700;
}

.sliceSub {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.sliceList {
  position: relative;
  min-height: 50vh;
  overflow: auto;
}

.sliceRow {
  height: 30px;
  /* demoRowH 必須一致 */
  display: grid;
  grid-template-columns: 70px 1fr;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px dashed #f0f0f0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.sliceIdx {
  font-weight: 700;
}

.sliceRow.dVisible {
  background: rgba(0, 200, 0, 0.10);
}

.sliceRow.dOverscan {
  background: rgba(255, 180, 0, 0.12);
}

.sliceRow.dNot {
  background: rgba(120, 120, 120, 0.08);
}

.bracket {
  position: absolute;
  left: 6px;
  right: 6px;
  border-radius: 12px;
  pointer-events: none;
  box-sizing: border-box;
}

.renderBracket {
  border: 2px solid rgba(255, 180, 0, 0.55);
}

.visibleBracket {
  border: 2px solid rgba(0, 200, 0, 0.55);
}

.bLabel {
  position: sticky;
  top: 6px;
  margin: 6px 0 0 8px;
  display: inline-block;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

/* ====== 迷你地圖 ====== */
.minimap {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 12px;
  align-items: start;
}

.minimapTrack {
  position: relative;
  height: 320px;
  border-radius: 14px;
  border: 1px solid #e8e8e8;
  background: rgba(120, 120, 120, 0.08);
  /* 未渲染區 */
  overflow: hidden;
}

.minimapRender {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(255, 180, 0, 0.18);
  /* render window（含 overscan） */
  border-top: 1px solid rgba(255, 180, 0, 0.35);
  border-bottom: 1px solid rgba(255, 180, 0, 0.35);
}

.minimapVisible {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(0, 200, 0, 0.22);
  /* visible window */
  border-top: 1px solid rgba(0, 200, 0, 0.35);
  border-bottom: 1px solid rgba(0, 200, 0, 0.35);
}

.minimapInfo .line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed #f0f0f0;
}

.minimapInfo .label {
  color: #666;
}

.minimapInfo .val {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
</style>
