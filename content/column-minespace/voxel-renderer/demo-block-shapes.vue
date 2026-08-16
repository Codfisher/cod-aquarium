<template>
  <demo-frame
    :setup="setupScene"
    title="不是正方體的方塊"
    caption="半磚、階梯、圍籬、玻璃片、薄層、細柱、薄板、吊飾、花盆與交叉立板，全部用小片的盒子與立板拼出來，再把同一份實例矩陣套到每一片上。圍籬與玻璃片還要看鄰居才知道往哪邊延伸，否則每根柱子都會長出四根懸空的橫桿。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 2.9"
    :camera-radius="16"
    :camera-target="[0, 0.7, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasNeighborCheck"
      label="圍籬依鄰居連接"
    />
    <demo-toggle
      v-model="hasLiquidDrop"
      label="水面矮八分之一格"
    />
    <demo-toggle
      v-model="isRotating"
      label="自動繞一圈"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { AbstractMesh, Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createPlantTexture, createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const hasNeighborCheck = shallowRef(true)
const isRotating = shallowRef(true)
const hasLiquidDrop = shallowRef(true)

/** Minecraft 的水面比方塊頂面矮這麼多 */
const LIQUID_SURFACE_DROP = 0.125

/** 沒有鄰居的那幾根橫桿，關掉檢查時會整組浮在空中 */
const danglingRailList = shallowRef<AbstractMesh[]>([])
const waterSurfaceList = shallowRef<Mesh[]>([])

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
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

  const sun = new DirectionalLight('sun', new Vector3(0.55, -0.66, -0.42), scene)
  sun.intensity = 1.2
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const plantTexture = createPlantTexture({ babylon, scene, name: 'plant-texture', hasMipmap: false })
  plantTexture.hasAlpha = true
  const plantMaterial = new StandardMaterial('plant', scene)
  plantMaterial.diffuseTexture = plantTexture
  plantMaterial.useAlphaFromDiffuseTexture = true
  plantMaterial.transparencyMode = Material.MATERIAL_ALPHATEST
  plantMaterial.alphaCutOff = 0.5
  plantMaterial.backFaceCulling = false
  plantMaterial.twoSidedLighting = false
  plantMaterial.specularColor = new Color3(0, 0, 0)

  /** 紙門那種薄板不做鏤空，紙是整片的，透光靠顏色不是洞 */
  const paperMaterial = new StandardMaterial('paper', scene)
  paperMaterial.diffuseColor = new Color3(0.92, 0.9, 0.82)
  paperMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const addBox = (
    name: string,
    size: { width: number; height: number; depth: number },
    position: [number, number, number],
    material: StandardMaterial,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, size, scene)
    mesh.position.set(...position)
    mesh.material = material

    return mesh
  }

  const addPlane = (
    name: string,
    size: number,
    rotationY: number,
    position: [number, number, number],
    material: StandardMaterial,
  ) => {
    const mesh = MeshBuilder.CreatePlane(name, { size }, scene)
    mesh.rotation.y = rotationY
    mesh.position.set(...position)
    mesh.material = material

    /** 花草一律平塗，否則交叉的兩片會一亮一暗 */
    const normalList = mesh.getVerticesData('normal')
    if (normalList) {
      for (let index = 0; index < normalList.length; index += 3) {
        normalList[index] = 0
        normalList[index + 1] = 1
        normalList[index + 2] = 0
      }
      mesh.setVerticesData('normal', normalList)
    }

    return mesh
  }

  /** 一排展示台，每一格擺一種外型 */
  let slot = -6

  /** slab：與整格同寬，只有半格高 */
  addBox('slab', { width: 1, height: 0.5, depth: 1 }, [slot, 0.25, 0], stoneMaterial)
  slot += 1.6

  /** stairs：座面加靠背 */
  addBox('stairs-seat', { width: 1, height: 0.5, depth: 1 }, [slot, 0.25, 0], stoneMaterial)
  addBox('stairs-back', { width: 1, height: 0.5, depth: 0.5 }, [slot, 0.75, -0.25], stoneMaterial)
  slot += 1.6

  /**
   * fence：柱子固定畫，四個方向的橫桿各自獨立
   *
   * 這裡擺三根，中間那根左右都有鄰居、兩端各缺一邊
   */
  const railList: AbstractMesh[] = []
  for (const [index, offset] of [-1, 0, 1].entries()) {
    addBox(
      `fence-post-${index}`,
      { width: 0.26, height: 1, depth: 0.26 },
      [slot + offset, 0.5, 0],
      woodMaterial,
    )

    for (const [directionIndex, direction] of [-1, 1].entries()) {
      /** 兩端往外那一側沒有鄰居，關掉檢查時就會浮出來 */
      const hasNeighbor = offset + direction >= -1 && offset + direction <= 1

      for (const [railIndex, railY] of [0.7, 0.34].entries()) {
        const rail = addBox(
          `fence-rail-${index}-${directionIndex}-${railIndex}`,
          { width: 0.37, height: 0.14, depth: 0.12 },
          [slot + offset + direction * 0.315, railY, 0],
          woodMaterial,
        )

        if (!hasNeighbor) {
          railList.push(rail)
        }
      }
    }
  }
  danglingRailList.value = railList
  slot += 3.4

  /** pane：中央一片薄板，厚度整根一致才不會凸出白柱 */
  addBox('pane-core', { width: 0.125, height: 1, depth: 0.125 }, [slot, 0.5, 0], stoneMaterial)
  addBox('pane-arm', { width: 0.5, height: 1, depth: 0.125 }, [slot + 0.25, 0.5, 0], stoneMaterial)
  slot += 1.6

  /** layer：一個扁盒子貼著格子底面，薄雪與榻榻米都是它 */
  addBox('layer', { width: 1, height: 0.125, depth: 1 }, [slot, 0.0625, 0], woodMaterial)
  slot += 1.6

  /** post：整格高但四周瘦下來，兩根之間走得過去 */
  addBox('post', { width: 0.3, height: 1, depth: 0.3 }, [slot, 0.5, 0], woodMaterial)
  slot += 1.6

  /** panel：立在格子正中央的紙門 */
  addBox('panel', { width: 1, height: 1, depth: 0.15 }, [slot, 0.5, 0], paperMaterial)
  slot += 1.6

  /** hanging：主體貼著上一格底面掛下來，底下垂一片會搖的紙 */
  addBox('hanging', { width: 0.4, height: 0.4, depth: 0.4 }, [slot, 1.3, 0], stoneMaterial)
  addPlane('hanging-tail', 0.28, Math.PI / 4, [slot, 0.96, 0], plantMaterial)
  slot += 1.6

  /** pot：盆身與植物兩片，共用同一份實例矩陣 */
  addBox('pot', { width: 0.42, height: 0.42, depth: 0.42 }, [slot, 0.21, 0], stoneMaterial)
  addPlane('pot-plant-a', 0.7, Math.PI / 4, [slot, 0.7, 0], plantMaterial)
  addPlane('pot-plant-b', 0.7, -Math.PI / 4, [slot, 0.7, 0], plantMaterial)
  slot += 1.6

  /** cross：兩片交叉的立板，地上的花草 */
  addPlane('cross-a', 1, Math.PI / 4, [slot, 0.5, 0], plantMaterial)
  addPlane('cross-b', 1, -Math.PI / 4, [slot, 0.5, 0], plantMaterial)

  /**
   * 一小池水
   *
   * 岸邊要露出一小截沙的側面，水才像是灌進地形裡，
   * 而不是一顆一顆水方塊疊出來的
   */
  const waterMaterial = new StandardMaterial('water', scene)
  waterMaterial.diffuseColor = new Color3(0.3, 0.55, 0.68)
  waterMaterial.specularColor = new Color3(0.8, 0.82, 0.85)
  waterMaterial.specularPower = 160
  waterMaterial.alpha = 0.82
  waterMaterial.backFaceCulling = true

  const bankList: [number, number][] = []
  for (let x = -3; x <= 3; x++) {
    for (let z = 3; z <= 7; z++) {
      const isEdge = x === -3 || x === 3 || z === 3 || z === 7
      if (isEdge) {
        bankList.push([x, z])
      }
    }
  }

  for (const [x, z] of bankList) {
    addBox(`bank-${x}-${z}`, { width: 1, height: 1, depth: 1 }, [x, 0.5, z], sandMaterial)
  }

  const surfaceList: Mesh[] = []
  for (let x = -2; x <= 2; x++) {
    for (let z = 4; z <= 6; z++) {
      const water = addBox(
        `water-${x}-${z}`,
        { width: 1, height: 1, depth: 1 },
        [x, 0.5, z],
        waterMaterial,
      )
      surfaceList.push(water)
    }
  }
  waterSurfaceList.value = surfaceList

  applySetting()

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!isRotating.value)
      return

    camera.alpha += scene.getEngine().getDeltaTime() / 1000 * 0.18
  })

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    danglingRailList.value = []
    waterSurfaceList.value = []
  }
}

function applySetting() {
  for (const rail of danglingRailList.value) {
    rail.setEnabled(!hasNeighborCheck.value)
  }

  /**
   * 只縮頂面那一層
   *
   * 水底下的格子仍舊是滿格，兩層之間不會出現縫隙
   */
  const drop = hasLiquidDrop.value ? LIQUID_SURFACE_DROP : 0
  for (const water of waterSurfaceList.value) {
    water.scaling.y = 1 - drop
    water.position.y = 0.5 - drop / 2
  }
}

watch([hasNeighborCheck, hasLiquidDrop], applySetting)
</script>
