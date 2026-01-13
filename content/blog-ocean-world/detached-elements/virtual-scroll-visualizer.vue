<template>
  <div class="vs-root">
    <div
      ref="viewportRef"
      class="vs-viewport"
      :style="{ height: `${height}px` }"
      @scroll="onScroll"
    >
      <!-- Top spacer (not rendered region) -->
      <div
        class="vs-spacer vs-top"
        :style="{ height: `${topSpacerHeight}px` }"
      >
        <div v-if="topGhost.length" class="vs-ghost vs-ghost-bottom">
          <div
            v-for="i in topGhost"
            :key="`t${i}`"
            class="vs-ghost-row"
            :style="{ height: `${itemHeight}px` }"
          >
            <div class="vs-ghost-pill">
              {{ i }}
            </div>
          </div>
        </div>
      </div>

      <!-- Rendered region -->
      <div class="vs-items">
        <div
          v-for="i in renderedIndexes"
          :key="i"
          class="vs-row"
          :class="rowClass(i)"
          :style="{ height: `${itemHeight}px` }"
        >
          <div class="vs-pill">
            {{ i }}
          </div>
        </div>
      </div>

      <!-- Bottom spacer (not rendered region) -->
      <div
        class="vs-spacer vs-bottom"
        :style="{ height: `${bottomSpacerHeight}px` }"
      >
        <div v-if="bottomGhost.length" class="vs-ghost vs-ghost-top">
          <div
            v-for="i in bottomGhost"
            :key="`b${i}`"
            class="vs-ghost-row"
            :style="{ height: `${itemHeight}px` }"
          >
            <div class="vs-ghost-pill">
              {{ i }}
            </div>
          </div>
        </div>
      </div>

      <!-- Focus window overlay (center = "in-view", top/bottom = "preload") -->
      <div class="vs-overlay" aria-hidden="true">
        <div class="vs-mask vs-mask-top" :style="{ height: `${focusInset}px` }" />
        <div
          class="vs-focus-frame"
          :style="{
            top: `${focusInset}px`,
            height: `${Math.max(0, height - focusInset * 2)}px`,
          }"
        />
        <div class="vs-mask vs-mask-bottom" :style="{ height: `${focusInset}px` }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    total?: number;
    itemHeight?: number;
    height?: number;
    overscan?: number;
    focusInset?: number; // px
    ghostCount?: number;
  }>(),
  {
    total: 8000,
    itemHeight: 30,
    height: 380,
    overscan: 8,
    focusInset: 64,
    ghostCount: 10,
  },
)

const viewportRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const totalHeight = computed(() => Math.max(0, props.total * props.itemHeight))

const startIndex = computed(() => {
  const raw = Math.floor(scrollTop.value / props.itemHeight) - props.overscan
  return clamp(raw, 0, Math.max(0, props.total - 1))
})

const visibleCount = computed(() => Math.ceil(props.height / props.itemHeight) + props.overscan * 2)

const endIndex = computed(() => clamp(startIndex.value + visibleCount.value, 0, props.total))

const topSpacerHeight = computed(() => startIndex.value * props.itemHeight)

const bottomSpacerHeight = computed(() => {
  const bottom = totalHeight.value - endIndex.value * props.itemHeight
  return Math.max(0, bottom)
})

const renderedIndexes = computed(() => {
  const out: number[] = []
  for (let i = startIndex.value; i < endIndex.value; i++) out.push(i)
  return out
})

// ghost previews inside spacers (just a few rows near the boundary)
const topGhost = computed(() => {
  const from = Math.max(0, startIndex.value - props.ghostCount)
  const to = startIndex.value
  const out: number[] = []
  for (let i = from; i < to; i++) out.push(i)
  return out
})

const bottomGhost = computed(() => {
  const from = endIndex.value
  const to = Math.min(props.total, endIndex.value + props.ghostCount)
  const out: number[] = []
  for (let i = from; i < to; i++) out.push(i)
  return out
})

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  scrollTop.value = el.scrollTop
}

