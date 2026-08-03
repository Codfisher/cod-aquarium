/** 箱庭場景：大地板上的石頭、水草、卵石、蠟筆、相機、打字機與點擊標記。
 *
 * 座標中心在場景中央，x 為長邊、z 為短邊。
 */
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody'
import type { Scene } from '@babylonjs/core/scene'
import type { ObstacleCircle } from './flop-controller'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { Constants } from '@babylonjs/core/Engines/constants'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { ClusteredLightContainer } from '@babylonjs/core/Lights/Clustered/clusteredLightContainer'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PhysicsConstraintAxis, PhysicsConstraintAxisLimitMode, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin'
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate'
import { Physics6DoFConstraint } from '@babylonjs/core/Physics/v2/physicsConstraint'
import { createBeveledBox } from './geometry-utils'
import '@babylonjs/core/Layers/effectLayerSceneComponent'
import '@babylonjs/core/Lights/Clustered/clusteredLightingSceneComponent'

export const TANK_WIDTH = 11
export const TANK_DEPTH = 7
/** 場景垂直參考高度（僅供相機取景估算裝飾與跳躍所佔的高度） */
export const WALL_HEIGHT = 0.9
/** 大地板（魚與擺設落腳的水平面）的 y */
export const GROUND_Y = 0

/** 魚可移動的範圍（點擊落點的允許區）。遠大於裝飾群，涵蓋鏡頭可見的大地板；
 * 點擊只會落在畫面內，故魚不會被送出視野
 */
export const MOVE_BOUNDS_RECT = {
  minX: -9,
  maxX: 9,
  minZ: -6,
  maxZ: 6,
} as const

/** 相機取景參考的核心區（裝飾群所在的原始缸區）。
 * 與 MOVE_BOUNDS_RECT 脫鉤：移動範圍擴大時鏡頭不跟著拉遠
 */
export const CAMERA_FRAME_RECT = {
  minX: -TANK_WIDTH / 2 + 0.8,
  maxX: TANK_WIDTH / 2 - 0.8,
  minZ: -TANK_DEPTH / 2 + 0.7,
  maxZ: TANK_DEPTH / 2 - 0.7,
} as const

/** 可互動裝飾的識別鍵，外層依鍵值對應 popup 的文字與連結 */
export type InteractionSpotKey = 'camera' | 'crayonSet' | 'typewriter'

/** 可互動裝飾的位置與 popup 錨點資訊 */
export interface InteractionSpot {
  key: InteractionSpotKey;
  x: number;
  z: number;
  /** popup 錨點高度（物體頂端略上方，供投影成畫面座標） */
  anchorY: number;
  /** 俯視半徑（同障礙圓，供計算魚與物體邊緣的距離） */
  radius: number;
}

export interface TankEnvironment {
  /** 需要投影的網格 */
  shadowCasterMeshList: Mesh[];
  /** 石頭、搖桿、相機的俯視碰撞圓，供魚繞行避讓 */
  obstacleList: ObstacleCircle[];
  /** 魚靠近時顯示連結 popup 的裝飾（相機、蠟筆、打字機） */
  interactionSpotList: InteractionSpot[];
  /** 播放指定裝飾的點擊彈跳（卡通 squash 回饋） */
  playSpotBounce: (key: InteractionSpotKey) => void;
  /** 設定滑鼠懸停的裝飾（null 取消）：微微長高放大＋增亮，提示可點擊 */
  setSpotHover: (key: InteractionSpotKey | null) => void;
  /** 播放裝飾的停靠展示動畫（魚停到旁邊時）：相機閃燈、打字機抖紙、蠟筆搖擺 */
  playSpotShowcase: (key: InteractionSpotKey) => void;
  /** 設定裝飾的鎖定狀態：鎖定時呈未上色灰白紙模＋漂浮鎖頭旗標，
   * 解鎖時顏色暈染回來、旗標上飄消失。skipTransition 用於載入時直接套用
   */
  setSpotLocked: (key: InteractionSpotKey, isLocked: boolean, skipTransition?: boolean) => void;
  /** 切換夜燈（深色模式）：路燈亮起（自發光＋泛光＋局部暖光），平滑過渡 */
  setNightMode: (enabled: boolean) => void;
  /** 每幀更新水草搖擺與點擊標記 */
  update: (timeSeconds: number, deltaSeconds: number, fishX: number, fishZ: number) => void;
  /** 在指定位置播放 RPG 目的地漣漪標記 */
  showClickMarker: (x: number, z: number) => void;
  /** 魚落地時在該處濺出小水滴（strength = 本跳跳高縮放，影響數量與噴發力道） */
  spawnLandingBurst: (x: number, z: number, strength: number) => void;
  /** 戳一下卵石：對剛體施小衝量彈起（物理未就緒則無反應） */
  pokePebble: (mesh: AbstractMesh) => void;
  /** 慶祝彩帶：在指定位置向上噴發（count 控制張數，預設整池） */
  spawnConfettiBurst: (x: number, z: number, count?: number) => void;
  /** 直式時把有正面的裝飾轉向觀眾，補償相機環繞角度 */
  setPortrait: (isPortrait: boolean) => void;
  /** Havok 就緒後呼叫：水草葉片轉成動態剛體（彈簧回正），石頭/搖桿/相機建靜態碰撞體。
   * 啟用後手動推草自動失效（葉片已脫離動畫節點）。
   */
  enablePhysics: () => void;
  /** 挑戰舞台需直接操作的打字機部件（鍵帽下壓、紙張文字、卡紙抖動） */
  typewriterPartMap: { root: TransformNode; keyList: Mesh[]; paper: Mesh };
  /** 蠟筆組錨點：畫室舞台的畫架擺放參考 */
  crayonAnchor: { x: number; z: number };
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
  /** 根部世界 x：統一風場沿 x 掃過時計算相位差用 */
  rootX: number;
}

interface PushItem {
  node: TransformNode;
  rootX: number;
  rootZ: number;
  /** 傾倒角速度（rad/s）：回彈彈簧積分用 */
  angularVelocityX: number;
  angularVelocityZ: number;
}

/** 一株水草的葉片與節點，供物理啟用時轉成剛體 */
interface SeaweedPlant {
  anchorNode: TransformNode;
  /** 上下葉的關節節點（世界位置 = 關節樞紐） */
  jointNode: TransformNode;
  lowerBlade: Mesh;
  upperBlade: Mesh;
}

/** 一顆卵石／貝殼；body 於物理啟用後回填，供出界歸位 */
interface PebbleItem {
  mesh: Mesh;
  spawnPosition: Vector3;
  body?: PhysicsBody;
}

/** 魚推開水草的影響半徑與最大傾倒角（Havok 未啟用時的手動後備） */
const SEAWEED_PUSH_RADIUS = 1.2
const SEAWEED_PUSH_ANGLE = 0.9
/** 手動推草的回彈彈簧：剛度決定挺回速度，阻尼低於臨界值（2√k ≈ 12.6）才會過衝擺盪。
 * 魚離開後約半秒挺回、末端輕輕晃兩下，不是瞬間歸位
 */
const SEAWEED_PUSH_SPRING_STIFFNESS = 40
const SEAWEED_PUSH_SPRING_DAMPING = 6.5

// --- Havok 物理參數（可調） ---
/** 碰撞群組：葉片只跟魚與靜態物碰撞，彼此不撞避免叢聚抖動 */
export const PHYSICS_GROUP_FISH = 1
export const PHYSICS_GROUP_SEAWEED = 2
export const PHYSICS_GROUP_STATIC = 4
/** 自由剛體（卵石、貝殼）：與魚、靜態物、彼此碰撞，不干擾水草葉片 */
export const PHYSICS_GROUP_DEBRIS = 8
/** 單節葉片質量（愈輕愈容易被魚撥飛） */
const SEAWEED_BLADE_MASS = 0.15
/** 拉回原姿態的角度彈簧：剛度（回正力道，N·m/rad）與阻尼（擺盪衰減）。
 * 葉片轉動慣量極小（約 0.018），剛度只要幾 N·m 就撐得住自重（下垂約 3°），
 * 剛度愈低挺回愈慢、阻尼低於臨界值（2√(k·I) ≈ 0.76）才會過衝回彈。
 * 穩定性靠物理子步進與葉片本體角阻尼撐住
 */
