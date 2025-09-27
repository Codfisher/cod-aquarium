<template>
  <div ref="wrapRef">
    <canvas
      ref="canvasRef"
      v-bind="canvasPixelSize"
      :style="canvasStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { useDevicePixelRatio, useElementSize, useRafFn } from '@vueuse/core'
import { computed, onBeforeMount, onMounted, reactive, useTemplateRef, watch } from 'vue'
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

// 量外層容器
const wrapSize = reactive(useElementSize(wrapRef))
const { pixelRatio } = useDevicePixelRatio()

const canvasPixelSize = computed(() => ({
  width: wrapSize.width * pixelRatio.value,
  height: wrapSize.height * pixelRatio.value,
}))

const canvasStyle = computed(() => ({
  width: `${wrapSize.width}px`,
  height: `${wrapSize.height}px`,
}))

let illo: InstanceType<typeof Illustration> | undefined
let fishList: Fish[] = []

function createFish(illoValue: InstanceType<typeof Illustration>, position: Position): Fish {
  const thickness = props.size / 5
  const group = new Group({ addTo: illoValue, translate: position })

  const body = new Ellipse({
    addTo: group,
    width: props.size,
    height: props.size * 0.6,
    stroke: thickness,
    color: '#bfebff',
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
    color: '#bfebff',
    fill: true,
  })

  return group
}

onMounted(() => {
  if (!canvasRef.value)
    return
  illo = new Illustration({ element: canvasRef.value })
  // 依 DPR 重新 scale 一次（之後有尺寸或 DPR 變動會再做）
  rescaleContext()
})

onBeforeMount(() => {
  illo?.remove()
})

function rescaleContext() {
  const el = canvasRef.value
  if (!el)
    return
  const ctx = el.getContext('2d')
  if (!ctx)
    return
  // 重置再按 DPR scale
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(pixelRatio.value, pixelRatio.value)
}

watch(() => [wrapSize.width, wrapSize.height, pixelRatio], () => {
  // 當外層尺寸或 DPR 變動時，重設 2D context 的 scale
  rescaleContext()
  illo?.updateRenderGraph()
}, {
  deep: true,
})

watch(() => props.boidCount, (count, oldCount) => {
  const diff = count - oldCount
  if (diff > 0 && illo) {
    for (let i = 0; i < diff; i++) {
      const boid = props.boidList[oldCount + i]
      if (boid) {
        fishList.push(createFish(illo, boid.position))
      }
    }
  }
})

useRafFn(() => {
  const illoValue = illo
  if (fishList.length === 0 && illoValue && props.boidList.length) {
    fishList = props.boidList.map((boid) => createFish(illoValue, boid.position))
  }

  props.boidList.forEach((boid, i) => {
    const fish = fishList[i]
    if (!fish)
      return
    fish.translate.set(boid.position)
    const scale = 1 + boid.position.z / 500
    fish.scale.set({ x: scale, y: scale, z: scale })
    fish.rotate.z = boid.pitch
    fish.rotate.y = -boid.yaw
  })

  if (canvasRef.value instanceof HTMLCanvasElement) {
    const ctx = canvasRef.value.getContext('2d')!
    ctx.clearRect(0, 0, canvasPixelSize.value.width, canvasPixelSize.value.height)
  }
  illo?.updateRenderGraph()
})
</script>

<style scoped></style>
