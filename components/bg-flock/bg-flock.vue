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
      class="absolute h-full w-full"
    />
  </div>
</template>

<script setup lang="ts">
import type { ShallowRef } from 'vue'
import type { Boid, BoidOptions } from './boid'
import type { BehaviorRadii, BehaviorWeights } from './flock'
import { Vector3 } from '@babylonjs/core'
import { useElementSize, useIntersectionObserver, useMouseInElement, useRafFn, useWindowFocus } from '@vueuse/core'
import { computed, onMounted, reactive, ref, shallowRef, triggerRef, useTemplateRef, watch } from 'vue'
import DefaultCanvas from './default-canvas.vue'
import { Flock } from './flock'

// #region Props
interface Props {
  /** 初始 boid 數量 */
  count?: number;
  /** 小魚尺寸 */
  size?: number;
  /** 速度倍率 */
  playbackRate?: number;

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
useRafFn(() => {
  triggerRef(boidList)
})

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

const { resume } = useRafFn(({ delta }) => {
  if (!visible.value || props.playbackRate === 0 || !isFocused.value) {
    return
  }
  flock.step(props.playbackRate * delta / 1000)
}, {
  immediate: false,
})

onMounted(() => {
  // 初始化 boids
  flock.boidList.length = 0
  flock.addRandomBoids(
    props.count,
    {
      max: world.value.max,
      min: world.value.max,
    },
    props.boidOptions,
  )
  boidCount.value = props.count

  resume()
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
    boidCount.value += count

    flock.addRandomBoids(
      count,
      {
        min: world.value.max,
        max: world.value.max,
      },
    )
  },
})
</script>

<style scoped lang="sass">
</style>
