<template>
  <div ref="wrapRef">
    <canvas
      ref="canvasRef"
      :width="canvasWidth"
      :height="canvasHeight"
      :style="canvasStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { useDevicePixelRatio, useElementSize, useRafFn } from '@vueuse/core'
import { computed, onBeforeMount, onMounted, reactive, toRaw, useTemplateRef, watch } from 'vue'
import Zdog from 'zdog'

interface Position { x: number; y: number; z: number }
type Fish = InstanceType<typeof Zdog.Group>

interface Props {
  mouse: { x: number; y: number };
  size?: number;
  boidCount: number;
  boidList: Array<{ position: Position; yaw: number; pitch: number }>;
}
const props = withDefaults(defineProps<Props>(), { size: 15 })

const { Illustration, Group, Ellipse, Shape } = Zdog

const wrapRef = useTemplateRef('wrapRef')
const canvasRef = useTemplateRef('canvasRef')

const wrapSize = reactive(useElementSize(wrapRef))
const { pixelRatio } = useDevicePixelRatio()
const dpr = computed(() => Math.min(pixelRatio.value, 2))

const canvasWidth = computed(() => wrapSize.width * dpr.value)
const canvasHeight = computed(() => wrapSize.height * dpr.value)

const canvasStyle = computed(() => ({
  width: `${wrapSize.width}px`,
  height: `${wrapSize.height}px`,
}))

let illo: InstanceType<typeof Illustration> | undefined
const fishList: Fish[] = []

function createFish(
  illoValue: InstanceType<typeof Illustration>,
  position: Position,
  isFirst = false,
): Fish {
  const color = isFirst ? '#ffd752' : '#bfebff'
  const thickness = props.size / 5
  const group = new Group({ addTo: illoValue, translate: position })

  const body = new Ellipse({
    addTo: group,
    width: props.size,
    height: props.size * 0.6,
    stroke: thickness,
    color,
    fill: true,
  })

  const eye = new Ellipse({
    addTo: group,
    width: props.size / 10,
    height: props.size / 10,
    color: '#072c4a',
    translate: { x: props.size / 4, y: props.size / -20, z: thickness / 2 + 1 },
    fill: true,
    backface: false,
  })
  eye.copy({
    translate: { x: props.size / 4, y: props.size / -20, z: thickness / -2 - 1 },
    rotate: { x: Math.PI },
  })

  const tail = new Shape({
    addTo: group,
    path: [
      { x: props.size / -2, y: 0 },
      { x: props.size / -2 - thickness * 1.5, y: -thickness },
      { x: props.size / -2 - thickness * 1.5, y: thickness },
      { x: props.size / -2, y: 0 },
    ],
    closed: false,
    stroke: thickness,
    color,
    fill: true,
  })

  return group
}

onMounted(() => {
  if (!canvasRef.value)
    return

  illo = new Illustration({
    element: canvasRef.value,
    resize: false,
  })

  rescaleContext()

  syncFishCount(props.boidCount)
})

onBeforeMount(() => {
  // 清理
  illo?.remove()
  fishList.length = 0
})

function rescaleContext() {
  const el = canvasRef.value
  if (!el || !illo)
    return
  const ctx = el.getContext('2d')
  if (!ctx)
    return

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr.value, dpr.value)
}

watch(() => [wrapSize.width, wrapSize.height, dpr.value], () => {
  rescaleContext()
  illo?.updateRenderGraph()
}, { deep: true })

// 同步魚群數量
function syncFishCount(count: number) {
  if (!illo)
    return

  const currentLen = fishList.length
  const diff = count - currentLen

  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      const boidIndex = currentLen + i
      const boid = props.boidList[boidIndex]
      if (boid) {
        const isFirst = fishList.length === 0
        fishList.push(createFish(illo, boid.position, isFirst))
      }
    }
  }
  else if (diff < 0) {
    // 從尾端開始移除 Zdog 物件
    for (let i = currentLen - 1; i >= count; i--) {
      const fish = fishList[i]
      fish?.remove()
    }
    fishList.length = count
  }
}

watch(() => props.boidCount, (newCount) => {
  syncFishCount(newCount)
})

useRafFn(() => {
  if (!illo || !canvasRef.value)
    return

  // 使用 toRaw 獲取原始資料，避免高頻迴圈中觸發 Vue 的 Proxy Getter，提升效能
  const rawList = toRaw(props.boidList)
  const len = Math.min(rawList.length, fishList.length)

  for (let i = 0; i < len; i++) {
    const fish = fishList[i]!
    const boid = rawList[i]!

    fish.translate.set(boid.position)

    const scale = 1 + boid.position.z / 500
    fish.scale.set({ x: scale, y: scale, z: scale })

    fish.rotate.z = boid.pitch
    fish.rotate.y = -boid.yaw
  }

  const ctx = canvasRef.value.getContext('2d')!
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)

  illo.updateRenderGraph()
})
</script>

<style scoped></style>
