<template>
  <demo-frame
    :setup="setupScene"
    title="法線、視差與高光貼圖"
    caption="法線圖的 RGB 是切線空間的法線、alpha 是高度，Babylon 的 bumpTexture 正好吃這個排法。視差會依視角把取樣座標推開一點，石縫看起來是真的有深度而不只是一道畫上去的暗線。高光圖的紅色通道則是這個表面有多光滑。"
    :camera-alpha="-Math.PI / 2.5"
    :camera-beta="Math.PI / 2.5"
    :camera-radius="4.6"
    :camera-target="[0, 0.6, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasBump"
      label="法線貼圖"
    />
    <demo-toggle
      v-model="hasParallax"
      label="視差"
    />
    <demo-toggle
      v-model="hasSpecular"
      label="高光貼圖"
    />
    <demo-slider
      v-model="parallaxScale"
      label="位移量"
      :min="0"
      :max="0.3"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DynamicTexture, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createNormalTexture, createSpecularTexture, createStoneTexture } from '../demo/pixel-texture'

const hasBump = shallowRef(true)
const hasParallax = shallowRef(true)
const hasSpecular = shallowRef(true)
/**
 * 位移量壓得很小
 *
 * 一格方塊只有一格見方，位移大一點邊緣就會被推出格子外，
 * 相鄰兩顆方塊之間裂出一道縫
 */
const parallaxScale = shallowRef(0.06)

const material = shallowRef<StandardMaterial>()
const normalTexture = shallowRef<DynamicTexture>()
const specularTexture = shallowRef<DynamicTexture>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  /**
   * 光要夠斜
   *
   * 法線與視差都是靠明暗差別呈現的，頂光會把凹凸整個打平
   */
  const sun = new DirectionalLight('sun', new Vector3(0.86, -0.4, -0.32), scene)
  sun.intensity = 1.25
  sun.diffuse = new Color3(1, 0.93, 0.78)
  /** 高光給滿，讓材質自己決定要反射多少 */
  sun.specular = new Color3(1, 1, 1)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.55
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const stoneTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })

  const currentMaterial = new StandardMaterial('stone', scene)
  currentMaterial.diffuseTexture = stoneTexture
  currentMaterial.specularColor = new Color3(0.42, 0.42, 0.42)
  currentMaterial.specularPower = 42

  normalTexture.value = createNormalTexture(
    { babylon, scene, name: 'stone-normal' },
    stoneTexture,
  )
  specularTexture.value = createSpecularTexture(
    { babylon, scene, name: 'stone-specular' },
    stoneTexture,
  )

  material.value = currentMaterial

  /** 一小面牆，斜著看才看得出視差把石縫推開 */
  for (let x = -1; x <= 1; x++) {
    for (let y = 0; y < 2; y++) {
      const box = MeshBuilder.CreateBox(`wall-${x}-${y}`, { size: 1 }, scene)
      box.position.set(x, y + 0.5, 0)
      box.material = currentMaterial
    }
  }

  applySetting()

  return () => {
    material.value = undefined
    normalTexture.value = undefined
    specularTexture.value = undefined
  }
}

function applySetting() {
  const currentMaterial = material.value
  if (!currentMaterial)
    return

  currentMaterial.bumpTexture = hasBump.value ? normalTexture.value ?? null : null

  /**
   * 視差要有法線才開得起來
   *
   * 它推的是取樣座標，而推多遠是從法線圖的 alpha 讀出來的
   */
  currentMaterial.useParallax = hasBump.value && hasParallax.value
  currentMaterial.parallaxScaleBias = parallaxScale.value

  currentMaterial.specularTexture = hasSpecular.value ? specularTexture.value ?? null : null
}

watch([hasBump, hasParallax, hasSpecular, parallaxScale], applySetting)
</script>
