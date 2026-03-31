<template>
  <div class="cursor-effects fixed inset-0 pointer-events-none z-99998">
    <canvas
      ref="trailCanvasRef"
      class="absolute inset-0 w-full h-full"
    />

    <!-- 點擊波紋（六角形） -->
    <svg
      v-for="ripple in rippleList"
      :key="ripple.id"
      class="click-ripple absolute"
      :style="{
        left: `${ripple.x}px`,
        top: `${ripple.y}px`,
        transform: 'translate(-50%, -50%)',
      }"
      width="80"
      height="80"
      viewBox="-40 -40 80 80"
    >
      <!-- 外圈六角形 -->
      <polygon
        :points="hexagonPointList"
        fill="none"
        :stroke="brandColor"
        stroke-width="1"
        :style="{
          opacity: ripple.outerOpacity,
          transform: `scale(${ripple.outerScale}) rotate(${ripple.outerRotation}deg)`,
          transformOrigin: 'center',
        }"
      />
      <!-- 內圈六角形 -->
      <polygon
        :points="hexagonPointList"
        fill="none"
        :stroke="brandColor"
        stroke-width="0.8"
        :style="{
          opacity: ripple.innerOpacity,
          transform: `scale(${ripple.innerScale}) rotate(${ripple.innerRotation}deg)`,
          transformOrigin: 'center',
        }"
      />
    </svg>

    <!-- 右鍵波紋（菱形） -->
    <svg
      v-for="ripple in contextRippleList"
      :key="ripple.id"
      class="click-ripple absolute"
      :style="{
        left: `${ripple.x}px`,
        top: `${ripple.y}px`,
        transform: 'translate(-50%, -50%)',
      }"
      width="80"
      height="80"
      viewBox="-40 -40 80 80"
    >
      <polygon
        points="0,-25 25,0 0,25 -25,0"
        fill="none"
        :stroke="brandColor"
        stroke-width="1"
        :style="{
          opacity: ripple.outerOpacity,
          transform: `scale(${ripple.outerScale}) rotate(${ripple.outerRotation}deg)`,
          transformOrigin: 'center',
        }"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { throttleFilter, useMouse, useRafFn } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'

const brandColor = 'rgba(100, 100, 100, 0.5)'
const trailColor = 'rgba(120, 120, 120, 0.4)'

// 六角形頂點
const hexagonPointList = Array.from({ length: 6 }, (_, i) => {
  const angle = (Math.PI / 3) * i - Math.PI / 2
  return `${Math.cos(angle) * 25},${Math.sin(angle) * 25}`
}).join(' ')

// 游標光跡
const trailCanvasRef = useTemplateRef('trailCanvasRef')

interface TrailPoint {
  x: number;
  y: number;
  age: number;
  opacity: number;
  size: number;
}

const trailPointList: TrailPoint[] = []
const maxTrailLength = 8
const trailMaxAge = 300

const mouse = useMouse({
  eventFilter: throttleFilter(16),
  type: 'client',
})

let lastTrailX = 0
let lastTrailY = 0

useRafFn(() => {
  const canvas = trailCanvasRef.value
  if (!canvas) {
    return
  }

  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  // 確保 canvas 尺寸正確
  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  const currentX = mouse.x.value
  const currentY = mouse.y.value

  // 只在移動足夠距離時新增點
  const deltaX = currentX - lastTrailX
  const deltaY = currentY - lastTrailY
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

  if (distance > 8) {
    trailPointList.push({
      x: currentX,
      y: currentY,
      age: 0,
      opacity: 0.6,
      size: 3,
    })
    lastTrailX = currentX
    lastTrailY = currentY

    // 限制長度
    while (trailPointList.length > maxTrailLength) {
      trailPointList.shift()
    }
  }

  // 清除畫布
  context.clearRect(0, 0, canvas.width, canvas.height)

  // 更新並繪製光跡
  for (let i = trailPointList.length - 1; i >= 0; i--) {
    const point = trailPointList[i]
    if (!point) {
      continue
    }

    point.age += 16
    point.opacity = Math.max(0, 0.6 * (1 - point.age / trailMaxAge))
    point.size = Math.max(0.5, 3 * (1 - point.age / trailMaxAge))

    if (point.age >= trailMaxAge) {
      trailPointList.splice(i, 1)
      continue
    }

    context.beginPath()
    context.arc(point.x, point.y, point.size, 0, Math.PI * 2)
    context.fillStyle = trailColor
    context.globalAlpha = point.opacity
    context.fill()
  }

  context.globalAlpha = 1
})

// 點擊波紋
interface Ripple {
  id: string;
  x: number;
  y: number;
  outerScale: number;
  outerOpacity: number;
  outerRotation: number;
  innerScale: number;
  innerOpacity: number;
  innerRotation: number;
  startTime: number;
}

const rippleList = shallowRef<Ripple[]>([])
const contextRippleList = shallowRef<Ripple[]>([])

function createRipple(x: number, y: number, isContext = false) {
  const ripple: Ripple = {
    id: nanoid(),
    x,
    y,
    outerScale: 0.2,
    outerOpacity: 0.6,
    outerRotation: 0,
    innerScale: 0.1,
    innerOpacity: 0.5,
    innerRotation: 0,
    startTime: performance.now(),
  }

  if (isContext) {
    contextRippleList.value = [...contextRippleList.value, ripple]
  }
  else {
    rippleList.value = [...rippleList.value, ripple]
  }
}

function handleClick(event: MouseEvent) {
  createRipple(event.clientX, event.clientY, false)
}

function handleContextMenu(event: MouseEvent) {
  createRipple(event.clientX, event.clientY, true)
}

// 動畫更新波紋
useRafFn(() => {
  const now = performance.now()
  const duration = 400

  function updateRippleList(list: Ripple[]): Ripple[] {
    return list
      .filter((ripple) => now - ripple.startTime < duration)
      .map((ripple) => {
        const elapsed = now - ripple.startTime
        const progress = elapsed / duration
        const easeOut = 1 - (1 - progress) ** 3

        return {
          ...ripple,
          outerScale: 0.2 + easeOut * 1.2,
          outerOpacity: 0.6 * (1 - progress),
          outerRotation: easeOut * 15,
          innerScale: 0.1 + easeOut * 0.9,
          innerOpacity: 0.5 * (1 - Math.min(1, (elapsed - 100) / (duration - 100))),
          innerRotation: easeOut * -10,
        }
      })
  }

  rippleList.value = updateRippleList(rippleList.value)
  contextRippleList.value = updateRippleList(contextRippleList.value)
})

onMounted(() => {
  window.addEventListener('click', handleClick)
  window.addEventListener('contextmenu', handleContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClick)
  window.removeEventListener('contextmenu', handleContextMenu)
})
</script>

<style scoped lang="sass">
.click-ripple
  pointer-events: none
</style>
