<template>
  <demo-frame
    :setup="setup"
    :camera-radius="8"
    :camera-beta="1.3"
    :clear-color="[0.05, 0.06, 0.09, 1]"
    title="圓盤要往鏡頭的方向挪出方塊之外"
    caption="偏移量為零時，光暈最亮的核心整個埋在方塊裡面，只剩外圈幾階露得出來。拖到 0.95 之後，不論從哪個角度轉過去都繞得出來。"
  >
    <demo-slider
      v-model="lift"
      label="偏移量"
      :min="0"
      :max="1.4"
      :step="0.01"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createGlowMaterial, createGlowTexture } from '../demo/glow-texture'

const lift = ref(0)

function setup({ babylon, scene, camera }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.3
  ambient.diffuse = new babylon.Color3(0.6, 0.68, 0.85)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 12, height: 12 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.3, 0.29, 0.27)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial

  /** 燈籠那顆方塊，不透明而且會寫深度 */
  const lamp = babylon.MeshBuilder.CreateBox('lamp', { size: 1 }, scene)
  lamp.position.y = 1.5
  const lampMaterial = new babylon.StandardMaterial('lamp-material', scene)
  lampMaterial.diffuseColor = new babylon.Color3(0, 0, 0)
  lampMaterial.specularColor = new babylon.Color3(0, 0, 0)
  lampMaterial.emissiveColor = new babylon.Color3(1, 0.86, 0.62)
  lamp.material = lampMaterial

  const texture = createGlowTexture(babylon, scene, 'glow', [255, 220, 160])
  const material = createGlowMaterial(babylon, scene, 'glow-material', texture)

  const halo = babylon.MeshBuilder.CreateDisc('halo', { radius: 1.6, tessellation: 32 }, scene)
  halo.material = material
  halo.billboardMode = babylon.Mesh.BILLBOARDMODE_ALL
  halo.isPickable = false

  const origin = lamp.position.clone()
  const toCamera = new babylon.Vector3()

  /**
   * 每一幀把圓盤沿著「這盞燈往鏡頭看過去」的方向挪出來
   *
   * 圓盤本來就永遠面向鏡頭，所以不論從哪個角度走過去，
   * 它都剛好浮在那顆方塊的前面
   */
  const observer = scene.onBeforeRenderObservable.add(() => {
    toCamera.copyFrom(camera.position).subtractInPlace(origin)
    const distance = toCamera.length()

    if (distance < 0.001) {
      halo.position.copyFrom(origin)
      return
    }

    halo.position.copyFrom(origin).addInPlace(toCamera.scaleInPlace(lift.value / distance))
  })

  return () => scene.onBeforeRenderObservable.remove(observer)
}
</script>
