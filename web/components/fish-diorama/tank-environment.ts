/** 乾涸魚缸箱庭場景：沙地、玻璃缸壁、石頭、水草、小城堡與點擊標記。
 *
 * 座標中心在缸底中央，x 為長邊、z 為短邊。
 */
import type { Scene } from '@babylonjs/core/scene'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { createBeveledBox } from './geometry-utils'

export const TANK_WIDTH = 11
export const TANK_DEPTH = 7
export const WALL_HEIGHT = 1.9

/** 魚可移動的沙地範圍（內縮避免貼牆） */
export const MOVE_BOUNDS_RECT = {
  minX: -TANK_WIDTH / 2 + 0.9,
  maxX: TANK_WIDTH / 2 - 0.9,
  minZ: -TANK_DEPTH / 2 + 0.8,
  maxZ: TANK_DEPTH / 2 - 0.8,
} as const

export interface TankEnvironment {
  /** 沙地網格（場景中唯一可 pick 的目標） */
  sandMesh: Mesh;
  /** 需要投影的網格 */
  shadowCasterMeshList: Mesh[];
  /** 每幀更新水草搖擺與點擊標記 */
  update: (timeSeconds: number, deltaSeconds: number) => void;
  /** 在指定位置播放 RPG 目的地漣漪標記 */
  showClickMarker: (x: number, z: number) => void;
  setDarkMode: (value: boolean) => void;
}

/** 沙地起伏高度，魚與標記貼地時共用同一公式 */
export function getSandHeight(x: number, z: number): number {
  return (
    0.05 * Math.sin(x * 1.7 + 1.3) * Math.cos(z * 2.1 + 0.7)
    + 0.04 * Math.sin(x * 3.1 + z * 1.9 + 2)
  )
}

/** 沙地斑駁明暗（約 0.82~0.98），乘上沙色做出顆粒質感，避免大片死平純色 */
function getSandShade(x: number, z: number): number {
  const noise
    = 0.5 * Math.sin(x * 4.3 + z * 2.1)
      + 0.3 * Math.sin(x * 9.1 - z * 7.3)
      + 0.2 * Math.sin(x * 16.7 + z * 12.9)
  return 0.82 + 0.16 * (noise * 0.5 + 0.5)
}

/** mulberry32 偽隨機數產生器，固定種子讓每次載入的擺設一致 */
function createRandomGenerator(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6D2B79F5) | 0
    let result = Math.imul(state ^ (state >>> 15), 1 | state)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

interface SwayItem {
  node: TransformNode;
  phase: number;
  speed: number;
  amplitude: number;
  baseLean: number;
}

const MARKER_DURATION_SECONDS = 0.6

function buildSandMesh(scene: Scene, material: StandardMaterial): Mesh {
  const sand = CreateGround(
    'tankSand',
    { width: TANK_WIDTH, height: TANK_DEPTH, subdivisions: 22 },
    scene,
  )

  const positionList = sand.getVerticesData(VertexBuffer.PositionKind)
  if (positionList) {
    for (let index = 0; index < positionList.length; index += 3) {
      const x = positionList[index] ?? 0
      const z = positionList[index + 2] ?? 0
      positionList[index + 1] = getSandHeight(x, z)
    }
    sand.updateVerticesData(VertexBuffer.PositionKind, positionList)
  }

  sand.convertToFlatShadedMesh()

  // 頂點色斑駁，讓沙地有顆粒明暗質感，而非一整片死平純色
  const flatPositionList = sand.getVerticesData(VertexBuffer.PositionKind)
  if (flatPositionList) {
    const vertexCount = flatPositionList.length / 3
    const colorList: number[] = []
    for (let index = 0; index < vertexCount; index++) {
      const x = flatPositionList[index * 3] ?? 0
      const z = flatPositionList[index * 3 + 2] ?? 0
      const shade = getSandShade(x, z)
      colorList.push(shade, shade, shade, 1)
    }
    sand.setVerticesData(VertexBuffer.ColorKind, colorList)
  }

  sand.material = material
  sand.receiveShadows = true
  sand.isPickable = true
  return sand
}

