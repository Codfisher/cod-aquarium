/** 程序化卡通鱈魚模型。
 *
 * 座標慣例：頭朝 +z、背朝 +y，身長約 2.5 單位。
 * 節點結構：rootNode（位置/朝向/擠壓）→ lieNode（側躺翻滾）→ 各部件。
 * 每個鰭與眼睛都掛在自己的 pivot 節點上，方便繞根部做動畫。
 *
 * 卡通化重點：圓胖身形、放大的雙眼（眼白＋瞳孔＋高光）、
 * 少而圓潤的鰭、明亮平塗配色。
 *
 * 動畫（update 每幀驅動）：身體 S 形扭動、胸鰭划水、背鰭搖擺、
 * 尾鰭拍打、偶發眨眼、瞳孔轉動。移動時全部加快加大。
 * 待機時另有呼吸起伏與偶發尾拍，讓靜止的魚保持生命感。
 */
import type { Scene } from '@babylonjs/core/scene'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { applyHeightGradient } from './geometry-utils'

export interface CodModelUpdateParams {
  deltaSeconds: number;
  /** 移動中（跳躍/滑行）時扭動與鰭擺加快加大 */
  isMoving: boolean;
  /** 與跳躍同步的擺動相位（rad）。有給就直接採用（擺尾配合跳躍節奏），沒給則自積分 */
  wavePhase?: number;
  /** 擺動強度（0~1，= 本跳跳高縮放）：短跳擺幅等比縮小，大跳才大甩 */
  waveStrength?: number;
  /** 世界空間注視點（滑鼠游標在沙地的投影）。有值時眼睛看向它，null 則自主張望 */
  gazeTarget?: Vector3 | null;
}

export interface CodModel {
  rootNode: TransformNode;
  /** 側躺姿態節點，rotation.z = 側躺角 + 翻滾擺動 */
  lieNode: TransformNode;
  /** 魚身主網格：物理碰撞體直接用它的凸包（跟著節點姿態自動同步） */
  bodyMesh: Mesh;
  /** 全部網格，供加入陰影投射清單 */
  meshList: Mesh[];
  /** 每幀更新身體與所有部件動畫 */
  update: (params: CodModelUpdateParams) => void;
}

/** 身長（未縮放） */
export const COD_BODY_LENGTH = 2.5
/** 側躺時身體中心離地高度 */
export const COD_LYING_LIFT = 0.34

/** 卡通配色：明亮青藍背、奶油白腹 */
const BACK_COLOR = { red: 0.44, green: 0.71, blue: 0.85 }
const BELLY_COLOR = { red: 0.98, green: 0.96, blue: 0.9 }

// --- 身體擺動參數 ---
/** 擺動樞紐的長軸位置：頭前段固定，後身從這裡開始繞樞紐彎轉 */
const BEND_PIVOT_Z = 0.6
/** 尾端相對前身的相位延遲（rad）：尾巴略晚跟上，掃出鞭甩感 */
const BODY_WHIP_LAG = 1.1
/** 擺動包絡的頭尾錨點：愈靠頭愈穩、愈靠尾擺角愈大 */
const WAVE_HEAD_Z = 1
const WAVE_TAIL_Z = -1.5
/** 尾端最大擺角（rad）。擺動的誇張程度調這裡 */
const WAVE_AMPLITUDE_MOVING = 0.4
const WAVE_AMPLITUDE_IDLE = 0
/** 大開大合的掃動，速度放慢才讀得出來 */
const WAVE_SPEED_MOVING = 15
const WAVE_SPEED_IDLE = 4.5
/** 擺幅趨近目標值的速率（1/s）：移動中快速跟上；
 * 停止後放慢，讓殘餘擺動以漸緩的小幅擺動收斂回自然直身，而非瞬間凍結
 */
const WAVE_LERP_RATE_MOVING = 10
const WAVE_LERP_RATE_IDLE = 2.5

