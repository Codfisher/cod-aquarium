<template>
  <demo-frame
    :setup="setup"
    :camera-radius="52"
    :camera-beta="1.16"
    :clear-color="[0.79, 0.83, 0.88, 1]"
    title="高度霧：同樣的距離，低處比高處糊"
    caption="場景霧只看距離，所以山腳與山頂糊得一樣多。乘上一個看高度的倍率之後，低處才會沉在濁氣裡，柱頂則露在上面。"
  >
    <demo-slider
      v-model="boost"
      label="貼地加厚"
      :min="0"
      :max="2"
      :step="0.05"
      unit=" 倍"
    />
    <demo-slider
      v-model="top"
      label="濁氣的頂"
      :min="0"
      :max="18"
      :step="0.5"
      :digit="1"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { attachHeightFog } from './height-fog'

const boost = ref(0.9)
const top = ref(10)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new babylon.Color3(1, 0.98, 0.94)

  /**
   * 場景霧只看距離
   *
   * 這是一切的起點：不管在什麼高度，一律照離鏡頭多遠往霧色收
   */
  scene.fogMode = babylon.Scene.FOGMODE_EXP2
  scene.fogDensity = 0.021
  scene.fogColor = new babylon.Color3(0.79, 0.83, 0.88)

  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.4, 0.46, 0.34)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 160, height: 160 }, scene)
  ground.material = groundMaterial

  const towerMaterial = new babylon.StandardMaterial('tower-material', scene)
  towerMaterial.diffuseColor = new babylon.Color3(0.46, 0.38, 0.3)
  towerMaterial.specularColor = new babylon.Color3(0, 0, 0)

  /**
   * 一排高矮不同的柱子，往遠處鋪過去
   *
   * 每一根從地面長到不同的高度，同一根柱子的底與頂
   * 離鏡頭幾乎一樣遠，差別就只剩高度
   */
  for (let row = 0; row < 7; row++) {
    for (let column = -3; column <= 3; column++) {
      const height = 4 + ((row * 3 + column + 9) % 5) * 4
      const tower = babylon.MeshBuilder.CreateBox(
        `tower-${row}-${column}`,
        { width: 2.4, depth: 2.4, height },
        scene,
      )
      tower.position.set(column * 9, height / 2, row * 9 - 24)
      tower.material = towerMaterial
    }
  }

  const fogState = {
    top: top.value,
    /** 倒數是「幾格內從沒有變成滿」，十二格是一段夠長的漸變 */
    falloff: 1 / 12,
    boost: boost.value,
  }

  /**
   * 掛上外掛
   *
   * 場景裡每一份 StandardMaterial 都要換掉霧那一行，
   * 漏掉一份的話畫面上會出現一塊高度不吃霧的東西
   */
  for (const material of scene.materials) {
    if (material instanceof babylon.StandardMaterial) {
      attachHeightFog(babylon, material, fogState)
    }
  }

  const stopBoost = watch(boost, (value) => {
    fogState.boost = value
  })
  const stopTop = watch(top, (value) => {
    fogState.top = value
  })

  return () => {
    stopBoost()
    stopTop()
  }
}
</script>
