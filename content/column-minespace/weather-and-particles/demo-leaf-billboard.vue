<template>
  <demo-frame
    :setup="setupScene"
    title="落葉的翻轉"
    caption="粒子預設是廣告板，永遠正面朝著鏡頭，角速度只能讓它在畫面上打轉，看起來像一枚在原地旋轉的貼紙。關掉之後葉片會依自己的行進方向立在空間裡，一下攤開一下側過去，那才是葉子在飄。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.5"
    :camera-radius="14"
    :camera-target="[0, 4, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isBillboardBased"
      label="廣告板（永遠面向鏡頭）"
    />
    <demo-toggle
      v-model="hasRhythm"
      label="翻轉節奏"
    />
    <demo-slider
      v-model="noiseStrength"
      label="橫向推力"
      :min="0"
      :max="10"
      :step="0.5"
      :digit="1"
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
import { createSandTexture, createWoodTexture } from '../demo/pixel-texture'

/** 預設開著廣告板，讓讀者先看到「原地旋轉的貼紙」 */
const isBillboardBased = shallowRef(true)
const hasRhythm = shallowRef(true)
const noiseStrength = shallowRef(6)

const particleSystem = shallowRef<ParticleSystem>()
/** 留一份模組參考，設定變更時才建得出 Vector3 */
const babylonModule = shallowRef<BabylonModule>()

/**
 * 一片葉子
 *
 * 硬邊畫一片斜的葉子，中間一道葉脈，
 * 上半片亮、下半片暗，翻轉時才看得出正反面
 */
function createLeafTexture(babylon: BabylonModule, scene: Scene) {
  const size = 8
  const texture = new babylon.DynamicTexture(
    'autumn-leaf',
    { width: size, height: size },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, size, size)

  const rowList = [
    { start: 3, width: 2 },
    { start: 2, width: 4 },
    { start: 1, width: 5 },
    { start: 1, width: 6 },
    { start: 1, width: 6 },
    { start: 2, width: 5 },
    { start: 3, width: 3 },
    { start: 4, width: 1 },
  ]

  rowList.forEach((row, index) => {
    context.fillStyle = index < 4 ? 'rgba(255, 255, 255, 1)' : 'rgba(196, 196, 196, 1)'
    context.fillRect(row.start, index, row.width, 1)
  })

  context.fillStyle = 'rgba(150, 150, 150, 1)'
  for (let index = 0; index < 6; index++) {
    context.fillRect(3 - Math.floor(index / 3) + Math.floor(index / 2), index + 1, 1, 1)
  }

  texture.update()
  texture.hasAlpha = true

  return texture
}

/** 攤平滑翔一段、忽然失速猛翻幾圈、再攤開、再翻 */
const ANGULAR_RHYTHM_LIST: [number, number][] = [
  [0, 6],
  [0.18, 1],
  [0.34, 8],
  [0.52, 2],
  [0.71, 7],
  [0.88, 1.5],
  [1, 5],
]

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    NoiseProceduralTexture,
    ParticleSystem,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.45, -0.7, -0.45), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  ground.material = sandMaterial

  /** 幾棵樹幹當參照 */
  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  for (const [x, z] of [[-3.5, -1], [3, 1.5]] as const) {
    const trunk = MeshBuilder.CreateBox(`trunk-${x}`, { width: 1, height: 7, depth: 1 }, scene)
    trunk.position.set(x, 3.5, z)
    trunk.material = woodMaterial
  }

  const leaves = new ParticleSystem('autumn-leaves', 260, scene)
  leaves.particleTexture = createLeafTexture(babylon, scene)
  /** 粒子預設不吃霧，遠處的葉子會像貼在螢幕上的貼紙 */
  leaves.applyFog = true
  leaves.emitter = new Vector3(0, 0, 0)
  leaves.minEmitBox = new Vector3(-5, 7.5, -4)
  leaves.maxEmitBox = new Vector3(5, 9, 4)

  const amber = new Color4(0.85, 0.42, 0.08, 1)
  const gold = new Color4(0.98, 0.82, 0.14, 1)
  const amberClear = new Color4(amber.r, amber.g, amber.b, 0)
  const goldClear = new Color4(gold.r, gold.g, gold.b, 0)

  /** 一生的透明度：淡入、飄落、淡出 */
  leaves.addColorGradient(0, amberClear, goldClear)
  leaves.addColorGradient(0.12, amber, gold)
  leaves.addColorGradient(0.7, amber, gold)
  leaves.addColorGradient(1, amberClear, goldClear)

  leaves.minSize = 0.28
  leaves.maxSize = 0.5
  leaves.minLifeTime = 13
  leaves.maxLifeTime = 20
  leaves.emitRate = 6

  leaves.gravity = new Vector3(0, -0.5, 0)
  leaves.direction1 = new Vector3(-0.25, -0.3, -0.25)
  leaves.direction2 = new Vector3(0.25, -0.15, 0.25)
  leaves.minEmitPower = 0.4
  leaves.maxEmitPower = 0.8

  /**
   * 速度上限才是主要旋鈕
   *
   * 重力與亂流都是往速度上累加的，不設限的話葉子只會越飄越快
   */
  leaves.addLimitVelocityGradient(0, 3)
  leaves.addLimitVelocityGradient(1, 3)
  leaves.limitVelocityDamping = 0.35
  leaves.addDragGradient(0, 0.1)
  leaves.addDragGradient(1, 0.1)

  const noiseTexture = new NoiseProceduralTexture('leaf-noise', 128, scene)
  noiseTexture.animationSpeedFactor = 0.35
  noiseTexture.brightness = 0.5
  noiseTexture.octaves = 4
  noiseTexture.persistence = 1.6
  leaves.noiseTexture = noiseTexture

  leaves.minInitialRotation = 0
  leaves.maxInitialRotation = Math.PI * 2
  leaves.updateSpeed = 0.011
  leaves.blendMode = ParticleSystem.BLENDMODE_STANDARD

  /** 不預熱的話會看到葉子整批從樹冠同時出發 */
  leaves.preWarmCycles = 150
  leaves.preWarmStepOffset = 20

  particleSystem.value = leaves
  babylonModule.value = babylon
  applySetting()
  leaves.start()

  return () => {
    leaves.dispose()
    noiseTexture.dispose()
    particleSystem.value = undefined
    babylonModule.value = undefined
  }
}

function applySetting() {
  const leaves = particleSystem.value
  const babylon = babylonModule.value
  if (!leaves || !babylon)
    return

  leaves.isBillboardBased = isBillboardBased.value
  /**
   * 橫向推得比縱向多
   *
   * 若下墜速度遠大於橫向速度，方向就永遠指著地面，
   * 葉片一直維持同一個姿態，只會繞著垂直軸打轉
   */
  leaves.noiseStrength = new babylon.Vector3(noiseStrength.value, 2, noiseStrength.value)

  /**
   * 翻轉節奏
   *
   * 一旦用了梯度，min/maxAngularSpeed 就會被忽略，
   * 所以關掉節奏時要把梯度整組移掉
   */
  const gradientList = leaves.getAngularSpeedGradients() ?? []
  for (const gradient of [...gradientList]) {
    leaves.removeAngularSpeedGradient(gradient.gradient)
  }

  if (!hasRhythm.value) {
    leaves.minAngularSpeed = 3
    leaves.maxAngularSpeed = 3
    return
  }

  for (const [life, speed] of ANGULAR_RHYTHM_LIST) {
    leaves.addAngularSpeedGradient(life, -speed, speed)
  }
}

watch([isBillboardBased, hasRhythm, noiseStrength], applySetting)
</script>