// --- 鰭擺動參數 ---
const PECTORAL_SPEED_MOVING = 15
const PECTORAL_SPEED_IDLE = 3.5
const PECTORAL_SWING_MOVING = 0.7
const PECTORAL_SWING_IDLE = 0.2
/** 尾鰭順著身體波甩動的相位延遲，做出鞭梢感 */
const TAIL_PHASE_LAG = 0.7
const TAIL_SWING_MOVING = 1.15
const TAIL_SWING_IDLE = 0.14

// --- 待機小動作參數 ---
/** 呼吸起伏：速度（rad/s）與幅度。側躺時身體極輕微鼓起收縮，讓靜止的魚仍是活的 */
const BREATH_SPEED = 1.7
const BREATH_SCALE_AMPLITUDE = 0.018
/** 偶發尾拍：靜止一陣子後尾巴快速拍兩下（像側躺魚拍地），時長與擺幅 */
const TAIL_FLICK_DURATION = 0.55
const TAIL_FLICK_SWING = 0.55

// --- 眼睛動畫參數 ---
const BLINK_DURATION = 0.16
/** 瞳孔偏移範圍：垂直比水平大（眼白是直立橢球，上下空間較多），上下看更有戲 */
const PUPIL_SHIFT_RANGE_HORIZONTAL = 0.1
const PUPIL_SHIFT_RANGE_VERTICAL = 0.175
/** 瞳孔中性位置的外偏量（較小 → 左右轉動更對稱、範圍更大） */
const PUPIL_BASE_X = 0.03
/** 眼白橢球半徑（diameter 0.44 × scaling 0.8/1），瞳孔沿此球面滑動，避免偏移大時陷入眼白 */
const EYE_WHITE_RADIUS_H = 0.176
const EYE_WHITE_RADIUS_V = 0.22
/** 注視方向轉成瞳孔偏移的放大倍率 */
const GAZE_GAIN = 3.5

type Point3 = [number, number, number]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 身體扭動包絡：頭與前半身幾乎不動（趨近 0），越往尾放大到 1，
 * 呈現魚類「前段穩、後段與尾巴大擺」的擺動，而非全身均勻起伏的蛇形。
 * 指數 1.6：比平方稍多中段參與，後身整片一起掃、擺感更強
 */
function waveEnvelope(z: number): number {
  const ratio = clamp((WAVE_HEAD_Z - z) / (WAVE_HEAD_Z - WAVE_TAIL_Z), 0, 1)
  return ratio ** 1.6
}

/** 某長軸位置 z 的彎轉角（rad）。
 * 擺動的本質是「後身繞樞紐旋轉」（等同脊椎骨鏈），而非頂點側向平移：
 * 平移振幅一大就變成剪切變形（像被橫向抹開），旋轉則保持體長、
 * 截面沿弧線掃過去，才是真的擺動。
 *
 * 波形用 cos 配合跳躍相位（每跳一整圈）：相位 0（起跳）= 上彎蓄力、
 * π（半空）= 下擺到底——上升段全程往下甩尾，做出拍地把自己彈起來的感覺。
 * 魚側躺，此彎轉在世界空間正是垂直方向的上下擺。
 *
 * 開頭的負號決定「下」的方向（實測校正）。注意不可改負 WAVE_AMPLITUDE_MOVING 來翻方向：
 * applyBodyWave 以「振幅趨近 0」當作免變形的早退條件，負振幅會被當成 0 而完全不擺。
 */
function getBendAngle(z: number, phase: number, amplitude: number): number {
  const lagRatio = clamp((WAVE_HEAD_Z - z) / (WAVE_HEAD_Z - WAVE_TAIL_Z), 0, 1)
  return -amplitude * waveEnvelope(z) * Math.cos(phase - BODY_WHIP_LAG * lagRatio)
}

