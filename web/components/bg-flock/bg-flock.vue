<template>
  <div
    ref="sceneRef"
    class="relative h-full w-full"
  >
    <default-canvas
      :mouse
      :boid-count="boidCount"
      :boid-list="boidList"
      :size="props.size"
      :active="shouldAnimate"
      class="absolute h-full w-full"
    />
  </div>
</template>

<script setup lang="ts">
import type { ShallowRef } from 'vue'
import type { Boid, BoidOptions } from './boid'
import type { BehaviorRadii, BehaviorWeights } from './flock'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { useElementSize, useIntersectionObserver, useMouseInElement, useRafFn, useWindowFocus } from '@vueuse/core'
import { computed, onMounted, reactive, ref, shallowRef, triggerRef, useTemplateRef, watch } from 'vue'
import DefaultCanvas from './default-canvas.vue'
import { Flock } from './flock'

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
  playbackRate: 1,
  active: true,
  targetShell: () => ({
    radius: 120,
    band: 50,
    swirlSpeed: -0.5,
  }),
})

const sceneRef = useTemplateRef('sceneRef')
const sceneSize = reactive(useElementSize(sceneRef))

const visible = ref(true)
useIntersectionObserver(sceneRef, ([entry]) => {
  visible.value = entry?.isIntersecting || false
})

const isFocused = useWindowFocus()
const mouse = reactive(useMouseInElement(sceneRef))

const flock = new Flock({
  radii: props.behaviorRadii,
  weights: props.behaviorWeights,
  targetShell: props.targetShell,
})
watch(() => ({
  targetShell: props.targetShell,
}), (value) => {
  if (value.targetShell) {
    flock.targetShell = value.targetShell
  }
}, {
  deep: true,
})

const boidCount = ref(0)
const boidList = shallowRef(flock.boidList)

watch(() => ({
  mouse,
  isFocused,
  sceneSize,
}), () => {
  if (mouse.x === 0 && mouse.y === 0) {
    flock.setTarget(sceneSize.width / 2, sceneSize.height / 2, 0)
    return
  }

  if (isFocused.value && !mouse.isOutside) {
    flock.setTarget(mouse.elementX, mouse.elementY, 0)
    return
  }

  flock.setTarget(sceneSize.width / 2, sceneSize.height / 2, 0)
}, {
  deep: true,
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

/** 所有動畫迴圈共用的運轉條件，false 時完全暫停，不做任何每幀工作 */
const shouldAnimate = computed(() => (
  props.active
  && visible.value
  && isFocused.value
  && props.playbackRate !== 0
))

const { pause: pauseStep, resume: resumeStep } = useRafFn(({ delta }) => {
  flock.step(props.playbackRate * delta / 1000)
}, {
  immediate: false,
})

watch(shouldAnimate, (value) => {
  if (value) {
    resumeStep()
  }
  else {
    pauseStep()
  }
})

/** 差量同步 boid 數量，避免整批重建 */
function syncBoidCount(count: number) {
  const diff = count - boidCount.value

  if (diff > 0) {
    flock.addRandomBoids(
      diff,
      {
        min: new Vector3(0, world.value.max.y, world.value.max.z),
        max: world.value.max,
      },
      props.boidOptions,
    )
  }
  else if (diff < 0) {
    flock.boidList.length = count
  }

  boidCount.value = count
  triggerRef(boidList)
}

watch(() => props.count, (value) => {
  syncBoidCount(value)
})

onMounted(() => {
  // 初始化 boids
  flock.boidList.length = 0
  boidCount.value = 0
  syncBoidCount(props.count)

  if (shouldAnimate.value) {
    resumeStep()
  }
})

// #region Methods
interface Expose {
  boidList: ShallowRef<Boid[]>;
  addRandomBoids: (count: number) => void;
}
// #endregion Methods
defineExpose<Expose>({
  boidList,
  addRandomBoids(count: number) {
    syncBoidCount(boidCount.value + count)
  },
})
</script>

<style scoped lang="sass">
</style>
