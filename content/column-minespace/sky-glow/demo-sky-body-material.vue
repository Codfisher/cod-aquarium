<template>
  <demo-frame
    :setup="setup"
    :camera-radius="16"
    :camera-beta="1.5708"
    :camera-alpha="-1.5708"
    :interactive="false"
    :clear-color="[0.05, 0.07, 0.14, 1]"
    title="同一張月亮貼圖，掛在兩個不同的欄位上"
    caption="兩顆都走相加混合，所以背景給了夜色。左邊掛在 diffuseTexture，乘數歸零時整顆乾淨地淡出。右邊掛在 emissiveTexture，乘數歸零貼圖照樣全亮、拉到 1 則是整片糊成白色，怎麼調都收不掉。"
  >
    <demo-slider
      v-model="level"
      label="自發光乘數"
      :min="0"
      :max="1"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createMoonTexture, createSkyBodyMaterial } from './sky-texture'

const level = ref(1)

function setup({ babylon, scene }: BabylonDemoContext) {
  /**
   * 掛在 diffuseTexture 的那一份
   *
   * 關掉光照之後畫面上只剩 clamp(自發光) 乘上貼圖，
   * 自發光的顏色因此是一個乾淨的亮度乘數
   */
  const diffuseTexture = createMoonTexture(babylon, scene, 'moon-diffuse')
  const diffuseMaterial = createSkyBodyMaterial(babylon, scene, 'sky-body-diffuse', diffuseTexture)

  /**
   * 掛在 emissiveTexture 的那一份
   *
   * Babylon 的著色器裡自發光是「顏色加上貼圖」，
   * 兩者是相加的關係，所以顏色怎麼調都乘不掉貼圖那一項
   */
  const emissiveTexture = createMoonTexture(babylon, scene, 'moon-emissive')
  const emissiveMaterial = new babylon.StandardMaterial('sky-body-emissive', scene)
  emissiveMaterial.emissiveTexture = emissiveTexture
  emissiveMaterial.diffuseColor = new babylon.Color3(0, 0, 0)
  emissiveMaterial.specularColor = new babylon.Color3(0, 0, 0)
  emissiveMaterial.disableLighting = true
  emissiveMaterial.backFaceCulling = false
  emissiveMaterial.alphaMode = babylon.Constants.ALPHA_ADD
  emissiveMaterial.alpha = 0.999
  emissiveMaterial.disableDepthWrite = true

  for (const [index, material] of [diffuseMaterial, emissiveMaterial].entries()) {
    const plane = babylon.MeshBuilder.CreatePlane(`sky-body-${index}`, { size: 6 }, scene)
    plane.material = material
    plane.position.x = index === 0 ? -4.6 : 4.6
    plane.isPickable = false
  }

  const stop = watch(level, (value) => {
    diffuseMaterial.emissiveColor.set(value, value, value)
    emissiveMaterial.emissiveColor.set(value, value, value)
  }, { immediate: true })

  return () => stop()
}
</script>