function buildGlassWallList(
  scene: Scene,
  glassMaterial: StandardMaterial,
  rimMaterial: StandardMaterial,
): Mesh[] {
  const wallThickness = 0.12
  const wallY = WALL_HEIGHT / 2 - 0.12
  const meshList: Mesh[] = []

  const wallConfigList = [
    { name: 'front', width: TANK_WIDTH + wallThickness * 2, depth: wallThickness, x: 0, z: -TANK_DEPTH / 2 - wallThickness / 2 },
    { name: 'back', width: TANK_WIDTH + wallThickness * 2, depth: wallThickness, x: 0, z: TANK_DEPTH / 2 + wallThickness / 2 },
    { name: 'left', width: wallThickness, depth: TANK_DEPTH, x: -TANK_WIDTH / 2 - wallThickness / 2, z: 0 },
    { name: 'right', width: wallThickness, depth: TANK_DEPTH, x: TANK_WIDTH / 2 + wallThickness / 2, z: 0 },
  ]

  for (const config of wallConfigList) {
    const wall = CreateBox(
      `tankGlassWall-${config.name}`,
      { width: config.width, height: WALL_HEIGHT, depth: config.depth },
      scene,
    )
    wall.position.set(config.x, wallY, config.z)
    wall.material = glassMaterial
    wall.isPickable = false
    meshList.push(wall)
  }

  // 上下缸框：頂部提高辨識度、底部收邊
  const rimSize = 0.18
  for (const levelY of [WALL_HEIGHT - 0.12 + rimSize / 2, -0.1]) {
    const horizontalRimConfigList = [
      { width: TANK_WIDTH + rimSize * 2, depth: rimSize, x: 0, z: -TANK_DEPTH / 2 - rimSize / 2 },
      { width: TANK_WIDTH + rimSize * 2, depth: rimSize, x: 0, z: TANK_DEPTH / 2 + rimSize / 2 },
      { width: rimSize, depth: TANK_DEPTH, x: -TANK_WIDTH / 2 - rimSize / 2, z: 0 },
      { width: rimSize, depth: TANK_DEPTH, x: TANK_WIDTH / 2 + rimSize / 2, z: 0 },
    ]
    for (const [index, config] of horizontalRimConfigList.entries()) {
      const rim = CreateBox(
        `tankRim-${levelY.toFixed(1)}-${index}`,
        { width: config.width, height: rimSize, depth: config.depth },
        scene,
      )
      rim.position.set(config.x, levelY, config.z)
      rim.material = rimMaterial
      rim.isPickable = false
      meshList.push(rim)
    }
  }

  return meshList
}

function buildRockList(
  scene: Scene,
  random: () => number,
): Mesh[] {
  const rockMaterial = new StandardMaterial('tankRockMaterial', scene)
  rockMaterial.diffuseColor = Color3.FromHexString('#8f8a80')
  rockMaterial.specularColor = Color3.Black()

  const rockSpotList = [
    { x: -4.5, z: -2.5 },
    { x: 4.5, z: -2.6 },
    { x: -4.3, z: 2.4 },
    { x: -1.6, z: -2.9 },
    { x: 1.8, z: 2.9 },
    { x: 4.8, z: 1 },
  ]

  // 中高面數多面體混用（十二面體、二十面體、斜方截半立方體），
  // 避免抽到四面體/八面體那種面數過少、擾動後過於單薄的形狀
  const polyhedronTypeList = [2, 3, 4]

  return rockSpotList.map((spot, index) => {
    const size = 0.26 + random() * 0.34
    const type = polyhedronTypeList[Math.floor(random() * polyhedronTypeList.length)] ?? 1
    // flat: false 用共享頂點，擾動時相鄰面共用的角落位移一致，面才不會裂開露縫；
    // 之後再 convertToFlatShadedMesh 分裂出低多邊塊面
    const rock = CreatePolyhedron(`tankRock${index}`, { type, size, flat: false }, scene)

    // 每個頂點加隨機位移，把規則多面體打亂成嶙峋岩石
    const positionList = rock.getVerticesData(VertexBuffer.PositionKind)
    if (positionList) {
      const jitter = size * 0.4
      for (let vertexIndex = 0; vertexIndex < positionList.length; vertexIndex += 3) {
        positionList[vertexIndex] = (positionList[vertexIndex] ?? 0) + (random() - 0.5) * jitter
        positionList[vertexIndex + 1] = (positionList[vertexIndex + 1] ?? 0) + (random() - 0.5) * jitter
        positionList[vertexIndex + 2] = (positionList[vertexIndex + 2] ?? 0) + (random() - 0.5) * jitter
      }
      rock.updateVerticesData(VertexBuffer.PositionKind, positionList)
    }
    rock.convertToFlatShadedMesh()

    const x = spot.x + (random() - 0.5) * 0.4
    const z = spot.z + (random() - 0.5) * 0.3
    rock.position.set(x, getSandHeight(x, z) + size * 0.45, z)
    // 各軸不等比縮放，外形更多變
    rock.scaling.set(0.8 + random() * 0.5, 0.5 + random() * 0.45, 0.8 + random() * 0.5)
    rock.rotation.set(random() * 0.6, random() * Math.PI * 2, random() * 0.6)
    rock.material = rockMaterial
    rock.isPickable = false
    return rock
  })
}

