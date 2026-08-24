<template>
  <demo-frame
    :setup="setup"
    :camera-radius="26"
    :camera-beta="1.34"
    :camera-alpha="-1.05"
    :camera-target="[0, 6, 0]"
    :height="320"
    title="一整天的天上，拖時刻看看"
    caption="太陽貼近地平線時被光色染紅，沉下去之後淡出。月亮與星空各有自己的門檻，星星要等天再暗一點才敢出來。三者共用同一套材質，差別只在那個自發光乘數。"
  >
    <demo-slider
      v-model="timeOfDay"
      label="時刻"
      :min="0"
      :max="1"
      :step="0.002"
      :digit="3"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { HemisphericLight, Mesh, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createGlowTexture } from '../demo/glow-texture'
import { createMoonTexture, createSkyBodyMaterial, createStarTexture, createSunTexture } from './sky-texture'

/** 0.25 是日出、0.5 是正午、0.75 是日落 */
const timeOfDay = ref(0.32)

/** 天體掛得多遠，光暈再往外一點，兩片才不會打架 */
const BODY_DISTANCE = 80
const GLOW_DISTANCE = 82

/** 把 value 落在 from ～ to 之間的位置換成 0 ～ 1 的平滑曲線 */
function measureRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))

  return ratio * ratio * (3 - 2 * ratio)
}

function mix(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.groundColor = new babylon.Color3(0.4, 0.38, 0.36)
  ambient.specular = new babylon.Color3(0, 0, 0)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 160, height: 160 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.78, 0.76, 0.7)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial

  /** 幾根柱子，天色換了才有東西跟著換 */
  for (const [index, offset] of [-11, -4, 5, 12].entries()) {
    const pillar = babylon.MeshBuilder.CreateBox(`pillar-${index}`, {
      width: 1.4,
      height: 6 + index,
      depth: 1.4,
    }, scene)
    pillar.position.set(offset, (6 + index) / 2, -14)
    const pillarMaterial = new babylon.StandardMaterial(`pillar-material-${index}`, scene)
    pillarMaterial.diffuseColor = new babylon.Color3(0.4, 0.29, 0.21)
    pillarMaterial.specularColor = new babylon.Color3(0, 0, 0)
    pillar.material = pillarMaterial
  }

  function attach(mesh: Mesh, material: StandardMaterial) {
    mesh.material = material
    mesh.infiniteDistance = true
    mesh.billboardMode = babylon.Mesh.BILLBOARDMODE_ALL
    mesh.isPickable = false
    mesh.alwaysSelectAsActiveMesh = true
  }

  const sunMaterial = createSkyBodyMaterial(
    babylon,
    scene,
    'cycle-sun-material',
    createSunTexture(babylon, scene, 'cycle-sun'),
  )
  const sun = babylon.MeshBuilder.CreatePlane('cycle-sun', { size: 11 }, scene)
  attach(sun, sunMaterial)

  const sunGlowMaterial = createSkyBodyMaterial(
    babylon,
    scene,
    'cycle-sun-glow-material',
    createGlowTexture(babylon, scene, 'cycle-sun-glow', [130, 127, 109]),
  )
  const sunGlow = babylon.MeshBuilder.CreateDisc('cycle-sun-glow', {
    radius: 18,
    tessellation: 48,
  }, scene)
  attach(sunGlow, sunGlowMaterial)

  const moonMaterial = createSkyBodyMaterial(
    babylon,
    scene,
    'cycle-moon-material',
    createMoonTexture(babylon, scene, 'cycle-moon'),
  )
  const moon = babylon.MeshBuilder.CreatePlane('cycle-moon', { size: 9 }, scene)
  attach(moon, moonMaterial)

  const moonGlowMaterial = createSkyBodyMaterial(
    babylon,
    scene,
    'cycle-moon-glow-material',
    createGlowTexture(babylon, scene, 'cycle-moon-glow', [103, 112, 128]),
  )
  const moonGlow = babylon.MeshBuilder.CreateDisc('cycle-moon-glow', {
    radius: 15,
    tessellation: 48,
  }, scene)
  attach(moonGlow, moonGlowMaterial)

  /**
   * 星空是一個罩住鏡頭的盒子
   *
   * 六個面共用同一張圖，圖樣其實重複了六次；
   * 星點本來就是隨機散布、沒有結構，轉頭時看不出重複
   */
  const starMaterial = createSkyBodyMaterial(
    babylon,
    scene,
    'cycle-star-material',
    createStarTexture(babylon, scene, 'cycle-star'),
  )
  const starDome = babylon.MeshBuilder.CreateBox('cycle-star', { size: 160 }, scene)
  starDome.material = starMaterial
  starDome.infiniteDistance = true
  starDome.isPickable = false
  starDome.alwaysSelectAsActiveMesh = true

  const stop = watch(timeOfDay, (time) => {
    applyCycle(time, {
      babylon,
      scene,
      ambient,
      sun,
      sunGlow,
      moon,
      moonGlow,
      sunMaterial,
      sunGlowMaterial,
      moonMaterial,
      moonGlowMaterial,
      starMaterial,
    })
  }, { immediate: true })

  return () => stop()
}

