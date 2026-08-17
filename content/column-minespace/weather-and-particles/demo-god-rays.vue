<template>
  <demo-frame
    :setup="setupScene"
    title="晨昏的光束"
    caption="做法是螢幕空間的放射狀模糊。先把場景畫成一張只有太陽是亮的黑白圖，再沿著「太陽在畫面上的位置」往外一路取樣疊加。擋在太陽前面的樹與鳥居會在那張圖上留下黑影，於是光束自然就從枝葉的縫隙裡透出來。代價是那張遮蔽圖要把整個世界重畫一次。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.2"
    :camera-radius="17"
    :camera-target="[0, 3, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasGodRays"
      label="晨昏光束"
    />
    <demo-slider
      v-model="exposure"
      label="曝光"
      :min="0"
      :max="0.6"
      :step="0.02"
    />
    <demo-slider
      v-model="density"
      label="密度"
      :min="0.5"
      :max="0.99"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh, UniversalCamera, VolumetricLightScatteringPostProcess } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createPlantTexture, createSandTexture, createWoodTexture } from '../demo/pixel-texture'

const hasGodRays = shallowRef(true)
const exposure = shallowRef(0.32)
const density = shallowRef(0.92)

const godRays = shallowRef<VolumetricLightScatteringPostProcess>()

/** 遮蔽用那一張圖畫多大，光束是糊的，低到四分之一也看不出差別 */
const PASS_RATIO = 0.25
/** 沿著光線取樣幾次，越多越平滑也越貴 */
const SAMPLE_COUNT = 60

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    Material,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Texture,
    Vector3,
  } = babylon

  /** 黃昏，光束只在太陽貼近地平線時出現 */
  scene.clearColor = new Color4(0.72, 0.44, 0.3, 1)

  const sun = new DirectionalLight('sun', new Vector3(0, -0.22, 1), scene)
  sun.intensity = 0.85
  sun.diffuse = new Color3(1, 0.62, 0.34)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.62
  ambient.diffuse = new Color3(0.88, 0.68, 0.64)
  ambient.groundColor = new Color3(0.46, 0.36, 0.32)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, scene)
  ground.material = sandMaterial

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const leafTexture = createPlantTexture(
    { babylon, scene, name: 'leaf-texture', hasMipmap: false },
    [72, 118, 52],
  )
  leafTexture.hasAlpha = true
  const leafMaterial = new StandardMaterial('leaf', scene)
  leafMaterial.diffuseTexture = leafTexture
  leafMaterial.useAlphaFromDiffuseTexture = true
  leafMaterial.transparencyMode = Material.MATERIAL_ALPHATEST
  leafMaterial.alphaCutOff = 0.5
  leafMaterial.backFaceCulling = false
  leafMaterial.specularColor = new Color3(0, 0, 0)

  /**
   * 一座鳥居與幾棵樹擋在太陽前面
   *
   * 光束是從縫隙透出來的，沒有東西擋著就只是一團亮
   */
  for (const x of [-3, 3]) {
    const pillar = MeshBuilder.CreateBox(`torii-${x}`, { width: 0.7, height: 7, depth: 0.7 }, scene)
    pillar.position.set(x, 3.5, -10)
    pillar.material = woodMaterial
  }

  const beam = MeshBuilder.CreateBox('torii-beam', { width: 8.4, height: 0.7, depth: 0.8 }, scene)
  beam.position.set(0, 7.2, -10)
  beam.material = woodMaterial

  const crossBeam = MeshBuilder.CreateBox('torii-cross', { width: 7, height: 0.5, depth: 0.6 }, scene)
  crossBeam.position.set(0, 5.9, -10)
  crossBeam.material = woodMaterial

  for (const [x, z] of [[-6.5, -13], [6.2, -12], [-8.5, -8]] as const) {
    for (let level = 0; level < 4; level++) {
      const trunk = MeshBuilder.CreateBox(`trunk-${x}-${level}`, { size: 1 }, scene)
      trunk.position.set(x, level + 0.5, z)
      trunk.material = woodMaterial
    }

    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2
      const leaf = MeshBuilder.CreatePlane(`leaf-${x}-${index}`, { size: 2 }, scene)
      leaf.position.set(x + Math.cos(angle) * 1.4, 5 + Math.sin(angle * 2) * 0.8, z + Math.sin(angle) * 1.4)
      leaf.rotation.y = angle
      leaf.material = leafMaterial
    }
  }

  /**
   * 太陽本體
   *
   * 光束是繞著這片網格在畫面上的投影位置往外掃的
   */
  const sunMaterial = new StandardMaterial('sun-disc', scene)
  sunMaterial.diffuseColor = new Color3(0, 0, 0)
  sunMaterial.specularColor = new Color3(0, 0, 0)
  sunMaterial.emissiveColor = new Color3(1, 0.86, 0.62)
  sunMaterial.disableLighting = true

  const sunDisc: Mesh = MeshBuilder.CreatePlane('sun-disc', { size: 4 }, scene)
  sunDisc.material = sunMaterial
  sunDisc.position.set(0, 4.5, -26)
  sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL

  const currentGodRays = new babylon.VolumetricLightScatteringPostProcess(
    'god-rays',
    { postProcessRatio: 1, passRatio: PASS_RATIO },
    camera as unknown as UniversalCamera,
    sunDisc,
    SAMPLE_COUNT,
    Texture.BILINEAR_SAMPLINGMODE,
    scene.getEngine(),
    false,
    scene,
  )

  /**
   * 補上它自己漏掉的預設參數
   *
   * dispose 的第一行無條件讀 camera，而基底類別那個參數本來是選填的。
   * 場景自己回收後製時不帶參數呼叫，整個 dispose 會當場中斷
   */
  const disposeGodRays = currentGodRays.dispose.bind(currentGodRays)
  currentGodRays.dispose = (disposeCamera?: Parameters<typeof disposeGodRays>[0]) => {
    disposeGodRays(disposeCamera ?? camera)
  }

  currentGodRays.decay = 0.965
  currentGodRays.weight = 0.58
  godRays.value = currentGodRays

  applySetting()

  return () => {
    currentGodRays.dispose(camera)
    godRays.value = undefined
  }
}

function applySetting() {
  const currentGodRays = godRays.value
  if (!currentGodRays)
    return

  currentGodRays.exposure = hasGodRays.value ? exposure.value : 0
  currentGodRays.density = density.value
}

watch([hasGodRays, exposure, density], applySetting)
</script>
