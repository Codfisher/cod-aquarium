/** 乾涸魚缸箱庭場景：沙地、玻璃缸壁、石頭、水草、遊戲手把、相機與點擊標記。
 *
 * 座標中心在缸底中央，x 為長邊、z 為短邊。
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { createBeveledBox } from './geometry-utils'

export const TANK_WIDTH = 11
export const TANK_DEPTH = 7
/** 場景垂直參考高度（已無玻璃缸壁，僅供相機取景估算裝飾與跳躍所佔的高度） */
export const WALL_HEIGHT = 0.9

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
  update: (timeSeconds: number, deltaSeconds: number, fishX: number, fishZ: number) => void;
  /** 在指定位置播放 RPG 目的地漣漪標記 */
  showClickMarker: (x: number, z: number) => void;
  setDarkMode: (value: boolean) => void;
  /** 直式時把有正面的裝飾轉向觀眾，補償相機環繞角度 */
  setPortrait: (isPortrait: boolean) => void;
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

interface PushItem {
  node: TransformNode;
  rootX: number;
  rootZ: number;
}

/** 魚推開水草的影響半徑與最大傾倒角 */
const SEAWEED_PUSH_RADIUS = 1.2
const SEAWEED_PUSH_ANGLE = 0.9

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

  // 沙層厚度：底座用同一沙色材質（高度漸層讓沙層往下漸深），頂面與沙地重疊貼合，
  // 讓沙地像實體沙盤而非漂浮的薄平面
  const baseThickness = 0.4
  const base = createBeveledBox(
    'tankSandBase',
    scene,
    { width: TANK_WIDTH, height: baseThickness, depth: TANK_DEPTH, bevel: 0.05 },
    material,
  )
  base.position.y = -0.09 - baseThickness / 2

  return sand
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
  pushItemList: PushItem[],
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

      // 錨點：世界對齊，位於水草根部
      const anchorNode = new TransformNode(`tankSeaweedAnchor-${x.toFixed(2)}-${z.toFixed(2)}`, scene)
      anchorNode.position.set(x, getSandHeight(x, z), z)

      // 被魚推開的節點：魚靠近時繞水平軸往遠離魚方向傾倒
      const pushNode = new TransformNode(`${anchorNode.name}-push`, scene)
      pushNode.parent = anchorNode

      // 乾涸魚缸沒水浮力，水草倒伏在沙上：baseNode 決定倒向與傾倒角（固定，不受搖擺覆蓋）
      const baseNode = new TransformNode(`${anchorNode.name}-base`, scene)
      baseNode.rotation.set(1.05 + random() * 0.3, random() * Math.PI * 2, 0)
      baseNode.parent = pushNode

      // 子節點只做微弱擺動（乾草被氣流輕拂），不影響倒伏姿態
      const swayNode = new TransformNode(`${anchorNode.name}-sway`, scene)
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
      pushItemList.push({ node: pushNode, rootX: x, rootZ: z })

      meshList.push(lowerBlade, upperBlade)
    }
  }

  return meshList
}