const SEAWEED_SPRING_STIFFNESS = 8
const SEAWEED_SPRING_DAMPING = 0.4
/** 卵石／貝殼質量：夠輕才會被魚犁開 */
const PEBBLE_MASS = 0.05

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
    // 後排中央（原檯燈位置）的補位叢
    { x: 0.2, z: 2.7, bladeCount: 4 },
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
        rootX: x,
      })
      pushItemList.push({
        node: pushNode,
        rootX: x,
        rootZ: z,
        angularVelocityX: 0,
        angularVelocityZ: 0,
      })

      meshList.push(lowerBlade, upperBlade)
      plantList.push({ anchorNode, jointNode: upperNode, lowerBlade, upperBlade })
    }
  }

  return { meshList, plantList }
}

/** 沙地上散落的小卵石與貝殼：Havok 啟用後是自由剛體，
 * 會被魚犁開；出界由 update 歸位
 */
function buildPebbleList(
  scene: Scene,
  random: () => number,
): { meshList: Mesh[]; itemList: PebbleItem[] } {
  const pebbleColorList = ['#b8a98f', '#9b8f7c', '#c7b9a1']
  const pebbleMaterialList = pebbleColorList.map((color, index) => {
    const material = new StandardMaterial(`tankPebbleMaterial${index}`, scene)
    material.diffuseColor = Color3.FromHexString(color)
    material.specularColor = Color3.Black()
    return material
  })
  const shellMaterial = new StandardMaterial('tankShellMaterial', scene)
  shellMaterial.diffuseColor = Color3.FromHexString('#dbb5a4')
  shellMaterial.specularColor = Color3.Black()

  const pebbleSpotList = [
    { x: -3, z: -0.6 },
    { x: -1.2, z: 0.8 },
    { x: 0.9, z: 1.7 },
    { x: 2.6, z: -0.9 },
    { x: 4.1, z: -1.9 },
    { x: -4.5, z: 1.1 },
    { x: 1.9, z: 2.3 },
    { x: -0.4, z: -1.8 },
    { x: 5, z: 0.4 },
    { x: -2, z: 2.1 },
  ]

  const meshList: Mesh[] = []
  const itemList: PebbleItem[] = []

  for (const [index, spot] of pebbleSpotList.entries()) {
    const x = spot.x + (random() - 0.5) * 0.5
    const z = spot.z + (random() - 0.5) * 0.4
    const isShell = index % 4 === 3
    let mesh: Mesh
    let restingY: number
    if (isShell) {
      // 貝殼：壓扁的低分段球，淡粉色
      const diameter = 0.16 + random() * 0.05
      mesh = CreateSphere(`tankShell${index}`, { diameter, segments: 5 }, scene)
      mesh.scaling.set(1, 0.42, 0.85)
      mesh.material = shellMaterial
      mesh.convertToFlatShadedMesh()
      restingY = diameter * 0.42 * 0.5
    }
    else {
      // 中高面數多面體＋頂點擾動＋不等比壓扁，與大石頭同做法的迷你版，
      // 低面數的正多面體太規則、看起來單調
      const size = 0.06 + random() * 0.05
      const polyhedronTypeList = [2, 3, 4]
      const type = polyhedronTypeList[index % polyhedronTypeList.length]!
      mesh = CreatePolyhedron(`tankPebble${index}`, { type, size, flat: false }, scene)
      const positionList = mesh.getVerticesData(VertexBuffer.PositionKind)
      if (positionList) {
        const jitter = size * 0.35
        for (let vertexIndex = 0; vertexIndex < positionList.length; vertexIndex += 3) {
          positionList[vertexIndex] = (positionList[vertexIndex] ?? 0) + (random() - 0.5) * jitter
          positionList[vertexIndex + 1] = (positionList[vertexIndex + 1] ?? 0) + (random() - 0.5) * jitter
          positionList[vertexIndex + 2] = (positionList[vertexIndex + 2] ?? 0) + (random() - 0.5) * jitter
        }
        mesh.updateVerticesData(VertexBuffer.PositionKind, positionList)
      }
      mesh.convertToFlatShadedMesh()
      mesh.scaling.set(0.9 + random() * 0.4, 0.6 + random() * 0.3, 0.9 + random() * 0.4)
      mesh.material = pebbleMaterialList[index % pebbleMaterialList.length]!
      restingY = size * 0.55
    }
    mesh.rotation.y = random() * Math.PI * 2
    mesh.position.set(x, GROUND_Y + restingY, z)
    // 可點擊戳一下（點擊處理依 metadata 辨認，戳卵石不會誤派魚移動）
    mesh.isPickable = true
    mesh.metadata = { isPokeablePebble: true }
    meshList.push(mesh)
    itemList.push({ mesh, spawnPosition: mesh.position.clone() })
  }

  return { meshList, itemList }
}

/** 幾支胖蠟筆（三立一躺），代表繪畫創作。
 * 粗短圓柱貼地穩固，色彩鮮明、遠看即辨。
 */
function buildCrayonSet(scene: Scene): {
  meshList: Mesh[];
  root: TransformNode;
  obstacle: ObstacleCircle;
  /** 直立的三支蠟筆節點，供停靠展示動畫左右搖擺 */
  standingCrayonNodeList: TransformNode[];
} {
  const crayonSetX = 3.7
  const crayonSetZ = 2.3

  const bandMaterial = new StandardMaterial('tankCrayonBandMaterial', scene)
  bandMaterial.diffuseColor = Color3.FromHexString('#f0ead8')
  bandMaterial.specularColor = Color3.Black()

  const root = new TransformNode('tankCrayonSetRoot', scene)
  root.position.set(crayonSetX, GROUND_Y, crayonSetZ)
  root.rotation.y = -0.35

  const meshList: Mesh[] = []

  const bodyDiameter = 0.17
  const bodyHeight = 0.62
  const tipHeight = 0.17

  /** 組一支蠟筆（筆身＋筆尖＋紙環），回傳可擺位的節點 */
  function buildCrayon(index: number, color: string): TransformNode {
    const crayonMaterial = new StandardMaterial(`tankCrayonMaterial${index}`, scene)
    crayonMaterial.diffuseColor = Color3.FromHexString(color)
    crayonMaterial.emissiveColor = Color3.FromHexString(color).scale(0.12)
    crayonMaterial.specularColor = Color3.Black()

    const crayonNode = new TransformNode(`tankCrayon${index}`, scene)
    crayonNode.parent = root

    const body = CreateCylinder(`tankCrayonBody${index}`, { diameter: bodyDiameter, height: bodyHeight, tessellation: 10 }, scene)
    body.position.y = bodyHeight / 2
    body.material = crayonMaterial
    body.isPickable = false
    body.parent = crayonNode
    meshList.push(body)

    const tip = CreateCylinder(
      `tankCrayonTip${index}`,
      { diameterTop: 0.03, diameterBottom: bodyDiameter, height: tipHeight, tessellation: 10 },
      scene,
    )
    tip.position.y = bodyHeight + tipHeight / 2
    tip.material = crayonMaterial
    tip.isPickable = false
    tip.parent = crayonNode
    meshList.push(tip)

    // 紙套：同色系深一階的包裝紙包覆大半筆身（經典蠟筆look），
    // 筆尖端與筆尾露出蠟的本色，套緣略粗一圈做出紙的厚度
    const wrapperMaterial = new StandardMaterial(`tankCrayonWrapperMaterial${index}`, scene)
    wrapperMaterial.diffuseColor = Color3.FromHexString(color).scale(0.72)
    wrapperMaterial.specularColor = Color3.Black()

    const wrapper = CreateCylinder(
      `tankCrayonWrapper${index}`,
      { diameter: bodyDiameter + 0.024, height: 0.36, tessellation: 10 },
      scene,
    )
    wrapper.position.y = bodyHeight * 0.44
    wrapper.material = wrapperMaterial
    wrapper.isPickable = false
    wrapper.parent = crayonNode
    meshList.push(wrapper)

    // 紙套中段的奶油色標籤帶（再粗一圈，疊在紙套上）
    const label = CreateCylinder(
      `tankCrayonLabel${index}`,
      { diameter: bodyDiameter + 0.034, height: 0.11, tessellation: 10 },
      scene,
    )
    label.position.y = bodyHeight * 0.44
    label.material = bandMaterial
    label.isPickable = false
    label.parent = crayonNode
    meshList.push(label)

    return crayonNode
  }

  // 三支直立微傾（底部略沉入地面），互相靠攏成一小叢
  const standingItemList = [
    { color: '#d0553f', x: -0.16, z: -0.05, tiltX: -0.05, tiltZ: -0.08 },
    { color: '#4f9ac2', x: 0.05, z: 0.1, tiltX: 0.06, tiltZ: 0.05 },
    { color: '#4f9f6f', x: 0.16, z: -0.12, tiltX: -0.04, tiltZ: 0.09 },
  ]
  const standingCrayonNodeList = standingItemList.map((item, index) => {
    const crayonNode = buildCrayon(index, item.color)
    crayonNode.position.set(item.x, -0.015, item.z)
    crayonNode.rotation.set(item.tiltX, 0, item.tiltZ)
    return crayonNode
  })

  // 一支橫躺的黃蠟筆斜擺在立筆叢前側（-z 朝觀眾），不被擋住
  const lyingCrayonNode = buildCrayon(3, '#e0b53f')
  lyingCrayonNode.position.set(-0.4, bodyDiameter / 2 - 0.01, -0.3)
  lyingCrayonNode.rotation.set(Math.PI / 2, -0.9, 0)

  // 俯視碰撞圓：涵蓋立筆叢與橫躺那支
  return { meshList, root, obstacle: { x: crayonSetX, z: crayonSetZ, radius: 0.5 }, standingCrayonNodeList }
}