function buildSeaweed(
  scene: Scene,
  random: () => number,
  swayItemList: SwayItem[],
): Mesh[] {
  const colorList = ['#3f8560', '#4f9f6f', '#357a5e']
  const materialList = colorList.map((color, index) => {
    const material = new StandardMaterial(`tankSeaweedMaterial${index}`, scene)
    material.diffuseColor = Color3.FromHexString(color)
    material.emissiveColor = Color3.FromHexString(color).scale(0.18)
    material.specularColor = Color3.Black()
    material.backFaceCulling = false
    return material
  })

  const clusterSpotList = [
    { x: -3.9, z: 1.9, bladeCount: 4 },
    { x: -2.3, z: -2.5, bladeCount: 3 },
    { x: 4.35, z: 0.2, bladeCount: 4 },
  ]

  const meshList: Mesh[] = []

  for (const cluster of clusterSpotList) {
    for (let bladeIndex = 0; bladeIndex < cluster.bladeCount; bladeIndex++) {
      const x = cluster.x + (random() - 0.5) * 0.7
      const z = cluster.z + (random() - 0.5) * 0.5
      const lowerHeight = 0.5 + random() * 0.3
      const upperHeight = lowerHeight * (0.7 + random() * 0.2)
      const material = materialList[bladeIndex % materialList.length]!

      // 乾涸魚缸沒水浮力，水草倒伏在沙上：baseNode 決定倒向與傾倒角（固定，不受搖擺覆蓋）
      const baseNode = new TransformNode(`tankSeaweedBase-${x.toFixed(2)}-${z.toFixed(2)}`, scene)
      baseNode.position.set(x, getSandHeight(x, z), z)
      baseNode.rotation.set(1.05 + random() * 0.3, random() * Math.PI * 2, 0)

      // 子節點只做微弱擺動（乾草被氣流輕拂），不影響倒伏姿態
      const swayNode = new TransformNode(`${baseNode.name}-sway`, scene)
      swayNode.parent = baseNode

      const lowerBlade = createBeveledBox(
        `${baseNode.name}-lower`,
        scene,
        { width: 0.14, height: lowerHeight, depth: 0.03, bevel: 0.008 },
        material,
      )
      lowerBlade.position.y = lowerHeight / 2
      lowerBlade.parent = swayNode

      // 上半葉在倒伏基礎上再往沙面多彎，末端癱軟貼地
      const upperNode = new TransformNode(`${baseNode.name}-joint`, scene)
      upperNode.position.y = lowerHeight
      upperNode.rotation.x = 0.4 + random() * 0.3
      upperNode.parent = swayNode

      const upperBlade = createBeveledBox(
        `${baseNode.name}-upper`,
        scene,
        { width: 0.12, height: upperHeight, depth: 0.025, bevel: 0.007 },
        material,
      )
      upperBlade.position.y = upperHeight / 2
      upperBlade.parent = upperNode

      swayItemList.push({
        node: swayNode,
        phase: random() * Math.PI * 2,
        speed: 0.5 + random() * 0.3,
        amplitude: 0.03,
        baseLean: 0,
      })

      meshList.push(lowerBlade, upperBlade)
    }
  }

  return meshList
}

