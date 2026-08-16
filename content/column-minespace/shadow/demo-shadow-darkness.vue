<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="陰影濃度與那道 clamp"
    caption="StandardMaterial 算漫射時會把「平行光加環境光」夾在 1.0 以內再乘上貼圖。兩者合計超過 1 的時候，影子裡就算擋掉一半也還在 1 以上，clamp 之後與亮處完全相同，影子在數學上根本不存在。"
    :camera-alpha="-Math.PI / 2.5"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="18"
    :camera-target="[0, 1.5, 0]"
    :height="300"
  >
    <demo-slider
      v-model="darkness"
      label="陰影濃度"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-slider
      v-model="lightIntensity"
      label="平行光"
      :min="0.1"
      :max="1.6"
      :step="0.05"
    />
    <demo-slider
      v-model="ambientIntensity"
      label="環境光"
      :min="0"
      :max="1.2"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DirectionalLight, HemisphericLight, ShadowGenerator } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

/** 一開始就照著當初那組壞掉的設定，讓讀者先看到「影子不見了」 */
const darkness = shallowRef(0.5)
const lightIntensity = shallowRef(1.3)
const ambientIntensity = shallowRef(0.82)

const badge = computed(() => {
  const total = lightIntensity.value + ambientIntensity.value
  const shaded = lightIntensity.value * darkness.value + ambientIntensity.value
  const isFlat = total >= 1 && shaded >= 1

  return `亮處 ${total.toFixed(2)}  影中 ${shaded.toFixed(2)}${isFlat ? '  兩邊都被 clamp 成 1.00' : ''}`
})

const sunLight = shallowRef<DirectionalLight>()
const ambientLight = shallowRef<HemisphericLight>()
const shadowGenerator = shallowRef<ShadowGenerator>()

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

  const sun = new DirectionalLight('sun', new Vector3(0.666, -0.62, -0.416), scene)
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sun.specular = new Color3(1, 1, 1)
  sun.position = new Vector3(-20, 24, 14)
  sunLight.value = sun

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)
  ambientLight.value = ambient

  const generator = new ShadowGenerator(1024, sun)
  generator.usePercentageCloserFiltering = true
  generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
  generator.bias = 0.0005
  generator.normalBias = 0.08
  shadowGenerator.value = generator

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
  ground.material = sandMaterial
  ground.receiveShadows = true

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /**
   * 一座鳥居
   *
   * 影子要有形狀才看得出「在」或「不在」，
   * 一顆方塊的影子太小，看不出差別
   */
  const pillarList = [-2.5, 2.5].map((x) => {
    const pillar = MeshBuilder.CreateBox(`pillar-${x}`, { width: 0.7, height: 6, depth: 0.7 }, scene)
    pillar.position.set(x, 3, 0)
    pillar.material = woodMaterial
    return pillar
  })

  const beam = MeshBuilder.CreateBox('beam', { width: 8, height: 0.6, depth: 0.8 }, scene)
  beam.position.set(0, 6.2, 0)
  beam.material = woodMaterial

  const crossBeam = MeshBuilder.CreateBox('cross-beam', { width: 6.4, height: 0.45, depth: 0.6 }, scene)
  crossBeam.position.set(0, 5.1, 0)
  crossBeam.material = woodMaterial

  const lanternList = [[-6, -3], [6, 2.5]].map(([x, z]) => {
    const lantern = MeshBuilder.CreateBox(`lantern-${x}`, { width: 1.2, height: 2.4, depth: 1.2 }, scene)
    lantern.position.set(x!, 1.2, z!)
    lantern.material = stoneMaterial
    return lantern
  })

  for (const mesh of [...pillarList, beam, crossBeam, ...lanternList]) {
    generator.addShadowCaster(mesh)
    mesh.receiveShadows = true
  }

  applySetting()
}

function applySetting() {
  if (sunLight.value) {
    sunLight.value.intensity = lightIntensity.value
  }
  if (ambientLight.value) {
    ambientLight.value.intensity = ambientIntensity.value
  }
  if (shadowGenerator.value) {
    shadowGenerator.value.darkness = darkness.value
  }
}

watch([darkness, lightIntensity, ambientIntensity], applySetting)
</script>
