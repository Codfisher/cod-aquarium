<template>
  <div class="grid-pulse fixed inset-0 pointer-events-none z-[-1]">
    <canvas
      ref="canvasRef"
      class="w-full h-full"
    />
  </div>
</template>

<script setup lang="ts">
import { useRafFn } from '@vueuse/core'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useAppStore } from '../stores/app-store'

const canvasRef = useTemplateRef('canvasRef')
const appStore = useAppStore()

const gridSpacing = 45
const gridColor = { r: 140, g: 140, b: 140 }
const baseOpacity = 0.06

interface Pulse {
  centerX: number;
  centerY: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  speed: number;
  isTriggered: boolean;
}

const pulseList: Pulse[] = []
let lastAutoTime = 0
const autoPulseInterval = 7000

// 監聽視窗開啟事件，觸發互動脈衝
let previousAppCount = 0
watch(() => appStore.appList.length, (count) => {
  if (count > previousAppCount) {
    // 找到最新開啟的 app 的位置
    const latestApp = appStore.appList[appStore.appList.length - 1]
    if (latestApp) {
      const data = latestApp.data
      const centerX = data.x + data.width / 2
      const centerY = data.y + data.height / 2
      addPulse(centerX || window.innerWidth / 2, centerY || window.innerHeight / 2, true)
    }
  }
  previousAppCount = count
})

function addPulse(x: number, y: number, isTriggered = false) {
  const maxDimension = Math.max(window.innerWidth, window.innerHeight)

  pulseList.push({
    centerX: x,
    centerY: y,
    radius: 0,
    maxRadius: maxDimension * 1.2,
    opacity: isTriggered ? 0.25 : 0.15,
    speed: isTriggered ? 4 : 3,
    isTriggered,
  })
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  const { r, g, b } = gridColor

  context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${baseOpacity})`
  context.lineWidth = 0.5

  // 垂直線
  context.beginPath()
  for (let x = 0; x <= width; x += gridSpacing) {
    context.moveTo(x, 0)
    context.lineTo(x, height)
  }
  context.stroke()

  // 水平線
  context.beginPath()
  for (let y = 0; y <= height; y += gridSpacing) {
    context.moveTo(0, y)
    context.lineTo(width, y)
  }
  context.stroke()
}

function drawPulseList(context: CanvasRenderingContext2D, width: number, height: number) {
  const { r, g, b } = gridColor

  for (let i = pulseList.length - 1; i >= 0; i--) {
    const pulse = pulseList[i]
    if (!pulse) {
      continue
    }

    pulse.radius += pulse.speed

    // 計算脈衝帶的範圍
    const ringWidth = 120
    const innerRadius = Math.max(0, pulse.radius - ringWidth)
    const outerRadius = pulse.radius

    // 遍歷網格交叉點，高亮在脈衝帶內的線段
    const pulseOpacity = pulse.opacity * (1 - pulse.radius / pulse.maxRadius)

    if (pulseOpacity <= 0.01 || pulse.radius > pulse.maxRadius) {
      pulseList.splice(i, 1)
      continue
    }

    // 繪製被脈衝高亮的網格線段
    context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${pulseOpacity})`
    context.lineWidth = 0.8

    // 垂直線段高亮
    context.beginPath()
    for (let x = 0; x <= width; x += gridSpacing) {
      for (let y = 0; y <= height; y += gridSpacing) {
        const deltaX = x - pulse.centerX
        const deltaY = y - pulse.centerY
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

        if (distance >= innerRadius && distance <= outerRadius) {
          // 在脈衝帶內，繪製這個交叉點附近的線段
          const segmentLength = gridSpacing * 0.5
          const localOpacity = 1 - Math.abs(distance - (innerRadius + ringWidth / 2)) / (ringWidth / 2)

          context.globalAlpha = localOpacity
          // 水平短線段
          context.moveTo(x - segmentLength / 2, y)
          context.lineTo(x + segmentLength / 2, y)
          // 垂直短線段
          context.moveTo(x, y - segmentLength / 2)
          context.lineTo(x, y + segmentLength / 2)
        }
      }
    }
    context.stroke()
    context.globalAlpha = 1
  }
}

useRafFn(() => {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  // 確保 canvas 尺寸
  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  // 自動脈衝
  const now = performance.now()
  if (now - lastAutoTime > autoPulseInterval) {
    addPulse(window.innerWidth / 2, window.innerHeight / 2)
    lastAutoTime = now
  }

  // 清除
  context.clearRect(0, 0, canvas.width, canvas.height)

  // 繪製基底網格
  drawGrid(context, canvas.width, canvas.height)

  // 繪製脈衝
  drawPulseList(context, canvas.width, canvas.height)
})
</script>

<style scoped lang="sass">
</style>
