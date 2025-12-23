<template>
  <div class="space-y-4">
    <label class="inline-flex items-center select-none p-4 px-5 cursor-pointer border-3 border-gray-200 rounded-lg w-full">
      <input
        v-model="overlayVisible"
        type="checkbox"
        class="mr-2"
      >
      顯示可視區域疊圖（Viewport / 每層 scroll / 交集）
    </label>

    <!-- scroll 結構 -->
    <div
      ref="outerRef"
      class="h-[20vh] overflow-y-auto p-14 pl-6 rounded-lg border-3 border-gray-100"
    >
      <div
        ref="middleRef"
        class="w-full h-[25vh] overflow-y-auto p-14 pl-6 rounded-lg border-3 border-gray-200"
      >
        <div
          ref="innerRef"
          class="h-[30vh] overflow-y-auto  border-3 rounded-lg p-14 pl-6 border-gray-300"
        >
          <div
            ref="stickyRef"
            class="sticky top-0 text-center p-4 rounded-lg bg-blue-400 text-white "
          >
            我是內容 ヽ(́◕◞౪◟◕‵)ﾉ
          </div>
        </div>
      </div>
    </div>

    <div
      class="overlay-root transition-opacity duration-300"
      :class="{ 'opacity-0': !overlayVisible }"
    >
      <!-- 每層 scroll 容器的可視框 -->
      <div
        class="box box-outer"
        :style="rectStyle(state.outer)"
      >
        <div class="label">
          outer scroll visible
        </div>
      </div>
      <div
        class="box box-middle"
        :style="rectStyle(state.middle)"
      >
        <div class="label">
          middle scroll visible
        </div>
      </div>
      <div
        class="box box-inner"
        :style="rectStyle(state.inner)"
      >
        <div class="label">
          inner scroll visible
        </div>
      </div>

      <!-- 交集（真正有效可視區） -->
      <div
        class="box box-effective"
        :style="rectStyle(effectiveRect)"
      >
        <div class="label translate-y-[106%]">
          有效可視區
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef } from 'vue'

interface RectLike { top: number; left: number; right: number; bottom: number; width: number; height: number }

function viewportRect(): RectLike {
  return {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function intersectRect(a: RectLike, b: RectLike): RectLike {
  const top = Math.max(a.top, b.top)
  const left = Math.max(a.left, b.left)
  const bottom = Math.min(a.bottom, b.bottom)
  const right = Math.min(a.right, b.right)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  return { top, left, bottom, right, width, height }
}

function toRectLike(el: Element | null): RectLike | null {
  if (!el)
    return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  }
}

const outerRef = useTemplateRef('outerRef')
const middleRef = useTemplateRef('middleRef')
const innerRef = useTemplateRef('innerRef')
const stickyRef = useTemplateRef('stickyRef')

const overlayVisible = ref(false)

const state = reactive({
  vp: viewportRect() as RectLike,
  outer: null as RectLike | null,
  middle: null as RectLike | null,
  inner: null as RectLike | null,
  sticky: null as RectLike | null,
})

const effectiveRect = computed(() => {
  let r = state.vp
  if (state.outer)
    r = intersectRect(r, state.outer)
  if (state.middle)
    r = intersectRect(r, state.middle)
  if (state.inner)
    r = intersectRect(r, state.inner)
  return r
})

let raf = 0
function update() {
  if (raf)
    return
  raf = requestAnimationFrame(() => {
    raf = 0
    state.vp = viewportRect()
    state.outer = toRectLike(outerRef.value)
    state.middle = toRectLike(middleRef.value)
    state.inner = toRectLike(innerRef.value)
    state.sticky = toRectLike(stickyRef.value)
  })
}

function onScrollAny() {
  update()
}

useEventListener(document, 'scroll', onScrollAny, { passive: true, capture: true })
useEventListener(window, 'resize', update, { passive: true })

onBeforeUnmount(() => {
  if (raf)
    cancelAnimationFrame(raf)
})

// 畫框用：把 Rect 轉成 style
function rectStyle(r: RectLike | null) {
  if (!r)
    return {}
  return {
    top: `${r.top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  }
}
</script>

<style scoped>
.overlay-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
}

.box {
  position: fixed;
  box-sizing: border-box;
  border-radius: 8px;
  border: 2px solid;
  background: rgba(0, 0, 0, 0.03);
}

.label {
  position: absolute;
  top: -30px;
  left: 0;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
}

/* 每個框用不同顏色，方便分辨 */
.box-vp {
  border-color: #111827;
}

.box-outer {
  border-color: #ef4444;
}

.box-middle {
  border-color: #f59e0b;
}

.box-inner {
  border-color: #10b981;
}

.box-effective {
  border-color: #3b82f6;
}
</style>
