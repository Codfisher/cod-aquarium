<template>
  <compare-grid
    title="FXAA 與多重取樣的差別"
    caption="兩邊的幾何邊緣都平順了，但 FXAA 是拿成品去找亮度落差再抹開，它分不出「幾何邊緣」與「貼圖上本來就相鄰的兩格不同顏色」。放大看石縫與草葉，左邊被糊掉一層，右邊一個像素都沒動。"
  >
    <demo-frame
      :setup="setupFxaa"
      badge="FXAA"
      compact
      :camera-alpha="-Math.PI / 2.5"
      :camera-beta="Math.PI / 2.6"
      :camera-radius="4.2"
      :camera-target="[0, 0.5, 0]"
      :height="240"
      :interactive="false"
    />
    <demo-frame
      :setup="setupMsaa"
      badge="多重取樣 ×4"
      compact
      :camera-alpha="-Math.PI / 2.5"
      :camera-beta="Math.PI / 2.6"
      :camera-radius="4.2"
      :camera-target="[0, 0.5, 0]"
      :height="240"
      :interactive="false"
    />
  </compare-grid>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import CompareGrid from '../demo/compare-grid.vue'
import DemoFrame from '../demo/demo-frame.vue'
import { createPlantTexture, createStoneTexture } from '../demo/pixel-texture'

/**
 * 兩邊除了抗鋸齒之外完全相同
 *
 * 只差一個設定的兩個場景才比得出東西，所以共用同一份建置流程，
 * 由呼叫端決定要開哪一種
 */
function createScene(
  { babylon, scene, camera }: BabylonDemoContext,
  antialiasMode: 'fxaa' | 'msaa',
) {
  const { Color3, DirectionalLight, HemisphericLight, Material, MeshBuilder, StandardMaterial, Vector3 } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.7, -0.5), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.8
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 轉一個角度，才有斜的幾何邊緣可以看抗鋸齒 */
  const box = MeshBuilder.CreateBox('block', { size: 1.6 }, scene)
  box.position.set(-0.55, 0.8, 0)
  box.rotation.y = Math.PI / 7
  box.material = stoneMaterial

  const secondBox = MeshBuilder.CreateBox('block-2', { size: 1.1 }, scene)
  secondBox.position.set(0.95, 0.55, -0.4)
  secondBox.rotation.y = -Math.PI / 9
  secondBox.material = stoneMaterial

  /** 鏤空的草，貼圖被糊掉時這裡最明顯 */
  const plantMaterial = new StandardMaterial('plant', scene)
  const plantTexture = createPlantTexture({ babylon, scene, name: 'plant-texture', hasMipmap: false })
  plantTexture.hasAlpha = true
  plantMaterial.diffuseTexture = plantTexture
  plantMaterial.useAlphaFromDiffuseTexture = true
  plantMaterial.transparencyMode = Material.MATERIAL_ALPHATEST
  plantMaterial.alphaCutOff = 0.5
  plantMaterial.backFaceCulling = false
  plantMaterial.specularColor = new Color3(0, 0, 0)

  for (const [x, z, angle] of [[0.9, 0.7, Math.PI / 4], [1.5, 0.5, -Math.PI / 4]] as const) {
    const plane = MeshBuilder.CreatePlane(`plant-${x}`, { size: 1 }, scene)
    plane.position.set(x, 0.5, z)
    plane.rotation.y = angle
    plane.material = plantMaterial
  }

  const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene)
  ground.material = stoneMaterial

  const pipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', false, scene, [camera])
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = true
  pipeline.imageProcessing.toneMappingType = babylon.ImageProcessingConfiguration.TONEMAPPING_ACES
  pipeline.imageProcessing.exposure = 1.06
  pipeline.bloomEnabled = false

  if (antialiasMode === 'fxaa') {
    pipeline.fxaaEnabled = true
    pipeline.samples = 1
  }
  else {
    pipeline.fxaaEnabled = false
    pipeline.samples = 4
  }

  /** 慢慢轉，鋸齒與糊掉的貼圖在移動時最看得出來 */
  const observer = scene.onBeforeRenderObservable.add(() => {
    camera.alpha += scene.getEngine().getDeltaTime() / 1000 * 0.12
  })

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    pipeline.dispose()
  }
}

function setupFxaa(context: BabylonDemoContext) {
  return createScene(context, 'fxaa')
}

function setupMsaa(context: BabylonDemoContext) {
  return createScene(context, 'msaa')
}
</script>
