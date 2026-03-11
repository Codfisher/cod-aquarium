<template>
  <div class="flex flex-col gap-4">
    <div class="text-sm font-medium">
      Debug：追蹤 ref 與 ResizeObserver 行為
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <label class="shrink-0 text-sm">
        調整寬度
      </label>

      <u-slider
        v-model="resizePercent"
        :min="50"
        :max="100"
        class="flex-1 accent-primary"
      />
    </div>

    <div class="text-xs opacity-50">
      步驟：1. 拖曳寬度 → 2. 右鍵開啟選單 → 3. 再拖曳寬度，觀察哪些 observer 停止觸發
    </div>

    <div
      class="transition-all"
      :style="{ width: `${resizePercent}%` }"
    >
      <u-context-menu :items="menuItems">
        <div
          ref="targetRef"
          class="w-full h-20 rounded-lg border border-black/5 dark:border-white/5 bg-primary/10 flex items-center justify-center text-sm"
        >
          沒有 v-once
        </div>
      </u-context-menu>
    </div>

    <!-- log 輸出 -->
    <div class="flex flex-col gap-1 max-h-80 overflow-y-auto rounded-lg bg-black/5 dark:bg-white/5 p-3">
      <div class="text-xs font-medium opacity-50 mb-1">
        事件 Log（新的在上面）
      </div>
      <div
        v-for="(log, index) in logs"
        :key="index"
        class="text-xs font-mono"
        :class="{
          'text-red-500': log.type === 'error',
          'text-yellow-500': log.type === 'warn',
          'text-green-500': log.type === 'success',
          'text-blue-500': log.type === 'native',
          'opacity-60': log.type === 'info',
        }"
      >
        {{ log.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui/.'
import { useElementSize, useResizeObserver } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

const targetRef = useTemplateRef('targetRef')

interface LogEntry {
  type: 'info' | 'warn' | 'error' | 'success' | 'native';
  message: string;
}

const logs = ref<LogEntry[]>([])

function addLog(type: LogEntry['type'], message: string) {
  logs.value.unshift({ type, message })
  if (logs.value.length > 80) {
    logs.value.length = 80
  }
}

// ===== 1. 追蹤 ref 變化（sync watcher 捕捉中間狀態） =====
let previousElement: HTMLElement | null = null
watch(targetRef, (newElement) => {
  const isSameDOM = newElement === previousElement
  if (newElement === null) {
    addLog('warn', `ref → null`)
  }
  else {
    addLog(
      isSameDOM ? 'info' : 'error',
      `ref → element（${isSameDOM ? '同一個 DOM ✓' : '不同的 DOM ✗'}）`,
    )
  }
  if (newElement) {
    previousElement = newElement
  }
}, { flush: 'sync' })

// ===== 2. VueUse useResizeObserver =====
let vueUseCount = 0
useResizeObserver(targetRef, () => {
  vueUseCount++
  addLog('info', `[VueUse useResizeObserver] 觸發 #${vueUseCount}`)
})

// ===== 3. VueUse useElementSize =====
const elementSize = useElementSize(targetRef)
watch(() => elementSize.width.value, (width) => {
  if (width > 0) {
    addLog('success', `[VueUse useElementSize] width = ${Math.round(width)}`)
  }
})

// ===== 4. 原生 ResizeObserver（完全繞過 VueUse） =====
let nativeObserver: ResizeObserver | null = null
let nativeCount = 0

watch(targetRef, (element) => {
  if (!element)
    return

  // 只在第一次綁定，之後不再重建
  if (nativeObserver)
    return

  nativeObserver = new ResizeObserver(() => {
    nativeCount++
    addLog('native', `[原生 ResizeObserver] 觸發 #${nativeCount}`)
  })
  nativeObserver.observe(element)
}, { immediate: true })

onBeforeUnmount(() => {
  nativeObserver?.disconnect()
})

// ===== 控制 =====
const resizePercent = ref(100)

const menuItems = computed<ContextMenuItem[][]>(() => [
  [
    { label: 'Action A', icon: 'material-symbols:select-all-rounded' },
    { label: 'Action B', icon: 'material-symbols:flip-camera-ios-outline-rounded' },
  ],
])
</script>
