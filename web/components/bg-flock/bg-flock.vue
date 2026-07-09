<template>
  <div
    ref="sceneRef"
    class="relative h-full w-full"
  >
    <canvas
      ref="canvasRef"
      class="absolute top-0 left-0"
      :width="canvasWidth"
      :height="canvasHeight"
      :style="canvasStyle"
    />
  </div>
</template>

<script setup lang="ts">
import type { BoidOptions } from './boid'
import type { BehaviorRadii, BehaviorWeights } from './flock'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { useDevicePixelRatio, useElementSize, useEventListener, useIntersectionObserver, useMouse, useRafFn, useWindowFocus } from '@vueuse/core'
import { useData } from 'vitepress'
import { computed, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { FishShaderRenderer } from './fish-shader-renderer'
import { Flock } from './flock'
import { FlockRenderer } from './flock-renderer'

// #region Props
interface Props {
  /** boid 數量，變更時會差量增減 */
  count?: number;
  /** 小魚尺寸 */
  size?: number;
  /** 速度倍率 */
  playbackRate?: number;
  /** 是否運轉動畫。false 時暫停模擬與繪製，
   * 供外部（例如元件不在視野內時）徹底停止消耗 CPU
   */
  active?: boolean;

  boidOptions?: Partial<Pick<
    BoidOptions,
    'maxForce' | 'maxSpeed' | 'angSmooth'
  >>;
  /** 行為權重 */
  behaviorWeights?: BehaviorWeights;
  /** 行為半徑，決定特定行為的考量範圍 */
  behaviorRadii?: BehaviorRadii;
  /** Shell 模式，用於模擬魚環繞特定目標成球的樣子
   *
   * 無則維持原本單點 target 的行為
   */
  targetShell?: {
    radius: number;
    band: number;
    swirlSpeed: number;
  };
}
// #endregion Props
const props = withDefaults(defineProps<Props>(), {
  count: 150,
  size: 15,
  playbackRate: 1,
  active: true,
  targetShell: () => ({
    radius: 120,
    band: 50,
    swirlSpeed: -0.5,
  }),
})

const sceneRef = useTemplateRef('sceneRef')
const canvasRef = useTemplateRef('canvasRef')

const sceneSize = reactive(useElementSize(sceneRef))
const isFocused = useWindowFocus()
const { pixelRatio } = useDevicePixelRatio()

const visible = ref(true)
useIntersectionObserver(sceneRef, ([entry]) => {
  visible.value = entry?.isIntersecting || false
})

/** 滑鼠追蹤用 useMouse（含觸控），不能用 useMouseInElement——
 * 後者每次 mousemove 都呼叫 getClientRects() 強制重算 layout，
 * 滑鼠移動時（也就是魚群轉彎的時機）會在主執行緒造成掉幀。
 * type: 'client' 取視窗座標，與快取的 getBoundingClientRect 同座標系
 */
const mouse = reactive(useMouse({
  type: 'client',
  initialValue: { x: Number.NaN, y: Number.NaN },
}))

let sceneRectCache: DOMRect | undefined
function invalidateSceneRect() {
  sceneRectCache = undefined
}
useEventListener('scroll', invalidateSceneRect, { capture: true, passive: true })
useEventListener('resize', invalidateSceneRect, { passive: true })

function getSceneRect() {
  if (!sceneRectCache && sceneRef.value) {
    sceneRectCache = sceneRef.value.getBoundingClientRect()
  }
  return sceneRectCache
}

/** 目標邏輯：滑鼠在元素內時追滑鼠，否則回到中心 */
const target = computed(() => {
  const center = { x: sceneSize.width / 2, y: sceneSize.height / 2 }

  if (Number.isNaN(mouse.x) || !isFocused.value) {
    return center
  }

  const rect = getSceneRect()
  if (!rect) {
    return center
  }

  const elementX = mouse.x - rect.left
  const elementY = mouse.y - rect.top
  const outside = elementX < 0
    || elementY < 0
    || elementX > rect.width
    || elementY > rect.height

  return outside ? center : { x: elementX, y: elementY }
})

/** shader 渲染下每像素成本由 GPU 吸收，直接用完整 DPR 讓邊緣銳利 */
const canvasPixelRatio = computed(() => pixelRatio.value)

const canvasWidth = computed(
  () => Math.max(1, Math.round(sceneSize.width * canvasPixelRatio.value)),
)
const canvasHeight = computed(
  () => Math.max(1, Math.round(sceneSize.height * canvasPixelRatio.value)),
)
const canvasStyle = computed(() => ({
  width: `${sceneSize.width}px`,
  height: `${sceneSize.height}px`,
}))

const { isDark } = useData()
/** 景深霧化的混合色：亮色模式混白、深色模式混黑 */
const fogColor = computed(() => (isDark.value ? '#000000' : '#ffffff'))

const flock = new Flock({
  radii: props.behaviorRadii,
  weights: props.behaviorWeights,
  targetShell: props.targetShell,
})
/** 主要路徑為 WebGL2 shader 渲染（連續姿態、SDF 抗鋸齒），
 * 不支援 WebGL2 時退回 2D sprite 圖集渲染
 */
let renderer: FishShaderRenderer | FlockRenderer | undefined

watch(() => ({
  targetShell: props.targetShell,
}), (value) => {
  if (value.targetShell) {
    flock.targetShell = value.targetShell
    renderer?.setDepthFadeRange(value.targetShell.radius + value.targetShell.band)
  }
}, {
  deep: true,
})

watch(target, (value) => {
  flock.setTarget(value.x, value.y, 0)
}, {
  immediate: true,
})

const world = computed(() => ({
  min: new Vector3(0, 0, 0),
  max: new Vector3(
    sceneSize.width,
    sceneSize.height,
    Math.min(
      sceneSize.width,
      sceneSize.height,
    ) / 2,
  ),
}))

/** 動畫運轉條件，false 時完全暫停，不做任何每幀工作 */
const shouldAnimate = computed(() => (
  props.active
  && visible.value
  && isFocused.value
  && props.playbackRate !== 0
))

/** 新增量在此數以內視為餵食，讓新魚吐泡泡；整批初始化則跳過 */
const FEED_BURST_THRESHOLD = 10

/** 差量同步 boid 數量，避免整批重建 */
function syncBoidCount(count: number) {
  const diff = count - flock.boidList.length

  if (diff > 0) {
    const startIndex = flock.boidList.length

    // 出生點 z 對齊殼目標（z = 0），避免一開機整群往螢幕深處鑽
    flock.addRandomBoids(
      diff,
      {
        min: new Vector3(0, world.value.max.y, 0),
        max: new Vector3(world.value.max.x, world.value.max.y, 0),
      },
      props.boidOptions,
    )

    if (renderer && diff <= FEED_BURST_THRESHOLD) {
      for (let i = startIndex; i < flock.boidList.length; i++) {
        const boid = flock.boidList[i]
        if (boid) {
          renderer.spawnBubbles(boid.position.x, boid.position.y, 3)
        }
      }
    }
  }
  else if (diff < 0) {
    flock.boidList.length = count
  }

  // 領頭魚（index 0）游速為一般魚的 1.2 倍。
  // 以一般魚（index 1）為基準設定絕對值，重複呼叫不會累乘
  const leader = flock.boidList[0]
  const normal = flock.boidList[1]
  if (leader && normal) {
    leader.maxSpeed = normal.maxSpeed * 1.2
    leader.maxForce = normal.maxForce * 1.2
  }

  // 整體魚體放大 1.2 倍（領頭魚再套內部的 1.5 倍）
  renderer?.syncFishCount(count, props.size * 1.2)
}

watch(() => props.count, (value) => {
  syncBoidCount(value)
})

watch(
  () => [sceneSize.width, sceneSize.height, canvasPixelRatio.value],
  () => {
    renderer?.setSize(sceneSize.width, sceneSize.height, canvasPixelRatio.value)
  },
)

watch(fogColor, (value) => {
  renderer?.setFogColor(value)
})

/** 單幀 dt 上限（ms）。
 *
 * 主執行緒偶發任務（GC、路由預載）造成掉幀時，
 * 未夾限的 dt 會讓魚單幀跳兩倍距離，把掉幀放大成明顯的顛簸；
 * 夾限後只是極短的慢動作，肉眼幾乎無感
 */
const MAX_FRAME_DELTA_MS = 34

const { pause: pauseLoop, resume: resumeLoop } = useRafFn(({ delta }) => {
  const deltaSeconds = props.playbackRate * Math.min(delta, MAX_FRAME_DELTA_MS) / 1000

  flock.step(deltaSeconds)
  renderer?.render(flock.boidList, deltaSeconds)
}, {
  immediate: false,
})

watch(shouldAnimate, (value) => {
  if (value) {
    resumeLoop()
  }
  else {
    pauseLoop()
  }
})

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  renderer = FishShaderRenderer.tryCreate(canvas) ?? new FlockRenderer(canvas)
  renderer.setSize(sceneSize.width, sceneSize.height, canvasPixelRatio.value)
  renderer.setFogColor(fogColor.value)
  renderer.setDepthFadeRange(props.targetShell.radius + props.targetShell.band)

  // 初始化 boids
  flock.boidList.length = 0
  syncBoidCount(props.count)

  if (shouldAnimate.value) {
    resumeLoop()
  }
})
</script>

<style scoped lang="sass">
</style>
