<template>
  <demo-frame
    :setup="setup"
    :camera-radius="19"
    :camera-beta="1.1"
    :clear-color="[0.62, 0.72, 0.78, 1]"
    title="身後那條慢慢闔上的徑"
    caption="關掉記憶之後，人一走開草立刻彈回原狀，看起來像草在躲人。記住十二個腳印，身後才留得下一條走過的痕。"
  >
    <demo-toggle
      v-model="memoryEnabled"
      label="記住走過的腳印"
    />
    <demo-slider
      v-model="recoverSecond"
      label="恢復時間"
      :min="0.2"
      :max="6"
      :step="0.1"
      :digit="1"
      unit=" 秒"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { advanceWind, createGrassField, createGrassSwayState, createTrail } from './grass-field'

const memoryEnabled = ref(true)
const recoverSecond = ref(1)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new babylon.Color3(1, 0.98, 0.92)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.29, 0.36, 0.22)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  const state = createGrassSwayState()
  state.amplitude = 0.12

  const field = createGrassField({
    babylon,
    scene,
    state,
    extent: 24,
    plantCount: 3200,
  })

  const trail = createTrail(state, {
    recoverSecond: recoverSecond.value,
    push: 0.75,
    stampDistanceMin: 0.8,
    stampDistanceMax: 4,
  })

  const walker = babylon.MeshBuilder.CreateBox('walker', { width: 0.5, depth: 0.5, height: 1.8 }, scene)
  const walkerMaterial = new babylon.StandardMaterial('walker-material', scene)
  walkerMaterial.diffuseColor = new babylon.Color3(0.22, 0.24, 0.3)
  walkerMaterial.specularColor = new babylon.Color3(0, 0, 0)
  walker.material = walkerMaterial
  walker.isPickable = false

  let elapsedSecond = 0

  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
    elapsedSecond += deltaSecond
    advanceWind(state, deltaSecond)

    /** 繞一個大圈，走過的路還看得到才有意義 */
    const footX = Math.cos(elapsedSecond * 0.42) * 8
    const footZ = Math.sin(elapsedSecond * 0.42) * 8

    walker.position.set(footX, 0.9, footZ)
    trail.update(footX, 0, footZ, deltaSecond)

    if (!memoryEnabled.value) {
      /**
       * 只留第零個位置
       *
       * 第零個是人此刻站在哪裡，其餘全部抹掉，
       * 效果就退回「即時推開、走開立刻站起來」
       */
      state.markList.fill(0, 4)
    }
  })

  const stopRecover = watch(recoverSecond, (value) => {
    trail.config.recoverSecond = value
  })

  const stopMemory = watch(memoryEnabled, () => trail.clear())

  return () => {
    stopRecover()
    stopMemory()
    scene.onBeforeRenderObservable.remove(observer)
    field.dispose()
    walker.dispose()
    walkerMaterial.dispose()
  }
}
</script>
