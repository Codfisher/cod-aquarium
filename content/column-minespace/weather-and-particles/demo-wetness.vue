<template>
  <demo-frame
    :setup="setupScene"
    title="雨後的濕潤"
    caption="兩件事同時做，漫射壓暗、高光提亮並散開。濕的表面看起來比乾的暗，因為水填進了孔隙，進去的光在裡面多反射幾次才出得來；高光則相反，水鋪成一層平滑的膜，原本被粗糙表面打散的反射全部聚回同一個方向。兩者缺一都不成立，只壓暗會變成髒，只加高光會變成上了一層蠟。"
    :camera-alpha="-Math.PI / 2.35"
    :camera-beta="Math.PI / 2.6"
    :camera-radius="15"
    :camera-target="[0, 1.2, 0]"
    :height="300"
  >
    <demo-slider
      v-model="wetRatio"
      label="濕潤度"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-toggle
      v-model="hasDiffuseDim"
      label="漫射壓暗"
    />
    <demo-toggle
      v-model="hasSpecularBoost"
      label="高光提亮"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const wetRatio = shallowRef(0)
const hasDiffuseDim = shallowRef(true)
const hasSpecularBoost = shallowRef(true)

/** 淋濕之後漫射還剩多少 */
const WET_DIFFUSE_RATIO = 0.68
/** 淋濕之後高光有多強 */
const WET_SPECULAR = 0.42
/** 濕的表面高光要散開，不是聚成一個小點 */
const WET_SPECULAR_POWER = 20

interface MaterialBackup {
  material: StandardMaterial;
  diffuse: [number, number, number];
  specular: [number, number, number];
  specularPower: number;
}

/** 記住原本的顏色，之後每次都拿原色去算 */
const backupList = shallowRef<MaterialBackup[]>([])

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.78, 0.82, 0.88, 1)

  /**
   * 斜射的陽光
   *
   * 濕地面那道刺眼的反光要有斜射光才照得出來，
   * 頂光只會在正下方留一個小點
   */
  const sun = new DirectionalLight('sun', new Vector3(0.82, -0.42, -0.38), scene)
  sun.intensity = 1.25
  sun.diffuse = new Color3(1, 0.93, 0.78)
  /** 高光給滿，讓材質自己決定要反射多少 */
  sun.specular = new Color3(1, 1, 1)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.72
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  sandMaterial.specularPower = 64

  const ground = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  stoneMaterial.specularPower = 64

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  /**
   * 木頭原本的高光乾脆是零
   *
   * 這正是「高光要往同一個目標值收，不是照原值放大」的理由，
   * 照倍率放大的話它永遠濕不起來
   */
  woodMaterial.specularColor = new Color3(0, 0, 0)
  woodMaterial.specularPower = 64

  /** 一段木棧道加幾顆石頭，兩種材質一起看差別最清楚 */
  for (let index = 0; index < 7; index++) {
    const plank = MeshBuilder.CreateBox(`plank-${index}`, { width: 4, height: 0.2, depth: 0.8 }, scene)
    plank.position.set(0, 0.35, index * 1 - 3)
    plank.material = woodMaterial
  }

  for (const [x, z, height] of [[-3.4, -1, 2], [3.6, 1.5, 1], [-2.6, 3, 1]] as const) {
    for (let level = 0; level < height; level++) {
      const box = MeshBuilder.CreateBox(`stone-${x}-${level}`, { size: 1 }, scene)
      box.position.set(x, level + 0.5, z)
      box.material = stoneMaterial
    }
  }

  backupList.value = [sandMaterial, stoneMaterial, woodMaterial].map((material) => ({
    material,
    diffuse: [material.diffuseColor.r, material.diffuseColor.g, material.diffuseColor.b],
    specular: [material.specularColor.r, material.specularColor.g, material.specularColor.b],
    specularPower: material.specularPower,
  }))

  applySetting()

  return () => {
    backupList.value = []
  }
}

function applySetting() {
  const wet = wetRatio.value

  for (const backup of backupList.value) {
    const { material, diffuse, specular } = backup

    /**
     * 不能在現值上再乘一次
     *
     * 那樣調個幾次就會越調越黑，再也回不來
     */
    const diffuseRatio = hasDiffuseDim.value ? lerp(1, WET_DIFFUSE_RATIO, wet) : 1
    material.diffuseColor.set(
      diffuse[0] * diffuseRatio,
      diffuse[1] * diffuseRatio,
      diffuse[2] * diffuseRatio,
    )

    if (!hasSpecularBoost.value) {
      material.specularColor.set(specular[0], specular[1], specular[2])
      material.specularPower = backup.specularPower
      continue
    }

    /** 高光往同一個目標值收，不是照原值放大 */
    material.specularColor.set(
      lerp(specular[0], WET_SPECULAR, wet),
      lerp(specular[1], WET_SPECULAR, wet),
      lerp(specular[2], WET_SPECULAR, wet),
    )
    material.specularPower = lerp(backup.specularPower, WET_SPECULAR_POWER, wet)
  }
}

watch([wetRatio, hasDiffuseDim, hasSpecularBoost], applySetting)
</script>
