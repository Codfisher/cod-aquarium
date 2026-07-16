/** 箱庭場景：大地板上的石頭、水草、遊戲手把、相機與點擊標記。
 *
 * 座標中心在場景中央，x 為長邊、z 為短邊。
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { ObstacleCircle } from './flop-controller'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PhysicsConstraintAxis, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin'
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate'
import { Physics6DoFConstraint } from '@babylonjs/core/Physics/v2/physicsConstraint'
import { createBeveledBox } from './geometry-utils'

export const TANK_WIDTH = 11
export const TANK_DEPTH = 7
/** 場景垂直參考高度（僅供相機取景估算裝飾與跳躍所佔的高度） */
export const WALL_HEIGHT = 0.9
/** 大地板（魚與擺設落腳的水平面）的 y */
export const GROUND_Y = 0

/** 魚可移動的範圍（大地板上的活動區，維持在擺設之間） */
export const MOVE_BOUNDS_RECT = {
  minX: -TANK_WIDTH / 2 + 0.8,
  maxX: TANK_WIDTH / 2 - 0.8,
  minZ: -TANK_DEPTH / 2 + 0.7,
  maxZ: TANK_DEPTH / 2 - 0.7,
} as const

export interface TankEnvironment {
  /** 需要投影的網格 */
  shadowCasterMeshList: Mesh[];
  /** 石頭、搖桿、相機的俯視碰撞圓，供魚繞行避讓 */
  obstacleList: ObstacleCircle[];
  /** 每幀更新水草搖擺與點擊標記 */
  update: (timeSeconds: number, deltaSeconds: number, fishX: number, fishZ: number) => void;
  /** 在指定位置播放 RPG 目的地漣漪標記 */
  showClickMarker: (x: number, z: number) => void;
  /** 直式時把有正面的裝飾轉向觀眾，補償相機環繞角度 */
  setPortrait: (isPortrait: boolean) => void;
  /** Havok 就緒後呼叫：水草葉片轉成動態剛體（彈簧回正），石頭/搖桿/相機建靜態碰撞體。
   * 啟用後手動推草自動失效（葉片已脫離動畫節點）。
   */
  enablePhysics: () => void;
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

/** 一株水草的葉片與節點，供物理啟用時轉成剛體 */
interface SeaweedPlant {
  anchorNode: TransformNode;
  /** 上下葉的關節節點（世界位置 = 關節樞紐） */
  jointNode: TransformNode;
  lowerBlade: Mesh;
  upperBlade: Mesh;
}

/** 魚推開水草的影響半徑與最大傾倒角（Havok 未啟用時的手動後備） */
const SEAWEED_PUSH_RADIUS = 1.2
const SEAWEED_PUSH_ANGLE = 0.9

// --- Havok 物理參數（可調） ---
/** 碰撞群組：葉片只跟魚與靜態物碰撞，彼此不撞避免叢聚抖動 */
export const PHYSICS_GROUP_FISH = 1
export const PHYSICS_GROUP_SEAWEED = 2
export const PHYSICS_GROUP_STATIC = 4
/** 單節葉片質量（愈輕愈容易被魚撥飛） */
const SEAWEED_BLADE_MASS = 0.15
/** 拉回原姿態的角度彈簧：剛度（回正力道）與阻尼（擺盪衰減） */
const SEAWEED_SPRING_STIFFNESS = 40
const SEAWEED_SPRING_DAMPING = 3

const MARKER_DURATION_SECONDS = 0.6

function buildRockList(
  scene: Scene,
  random: () => number,
): { meshList: Mesh[]; obstacleList: ObstacleCircle[] } {
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

  const meshList: Mesh[] = []
  const obstacleList: ObstacleCircle[] = []

  for (const [index, spot] of rockSpotList.entries()) {
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
    // 各軸不等比縮放，外形更多變
    const scaleX = 0.8 + random() * 0.5
    const scaleY = 0.5 + random() * 0.45
    const scaleZ = 0.8 + random() * 0.5
    // 落在大地板上（底部貼地、略沉一點更穩），不再半埋於沙中
    rock.position.set(x, GROUND_Y + size * scaleY * 0.8, z)
    rock.scaling.set(scaleX, scaleY, scaleZ)
    rock.rotation.set(random() * 0.6, random() * Math.PI * 2, random() * 0.6)
    rock.material = rockMaterial
    rock.isPickable = false

    meshList.push(rock)
    // 俯視碰撞半徑：多面體 size 約為外接半徑，含頂點擾動後取水平較大縮放貼合視覺
    obstacleList.push({ x, z, radius: size * Math.max(scaleX, scaleZ) * 1.05 })
  }

  return { meshList, obstacleList }
}

function buildSeaweed(
  scene: Scene,
  random: () => number,
  swayItemList: SwayItem[],
  pushItemList: PushItem[],
): { meshList: Mesh[]; plantList: SeaweedPlant[] } {
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
  const plantList: SeaweedPlant[] = []

  for (const cluster of clusterSpotList) {
    for (let bladeIndex = 0; bladeIndex < cluster.bladeCount; bladeIndex++) {
      const x = cluster.x + (random() - 0.5) * 0.7
      const z = cluster.z + (random() - 0.5) * 0.5
      const lowerHeight = 0.5 + random() * 0.3
      const upperHeight = lowerHeight * (0.7 + random() * 0.2)
      const material = materialList[bladeIndex % materialList.length]!

      // 錨點：世界對齊，位於水草根部
      const anchorNode = new TransformNode(`tankSeaweedAnchor-${x.toFixed(2)}-${z.toFixed(2)}`, scene)
      anchorNode.position.set(x, GROUND_Y, z)

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
      plantList.push({ anchorNode, jointNode: upperNode, lowerBlade, upperBlade })
    }
  }

  return { meshList, plantList }
}

/** 立在沙地的相框，裡頭是一張拍到小魚的照片，呼應「魚缸相簿」 */
/** 平放沙地的遊戲手把，呼應鱈魚的網頁遊戲機作品 */
function buildGamepad(scene: Scene): { meshList: Mesh[]; root: TransformNode; obstacle: ObstacleCircle } {
  const gamepadX = 3.7
  const gamepadZ = 2.3
  const groundY = GROUND_Y

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

  // 俯視碰撞圓：涵蓋矩形底座對角
  return { meshList, root, obstacle: { x: gamepadX, z: gamepadZ, radius: 0.58 } }
}

/** 復古卡通相機：機身、軍艦部、凸出的鏡頭、快門鈕與觀景窗 */
function buildCamera(scene: Scene): { meshList: Mesh[]; root: TransformNode; obstacle: ObstacleCircle } {
  const cameraX = -3.4
  const cameraZ = 2.5
  const groundY = GROUND_Y

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

  // 鏡頭：短短一截的圓筒鏡身，前端銀圈收邊、藍色凸透鏡半球鼓出，較有單眼鏡頭實感
  const lensPartList = [
    // 鏡身基座（接機身、略粗）
    { key: 'Mount', diameter: 0.46, height: 0.09, z: -0.22, material: accentMaterial },
    // 主鏡身（短白色圓筒）
    { key: 'Barrel', diameter: 0.4, height: 0.14, z: -0.31, material: whiteMaterial },
    // 前端銀色鏡圈
    { key: 'Ring', diameter: 0.46, height: 0.05, z: -0.4, material: ringMaterial },
  ]
  for (const part of lensPartList) {
    const lens = CreateCylinder(
      `tankCameraLens${part.key}`,
      { diameter: part.diameter, height: part.height, tessellation: 20 },
      scene,
    )
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, lensY, part.z)
    lens.material = part.material
    lens.isPickable = false
    lens.parent = root
    meshList.push(lens)
  }