interface CycleTarget {
  babylon: BabylonDemoContext['babylon'];
  scene: BabylonDemoContext['scene'];
  ambient: HemisphericLight;
  sun: Mesh;
  sunGlow: Mesh;
  moon: Mesh;
  moonGlow: Mesh;
  sunMaterial: StandardMaterial;
  sunGlowMaterial: StandardMaterial;
  moonMaterial: StandardMaterial;
  moonGlowMaterial: StandardMaterial;
  starMaterial: StandardMaterial;
}

function applyCycle(time: number, target: CycleTarget) {
  const { babylon } = target

  /** 太陽沿著傾斜的圓在天球上繞一圈，0.25 時剛好在地平線上 */
  const angle = (time - 0.25) * Math.PI * 2
  const alongRise = Math.cos(angle)
  const alongNoon = Math.sin(angle)

  const sunDirection = new babylon.Vector3(
    0.97 * alongRise + 0.18 * alongNoon,
    0.94 * alongNoon,
    -0.24 * alongRise + 0.29 * alongNoon,
  ).normalize()
  const moonDirection = sunDirection.scale(-1)

  target.sun.position = sunDirection.scale(BODY_DISTANCE)
  target.sunGlow.position = sunDirection.scale(GLOW_DISTANCE)
  target.moon.position = moonDirection.scale(BODY_DISTANCE)
  target.moonGlow.position = moonDirection.scale(GLOW_DISTANCE)

  const sunHeight = sunDirection.y
  const dayRatio = measureRange(sunHeight, -0.12, 0.15)
  const sunFade = measureRange(sunHeight, -0.05, 0.06)
  const moonFade = measureRange(-sunHeight, -0.02, 0.14)
  const starFade = measureRange(-sunHeight, 0.02, 0.24)

  /**
   * 越低的太陽越紅
   *
   * 太陽本體是一張自己畫的貼圖，不跟著染色的話，
   * 日落時會有一顆慘白的方塊掛在一片橘紅的天上
   */
  const horizonRatio = 1 - measureRange(sunHeight, 0.04, 0.42)
  const tintGreen = mix(1, 0.62, horizonRatio)
  const tintBlue = mix(1, 0.34, horizonRatio)

  for (const material of [target.sunMaterial, target.sunGlowMaterial]) {
    material.emissiveColor.set(sunFade, tintGreen * sunFade, tintBlue * sunFade)
  }

  target.moonMaterial.emissiveColor.set(0.86 * moonFade, 0.88 * moonFade, 0.95 * moonFade)
  target.moonGlowMaterial.emissiveColor.set(moonFade, moonFade, moonFade)
  target.starMaterial.emissiveColor.set(starFade, starFade, starFade)

  /** 天色：夜的深藍、晨昏的橘、白天的藍，照日高與晨昏比例混出來 */
  const skyRed = mix(0.05, mix(0.42, 0.98, horizonRatio), dayRatio)
  const skyGreen = mix(0.07, mix(0.62, 0.62, horizonRatio), dayRatio)
  const skyBlue = mix(0.14, mix(0.88, 0.5, horizonRatio), dayRatio)
  target.scene.clearColor = new babylon.Color4(skyRed, skyGreen, skyBlue, 1)

  /** 地面跟著天色走，不然半夜的地還是白花花的一片 */
  const ambientDiffuse = target.ambient.diffuse
  target.ambient.intensity = mix(0.16, 1.05, dayRatio)
  ambientDiffuse.set(
    mix(0.42, 1, dayRatio),
    mix(0.5, mix(0.92, 0.86, horizonRatio), dayRatio),
    mix(0.78, mix(1, 0.72, horizonRatio), dayRatio),
  )
}
</script>
