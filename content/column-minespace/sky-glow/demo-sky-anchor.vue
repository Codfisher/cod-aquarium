<template>
  <demo-frame
    :setup="setup"
    :camera-radius="16"
    :camera-beta="1.25"
    :camera-target="[0, 3, 0]"
    :clear-color="[0.42, 0.62, 0.86, 1]"
    :height="300"
    title="infiniteDistance 與 billboard，拖曳看看"
    caption="關掉 infiniteDistance，太陽就成了場景裡一塊固定在某個座標的板子，繞著走會看到它相對於柱子在移動。關掉 billboard 則是轉到側面就剩一條線。兩個都開，太陽才永遠掛在天上同一個方位。"
  >
    <demo-toggle
      v-model="isInfinite"
      label="infiniteDistance"
    />
    <demo-toggle
      v-model="isBillboard"
      label="billboard"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createGlowTexture } from '../demo/glow-texture'
import { createSkyBodyMaterial, createSunTexture } from './sky-texture'

const isInfinite = ref(true)
const isBillboard = ref(true)

const sunMeshList = shallowRef<Mesh[]>([])
const billboardAllMode = shallowRef(7)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new babylon.Color3(0.85, 0.9, 1)
  ambient.groundColor = new babylon.Color3(0.6, 0.55, 0.48)
  ambient.specular = new babylon.Color3(0, 0, 0)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.72, 0.7, 0.64)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial

  /** 幾根柱子當參考物，太陽有沒有跟著鏡頭走要靠它們才看得出來 */
  for (const [index, offset] of [-6, 0, 6].entries()) {
    const pillar = babylon.MeshBuilder.CreateBox(`pillar-${index}`, {
      width: 1,
      height: 7,
      depth: 1,
    }, scene)
    pillar.position.set(offset, 3.5, -8)
    const pillarMaterial = new babylon.StandardMaterial(`pillar-material-${index}`, scene)
    pillarMaterial.diffuseColor = new babylon.Color3(0.42, 0.3, 0.22)
    pillarMaterial.specularColor = new babylon.Color3(0, 0, 0)
    pillar.material = pillarMaterial
  }

  /** 太陽掛在天上固定的方位，離鏡頭六十格 */
  const direction = new babylon.Vector3(-0.45, -0.55, 0.7).normalize()

  const sunTexture = createSunTexture(babylon, scene, 'sun-anchor')
  const sunMaterial = createSkyBodyMaterial(babylon, scene, 'sun-anchor-material', sunTexture)
  const sun = babylon.MeshBuilder.CreatePlane('sun-anchor', { size: 9 }, scene)
  sun.material = sunMaterial
  sun.position = direction.scale(-60)

  const glowTexture = createGlowTexture(babylon, scene, 'sun-anchor-glow', [130, 127, 109])
  const glowMaterial = createSkyBodyMaterial(babylon, scene, 'sun-anchor-glow-material', glowTexture)
  const glow = babylon.MeshBuilder.CreateDisc('sun-anchor-glow', {
    radius: 14,
    tessellation: 48,
  }, scene)
  glow.material = glowMaterial
  glow.position = direction.scale(-61)

  for (const mesh of [sun, glow]) {
    mesh.isPickable = false
    /**
     * 天體的位置與視錐無關，剔除那一步要讓開
     *
     * infiniteDistance 的網格是每一幀跟著鏡頭平移的，
     * 拿它原本的包圍盒去判斷在不在視野裡會判錯
     */
    mesh.alwaysSelectAsActiveMesh = true
  }

  sunMeshList.value = [sun, glow]
  billboardAllMode.value = babylon.Mesh.BILLBOARDMODE_ALL
  applySetting()

  return () => {
    sunMeshList.value = []
  }
}

function applySetting() {
  for (const mesh of sunMeshList.value) {
    mesh.infiniteDistance = isInfinite.value
    mesh.billboardMode = isBillboard.value ? billboardAllMode.value : 0
  }
}

watch([isInfinite, isBillboard], applySetting)
</script>
