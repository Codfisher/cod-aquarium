<template>
  <demo-frame
    :setup="setup"
    :camera-radius="10"
    :camera-beta="1.15"
    :clear-color="[0.05, 0.06, 0.09, 1]"
    title="一顆自發光的方塊，加不加光暈"
    caption="關掉光暈時，方塊自己是亮的，但光完全沒有溢出它的邊界。加上那片圓盤之後，燈才像在發光。"
  >
    <demo-toggle
      v-model="glowVisible"
      label="光暈"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createGlowMaterial, createGlowTexture } from '../demo/glow-texture'

const glowVisible = ref(true)

function setup({ babylon, scene }: BabylonDemoContext) {
  /** 一點點環境光，讓地板不是全黑 */
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.28
  ambient.diffuse = new babylon.Color3(0.6, 0.68, 0.85)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 14, height: 14 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.32, 0.3, 0.28)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial

  /**
   * 燈本體
   *
   * 自發光給滿，所以它自己是亮的。但自發光只影響這顆方塊自己的像素，
   * 光並不會溢出它的邊界
   */
  const lamp = babylon.MeshBuilder.CreateBox('lamp', { size: 1 }, scene)
  lamp.position.y = 1.5
  const lampMaterial = new babylon.StandardMaterial('lamp-material', scene)
  lampMaterial.diffuseColor = new babylon.Color3(0, 0, 0)
  lampMaterial.specularColor = new babylon.Color3(0, 0, 0)
  lampMaterial.emissiveColor = new babylon.Color3(1, 0.86, 0.62)
  lamp.material = lampMaterial

  /** 幾顆方塊當背景，才看得出光暈沒有把它們切掉 */
  for (const [index, offset] of [-3.5, 3.5].entries()) {
    const pillar = babylon.MeshBuilder.CreateBox(`pillar-${index}`, { size: 1, height: 3 }, scene)
    pillar.position.set(offset, 1, -2)
    const pillarMaterial = new babylon.StandardMaterial(`pillar-material-${index}`, scene)
    pillarMaterial.diffuseColor = new babylon.Color3(0.45, 0.36, 0.26)
    pillarMaterial.specularColor = new babylon.Color3(0, 0, 0)
    pillar.material = pillarMaterial
  }

  const texture = createGlowTexture(babylon, scene, 'glow', [255, 220, 160])
  const material = createGlowMaterial(babylon, scene, 'glow-material', texture)

  /**
   * 光暈本體，一片永遠面向鏡頭的圓盤
   *
   * 半徑比燈大好幾倍，光才鋪得開
   */
  const halo: Mesh = babylon.MeshBuilder.CreateDisc(
    'halo',
    { radius: 1.8, tessellation: 32 },
    scene,
  )
  halo.material = material
  halo.billboardMode = babylon.Mesh.BILLBOARDMODE_ALL
  halo.position.copyFrom(lamp.position)
  halo.isPickable = false

  const stop = watch(glowVisible, (visible) => halo.setEnabled(visible), { immediate: true })

  return () => stop()
}
</script>