/** 立在沙地的相框，裡頭是一張拍到小魚的照片，呼應「魚缸相簿」 */
function buildPhotoFrame(scene: Scene): Mesh[] {
  const frameX = 3.7
  const frameZ = 2.3
  const groundY = getSandHeight(frameX, frameZ)

  const woodMaterial = new StandardMaterial('tankFrameWoodMaterial', scene)
  woodMaterial.diffuseColor = Color3.FromHexString('#a06a3a')
  woodMaterial.specularColor = Color3.FromHexString('#2a1c10')

  // 照片帶點自發光，像有打光的相片
  const photoMaterial = new StandardMaterial('tankFramePhotoMaterial', scene)
  photoMaterial.diffuseColor = Color3.FromHexString('#f3ece0')
  photoMaterial.emissiveColor = Color3.FromHexString('#f3ece0').scale(0.25)
  photoMaterial.specularColor = Color3.Black()

  const fishMaterial = new StandardMaterial('tankFrameFishMaterial', scene)
  fishMaterial.diffuseColor = Color3.FromHexString('#5aa0c8')
  fishMaterial.specularColor = Color3.Black()
  fishMaterial.backFaceCulling = false

  // root 定位與轉向，tilt 讓相框略後仰站著
  const root = new TransformNode('tankFrameRoot', scene)
  root.position.set(frameX, groundY, frameZ)
  root.rotation.y = -0.4
  const tilt = new TransformNode('tankFrameTilt', scene)
  tilt.parent = root
  tilt.rotation.x = 0.12

  const meshList: Mesh[] = []
  const centerY = 0.74
  const innerWidth = 0.8
  const innerHeight = 1
  const borderThickness = 0.2
  const frameDepth = 0.16

  // 照片面
  const photo = createBeveledBox(
    'tankFramePhoto',
    scene,
    { width: innerWidth, height: innerHeight, depth: 0.05, bevel: 0.015 },
    photoMaterial,
  )
  photo.position.set(0, centerY, -0.02)
  photo.parent = tilt
  meshList.push(photo)

  // 照片裡的小魚剪影（身 + 尾）
  const fishBody = CreateSphere('tankFrameFishBody', { diameter: 0.34, segments: 6 }, scene)
  fishBody.scaling.set(1, 0.62, 0.35)
  fishBody.position.set(-0.04, centerY, -0.06)
  fishBody.material = fishMaterial
  fishBody.isPickable = false
  fishBody.parent = tilt
  meshList.push(fishBody)

  const fishTail = createFlatTriangle(
    'tankFrameFishTail',
    scene,
    [0.1, 0.12, 0, 0.28, 0.2, 0, 0.28, -0.12, 0],
    fishMaterial,
  )
  fishTail.position.set(0, centerY, -0.06)
  fishTail.parent = tilt
  meshList.push(fishTail)

  // 四邊木框
  const halfWidth = innerWidth / 2 + borderThickness / 2
  const halfHeight = innerHeight / 2 + borderThickness / 2
  const borderConfigList = [
    { name: 'top', width: innerWidth + borderThickness * 2, height: borderThickness, x: 0, y: centerY + halfHeight },
    { name: 'bottom', width: innerWidth + borderThickness * 2, height: borderThickness, x: 0, y: centerY - halfHeight },
    { name: 'left', width: borderThickness, height: innerHeight, x: -halfWidth, y: centerY },
    { name: 'right', width: borderThickness, height: innerHeight, x: halfWidth, y: centerY },
  ]
  for (const config of borderConfigList) {
    const border = createBeveledBox(
      `tankFrameBorder-${config.name}`,
      scene,
      { width: config.width, height: config.height, depth: frameDepth, bevel: 0.022 },
      woodMaterial,
    )
    border.position.set(config.x, config.y, 0)
    border.parent = tilt
    meshList.push(border)
  }

  // 背後斜撐，讓相框站著
  const stand = createBeveledBox(
    'tankFrameStand',
    scene,
    { width: 0.1, height: 0.95, depth: 0.06, bevel: 0.018 },
    woodMaterial,
  )
  stand.position.set(0, 0.4, 0.18)
  stand.rotation.x = -0.55
  stand.parent = tilt
  meshList.push(stand)

  return meshList
}