/** 立在沙地的相框，裡頭是一張拍到小魚的照片，呼應「魚缸相簿」 */
/** 平放沙地的遊戲手把，呼應鱈魚的網頁遊戲機作品 */
function buildGamepad(scene: Scene): { meshList: Mesh[]; root: TransformNode } {
  const gamepadX = 3.7
  const gamepadZ = 2.3
  const groundY = getSandHeight(gamepadX, gamepadZ)

  const baseMaterial = new StandardMaterial('tankGamepadBaseMaterial', scene)
  baseMaterial.diffuseColor = Color3.FromHexString('#cc4436')
  baseMaterial.specularColor = Color3.FromHexString('#3a1712')
  baseMaterial.specularPower = 32

  const panelMaterial = new StandardMaterial('tankGamepadPanelMaterial', scene)
  panelMaterial.diffuseColor = Color3.FromHexString('#ece7dc')
  panelMaterial.specularColor = Color3.Black()

  const shaftMaterial = new StandardMaterial('tankGamepadShaftMaterial', scene)
  shaftMaterial.diffuseColor = Color3.FromHexString('#222228')
  shaftMaterial.specularColor = Color3.FromHexString('#44444e')

  const ballMaterial = new StandardMaterial('tankGamepadBallMaterial', scene)
  ballMaterial.diffuseColor = Color3.FromHexString('#d0553f')
  ballMaterial.emissiveColor = Color3.FromHexString('#d0553f').scale(0.18)
  ballMaterial.specularColor = Color3.FromHexString('#7a3226')

  // 兩顆按鈕不同色
  const buttonColorList = ['#d0553f', '#e0b53f']
  const buttonMaterialList = buttonColorList.map((color, index) => {
    const material = new StandardMaterial(`tankGamepadButtonMaterial${index}`, scene)
    material.diffuseColor = Color3.FromHexString(color)
    material.emissiveColor = Color3.FromHexString(color).scale(0.18)
    material.specularColor = Color3.Black()
    return material
  })

  const root = new TransformNode('tankGamepadRoot', scene)
  root.position.set(gamepadX, groundY, gamepadZ)
  root.rotation.y = -0.35

  const meshList: Mesh[] = []

  // 矩形底座
  const baseHeight = 0.22
  const baseCenterY = baseHeight / 2 + 0.02
  const baseTopY = baseCenterY + baseHeight / 2
  const base = createBeveledBox('tankGamepadBase', scene, { width: 0.92, height: baseHeight, depth: 0.6, bevel: 0.05 }, baseMaterial)
  base.position.set(0, baseCenterY, 0)
  base.parent = root
  meshList.push(base)

  // 白色面板（與紅底座構成紅白配色），搖桿與按鈕都裝在面板上
  const panelHeight = 0.06
  const panelTopY = baseTopY + panelHeight
  const panel = createBeveledBox('tankGamepadPanel', scene, { width: 0.84, height: panelHeight, depth: 0.52, bevel: 0.03 }, panelMaterial)
  panel.position.set(0, baseTopY + panelHeight / 2, 0)
  panel.parent = root
  meshList.push(panel)

  // 搖桿：左側立起一根桿 + 頂部紅球
  const stickX = -0.24
  const shaftHeight = 0.42
  const shaft = CreateCylinder('tankGamepadShaft', { diameter: 0.075, height: shaftHeight, tessellation: 10 }, scene)
  shaft.position.set(stickX, panelTopY + shaftHeight / 2, 0)
  shaft.material = shaftMaterial
  shaft.isPickable = false
  shaft.parent = root
  meshList.push(shaft)

  const ball = CreateSphere('tankGamepadBall', { diameter: 0.17, segments: 8 }, scene)
  ball.position.set(stickX, panelTopY + shaftHeight + 0.05, 0)
  ball.material = ballMaterial
  ball.isPickable = false
  ball.parent = root
  meshList.push(ball)

  // 右側兩顆按鈕
  const buttonOffsetList = [
    { x: 0.14, z: -0.1 },
    { x: 0.32, z: 0.06 },
  ]
  buttonOffsetList.forEach((offset, index) => {
    const button = CreateCylinder(`tankGamepadButton${index}`, { diameter: 0.16, height: 0.07, tessellation: 14 }, scene)
    button.position.set(offset.x, panelTopY + 0.02, offset.z)
    button.material = buttonMaterialList[index]!
    button.isPickable = false
    button.parent = root
    meshList.push(button)
  })

  return { meshList, root }
}