/** 以邊界頂點（繞一圈）扇形三角化建立圓潤鰭片（雙面、flat shading） */
function createFinMesh(
  name: string,
  scene: Scene,
  boundaryPointList: Point3[],
  material: StandardMaterial,
): Mesh {
  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()

  const positionList = boundaryPointList.flat()
  const indexList: number[] = []
  // triangle fan：以第 0 點為軸心接出所有三角形
  for (let index = 1; index < boundaryPointList.length - 1; index++) {
    indexList.push(0, index, index + 1)
  }

  const normalList: number[] = []
  VertexData.ComputeNormals(positionList, indexList, normalList)

  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.normals = normalList
  vertexData.applyToMesh(mesh)
  // 沿高度加漸層頂點色，讓鰭與尾巴也有層次而非死板純色
  applyHeightGradient(mesh, 0.3)

  mesh.material = material
  mesh.isPickable = false
  return mesh
}

interface BodyMeshResult {
  mesh: Mesh;
  /** 未扭動的基準頂點座標，每幀據此重算 S 波 */
  basePositions: Float32Array;
}

/** 變形低段數球體成圓胖卡通魚身：頭大尾收、略側扁 */
function buildBodyMesh(scene: Scene, material: StandardMaterial): BodyMeshResult {
  // 用 icosphere（均勻三角、無極點）而非 UV 球，避免背腹極點在變形擾動後雜亂。
  // flat: false 用共享頂點，擾動時相鄰面才不會裂開露縫，之後再 convertToFlatShadedMesh
  const body = CreateIcoSphere('codBodyMesh', { radius: 0.5, subdivisions: 2, flat: false }, scene)

  const positionList = body.getVerticesData(VertexBuffer.PositionKind)
  if (positionList) {
    for (let index = 0; index < positionList.length; index += 3) {
      const x = positionList[index] ?? 0
      const y = positionList[index + 1] ?? 0
      const z = positionList[index + 2] ?? 0

      /** 球半徑 0.5，轉為 [-1, 1]，頭在 +1 */
      const normalizedZ = z * 2
      const headToTail = clamp((normalizedZ + 1) / 2, 0, 1)
      /** 頭端圓胖、往尾柄收細，pow < 1 讓中前段保持飽滿 */
      const taper = 0.26 + 0.74 * headToTail ** 0.6

      // 側扁保留一點（0.72），但比寫實版胖，讓身體圓滾；加小幅頂點擾動讓塊面不規則。
      // 用基於原始位置的確定性 noise（而非 per-vertex random），
      // 讓 UV 接縫上重複的頂點得到一致位移，面才不會裂開露縫
      const jitter = 0.04
      const noiseX = Math.sin(x * 13.1 + y * 7.7 + z * 4.3)
      const noiseY = Math.sin(x * 5.3 + y * 11.9 + z * 8.1)
      const noiseZ = Math.sin(x * 9.7 + y * 3.1 + z * 14.3)
      positionList[index] = x * taper * 0.72 + noiseX * jitter
      positionList[index + 1] = y * taper + noiseY * jitter
      positionList[index + 2] = z * COD_BODY_LENGTH + noiseZ * jitter
    }
    body.updateVerticesData(VertexBuffer.PositionKind, positionList)
  }

  body.convertToFlatShadedMesh()

  // 頂點色：背青藍、腹奶油白，分界沿身體中線水平帶輕微起伏
  const flatPositionList = body.getVerticesData(VertexBuffer.PositionKind)
  if (flatPositionList) {
    const vertexCount = flatPositionList.length / 3
    const colorList: number[] = Array.from({ length: vertexCount * 4 })

    for (let index = 0; index < vertexCount; index++) {
      const y = flatPositionList[index * 3 + 1] ?? 0
      const z = flatPositionList[index * 3 + 2] ?? 0

      const boundary = -0.02 + 0.04 * Math.sin(z * 3.2 + 0.6)
      const color = y > boundary ? BACK_COLOR : BELLY_COLOR

      colorList[index * 4] = color.red
      colorList[index * 4 + 1] = color.green
      colorList[index * 4 + 2] = color.blue
      colorList[index * 4 + 3] = 1
    }
    body.setVerticesData(VertexBuffer.ColorKind, colorList)
  }

  const finalPositionList = body.getVerticesData(VertexBuffer.PositionKind)
  const basePositions = finalPositionList
    ? Float32Array.from(finalPositionList)
    : new Float32Array()
  // 標記為可更新，之後每幀重寫頂點做身體扭動
  body.markVerticesDataAsUpdatable(VertexBuffer.PositionKind, true)

  body.material = material
  body.isPickable = false
  return { mesh: body, basePositions }
}

