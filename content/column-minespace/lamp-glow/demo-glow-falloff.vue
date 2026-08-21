<template>
  <demo-frame
    :setup="setup"
    :camera-radius="9"
    :camera-beta="1.57"
    :camera-alpha="-1.5708"
    :interactive="false"
    :clear-color="[0.09, 0.1, 0.14, 1]"
    title="兩種衰減曲線，左邊直線、右邊平滑"
    caption="把亮度往上拉，左邊那團會浮出一圈看得見的邊界，右邊那團一路化開到消失。"
  >
    <demo-slider
      v-model="intensity"
      label="亮度"
      :min="0.2"
      :max="3"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createGlowMaterial, createGlowTexture } from '../demo/glow-texture'

const intensity = ref(1)

function setup({ babylon, scene }: BabylonDemoContext) {
  const materialList: StandardMaterial[] = []

  /**
   * 兩片一模一樣的圓盤，差別只在貼圖的衰減曲線
   *
   * 背景刻意留一點亮度。相加混合疊在全黑上是看不出邊界的，
   * 要疊在有東西的背景上才顯得出來
   */
  const backdrop = babylon.MeshBuilder.CreatePlane('backdrop', { size: 16 }, scene)
  backdrop.position.z = 4
  const backdropMaterial = new babylon.StandardMaterial('backdrop-material', scene)
  backdropMaterial.diffuseColor = new babylon.Color3(0, 0, 0)
  backdropMaterial.specularColor = new babylon.Color3(0, 0, 0)
  backdropMaterial.emissiveColor = new babylon.Color3(0.16, 0.18, 0.24)
  backdropMaterial.disableLighting = true
  backdrop.material = backdropMaterial

  for (const [index, kind] of (['linear', 'smooth'] as const).entries()) {
    const texture = createGlowTexture(babylon, scene, `glow-${kind}`, [255, 226, 170], kind)
    const material = createGlowMaterial(babylon, scene, `glow-material-${kind}`, texture)

    const disc = babylon.MeshBuilder.CreateDisc(
      `glow-${kind}`,
      { radius: 2.2, tessellation: 48 },
      scene,
    )
    disc.material = material
    disc.position.x = index === 0 ? -2.6 : 2.6
    disc.isPickable = false

    materialList.push(material)
  }

  const stop = watch(intensity, (value) => {
    for (const material of materialList) {
      material.emissiveColor.set(value, value, value)
    }
  }, { immediate: true })

  return () => stop()
}
</script>