  // 藍色凸透鏡：壓扁的半球往前鼓出，像真的鏡片弧面反光
  const lensGlass = CreateSphere('tankCameraLensGlass', { diameter: 0.34, segments: 12 }, scene)
  lensGlass.scaling.z = 0.5
  lensGlass.position.set(0, lensY, -0.43)
  lensGlass.material = lensMaterial
  lensGlass.isPickable = false
  lensGlass.parent = root
  meshList.push(lensGlass)

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

  // 俯視碰撞圓：涵蓋機身與前凸的鏡頭
  return { meshList, root, obstacle: { x: cameraX, z: cameraZ, radius: 0.56 } }
}

/** 在兩個剛體間建立「線性鎖死＋角度彈簧回正」的 6DoF 約束，樞紐設在 pivotWorld。
 * 以子物體當前世界軸作共同參考軸，讓約束零位 = 建立當下的姿態，
 * 被撞開後彈簧會把它拉回這個原始姿態。
 */
function connectWithAngularSpring(
  parentAggregate: PhysicsAggregate,
  childAggregate: PhysicsAggregate,
  pivotWorld: Vector3,
  scene: Scene,
) {
  const parentInverse = new Matrix()
  parentAggregate.transformNode.getWorldMatrix().invertToRef(parentInverse)
  const childInverse = new Matrix()
  childAggregate.transformNode.getWorldMatrix().invertToRef(childInverse)

  const pivotA = Vector3.TransformCoordinates(pivotWorld, parentInverse)
  const pivotB = Vector3.TransformCoordinates(pivotWorld, childInverse)

  const childWorldMatrix = childAggregate.transformNode.getWorldMatrix()
  const worldAxis = Vector3.TransformNormal(new Vector3(1, 0, 0), childWorldMatrix).normalize()
  const worldPerpAxis = Vector3.TransformNormal(new Vector3(0, 1, 0), childWorldMatrix).normalize()

  const axisA = Vector3.TransformNormal(worldAxis, parentInverse).normalize()
  const perpAxisA = Vector3.TransformNormal(worldPerpAxis, parentInverse).normalize()
  const axisB = Vector3.TransformNormal(worldAxis, childInverse).normalize()
  const perpAxisB = Vector3.TransformNormal(worldPerpAxis, childInverse).normalize()

  const springLimit = {
    minLimit: 0,
    maxLimit: 0,
    stiffness: SEAWEED_SPRING_STIFFNESS,
    damping: SEAWEED_SPRING_DAMPING,
  }
  const constraint = new Physics6DoFConstraint(
    { pivotA, pivotB, axisA, axisB, perpAxisA, perpAxisB },
    [
      { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_X, ...springLimit },
      { axis: PhysicsConstraintAxis.ANGULAR_Y, ...springLimit },
      { axis: PhysicsConstraintAxis.ANGULAR_Z, ...springLimit },
    ],
    scene,
  )
  parentAggregate.body.addConstraint(childAggregate.body, constraint)
}

