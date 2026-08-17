<template>
  <demo-frame
    :setup="setupScene"
    title="把法線全部改成朝上"
    caption="交叉立板是兩片互相垂直的平面，照原本的法線打光，一片正對太陽、另一片背光，同一株草就切成一亮一暗兩半。法線統一朝上之後整株取同一個亮度，那才是 Minecraft 的平塗感。"
    :camera-alpha="-Math.PI / 2.7"
    :camera-beta="Math.PI / 2.75"
    :camera-radius="3.6"
    :camera-target="[0, 0.55, 0]"
    :height="280"
  >
    <demo-toggle
      v-model="isUpwardNormal"
      label="法線一律朝上"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createPlantTexture, createSandTexture } from '../demo/pixel-texture'

const isUpwardNormal = shallowRef(true)

/** 每一片立板原本的法線，切回去時要用 */
const originalNormalMap = new Map<Mesh, Float32Array>()
const plantMeshList = shallowRef<Mesh[]>([])

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    Material,
    MeshBuilder,
    StandardMaterial,
    Vector3,
    VertexBuffer,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  /**
   * 光要夠斜
   *
   * 頂光的話兩片立板拿到的亮度差不多，整個差別就看不出來了
   */
  const sun = new DirectionalLight('sun', new Vector3(0.85, -0.45, -0.28), scene)
  sun.intensity = 1.15
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.62
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 16, height: 16 }, scene)
  ground.material = sandMaterial

  const plantMaterial = new StandardMaterial('plant', scene)
  const plantTexture = createPlantTexture({ babylon, scene, name: 'plant-texture', hasMipmap: false })
  plantTexture.hasAlpha = true
  plantMaterial.diffuseTexture = plantTexture
  plantMaterial.useAlphaFromDiffuseTexture = true
  plantMaterial.transparencyMode = Material.MATERIAL_ALPHATEST
  plantMaterial.alphaCutOff = 0.5
  plantMaterial.backFaceCulling = false
  /**
   * 法線改朝上之後就要關掉背面翻轉
   *
   * 不關的話背面會朝下而變暗，兩片立板又會一亮一暗，
   * 等於白改了。這一項與法線是一組的
   */
  plantMaterial.twoSidedLighting = false
  plantMaterial.specularColor = new Color3(0, 0, 0)

  const meshList: Mesh[] = []

  /** 排一小叢草，一株看不太出來 */
  const spotList: [number, number][] = [
    [0, 0],
    [-1.4, 0.6],
    [1.3, -0.5],
    [0.6, 1.4],
    [-0.8, -1.3],
  ]

  for (const [x, z] of spotList) {
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const plane = MeshBuilder.CreatePlane(`plant-${x}-${z}-${angle}`, { size: 1 }, scene)
      plane.position.set(x, 0.5, z)
      plane.rotation.y = angle
      plane.material = plantMaterial

      const normalList = plane.getVerticesData(VertexBuffer.NormalKind)
      if (normalList) {
        originalNormalMap.set(plane, Float32Array.from(normalList))
      }

      meshList.push(plane)
    }
  }

  plantMeshList.value = meshList
  applyNormal()

  return () => {
    originalNormalMap.clear()
    plantMeshList.value = []
  }
}

function applyNormal() {
  const meshList = plantMeshList.value
  if (meshList.length === 0)
    return

  for (const mesh of meshList) {
    const original = originalNormalMap.get(mesh)
    if (!original)
      continue

    if (!isUpwardNormal.value) {
      mesh.setVerticesData('normal', Array.from(original))
      continue
    }

    /** 每三個數字是一個法線，全部改成 (0, 1, 0) */
    const normalList = Array.from(original)
    for (let index = 0; index < normalList.length; index += 3) {
      normalList[index] = 0
      normalList[index + 1] = 1
      normalList[index + 2] = 0
    }
    mesh.setVerticesData('normal', normalList)
  }
}

watch(isUpwardNormal, applyNormal)
</script>
