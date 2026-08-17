<template>
  <demo-frame
    :setup="setupScene"
    title="屋頂底下不該下雨"
    caption="粒子系統本身沒有碰撞，雨絲一路落到壽命結束為止，中間有沒有屋頂一概不管。覆寫 updateFunction，每一幀檢查雨滴有沒有落到它那一格柱的表面以下，是的話就把年齡推到壽命，這一幀就回收。水花則靠射線落點決定出生位置，打不到地面的地方自然就不會濺。"
    :camera-alpha="-Math.PI / 2.15"
    :camera-beta="Math.PI / 2.5"
    :camera-radius="17"
    :camera-target="[0, 2, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasRoofCheck"
      label="雨滴打到東西就停"
    />
    <demo-toggle
      v-model="hasSplash"
      label="落地水花"
    />
    <demo-slider
      v-model="rainRatio"
      label="雨勢"
      :min="0"
      :max="1"
      :step="0.05"
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
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const hasRoofCheck = shallowRef(true)
const hasSplash = shallowRef(true)
const rainRatio = shallowRef(1)

const rainSystem = shallowRef<ParticleSystem>()
const splashSystem = shallowRef<ParticleSystem>()

/** 亭子的範圍與屋頂高度，射線查表直接用它算 */
const ROOF_HALF_SIZE = 3
const ROOF_HEIGHT = 4.2
const GROUND_HEIGHT = 0

/**
 * 「從天空往下打一道射線」的簡化版
 *
 * 本體是真的逐格掃世界資料再快取起來，
 * 這裡場景很單純，直接算得出來
 */
function measureImpactY(x: number, z: number): number {
  const isUnderRoof = Math.abs(x) <= ROOF_HALF_SIZE && Math.abs(z) <= ROOF_HALF_SIZE

  return isUnderRoof ? ROOF_HEIGHT : GROUND_HEIGHT
}

function createRainTexture(babylon: BabylonModule, scene: Scene) {
  const texture = new babylon.DynamicTexture('rain-drop', { width: 8, height: 64 }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D
  const gradient = context.createLinearGradient(0, 0, 0, 64)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.85)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(2, 0, 4, 64)
  texture.update()
  texture.hasAlpha = true

  return texture
}

/**
 * 一塊方形水珠碎片
 *
 * Minecraft 的粒子沒有柔邊，就是一格一格的色塊
 */
