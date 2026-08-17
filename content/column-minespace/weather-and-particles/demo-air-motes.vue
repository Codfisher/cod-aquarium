<template>
  <demo-frame
    :setup="setupScene"
    title="空氣裡的懸浮物"
    caption="這個場景的空氣一直是空的。霧是一層數學、光束是一道後製，兩者之間什麼都沒有。人之所以看得見陽光，正是因為空氣裡有東西擋在光路上。粒子預設不吃霧也不吃光照，兩者都要自己補，不然入夜之後只剩顆粒維持著大白天的亮度浮在暗景前面。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 2.5"
    :camera-radius="13"
    :camera-target="[0, 1.6, 0]"
    :height="300"
  >
    <demo-slider
      v-model="dayRatio"
      label="白晝程度"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-toggle
      v-model="hasFog"
      label="粒子吃霧"
    />
    <demo-toggle
      v-model="hasDimmer"
      label="跟著日夜明暗"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { ParticleSystem, Scene } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

const dayRatio = shallowRef(0.15)
const hasFog = shallowRef(true)
const hasDimmer = shallowRef(true)

/** 白天的花粉，偏金的暖色 */
const POLLEN_COLOR: [number, number, number, number] = [1, 0.94, 0.72, 0.5]
const POLLEN_COLOR_FADED: [number, number, number, number] = [0.94, 0.9, 0.78, 0.28]
/** 螢火走相加混合，數字給得比一還高才亮得起來 */
const FIREFLY_COLOR: [number, number, number, number] = [0.78, 1, 0.5, 1]
const FIREFLY_COLOR_DIM: [number, number, number, number] = [0.4, 0.62, 0.26, 1]

/** 螢火只在夠暗的時候出來 */
const FIREFLY_DAY_THRESHOLD = 0.35

const moteSystem = shallowRef<ParticleSystem>()
const fireflySystem = shallowRef<ParticleSystem>()
const sceneRef = shallowRef<Scene>()
const babylonModule = shallowRef<BabylonModule>()

/**
 * 一顆硬邊的方形顆粒
 *
 * 柔邊漸層做出來的是攝影機拍到的散景，那是寫實遊戲的語彙。
 * 這個世界裡連水滴與煙都是看得出邊界的方塊
 */
