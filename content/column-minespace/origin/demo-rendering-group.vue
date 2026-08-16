<template>
  <demo-frame
    :setup="setupScene"
    title="繪製分層"
    caption="陰天罩是罩在鏡頭外的一層灰，雨勢一大它的不透明度就接近全滿。關掉分層之後雨絲被排在它前面畫，抬頭與望向天邊的雨整片被灰蓋掉，只剩打在地形前的那幾條，看起來就是「沒在下雨，地上卻有水花」。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.9"
    :camera-radius="16"
    :camera-target="[0, 4, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasRenderingGroup"
      label="天氣粒子畫在最後"
    />
    <demo-slider
      v-model="overcastAlpha"
      label="陰天罩濃度"
      :min="0"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { ParticleSystem, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

const hasRenderingGroup = shallowRef(true)
const overcastAlpha = shallowRef(0.85)

/** 天氣粒子畫在最後，雨絲才不會被陰天罩蓋掉 */
const WEATHER_RENDERING_GROUP = 2

const rainSystem = shallowRef<ParticleSystem>()
const overcastMaterial = shallowRef<StandardMaterial>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    Color4,
    DirectionalLight,
    DynamicTexture,
    HemisphericLight,
    MeshBuilder,
    ParticleSystem,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new Color4(0.62, 0.66, 0.72, 1)

  /** 雨天的光，太陽整個藏在雲後 */
  const sun = new DirectionalLight('sun', new Vector3(0.4, -0.8, -0.4), scene)
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

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  for (const [x, z] of [[-4, -2], [4.5, 1], [-1, 3]] as const) {
    const lantern = MeshBuilder.CreateBox(`lantern-${x}`, { width: 1.2, height: 2.6, depth: 1.2 }, scene)
    lantern.position.set(x, 1.3, z)
    lantern.material = stoneMaterial
  }

  /**
   * 陰天罩
   *
   * 罩在鏡頭外一百多格的一層灰，不留深度，
   * 否則比它遠的半透明東西全部會被判定為擋住而消失
   */
  const overcast = new StandardMaterial('overcast', scene)
  overcast.disableLighting = true
  overcast.emissiveColor = new Color3(0.62, 0.65, 0.7)
  overcast.diffuseColor = new Color3(0, 0, 0)
  overcast.specularColor = new Color3(0, 0, 0)
  overcast.backFaceCulling = false
  overcast.fogEnabled = false
  overcast.disableDepthWrite = true
  overcastMaterial.value = overcast

  const dome = MeshBuilder.CreateBox('overcast-dome', { size: 90 }, scene)
  dome.material = overcast
  dome.infiniteDistance = true
  dome.isPickable = false

  /** 用 Canvas 畫一條白色雨絲，省得多一個圖檔 */
  const rainTexture = new DynamicTexture('rain-drop', { width: 8, height: 64 }, scene, false)
  const rainContext = rainTexture.getContext() as CanvasRenderingContext2D
  const gradient = rainContext.createLinearGradient(0, 0, 0, 64)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.85)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  rainContext.fillStyle = gradient
  rainContext.fillRect(2, 0, 4, 64)
  rainTexture.update()
  rainTexture.hasAlpha = true

  const rain = new ParticleSystem('rain', 1600, scene)
  rain.particleTexture = rainTexture
  rain.applyFog = true
  rain.emitter = new Vector3(0, 0, 0)
  /**
   * 只繞 Y 軸面向鏡頭
   *
   * 預設的公告板會讓雨絲整片跟著鏡頭轉，抬頭一看全部躺平
   */
  rain.billboardMode = ParticleSystem.BILLBOARDMODE_Y
  rain.minEmitBox = new Vector3(-18, 16, -18)
  rain.maxEmitBox = new Vector3(18, 19, 18)
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
  rain.emitRate = 1400
  rain.gravity = new Vector3(-2.5, -80, 1.5)
  rain.direction1 = new Vector3(-0.4, -1, 0.2)
  rain.direction2 = new Vector3(-0.2, -1, 0.4)
  rain.minEmitPower = 14
  rain.maxEmitPower = 20
  rain.updateSpeed = 0.02
  rain.blendMode = ParticleSystem.BLENDMODE_STANDARD
  rain.start()

  rainSystem.value = rain

  applySetting()

  return () => {
    rain.dispose()
    rainSystem.value = undefined
    overcastMaterial.value = undefined
  }
}

function applySetting() {
  const rain = rainSystem.value
  if (rain) {
    /** 零是預設層，與陰天罩同一層，順序就交給 Babylon 自己排 */
    rain.renderingGroupId = hasRenderingGroup.value ? WEATHER_RENDERING_GROUP : 0
  }

  if (overcastMaterial.value) {
    overcastMaterial.value.alpha = overcastAlpha.value
  }
}

watch([hasRenderingGroup, overcastAlpha], applySetting)
</script>
