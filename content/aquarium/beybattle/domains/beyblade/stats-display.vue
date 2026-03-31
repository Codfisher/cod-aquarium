<template>
  <canvas
    ref="canvasRef"
    :width="size"
    :height="size"
    class="block"
  />
</template>

<script setup lang="ts">
import type { BeybladeStats } from '../../types'
import { onMounted, useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  stats: BeybladeStats;
  size?: number;
  color?: string;
}>(), {
  size: 160,
  color: '#ef4444',
})

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')

const labelList = ['ATK', 'DEF', 'STA', 'SPD']
const maxStatValue = 30

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: Number.parseInt(result[1], 16), g: Number.parseInt(result[2], 16), b: Number.parseInt(result[3], 16) }
    : { r: 239, g: 68, b: 68 }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return

  const center = props.size / 2
  const radius = props.size * 0.34
  const statValueList = [
    props.stats.attack,
    props.stats.defense,
    props.stats.stamina,
    props.stats.speed,
  ]
  const rgb = hexToRgb(props.color)

  context.clearRect(0, 0, props.size, props.size)

  // 背景六邊形網格（三層）
  for (let level = 1; level <= 3; level++) {
    const levelRadius = radius * (level / 3)
    context.beginPath()
    for (let i = 0; i <= 4; i++) {
      const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2
      const x = center + Math.cos(angle) * levelRadius
      const y = center + Math.sin(angle) * levelRadius
      if (i === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.closePath()
    context.strokeStyle = `rgba(255,255,255,${level === 3 ? 0.12 : 0.06})`
    context.lineWidth = 1
    context.stroke()
  }

  // 軸線（虛線風格）
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2
    context.beginPath()
    context.setLineDash([3, 4])
    context.moveTo(center, center)
    context.lineTo(
      center + Math.cos(angle) * radius,
      center + Math.sin(angle) * radius,
    )
    context.strokeStyle = 'rgba(255,255,255,0.06)'
    context.lineWidth = 1
    context.stroke()
    context.setLineDash([])
  }

  // 數值填充（漸層）
  context.beginPath()
  for (let i = 0; i <= 4; i++) {
    const index = i % 4
    const angle = (Math.PI * 2 * index) / 4 - Math.PI / 2
    const ratio = Math.min(statValueList[index] / maxStatValue, 1)
    const x = center + Math.cos(angle) * radius * ratio
    const y = center + Math.sin(angle) * radius * ratio
    if (i === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()

  const fillGradient = context.createRadialGradient(center, center, 0, center, center, radius)
  fillGradient.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`)
  fillGradient.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`)
  context.fillStyle = fillGradient
  context.fill()

  // 外框線
  context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.8)`
  context.lineWidth = 1.5
  context.stroke()

  // 頂點圓點
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2
    const ratio = Math.min(statValueList[i] / maxStatValue, 1)
    const x = center + Math.cos(angle) * radius * ratio
    const y = center + Math.sin(angle) * radius * ratio

    context.beginPath()
    context.arc(x, y, 3, 0, Math.PI * 2)
    context.fillStyle = props.color
    context.fill()

    // 發光
    context.beginPath()
    context.arc(x, y, 5, 0, Math.PI * 2)
    context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`
    context.fill()
  }

  // 標籤
  context.fillStyle = 'rgba(255,255,255,0.45)'
  context.font = "600 9px 'Rajdhani', sans-serif"
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.letterSpacing = '2px'
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2
    const labelRadius = radius + 14
    const x = center + Math.cos(angle) * labelRadius
    const y = center + Math.sin(angle) * labelRadius
    context.fillText(labelList[i], x, y)
  }
}

onMounted(() => draw())
watch(() => props.stats, () => draw(), { deep: true })
</script>