/** 復古卡通相機：機身、軍艦部、凸出的鏡頭、快門鈕與觀景窗 */
function buildCamera(scene: Scene): {
  meshList: Mesh[];
  root: TransformNode;
  obstacle: ObstacleCircle;
  /** 鏡片材質，停靠展示動畫用 emissive 做閃光 */
  flashMaterial: StandardMaterial;
  /** 快門鈕，展示動畫按壓用 */
  shutterButton: Mesh;
} {
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
  return {
    meshList,
    root,
    obstacle: { x: cameraX, z: cameraZ, radius: 0.56 },
    flashMaterial: lensMaterial,
    shutterButton: shutter,
  }
}

/** 復古打字機：芥末黃機身、斜置米白鍵盤、黑色滾筒與一張插著的白紙，
 * 與相機（攝影）、搖桿（遊戲）並列，代表部落格的寫作
 */
function buildTypewriter(scene: Scene): {
  meshList: Mesh[];
  root: TransformNode;
  obstacle: ObstacleCircle;
  /** 滾筒上的白紙，停靠展示動畫抖動用 */
  paper: Mesh;
  /** 三排圓形鍵帽，停靠展示動畫依序按壓用 */
  keyList: Mesh[];
} {
  // 放在場景前方（-z）：橫式在畫面前方中央偏右；直式畫面右側＝世界 -z，
  // 剛好與左側的相機、蠟筆分兩邊，兩種取景構圖都平衡
  const typewriterX = 0.6
  const typewriterZ = -2.55

  const bodyMaterial = new StandardMaterial('tankTypewriterBodyMaterial', scene)
  bodyMaterial.diffuseColor = Color3.FromHexString('#3e5f52')
  bodyMaterial.specularColor = Color3.FromHexString('#16241f')
  bodyMaterial.specularPower = 32

  const keyMaterial = new StandardMaterial('tankTypewriterKeyMaterial', scene)
  keyMaterial.diffuseColor = Color3.FromHexString('#ece7dc')
  keyMaterial.specularColor = Color3.Black()

  const darkMaterial = new StandardMaterial('tankTypewriterDarkMaterial', scene)
  darkMaterial.diffuseColor = Color3.FromHexString('#26262a')
  darkMaterial.specularColor = Color3.FromHexString('#15151a')

  const paperMaterial = new StandardMaterial('tankTypewriterPaperMaterial', scene)
  paperMaterial.diffuseColor = Color3.FromHexString('#f5f2ea')
  paperMaterial.specularColor = Color3.Black()
  paperMaterial.backFaceCulling = false

  // 鍵盤面向觀眾（-z），微轉一點角度展示立體
  const root = new TransformNode('tankTypewriterRoot', scene)
  root.position.set(typewriterX, GROUND_Y, typewriterZ)
  root.rotation.y = 0.2

  const meshList: Mesh[] = []

  // 機身（後半較高的主體）
  const body = createBeveledBox('tankTypewriterBody', scene, { width: 0.82, height: 0.26, depth: 0.5, bevel: 0.035 }, bodyMaterial)
  body.position.set(0, 0.15, 0.08)
  body.parent = root
  meshList.push(body)

  // 斜置鍵盤板：作為父節點，按鍵以板面座標擺放、跟著一起傾斜
  const keyboardPlate = createBeveledBox('tankTypewriterKeyboard', scene, { width: 0.74, height: 0.07, depth: 0.36, bevel: 0.02 }, bodyMaterial)
  keyboardPlate.position.set(0, 0.16, -0.3)
  keyboardPlate.rotation.x = -0.38
  keyboardPlate.parent = root
  meshList.push(keyboardPlate)

  // 三排圓鍵（5/4/5 交錯）＋空白鍵，貼在鍵盤板上
  const keyList: Mesh[] = []
  const keyRowList = [
    { z: 0.1, count: 5 },
    { z: 0.01, count: 4 },
    { z: -0.08, count: 5 },
  ]
  for (const [rowIndex, row] of keyRowList.entries()) {
    for (let keyIndex = 0; keyIndex < row.count; keyIndex++) {
      const key = CreateCylinder(
        `tankTypewriterKey${rowIndex}-${keyIndex}`,
        { diameter: 0.075, height: 0.035, tessellation: 10 },
        scene,
      )
      key.position.set((keyIndex - (row.count - 1) / 2) * 0.13, 0.05, row.z)
      key.material = keyMaterial
      key.isPickable = false
      key.parent = keyboardPlate
      meshList.push(key)
      keyList.push(key)
    }
  }
  const spaceBar = createBeveledBox('tankTypewriterSpaceBar', scene, { width: 0.3, height: 0.035, depth: 0.06, bevel: 0.012 }, keyMaterial)
  spaceBar.position.set(0, 0.05, -0.15)
  spaceBar.parent = keyboardPlate
  meshList.push(spaceBar)

  // 字桿區（鍵盤與滾筒之間的深色凹槽）
  const typeBarInset = createBeveledBox('tankTypewriterInset', scene, { width: 0.56, height: 0.05, depth: 0.18, bevel: 0.015 }, darkMaterial)
  typeBarInset.position.set(0, 0.29, 0.0)
  typeBarInset.parent = root
  meshList.push(typeBarInset)

  // 滾筒（橫置圓柱）與兩端旋鈕
  const platen = CreateCylinder('tankTypewriterPlaten', { diameter: 0.15, height: 0.74, tessellation: 12 }, scene)
  platen.rotation.z = Math.PI / 2
  platen.position.set(0, 0.36, 0.16)
  platen.material = darkMaterial
  platen.isPickable = false
  platen.parent = root
  meshList.push(platen)

  for (const side of [-1, 1]) {
    const knob = CreateCylinder(`tankTypewriterKnob${side}`, { diameter: 0.08, height: 0.06, tessellation: 10 }, scene)
    knob.rotation.z = Math.PI / 2
    knob.position.set(side * 0.41, 0.36, 0.16)
    knob.material = keyMaterial
    knob.isPickable = false
    knob.parent = root
    meshList.push(knob)
  }

  // 插在滾筒後的白紙，微微後仰
  const paper = createBeveledBox('tankTypewriterPaper', scene, { width: 0.46, height: 0.38, depth: 0.015, bevel: 0.005 }, paperMaterial)
  paper.position.set(0, 0.55, 0.2)
  paper.rotation.x = 0.14
  paper.parent = root
  meshList.push(paper)

  // 俯視碰撞圓：涵蓋機身與前凸的鍵盤
  return { meshList, root, obstacle: { x: typewriterX, z: typewriterZ, radius: 0.58 }, paper, keyList }
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

  const angularAxisList = [
    PhysicsConstraintAxis.ANGULAR_X,
    PhysicsConstraintAxis.ANGULAR_Y,
    PhysicsConstraintAxis.ANGULAR_Z,
  ]
  const constraint = new Physics6DoFConstraint(
    { pivotA, pivotB, axisA, axisB, perpAxisA, perpAxisB },
    [
      { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      // 剛度／阻尼只能在建構時帶入（plugin 初始化約束時寫進 Havok），之後沒有對應的 setter
      ...angularAxisList.map((axis) => ({
        axis,
        minLimit: 0,
        maxLimit: 0,
        stiffness: SEAWEED_SPRING_STIFFNESS,
        damping: SEAWEED_SPRING_DAMPING,
      })),
    ],
    scene,
  )
  parentAggregate.body.addConstraint(childAggregate.body, constraint)

  // 角度軸改成「軟限制」：plugin 看到 min = max = 0 會把軸設為 LOCKED（硬約束），
  // 硬約束被魚（kinematic、等同無限質量）擠開後，接觸一消失就直接投影回原姿態，
  // 這正是「瞬間復原」的來源——剛度、阻尼調得再軟都沒用。
  // 約束建好後把角度軸改回 LIMITED（範圍仍是 0），Havok 才會以彈簧求解，
  // 葉片挺回才有回彈的過程
  for (const axis of angularAxisList) {
    constraint.setAxisMode(axis, PhysicsConstraintAxisLimitMode.LIMITED)
    constraint.setAxisMinLimit(axis, 0)
    constraint.setAxisMaxLimit(axis, 0)
  }
}

export function createTankEnvironment(scene: Scene): TankEnvironment {
  const random = createRandomGenerator(20260715)

  const swayItemList: SwayItem[] = []
  const pushItemList: PushItem[] = []
  const rocks = buildRockList(scene, random)
  const seaweed = buildSeaweed(scene, random, swayItemList, pushItemList)
  const pebbles = buildPebbleList(scene, random)
  const crayonSet = buildCrayonSet(scene)
  const camera = buildCamera(scene)
  const typewriter = buildTypewriter(scene)

  // 石頭、蠟筆、相機、打字機的俯視碰撞圓，供魚繞行
  const obstacleList: ObstacleCircle[] = [
    ...rocks.obstacleList,
    crayonSet.obstacle,
    camera.obstacle,
    typewriter.obstacle,
  ]

  // 可互動裝飾：魚停在旁邊時，外層在錨點位置顯示連結 popup
  const interactionSpotList: InteractionSpot[] = [
    { key: 'camera', ...camera.obstacle, anchorY: 1.15 },
    { key: 'crayonSet', ...crayonSet.obstacle, anchorY: 1 },
    { key: 'typewriter', ...typewriter.obstacle, anchorY: 1.05 },
  ]

  // 可互動裝飾的 mesh 開放 pick 並掛上識別鍵，點擊時外層可辨認點到哪個裝飾
  const interactionDecorationList: { key: InteractionSpotKey; root: TransformNode; meshList: Mesh[] }[] = [
    { key: 'camera', root: camera.root, meshList: camera.meshList },
    { key: 'crayonSet', root: crayonSet.root, meshList: crayonSet.meshList },
    { key: 'typewriter', root: typewriter.root, meshList: typewriter.meshList },
  ]
  for (const decoration of interactionDecorationList) {
    for (const mesh of decoration.meshList) {
      mesh.isPickable = true
      mesh.metadata = { interactionSpotKey: decoration.key }
    }
  }

  // 裝飾互動回饋：點擊彈跳（衰減 squash & stretch）與 hover 微放大增亮，
  // 兩者都寫入 root.scaling，集中在同一處計算避免互相覆蓋
  const SPOT_BOUNCE_DURATION = 0.55
  /** hover 進出的彈簧速率（每秒收斂比例） */
  const SPOT_HOVER_LERP_RATE = 12
  /** hover 時的放大量：長高比長寬多一點，有「挺起來打招呼」的感覺 */
  const SPOT_HOVER_SCALE_HORIZONTAL = 0.04
  const SPOT_HOVER_SCALE_VERTICAL = 0.08
  /** hover 增亮的 emissive 疊加量（微暖白，避免發光感太重） */
  const SPOT_HOVER_EMISSIVE_BOOST = new Color3(0.1, 0.1, 0.085)

  /** 解鎖顏色過渡速率（1/s）：解鎖瞬間顏色約半秒暈染回來 */
  const UNLOCK_TRANSITION_RATE = 2.4

  /** 鎖定時的「未上色紙模」顏色：保留明度層次、拉到灰白紙的亮度帶，微微偏暖 */
  function computeLockedPaperColor(color: Color3): Color3 {
    const luminance = color.r * 0.299 + color.g * 0.587 + color.b * 0.114
    const paperValue = 0.56 + luminance * 0.36
    return new Color3(paperValue, paperValue * 0.985, paperValue * 0.955)
  }

  /** 鎖定裝飾上方漂浮的紙片鎖頭旗標（billboard 面向鏡頭）。
   * 鎖頭以 canvas 向量繪製（非 emoji），跨平台外觀一致
   */
  function buildSpotLockFlag(key: InteractionSpotKey, anchorY: number, parent: TransformNode): Mesh {
    const textureSize = 128
    const texture = new DynamicTexture(`tankSpotLockTexture-${key}`, textureSize, scene, true)
    texture.hasAlpha = true
    const context = texture.getContext() as CanvasRenderingContext2D
    const hasRoundRect = typeof context.roundRect === 'function'
    context.clearRect(0, 0, textureSize, textureSize)

    // 先鋪一層奶油色描邊（同形狀放大版），像紙貼紙的裁切邊，夜間也不糊底
    context.strokeStyle = 'rgba(255, 253, 247, 0.9)'
    context.fillStyle = 'rgba(255, 253, 247, 0.9)'
    context.lineCap = 'round'
    context.lineWidth = 17
    context.beginPath()
    context.arc(64, 54, 20, Math.PI, Math.PI * 2)
    context.stroke()
    context.beginPath()
    if (hasRoundRect) {
      context.roundRect(29, 49, 70, 56, 13)
    }
    else {
      context.rect(29, 49, 70, 56)
    }
    context.fill()

    // 鎖鉤：上半圓弧
    context.strokeStyle = '#4a5a63'
    context.lineWidth = 10
    context.beginPath()
    context.arc(64, 54, 20, Math.PI, Math.PI * 2)
    context.stroke()
    // 鎖體：圓角矩形
    context.fillStyle = '#4a5a63'
    context.beginPath()
    if (hasRoundRect) {
      context.roundRect(34, 54, 60, 46, 9)
    }
    else {
      context.rect(34, 54, 60, 46)
    }
    context.fill()
    // 鎖孔
    context.fillStyle = '#f4efe4'
    context.beginPath()
    context.arc(64, 71, 6.5, 0, Math.PI * 2)
    context.fill()
    context.fillRect(61, 71, 7, 16)
    texture.update()

    const material = new StandardMaterial(`tankSpotLockMaterial-${key}`, scene)
    material.diffuseTexture = texture
    material.useAlphaFromDiffuseTexture = true
    material.emissiveColor = Color3.White()
    material.disableLighting = true
    material.backFaceCulling = false

    const flagMesh = CreatePlane(`tankSpotLockFlag-${key}`, { size: 0.42 }, scene)
    flagMesh.material = material
    flagMesh.billboardMode = TransformNode.BILLBOARDMODE_ALL
    flagMesh.isPickable = false
    flagMesh.parent = parent
    flagMesh.position.set(0, anchorY + 0.34, 0)
    flagMesh.setEnabled(false)
    return flagMesh
  }

  interface SpotEffectItem {
    node: TransformNode;
    bounceElapsed: number;
    hoverProgress: number;
    /** 上次套用 emissive 的 hover 進度，變化夠大才重寫材質 */
    appliedHoverProgress: number;
    /** 進場演出的起跳延遲（秒），由進場註冊時回填 */
    entranceDelay: number;
    materialEntryList: {
      material: StandardMaterial;
      baseEmissiveColor: Color3;
      baseDiffuseColor: Color3;
      lockedDiffuseColor: Color3;
    }[];
    /** 解鎖顏色進度：0 = 灰白紙模、1 = 原色 */
    unlockProgress: number;
    targetUnlockProgress: number;
    appliedUnlockProgress: number;
    lockFlagMesh: Mesh;
    lockFlagBaseY: number;
    lockFlagBobPhase: number;
  }

  const spotEffectItemMap = new Map<InteractionSpotKey, SpotEffectItem>(
    interactionDecorationList.map((decoration, decorationIndex) => {
      const materialSet = new Set<StandardMaterial>()
      for (const mesh of decoration.meshList) {
        if (mesh.material instanceof StandardMaterial) {
          materialSet.add(mesh.material)
        }
      }
      const spot = interactionSpotList.find((item) => item.key === decoration.key)
      const anchorY = spot?.anchorY ?? 1
      return [decoration.key, {
        node: decoration.root,
        bounceElapsed: SPOT_BOUNCE_DURATION,
        hoverProgress: 0,
        appliedHoverProgress: 0,
        entranceDelay: 0,
        materialEntryList: [...materialSet].map((material) => ({
          material,
          baseEmissiveColor: material.emissiveColor.clone(),
          baseDiffuseColor: material.diffuseColor.clone(),
          lockedDiffuseColor: computeLockedPaperColor(material.diffuseColor),
        })),
        unlockProgress: 1,
        targetUnlockProgress: 1,
        appliedUnlockProgress: 1,
        lockFlagMesh: buildSpotLockFlag(decoration.key, anchorY, decoration.root),
        lockFlagBaseY: anchorY + 0.34,
        lockFlagBobPhase: decorationIndex * 2.1,
      }]
    }),
  )

  function setSpotLocked(key: InteractionSpotKey, isLocked: boolean, skipTransition = false) {
    const effectItem = spotEffectItemMap.get(key)
    if (!effectItem) {
      return
    }
    effectItem.targetUnlockProgress = isLocked ? 0 : 1
    if (skipTransition) {
      effectItem.unlockProgress = effectItem.targetUnlockProgress
    }
  }

  let hoveredSpotKey: InteractionSpotKey | null = null
  /** 鎖頭旗標漂浮動畫的累積時間 */
  let spotLockTimeSeconds = 0

  function playSpotBounce(key: InteractionSpotKey) {
    const effectItem = spotEffectItemMap.get(key)
    if (effectItem) {
      effectItem.bounceElapsed = 0
    }
  }

  function setSpotHover(key: InteractionSpotKey | null) {
    hoveredSpotKey = key
  }

  function updateSpotEffects(deltaSeconds: number) {
    spotLockTimeSeconds += deltaSeconds
    for (const [key, effectItem] of spotEffectItemMap) {
      // 解鎖顏色過渡：灰白紙模 ↔ 原色 平滑暈染
      effectItem.unlockProgress
        += (effectItem.targetUnlockProgress - effectItem.unlockProgress)
          * Math.min(1, deltaSeconds * UNLOCK_TRANSITION_RATE)
      if (Math.abs(effectItem.unlockProgress - effectItem.appliedUnlockProgress) > 0.004) {
        effectItem.appliedUnlockProgress = effectItem.unlockProgress
        for (const materialEntry of effectItem.materialEntryList) {
          Color3.LerpToRef(
            materialEntry.lockedDiffuseColor,
            materialEntry.baseDiffuseColor,
            effectItem.unlockProgress,
            materialEntry.material.diffuseColor,
          )
        }
      }

      // 鎖頭旗標：鎖定時上下漂浮，解鎖過程上飄縮小淡出
      const flagVisibility = 1 - effectItem.unlockProgress
      if (flagVisibility <= 0.01) {
        if (effectItem.lockFlagMesh.isEnabled()) {
          effectItem.lockFlagMesh.setEnabled(false)
        }
      }
      else {
        if (!effectItem.lockFlagMesh.isEnabled()) {
          effectItem.lockFlagMesh.setEnabled(true)
        }
        const bobOffset = Math.sin(spotLockTimeSeconds * 2.1 + effectItem.lockFlagBobPhase) * 0.045
        effectItem.lockFlagMesh.position.y
          = effectItem.lockFlagBaseY + bobOffset + effectItem.unlockProgress * 0.5
        effectItem.lockFlagMesh.scaling.setAll(flagVisibility)
        effectItem.lockFlagMesh.visibility = flagVisibility
      }
      // hover 進度彈簧收斂
      const hoverTarget = key === hoveredSpotKey ? 1 : 0
      effectItem.hoverProgress
        += (hoverTarget - effectItem.hoverProgress) * Math.min(1, deltaSeconds * SPOT_HOVER_LERP_RATE)

      // 點擊彈跳：先壓扁再回彈的衰減震盪；root 原點在地面，往下壓不會浮空
      let wobble = 0
      if (effectItem.bounceElapsed < SPOT_BOUNCE_DURATION) {
        effectItem.bounceElapsed += deltaSeconds
        const progress = Math.min(effectItem.bounceElapsed / SPOT_BOUNCE_DURATION, 1)
        wobble = Math.sin(progress * Math.PI * 3) * (1 - progress) * 0.16
      }

      // 進場縮放與 hover / 彈跳倍率相乘，兩套效果共寫 scaling 不互蓋
      const entranceScale = computeEntranceScale(effectItem.entranceDelay)
      const horizontalScale = (1 + effectItem.hoverProgress * SPOT_HOVER_SCALE_HORIZONTAL + wobble * 0.6) * entranceScale
      effectItem.node.scaling.set(
        horizontalScale,
        (1 + effectItem.hoverProgress * SPOT_HOVER_SCALE_VERTICAL - wobble) * entranceScale,
        horizontalScale,
      )

      // 增亮：hover 進度變化夠大才重寫材質 emissive
      if (Math.abs(effectItem.hoverProgress - effectItem.appliedHoverProgress) > 0.01) {
        effectItem.appliedHoverProgress = effectItem.hoverProgress
        for (const materialEntry of effectItem.materialEntryList) {
          materialEntry.material.emissiveColor
            .copyFrom(materialEntry.baseEmissiveColor)
            .addInPlace(SPOT_HOVER_EMISSIVE_BOOST.scale(effectItem.hoverProgress))
        }
      }
    }
  }

  // --- 停靠展示動畫：魚停到裝飾旁時各裝飾的專屬小演出 ---
  const SHOWCASE_DURATION = 1
  const showcaseElapsedMap = new Map<InteractionSpotKey, number>([
    ['camera', SHOWCASE_DURATION],
    ['crayonSet', SHOWCASE_DURATION],
    ['typewriter', SHOWCASE_DURATION],
  ])
  const cameraFlashBaseEmissiveColor = camera.flashMaterial.emissiveColor.clone()
  const cameraShutterBaseY = camera.shutterButton.position.y
  const typewriterPaperBaseRotationX = typewriter.paper.rotation.x
  const typewriterKeyBaseY = typewriter.keyList[0]?.position.y ?? 0.05
  /** 打字順序（鍵帽索引亂序跳動，看起來像真的在打字） */
  const typewriterPressOrderList = [3, 9, 5, 12, 1, 7, 10, 4]
  const crayonBaseRotationZList = crayonSet.standingCrayonNodeList.map((node) => node.rotation.z)

  function playSpotShowcase(key: InteractionSpotKey) {
    showcaseElapsedMap.set(key, 0)
  }

  function updateShowcase(deltaSeconds: number) {
    for (const [key, elapsed] of showcaseElapsedMap) {
      if (elapsed >= SHOWCASE_DURATION) {
        continue
      }
      const nextElapsed = Math.min(elapsed + deltaSeconds, SHOWCASE_DURATION)
      showcaseElapsedMap.set(key, nextElapsed)
      const progress = nextElapsed / SHOWCASE_DURATION
      // 衰減包絡：所有擺動收斂回原位，結束時不跳變
      const settle = 1 - progress

      if (key === 'camera') {
        // 快門按下彈起（前 0.3），閃光快速亮起後衰減
        const pressProgress = Math.min(1, progress / 0.3)
        camera.shutterButton.position.y
          = cameraShutterBaseY - Math.sin(pressProgress * Math.PI) * 0.025
        const flashIntensity = progress < 0.12
          ? progress / 0.12
          : Math.max(0, 1 - (progress - 0.12) / 0.45)
        const flashBoost = flashIntensity * 0.85
        camera.flashMaterial.emissiveColor.set(
          Math.min(1, cameraFlashBaseEmissiveColor.r + flashBoost),
          Math.min(1, cameraFlashBaseEmissiveColor.g + flashBoost),
          Math.min(1, cameraFlashBaseEmissiveColor.b + flashBoost),
        )
      }
      else if (key === 'typewriter') {
        // 紙張前後抖兩下
        typewriter.paper.rotation.x
          = typewriterPaperBaseRotationX + Math.sin(progress * Math.PI * 4) * 0.14 * settle

        // 依亂序逐顆按壓鍵帽，像有人在打字；每幀先全部歸位再壓當前那顆
        for (const keyMesh of typewriter.keyList) {
          keyMesh.position.y = typewriterKeyBaseY
        }
        const pressCount = typewriterPressOrderList.length
        const pressIndex = Math.min(pressCount - 1, Math.floor(progress * pressCount))
        const pressProgress = progress * pressCount - pressIndex
        const pressedKeyIndex = typewriterPressOrderList[pressIndex] ?? 0
        const pressedKey = typewriter.keyList[pressedKeyIndex]
        if (pressedKey) {
          pressedKey.position.y = typewriterKeyBaseY - Math.sin(pressProgress * Math.PI) * 0.024
        }
      }
      else {
        // 三支立蠟筆交錯方向左右搖擺
        crayonSet.standingCrayonNodeList.forEach((crayonNode, index) => {
          const direction = index % 2 === 0 ? 1 : -1
          crayonNode.rotation.z = (crayonBaseRotationZList[index] ?? 0)
            + Math.sin(progress * Math.PI * 3) * 0.09 * settle * direction
        })
      }
    }
  }

  // --- 夜間過渡（深色模式）：螢火亮度與泛光平滑過渡 ---
  const NIGHT_TRANSITION_RATE = 3
  let nightTarget = 0
  let nightProgress = 0

  function setNightMode(enabled: boolean) {
    nightTarget = enabled ? 1 : 0
  }

  function updateNightLight(deltaSeconds: number) {
    if (Math.abs(nightProgress - nightTarget) < 0.001) {
      return
    }
    nightProgress += (nightTarget - nightProgress) * Math.min(1, deltaSeconds * NIGHT_TRANSITION_RATE)
    if (Math.abs(nightProgress - nightTarget) < 0.001) {
      nightProgress = nightTarget
    }
    nightGlowLayer.intensity = nightProgress * 0.9
  }

  // --- 夜間螢火：深色模式時在暗區漂浮的微光點 ---
  const FIREFLY_COUNT = 12

  interface FireflyItem {
    mesh: Mesh;
    baseX: number;
    baseY: number;
    baseZ: number;
    phase: number;
    speed: number;
    driftRadius: number;
  }

  const fireflyMaterial = new StandardMaterial('tankFireflyMaterial', scene)
  fireflyMaterial.emissiveColor = Color3.FromHexString('#ffe2a0')
  fireflyMaterial.disableLighting = true
  fireflyMaterial.alphaMode = Constants.ALPHA_ADD

  // 錨定在水草叢與石頭附近：地板吃不到光（純陰影材質），
  // 螢火要貼著有東西的地方飛，實體光照才照得到物件
  const fireflyAnchorList = [
    { x: -3.9, z: 1.9 },
    { x: -2.3, z: -2.5 },
    { x: 4.35, z: 0.2 },
    { x: 0.2, z: 2.7 },
    { x: -4.5, z: -2.5 },
    { x: 4.5, z: -2.6 },
    { x: -4.3, z: 2.4 },
    { x: 1.8, z: 2.9 },
  ]

  const fireflyList: FireflyItem[] = []
  for (let index = 0; index < FIREFLY_COUNT; index++) {
    const mesh = CreateSphere(`tankFirefly${index}`, { diameter: 0.05, segments: 6 }, scene)
    mesh.material = fireflyMaterial
    mesh.isPickable = false
    mesh.visibility = 0

    const anchor = fireflyAnchorList[index % fireflyAnchorList.length]!
    fireflyList.push({
      mesh,
      baseX: anchor.x + (random() - 0.5) * 1.6,
      baseY: 0.35 + random() * 0.75,
      baseZ: anchor.z + (random() - 0.5) * 1.2,
      phase: random() * Math.PI * 2,
      speed: 0.3 + random() * 0.4,
      driftRadius: 0.25 + random() * 0.3,
    })
  }

  // 夜間泛光：只收錄螢火與燈泡，其他 emissive 材質（蠟筆、水草）不跟著暈開
  const nightGlowLayer = new GlowLayer('tankNightGlowLayer', scene, { blurKernelSize: 48 })
  nightGlowLayer.intensity = 0
  for (const firefly of fireflyList) {
    nightGlowLayer.addIncludedOnlyMesh(firefly.mesh)
  }

  // 螢火蟲實體光照：clustered lighting 把多盞微型點光叢集處理，
  // 只佔一個 shader 光槽就能讓每隻螢火真的照亮周遭。
  // 需要 WebGL2 可混合浮點緩衝，不支援就退回純視覺光暈
  const fireflyLightList: PointLight[] = []
  for (const firefly of fireflyList) {
    // dontAddToScene：光只透過叢集容器渲染（官方建議，效能較佳）。
    // 直接共用 mesh.position 的參考，螢火移動時光源自動跟隨
    const fireflyLight = new PointLight(`${firefly.mesh.name}-light`, firefly.mesh.position, scene, true)
    fireflyLight.diffuse = Color3.FromHexString('#ffd98a')
    fireflyLight.specular = Color3.Black()
    fireflyLight.range = 2.4
    fireflyLight.intensity = 0
    fireflyLightList.push(fireflyLight)
  }
  const fireflyLightContainer = new ClusteredLightContainer('tankFireflyLightContainer', fireflyLightList, scene)
  if (!fireflyLightContainer.isSupported) {
    console.warn('[fish-diorama] 環境不支援 clustered lighting，螢火退回純視覺光暈')
    fireflyLightContainer.dispose()
    for (const fireflyLight of fireflyLightList) {
      fireflyLight.dispose()
    }
    fireflyLightList.length = 0
  }

  let firefliesHidden = true

  function updateFireflyList(timeSeconds: number) {
    if (nightProgress <= 0.001) {
      if (!firefliesHidden) {
        firefliesHidden = true
        for (const firefly of fireflyList) {
          firefly.mesh.visibility = 0
        }
        for (const fireflyLight of fireflyLightList) {
          fireflyLight.intensity = 0
        }
      }
      return
    }
    firefliesHidden = false
    for (const [index, firefly] of fireflyList.entries()) {
      const driftTime = timeSeconds * firefly.speed + firefly.phase
      firefly.mesh.position.set(
        firefly.baseX + Math.cos(driftTime) * firefly.driftRadius,
        firefly.baseY + Math.sin(driftTime * 1.7) * 0.15,
        firefly.baseZ + Math.sin(driftTime * 0.9) * firefly.driftRadius,
      )
      // 明滅呼吸；加色混合下 visibility 直接當亮度用，實體光強度跟著同步
      const twinkle = 0.35 + 0.35 * Math.sin(driftTime * 2.3)
      firefly.mesh.visibility = nightProgress * twinkle
      const fireflyLight = fireflyLightList[index]
      if (fireflyLight) {
        fireflyLight.intensity = nightProgress * twinkle * 2.4
      }
    }
  }

  // --- 進場演出：擺設依序從 0 彈出到原尺寸（easeOutBack 過衝） ---
  const ENTRANCE_ITEM_DURATION = 0.5
  const ENTRANCE_STAGGER = 0.07

  interface EntranceItem {
    node: TransformNode;
    baseScaling: Vector3;
    delay: number;
  }

  const entranceItemList: EntranceItem[] = []
  let entranceElapsed = 0
  let entranceRegisterCount = 0
  let isEntranceFinished = false

  function registerEntranceNode(node: TransformNode, sharesPreviousDelay = false) {
    // 共拍：數量多的小物（卵石）跟前一項同拍彈出，進場總長不被拉太長
    const delayIndex = sharesPreviousDelay
      ? Math.max(0, entranceRegisterCount - 1)
      : entranceRegisterCount
    entranceItemList.push({
      node,
      baseScaling: node.scaling.clone(),
      delay: delayIndex * ENTRANCE_STAGGER,
    })
    // 開演前縮到近乎不可見（不用 0，避免縮放矩陣退化）
    node.scaling.setAll(0.001)
    if (!sharesPreviousDelay) {
      entranceRegisterCount += 1
    }
  }

  for (const rock of rocks.meshList) {
    registerEntranceNode(rock)
  }
  for (const plant of seaweed.plantList) {
    registerEntranceNode(plant.anchorNode)
  }
  for (const [pebbleIndex, pebbleItem] of pebbles.itemList.entries()) {
    registerEntranceNode(pebbleItem.mesh, pebbleIndex % 3 !== 0)
  }
  // 三個可互動裝飾的 scaling 由 updateSpotEffects 統一寫入，進場只回填延遲、
  // 由 computeEntranceScale 提供倍率（放最後壓軸彈出）
  for (const effectItem of spotEffectItemMap.values()) {
    effectItem.entranceDelay = entranceRegisterCount * ENTRANCE_STAGGER
    entranceRegisterCount += 1
  }
  const entranceTotalSeconds
    = entranceRegisterCount * ENTRANCE_STAGGER + ENTRANCE_ITEM_DURATION

  /** 指定延遲項目目前的進場縮放倍率（0.001 ~ 1，easeOutBack 過衝） */
  function computeEntranceScale(delay: number): number {
    const progress = Math.min(1, Math.max(0, (entranceElapsed - delay) / ENTRANCE_ITEM_DURATION))
    if (progress <= 0) {
      return 0.001
    }
    if (progress >= 1) {
      return 1
    }
    const overshoot = 1.70158
    const offset = progress - 1
    return 1 + (overshoot + 1) * offset ** 3 + overshoot * offset ** 2
  }

  function updateEntrance(deltaSeconds: number) {
    if (isEntranceFinished) {
      return
    }
    entranceElapsed += deltaSeconds
    for (const entranceItem of entranceItemList) {
      const scale = computeEntranceScale(entranceItem.delay)
      entranceItem.node.scaling.set(
        entranceItem.baseScaling.x * scale,
        entranceItem.baseScaling.y * scale,
        entranceItem.baseScaling.z * scale,
      )
    }
    if (entranceElapsed >= entranceTotalSeconds) {
      isEntranceFinished = true
      // 演出結束才建碰撞體：剛體會以「當下的世界矩陣」烘焙形狀，
      // 縮放中建立會得到縮小的碰撞外形
      if (hasPendingPhysicsEnable) {
        hasPendingPhysicsEnable = false
        enablePhysics()
      }
    }
  }

  // --- 落地水滴：小水珠濺出、拋物落下、貼地後縮小消失 ---
  const BURST_PARTICLE_POOL_SIZE = 24
  const BURST_GRAVITY = 8
  /** 水滴縱向拉長比例，微微的淚滴感 */
  const BURST_DROPLET_STRETCH = 1.35

  interface BurstParticle {
    mesh: Mesh;
    velocity: Vector3;
    life: number;
    maxLife: number;
    baseScale: number;
  }

  const burstMaterialList = ['#8fd8e8', '#6ec3da', '#b5e8f2'].map((color, index) => {
    const material = new StandardMaterial(`tankDropletMaterial${index}`, scene)
    material.diffuseColor = Color3.FromHexString(color)
    material.emissiveColor = Color3.FromHexString(color).scale(0.3)
    material.specularColor = Color3.Black()
    return material
  })

  const burstParticleList: BurstParticle[] = []
  for (let index = 0; index < BURST_PARTICLE_POOL_SIZE; index++) {
    const mesh = CreateSphere(`tankDropletParticle${index}`, { diameter: 0.06, segments: 6 }, scene)
    mesh.material = burstMaterialList[index % burstMaterialList.length]!
    mesh.isPickable = false
    mesh.setEnabled(false)
    burstParticleList.push({
      mesh,
      velocity: new Vector3(),
      life: 0,
      maxLife: 1,
      baseScale: 1,
    })
  }

  // 粒子屬短暫演出、不需跨次載入一致，用 Math.random 而非固定種子
  function spawnLandingBurst(x: number, z: number, strength: number) {
    const spawnTarget = Math.round(4 + strength * 4)
    let spawnedCount = 0
    for (const particle of burstParticleList) {
      if (spawnedCount >= spawnTarget) {
        break
      }
      if (particle.life > 0) {
        continue
      }
      spawnedCount += 1
      const angle = Math.random() * Math.PI * 2
      const speed = 0.8 + Math.random() * 1.4
      particle.velocity.set(
        Math.cos(angle) * speed,
        (1.3 + Math.random() * 1.3) * (0.5 + strength * 0.5),
        Math.sin(angle) * speed,
      )
      particle.maxLife = 0.55 + Math.random() * 0.3
      particle.life = particle.maxLife
      particle.baseScale = 0.7 + Math.random() * 0.6
      particle.mesh.position.set(x + Math.cos(angle) * 0.15, 0.08, z + Math.sin(angle) * 0.15)
      particle.mesh.scaling.set(
        particle.baseScale,
        particle.baseScale * BURST_DROPLET_STRETCH,
        particle.baseScale,
      )
      particle.mesh.setEnabled(true)
    }
  }

  function updateBurstParticleList(deltaSeconds: number) {
    for (const particle of burstParticleList) {
      if (particle.life <= 0) {
        continue
      }
      particle.life -= deltaSeconds
      if (particle.life <= 0) {
        particle.mesh.setEnabled(false)
        continue
      }
      particle.velocity.y -= BURST_GRAVITY * deltaSeconds
      particle.mesh.position.x += particle.velocity.x * deltaSeconds
      particle.mesh.position.y += particle.velocity.y * deltaSeconds
      particle.mesh.position.z += particle.velocity.z * deltaSeconds
      if (particle.mesh.position.y < 0.02) {
        // 貼地就停住不再滑動，等生命末段縮小消失
        particle.mesh.position.y = 0.02
        particle.velocity.set(0, 0, 0)
      }
      const lifeRatio = particle.life / particle.maxLife
      const scale = particle.baseScale * Math.min(1, lifeRatio / 0.35)
      particle.mesh.scaling.set(scale, scale * BURST_DROPLET_STRETCH, scale)
    }
  }

  // --- 全解鎖慶典彩帶：小紙片向上噴發、翻轉飄落 ---
  const CONFETTI_POOL_SIZE = 30
  const CONFETTI_GRAVITY = 4.5

  interface ConfettiParticle {
    mesh: Mesh;
    velocity: Vector3;
    spinX: number;
    spinZ: number;
    life: number;
    maxLife: number;
  }

  const confettiMaterialList = ['#f2a3b3', '#ffd166', '#7bd389', '#6ec3da', '#c39bd3'].map((color, index) => {
    const material = new StandardMaterial(`tankConfettiMaterial${index}`, scene)
    material.diffuseColor = Color3.FromHexString(color)
    material.emissiveColor = Color3.FromHexString(color).scale(0.35)
    material.specularColor = Color3.Black()
    material.backFaceCulling = false
    return material
  })

  const confettiParticleList: ConfettiParticle[] = []
  for (let index = 0; index < CONFETTI_POOL_SIZE; index++) {
    const mesh = CreateBox(`tankConfetti${index}`, { width: 0.1, height: 0.014, depth: 0.06 }, scene)
    mesh.material = confettiMaterialList[index % confettiMaterialList.length]!
    mesh.isPickable = false
    mesh.setEnabled(false)
    confettiParticleList.push({
      mesh,
      velocity: new Vector3(),
      spinX: 0,
      spinZ: 0,
      life: 0,
      maxLife: 1,
    })
  }

  function spawnConfettiBurst(x: number, z: number, count = CONFETTI_POOL_SIZE) {
    let spawnedCount = 0
    for (const particle of confettiParticleList) {
      if (spawnedCount >= count) {
        break
      }
      // 跳過還在飄的紙片，連續呼叫不會硬生生重置進行中的彩帶
      if (particle.life > 0) {
        continue
      }
      spawnedCount += 1
      const angle = Math.random() * Math.PI * 2
      const horizontalSpeed = 0.5 + Math.random() * 1.4
      particle.velocity.set(
        Math.cos(angle) * horizontalSpeed,
        2.4 + Math.random() * 1.6,
        Math.sin(angle) * horizontalSpeed,
      )
      particle.spinX = (Math.random() - 0.5) * 14
      particle.spinZ = (Math.random() - 0.5) * 14
      particle.maxLife = 1.5 + Math.random() * 0.8
      particle.life = particle.maxLife
      particle.mesh.position.set(x + Math.cos(angle) * 0.12, 0.35 + Math.random() * 0.4, z + Math.sin(angle) * 0.12)
      particle.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      particle.mesh.scaling.setAll(1)
      particle.mesh.setEnabled(true)
    }
  }

  function updateConfettiList(deltaSeconds: number) {
    for (const particle of confettiParticleList) {
      if (particle.life <= 0) {
        continue
      }
      particle.life -= deltaSeconds
      if (particle.life <= 0) {
        particle.mesh.setEnabled(false)
        continue
      }
      // 空氣阻力：水平速度衰減，紙片飄而不是射
      particle.velocity.y -= CONFETTI_GRAVITY * deltaSeconds
      const drag = Math.max(0, 1 - deltaSeconds * 1.1)
      particle.velocity.x *= drag
      particle.velocity.z *= drag
      particle.mesh.position.x += particle.velocity.x * deltaSeconds
      particle.mesh.position.y += particle.velocity.y * deltaSeconds
      particle.mesh.position.z += particle.velocity.z * deltaSeconds
      particle.mesh.rotation.x += particle.spinX * deltaSeconds
      particle.mesh.rotation.z += particle.spinZ * deltaSeconds
      if (particle.mesh.position.y < 0.02) {
        particle.mesh.position.y = 0.02
        particle.velocity.set(0, 0, 0)
        particle.spinX = 0
        particle.spinZ = 0
      }
      const lifeRatio = particle.life / particle.maxLife
      const scale = Math.min(1, lifeRatio / 0.25)
      particle.mesh.scaling.setAll(scale)
    }
  }

  /** 戳卵石：對剛體施一記向上為主的小衝量，彈起翻滾一下 */
  function pokePebble(mesh: AbstractMesh) {
    const pebbleItem = pebbles.itemList.find((item) => item.mesh === mesh)
    const body = pebbleItem?.body
    if (!body) {
      return
    }
    const impulse = new Vector3(
      (Math.random() - 0.5) * 1.2,
      2.2,
      (Math.random() - 0.5) * 1.2,
    ).scaleInPlace(PEBBLE_MASS)
    body.applyImpulse(impulse, mesh.getAbsolutePosition())
  }

  // 直式（手機）時相機環繞轉 90°，讓有正面的裝飾（相機、蠟筆、打字機）跟著轉向觀眾
  const orientationList = [
    { node: camera.root, baseRotationY: camera.root.rotation.y },
    { node: crayonSet.root, baseRotationY: crayonSet.root.rotation.y },
    { node: typewriter.root, baseRotationY: typewriter.root.rotation.y },
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
  /** Havok 比進場演出先就緒時，延到演出結束再建碰撞體（剛體形狀以當下世界矩陣烘焙） */
  let hasPendingPhysicsEnable = false
  function enablePhysics() {
    if (hasPhysics) {
      return
    }
    if (!isEntranceFinished) {
      hasPendingPhysicsEnable = true
      return
    }
    hasPhysics = true

    // 靜態：石頭凸包，擋住被魚推來的葉片與滾來的卵石
    for (const rock of rocks.meshList) {
      const rockAggregate = new PhysicsAggregate(rock, PhysicsShapeType.CONVEX_HULL, { mass: 0 }, scene)
      rockAggregate.shape.filterMembershipMask = PHYSICS_GROUP_STATIC
      rockAggregate.shape.filterCollideMask = PHYSICS_GROUP_SEAWEED | PHYSICS_GROUP_DEBRIS
    }

    // 靜態：蠟筆、相機、打字機用隱形圓柱涵蓋（外形近似即可）
    const staticSpotList = [crayonSet.obstacle, camera.obstacle, typewriter.obstacle]
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
      staticAggregate.shape.filterCollideMask = PHYSICS_GROUP_SEAWEED | PHYSICS_GROUP_DEBRIS
    })

    /** 錨點剛體：隱形小球，不參與碰撞，純當角度彈簧的約束基座 */
    function createAnchorAggregate(name: string, position: Vector3): PhysicsAggregate {
      const anchorMesh = CreateSphere(`${name}-body`, { diameter: 0.06, segments: 4 }, scene)
      anchorMesh.position.copyFrom(position)
      anchorMesh.isVisible = false
      anchorMesh.isPickable = false
      const anchorAggregate = new PhysicsAggregate(anchorMesh, PhysicsShapeType.SPHERE, { mass: 0 }, scene)
      anchorAggregate.shape.filterMembershipMask = 0
      anchorAggregate.shape.filterCollideMask = 0
      return anchorAggregate
    }

    // 水草：每株兩節葉片轉成動態剛體（葉片 mesh 幾何直接當碰撞體），
    // 錨點→下葉→上葉串起角度彈簧，被魚撞開後拉回原姿態。
    // 彈簧＋接觸的穩定性仰賴物理子步進（見 diorama-scene 的 setSubTimeStep）
    for (const plant of seaweed.plantList) {
      plant.lowerBlade.computeWorldMatrix(true)
      plant.upperBlade.computeWorldMatrix(true)
      const anchorPosition = plant.anchorNode.getAbsolutePosition().clone()
      const jointPosition = plant.jointNode.getAbsolutePosition().clone()

      // 脫離動畫節點（setParent(null) 保留世界姿態），之後由物理接管；
      // 手動搖擺/推草只轉空節點，自動失效
      plant.lowerBlade.setParent(null)
      plant.upperBlade.setParent(null)

      const anchorAggregate = createAnchorAggregate(plant.anchorNode.name, anchorPosition)

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
        // 本體阻尼吸收殘餘擺盪：留一點餘裕讓回正的擺盪看得見，太高會變成瞬間歸位
        bladeAggregate.body.setLinearDamping(1.5)
        bladeAggregate.body.setAngularDamping(0.7)
      }

      connectWithAngularSpring(anchorAggregate, lowerAggregate, anchorPosition, scene)
      connectWithAngularSpring(lowerAggregate, upperAggregate, jointPosition, scene)
    }

    // 卵石／貝殼：自由剛體，會被魚犁開；出界由 update 歸位
    for (const pebbleItem of pebbles.itemList) {
      const pebbleAggregate = new PhysicsAggregate(
        pebbleItem.mesh,
        PhysicsShapeType.CONVEX_HULL,
        { mass: PEBBLE_MASS, friction: 0.8, restitution: 0.25 },
        scene,
      )
      pebbleAggregate.shape.filterMembershipMask = PHYSICS_GROUP_DEBRIS
      pebbleAggregate.shape.filterCollideMask
        = PHYSICS_GROUP_FISH | PHYSICS_GROUP_STATIC | PHYSICS_GROUP_DEBRIS
      pebbleItem.body = pebbleAggregate.body
    }
  }

  function update(timeSeconds: number, deltaSeconds: number, fishX: number, fishZ: number) {
    updateEntrance(deltaSeconds)
    updateSpotEffects(deltaSeconds)
    updateShowcase(deltaSeconds)
    updateBurstParticleList(deltaSeconds)
    updateNightLight(deltaSeconds)
    updateFireflyList(timeSeconds)
    updateConfettiList(deltaSeconds)

    // 統一風場：一道陣風沿 x 掃過全場，所有搖擺項同乘包絡、依位置給相位差，
    // 「一起被風吹到」比各自獨立亂晃更有生命感
    const gustEnvelope = 0.35 + 0.65 * Math.max(0, Math.sin(timeSeconds * 0.26))
    for (const swayItem of swayItemList) {
      const windAngle = Math.sin(timeSeconds * 1.15 - swayItem.rootX * 0.45) * 0.05 * gustEnvelope
      swayItem.node.rotation.z = swayItem.baseLean
        + Math.sin(timeSeconds * swayItem.speed + swayItem.phase) * swayItem.amplitude
        + windAngle
      swayItem.node.rotation.x = Math.cos(timeSeconds * swayItem.speed * 0.8 + swayItem.phase) * swayItem.amplitude * 0.6
    }

    // 魚靠近時把水草往遠離魚的方向推倒，離開後以彈簧挺回（帶過衝回彈，不是瞬間歸位）。
    // 積分步長切上限，分頁切回來的大 delta 不會把彈簧炸開
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
      const springStep = Math.min(deltaSeconds, 1 / 60)
      const accelerationX
        = (targetRotationX - pushItem.node.rotation.x) * SEAWEED_PUSH_SPRING_STIFFNESS
          - pushItem.angularVelocityX * SEAWEED_PUSH_SPRING_DAMPING
      const accelerationZ
        = (targetRotationZ - pushItem.node.rotation.z) * SEAWEED_PUSH_SPRING_STIFFNESS
          - pushItem.angularVelocityZ * SEAWEED_PUSH_SPRING_DAMPING
      pushItem.angularVelocityX += accelerationX * springStep
      pushItem.angularVelocityZ += accelerationZ * springStep
      pushItem.node.rotation.x += pushItem.angularVelocityX * springStep
      pushItem.node.rotation.z += pushItem.angularVelocityZ * springStep
    }

    // 卵石被踢出邊界或掉出地板外就靜靜歸位重生
    if (hasPhysics) {
      for (const pebbleItem of pebbles.itemList) {
        const body = pebbleItem.body
        if (!body) {
          continue
        }
        const position = pebbleItem.mesh.position
        const isOutOfBounds = position.y < GROUND_Y - 2
          || Math.abs(position.x) > MOVE_BOUNDS_RECT.maxX + 0.8
          || Math.abs(position.z) > MOVE_BOUNDS_RECT.maxZ + 0.8
        if (!isOutOfBounds) {
          continue
        }
        // 動態剛體不能直接搬位置：暫時讓物理讀回節點位置，下一步結束後恢復
        body.disablePreStep = false
        body.setLinearVelocity(Vector3.Zero())
        body.setAngularVelocity(Vector3.Zero())
        pebbleItem.mesh.position.copyFrom(pebbleItem.spawnPosition)
        scene.onAfterPhysicsObservable.addOnce(() => {
          body.disablePreStep = true
        })
      }
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
    shadowCasterMeshList: [...rocks.meshList, ...seaweed.meshList, ...pebbles.meshList, ...crayonSet.meshList, ...camera.meshList, ...typewriter.meshList],
    obstacleList,
    interactionSpotList,
    playSpotBounce,
    setSpotHover,
    playSpotShowcase,
    setSpotLocked,
    setNightMode,
    update,
    showClickMarker,
    spawnLandingBurst,
    pokePebble,
    spawnConfettiBurst,
    typewriterPartMap: { root: typewriter.root, keyList: typewriter.keyList, paper: typewriter.paper },
    crayonAnchor: { x: crayonSet.obstacle.x, z: crayonSet.obstacle.z },
    setPortrait,
    enablePhysics,
  }
}
