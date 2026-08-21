<template>
  <demo-frame
    :setup="setup"
    :camera-radius="24"
    :camera-beta="1.5"
    :clear-color="[0.79, 0.83, 0.88, 1]"
    title="近景交給粒子，遠景交給高度霧"
    caption="只留粒子，遠處是一片平的白；只留高度霧，腳邊乾乾淨淨。兩層疊起來才是從腳邊一路連到天邊的一片霧。"
  >
    <demo-toggle
      v-model="particleVisible"
      label="霧的粒子"
    />
    <demo-toggle
      v-model="heightFogEnabled"
      label="高度霧"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { attachHeightFog } from './height-fog'
import { createMistTexture, createSurfaceProbe } from './mist-scene'

const particleVisible = ref(true)
const heightFogEnabled = ref(true)

const MIST_RADIUS = 15
const MIST_CAPACITY = 96
const FULL_EMIT_RATE = MIST_CAPACITY / 14

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new babylon.Color3(1, 0.98, 0.94)

  scene.fogMode = babylon.Scene.FOGMODE_EXP2
  scene.fogDensity = 0.02
  scene.fogColor = new babylon.Color3(0.79, 0.83, 0.88)

  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.4, 0.46, 0.34)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 200, height: 200 }, scene)
  ground.material = groundMaterial

  const woodMaterial = new babylon.StandardMaterial('wood-material', scene)
  woodMaterial.diffuseColor = new babylon.Color3(0.44, 0.34, 0.26)
  woodMaterial.specularColor = new babylon.Color3(0, 0, 0)

  /** 一路鋪到遠處的木座，近的看粒子、遠的看霧色 */
  for (let index = 0; index < 14; index++) {
    const distance = 4 + index * 7
    const height = 1 + (index % 3) * 1.6
    const side = index % 2 === 0 ? -1 : 1

    const platform = babylon.MeshBuilder.CreateBox(
      `platform-${index}`,
      { width: 5, depth: 5, height },
      scene,
    )
    platform.position.set(side * (3 + (index % 4) * 2.5), height / 2, distance - 20)
    platform.material = woodMaterial
  }

  const fogState = {
    top: 10,
    falloff: 1 / 12,
    boost: 0.9,
  }

  for (const material of scene.materials) {
    if (material instanceof babylon.StandardMaterial) {
      attachHeightFog(babylon, material, fogState)
    }
  }

  const measureSurfaceY = createSurfaceProbe(babylon, scene)
  const emitter = new babylon.Vector3(0, 0, 0)

  const mistSystem = new babylon.ParticleSystem('ground-mist', MIST_CAPACITY, scene)
  mistSystem.particleTexture = createMistTexture(babylon, scene)
  mistSystem.emitter = emitter
  /** 粒子也吃場景霧，遠端那幾片才會自己收進霧色裡 */
  mistSystem.applyFog = true

  mistSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    const radius = Math.random() ** 0.7 * MIST_RADIUS
    const angle = Math.random() * Math.PI * 2
    const x = emitter.x + Math.cos(angle) * radius
    const z = emitter.z + Math.sin(angle) * radius

    positionToUpdate.set(x, measureSurfaceY(x, z) + 0.1 + Math.random() * 1.8, z)
  }

  const tintLight = new babylon.Color4(0.93, 0.95, 0.98, 0.3)
  const tintDark = new babylon.Color4(0.84, 0.87, 0.92, 0.2)
  const tintLightClear = new babylon.Color4(0.93, 0.95, 0.98, 0)
  const tintDarkClear = new babylon.Color4(0.84, 0.87, 0.92, 0)

  mistSystem.addColorGradient(0, tintLightClear, tintDarkClear)
  mistSystem.addColorGradient(0.3, tintLight, tintDark)
  mistSystem.addColorGradient(0.6, tintLight, tintDark)
  mistSystem.addColorGradient(1, tintLightClear, tintDarkClear)

  mistSystem.minSize = 5
  mistSystem.maxSize = 10
  mistSystem.minLifeTime = 10
  mistSystem.maxLifeTime = 18
  mistSystem.gravity = new babylon.Vector3(0, 0.015, 0)
  mistSystem.direction1 = new babylon.Vector3(-0.05, 0.01, -0.03)
  mistSystem.direction2 = new babylon.Vector3(0.05, 0.02, 0.03)
  mistSystem.minEmitPower = 0.1
  mistSystem.maxEmitPower = 0.4
  mistSystem.minAngularSpeed = -0.04
  mistSystem.maxAngularSpeed = 0.04
  mistSystem.updateSpeed = 0.02
  mistSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  mistSystem.start()

  const stopParticle = watch(particleVisible, (visible) => {
    mistSystem.emitRate = visible ? FULL_EMIT_RATE : 0
  }, { immediate: true })

  const stopFog = watch(heightFogEnabled, (enabled) => {
    /** 加厚設成零之後，兩層混色的結果與原本那一行完全相同 */
    fogState.boost = enabled ? 0.9 : 0
  }, { immediate: true })

  return () => {
    stopParticle()
    stopFog()
    mistSystem.dispose()
  }
}
</script>
