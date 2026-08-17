<template>
  <compare-grid
    :columns="3"
    title="礦石是疊出來的"
    caption="左邊是石頭底、中間是礦點那張背景全透明的圖，單獨看是一張破圖。用 DynamicTexture 在 Canvas 上把兩張合成之後才成為一顆礦石。換材質包時這件事要重做一次，因為底圖換了。"
  >
    <demo-frame
      :setup="setupBase"
      badge="石頭底"
      compact
      v-bind="cameraParam"
    />
    <demo-frame
      :setup="setupOverlay"
      badge="礦點覆蓋層"
      compact
      v-bind="cameraParam"
    />
    <demo-frame
      :setup="setupComposited"
      badge="合成結果"
      compact
      v-bind="cameraParam"
    />
  </compare-grid>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import CompareGrid from '../demo/compare-grid.vue'
import DemoFrame from '../demo/demo-frame.vue'
import { compositeTexture, createOreOverlayTexture, createStoneTexture } from '../demo/pixel-texture'

const cameraParam = {
  cameraAlpha: -Math.PI / 2.6,
  cameraBeta: Math.PI / 3,
  cameraRadius: 3.2,
  cameraTarget: [0, 0, 0] as [number, number, number],
  height: 220,
}

type ComposeMode = 'base' | 'overlay' | 'composited'

/** 金礦的顏色 */
const ORE_COLOR: [number, number, number] = [226, 178, 54]

function createScene({ babylon, scene }: BabylonDemoContext, mode: ComposeMode) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    Material,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.66, -0.5), scene)
  sun.intensity = 1.15
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const stoneTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  const oreTexture = createOreOverlayTexture(
    { babylon, scene, name: 'ore-overlay' },
    ORE_COLOR,
  )

  const material = new StandardMaterial('block', scene)
  material.specularColor = new Color3(0.02, 0.02, 0.02)

  if (mode === 'base') {
    material.diffuseTexture = stoneTexture
  }
  else if (mode === 'overlay') {
    /**
     * 覆蓋層單獨掛上來
     *
     * 背景是全透明的，所以看到的是一顆缺了大半的方塊，
     * 那正是「單獨看是一張破圖」的意思
     */
    oreTexture.hasAlpha = true
    material.diffuseTexture = oreTexture
    material.useAlphaFromDiffuseTexture = true
    material.transparencyMode = Material.MATERIAL_ALPHATEST
    material.alphaCutOff = 0.5
    material.backFaceCulling = false
  }
  else {
    material.diffuseTexture = compositeTexture(
      { babylon, scene, name: 'ore-composited' },
      stoneTexture,
      oreTexture,
    )
  }

  const box = MeshBuilder.CreateBox('block', { size: 1.6 }, scene)
  box.material = material

  /** 慢慢轉一圈，六個面都看得到 */
  const observer = scene.onBeforeRenderObservable.add(() => {
    box.rotation.y += scene.getEngine().getDeltaTime() / 1000 * 0.35
  })

  return () => scene.onBeforeRenderObservable.remove(observer)
}

function setupBase(context: BabylonDemoContext) {
  return createScene(context, 'base')
}

function setupOverlay(context: BabylonDemoContext) {
  return createScene(context, 'overlay')
}

function setupComposited(context: BabylonDemoContext) {
  return createScene(context, 'composited')
}
</script>
