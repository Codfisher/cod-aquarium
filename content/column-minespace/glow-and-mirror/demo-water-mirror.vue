<template>
  <demo-frame
    :setup="setupScene"
    title="水面倒影"
    caption="把天空從反射清單裡拿掉，池面上就只剩岸邊的石燈籠；把地景拿掉則變成一塊開在地上的天窗。兩邊都要進來才是一面鏡子。倒影濃度則決定水自己的顏色還留多少。"
    :camera-alpha="-Math.PI / 2.2"
    :camera-beta="Math.PI / 2.9"
    :camera-radius="18"
    :camera-target="[0, 1, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasSky"
      label="映天空"
    />
    <demo-toggle
      v-model="hasBlock"
      label="映地景"
    />
    <demo-slider
      v-model="mirrorStrength"
      label="倒影濃度"
      :min="0"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { AbstractMesh, MirrorTexture, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const hasSky = shallowRef(true)
const hasBlock = shallowRef(true)
const mirrorStrength = shallowRef(0.5)

const mirrorTexture = shallowRef<MirrorTexture>()
const mirrorMaterial = shallowRef<StandardMaterial>()
const skyMeshList = shallowRef<AbstractMesh[]>([])
const blockMeshList = shallowRef<AbstractMesh[]>([])

/** 水面比方塊頂面矮八分之一格，與本體同一個規格 */
const LIQUID_SURFACE_DROP = 0.125
/** 兩片幾乎同高的半透明面會互相爭深度，抬高一點點就分得開 */
const SURFACE_LIFT = 0.02

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    DynamicTexture,
    HemisphericLight,
    Material,
    MeshBuilder,
    MirrorTexture: BabylonMirrorTexture,
    Plane,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.6, 0.78, 0.99, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.62, -0.6, -0.5), scene)
  sun.intensity = 1.2
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  /**
   * 一個假的天空盒
   *
   * 只有天空進得了反射清單，池面上才看得到雲飄過去
   */
  const skyTexture = new DynamicTexture('sky-texture', { width: 256, height: 256 }, scene, true)
  const skyContext = skyTexture.getContext() as CanvasRenderingContext2D
  const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256)
  skyGradient.addColorStop(0, 'rgb(58, 118, 226)')
  skyGradient.addColorStop(0.62, 'rgb(146, 194, 246)')
  skyGradient.addColorStop(1, 'rgb(238, 240, 236)')
  skyContext.fillStyle = skyGradient
  skyContext.fillRect(0, 0, 256, 256)

  /** 幾朵方塊雲，倒影裡看得到才有意思 */
  skyContext.fillStyle = 'rgba(255, 255, 255, 0.92)'
  for (const [x, y, width, height] of [[24, 44, 62, 18], [128, 30, 48, 14], [188, 62, 44, 16], [66, 84, 40, 12]]) {
    skyContext.fillRect(x!, y!, width!, height!)
  }
  skyTexture.update()

  const skyMaterial = new StandardMaterial('sky', scene)
  skyMaterial.diffuseTexture = skyTexture
  skyMaterial.diffuseColor = new Color3(0, 0, 0)
  skyMaterial.specularColor = new Color3(0, 0, 0)
  skyMaterial.emissiveColor = new Color3(1, 1, 1)
  skyMaterial.disableLighting = true
  skyMaterial.backFaceCulling = false

  const skyDome = MeshBuilder.CreateBox('sky-dome', { size: 120 }, scene)
  skyDome.material = skyMaterial
  skyDome.infiniteDistance = true
  skyDome.isPickable = false

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
  ground.material = sandMaterial

  /** 岸邊的東西，倒影裡要看得到它們 */
  const landmarkList: AbstractMesh[] = []

  for (const [x, z] of [[-5, -4], [5.5, -3], [-4.5, 4.5]] as const) {
    const base = MeshBuilder.CreateBox(`lantern-base-${x}`, { width: 1.1, height: 0.9, depth: 1.1 }, scene)
    base.position.set(x, 0.45, z)
    base.material = stoneMaterial

    const head = MeshBuilder.CreateBox(`lantern-head-${x}`, { width: 1.4, height: 0.9, depth: 1.4 }, scene)
    head.position.set(x, 1.7, z)
    head.material = stoneMaterial

    const post = MeshBuilder.CreateBox(`lantern-post-${x}`, { width: 0.35, height: 0.5, depth: 0.35 }, scene)
    post.position.set(x, 1.15, z)
    post.material = woodMaterial

    landmarkList.push(base, head, post)
  }

  const torii = MeshBuilder.CreateBox('torii', { width: 0.5, height: 5, depth: 0.5 }, scene)
  torii.position.set(-2.4, 2.5, -8)
  torii.material = woodMaterial

  const toriiRight = MeshBuilder.CreateBox('torii-right', { width: 0.5, height: 5, depth: 0.5 }, scene)
  toriiRight.position.set(2.4, 2.5, -8)
  toriiRight.material = woodMaterial

  const beam = MeshBuilder.CreateBox('beam', { width: 6.4, height: 0.5, depth: 0.6 }, scene)
  beam.position.set(0, 5.2, -8)
  beam.material = woodMaterial

  landmarkList.push(torii, toriiRight, beam, ground)

  /** 水面 */
  const surfaceY = 0.4 - LIQUID_SURFACE_DROP
  const waterMaterial = new StandardMaterial('water', scene)
  waterMaterial.diffuseColor = new Color3(0.22, 0.42, 0.5)
  waterMaterial.specularColor = new Color3(0.8, 0.82, 0.85)
  waterMaterial.specularPower = 160
  waterMaterial.alpha = 0.9

  const water = MeshBuilder.CreateGround('water', { width: 9, height: 9 }, scene)
  water.position.set(0, surfaceY, 0)
  water.material = waterMaterial

  /**
   * 倒影面
   *
   * 鏡面方程式的法線朝下、位移等於水面高度，
   * 方向弄反的話倒影會映到水面上方去
   */
  const texture = new BabylonMirrorTexture('water-mirror', 512, scene, true)
  texture.mirrorPlane = new Plane(0, -1, 0, surfaceY)
  texture.renderList = [skyDome, ...landmarkList]
  mirrorTexture.value = texture

  const material = new StandardMaterial('water-mirror-material', scene)
  /** 只留倒影，其他通道全部關掉 */
  material.diffuseColor = new Color3(0, 0, 0)
  material.specularColor = new Color3(0, 0, 0)
  material.emissiveColor = new Color3(0, 0, 0)
  material.disableLighting = true
  material.reflectionTexture = texture
  material.reflectionTexture.level = 1
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.backFaceCulling = true
  material.fogEnabled = false
  mirrorMaterial.value = material

  const mirrorSurface = MeshBuilder.CreateGround('water-mirror-surface', { width: 9, height: 9 }, scene)
  mirrorSurface.material = material
  mirrorSurface.position.set(0, surfaceY + SURFACE_LIFT, 0)
  mirrorSurface.isPickable = false

  skyMeshList.value = [skyDome]
  blockMeshList.value = landmarkList

  applySetting()
}

function applySetting() {
  const texture = mirrorTexture.value
  const material = mirrorMaterial.value
  if (!texture || !material)
    return

  texture.renderList = [
    ...(hasSky.value ? skyMeshList.value : []),
    ...(hasBlock.value ? blockMeshList.value : []),
  ]
  material.alpha = mirrorStrength.value
}

watch([hasSky, hasBlock, mirrorStrength], applySetting)
</script>