/** 復古卡通相機：機身、軍艦部、凸出的鏡頭、快門鈕與觀景窗 */
function buildCamera(scene: Scene): Mesh[] {
  const cameraX = -3.4
  const cameraZ = 2.5
  const groundY = getSandHeight(cameraX, cameraZ)

  const bodyMaterial = new StandardMaterial('tankCameraBodyMaterial', scene)
  bodyMaterial.diffuseColor = Color3.FromHexString('#34353c')
  bodyMaterial.specularColor = Color3.FromHexString('#20202a')
  bodyMaterial.specularPower = 32

  const accentMaterial = new StandardMaterial('tankCameraAccentMaterial', scene)
  accentMaterial.diffuseColor = Color3.FromHexString('#25262b')
  accentMaterial.specularColor = Color3.FromHexString('#15151a')

  const ringMaterial = new StandardMaterial('tankCameraRingMaterial', scene)
  ringMaterial.diffuseColor = Color3.FromHexString('#b8bac2')
  ringMaterial.specularColor = Color3.FromHexString('#6a6a72')
  ringMaterial.specularPower = 24

  // 鏡片深藍帶反光微光
  const lensMaterial = new StandardMaterial('tankCameraLensMaterial', scene)
  lensMaterial.diffuseColor = Color3.FromHexString('#2f5a7a')
  lensMaterial.emissiveColor = Color3.FromHexString('#2f5a7a').scale(0.35)
  lensMaterial.specularColor = Color3.FromHexString('#8fb8d8')

  const shutterMaterial = new StandardMaterial('tankCameraShutterMaterial', scene)
  shutterMaterial.diffuseColor = Color3.FromHexString('#d0553f')
  shutterMaterial.specularColor = Color3.Black()

  // 鏡頭大致朝觀眾（-z），只微轉展示立體
  const root = new TransformNode('tankCameraRoot', scene)
  root.position.set(cameraX, groundY, cameraZ)
  root.rotation.y = 0.35

  const meshList: Mesh[] = []

  // 機身（寬扁）
  const bodyHeight = 0.58
  const bodyCenterY = bodyHeight / 2 + 0.02
  const bodyTopY = bodyCenterY + bodyHeight / 2
  const lensY = bodyCenterY - 0.02

  const body = createBeveledBox('tankCameraBody', scene, { width: 0.98, height: bodyHeight, depth: 0.4, bevel: 0.035 }, bodyMaterial)
  body.position.set(0, bodyCenterY, 0)
  body.parent = root
  meshList.push(body)

  // 軍艦部（頂部平台，橫跨機身）
  const topDeck = createBeveledBox('tankCameraTopDeck', scene, { width: 0.62, height: 0.12, depth: 0.34, bevel: 0.022 }, bodyMaterial)
  topDeck.position.set(0, bodyTopY + 0.06, 0)
  topDeck.parent = root
  meshList.push(topDeck)
  const deckTopY = bodyTopY + 0.12

  // 五稜鏡觀景器凸起（單眼相機的標誌）
  const prism = createBeveledBox('tankCameraPrism', scene, { width: 0.26, height: 0.16, depth: 0.28, bevel: 0.022 }, bodyMaterial)
  prism.position.set(0, deckTopY + 0.08, -0.02)
  prism.parent = root
  meshList.push(prism)

  // 握把（機身右側凸起）
  const grip = createBeveledBox('tankCameraGrip', scene, { width: 0.16, height: 0.5, depth: 0.34, bevel: 0.028 }, bodyMaterial)
  grip.position.set(0.52, bodyCenterY, -0.02)
  grip.parent = root
  meshList.push(grip)

  // 鏡頭：置中機身前，多層次朝 -z 凸出
  const lensPartList = [
    { key: 'Mount', diameter: 0.44, height: 0.1, z: -0.25, material: accentMaterial },
    { key: 'Barrel', diameter: 0.4, height: 0.26, z: -0.43, material: accentMaterial },
    { key: 'Ring', diameter: 0.46, height: 0.06, z: -0.59, material: ringMaterial },
    { key: 'Glass', diameter: 0.32, height: 0.04, z: -0.62, material: lensMaterial },
  ]
  for (const part of lensPartList) {
    const lens = CreateCylinder(
      `tankCameraLens${part.key}`,
      { diameter: part.diameter, height: part.height, tessellation: 16 },
      scene,
    )
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, lensY, part.z)
    lens.material = part.material
    lens.isPickable = false
    lens.parent = root
    meshList.push(lens)
  }

  // 快門鈕（軍艦部右前）
  const shutter = CreateCylinder('tankCameraShutter', { diameter: 0.1, height: 0.07, tessellation: 12 }, scene)
  shutter.position.set(0.22, deckTopY + 0.035, -0.08)
  shutter.material = shutterMaterial
  shutter.isPickable = false
  shutter.parent = root
  meshList.push(shutter)

  // 過片轉盤（軍艦部右後）
  const dial = CreateCylinder('tankCameraDial', { diameter: 0.16, height: 0.06, tessellation: 14 }, scene)
  dial.position.set(0.2, deckTopY + 0.03, 0.1)
  dial.material = accentMaterial
  dial.isPickable = false
  dial.parent = root
  meshList.push(dial)

  return meshList
}

