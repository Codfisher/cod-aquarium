<template>
  <div class="stats-root" :style="{ width: `${size}px`, height: `${size}px` }">
    <canvas
      ref="canvasRef"
      :width="size"
      :height="size"
      class="stats-canvas"
    />

    <!-- 標籤 + Tooltip（HTML overlay） -->
    <div
      v-for="(label, index) in labelList"
      :key="label.key"
      class="stats-label"
      :style="getLabelStyle(index)"
      :title="label.tooltip"
    >
      <span class="stats-label__text">{{ label.key }}</span>
      <span class="stats-label__value">{{ statValueList[index] }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BeybladeStats } from '../../types'
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import { useSimpleI18n } from '../../composables/use-simple-i18n'

const props = withDefaults(defineProps<{
  stats: BeybladeStats;
  size?: number;
  color?: string;
}>(), {
  size: 160,
  color: '#ef4444',
})

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')

const { t } = useSimpleI18n({
  'zh-hant': {
    atkTooltip: '攻擊力：碰撞時擊飛對手的力量',
    defTooltip: '防禦力：抵抗被擊飛的能力',
    staTooltip: '持久力：轉速衰減越慢，存活越久',
    spdTooltip: '速度：場地上的移動速率',
    crtTooltip: '爆擊率：每點 = 3% 機率觸發雙倍傷害',
  },
  'en': {
    atkTooltip: 'Attack: knockback force on collision',
    defTooltip: 'Defense: resistance to being knocked back',
    staTooltip: 'Stamina: slower spin decay, longer survival',
    spdTooltip: 'Speed: movement speed in arena',
    crtTooltip: 'Critical: 3% per point for 2x damage hit',
  },
} as const)

const labelList = computed(() => [
  { key: 'ATK', tooltip: t('atkTooltip') },
  { key: 'DEF', tooltip: t('defTooltip') },
  { key: 'STA', tooltip: t('staTooltip') },
  { key: 'SPD', tooltip: t('spdTooltip') },
  { key: 'CRT', tooltip: t('crtTooltip') },
])

const maxStatValue = 30
const maxCriticalValue = 10
const axisCount = 5

const statValueList = computed(() => [
  props.stats.attack,
  props.stats.defense,
  props.stats.stamina,
  props.stats.speed,
  props.stats.critical,
])

const maxValueList = [
  maxStatValue, maxStatValue, maxStatValue, maxStatValue, maxCriticalValue,
]

function getLabelStyle(index: number) {
  const center = props.size / 2
  const labelRadius = props.size * 0.34 + 18
  const angle = (Math.PI * 2 * index) / axisCount - Math.PI / 2
  const x = center + Math.cos(angle) * labelRadius
  const y = center + Math.sin(angle) * labelRadius
  return {
    left: `${x}px`,
    top: `${y}px`,
  }
}

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
  const rgb = hexToRgb(props.color)

  context.clearRect(0, 0, props.size, props.size)

  // 背景網格（三層）
  for (let level = 1; level <= 3; level++) {
    const levelRadius = radius * (level / 3)
    context.beginPath()
    for (let i = 0; i <= axisCount; i++) {
      const angle = (Math.PI * 2 * i) / axisCount - Math.PI / 2
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

  // 軸線
  for (let i = 0; i < axisCount; i++) {
    const angle = (Math.PI * 2 * i) / axisCount - Math.PI / 2
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

  // 數值填充
  context.beginPath()
  for (let i = 0; i <= axisCount; i++) {
    const index = i % axisCount
    const angle = (Math.PI * 2 * index) / axisCount - Math.PI / 2
    const ratio = Math.min(statValueList.value[index] / maxValueList[index], 1)
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

  context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.8)`
  context.lineWidth = 1.5
  context.stroke()

  // 頂點圓點
  for (let i = 0; i < axisCount; i++) {
    const angle = (Math.PI * 2 * i) / axisCount - Math.PI / 2
    const ratio = Math.min(statValueList.value[i] / maxValueList[i], 1)
    const x = center + Math.cos(angle) * radius * ratio
    const y = center + Math.sin(angle) * radius * ratio

    context.beginPath()
    context.arc(x, y, 3, 0, Math.PI * 2)
    context.fillStyle = props.color
    context.fill()

    context.beginPath()
    context.arc(x, y, 5, 0, Math.PI * 2)
    context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`
    context.fill()
  }
}

onMounted(() => draw())
watch(() => props.stats, () => draw(), { deep: true })
</script>

<style lang="sass" scoped>
.stats-root
  position: relative

.stats-canvas
  display: block

.stats-label
  position: absolute
  transform: translate(-50%, -50%)
  display: flex
  flex-direction: column
  align-items: center
  gap: 1px
  cursor: help
  user-select: none
  transition: opacity 0.2s ease

  &:hover
    opacity: 1 !important

    .stats-label__text
      color: rgba(255,255,255,0.8)

    .stats-label__value
      color: rgba(255,255,255,0.6)

  &__text
    font-family: 'Rajdhani', sans-serif
    font-weight: 700
    font-size: 0.5rem
    letter-spacing: 0.15em
    color: rgba(255,255,255,0.4)
    transition: color 0.2s ease

  &__value
    font-family: 'Orbitron', sans-serif
    font-weight: 600
    font-size: 0.55rem
    color: rgba(255,255,255,0.3)
    transition: color 0.2s ease
</style>
