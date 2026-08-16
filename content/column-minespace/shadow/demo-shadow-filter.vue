<template>
  <demo-frame
    :setup="setupScene"
    title="bias、normalBias 與接觸硬化"
    caption="bias 是正規化深度，太小會在方塊表面留下自我遮蔽的條紋、太大會把貼地的短影子整個抹掉。normalBias 沿著法線推開投影者，對付平面特別有效。接觸硬化則先找出擋在前面的是什麼、離得多遠，再依那段距離決定要模糊多寬，影子因此在根部銳利、離遠了才散開。"
    :camera-alpha="-Math.PI / 2.45"
    :camera-beta="Math.PI / 3.3"
    :camera-radius="16"
    :camera-target="[0, 1.6, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isContactHardening"
      label="接觸硬化（PCSS）"
    />
    <demo-slider
      v-model="bias"
      label="bias"
      :min="0"
      :max="0.004"
      :step="0.0001"
      :digit="4"
    />
    <demo-slider
      v-model="normalBias"
      label="normalBias"
      :min="0"
      :max="0.6"
      :step="0.02"
    />
    <demo-slider
      v-model="lightSize"
      label="太陽大小"
      :min="0.005"
      :max="0.3"
      :step="0.005"
      :digit="3"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { ShadowGenerator } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const isContactHardening = shallowRef(true)
const bias = shallowRef(0.0005)
const normalBias = shallowRef(0.08)
/** 這個數字就是「太陽有多大」，太陽在天上只張開半度 */
const lightSize = shallowRef(0.05)

const shadowGenerator = shallowRef<ShadowGenerator>()
const babylonModule = shallowRef<BabylonModule>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    ShadowGenerator,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)
  babylonModule.value = babylon

  const sun = new DirectionalLight('sun', new Vector3(0.58, -0.66, -0.48), scene)
  sun.intensity = 1.3
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sun.position = new Vector3(-18, 22, 15)
  sun.autoUpdateExtends = false
  sun.orthoLeft = -14
  sun.orthoRight = 14
  sun.orthoTop = 14
  sun.orthoBottom = -14
  sun.shadowMinZ = 1
  sun.shadowMaxZ = 60

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.6
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const generator = new ShadowGenerator(1024, sun)
  generator.darkness = 0.05
  shadowGenerator.value = generator

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 50, height: 50 }, scene)
  ground.material = sandMaterial
  ground.receiveShadows = true

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /**
   * 一根高的與一個貼地的
   *
   * 接觸硬化的差別在「根部銳利、離遠了才散開」，
   * 所以要有一根從地面一路長上去的柱子。
   * 貼地的小方塊則是拿來看 bias 把短影子吃掉的
   */
  const pillar = MeshBuilder.CreateBox('pillar', { width: 0.6, height: 6, depth: 0.6 }, scene)
  pillar.position.set(-1.6, 3, 0)
  pillar.material = woodMaterial
  pillar.receiveShadows = true
  generator.addShadowCaster(pillar)

  const beam = MeshBuilder.CreateBox('beam', { width: 5, height: 0.5, depth: 0.6 }, scene)
  beam.position.set(0.8, 5.2, 0)
  beam.material = woodMaterial
  beam.receiveShadows = true
  generator.addShadowCaster(beam)

  /** 一小片牆，自我遮蔽的條紋在這種大平面上最明顯 */
  for (let x = -3; x <= 3; x++) {
    for (let y = 0; y < 2; y++) {
      const box = MeshBuilder.CreateBox(`wall-${x}-${y}`, { size: 1 }, scene)
      box.position.set(x, y + 0.5, -3.5)
      box.material = stoneMaterial
      box.receiveShadows = true
      generator.addShadowCaster(box)
    }
  }

  /** 幾顆貼地的小方塊，短影子被吃掉時最先看得出來 */
  for (const [x, z] of [[2.6, 2.4], [3.8, 1], [1.4, 3.4]] as const) {
    const box = MeshBuilder.CreateBox(`pebble-${x}`, { width: 0.6, height: 0.3, depth: 0.6 }, scene)
    box.position.set(x, 0.15, z)
    box.material = stoneMaterial
    box.receiveShadows = true
    generator.addShadowCaster(box)
  }

  applySetting()

  return () => {
    shadowGenerator.value = undefined
    babylonModule.value = undefined
  }
}

function applySetting() {
  const generator = shadowGenerator.value
  const babylon = babylonModule.value
  if (!generator || !babylon)
    return

  generator.bias = bias.value
  generator.normalBias = normalBias.value

  if (isContactHardening.value) {
    generator.useContactHardeningShadow = true
    generator.usePercentageCloserFiltering = false
    generator.contactHardeningLightSizeUVRatio = lightSize.value
    /**
     * 用中等，不用高等
     *
     * 高等是三十二次遮蔽搜尋加六十四次比較，
     * 那個級距是給「畫面上只有幾樣東西」的展示場景用的
     */
    generator.filteringQuality = babylon.ShadowGenerator.QUALITY_MEDIUM
    return
  }

  generator.useContactHardeningShadow = false
  generator.usePercentageCloserFiltering = true
  generator.filteringQuality = babylon.ShadowGenerator.QUALITY_MEDIUM
}

watch([isContactHardening, bias, normalBias, lightSize], applySetting)
</script>