/** 復古卡通相機：機身、軍艦部、凸出的鏡頭、快門鈕與觀景窗 */
function buildCamera(scene: Scene): { meshList: Mesh[]; root: TransformNode } {
  const cameraX = -3.4
  const cameraZ = 2.5
  const groundY = getSandHeight(cameraX, cameraZ)

  const bodyMaterial = new StandardMaterial('tankCameraBodyMaterial', scene)
  bodyMaterial.diffuseColor = Color3.FromHexString('#26262a')
  bodyMaterial.specularColor = Color3.FromHexString('#15151a')
  bodyMaterial.specularPower = 32

  // 白色部件，與黑機身黑白交錯
  const whiteMaterial = new StandardMaterial('tankCameraWhiteMaterial', scene)
  whiteMaterial.diffuseColor = Color3.FromHexString('#e6e2d8')
  whiteMaterial.specularColor = Color3.FromHexString('#40403a')

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
  const topDeck = createBeveledBox('tankCameraTopDeck', scene, { width: 0.62, height: 0.12, depth: 0.34, bevel: 0.022 }, whiteMaterial)
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
  const grip = createBeveledBox('tankCameraGrip', scene, { width: 0.16, height: 0.5, depth: 0.34, bevel: 0.028 }, whiteMaterial)
  grip.position.set(0.52, bodyCenterY, -0.02)
  grip.parent = root
  meshList.push(grip)

  // 鏡頭：置中機身前，多層次朝 -z 凸出
  const lensPartList = [
    { key: 'Mount', diameter: 0.44, height: 0.1, z: -0.25, material: accentMaterial },
    { key: 'Barrel', diameter: 0.4, height: 0.26, z: -0.43, material: whiteMaterial },
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

  return { meshList, root }
}

export function createTankEnvironment(scene: Scene): TankEnvironment {
  const random = createRandomGenerator(20260715)

  const sandMaterial = new StandardMaterial('tankSandMaterial', scene)
  sandMaterial.specularColor = Color3.Black()

  const sandMesh = buildSandMesh(scene, sandMaterial)

  const swayItemList: SwayItem[] = []
  const pushItemList: PushItem[] = []
  const rockMeshList = buildRockList(scene, random)
  const seaweedMeshList = buildSeaweed(scene, random, swayItemList, pushItemList)
  const gamepad = buildGamepad(scene)
  const camera = buildCamera(scene)

  // 直式（手機）時相機環繞轉 90°，讓有正面的裝飾（相機、搖桿）跟著轉向觀眾
  const orientationList = [
    { node: camera.root, baseRotationY: camera.root.rotation.y },
    { node: gamepad.root, baseRotationY: gamepad.root.rotation.y },
  ]
  function setPortrait(isPortrait: boolean) {
    for (const item of orientationList) {
      item.node.rotation.y = item.baseRotationY + (isPortrait ? Math.PI / 2 : 0)
    }
  }

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
  }

  setDarkMode(false)

  function update(timeSeconds: number, deltaSeconds: number, fishX: number, fishZ: number) {
    for (const swayItem of swayItemList) {
      swayItem.node.rotation.z = swayItem.baseLean
        + Math.sin(timeSeconds * swayItem.speed + swayItem.phase) * swayItem.amplitude
      swayItem.node.rotation.x = Math.cos(timeSeconds * swayItem.speed * 0.8 + swayItem.phase) * swayItem.amplitude * 0.6
    }

    // 魚靠近時把水草往遠離魚的方向推倒，離開後平滑回彈
    for (const pushItem of pushItemList) {
      const dx = pushItem.rootX - fishX
      const dz = pushItem.rootZ - fishZ
      const distance = Math.hypot(dx, dz)
      let targetRotationX = 0
      let targetRotationZ = 0
      if (distance < SEAWEED_PUSH_RADIUS) {
        const strength = (1 - distance / SEAWEED_PUSH_RADIUS) * SEAWEED_PUSH_ANGLE
        const inverse = 1 / (distance || 1)
        targetRotationX = dz * inverse * strength
        targetRotationZ = -dx * inverse * strength
      }
      const lerp = Math.min(1, deltaSeconds * 6)
      pushItem.node.rotation.x += (targetRotationX - pushItem.node.rotation.x) * lerp
      pushItem.node.rotation.z += (targetRotationZ - pushItem.node.rotation.z) * lerp
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
    shadowCasterMeshList: [...rockMeshList, ...seaweedMeshList, ...gamepad.meshList, ...camera.meshList],
    update,
    showClickMarker,
    setDarkMode,
    setPortrait,
  }
}