function createSplashTexture(babylon: BabylonModule, scene: Scene) {
  const size = 8
  const texture = new babylon.DynamicTexture(
    'rain-splash',
    { width: size, height: size },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D

  context.fillStyle = 'rgba(214, 230, 255, 1)'
  context.fillRect(0, 0, size, size)
  /** 左上角補一塊亮面，看起來才像有明暗兩階的像素貼圖 */
  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(0, 0, size / 2, size / 2)

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

  scene.clearColor = new Color4(0.62, 0.66, 0.72, 1)
  scene.fogMode = babylon.Scene.FOGMODE_LINEAR
  scene.fogColor = new Color3(0.62, 0.66, 0.72)
  scene.fogStart = 8
  scene.fogEnd = 46

  /** 雨天太陽整個藏在雲後，天光補回來 */
  const sun = new DirectionalLight('sun', new Vector3(0.4, -0.82, -0.4), scene)
  sun.intensity = 0.12
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 1.05
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, scene)
  ground.material = sandMaterial

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 一座聽雨亭，四根柱子加一片屋頂 */
  for (const x of [-ROOF_HALF_SIZE, ROOF_HALF_SIZE]) {
    for (const z of [-ROOF_HALF_SIZE, ROOF_HALF_SIZE]) {
      const post = MeshBuilder.CreateBox(`post-${x}-${z}`, { width: 0.5, height: 4, depth: 0.5 }, scene)
      post.position.set(x, 2, z)
      post.material = woodMaterial
    }
  }

  const roof = MeshBuilder.CreateBox(
    'roof',
    { width: ROOF_HALF_SIZE * 2 + 1.2, height: 0.4, depth: ROOF_HALF_SIZE * 2 + 1.2 },
    scene,
  )
  roof.position.set(0, ROOF_HEIGHT, 0)
  roof.material = woodMaterial

  const floor = MeshBuilder.CreateBox(
    'floor',
    { width: ROOF_HALF_SIZE * 2, height: 0.2, depth: ROOF_HALF_SIZE * 2 },
    scene,
  )
  floor.position.set(0, 0.1, 0)
  floor.material = stoneMaterial

  const rain = new ParticleSystem('rain', 2000, scene)
  rain.particleTexture = createRainTexture(babylon, scene)
  rain.applyFog = true
  rain.emitter = new Vector3(0, 0, 0)
  /** 只繞 Y 軸面向鏡頭，雨才會一直是垂直落下的樣子 */
  rain.billboardMode = ParticleSystem.BILLBOARDMODE_Y
  rain.minEmitBox = new Vector3(-14, 14, -14)
  rain.maxEmitBox = new Vector3(14, 17, 14)
  rain.color1 = new Color4(0.72, 0.79, 0.92, 0.5)
  rain.color2 = new Color4(0.86, 0.9, 1, 0.35)
  rain.colorDead = new Color4(0.8, 0.85, 1, 0)
  rain.minSize = 0.3
  rain.maxSize = 0.45
  rain.minScaleX = 0.16
  rain.maxScaleX = 0.24
  rain.minScaleY = 3.4
  rain.maxScaleY = 5.5
  rain.minLifeTime = 0.5
  rain.maxLifeTime = 0.9
  rain.gravity = new Vector3(-2.5, -80, 1.5)
  rain.direction1 = new Vector3(-0.4, -1, 0.2)
  rain.direction2 = new Vector3(-0.2, -1, 0.4)
  rain.minEmitPower = 14
  rain.maxEmitPower = 20
  rain.updateSpeed = 0.02
  rain.blendMode = ParticleSystem.BLENDMODE_STANDARD

  /**
   * 雨滴打到東西就停
   *
   * 落點的射線本來就有了（水花在用），這裡直接拿來用
   */
  const updateParticles = rain.updateFunction
  rain.updateFunction = (particleList) => {
    updateParticles.call(rain, particleList)

    if (!hasRoofCheck.value)
      return

    for (const particle of particleList) {
      const impactY = measureImpactY(particle.position.x, particle.position.z)
      if (particle.position.y > impactY)
        continue

      particle.age = particle.lifeTime
    }
  }

  rain.start()
  rainSystem.value = rain

  const splash = new ParticleSystem('rain-splash', 600, scene)
  splash.particleTexture = createSplashTexture(babylon, scene)
  splash.applyFog = true
  splash.emitter = new Vector3(0, 0, 0)
  /** 方形碎片要正對鏡頭才不會被壓成一條線 */
  splash.billboardMode = ParticleSystem.BILLBOARDMODE_ALL

  /**
   * 直接把水花放到射線算出來的落點上
   *
   * 屋頂底下的落點在屋頂上，那裡不該濺水，所以直接丟掉重挑
   */
  splash.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = (Math.random() * 2 - 1) * 12
      const z = (Math.random() * 2 - 1) * 12
      const impactY = measureImpactY(x, z)

      /** 打在屋頂上的落點高過視線，腳邊本來就不該濺水 */
      if (hasRoofCheck.value && impactY > GROUND_HEIGHT)
        continue

      positionToUpdate.set(x, impactY + 0.03, z)
      return
    }

    positionToUpdate.set(0, -100, 0)
  }

  splash.color1 = new Color4(0.85, 0.9, 1, 0.95)
  splash.color2 = new Color4(0.7, 0.78, 0.92, 0.8)
  splash.colorDead = new Color4(0.8, 0.86, 1, 0)
  splash.minSize = 0.05
  splash.maxSize = 0.11
  /** 碎片維持正方，不隨機拉長，才像從方塊世界濺出來的 */
  splash.minInitialRotation = 0
  splash.maxInitialRotation = 0
  splash.minLifeTime = 0.14
  splash.maxLifeTime = 0.3
  splash.gravity = new Vector3(0, -14, 0)
  splash.direction1 = new Vector3(-0.5, 1, -0.5)
  splash.direction2 = new Vector3(0.5, 1.6, 0.5)
  splash.minEmitPower = 0.7
  splash.maxEmitPower = 1.8
  splash.updateSpeed = 0.02
  splash.blendMode = ParticleSystem.BLENDMODE_STANDARD
  splash.start()
  splashSystem.value = splash

  applySetting()

  return () => {
    rain.dispose()
    splash.dispose()
    rainSystem.value = undefined
    splashSystem.value = undefined
  }
}

function applySetting() {
  const rain = rainSystem.value
  const splash = splashSystem.value
  if (!rain || !splash)
    return

  rain.emitRate = 2000 * rainRatio.value

  /** 雨區邊緣只飄著幾條雨絲，腳邊卻濺起一片水花會很出戲 */
  const splashRatio = Math.max(0, rainRatio.value - 0.25) / 0.75
  splash.emitRate = hasSplash.value ? 600 * splashRatio : 0
}

watch([rainRatio, hasSplash], applySetting)
</script>