interface EyeParts {
  pivot: TransformNode;
  /** 瞳孔（含高光子節點），供轉動 */
  pupil: TransformNode;
  meshList: Mesh[];
}

/** 建立一顆卡通大眼（眼白＋瞳孔＋高光），掛在可眨眼、可轉瞳的 pivot 上 */
function buildEye(
  scene: Scene,
  side: 'left' | 'right',
  materials: {
    white: StandardMaterial;
    pupil: StandardMaterial;
    highlight: StandardMaterial;
  },
): EyeParts {
  const sign = side === 'right' ? 1 : -1

  const pivot = new TransformNode(`codEyePivot-${side}`, scene)
  pivot.position.set(0.28 * sign, 0.16, 0.82)

  const white = CreateSphere(`codEyeWhite-${side}`, { diameter: 0.44, segments: 6 }, scene)
  white.scaling.set(0.8, 1, 0.8)
  white.material = materials.white
  white.isPickable = false
  white.parent = pivot

  // 瞳孔壓扁貼合眼白前表面，做成黑點而非凸出的黑珠
  const pupil = CreateSphere(`codEyePupil-${side}`, { diameter: 0.15, segments: 5 }, scene)
  pupil.position.set(PUPIL_BASE_X * sign, -0.01, 0.12)
  pupil.scaling.z = 0.55
  pupil.material = materials.pupil
  pupil.isPickable = false
  pupil.parent = pivot

  const highlight = CreateSphere(`codEyeHighlight-${side}`, { diameter: 0.05, segments: 5 }, scene)
  highlight.position.set(0.03 * sign, 0.035, 0.05)
  highlight.material = materials.highlight
  highlight.isPickable = false
  // 高光掛瞳孔下，瞳孔轉動時一起走
  highlight.parent = pupil

  return { pivot, pupil, meshList: [white, pupil, highlight] }
}

interface WavePart {
  node: TransformNode;
  baseX: number;
  baseZ: number;
}

interface EyeRuntime {
  parts: EyeParts;
  /** 右眼 1、左眼 -1 */
  sign: number;
  /** 瞳孔當前偏移（lerp 狀態），x 左右、y 上下 */
  shiftX: number;
  shiftY: number;
}