// classify rows by where they land inside the focus window overlay
function rowClass(index: number) {
  const top = index * props.itemHeight - scrollTop.value // position inside viewport
  const bottom = top + props.itemHeight

  const focusTop = props.focusInset
  const focusBottom = props.height - props.focusInset

  const intersectsFocus = bottom > focusTop && top < focusBottom
  return intersectsFocus ? 'vs-inview' : 'vs-preload'
}

function scrollToIndex(idx: number) {
  const el = viewportRef.value
  if (!el)
    return
  const i = clamp(idx, 0, Math.max(0, props.total - 1))
  el.scrollTop = i * props.itemHeight
  scrollTop.value = el.scrollTop
}

watch(
  () => [props.total, props.itemHeight, props.height] as const,
  async () => {
    await nextTick()
    const el = viewportRef.value
    if (!el)
      return
    const maxScroll = Math.max(0, totalHeight.value - props.height)
    el.scrollTop = clamp(el.scrollTop, 0, maxScroll)
    scrollTop.value = el.scrollTop
  },
)

onMounted(() => {
  scrollToIndex(Math.floor(props.total / 2))
})
</script>

<style scoped>
.vs-root {
  padding: 12px;
  background: #070b14;
  border-radius: 16px;
}

.vs-viewport {
  position: relative;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: #0b1220;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
}

/* Spacers = not rendered */
.vs-spacer {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.vs-top {
  background:
    repeating-linear-gradient(
      135deg,
      rgba(148, 163, 184, 0.10) 0px,
      rgba(148, 163, 184, 0.10) 8px,
      rgba(15, 23, 42, 0.0) 8px,
      rgba(15, 23, 42, 0.0) 16px
    ),
    linear-gradient(to bottom, rgba(59, 130, 246, 0.14), rgba(15, 23, 42, 0.0));
}

.vs-bottom {
  background:
    repeating-linear-gradient(
      135deg,
      rgba(148, 163, 184, 0.10) 0px,
      rgba(148, 163, 184, 0.10) 8px,
      rgba(15, 23, 42, 0.0) 8px,
      rgba(15, 23, 42, 0.0) 16px
    ),
    linear-gradient(to top, rgba(99, 102, 241, 0.14), rgba(15, 23, 42, 0.0));
}

/* Ghost preview rows inside spacers */
.vs-ghost {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}

.vs-ghost-bottom {
  bottom: 0;
}

.vs-ghost-top {
  top: 0;
}

.vs-ghost-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.vs-ghost-pill {
  margin-left: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.2px;
  color: rgba(226, 232, 240, 0.45);
  background: rgba(2, 6, 23, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.15);
  backdrop-filter: blur(2px);
}

/* Rendered rows */
.vs-items {
  width: 100%;
}

.vs-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(148, 163, 184, 0.10);
}

.vs-pill {
  margin-left: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.2px;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

/* In-view vs Preload (rendered but outside focus window) */
.vs-inview .vs-pill {
  color: rgba(226, 232, 240, 0.95);
  background: rgba(34, 197, 94, 0.14);
  border-color: rgba(34, 197, 94, 0.28);
}

.vs-preload {
  opacity: 0.62;
  filter: saturate(0.85);
}

.vs-preload .vs-pill {
  color: rgba(226, 232, 240, 0.85);
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.22);
}

/* Overlay: focus window + masks */
.vs-overlay {
  position: sticky;
  top: 0;
  height: 0; /* keeps overlay anchored */
  pointer-events: none;
  z-index: 3;
}

.vs-mask {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(2, 6, 23, 0.45);
  backdrop-filter: blur(1px);
}

.vs-mask-top {
  top: 0;
}

.vs-mask-bottom {
  bottom: 0;
  top: auto;
}

.vs-focus-frame {
  position: absolute;
  left: 6px;
  right: 6px;
  border-radius: 12px;
  border: 2px solid rgba(226, 232, 240, 0.22);
  box-shadow: inset 0 0 0 1px rgba(2, 6, 23, 0.35);
}
</style>