/** 單面平面三角（給魚剪影尾巴等用），positionList 為 3 個頂點共 9 個座標 */
function createFlatTriangle(
  name: string,
  scene: Scene,
  positionList: number[],
  material: StandardMaterial,
): Mesh {
  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
  const indexList = [0, 1, 2]
  const normalList: number[] = []
  VertexData.ComputeNormals(positionList, indexList, normalList)
  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.normals = normalList
  vertexData.applyToMesh(mesh)
  mesh.material = material
  mesh.isPickable = false
  return mesh
}

export function createTankEnvironment(scene: Scene): TankEnvironment {
  const random = createRandomGenerator(20260715)

  const sandMaterial = new StandardMaterial('tankSandMaterial', scene)
  sandMaterial.specularColor = Color3.Black()

  const glassMaterial = new StandardMaterial('tankGlassMaterial', scene)
  glassMaterial.alpha = 0.1
  glassMaterial.specularPower = 64
  glassMaterial.backFaceCulling = false

  const rimMaterial = new StandardMaterial('tankRimMaterial', scene)
  rimMaterial.specularColor = Color3.Black()

  const sandMesh = buildSandMesh(scene, sandMaterial)
  buildGlassWallList(scene, glassMaterial, rimMaterial)

  const swayItemList: SwayItem[] = []
  const rockMeshList = buildRockList(scene, random)
  const seaweedMeshList = buildSeaweed(scene, random, swayItemList)
  const frameMeshList = buildPhotoFrame(scene)
  const cameraMeshList = buildCamera(scene)

  // 點擊目的地漣漪標記
  const markerMaterial = new StandardMaterial('tankMarkerMaterial', scene)
  markerMaterial.emissiveColor = Color3.FromHexString('#2fb8a6')
  markerMaterial.disableLighting = true
  markerMaterial.alpha = 0

  const markerMesh = CreateTorus(
    'tankClickMarker',
    { diameter: 0.9, thickness: 0.045, tessellation: 28 },
    scene,
  )
  markerMesh.material = markerMaterial
  markerMesh.isPickable = false
  markerMesh.setEnabled(false)

  let markerElapsed = MARKER_DURATION_SECONDS

  function setDarkMode(value: boolean) {
    sandMaterial.diffuseColor = value
      ? Color3.FromHexString('#635b42')
      : Color3.FromHexString('#d0bb87')
    glassMaterial.diffuseColor = value
      ? Color3.FromHexString('#274743')
      : Color3.FromHexString('#cfeeea')
    glassMaterial.alpha = value ? 0.16 : 0.1
    rimMaterial.diffuseColor = value
      ? Color3.FromHexString('#33413f')
      : Color3.FromHexString('#5b7672')
  }

  setDarkMode(false)

  function update(timeSeconds: number, deltaSeconds: number) {
    for (const swayItem of swayItemList) {
      swayItem.node.rotation.z = swayItem.baseLean
        + Math.sin(timeSeconds * swayItem.speed + swayItem.phase) * swayItem.amplitude
      swayItem.node.rotation.x = Math.cos(timeSeconds * swayItem.speed * 0.8 + swayItem.phase) * swayItem.amplitude * 0.6
    }

    if (markerElapsed < MARKER_DURATION_SECONDS) {
      markerElapsed += deltaSeconds
      const progress = Math.min(markerElapsed / MARKER_DURATION_SECONDS, 1)
      const scale = 0.5 + progress * 0.9
      markerMesh.scaling.set(scale, 1, scale)
      markerMaterial.alpha = 0.85 * (1 - progress)
      if (progress >= 1) {
        markerMesh.setEnabled(false)
      }
    }
  }

  function showClickMarker(x: number, z: number) {
    markerMesh.position.set(x, getSandHeight(x, z) + 0.09, z)
    markerMesh.scaling.set(0.5, 1, 0.5)
    markerMaterial.alpha = 0.85
    markerMesh.setEnabled(true)
    markerElapsed = 0
  }

  return {
    sandMesh,
    shadowCasterMeshList: [...rockMeshList, ...seaweedMeshList, ...frameMeshList, ...cameraMeshList],
    update,
    showClickMarker,
    setDarkMode,
  }
}