export function createCodModel(scene: Scene): CodModel {
  const rootNode = new TransformNode('codRoot', scene)
  const lieNode = new TransformNode('codLie', scene)
  lieNode.parent = rootNode

  const bodyMaterial = new StandardMaterial('codBodyMaterial', scene)
  // 純白在多光源下會過曝死白，壓成帶點冷灰的淺色
  bodyMaterial.diffuseColor = Color3.FromHexString('#e3e9ec')
  // 給一點窄高光，讓魚身有濕潤光澤層次而非死平
  bodyMaterial.specularColor = new Color3(0.14, 0.16, 0.18)
  bodyMaterial.specularPower = 48

  const finMaterial = new StandardMaterial('codFinMaterial', scene)
  finMaterial.diffuseColor = Color3.FromHexString('#4f9ac2')
  finMaterial.specularColor = new Color3(0.1, 0.12, 0.14)
  finMaterial.specularPower = 48
  finMaterial.backFaceCulling = false

  const eyeWhiteMaterial = new StandardMaterial('codEyeWhiteMaterial', scene)
  eyeWhiteMaterial.diffuseColor = Color3.White()
  eyeWhiteMaterial.specularColor = Color3.Black()

  const pupilMaterial = new StandardMaterial('codPupilMaterial', scene)
  pupilMaterial.diffuseColor = Color3.FromHexString('#1b2a33')
  pupilMaterial.specularColor = Color3.Black()

  const highlightMaterial = new StandardMaterial('codHighlightMaterial', scene)
  highlightMaterial.diffuseColor = Color3.White()
  highlightMaterial.emissiveColor = Color3.White()
  highlightMaterial.disableLighting = true

  const meshList: Mesh[] = []
  const wavePartList: WavePart[] = []

  const { mesh: bodyMesh, basePositions } = buildBodyMesh(scene, bodyMaterial)
  bodyMesh.parent = lieNode
  meshList.push(bodyMesh)

  // 單片圓潤背鰭（相對 pivot 定義，可隨身體搖擺）
  const dorsalPivot = new TransformNode('codDorsalPivot', scene)
  dorsalPivot.position.set(0, 0.24, 0.03)
  dorsalPivot.parent = lieNode
  const dorsalFin = createFinMesh(
    'codDorsalFin',
    scene,
    [
      [0, 0, 0.47],
      [0, 0.42, 0.13],
      [0, 0.42, -0.15],
      [0, 0, -0.47],
    ],
    finMaterial,
  )
  dorsalFin.parent = dorsalPivot
  meshList.push(dorsalFin)
  wavePartList.push({ node: dorsalPivot, baseX: 0, baseZ: 0.03 })

  // 胸鰭（左右各一小圓鰭，繞肩部 pivot 划水）
  const rightPectoralPointList: Point3[] = [
    [0, 0, 0],
    [0.34, 0.12, -0.12],
    [0.32, -0.02, -0.28],
    [0.14, -0.14, -0.18],
  ]
  const pectoralPivotRight = new TransformNode('codPectoralPivotRight', scene)
  pectoralPivotRight.position.set(0.3, -0.05, 0.42)
  pectoralPivotRight.parent = lieNode
  const rightPectoralFin = createFinMesh('codPectoralFinRight', scene, rightPectoralPointList, finMaterial)
  rightPectoralFin.parent = pectoralPivotRight

  const leftPectoralPointList = rightPectoralPointList.map(
    ([x, y, z]): Point3 => [-x, y, z],
  )
  const pectoralPivotLeft = new TransformNode('codPectoralPivotLeft', scene)
  pectoralPivotLeft.position.set(-0.3, -0.05, 0.42)
  pectoralPivotLeft.parent = lieNode
  const leftPectoralFin = createFinMesh('codPectoralFinLeft', scene, leftPectoralPointList, finMaterial)
  leftPectoralFin.parent = pectoralPivotLeft

  meshList.push(rightPectoralFin, leftPectoralFin)
  wavePartList.push(
    { node: pectoralPivotRight, baseX: 0.3, baseZ: 0.42 },
    { node: pectoralPivotLeft, baseX: -0.3, baseZ: 0.42 },
  )

  // 尾鰭：掛在尾關節上，圓潤大扇形，繞 y 拍打
  const tailPivot = new TransformNode('codTailPivot', scene)
  tailPivot.position.set(0, 0, -1.12)
  tailPivot.parent = lieNode
  const tailFin = createFinMesh(
    'codTailFin',
    scene,
    [
      [0, 0, 0.08],
      [0, 0.42, -0.5],
      [0, 0.28, -0.64],
      [0, 0, -0.7],
      [0, -0.28, -0.64],
      [0, -0.42, -0.5],
    ],
    finMaterial,
  )
  tailFin.parent = tailPivot
  meshList.push(tailFin)
  wavePartList.push({ node: tailPivot, baseX: 0, baseZ: -1.12 })

  // 放大的卡通雙眼
  const eyeMaterials = {
    white: eyeWhiteMaterial,
    pupil: pupilMaterial,
    highlight: highlightMaterial,
  }
  const eyeRuntimeList: EyeRuntime[] = []
  for (const side of ['right', 'left'] as const) {
    const eyeParts = buildEye(scene, side, eyeMaterials)
    eyeParts.pivot.parent = lieNode
    for (const eyeMesh of eyeParts.meshList) {
      meshList.push(eyeMesh)
    }
    eyeRuntimeList.push({
      parts: eyeParts,
      sign: side === 'right' ? 1 : -1,
      shiftX: 0,
      shiftY: 0,
    })
    wavePartList.push({
      node: eyeParts.pivot,
      baseX: eyeParts.pivot.position.x,
      baseZ: eyeParts.pivot.position.z,
    })
  }

  // --- 動畫狀態（閉包內累積） ---
  const bodyWaveBuffer = new Float32Array(basePositions.length)
  let bodyIsBent = false
  let bodyWaveAmplitude = 0
  let bodyWavePhase = 0
  let pectoralPhase = 0
  let tailSwing = TAIL_SWING_IDLE
  let blinkTimer = 2 + Math.random() * 3
  let blinkElapsed = BLINK_DURATION
  // 待機小動作：呼吸相位隨機起點避免多實例同步；強度移動時淡出
  let breathPhase = Math.random() * Math.PI * 2
  let breathStrength = 0
  let tailFlickTimer = 4 + Math.random() * 6
  let tailFlickElapsed = TAIL_FLICK_DURATION
  // 自主張望時兩眼共用的隨機瞳孔偏移目標
  let autoTargetX = 0
  let autoTargetY = 0
  let pupilTimer = 1 + Math.random() * 2
  const inverseEyeMatrix = new Matrix()
  const gazeDirection = new Vector3()

  /** 依當前相位與擺角重寫身體頂點與各部件位置：
   * 每個頂點繞樞紐（BEND_PIVOT_Z）在 x-z 平面旋轉、角度往尾端放大，
   * 等同一條連續脊椎骨鏈的彎曲，體長不變、尾巴沿弧線掃
   */
  function applyBodyWave() {
    if (bodyWaveAmplitude <= 1e-4) {
      if (bodyIsBent) {
        bodyMesh.updateVerticesData(VertexBuffer.PositionKind, basePositions)
        for (const part of wavePartList) {
          part.node.position.x = part.baseX
          part.node.position.z = part.baseZ
        }
        bodyIsBent = false
      }
      return
    }

    for (let index = 0; index < basePositions.length; index += 3) {
      const baseX = basePositions[index] ?? 0
      const baseZ = basePositions[index + 2] ?? 0
      const bendAngle = getBendAngle(baseZ, bodyWavePhase, bodyWaveAmplitude)
      const sinValue = Math.sin(bendAngle)
      const cosValue = Math.cos(bendAngle)
      const deltaZ = baseZ - BEND_PIVOT_Z
      bodyWaveBuffer[index] = baseX * cosValue + deltaZ * sinValue
      bodyWaveBuffer[index + 1] = basePositions[index + 1] ?? 0
      bodyWaveBuffer[index + 2] = BEND_PIVOT_Z + deltaZ * cosValue - baseX * sinValue
    }
    bodyMesh.updateVerticesData(VertexBuffer.PositionKind, bodyWaveBuffer)

    for (const part of wavePartList) {
      const bendAngle = getBendAngle(part.baseZ, bodyWavePhase, bodyWaveAmplitude)
      const sinValue = Math.sin(bendAngle)
      const cosValue = Math.cos(bendAngle)
      const deltaZ = part.baseZ - BEND_PIVOT_Z
      part.node.position.x = part.baseX * cosValue + deltaZ * sinValue
      part.node.position.z = BEND_PIVOT_Z + deltaZ * cosValue - part.baseX * sinValue
    }
    bodyIsBent = true
  }

  function update({ deltaSeconds, isMoving, wavePhase, waveStrength, gazeTarget }: CodModelUpdateParams) {
    // 身體擺動：外部（跳躍）相位優先，擺尾與跳躍節奏同步；沒有就自積分。
    // 擺幅乘上跳躍強度：跳得低擺得小、跳得高才大甩
    const targetAmplitude = isMoving
      ? WAVE_AMPLITUDE_MOVING * (waveStrength ?? 1)
      : WAVE_AMPLITUDE_IDLE
    const amplitudeLerpRate = isMoving ? WAVE_LERP_RATE_MOVING : WAVE_LERP_RATE_IDLE
    bodyWaveAmplitude += (targetAmplitude - bodyWaveAmplitude) * Math.min(1, deltaSeconds * amplitudeLerpRate)
    if (isMoving && wavePhase !== undefined) {
      bodyWavePhase = wavePhase
    }
    else {
      // 停止後不採用外部凍結的相位，改用慢速自積分：
      // 殘餘擺動從落地當下的姿態接續、漸緩收斂回自然直身，而非瞬間凍結
      bodyWavePhase += deltaSeconds * (isMoving ? WAVE_SPEED_MOVING : WAVE_SPEED_IDLE)
    }
    applyBodyWave()

    // 胸鰭划水（左右反向繞 z，視覺上同步上下撥）
    pectoralPhase += deltaSeconds * (isMoving ? PECTORAL_SPEED_MOVING : PECTORAL_SPEED_IDLE)
    const pectoralSwing = isMoving ? PECTORAL_SWING_MOVING : PECTORAL_SWING_IDLE
    const pectoralWave = Math.sin(pectoralPhase) * pectoralSwing
    pectoralPivotRight.rotation.z = -0.15 - pectoralWave
    pectoralPivotLeft.rotation.z = 0.15 + pectoralWave

    // 背鰭搖擺強度跟著身體扭動幅度，靜止時不搖
    const bodyMotionRatio = bodyWaveAmplitude / WAVE_AMPLITUDE_MOVING
    dorsalPivot.rotation.z = Math.sin(bodyWavePhase * 0.6) * 0.14 * bodyMotionRatio

    // 尾鰭先跟上身體在尾柄處的彎轉角，再疊上「身體波形再延遲」的鞭甩（同方向、只是更晚），
    // 擺幅在移動/靜止間平滑過渡
    const tailSwingTarget = isMoving ? TAIL_SWING_MOVING : TAIL_SWING_IDLE
    tailSwing += (tailSwingTarget - tailSwing) * Math.min(1, deltaSeconds * 8)
    const tailBendAngle = getBendAngle(-1.12, bodyWavePhase, bodyWaveAmplitude)
    tailPivot.rotation.y = tailBendAngle
      - Math.cos(bodyWavePhase - BODY_WHIP_LAG - TAIL_PHASE_LAG) * tailSwing * (bodyWaveAmplitude / WAVE_AMPLITUDE_MOVING)

    // 呼吸起伏：待機時腹背向極輕微鼓起收縮，移動時淡出（避免與跳躍擠壓疊加）
    const breathTarget = isMoving ? 0 : 1
    breathStrength += (breathTarget - breathStrength) * Math.min(1, deltaSeconds * 4)
    breathPhase += deltaSeconds * BREATH_SPEED
    const breathWave = Math.sin(breathPhase) * BREATH_SCALE_AMPLITUDE * breathStrength
    lieNode.scaling.set(1 + breathWave * 0.5, 1 + breathWave, 1)

    // 偶發尾拍：靜止倒數到 0 觸發一次，尾巴快拍兩下、包絡漸弱
    if (!isMoving && tailFlickElapsed >= TAIL_FLICK_DURATION) {
      tailFlickTimer -= deltaSeconds
      if (tailFlickTimer <= 0) {
        tailFlickElapsed = 0
        tailFlickTimer = 5 + Math.random() * 7
      }
    }
    if (tailFlickElapsed < TAIL_FLICK_DURATION) {
      tailFlickElapsed += deltaSeconds
      const flickProgress = Math.min(tailFlickElapsed / TAIL_FLICK_DURATION, 1)
      tailPivot.rotation.y += Math.sin(flickProgress * Math.PI * 4) * TAIL_FLICK_SWING * (1 - flickProgress)
    }

    // 眨眼：倒數到 0 觸發一次，短暫壓扁眼睛
    if (blinkElapsed >= BLINK_DURATION) {
      blinkTimer -= deltaSeconds
      if (blinkTimer <= 0) {
        blinkElapsed = 0
        blinkTimer = 2.5 + Math.random() * 3.5
      }
    }
    let eyeOpenness = 1
    if (blinkElapsed < BLINK_DURATION) {
      blinkElapsed += deltaSeconds
      const progress = Math.min(blinkElapsed / BLINK_DURATION, 1)
      eyeOpenness = 1 - Math.sin(progress * Math.PI) * 0.9
    }

    // 自主張望：無注視點且靜止時，定時抽換共用的瞳孔目標
    if (!gazeTarget && !isMoving) {
      pupilTimer -= deltaSeconds
      if (pupilTimer <= 0) {
        autoTargetX = (Math.random() - 0.5) * 2 * PUPIL_SHIFT_RANGE_HORIZONTAL
        autoTargetY = (Math.random() - 0.5) * 2 * PUPIL_SHIFT_RANGE_VERTICAL
        pupilTimer = 1.2 + Math.random() * 2.5
      }
    }

    const pupilLerp = Math.min(1, deltaSeconds * 8)
    for (const eye of eyeRuntimeList) {
      eye.parts.pivot.scaling.y = eyeOpenness

      let targetX: number
      let targetY: number
      if (gazeTarget) {
        // 強制重算世界矩陣，確保納入本幀魚的位置、朝向與側躺旋轉。
        // 世界矩陣預設延遲到 render 階段才更新，這裡在動畫階段就要用，
        // 不強制重算會拿到上一幀的姿態，導致 gaze 方向沒跟上魚的轉向
        const eyeWorldMatrix = eye.parts.pivot.computeWorldMatrix(true)
        gazeTarget.subtractToRef(eye.parts.pivot.getAbsolutePosition(), gazeDirection)
        eyeWorldMatrix.invertToRef(inverseEyeMatrix)
        const localDirection = Vector3.TransformNormal(gazeDirection, inverseEyeMatrix)
        const length = localDirection.length()
        if (length > 1e-4) {
          localDirection.scaleInPlace(1 / length)
        }
        // 魚側躺，眼睛朝魚頭前方；游標的水平方向落在魚自身的 y(左右) 與 z(前後) 兩軸，
        // 對應瞳孔的左右與上下。魚自身 x 軸對應世界垂直，游標在沙地上幾乎不變，故不採用
        targetX = clamp(localDirection.z * GAZE_GAIN, -1, 1) * PUPIL_SHIFT_RANGE_HORIZONTAL
        targetY = clamp(localDirection.y * GAZE_GAIN, -1, 1) * PUPIL_SHIFT_RANGE_VERTICAL
      }
      else if (isMoving) {
        // 移動時盯著前方
        targetX = 0
        targetY = 0
      }
      else {
        targetX = autoTargetX
        targetY = autoTargetY
      }

      eye.shiftX += (targetX - eye.shiftX) * pupilLerp
      eye.shiftY += (targetY - eye.shiftY) * pupilLerp
      // 讓瞳孔沿眼白球面滑動（而非固定 z 平面），偏移大時才不會陷進眼白裡看不到
      const pupilX = PUPIL_BASE_X * eye.sign + eye.shiftX
      const pupilY = -0.01 + eye.shiftY
      const normalizedX = pupilX / EYE_WHITE_RADIUS_H
      const normalizedY = pupilY / EYE_WHITE_RADIUS_V
      const surface = Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX - normalizedY * normalizedY))
      eye.parts.pupil.position.set(pupilX, pupilY, EYE_WHITE_RADIUS_H * surface - 0.02)
    }
  }

  return { rootNode, lieNode, bodyMesh, meshList, update }
}