export function createTankEnvironment(scene: Scene): TankEnvironment {
  const random = createRandomGenerator(20260715)

  const swayItemList: SwayItem[] = []
  const pushItemList: PushItem[] = []
  const rocks = buildRockList(scene, random)
  const seaweed = buildSeaweed(scene, random, swayItemList, pushItemList)
  const gamepad = buildGamepad(scene)
  const camera = buildCamera(scene)

  // 石頭、搖桿、相機的俯視碰撞圓，供魚繞行
  const obstacleList: ObstacleCircle[] = [...rocks.obstacleList, gamepad.obstacle, camera.obstacle]

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

  // --- Havok 物理：水草剛體 + 靜態碰撞體 ---
  let hasPhysics = false
  function enablePhysics() {
    if (hasPhysics) {
      return
    }
    hasPhysics = true

    // 靜態：石頭凸包，擋住被魚推來的葉片
    for (const rock of rocks.meshList) {
      const rockAggregate = new PhysicsAggregate(rock, PhysicsShapeType.CONVEX_HULL, { mass: 0 }, scene)
      rockAggregate.shape.filterMembershipMask = PHYSICS_GROUP_STATIC
      rockAggregate.shape.filterCollideMask = PHYSICS_GROUP_SEAWEED
    }

    // 靜態：搖桿與相機用隱形圓柱涵蓋（外形近似即可）
    const staticSpotList = [gamepad.obstacle, camera.obstacle]
    staticSpotList.forEach((obstacle, index) => {
      const collider = CreateCylinder(
        `tankStaticCollider${index}`,
        { diameter: obstacle.radius * 2, height: 1.2, tessellation: 12 },
        scene,
      )
      collider.position.set(obstacle.x, GROUND_Y + 0.6, obstacle.z)
      collider.isVisible = false
      collider.isPickable = false
      const staticAggregate = new PhysicsAggregate(collider, PhysicsShapeType.CYLINDER, { mass: 0 }, scene)
      staticAggregate.shape.filterMembershipMask = PHYSICS_GROUP_STATIC
      staticAggregate.shape.filterCollideMask = PHYSICS_GROUP_SEAWEED
    })

    // 水草：每株兩節葉片轉成動態剛體（葉片 mesh 幾何直接當碰撞體），
    // 錨點→下葉→上葉串起角度彈簧，被魚撞開後拉回原姿態
    for (const plant of seaweed.plantList) {
      plant.lowerBlade.computeWorldMatrix(true)
      plant.upperBlade.computeWorldMatrix(true)
      const anchorPosition = plant.anchorNode.getAbsolutePosition().clone()
      const jointPosition = plant.jointNode.getAbsolutePosition().clone()

      // 脫離動畫節點（setParent(null) 保留世界姿態），之後由物理接管；
      // 手動搖擺/推草只轉空節點，自動失效
      plant.lowerBlade.setParent(null)
      plant.upperBlade.setParent(null)

      // 錨點剛體：隱形小球，不參與碰撞，純當約束基座
      const anchorMesh = CreateSphere(`${plant.anchorNode.name}-body`, { diameter: 0.06, segments: 4 }, scene)
      anchorMesh.position.copyFrom(anchorPosition)
      anchorMesh.isVisible = false
      anchorMesh.isPickable = false
      const anchorAggregate = new PhysicsAggregate(anchorMesh, PhysicsShapeType.SPHERE, { mass: 0 }, scene)
      anchorAggregate.shape.filterMembershipMask = 0
      anchorAggregate.shape.filterCollideMask = 0

      const lowerAggregate = new PhysicsAggregate(
        plant.lowerBlade,
        PhysicsShapeType.CONVEX_HULL,
        { mass: SEAWEED_BLADE_MASS, friction: 0.6, restitution: 0.05 },
        scene,
      )
      const upperAggregate = new PhysicsAggregate(
        plant.upperBlade,
        PhysicsShapeType.CONVEX_HULL,
        { mass: SEAWEED_BLADE_MASS * 0.7, friction: 0.6, restitution: 0.05 },
        scene,
      )
      for (const bladeAggregate of [lowerAggregate, upperAggregate]) {
        bladeAggregate.shape.filterMembershipMask = PHYSICS_GROUP_SEAWEED
        bladeAggregate.shape.filterCollideMask = PHYSICS_GROUP_FISH | PHYSICS_GROUP_STATIC
      }

      connectWithAngularSpring(anchorAggregate, lowerAggregate, anchorPosition, scene)
      connectWithAngularSpring(lowerAggregate, upperAggregate, jointPosition, scene)
    }
  }

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
    markerMesh.position.set(x, GROUND_Y + 0.09, z)
    markerMesh.scaling.set(0.5, 1, 0.5)
    markerMaterial.alpha = 0.85
    markerMesh.setEnabled(true)
    markerElapsed = 0
  }

  return {
    shadowCasterMeshList: [...rocks.meshList, ...seaweed.meshList, ...gamepad.meshList, ...camera.meshList],
    obstacleList,
    update,
    showClickMarker,
    setPortrait,
    enablePhysics,
  }
}
