<template>
  <demo-frame
    :setup="setupScene"
    title="影子邊緣為什麼會爬"
    caption="投影範圍跟著人走，而投影矩陣一直在變，同一道邊緣每一幀落在不同的深度取樣點上，影子就沿著行進方向不停爬動。解法是把投影中心對齊到貼圖的取樣格，而且必須在光源自己的三軸上對齊，因為陰影貼圖的格子長在光源空間、光源又是斜的。"
    :camera-alpha="-Math.PI / 2.5"
    :camera-beta="Math.PI / 3.2"
    :camera-radius="17"
    :camera-target="[0, 1, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isSnapped"
      label="對齊取樣格"
    />
    <demo-toggle
      v-model="isWorldSpaceSnap"
      label="改在世界座標上對齊"
    />
    <demo-toggle
      v-model="isMoving"
      label="讓人走動"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const isSnapped = shallowRef(true)
/**
 * 曾經走過的那條錯路
 *
 * 直接把世界座標各軸對齊取樣格。格子長在光源空間上而光源是斜的，
 * 對齊出來的位置投影過去並不會落在整數格，邊緣照樣每幀重新取樣
 */
const isWorldSpaceSnap = shallowRef(false)
const isMoving = shallowRef(true)

/** 投影範圍的半邊長，與貼圖尺寸一起決定一個取樣格有多大 */
const SHADOW_HALF_EXTENT = 14
const SHADOW_MAP_SIZE = 1024
const SHADOW_LIGHT_DISTANCE = 40

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

  const sun = new DirectionalLight('sun', new Vector3(0.62, -0.6, -0.5), scene)
  sun.intensity = 1.3
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sun.autoUpdateExtends = false
  sun.orthoLeft = -SHADOW_HALF_EXTENT
  sun.orthoRight = SHADOW_HALF_EXTENT
  sun.orthoTop = SHADOW_HALF_EXTENT
  sun.orthoBottom = -SHADOW_HALF_EXTENT
  sun.shadowMinZ = 1
  sun.shadowMaxZ = SHADOW_LIGHT_DISTANCE + 40

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.6
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const generator = new ShadowGenerator(SHADOW_MAP_SIZE, sun)
  generator.usePercentageCloserFiltering = true
  generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
  generator.bias = 0.0005
  generator.normalBias = 0.08
  generator.darkness = 0.05

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, scene)
  ground.material = sandMaterial
  ground.receiveShadows = true

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /**
   * 幾根細長的柱子
   *
   * 影子拉得越長，邊緣爬動越明顯。
   * 一顆方塊的短影子是看不出這個問題的
   */
  const casterList = [
    { position: [-3.4, 2.4, -1], size: [0.5, 4.8, 0.5], material: woodMaterial },
    { position: [3.2, 2, 1.6], size: [0.5, 4, 0.5], material: woodMaterial },
    { position: [0, 4.4, 0.4], size: [7.4, 0.5, 0.5], material: woodMaterial },
    { position: [-1.2, 0.6, 3.4], size: [1.2, 1.2, 1.2], material: stoneMaterial },
  ] as const

  for (const [index, caster] of casterList.entries()) {
    const [width, height, depth] = caster.size
    const box = MeshBuilder.CreateBox(`caster-${index}`, { width, height, depth }, scene)
    box.position.set(...caster.position)
    box.material = caster.material
    box.receiveShadows = true
    generator.addShadowCaster(box)
  }

  /** 光源空間的三軸與暫存，每幀就地覆寫，不重新配置 */
  const forward = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const center = new Vector3()
  const rawCenter = new Vector3()

  /** 取樣格的大小要照實際的貼圖尺寸算 */
  const texelSize = (SHADOW_HALF_EXTENT * 2) / SHADOW_MAP_SIZE

  let elapsed = 0

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (isMoving.value) {
      elapsed += scene.getEngine().getDeltaTime() / 1000
    }

    /** 假裝有個人在走，投影中心跟著他移動 */
    rawCenter.set(Math.sin(elapsed * 0.35) * 6, 0, Math.cos(elapsed * 0.22) * 4)

    forward.copyFrom(sun.direction).normalize()
    Vector3.CrossToRef(Vector3.UpReadOnly, forward, right)
    right.normalize()
    Vector3.CrossToRef(forward, right, up)

    if (!isSnapped.value) {
      center.copyFrom(rawCenter)
    }
    else if (isWorldSpaceSnap.value) {
      /**
       * 世界座標各軸各自對齊
       *
       * 看起來很合理，但格子長在光源空間上，
       * 投影過去並不會落在整數格
       */
      center.set(
        Math.round(rawCenter.x / texelSize) * texelSize,
        Math.round(rawCenter.y / texelSize) * texelSize,
        Math.round(rawCenter.z / texelSize) * texelSize,
      )
    }
    else {
      /**
       * 投影到光源的三軸上，三軸都要對齊
       *
       * 深度那一軸也不能省，它影響存進去的深度值，
       * 卡在門檻上的取樣點會在兩種判定之間反覆翻面
       */
      const alongRight = Math.round(Vector3.Dot(rawCenter, right) / texelSize) * texelSize
      const alongUp = Math.round(Vector3.Dot(rawCenter, up) / texelSize) * texelSize
      const alongForward = Math.round(Vector3.Dot(rawCenter, forward) / texelSize) * texelSize

      center.set(
        right.x * alongRight + up.x * alongUp + forward.x * alongForward,
        right.y * alongRight + up.y * alongUp + forward.y * alongForward,
        right.z * alongRight + up.z * alongUp + forward.z * alongForward,
      )
    }

    sun.position.set(
      center.x - forward.x * SHADOW_LIGHT_DISTANCE,
      center.y - forward.y * SHADOW_LIGHT_DISTANCE,
      center.z - forward.z * SHADOW_LIGHT_DISTANCE,
    )
  })

  return () => scene.onBeforeRenderObservable.remove(observer)
}
</script>
