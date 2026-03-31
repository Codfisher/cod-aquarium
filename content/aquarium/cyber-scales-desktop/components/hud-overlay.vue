<template>
  <div class="hud-overlay fixed inset-0 pointer-events-none z-[9990] font-orbitron">
    <!-- 左上：系統名稱 -->
    <div class="absolute top-3 left-4 flex items-center gap-2">
      <div class="corner-mark top-left" />
      <span class="hud-text text-[10px] tracking-[0.3em] opacity-15">
        CYBER SCALES v2.0
      </span>
    </div>

    <!-- 右上：即時時間 -->
    <div class="absolute top-3 right-4 flex items-center gap-2">
      <span
        class="hud-text text-[10px] tracking-[0.3em] opacity-15 tabular-nums"
        :class="{ 'time-flash': isTimeFlashing }"
      >
        {{ currentTime }}
      </span>
      <div class="corner-mark top-right" />
    </div>

    <!-- 左下：游標座標 + 視窗數量 -->
    <div class="absolute bottom-3 left-4 flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <div class="corner-mark bottom-left" />
        <span class="hud-text text-[10px] tracking-[0.2em] opacity-15 tabular-nums">
          CURSOR: {{ formattedMouseX }}, {{ formattedMouseY }}
        </span>
      </div>
      <span class="hud-text text-[10px] tracking-[0.2em] opacity-15 ml-4">
        ACTIVE: {{ activeWindowCount }} WINDOW{{ activeWindowCount !== 1 ? 'S' : '' }}
      </span>
    </div>

    <!-- 右下：系統狀態 -->
    <div class="absolute bottom-3 right-4 flex flex-col gap-1 items-end">
      <span class="hud-text text-[10px] tracking-[0.2em] opacity-15">
        SYS: NOMINAL
      </span>
      <div class="flex items-center gap-2">
        <span class="hud-text text-[10px] tracking-[0.2em] opacity-15 tabular-nums">
          FRAME: {{ fps }}fps
        </span>
        <div class="corner-mark bottom-right" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { throttleFilter, useMouse, useRafFn } from '@vueuse/core'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useAppStore } from '../stores/app-store'

const appStore = useAppStore()

// 游標位置
const mouse = useMouse({
  eventFilter: throttleFilter(100),
  type: 'client',
})
const formattedMouseX = computed(() =>
  String(Math.round(mouse.x.value)).padStart(4, '0'),
)
const formattedMouseY = computed(() =>
  String(Math.round(mouse.y.value)).padStart(4, '0'),
)

// 開啟的視窗數量
const activeWindowCount = computed(() => appStore.appList.length)

// 即時時間
const currentTime = ref('')
const isTimeFlashing = ref(false)

function updateTime() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  currentTime.value = `${year}.${month}.${day} | ${hours}:${minutes}:${seconds}`

  isTimeFlashing.value = true
  setTimeout(() => {
    isTimeFlashing.value = false
  }, 150)
}

updateTime()
const timeInterval = setInterval(updateTime, 1000)
onBeforeUnmount(() => clearInterval(timeInterval))

// FPS 計算
const fps = ref(60)
let frameCount = 0
let lastFpsTime = performance.now()

useRafFn(() => {
  frameCount++
  const now = performance.now()
  const elapsed = now - lastFpsTime

  if (elapsed >= 1000) {
    fps.value = Math.round((frameCount * 1000) / elapsed)
    frameCount = 0
    lastFpsTime = now
  }
})
</script>

<style scoped lang="sass">
.hud-text
  font-size: 10px
  text-shadow: 0 0 8px currentColor
  transition: opacity 0.15s ease

.time-flash
  opacity: 0.3 !important
  transition: opacity 0s

.corner-mark
  width: 6px
  height: 6px
  border-color: currentColor
  opacity: 0.12

.top-left
  border-left: 1px solid
  border-top: 1px solid

.top-right
  border-right: 1px solid
  border-top: 1px solid

.bottom-left
  border-left: 1px solid
  border-bottom: 1px solid

.bottom-right
  border-right: 1px solid
  border-bottom: 1px solid
</style>