function createMoteTexture(babylon: BabylonModule, scene: Scene, name: string) {
  const size = 4
  const texture = new babylon.DynamicTexture(
    name,
    { width: size, height: size },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, size, size)
  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(1, 1, 2, 2)
  texture.update()
  texture.hasAlpha = true

  return texture
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    ParticleSystem,
    StandardMaterial,
    Vector3,
  } = babylon

  sceneRef.value = scene
  babylonModule.value = babylon

  scene.fogMode = babylon.Scene.FOGMODE_LINEAR
  /** 世界邊界那道白幕，顆粒整片都落在裡面 */
  scene.fogStart = 6
  scene.fogEnd = 26

  const sun = new DirectionalLight('sun', new Vector3(0.6, -0.6, -0.5), scene)
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  sandMaterial.ambientColor = new Color3(1, 1, 1)

  const ground = MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  stoneMaterial.ambientColor = new Color3(1, 1, 1)

  for (const [x, z, height] of [[-3.2, -1, 3], [3.4, 1.6, 2], [-1, 3.4, 1]] as const) {
    for (let level = 0; level < height; level++) {
      const box = MeshBuilder.CreateBox(`block-${x}-${level}`, { size: 1 }, scene)
      box.position.set(x, level + 0.5, z)
      box.material = stoneMaterial
    }
  }

  const motes = new ParticleSystem('air-mote', 320, scene)
  motes.particleTexture = createMoteTexture(babylon, scene, 'air-mote-texture')
  motes.emitter = new Vector3(0, 1.6, 0)
  motes.minEmitBox = new Vector3(-11, -2.5, -11)
  motes.maxEmitBox = new Vector3(11, 4, 11)
  motes.color1 = new Color4(...POLLEN_COLOR)
  motes.color2 = new Color4(...POLLEN_COLOR_FADED)
  motes.colorDead = new Color4(POLLEN_COLOR[0], POLLEN_COLOR[1], POLLEN_COLOR[2], 0)
  /** 顆粒要小到接近一個像素，大一點就不是浮塵而是雪 */
  motes.minSize = 0.035
  motes.maxSize = 0.075
  motes.minLifeTime = 6
  motes.maxLifeTime = 13
  /** 幾乎沒有重力，只有一點點往上的浮力 */
  motes.gravity = new Vector3(0, 0.012, 0)
  motes.direction1 = new Vector3(-0.06, 0.02, -0.06)
  motes.direction2 = new Vector3(0.06, 0.09, 0.06)
  motes.minEmitPower = 0.04
  motes.maxEmitPower = 0.16
  motes.updateSpeed = 0.02
  motes.blendMode = ParticleSystem.BLENDMODE_STANDARD
  motes.start()
  moteSystem.value = motes

  const fireflies = new ParticleSystem('air-firefly', 120, scene)
  fireflies.particleTexture = createMoteTexture(babylon, scene, 'air-firefly-texture')
  fireflies.emitter = new Vector3(0, 1.6, 0)
  /** 螢火貼著草叢飛，範圍收窄、也不往高處去 */
  fireflies.minEmitBox = new Vector3(-9, -2.5, -9)
  fireflies.maxEmitBox = new Vector3(9, 1.2, 9)
  /** 一生的亮度：亮起、撐住、熄掉 */
  fireflies.addColorGradient(0, new Color4(...FIREFLY_COLOR_DIM), new Color4(...FIREFLY_COLOR_DIM))
  fireflies.addColorGradient(0.25, new Color4(...FIREFLY_COLOR), new Color4(...FIREFLY_COLOR))
  fireflies.addColorGradient(0.6, new Color4(...FIREFLY_COLOR), new Color4(...FIREFLY_COLOR))
  fireflies.addColorGradient(1, new Color4(...FIREFLY_COLOR_DIM), new Color4(...FIREFLY_COLOR_DIM))
  fireflies.minSize = 0.06
  fireflies.maxSize = 0.11
  fireflies.minLifeTime = 3
  fireflies.maxLifeTime = 7
  fireflies.gravity = new Vector3(0, 0.02, 0)
  fireflies.direction1 = new Vector3(-0.35, -0.1, -0.35)
  fireflies.direction2 = new Vector3(0.35, 0.25, 0.35)
  fireflies.minEmitPower = 0.1
  fireflies.maxEmitPower = 0.45
  fireflies.updateSpeed = 0.02
  /** 相加混合，這也是它繞開材質那道亮度上限的方式 */
  fireflies.blendMode = ParticleSystem.BLENDMODE_ADD
  fireflies.start()
  fireflySystem.value = fireflies

  applySetting()

  return () => {
    motes.dispose()
    fireflies.dispose()
    moteSystem.value = undefined
    fireflySystem.value = undefined
    sceneRef.value = undefined
    babylonModule.value = undefined
  }
}

function applySetting() {
  const scene = sceneRef.value
  const babylon = babylonModule.value
  const motes = moteSystem.value
  const fireflies = fireflySystem.value
  if (!scene || !babylon || !motes || !fireflies)
    return

  const ratio = dayRatio.value

  /** 天色、光照與霧色一起走，才看得出粒子有沒有跟上 */
  const fogShade: [number, number, number] = [
    0.055 + ratio * 0.9,
    0.07 + ratio * 0.88,
    0.115 + ratio * 0.82,
  ]
  scene.clearColor = new babylon.Color4(...fogShade, 1)
  scene.fogColor = new babylon.Color3(...fogShade)

  const light = scene.getLightByName('sun')
  if (light) {
    light.intensity = 0.3 + ratio
  }
  const ambient = scene.getLightByName('ambient')
  if (ambient) {
    ambient.intensity = 0.32 + ratio * 0.5
  }

  /** Babylon 的粒子預設不套用場景霧氣 */
  motes.applyFog = hasFog.value
  fireflies.applyFog = hasFog.value

  /**
   * 粒子不吃場景光照，顏色是寫死在系統上的常數
   *
   * 只縮放顏色、透明度原封不動，
   * alpha 是粒子一生的淡入淡出在用的
   */
  const brightness = hasDimmer.value ? 0.25 + ratio * 0.75 : 1
  motes.color1.set(
    POLLEN_COLOR[0] * brightness,
    POLLEN_COLOR[1] * brightness,
    POLLEN_COLOR[2] * brightness,
    POLLEN_COLOR[3],
  )
  motes.color2.set(
    POLLEN_COLOR_FADED[0] * brightness,
    POLLEN_COLOR_FADED[1] * brightness,
    POLLEN_COLOR_FADED[2] * brightness,
    POLLEN_COLOR_FADED[3],
  )

  /** 白天才有花粉，夜裡收掉；螢火剛好相反 */
  motes.emitRate = 26 * ratio
  const nightRatio = Math.max(0, 1 - ratio / FIREFLY_DAY_THRESHOLD)
  fireflies.emitRate = 9 * nightRatio
}

watch([dayRatio, hasFog, hasDimmer], applySetting)
</script>
