/** 蠟筆滑道：側視 2.5D 垂直下潛。
 *
 * 鱈魚受重力在紙峽谷中一路往 -Y 下潛，途中有紙摺海膽與牆刺擋路。
 * 玩家拖曳畫出的蠟筆線會立刻變成真的靜態碰撞體，
 * 當作斜坡把魚導向安全的路線、繞開障礙，碰到障礙就結束。
 *
 * 世界座標慣例：遊玩平面固定在 z = 0，x 往右、y 往上，相機自 -Z 側視。
 * 峽谷中線在 x = 0，牆的內側表面落在 x = ±CANYON_HALF_WIDTH。
 * 牆、層架、蠟筆線與魚全部化約成「有厚度的線段 vs 圓」，
 * 障礙另外化約成致命圓，有無 Havok 兩條路徑才共用同一組判定資料。
 */
import type { Scene } from '@babylonjs/core/scene'
import type { GamePointerEvent, MiniGameFactory } from '../game-contract'
import type {
  CanyonHazardSpec,
  CanyonShelfSpec,
  ChainedCanyonSegment,
  SegmentCollider,
} from './crayon-slide-logic'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PhysicsMotionType, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin'
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate'
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody'
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape'
import { createCodModel } from '../../cod-model'
import { applyHeightGradient, createBeveledBox } from '../../geometry-utils'
import { setPaperGrainProfile } from '../../paper-grain-plugin'
import { sampleOrganicSway } from '../../shared/easing'
import {
  applyVertexJitter,
  createClusteredAngleList,
  createSeedFrom,
  createSideVariation,
  hashPosition,
  sampleCellNoise,
  sampleValueNoise,
  sampleValueNoise2d,
} from '../../shared/mesh-detail'
import { clamp, createRandomGenerator, damp, randomBetween } from '../../shared/random-generator'
import {
  CANYON_HALF_WIDTH,
  chainCanyonSegment,
  createCrayonInk,
  createDepthTracker,
  createNearMissWatcher,
  findCrossedMilestone,
  findHazardContact,
  FISH_GRAVITY_Y,
  FISH_HORIZONTAL_DAMPING,
  FISH_MAX_SPEED,
  FISH_RADIUS,
  FISH_RESTITUTION,
  FISH_TANGENT_RETENTION,
  getClosestPointOnSegment,
  getFallSpeedLimit,
  getSegmentProjection,
  stepFallbackFish,
} from './crayon-slide-logic'

// --- low poly 箱庭配色 ---
const PAPER_WHITE_HEX = '#f5efe2'
const SAND_HEX = '#e2c49a'
const MOSS_HEX = '#7d9b76'
const WATER_BLUE_HEX = '#8fb8c9'
const INK_BLUE_HEX = '#3d4f66'
const CRAYON_YELLOW_HEX = '#e8b54a'
/** 海膽與牆刺的警戒色：整個場景唯一的暖紅，一眼就知道碰不得 */
const HAZARD_HEX = '#b0563d'
/** 蠟筆線的候選色，飽和度比地形高，畫出來一眼就分得出是玩家畫的 */
const CRAYON_COLOR_HEX_LIST = ['#e8b54a', '#c96f5a', '#7d9b76', '#5b9fbf', '#c77fb4', '#7f6fc0']
/** 層架輪替的三種色，相鄰段落不會一片死板 */
const PAPER_ACCENT_HEX_LIST = [MOSS_HEX, SAND_HEX, WATER_BLUE_HEX]

// --- 世界深度：牆、層架、障礙共用的 z 向厚度 ---
const PAPER_DEPTH = 2.4

// --- 層架視覺尺寸 ---
const SHELF_THICKNESS = 1
const SHELF_HALF_THICKNESS = SHELF_THICKNESS / 2
const SHELF_POOL_SIZE = 8
/** 層架根部往牆裡多埋的長度（純視覺，碰撞線不動）。
 * 牆的內緣是刻出來的起伏，根部若切齊名義牆面，遇到往外退的地方就會看到一截浮空
 */
const SHELF_WALL_EMBED = 0.7

// --- 峽谷牆 ---
/** 牆的厚度。內側表面固定在 ±CANYON_HALF_WIDTH，加厚只往外長，
 * 通道寬度與判定都不受影響——牆薄的時候讀起來像兩條紙片而不是岩壁
 */
const WALL_WIDTH = 5.2
const WALL_HALF_WIDTH = WALL_WIDTH / 2
const WALL_POOL_SIZE = 16
/** 牆面格網的細分數。石頭要的是「一堆小面各自吃到不同角度的光」，
 * 面太少就只能是幾片大平板。兩軸的格子刻意抓成接近正方（約 0.26×0.27 世界單位）：
 * 細長的格子一旦讓格點挪位，很容易被擠成沒有面積的細針，
 * 法線算出來是零向量，畫面上就是一顆黑點。
 * 整面牆是靜態網格、一段只雕一次，一片兩千五百面、場上同時十片，換質感很划算。
 *
 * 加密的前提是**細節尺度必須由世界座標決定**（見 WALL_DETAIL_*_CELL、WALL_PLATE_CELL）：
 * 若照舊「每個格點抽一個亂數」，格網一密，起伏就退化成砂紙般的高頻雜訊，
 * 面數加了反而更不像石頭
 */
const WALL_HEIGHT_SUBDIVISION_COUNT = 64
const WALL_THICKNESS_SUBDIVISION_COUNT = 20
/** 朝通道那道厚度面的細分數。它只有 PAPER_DEPTH 深，幾欄就夠交代轉折 */
const WALL_RIM_SUBDIVISION_COUNT = 3
/** 厚度面往深處的壓暗量。愈往裡愈背光，這道漸層讓厚度真的讀成厚度 */
const WALL_RIM_SHADE = 0.4
/** 內側輪廓最多往外退多少（世界單位）。碰撞面固定在 ±CANYON_HALF_WIDTH，
 * 退太深會看到魚停在離牆一段的空水裡
 */
const WALL_INNER_RECESS = 0.3
/** 內側輪廓最多往通道凸多少。魚半徑 0.55，這點重疊只讀成擦過岩壁 */
const WALL_INNER_BULGE = 0.15
/** 內緣的逐點碎屑，只往外缺不往內長。
 * 光有平滑起伏的內緣像塑膠圓角，缺幾口才讀得出是刻出來的岩
 */
const WALL_INNER_CHIP = 0.15
/** 外緣起伏。外緣不參與任何判定，放手抖大一點，
 * 牆才是一條會胖瘦的岩帶而不是等寬的直帶
 */
const WALL_OUTER_RELIEF = 1.5
/** 朝鏡頭的表面起伏。面的朝向差得夠開，潛水燈掃過才有明暗 */
const WALL_SURFACE_RELIEF = 0.52
/** 凹處的壓暗量（頂點色）。側視的牆整片正對鏡頭，光影本身分不出深淺，
 * 靠這層跟著起伏走的假 AO 才讀得出凹凸
 */
const WALL_CREVICE_SHADE = 0.3
/** 格點在平面內的挪移量，單位是「一格的幾成」。
 * 大小一致的三角形排成整齊格網，加再多面也只是更細的格網而已；
 * 岩石的碎面本來就有大有小、有胖有瘦，格點先挪開，三角形才不會一個樣。
 * 上限 0.5：超過就會跟隔壁格點對調，三角形直接翻面
 */
const WALL_GRID_SHIFT = 0.36
/** 岩面細節的取樣格距（世界單位）。粗的一層切出岩塊、細的一層是表面顆粒 */
const WALL_DETAIL_COARSE_CELL = 2.4
const WALL_DETAIL_FINE_CELL = 0.8
/** 岩板尺度（世界單位）：一塊碎裂平面大概多大。
 * 這層用細胞雜訊，同一塊碎片內共平面、邊界是硬稜——低多邊形的岩石感來自這裡，
 * 平滑雜訊只會做出皺紙
 */
const WALL_PLATE_CELL = 2.2
/** 三個尺度的起伏波長（世界單位）：整面岩壁的大彎、岩階、階上的皺褶 */
const WALL_PROFILE_MAJOR_LENGTH = 24
const WALL_PROFILE_MIDDLE_LENGTH = 9.5
const WALL_PROFILE_DETAIL_LENGTH = 3.4

// --- 障礙 ---
const HAZARD_POOL_SIZE = 30
/** 海膽的致命半徑，與 crayon-slide-logic 的 URCHIN_RADIUS 同值。
 * 建模時刺尖的下限鎖在這之外（扣掉頂點抖動仍在外），判定永遠比看到的寬鬆
 */
const URCHIN_LETHAL_RADIUS = 0.75
/** 牆刺網格的基準凸出長度，實際凸出量靠 x 縮放去貼合 */
const WALL_SPIKE_CANONICAL_PROTRUSION = 1.4

// --- 地形生成範圍 ---
/** 生成到魚下方多遠 */
const TERRAIN_BUILD_BELOW = 55
/** 落在魚上方多遠就回收重用 */
const TERRAIN_RECYCLE_ABOVE = 30
/** 第一段峽谷的頂端，略高於魚的出生點 */
const FIRST_SEGMENT_TOP_Y = 2

// --- 蠟筆線 ---
const CRAYON_HALF_THICKNESS = 0.13
const CRAYON_DEPTH = 0.5
const CRAYON_POOL_SIZE = 110
/** 蠟筆總長上限（世界單位） */
const CRAYON_CAPACITY = 18
/** 每秒回充長度 */
const CRAYON_REFILL_PER_SECOND = 3.2
/** 低於此存量就畫不動，避免滿地碎屑 */
const CRAYON_MINIMUM_DRAW_LENGTH = 0.32
/** 取樣間距：太密會浪費碰撞體，太疏轉折會變成折線 */
const CRAYON_SAMPLE_MIN_DISTANCE = 0.34
/** 單段最長長度，拖曳跨很遠時切成多段才畫得出曲線 */
const CRAYON_SEGMENT_MAX_LENGTH = 1.4
/** 不准在魚身上畫線：新生的碰撞體長在魚體內會把魚彈飛 */
const CRAYON_FISH_CLEARANCE = 0.35
/** 點一下（未拖曳）就擦線：點擊點離線段這麼近才算點到 */
const CRAYON_ERASE_RADIUS = 1.3
/** 按下到放開的位移小於此畫面比例才算「點一下」而非拖曳 */
const ERASE_TAP_MOVE_TOLERANCE = 0.02
/** 按住超過這麼久就不算點擊 */
const ERASE_TAP_MAX_SECONDS = 0.35
/** 擦線退還的蠟筆比例：全額退會鼓勵無腦亂畫，打點折才會先想再畫 */
const CRAYON_ERASE_REFUND_RATIO = 0.6

// --- 潛水燈 ---
/** 燈擺在幾何與鏡頭之間（鏡頭在 -z 側），正面才吃得到光而不是逆光剪影 */
const DIVE_LIGHT_Z = -3.6
/** 光圈中心抬高一點，讓亮邊落在往下潛的路上 */
const DIVE_LIGHT_LIFT = 1.4
const DIVE_LIGHT_INTENSITY = 1.45
/** 照射半徑（線性衰減到 0）。比垂直可見範圍略大：前方的路看得到但明顯轉暗 */
const DIVE_LIGHT_RANGE = 25

// --- 頭燈 ---
/** 頭燈道具，掛在魚頭頂：原本只有光沒有燈具，玩家會納悶光是哪來的。
 * 位置估在雙眼上方略後（眼睛座標約 (±0.28, 0.16, 0.82)，見 cod-model.ts 的
 * eyeSideConfigMap），頭頂最高點通常比眼睛略高、略靠後，數值是視覺估算，
 * 之後可能還要再微調
 */
const HEADLAMP_MOUNT_Y = 0.42
const HEADLAMP_MOUNT_Z = 0.66
const HEADLAMP_SCALE = 0.26

// --- 魚與相機 ---
const FISH_START_Y = 0
const FISH_VISUAL_SCALE = 0.62
/** 模型腹部離原點的深度（已含 FISH_VISUAL_SCALE）。
 * 鱈魚模型上下不對稱：背鰭把上緣頂到 +0.43，腹部只到 -0.28
 */
const FISH_BELLY_DEPTH = 0.28
/** 停在表面上時刻意留的懸浮量。魚是游著的，貼死在線上反而僵 */
const FISH_HOVER_CLEARANCE = 0.06
/** 模型相對判定球往下沉的量，讓腹部落在球的接觸點上 */
const FISH_VISUAL_DROP = FISH_RADIUS - FISH_BELLY_DEPTH - FISH_HOVER_CLEARANCE
/** 俯衝時的最大低頭角，接近垂直但保留一點側身才像魚不像箭 */
const FISH_DIVE_TILT_LIMIT = 1.35
/** 被彈起時的最大抬頭角 */
const FISH_RISE_TILT_LIMIT = 0.6
/** 橫向速度超過此值才換面向，避免在原地抖動時左右狂翻 */
const FISH_HEADING_SWITCH_SPEED = 0.8
/** 固定半徑：垂直可見高度約 22 單位，直式橫式都夠看 */
const CAMERA_RADIUS = 26
/** 往下前瞻：魚錨在畫面上方約 1/3 處，下方的路看得多才來得及畫線 */
const CAMERA_LOOK_DOWN = 3.8
/** 鏡頭橫向只跟一半：魚貼牆時仍看得到峽谷另一側 */
const CAMERA_X_FOLLOW_RATIO = 0.55

// --- 結束與回饋判定 ---
/** 停滯判定放寬：畫線、觀察、擦掉重畫都需要時間，太短會逼死謹慎的玩家 */
const STALL_LIMIT_SECONDS = 12
/** 停滯這麼久先跳提示，玩家才知道再不動就要結束了 */
const STALL_WARNING_SECONDS = 8
const STALL_PROGRESS_THRESHOLD = 0.5
/** 擦身淨空：貼這麼近通過海膽就喝采 */
const NEAR_MISS_CLEARANCE = 0.8
/** 潛過障礙下方這麼遠才結算擦身 */
const NEAR_MISS_PASS_MARGIN = 1.2
/** 每潛這麼多公尺報一次 */
const TOAST_MILESTONE_STEP = 50

// --- 陰影取景 ---
/** 陰影正交框的半邊長，蓋住可見範圍即可 */
const SHADOW_ORTHO_HALF_SIZE = 22
/** 太陽退到焦點後方多遠 */
const SHADOW_FOCUS_DISTANCE = 34

/** createBeveledBox 產出的方塊每一顆都一模一樣，補上裁切誤差再重算漸層，
 * 每個池單元才會像是「另外剪的一張紙」而非同一塊板子複製貼上。
 * 單位方塊之後會被非等比拉伸，各軸的抖動量要先除掉預期的縮放倍率
 */
function roughenBeveledBox(
  mesh: Mesh,
  seed: number,
  amount: number,
  axisScale: { x: number; y: number; z: number },
) {
  applyVertexJitter(mesh, { seed, amount, axisScale })
  applyHeightGradient(mesh)
}

/** low poly 質感：先攤平法線讓每一面都是硬切面，再抖動頂點讓輪廓歪得自然。
 * 順序不能反：先抖再攤平會把抖動出來的細碎面全部硬化成雜訊
 */
function roughenLowPoly(
  mesh: Mesh,
  seed: number,
  amount: number,
  axisScale: { x: number; y: number; z: number },
) {
  mesh.convertToFlatShadedMesh()
  applyVertexJitter(mesh, { seed, amount, axisScale })
  applyHeightGradient(mesh)
}

/** 沿世界 y 取一段岩壁輪廓（約 -1 ~ 1）。
 *
 * 三個尺度的值雜訊疊加：大彎決定這一帶的岩壁整體往哪凹凸、
 * 中彎切出岩階、細彎在每階上再起皺——石頭的特徵就是放大縮小看都不平。
 *
 * 取樣座標刻意用**世界 y** 而不是網格自己的高度比例：
 * 峽谷是一段一段拼起來的，各段若各抖各的，接縫處輪廓會錯開一階，
 * 於是每隔十幾單位就出現一次規律的斷點；改吃世界座標之後，
 * 相鄰兩段在重疊處算出來就是同一條線，整條峽谷從頭到尾是一條連續的岩壁
 */
function sampleWallProfile(seed: number, channel: number, worldY: number): number {
  const major = sampleValueNoise(seed, channel * 3, worldY / WALL_PROFILE_MAJOR_LENGTH)
  const middle = sampleValueNoise(seed, channel * 3 + 1, worldY / WALL_PROFILE_MIDDLE_LENGTH)
  const detail = sampleValueNoise(seed, channel * 3 + 2, worldY / WALL_PROFILE_DETAIL_LENGTH)
  return major * 0.55 + middle * 0.3 + detail * 0.15
}

/** 胚料橫斷面上的一欄。x 是厚度方向、z 是深度方向，兩者都是本地座標（±0.5） */
interface WallCrossSectionColumn {
  x: number;
  z: number;
  /** 這一欄屬於側面（朝通道的那道厚度面）而不是正面 */
  isRim: boolean;
  /** 格點挪位在 x 上的倍率。側面整排要貼齊內緣，一動就跟正面脫開 */
  shiftScaleX: number;
}

/** 牆的橫斷面：先一段朝向通道的側面，再一整片正對鏡頭的正面（左牆順序相反）。
 *
 * 只做正面的話，牆是一張沒有厚度的皮——場上其他東西（層架、障礙）都是 PAPER_DEPTH 深的立體物，
 * 唯獨牆是紙片，鏡頭略帶透視的側視角一掃過去，通道邊緣就露出這件事。
 * 補上朝通道的那道側面，牆才讀成一塊有厚度的岩板。
 * 背面與外側面朝著鏡頭看不到的方向，不必生。
 *
 * 欄的走向必須一路同向（不能中途折返），三角形的頂點順序才會一致，
 * 正面的法線朝 -z、側面的法線朝通道，兩者都正對鏡頭與潛水燈
 */
function buildWallCrossSection(side: -1 | 1): WallCrossSectionColumn[] {
  const innerX = -side * 0.5
  const faceColumnList: WallCrossSectionColumn[] = []
  for (let column = 0; column <= WALL_THICKNESS_SUBDIVISION_COUNT; column++) {
    const ratio = column / WALL_THICKNESS_SUBDIVISION_COUNT
    faceColumnList.push({
      x: ratio - 0.5,
      z: -0.5,
      isRim: false,
      shiftScaleX: 1 / WALL_THICKNESS_SUBDIVISION_COUNT,
    })
  }

  // 側面不含最前那一欄：那一欄就是正面的內緣，兩者共用同一批格點才不會裂開
  const rimColumnList: WallCrossSectionColumn[] = []
  for (let column = 1; column <= WALL_RIM_SUBDIVISION_COUNT; column++) {
    const ratio = column / WALL_RIM_SUBDIVISION_COUNT
    rimColumnList.push({ x: innerX, z: -0.5 + ratio, isRim: true, shiftScaleX: 0 })
  }

  return side === 1
    // 右牆的內緣在 x = -0.5：側面排在最前面，由深到淺接上正面
    ? [...rimColumnList.reverse(), ...faceColumnList]
    // 左牆的內緣在 x = +0.5：正面走完才接側面，由淺到深
    : [...faceColumnList, ...rimColumnList]
}

/** 建一片當岩壁胚料的格網。座標就是最終朝向：x 是厚度、y 是高度、z 是深度。
 *
 * 不用 CreateGround 是因為那是一張標準格網，而標準格網有兩個藏不住的破綻：
 * 每個三角形一樣大、每個四邊形又都沿同一條對角線切。加再多面也只是更細的方格布，
 * 起伏刻得再好，畫面上先讀到的還是那張網。這裡把兩件事都在建胚料時就打散：
 * 格點各自在平面內挪位、每個四邊形沿較短的對角線切。
 * 欄的走向由 buildWallCrossSection 決定，牆因此不只是一張皮，而是有厚度的岩板
 */
function createWallGridBlank(
  name: string,
  seed: number,
  side: -1 | 1,
  scene: Scene,
): WallGridBlank {
  const crossSectionList = buildWallCrossSection(side)
  const columnCount = crossSectionList.length
  const rowCount = WALL_HEIGHT_SUBDIVISION_COUNT + 1
  const rowStep = 1 / WALL_HEIGHT_SUBDIVISION_COUNT

  const positionList: number[] = []
  const uvList: number[] = []
  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column < columnCount; column++) {
      const crossSection = crossSectionList[column]!
      // 這幾種格點不挪：內緣要對齊碰撞面、外緣的起伏另外由輪廓負責、
      // 側面整排都得貼著內緣走，上下兩列則要留住段落之間的重疊，挪動就可能露出接縫
      const isFixedColumn = column === 0 || column === columnCount - 1 || crossSection.isRim
      const isEdgeRow = row === 0 || row === rowCount - 1
      const shiftX = isFixedColumn ? 0 : hashPosition(column, row, 0, seed, 50) * WALL_GRID_SHIFT
      const shiftY = isEdgeRow ? 0 : hashPosition(column, row, 1, seed, 51) * WALL_GRID_SHIFT
      positionList.push(
        crossSection.x + shiftX * crossSection.shiftScaleX,
        (row + shiftY) * rowStep - 0.5,
        crossSection.z,
      )
      uvList.push(column / (columnCount - 1), row * rowStep)
    }
  }

  function measureGap(fromIndex: number, toIndex: number): number {
    return Math.hypot(
      positionList[fromIndex * 3]! - positionList[toIndex * 3]!,
      positionList[fromIndex * 3 + 1]! - positionList[toIndex * 3 + 1]!,
      positionList[fromIndex * 3 + 2]! - positionList[toIndex * 3 + 2]!,
    )
  }

  const indexList: number[] = []
  for (let row = 0; row < WALL_HEIGHT_SUBDIVISION_COUNT; row++) {
    for (let column = 0; column < columnCount - 1; column++) {
      const lowLeft = row * columnCount + column
      const lowRight = lowLeft + 1
      const highLeft = lowLeft + columnCount
      const highRight = highLeft + 1
      // 沿較短的那條對角線切。挪過位的格點讓兩條對角線長短不一，
      // 這條規則因此自然給出約各半的兩種切法——整面牆不會浮出平行斜紋；
      // 同時它也是三角形品質最好的切法，不會把格子切成沒有面積的細針。
      // 兩種切法的頂點順序都要讓法線朝 -z（正對鏡頭與潛水燈），反了整片會變背光
      if (measureGap(highLeft, lowRight) <= measureGap(lowLeft, highRight)) {
        indexList.push(lowLeft, lowRight, highLeft, lowRight, highRight, highLeft)
      }
      else {
        indexList.push(lowLeft, highRight, highLeft, lowLeft, lowRight, highRight)
      }
    }
  }

  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
  const normalList: number[] = []
  VertexData.ComputeNormals(positionList, indexList, normalList)
  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.normals = normalList
  vertexData.uvs = uvList
  vertexData.applyToMesh(mesh)
  // 攤平法線讓每一格都是各自吃光的硬面。它把索引依序展開成獨立頂點，
  // 所以展開後的第 n 個頂點對應的就是 indexList[n] 這個格點——
  // 這張對照表讓雕刻只需按格點算一次，再照表填到每個頂點
  mesh.convertToFlatShadedMesh()

  return {
    mesh,
    pointList: new Float32Array(positionList),
    pointIndexList: Int32Array.from(indexList),
  }
}

/** 一片牆的格點數（正面加側面）。所有池單元的格網尺寸相同，取樣暫存因此可以共用同一組 */
const WALL_POINT_COUNT = (WALL_THICKNESS_SUBDIVISION_COUNT + 1 + WALL_RIM_SUBDIVISION_COUNT)
  * (WALL_HEIGHT_SUBDIVISION_COUNT + 1)
/** 逐格點的雕刻結果。攤平法線後一片牆有七千多個頂點，但相異格點只有一千多個，
 * 而且每個格點會被填到六個頂點上——按格點算一次再照表填，省掉五倍的雜訊取樣。
 * 用平行的 Float32Array 而不是 Map 裝物件：一次活化就少配置一千多個物件，
 * 生成新段落時的停頓才不會被 GC 放大
 */
const wallSampleXList = new Float32Array(WALL_POINT_COUNT)
const wallSampleYList = new Float32Array(WALL_POINT_COUNT)
const wallSampleZList = new Float32Array(WALL_POINT_COUNT)
const wallSampleShadeList = new Float32Array(WALL_POINT_COUNT)
const wallSampleBlueList = new Float32Array(WALL_POINT_COUNT)

/** 把一片平整格網刻成這一段峽谷該有的岩壁。
 *
 * 三個方向各有各的規矩，等向抖動（applyVertexJitter）在這裡不夠用：
 * - 內緣貼著碰撞面，只能小幅往通道凸、可以大幅往外退
 * - 外緣不參與任何判定，抖得越大越不像等寬的紙帶
 * - 深度方向的起伏是這面正對鏡頭的牆唯一的明暗來源，要夠大才吃得出光
 *
 * 刻的時機在「活化」而不是「建立」：位移全部由世界座標算出，
 * 同一個池單元每次被擺到不同深度就長出不同的岩壁，玩家因此不會認出重複的牆。
 * 位移按**格點**算、再照對照表填到每個頂點：同一個格點展開出去的六份頂點
 * 必然拿到同一個位移，網格不會沿著三角形邊裂開
 */
function carveWallSurface(
  unit: WallUnit,
  centerX: number,
  centerY: number,
  heightScale: number,
) {
  const { mesh, pointList, pointIndexList, workPositionList, workColorList, side } = unit
  // 同一側的所有牆共用一組種子，接縫處才會算出同一條輪廓；兩側不同，峽谷才不是鏡像
  const seed = createSeedFrom(900, side)
  const pointCount = pointList.length / 3

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const baseX = pointList[pointIndex * 3]!
    const baseY = pointList[pointIndex * 3 + 1]!
    const baseZ = pointList[pointIndex * 3 + 2]!
    // 胚料的本地座標：x 是厚度（±0.5）、y 是高度（±0.5）、z 是深度（先攤平為 0）。
    // 0 = 內側（面向通道）、1 = 外緣；往外的方向在本地 x 上剛好就是 side
    const columnRatio = 0.5 + side * baseX
    const worldX = centerX + baseX * WALL_WIDTH
    const worldY = centerY + baseY * heightScale

    const profile = sampleWallProfile(seed, 0, worldY)
    // 碎裂的岩板：同一塊碎片內的格點拿到同一個值，那片面就共平面、
    // 碎片交界成為硬稜。石頭的低多邊形感幾乎全靠這一層，
    // 平滑雜訊再怎麼疊都只是皺紙
    const plate = sampleCellNoise(seed, 0, worldX / WALL_PLATE_CELL, worldY / WALL_PLATE_CELL)
    // 岩塊起伏與表面顆粒：兩層都沿世界座標取樣，格網再怎麼加密，
    // 凹凸的尺度都是固定的幾十公分，不會變成砂紙
    const coarseDetail = sampleValueNoise2d(
      seed,
      0,
      worldX / WALL_DETAIL_COARSE_CELL,
      worldY / WALL_DETAIL_COARSE_CELL,
    )
    const fineDetail = sampleValueNoise2d(
      seed,
      1,
      worldX / WALL_DETAIL_FINE_CELL,
      worldY / WALL_DETAIL_FINE_CELL,
    )

    // 凸進通道的量抓得比退回去的小，碰撞面才不會埋進岩石裡太深；
    // 碎屑只往外缺，缺口再深也不會擋到魚
    const chip = (plate * 0.55 + fineDetail * 0.45 + 1) / 2
    const profileOffset = profile >= 0
      ? profile * WALL_INNER_RECESS
      : profile * WALL_INNER_BULGE
    const innerOffset = profileOffset + chip * WALL_INNER_CHIP
    const outerOffset = (sampleWallProfile(seed, 1, worldY) * 0.6
      + plate * 0.25
      + coarseDetail * 0.15) * WALL_OUTER_RELIEF
    // 內外緣各走各的輪廓，中間欄內插——牆因此會忽寬忽窄，而不是整條平移
    const widthOffset = innerOffset * (1 - columnRatio) + outerOffset * columnRatio
    const depthRatio = clamp(plate * 0.55 + coarseDetail * 0.25 + fineDetail * 0.2, -1, 1)

    // 本地 z 越大代表離鏡頭越遠。凹處壓暗、帶一點冷色，
    // 這層假 AO 是側視平牆讀出凹凸的主力，光影只能補強不能代替
    const crevice = (depthRatio + 1) / 2
    // 側面的格點在正面之後（本地 z 由 -0.5 往 +0.5），愈往裡愈暗，厚度才讀得出來
    const backRatio = baseZ + 0.5
    const shade = (1 - WALL_CREVICE_SHADE * crevice) * (1 - WALL_RIM_SHADE * backRatio)
    wallSampleXList[pointIndex] = baseX + (side * widthOffset) / WALL_WIDTH
    wallSampleYList[pointIndex] = baseY
    wallSampleZList[pointIndex] = baseZ + (depthRatio * WALL_SURFACE_RELIEF) / PAPER_DEPTH
    wallSampleShadeList[pointIndex] = shade
    wallSampleBlueList[pointIndex] = Math.min(1, shade * (1 + crevice * 0.05))
  }

  for (let vertexIndex = 0; vertexIndex < pointIndexList.length; vertexIndex++) {
    const pointIndex = pointIndexList[vertexIndex]!
    const positionIndex = vertexIndex * 3
    workPositionList[positionIndex] = wallSampleXList[pointIndex]!
    workPositionList[positionIndex + 1] = wallSampleYList[pointIndex]!
    workPositionList[positionIndex + 2] = wallSampleZList[pointIndex]!

    const colorIndex = vertexIndex * 4
    const shade = wallSampleShadeList[pointIndex]!
    workColorList[colorIndex] = shade
    workColorList[colorIndex + 1] = shade
    workColorList[colorIndex + 2] = wallSampleBlueList[pointIndex]!
    workColorList[colorIndex + 3] = 1
  }

  mesh.updateVerticesData(VertexBuffer.PositionKind, workPositionList)
  mesh.updateVerticesData(VertexBuffer.ColorKind, workColorList)
  mesh.refreshBoundingInfo()
  mesh.createNormals(true)
}

/** 一片層架擺放到世界時的方位資料 */
interface ShelfPlacement {
  angle: number;
  length: number;
  /** 沿層架表面往自由端 */
  tangentX: number;
  tangentY: number;
  /** 垂直表面往上 */
  normalX: number;
  normalY: number;
  surfaceCenterX: number;
  surfaceCenterY: number;
}

/** 一片層架的視覺與碰撞資源。單一 low poly 網格，回收重用，不隨段落生滅 */
interface ShelfUnit {
  mesh: Mesh;
  /** 未縮放的碰撞節點：PhysicsBody 會吃節點縮放，與視覺網格分開才不會重複套用 */
  colliderNode: TransformNode;
  physicsBody?: PhysicsBody;
  physicsShape?: PhysicsShapeBox;
  collider: SegmentCollider;
  isActive: boolean;
}

/** 一段峽谷牆的視覺與碰撞資源。單一 low poly 網格 */
interface WallUnit {
  mesh: Mesh;
  colliderNode: TransformNode;
  physicsBody?: PhysicsBody;
  physicsShape?: PhysicsShapeBox;
  collider: SegmentCollider;
  /** 這面牆專屬的側別：左右各吃自己的種子，才不會互為鏡像 */
  side: -1 | 1;
  /** 未變形的格點位置（每點 3 個浮點）。每次活化都從這份原樣重刻，
   * 位移才不會一次疊一次越積越歪
   */
  pointList: Float32Array;
  /** 攤平法線後，每個頂點對應回哪一個格點 */
  pointIndexList: Int32Array;
  /** 刻出來的位置與頂點色寫在這兩份暫存再一次上傳，省掉每次活化的配置 */
  workPositionList: Float32Array;
  workColorList: Float32Array;
  isActive: boolean;
}

/** 建好的岩壁胚料：網格本身，加上雕刻要用的格點對照資料 */
interface WallGridBlank {
  mesh: Mesh;
  pointList: Float32Array;
  pointIndexList: Int32Array;
}

type HazardForm = 'none' | 'urchin' | 'wallSpike'

/** 一顆障礙的視覺資源。兩種形態在建立時就備妥，取用時只切換顯示與擺放。
 * 障礙不建物理剛體：致命判定是純數學的圓對圓，撞上就結束，不需要真的碰撞
 */
interface HazardUnit {
  urchinMesh: Mesh;
  spikeMesh: Mesh;
  /** 海膽形態的慢速自轉，每顆轉速不同才不像同一顆複製的 */
  spinSpeed: number;
  /** 轉速波動的相位，每顆錯開才不會整群同呼吸 */
  spinPhase: number;
  form: HazardForm;
  isActive: boolean;
}

/** 一小段蠟筆筆觸 */
interface CrayonSegmentUnit {
  mesh: Mesh;
  colliderNode: TransformNode;
  physicsBody?: PhysicsBody;
  physicsShape?: PhysicsShapeBox;
  collider: SegmentCollider;
  /** 同一次拖曳畫出的段共用一個編號，點一下擦掉時整筆一起消 */
  strokeId: number;
  isActive: boolean;
}

interface ActiveCanyonSegment {
  chained: ChainedCanyonSegment;
  wallUnitList: WallUnit[];
  shelfUnitList: ShelfUnit[];
  hazardUnitList: HazardUnit[];
}

export const createCrayonSlideGame: MiniGameFactory = (context) => {
  const { scene, camera, lighting, hasPhysics } = context

  const decorationRandom = createRandomGenerator(20260803)

  let isDisposed = false
  let isGameOver = false
  let elapsedSeconds = 0
  let lastReportedScore = 0
  let lastAspectRatio = 0
  let stallWarningShown = false
  /** 說明卡關閉、host 第一次呼叫 update() 才放開魚的重力：
   * 轉場揭幕與讀說明的時間裡 update() 不會被呼叫，魚不會自己先掉幾十公尺
   */
  let hasReleasedGravity = false

  // --- 材質 ---
  /** 紙不反光：所有材質的 specular 一律歸零 */
  function createPaperMaterial(name: string, hex: string): StandardMaterial {
    const material = new StandardMaterial(name, scene)
    material.diffuseColor = Color3.FromHexString(hex)
    material.specularColor = Color3.Black()
    return material
  }

  const paperBodyMaterial = createPaperMaterial('crayonSlidePaperBody', PAPER_WHITE_HEX)
  /** 峽谷牆：比背景深一階的暖岩色，low poly 硬面靠光影自己長出層次 */
  const wallMaterial = createPaperMaterial('crayonSlideWall', '#eee3cc')
  // 牆的幾何是零厚度的細分格網（見 createWallUnit），法線朝哪一面純靠旋轉烤進頂點資料算出來，
  // 算錯方向就整片背對鏡頭被裁掉——關掉背面剔除當保底，法線方向錯了也不會整片消失
  wallMaterial.backFaceCulling = false
  // 但沒被裁掉不等於照得到光：背面照樣拿原本朝外的法線算，對潛水燈是背光、
  // 只剩環境光的死灰色。開這個讓背面翻轉法線，牆才吃得到魚身上那盞燈
  wallMaterial.twoSidedLighting = true
  // 牆佔掉大半畫面，預設紙紋在暗部加重到 1.35 倍會把整面壓灰。
  // 這關的牆改鋪淡顆粒、尺度放大，質感留著但不吃亮度
  setPaperGrainProfile(wallMaterial, { strengthScale: 0.5, scaleScale: 0.75 })
  setPaperGrainProfile(paperBodyMaterial, { strengthScale: 0.7 })
  const paperAccentMaterialList = PAPER_ACCENT_HEX_LIST.map(
    (hex, index) => createPaperMaterial(`crayonSlidePaperAccent${index}`, hex),
  )
  const hazardMaterial = createPaperMaterial('crayonSlideHazard', HAZARD_HEX)
  // 深水打光下，光圈外的東西會沉進暗部——但警戒色是玩家必須提前看到的資訊，
  // 補一點自體發光當保底，離光源再遠也讀得出「那裡有東西碰不得」
  hazardMaterial.emissiveColor = Color3.FromHexString(HAZARD_HEX).scale(0.32)
  /** 蠟筆線用無光照材質：純色平塗、不吃光影。
   * 細長立體物被光照出深淺與陰影會顯髒，平塗才讀成「畫在畫面上的線」
   */
  const crayonMaterialList = CRAYON_COLOR_HEX_LIST.map((hex, index) => {
    const material = new StandardMaterial(`crayonSlideCrayon${index}`, scene)
    material.disableLighting = true
    material.emissiveColor = Color3.FromHexString(hex)
    material.specularColor = Color3.Black()
    return material
  })
  /** 存量條是貼在鏡頭上的 HUD，離潛水燈很遠、只吃得到微弱環境光。
   * 補上自體發光讓它在深水裡照樣讀得清楚，又保留一點光影不變成平貼的圖示
   */
  function createGaugeMaterial(name: string, hex: string): StandardMaterial {
    const material = createPaperMaterial(name, hex)
    material.emissiveColor = Color3.FromHexString(hex).scale(0.55)
    return material
  }

  const gaugeTrayMaterial = createGaugeMaterial('crayonSlideGaugeTray', INK_BLUE_HEX)
  const gaugeBodyMaterial = createGaugeMaterial('crayonSlideGaugeBody', CRAYON_YELLOW_HEX)
  const gaugeWrapperMaterial = createGaugeMaterial('crayonSlideGaugeWrapper', PAPER_WHITE_HEX)
  const gaugeLowMaterial = createGaugeMaterial('crayonSlideGaugeLow', '#c96f5a')

  // --- 玩法狀態 ---
  const ink = createCrayonInk({
    capacity: CRAYON_CAPACITY,
    refillPerSecond: CRAYON_REFILL_PER_SECOND,
    minimumDrawLength: CRAYON_MINIMUM_DRAW_LENGTH,
  })
  const depthTracker = createDepthTracker({
    startY: FISH_START_Y,
    stallLimitSeconds: STALL_LIMIT_SECONDS,
    stallProgressThreshold: STALL_PROGRESS_THRESHOLD,
  })
  const nearMissWatcher = createNearMissWatcher({
    triggerClearance: NEAR_MISS_CLEARANCE,
    passMargin: NEAR_MISS_PASS_MARGIN,
  })

  /** 每幀重填的碰撞體清單。降級模式拿它做解算，物理模式拿它做繪線防呆 */
  const activeColliderList: SegmentCollider[] = []
  /** 每幀重填的致命圓清單，兩條路徑共用 */
  const activeHazardSpecList: CanyonHazardSpec[] = []
  const fallbackBody = {
    x: 0,
    y: FISH_START_Y,
    velocityX: 0,
    velocityY: 0,
    radius: FISH_RADIUS,
  }

  // --- 世界建構 ---
  const worldRootNode = new TransformNode('crayonSlideWorldRoot', scene)

  const shelfUnitPool: ShelfUnit[] = []
  const wallUnitPool: WallUnit[] = []
  const hazardUnitPool: HazardUnit[] = []
  const crayonUnitPool: CrayonSegmentUnit[] = []
  /** 依繪製順序排列，需要騰出資源時從最舊的開始回收 */
  const activeCrayonUnitList: CrayonSegmentUnit[] = []
  const activeCanyonSegmentList: ActiveCanyonSegment[] = []

  let nextSegmentIndex = 0
  let nextTopY = FIRST_SEGMENT_TOP_Y

  function createShelfUnit(index: number): ShelfUnit {
    // 池單元在建立時就各自吃一組種子：整場的層架形狀彼此不同，
    // 取用時卻只換位置與縮放，不必重建幾何
    const unitSeed = createSeedFrom(index)
    const mesh = createBeveledBox(
      `crayonSlideShelf${index}`,
      scene,
      { width: 1, height: 1, depth: 1, bevel: 0.12 },
      paperAccentMaterialList[0] ?? paperBodyMaterial,
    )
    // 這顆單位方塊之後會沿長度拉數倍，長度軸的抖動量要等比壓回去才不會抖成鋸齒
    roughenLowPoly(mesh, unitSeed, 0.09, { x: 0.3, y: 0.7, z: 0.8 })
    mesh.receiveShadows = true
    mesh.parent = worldRootNode
    mesh.setEnabled(false)

    const colliderNode = new TransformNode(`crayonSlideShelfCollider${index}`, scene)
    colliderNode.rotationQuaternion = Quaternion.Identity()

    return {
      mesh,
      colliderNode,
      collider: {
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        halfThickness: SHELF_HALF_THICKNESS,
        isCrayon: false,
      },
      isActive: false,
    }
  }

  function disposePhysicsFor(target: { physicsBody?: PhysicsBody; physicsShape?: PhysicsShapeBox }) {
    target.physicsBody?.dispose()
    target.physicsShape?.dispose()
    target.physicsBody = undefined
    target.physicsShape = undefined
  }

  /** 建一個貼合線段的靜態盒碰撞體。
   * 碰撞節點刻意不掛在 worldRootNode 底下，Havok 對無父節點的剛體效率較好
   */
  function attachStaticBox(
    target: { colliderNode: TransformNode; physicsBody?: PhysicsBody; physicsShape?: PhysicsShapeBox },
    centerX: number,
    centerY: number,
    angle: number,
    width: number,
    height: number,
    depth: number,
  ) {
    disposePhysicsFor(target)
    target.colliderNode.position.set(centerX, centerY, 0)
    Quaternion.FromEulerAnglesToRef(0, 0, angle, target.colliderNode.rotationQuaternion!)
    target.colliderNode.computeWorldMatrix(true)

    const shape = new PhysicsShapeBox(
      Vector3.Zero(),
      Quaternion.Identity(),
      new Vector3(width, height, depth),
      scene,
    )
    const body = new PhysicsBody(target.colliderNode, PhysicsMotionType.STATIC, false, scene)
    body.shape = shape
    target.physicsShape = shape
    target.physicsBody = body
  }

  function layoutShelf(unit: ShelfUnit, placement: ShelfPlacement, colorIndex: number) {
    const { angle, length, normalX, normalY, surfaceCenterX, surfaceCenterY } = placement
    const { tangentX, tangentY } = placement

    unit.mesh.material = paperAccentMaterialList[colorIndex % paperAccentMaterialList.length]
      ?? paperBodyMaterial
    // 切線由牆指向自由端，中心往切線反向退半個埋入量：只有根部變長，
    // 自由端與碰撞線都停在原處
    unit.mesh.position.set(
      surfaceCenterX - normalX * SHELF_HALF_THICKNESS - tangentX * SHELF_WALL_EMBED / 2,
      surfaceCenterY - normalY * SHELF_HALF_THICKNESS - tangentY * SHELF_WALL_EMBED / 2,
      0,
    )
    unit.mesh.rotation.z = angle
    unit.mesh.scaling.set(length + SHELF_WALL_EMBED, SHELF_THICKNESS, PAPER_DEPTH)
    unit.mesh.setEnabled(true)
  }

  function activateShelf(unit: ShelfUnit, spec: CanyonShelfSpec, colorIndex: number) {
    const spanX = spec.endX - spec.startX
    const spanY = spec.endY - spec.startY
    const length = Math.hypot(spanX, spanY)
    const angle = Math.atan2(spanY, spanX)
    // 右牆的層架 start→end 朝 -X，幾何法線因此朝下；
    // 擺放與碰撞都要用「朝上的那面」，統一在這裡翻正
    const upwardSign = Math.cos(angle) >= 0 ? 1 : -1
    const normalX = -Math.sin(angle) * upwardSign
    const normalY = Math.cos(angle) * upwardSign
    const placement: ShelfPlacement = {
      angle,
      length,
      tangentX: Math.cos(angle),
      tangentY: Math.sin(angle),
      normalX,
      normalY,
      surfaceCenterX: (spec.startX + spec.endX) / 2,
      surfaceCenterY: (spec.startY + spec.endY) / 2,
    }

    // spec 那條線就是魚踩得到的表面，碰撞中線因此要往法線反向沉半個厚度
    unit.collider.startX = spec.startX - normalX * SHELF_HALF_THICKNESS
    unit.collider.startY = spec.startY - normalY * SHELF_HALF_THICKNESS
    unit.collider.endX = spec.endX - normalX * SHELF_HALF_THICKNESS
    unit.collider.endY = spec.endY - normalY * SHELF_HALF_THICKNESS
    unit.isActive = true

    layoutShelf(unit, placement, colorIndex)

    if (hasPhysics) {
      attachStaticBox(
        unit,
        (unit.collider.startX + unit.collider.endX) / 2,
        (unit.collider.startY + unit.collider.endY) / 2,
        angle,
        length,
        SHELF_THICKNESS,
        PAPER_DEPTH,
      )
    }
  }

  function releaseShelfUnit(unit: ShelfUnit) {
    unit.isActive = false
    unit.mesh.setEnabled(false)
    disposePhysicsFor(unit)
  }

  function takeShelfUnit(): ShelfUnit | undefined {
    return shelfUnitPool.find((unit) => !unit.isActive)
  }

  // --- 峽谷牆 ---
  /** 牆用一片細分格網當胚，形狀全靠 carveWallSurface 在活化時刻出來。
   * createBeveledBox 只在角落有頂點，大片側面完全沒有格點可動，方塊拉伸十幾倍高之後，
   * 中段就是一片光滑板子；改成堆疊分節雖然讓每節有頭尾碎稜，但節與節的接縫又讀成一顆一顆積木。
   * 格網每一格都能各自進退，整段高度隨時都有凹凸，不必分節也就沒有接縫
   */
  function createWallUnit(index: number, side: -1 | 1): WallUnit {
    // 胚料直接建在最終朝向上：x 是厚度、y 是高度、z 是深度，法線朝 -z 正對鏡頭與潛水燈。
    // 十六個池單元各吃一顆種子，格點挪位與對角線方向因此各不相同——
    // 起伏由世界座標決定、拓樸由種子決定，兩層都不一樣才不會被認出是同一片牆
    const { mesh, pointList, pointIndexList } = createWallGridBlank(
      `crayonSlideWall${index}`,
      createSeedFrom(300 + index, side),
      side,
      scene,
    )

    // 兩條要反覆改寫的緩衝先標成可更新，之後每次活化才推得動 GPU 端的資料
    const vertexCount = pointIndexList.length
    const workPositionList = new Float32Array(vertexCount * 3)
    const workColorList = new Float32Array(vertexCount * 4).fill(1)
    mesh.setVerticesData(VertexBuffer.PositionKind, workPositionList.slice(), true)
    mesh.setVerticesData(VertexBuffer.ColorKind, workColorList.slice(), true)

    mesh.material = wallMaterial
    mesh.isPickable = false
    mesh.receiveShadows = true
    mesh.parent = worldRootNode
    mesh.setEnabled(false)

    const colliderNode = new TransformNode(`crayonSlideWallCollider${index}`, scene)
    colliderNode.rotationQuaternion = Quaternion.Identity()

    return {
      mesh,
      colliderNode,
      collider: {
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        halfThickness: WALL_HALF_WIDTH,
        isCrayon: false,
      },
      side,
      pointList,
      pointIndexList,
      workPositionList,
      workColorList,
      isActive: false,
    }
  }

  function activateWall(unit: WallUnit, side: -1 | 1, segment: ChainedCanyonSegment) {
    const centerX = side * (CANYON_HALF_WIDTH + WALL_HALF_WIDTH)
    const centerY = (segment.topY + segment.bottomY) / 2
    const height = segment.height
    // 段落之間留一點縱向重疊，接縫處才不會因為浮點誤差露出一條細縫
    const wallVariation = createSideVariation(createSeedFrom(segment.index), side)
    const overscan = 1.03 + wallVariation * 0.05
    const heightScale = height * overscan

    unit.mesh.position.set(centerX, centerY, 0)
    unit.mesh.scaling.set(WALL_WIDTH, heightScale, PAPER_DEPTH)
    // 擺好位置才刻：岩壁的起伏取樣自世界座標，位置與縮放要跟這次擺放完全一致，
    // 上下相鄰的兩片牆在重疊處才會算出同一條輪廓
    carveWallSurface(unit, centerX, centerY, heightScale)
    unit.mesh.setEnabled(true)

    // 碰撞線往上下各多延伸一點，跨段的接縫才不會卡出一條看不見的稜
    unit.collider.startX = centerX
    unit.collider.startY = segment.topY + 0.6
    unit.collider.endX = centerX
    unit.collider.endY = segment.bottomY - 0.6
    unit.isActive = true

    if (hasPhysics) {
      attachStaticBox(unit, centerX, centerY, 0, WALL_WIDTH, height + 1.2, PAPER_DEPTH)
    }
  }

  function releaseWallUnit(unit: WallUnit) {
    unit.isActive = false
    unit.mesh.setEnabled(false)
    disposePhysicsFor(unit)
  }

  function takeWallUnit(side: -1 | 1): WallUnit | undefined {
    return wallUnitPool.find((unit) => !unit.isActive && unit.side === side)
  }

  // --- 障礙 ---
  /** 合併零件成單一網格。合併失敗時退回第一個零件，其餘藏起來，不讓半成品散在原點 */
  /** 合併前把各零件的頂點屬性補成同一組。
   *
   * MergeMeshes 要求所有來源具備完全相同的屬性集合，否則直接拋錯。
   * 這裡的零件混了兩種來源：createBeveledBox 是手刻 VertexData（有頂點色、沒有 UV），
   * CreateCylinder 這類內建產生器則相反。缺什麼補什麼，補的值都是中性的，
   * 不會改變外觀——頂點色補白（相乘後等於原色）、UV 補零（材質是平塗不取樣）。
   */
  function normalizeMergeAttributeList(partList: Mesh[]): void {
    for (const part of partList) {
      const positionList = part.getVerticesData(VertexBuffer.PositionKind)
      if (!positionList) {
        continue
      }
      const vertexCount = positionList.length / 3
      if (!part.isVerticesDataPresent(VertexBuffer.NormalKind)) {
        const normalList = new Float32Array(vertexCount * 3)
        VertexData.ComputeNormals(positionList, part.getIndices(), normalList)
        part.setVerticesData(VertexBuffer.NormalKind, normalList)
      }
      if (!part.isVerticesDataPresent(VertexBuffer.ColorKind)) {
        part.setVerticesData(VertexBuffer.ColorKind, new Float32Array(vertexCount * 4).fill(1))
      }
      if (!part.isVerticesDataPresent(VertexBuffer.UVKind)) {
        part.setVerticesData(VertexBuffer.UVKind, new Float32Array(vertexCount * 2))
      }
    }
  }

  function mergePaperParts(partList: Mesh[]): Mesh {
    normalizeMergeAttributeList(partList)
    const merged = Mesh.MergeMeshes(partList, true, true)
    if (merged) {
      return merged
    }
    for (const extra of partList.slice(1)) {
      extra.setEnabled(false)
    }
    return partList[0]!
  }

  /** low poly 海膽：不規則多面體當身體，周圍長出一圈短鈍的凸刺。
   * 刺深埋進身體、合併後整顆重抖動，接縫與原始形狀就讀不出來了
   */
  function createUrchinMesh(index: number, unitSeed: number, unitRandom: () => number): Mesh {
    const partList: Mesh[] = []
    const coreMesh = CreateIcoSphere(
      `crayonSlideUrchinCore${index}`,
      { radius: randomBetween(unitRandom, 0.62, 0.72), subdivisions: 1, flat: true },
      scene,
    )
    // 各軸不等比壓一下，球就不再是「一顆球」
    coreMesh.scaling.set(
      randomBetween(unitRandom, 0.9, 1.15),
      randomBetween(unitRandom, 0.9, 1.15),
      randomBetween(unitRandom, 0.7, 0.85),
    )
    coreMesh.rotation.z = randomBetween(unitRandom, 0, Math.PI)
    partList.push(coreMesh)

    // 短鈍的凸刺：截頭錐、頂端留寬，像礦石的稜瘤而非針。
    // 角度不等分帶疏密與缺口——等分骨架加小抖動仍讀得出程式味
    const spikeCount = 10 + Math.floor(unitRandom() * 3)
    const spikeAngleList = createClusteredAngleList({
      seed: unitSeed,
      count: spikeCount,
      unevenness: 0.5,
      gapRatio: 0.08,
    })
    // 其中一根當主刺：手插的放射物總有一個地方特別用力
    const mainSpikeIndex = Math.floor(unitRandom() * spikeCount)
    for (const [spikeIndex, angle] of spikeAngleList.entries()) {
      // 基部沉進身體裡，看起來是從身體長出來的，不是黏上去的
      const baseOffset = randomBetween(unitRandom, 0.38, 0.5)
      // 尖端距離鎖在致命半徑之外再變化：長度差異只往外長、不往內縮，
      // 縮短的刺會讓致命圓比看到的大，玩家就會被隱形邊界陰到
      const tipDistance = randomBetween(
        unitRandom,
        URCHIN_LETHAL_RADIUS + 0.1,
        URCHIN_LETHAL_RADIUS + 0.25,
      )
      const isMainSpike = spikeIndex === mainSpikeIndex
      const spikeLength = (tipDistance - baseOffset) * (isMainSpike ? 1.25 : 1)
      // 粗細帶 ±15% 個別差異，一圈刺才不會像同一根複製的
      const girthScale = randomBetween(unitRandom, 0.85, 1.15)
      const spikeMesh = CreateCylinder(
        `crayonSlideUrchinSpike${index}_${spikeIndex}`,
        {
          height: spikeLength,
          diameterBottom: randomBetween(unitRandom, 0.32, 0.42) * girthScale,
          diameterTop: randomBetween(unitRandom, 0.14, 0.2) * girthScale,
          tessellation: 4,
        },
        scene,
      )
      // 圓柱軸向是 +y，繞 z 轉到放射方向，再輕輕往景深方向歪
      spikeMesh.rotation.z = angle - Math.PI / 2
      spikeMesh.rotation.x = randomBetween(unitRandom, -0.25, 0.25)
      spikeMesh.position.set(
        Math.cos(angle) * (baseOffset + spikeLength / 2),
        Math.sin(angle) * (baseOffset + spikeLength / 2),
        randomBetween(unitRandom, -0.14, 0.14),
      )
      partList.push(spikeMesh)
    }

    const mesh = mergePaperParts(partList)
    mesh.name = `crayonSlideUrchin${index}`
    mesh.convertToFlatShadedMesh()
    applyVertexJitter(mesh, { seed: unitSeed, amount: 0.09, axisScale: { x: 1, y: 1, z: 0.7 } })
    applyHeightGradient(mesh)
    mesh.material = hazardMaterial
    mesh.isPickable = false
    return mesh
  }

  /** low poly 牆刺：兩顆不規則岩瘤疊成從牆長出的凸座，前端冒出幾顆短鈍的牙。
   * 以致命圓心為原點、朝 +x 建模，右牆的實例靠 rotation.y 翻面
   */
  function createWallSpikeMesh(index: number, unitSeed: number, unitRandom: () => number): Mesh {
    const partList: Mesh[] = []
    // 岩瘤底座：兩顆低面數球互相嵌著，合併抖動後就是一坨從牆縫擠出的東西
    for (let baseIndex = 0; baseIndex < 2; baseIndex++) {
      const baseMesh = CreateIcoSphere(
        `crayonSlideSpikeBase${index}_${baseIndex}`,
        { radius: randomBetween(unitRandom, 0.5, 0.66), subdivisions: 1, flat: true },
        scene,
      )
      baseMesh.scaling.set(
        randomBetween(unitRandom, 1, 1.3),
        randomBetween(unitRandom, 0.85, 1.1),
        randomBetween(unitRandom, 0.65, 0.85),
      )
      baseMesh.rotation.z = randomBetween(unitRandom, 0, Math.PI)
      baseMesh.position.set(
        -WALL_SPIKE_CANONICAL_PROTRUSION + 0.3 + baseIndex * 0.4,
        randomBetween(unitRandom, -0.25, 0.25),
        randomBetween(unitRandom, -0.1, 0.1),
      )
      partList.push(baseMesh)
    }

    // 短鈍的牙：截頭錐往通道方向張開，長度收短、頂端留寬。
    // 每叢 3~5 根、間隔不等分、整叢帶隨機偏轉——等距對稱的四根扇一眼就是程式排的
    const toothCount = 3 + Math.floor(unitRandom() * 3)
    const clusterTilt = randomBetween(unitRandom, -0.12, 0.12)
    const fanSpan = randomBetween(unitRandom, 0.85, 1.1)
    const intervalList: number[] = []
    let intervalTotal = 0
    for (let toothIndex = 0; toothIndex < toothCount - 1; toothIndex++) {
      // 間隔可差到近三倍，牙與牙之間才有疏密
      const interval = randomBetween(unitRandom, 0.55, 1.55)
      intervalList.push(interval)
      intervalTotal += interval
    }
    const fanAngleList: number[] = [clusterTilt - fanSpan / 2]
    for (const interval of intervalList) {
      fanAngleList.push(
        (fanAngleList[fanAngleList.length - 1] ?? 0) + (interval / intervalTotal) * fanSpan,
      )
    }
    // 最接近正中的那根當主牙：牙尖從目標位置回推長度，
    // 保證略超出致命圓，判定才永遠比看到的寬鬆
    let mainToothIndex = 0
    for (const [toothIndex, fanAngle] of fanAngleList.entries()) {
      if (Math.abs(fanAngle) < Math.abs(fanAngleList[mainToothIndex] ?? 0)) {
        mainToothIndex = toothIndex
      }
    }
    for (const [toothIndex, fanAngle] of fanAngleList.entries()) {
      const clampedAngle = clamp(fanAngle, -0.6, 0.6)
      // 牙根埋進岩瘤的深度各自不同，基部才不會排成一直線
      const baseX = -WALL_SPIKE_CANONICAL_PROTRUSION + randomBetween(unitRandom, 0.8, 0.95)
      const isMainTooth = toothIndex === mainToothIndex
      const centerness = 1 - Math.abs(clampedAngle) / 0.7
      const toothLength = isMainTooth
        ? clamp(
            (randomBetween(unitRandom, 0.44, 0.52) - baseX) / Math.cos(clampedAngle) - 0.18,
            0.6,
            0.95,
          )
        : (0.45 + centerness * 0.25) * randomBetween(unitRandom, 0.85, 1.15)
      // 主牙略粗，其餘 ±15% 錯落，整叢才不會像同一根複製的
      const girthScale = isMainTooth
        ? randomBetween(unitRandom, 1.05, 1.2)
        : randomBetween(unitRandom, 0.85, 1.15)
      const toothMesh = CreateCylinder(
        `crayonSlideSpikeTooth${index}_${toothIndex}`,
        {
          height: toothLength,
          diameterBottom: randomBetween(unitRandom, 0.3, 0.42) * girthScale,
          diameterTop: randomBetween(unitRandom, 0.1, 0.18) * girthScale,
          tessellation: 4,
        },
        scene,
      )
      toothMesh.rotation.z = clampedAngle - Math.PI / 2
      toothMesh.position.set(
        baseX + Math.cos(clampedAngle) * (toothLength / 2 + 0.18),
        Math.sin(clampedAngle) * (toothLength / 2 + 0.3),
        randomBetween(unitRandom, -0.12, 0.12),
      )
      partList.push(toothMesh)
    }

    const mesh = mergePaperParts(partList)
    mesh.name = `crayonSlideWallSpike${index}`
    mesh.convertToFlatShadedMesh()
    applyVertexJitter(mesh, { seed: unitSeed + 1, amount: 0.08, axisScale: { x: 1, y: 1, z: 0.7 } })
    applyHeightGradient(mesh)
    mesh.material = hazardMaterial
    mesh.isPickable = false
    return mesh
  }

  function createHazardUnit(index: number): HazardUnit {
    const unitSeed = createSeedFrom(600 + index)
    const unitRandom = createRandomGenerator(unitSeed)
    const urchinMesh = createUrchinMesh(index, unitSeed, unitRandom)
    const spikeMesh = createWallSpikeMesh(index, unitSeed, unitRandom)
    urchinMesh.parent = worldRootNode
    spikeMesh.parent = worldRootNode
    urchinMesh.setEnabled(false)
    spikeMesh.setEnabled(false)

    return {
      urchinMesh,
      spikeMesh,
      spinSpeed: randomBetween(unitRandom, 0.25, 0.6) * (unitRandom() < 0.5 ? -1 : 1),
      spinPhase: randomBetween(unitRandom, 0, Math.PI * 2),
      form: 'none',
      isActive: false,
    }
  }

  function activateHazard(unit: HazardUnit, spec: CanyonHazardSpec) {
    if (spec.kind === 'urchin') {
      unit.form = 'urchin'
      unit.urchinMesh.position.set(spec.x, spec.y, 0)
      unit.urchinMesh.rotation.z = randomBetween(decorationRandom, 0, Math.PI * 2)
      // 只放大不縮小：視覺可以比致命圓大（判定從寬），反過來就會被隱形刺陰到
      unit.urchinMesh.scaling.setAll(randomBetween(decorationRandom, 1, 1.18))
      unit.urchinMesh.setEnabled(true)
    }
    else {
      unit.form = 'wallSpike'
      // 實際凸出量 = 牆面到致命圓心的距離，沿 x 縮放把基準網格拉到貼合
      const protrusion = CANYON_HALF_WIDTH - Math.abs(spec.x)
      unit.spikeMesh.position.set(spec.x, spec.y, 0)
      unit.spikeMesh.scaling.set(
        protrusion / WALL_SPIKE_CANONICAL_PROTRUSION,
        randomBetween(decorationRandom, 1, 1.2),
        1,
      )
      // 基準網格朝 +x（自左牆伸出），右牆翻半圈
      unit.spikeMesh.rotation.y = spec.wallSide === 1 ? Math.PI : 0
      unit.spikeMesh.setEnabled(true)
    }
    unit.isActive = true
  }

  function releaseHazardUnit(unit: HazardUnit) {
    unit.isActive = false
    unit.form = 'none'
    unit.urchinMesh.setEnabled(false)
    unit.spikeMesh.setEnabled(false)
  }

  function takeHazardUnit(): HazardUnit | undefined {
    return hazardUnitPool.find((unit) => !unit.isActive)
  }

  // --- 蠟筆線 ---
  function createCrayonUnit(index: number): CrayonSegmentUnit {
    const mesh = createBeveledBox(
      `crayonSlideStroke${index}`,
      scene,
      { width: 1, height: 1, depth: 1, bevel: 0.35 },
      crayonMaterialList[0] ?? paperBodyMaterial,
    )
    // 不抖動、關掉頂點色：線是玩家的工具，平塗純色最乾淨，
    // 倒角只負責讓側視剪影的線頭圓潤
    mesh.useVertexColors = false
    mesh.parent = worldRootNode
    mesh.setEnabled(false)

    const colliderNode = new TransformNode(`crayonSlideStrokeCollider${index}`, scene)
    colliderNode.rotationQuaternion = Quaternion.Identity()

    return {
      mesh,
      colliderNode,
      collider: {
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        halfThickness: CRAYON_HALF_THICKNESS,
        isCrayon: true,
      },
      strokeId: 0,
      isActive: false,
    }
  }

  function releaseCrayonUnit(unit: CrayonSegmentUnit) {
    unit.isActive = false
    unit.mesh.setEnabled(false)
    disposePhysicsFor(unit)
  }

  function takeCrayonUnit(): CrayonSegmentUnit {
    const free = crayonUnitPool.find((unit) => !unit.isActive)
    if (free) {
      return free
    }
    // 池子用完就吃掉最舊的一段：畫過的線本來就該隨鏡頭遠去而消失
    const oldest = activeCrayonUnitList.shift()!
    releaseCrayonUnit(oldest)
    return oldest
  }

  // --- 峽谷段落管理 ---
  function buildCanyonBelow(frontY: number) {
    while (nextTopY > frontY - TERRAIN_BUILD_BELOW) {
      const chained = chainCanyonSegment(nextSegmentIndex, nextTopY)

      const wallUnitList: WallUnit[] = []
      for (const side of [-1, 1] as const) {
        const unit = takeWallUnit(side)
        if (unit) {
          activateWall(unit, side, chained)
          wallUnitList.push(unit)
        }
      }

      const shelfUnitList: ShelfUnit[] = []
      for (const shelfSpec of chained.shelfList) {
        const unit = takeShelfUnit()
        if (!unit) {
          break
        }
        activateShelf(unit, shelfSpec, chained.index)
        shelfUnitList.push(unit)
      }

      const hazardUnitList: HazardUnit[] = []
      for (const hazardSpec of chained.hazardList) {
        const unit = takeHazardUnit()
        if (!unit) {
          break
        }
        activateHazard(unit, hazardSpec)
        hazardUnitList.push(unit)
      }

      activeCanyonSegmentList.push({ chained, wallUnitList, shelfUnitList, hazardUnitList })
      nextSegmentIndex += 1
      nextTopY = chained.bottomY
    }
  }

  function recycleCanyonAbove(backY: number) {
    while (
      activeCanyonSegmentList.length > 1
      && (activeCanyonSegmentList[0]?.chained.bottomY ?? 0) > backY
    ) {
      const segment = activeCanyonSegmentList.shift()
      if (!segment) {
        break
      }
      for (const unit of segment.wallUnitList) {
        releaseWallUnit(unit)
      }
      for (const unit of segment.shelfUnitList) {
        releaseShelfUnit(unit)
      }
      for (const unit of segment.hazardUnitList) {
        releaseHazardUnit(unit)
      }
    }
  }

  function recycleCrayonAbove(backY: number) {
    while (activeCrayonUnitList.length > 0) {
      const unit = activeCrayonUnitList[0]
      if (!unit || Math.min(unit.collider.startY, unit.collider.endY) <= backY) {
        break
      }
      activeCrayonUnitList.shift()
      releaseCrayonUnit(unit)
    }
  }

  // 遠景刻意留空：峽谷牆之外只有純色背景。
  // 飄過的紙帶會與畫線的落點搶注意力，也把本來就窄的畫面壓得更暗

  // --- 魚 ---
  // 側視取景：瞳孔看向兩側才正對鏡頭，看正前方會轉到眼球側邊被眼白擋住
  const codModel = createCodModel(scene, { pupilGazeMode: 'sideways' })
  const fishTiltNode = new TransformNode('crayonSlideFishTilt', scene)
  fishTiltNode.parent = worldRootNode

  /** 潛水燈：跟著魚的一盞點光，是這關唯一的主光源。
   *
   * 深水的空間感來自「光只照得到附近」——環境光整體壓到剩微光，
   * 魚周圍亮成一圈、上下遠處沉進背景色，畫面才有往下潛的深度。
   * Babylon 標準材質的點光是線性衰減（1 - 距離/range），range 抓得比可見範圍略大，
   * 前方的路看得到但已明顯變暗，玩家才有「照到哪裡算哪裡」的緊張感
   */
  const diveLight = new PointLight('crayonSlideDiveLight', new Vector3(0, 0, DIVE_LIGHT_Z), scene)
  diveLight.diffuse = Color3.FromHexString('#ffe1b0')
  // 紙不反光，這關所有材質的 specular 都歸零，燈也一致
  diveLight.specular = Color3.Black()
  diveLight.intensity = DIVE_LIGHT_INTENSITY
  diveLight.range = DIVE_LIGHT_RANGE
  codModel.rootNode.parent = fishTiltNode
  // 判定用的球（半徑 FISH_RADIUS）遠比模型的半高胖：魚身高 0.71、腹部只在原點下方 0.28，
  // 球卻是 0.55。不補這一段，魚停在蠟筆線或層架上時會浮在表面上方將近半個身高。
  // 球的大小不動——它是照魚的**體長**抓的，動了整套通道寬度與障礙判定都要重調
  codModel.rootNode.position.y = -FISH_VISUAL_DROP
  // 鱈魚模型頭朝 +z，側視預設頭朝 +x；往左游時 yaw 翻向、俯衝角跟著鏡像
  codModel.rootNode.rotation.y = Math.PI / 2
  codModel.rootNode.scaling.setAll(FISH_VISUAL_SCALE)

  /** 頭燈道具：讓潛水燈的光「有個燈具在發」，不是憑空跟著魚的一團亮。
   * 燈殼是躺平的圓柱（繞 x 轉 90 度，圓形端面才會朝 +z、朝著魚頭前方），
   * 鏡片貼在燈殼前緣，用跟 diveLight 同色的自體發光材質，讀起來像燈已經亮著
   */
  const headlampStrapMaterial = createPaperMaterial('crayonSlideHeadlampStrap', '#8a7a63')
  const headlampLensMaterial = new StandardMaterial('crayonSlideHeadlampLens', scene)
  headlampLensMaterial.disableLighting = true
  headlampLensMaterial.emissiveColor = diveLight.diffuse.clone()
  headlampLensMaterial.specularColor = Color3.Black()

  const headlampNode = new TransformNode('crayonSlideHeadlampRoot', scene)
  headlampNode.parent = codModel.rootNode
  headlampNode.position.set(0, HEADLAMP_MOUNT_Y, HEADLAMP_MOUNT_Z)
  headlampNode.scaling.setAll(HEADLAMP_SCALE)

  // 短柱：頭燈架在頭頂上方一點，不埋進頭裡
  const headlampPost = CreateCylinder(
    'crayonSlideHeadlampPost',
    { diameterTop: 0.3, diameterBottom: 0.4, height: 0.9, tessellation: 6 },
    scene,
  )
  headlampPost.material = headlampStrapMaterial
  headlampPost.position.y = 0.45
  headlampPost.parent = headlampNode

  const HEADLAMP_HOUSING_HEIGHT = 0.85
  const headlampHousing = CreateCylinder(
    'crayonSlideHeadlampHousing',
    { diameter: 1.2, height: HEADLAMP_HOUSING_HEIGHT, tessellation: 8 },
    scene,
  )
  headlampHousing.material = headlampStrapMaterial
  headlampHousing.rotation.x = Math.PI / 2
  headlampHousing.position.set(0, 0.95, 0.3)
  headlampHousing.parent = headlampNode

  const headlampLens = CreateCylinder(
    'crayonSlideHeadlampLens',
    { diameter: 1.05, height: 0.1, tessellation: 8 },
    scene,
  )
  headlampLens.material = headlampLensMaterial
  headlampLens.rotation.x = Math.PI / 2
  // 貼在燈殼 +z 端面外一點點，避免跟燈殼共面 z-fighting
  headlampLens.position.set(0, 0.95, headlampHousing.position.z + HEADLAMP_HOUSING_HEIGHT / 2 + 0.02)
  headlampLens.parent = headlampNode

  for (const mesh of [headlampPost, headlampHousing, headlampLens]) {
    mesh.isPickable = false
  }

  const fishBallMesh = CreateSphere(
    'crayonSlideFishBall',
    { diameter: FISH_RADIUS * 2, segments: 6 },
    scene,
  )
  fishBallMesh.isVisible = false
  fishBallMesh.isPickable = false

  let fishAggregate: PhysicsAggregate | undefined
  const scratchVelocity = new Vector3()
  let fishX = 0
  let fishY = FISH_START_Y
  let fishVelocityX = 0
  let fishVelocityY = 0
  let fishTilt = 0
  let fishHeading: -1 | 1 = 1
  let fishYaw = Math.PI / 2

  function placeFishAt(x: number, y: number) {
    fishX = x
    fishY = y
    fishBallMesh.position.set(x, y, 0)
    fallbackBody.x = x
    fallbackBody.y = y
    fallbackBody.velocityX = 0
    fallbackBody.velocityY = 0
  }

  function enableFishPhysics() {
    scene.getPhysicsEngine()?.setGravity(new Vector3(0, FISH_GRAVITY_Y, 0))
    fishAggregate = new PhysicsAggregate(
      fishBallMesh,
      PhysicsShapeType.SPHERE,
      { mass: 1, restitution: FISH_RESTITUTION, friction: 0.32 },
      scene,
    )
    fishAggregate.body.setLinearDamping(0.02)
    fishAggregate.body.setAngularDamping(1.4)
    // 開場先無重力懸停，說明卡關閉、update() 第一次跑到才放開
    fishAggregate.body.setGravityFactor(0)
  }

  /** 兩條路徑共用的終端速度與水平阻尼，手感才一致 */
  function applyFallLimit(deltaSeconds: number, fallSpeedLimit: number) {
    if (scratchVelocity.y < -fallSpeedLimit) {
      scratchVelocity.y = -fallSpeedLimit
    }
    scratchVelocity.x *= Math.exp(-FISH_HORIZONTAL_DAMPING * deltaSeconds)
    // 遊玩平面固定在 z = 0：任何深度方向的殘餘速度都直接抹掉
    scratchVelocity.z = 0
    const speed = Math.hypot(scratchVelocity.x, scratchVelocity.y)
    if (speed > FISH_MAX_SPEED) {
      const scale = FISH_MAX_SPEED / speed
      scratchVelocity.x *= scale
      scratchVelocity.y *= scale
    }
  }

  // --- 蠟筆存量條（3D 世界內，掛在相機前方） ---
  const gaugeRootNode = new TransformNode('crayonSlideInkGaugeRoot', scene)
  let gaugeBodyMesh: Mesh | undefined
  let gaugeTipMesh: Mesh | undefined
  let gaugeWrapperMesh: Mesh | undefined
  /** 蠟筆本體滿量時的長度（gauge 局部單位） */
  const GAUGE_FULL_LENGTH = 1
  const GAUGE_TIP_LENGTH = 0.24
  const GAUGE_WRAPPER_LENGTH = 0.34
  const GAUGE_BODY_DIAMETER = 0.27
  /** 筆身的頂點抖動幅度。抖動是逐軸各抖一次，徑向最多外擴 √2 倍幅度，
   * 套在外面的東西要留得比這個多，才不會被筆身的稜戳穿
   */
  const GAUGE_JITTER_AMOUNT = 0.012
  const GAUGE_RADIAL_JITTER = GAUGE_JITTER_AMOUNT * Math.SQRT2
  /** 紙套內徑要能吃下筆身抖出來的最大半徑，再留一倍餘裕。
   * 原本只比筆身粗 0.015 半徑，抖動一生效就整條黃色戳出白套子
   */
  const GAUGE_WRAPPER_DIAMETER = GAUGE_BODY_DIAMETER + GAUGE_RADIAL_JITTER * 4
  /** 相機前方多遠。要大於相機 minZ，又要遠離地形避免被穿插 */
  const GAUGE_DISTANCE = 4

  function buildInkGauge() {
    gaugeRootNode.parent = camera

    // 底板：畫出滿量的長度，玩家才看得出少了多少
    const trayMesh = createBeveledBox(
      'crayonSlideGaugeTray',
      scene,
      { width: 0.44, height: GAUGE_FULL_LENGTH + GAUGE_TIP_LENGTH + 0.12, depth: 0.1, bevel: 0.05 },
      gaugeTrayMaterial,
    )
    roughenBeveledBox(trayMesh, createSeedFrom(901), 0.022, { x: 1, y: 0.6, z: 0.5 })
    trayMesh.parent = gaugeRootNode
    trayMesh.position.set(0, (GAUGE_FULL_LENGTH + GAUGE_TIP_LENGTH) / 2, 0.16)

    /** 六角柱的稜線太完美就變成工業製品，抖一點才像手上那支用舊的蠟筆。
     * 存量條每幀改的是 scaling，抖動只在這裡做一次。
     * 三截是互相套疊的，徑向抖動要各自節制：手作感集中在最顯眼的筆身，
     * 外層與接合處讓它乾淨，才不會每一幀都在賭有沒有戳出來
     */
    function finishGaugePart(
      mesh: Mesh,
      seed: number,
      axisScale: { x: number; y: number; z: number },
    ) {
      mesh.convertToFlatShadedMesh()
      applyVertexJitter(mesh, { seed, amount: GAUGE_JITTER_AMOUNT, axisScale })
      applyHeightGradient(mesh, 0.2)
      mesh.parent = gaugeRootNode
      mesh.isPickable = false
    }

    // 六角柱：蠟筆的招牌斷面
    const bodyMesh = CreateCylinder(
      'crayonSlideGaugeBody',
      { height: GAUGE_FULL_LENGTH, diameter: GAUGE_BODY_DIAMETER, tessellation: 6 },
      scene,
    )
    // 本體長度隨存量伸縮，兩端切面若也抖動會在縮放後歪出接縫
    finishGaugePart(bodyMesh, createSeedFrom(902), { x: 1, y: 0.2, z: 1 })
    bodyMesh.material = gaugeBodyMaterial
    gaugeBodyMesh = bodyMesh

    const tipMesh = CreateCylinder(
      'crayonSlideGaugeTip',
      {
        height: GAUGE_TIP_LENGTH,
        diameterTop: 0.03,
        // 錐底比筆身略粗：兩截各自抖動，錐底若剛好等寬，接縫處會露出筆身的稜
        diameterBottom: GAUGE_BODY_DIAMETER + GAUGE_RADIAL_JITTER * 2,
        tessellation: 6,
      },
      scene,
    )
    // 筆尖只抖長度方向：削過的錐面本來就滑順，徑向再抖就得跟筆身的稜賽跑
    finishGaugePart(tipMesh, createSeedFrom(903), { x: 0, y: 0.5, z: 0 })
    tipMesh.material = gaugeBodyMaterial
    gaugeTipMesh = tipMesh

    const wrapperMesh = CreateCylinder(
      'crayonSlideGaugeWrapper',
      { height: GAUGE_WRAPPER_LENGTH, diameter: GAUGE_WRAPPER_DIAMETER, tessellation: 6 },
      scene,
    )
    // 紙套是最外層，徑向不抖：包在外面的紙本來就平整，
    // 只讓上下開口的邊緣歪一點，讀起來像撕過的紙口
    finishGaugePart(wrapperMesh, createSeedFrom(904), { x: 0, y: 0.3, z: 0 })
    wrapperMesh.material = gaugeWrapperMaterial
    gaugeWrapperMesh = wrapperMesh
  }

  /** 依畫面比例重新擺放存量條。
   * 靠左上角：控制提示寫的就是「左上蠟筆是存量」，而畫線發生在魚的下方，
   * 存量條擺在畫面中段會正好卡在要畫線的地方
   */
  function layoutInkGauge() {
    const aspectRatio = context.getAspectRatio()
    const halfHeight = GAUGE_DISTANCE * Math.tan(camera.fov / 2)
    const halfWidth = halfHeight * aspectRatio
    const gaugeScale = halfHeight * 0.34
    gaugeRootNode.scaling.setAll(gaugeScale)
    // 微微側傾＋前俯，讓這支蠟筆看起來是擺在桌上的實物而非貼在畫面上的圖示
    gaugeRootNode.rotation.x = -0.12
    gaugeRootNode.rotation.z = 0.07
    // 蠟筆由根部往上長，根部要壓低到「滿量時筆尖剛好停在上緣之下」。
    // 橫向只留自身半寬加一點餘裕，直式畫面才不會把窄通道也遮掉
    const gaugeFullHeight = gaugeScale * (GAUGE_FULL_LENGTH + GAUGE_TIP_LENGTH)
    gaugeRootNode.position.set(
      -halfWidth + gaugeScale * 0.62,
      halfHeight * 0.78 - gaugeFullHeight,
      GAUGE_DISTANCE,
    )
    lastAspectRatio = aspectRatio
  }

  function updateInkGauge() {
    const ratio = ink.getRatio()
    const bodyLength = Math.max(0.04, ratio * GAUGE_FULL_LENGTH)
    if (gaugeBodyMesh) {
      gaugeBodyMesh.scaling.y = bodyLength
      gaugeBodyMesh.position.y = bodyLength / 2
      gaugeBodyMesh.material = ratio < 0.16 ? gaugeLowMaterial : gaugeBodyMaterial
    }
    if (gaugeTipMesh) {
      gaugeTipMesh.position.y = bodyLength + GAUGE_TIP_LENGTH / 2
      gaugeTipMesh.material = ratio < 0.16 ? gaugeLowMaterial : gaugeBodyMaterial
    }
    if (gaugeWrapperMesh) {
      const wrapperScale = clamp(bodyLength / GAUGE_WRAPPER_LENGTH, 0, 1)
      gaugeWrapperMesh.scaling.y = wrapperScale
      gaugeWrapperMesh.position.y = GAUGE_WRAPPER_LENGTH * wrapperScale / 2
    }
    // 快沒墨時整支抖動：契約沒有存量的 HUD 通道，只能靠這支蠟筆自己喊。
    // 多頻疊加的高頻顫抖再用慢波調振幅——單一 sin 是蜂鳴器，忽強忽弱才像手抖
    const shakeAmount = ratio < 0.16 ? (0.16 - ratio) * 1.4 : 0
    const shakeSway = sampleOrganicSway(elapsedSeconds * 26, 2.6)
      * (0.7 + sampleOrganicSway(elapsedSeconds * 3.4, 1.1) * 0.3)
    gaugeRootNode.rotation.z = 0.1 + shakeSway * shakeAmount
  }

  // --- 畫線 ---
  const scratchInverseViewMatrix = new Matrix()
  const scratchRayDirection = new Vector3()
  const scratchRayOrigin = new Vector3()
  let isDrawing = false
  let strokeColorIndex = 0
  let strokePointX = 0
  let strokePointY = 0
  let activeStrokeId = 0
  // 點一下（未拖曳）擦線的判定資料
  let pointerDownXRatio = 0
  let pointerDownYRatio = 0
  let pointerDownSeconds = 0
  let hasPointerDragged = false
  /** 最近一次指標輸入的時間，供停滯判定豁免「正在想辦法的玩家」 */
  let lastPointerSeconds = -10

  /** 把畫面比例座標打到 z = 0 平面。
   * 自算射線而非 scene.pick：契約只給比例座標拿不到 canvas 矩形，
   * 而且遊玩平面固定，不需要真的去打網格
   */
  function getWorldPointOnPlane(xRatio: number, yRatio: number): { x: number; y: number } | null {
    camera.getViewMatrix().invertToRef(scratchInverseViewMatrix)
    const tanHalfFov = Math.tan(camera.fov / 2)
    scratchRayDirection.set(
      (xRatio * 2 - 1) * tanHalfFov * context.getAspectRatio(),
      (1 - yRatio * 2) * tanHalfFov,
      1,
    )
    Vector3.TransformNormalToRef(scratchRayDirection, scratchInverseViewMatrix, scratchRayDirection)
    if (Math.abs(scratchRayDirection.z) < 1e-4) {
      return null
    }
    // 相機位置直接取自反視矩陣的平移，不依賴 globalPosition 這一幀是否已更新
    scratchInverseViewMatrix.getTranslationToRef(scratchRayOrigin)
    const distance = -scratchRayOrigin.z / scratchRayDirection.z
    if (distance <= 0) {
      return null
    }
    return {
      x: scratchRayOrigin.x + scratchRayDirection.x * distance,
      y: scratchRayOrigin.y + scratchRayDirection.y * distance,
    }
  }

  /** 線是否會長在魚身上。新生的碰撞體壓在魚體內會把魚彈飛，必須擋掉 */
  function isSegmentBlockedByFish(startX: number, startY: number, endX: number, endY: number): boolean {
    const ratio = getSegmentProjection(startX, startY, endX, endY, fishX, fishY)
    const closestX = startX + (endX - startX) * ratio
    const closestY = startY + (endY - startY) * ratio
    return Math.hypot(fishX - closestX, fishY - closestY)
      < FISH_RADIUS + CRAYON_HALF_THICKNESS + CRAYON_FISH_CLEARANCE
  }

  function addCrayonSegment(startX: number, startY: number, endX: number, endY: number) {
    const spanX = endX - startX
    const spanY = endY - startY
    const length = Math.hypot(spanX, spanY)
    if (length < 1e-3) {
      return
    }
    const angle = Math.atan2(spanY, spanX)
    const centerX = (startX + endX) / 2
    const centerY = (startY + endY) / 2
    // 粗細固定：平塗的線一段粗一段細只會像畫壞，均勻才乾淨
    const thickness = CRAYON_HALF_THICKNESS * 2
    const depth = CRAYON_DEPTH

    const unit = takeCrayonUnit()
    unit.mesh.material = crayonMaterialList[strokeColorIndex] ?? crayonMaterialList[0]!
    // z 各自微偏：相鄰段在轉折處重疊，同平面會 z-fighting 閃爍
    unit.mesh.position.set(centerX, centerY, randomBetween(decorationRandom, -0.06, 0.06))
    unit.mesh.rotation.z = angle
    // 長度多留一個厚度，相鄰段落在轉折處重疊，看起來才是連續的一筆
    unit.mesh.scaling.set(length + thickness, thickness, depth)
    unit.mesh.setEnabled(true)
    unit.strokeId = activeStrokeId

    unit.collider.startX = startX
    unit.collider.startY = startY
    unit.collider.endX = endX
    unit.collider.endY = endY
    unit.collider.halfThickness = thickness / 2
    unit.isActive = true
    activeCrayonUnitList.push(unit)

    if (hasPhysics) {
      attachStaticBox(unit, centerX, centerY, angle, length + thickness, thickness, depth)
    }
  }

  function beginStroke(event: GamePointerEvent) {
    if (!ink.canDraw()) {
      return
    }
    const point = getWorldPointOnPlane(event.xRatio, event.yRatio)
    if (!point) {
      return
    }
    isDrawing = true
    activeStrokeId += 1
    strokeColorIndex = Math.floor(decorationRandom() * crayonMaterialList.length)
    strokePointX = point.x
    strokePointY = point.y
  }

  function extendStroke(event: GamePointerEvent) {
    if (!isDrawing) {
      return
    }
    const point = getWorldPointOnPlane(event.xRatio, event.yRatio)
    if (!point) {
      return
    }

    let spanX = point.x - strokePointX
    let spanY = point.y - strokePointY
    let distance = Math.hypot(spanX, spanY)

    while (distance >= CRAYON_SAMPLE_MIN_DISTANCE && ink.canDraw()) {
      const stepLength = Math.min(distance, CRAYON_SEGMENT_MAX_LENGTH)
      const nextX = strokePointX + spanX * (stepLength / distance)
      const nextY = strokePointY + spanY * (stepLength / distance)

      if (isSegmentBlockedByFish(strokePointX, strokePointY, nextX, nextY)) {
        // 跳過壓在魚身上的那一段，但游標繼續往前，玩家的筆畫不會被打斷
        strokePointX = nextX
        strokePointY = nextY
      }
      else {
        const granted = ink.consume(stepLength)
        if (granted <= 1e-4) {
          break
        }
        const grantedX = strokePointX + spanX * (granted / distance)
        const grantedY = strokePointY + spanY * (granted / distance)
        addCrayonSegment(strokePointX, strokePointY, grantedX, grantedY)
        strokePointX = grantedX
        strokePointY = grantedY
      }

      spanX = point.x - strokePointX
      spanY = point.y - strokePointY
      distance = Math.hypot(spanX, spanY)
    }

    if (!ink.canDraw()) {
      isDrawing = false
    }
  }

  function finishStroke() {
    isDrawing = false
  }

  /** 點一下線就把那一整筆擦掉，退還部分蠟筆。
   * 畫壞的線只能等它捲出畫面太折磨，尤其是把魚困住的那種
   */
  function eraseStrokeAt(event: GamePointerEvent) {
    const point = getWorldPointOnPlane(event.xRatio, event.yRatio)
    if (!point) {
      return
    }

    let closestUnit: CrayonSegmentUnit | undefined
    let closestDistance = CRAYON_ERASE_RADIUS
    for (const unit of activeCrayonUnitList) {
      const closest = getClosestPointOnSegment(
        unit.collider.startX,
        unit.collider.startY,
        unit.collider.endX,
        unit.collider.endY,
        point.x,
        point.y,
      )
      const distance = Math.hypot(point.x - closest.x, point.y - closest.y)
      if (distance < closestDistance) {
        closestDistance = distance
        closestUnit = unit
      }
    }
    if (!closestUnit) {
      return
    }

    const strokeId = closestUnit.strokeId
    let refundLength = 0
    for (let index = activeCrayonUnitList.length - 1; index >= 0; index--) {
      const unit = activeCrayonUnitList[index]
      if (!unit || unit.strokeId !== strokeId) {
        continue
      }
      refundLength += Math.hypot(
        unit.collider.endX - unit.collider.startX,
        unit.collider.endY - unit.collider.startY,
      )
      releaseCrayonUnit(unit)
      activeCrayonUnitList.splice(index, 1)
    }
    ink.restore(refundLength * CRAYON_ERASE_REFUND_RATIO)
  }

  // --- 相機 ---
  let cameraTargetX = 0
  let cameraTargetY = FISH_START_Y - CAMERA_LOOK_DOWN
  const scratchSunPosition = new Vector3()

  /** 世界會無限往 -Y 延伸，任由陰影自動框住所有投影者會讓陰影貼圖攤到整條峽谷而糊掉。
   * 改成固定大小的正交框、每幀跟著鏡頭走，解析度才守得住
   */
  function setupShadowFrustum() {
    const sunLight = lighting.sunLight
    sunLight.autoUpdateExtends = false
    sunLight.autoCalcShadowZBounds = false
    sunLight.orthoLeft = -SHADOW_ORTHO_HALF_SIZE
    sunLight.orthoRight = SHADOW_ORTHO_HALF_SIZE
    sunLight.orthoBottom = -SHADOW_ORTHO_HALF_SIZE
    sunLight.orthoTop = SHADOW_ORTHO_HALF_SIZE
    sunLight.shadowMinZ = 4
    sunLight.shadowMaxZ = SHADOW_FOCUS_DISTANCE * 2.4
  }

  function updateShadowFocus(focusX: number, focusY: number) {
    const sunLight = lighting.sunLight
    scratchSunPosition.copyFrom(sunLight.direction)
    scratchSunPosition.scaleInPlace(-SHADOW_FOCUS_DISTANCE)
    sunLight.position.set(
      focusX + scratchSunPosition.x,
      focusY + scratchSunPosition.y,
      scratchSunPosition.z,
    )
  }

  function updateCamera(deltaSeconds: number) {
    const aspectRatio = context.getAspectRatio()

    // 縱向跟著魚往下前瞻；橫向只跟一半，魚貼牆時峽谷另一側仍在畫面裡
    cameraTargetX = damp(cameraTargetX, fishX * CAMERA_X_FOLLOW_RATIO, 4, deltaSeconds)
    cameraTargetY = damp(cameraTargetY, fishY - CAMERA_LOOK_DOWN, 4.5, deltaSeconds)
    camera.target.copyFromFloats(cameraTargetX, cameraTargetY, 0)

    updateShadowFocus(cameraTargetX, cameraTargetY)

    if (Math.abs(aspectRatio - lastAspectRatio) > 0.01) {
      layoutInkGauge()
    }
  }

  // --- 每幀更新 ---
  function refreshColliderList() {
    activeColliderList.length = 0
    activeHazardSpecList.length = 0
    for (const segment of activeCanyonSegmentList) {
      for (const unit of segment.wallUnitList) {
        if (unit.isActive) {
          activeColliderList.push(unit.collider)
        }
      }
      for (const unit of segment.shelfUnitList) {
        if (unit.isActive) {
          activeColliderList.push(unit.collider)
        }
      }
      activeHazardSpecList.push(...segment.chained.hazardList)
    }
    for (const unit of activeCrayonUnitList) {
      activeColliderList.push(unit.collider)
    }
  }

  function stepFish(deltaSeconds: number) {
    // 終端速度隨深度爬升：開場慢慢飄，讓玩家先熟悉畫線
    const fallSpeedLimit = getFallSpeedLimit(FISH_START_Y - fishY)
    if (hasPhysics && fishAggregate) {
      const body = fishAggregate.body
      body.getLinearVelocityToRef(scratchVelocity)
      applyFallLimit(deltaSeconds, fallSpeedLimit)
      body.setLinearVelocity(scratchVelocity)

      fishX = fishBallMesh.position.x
      fishY = fishBallMesh.position.y
      fishVelocityX = scratchVelocity.x
      fishVelocityY = scratchVelocity.y
      return
    }

    stepFallbackFish(fallbackBody, activeColliderList, {
      deltaSeconds,
      gravityY: FISH_GRAVITY_Y,
      maxFallSpeed: fallSpeedLimit,
      horizontalDamping: FISH_HORIZONTAL_DAMPING,
      maxSpeed: FISH_MAX_SPEED,
      restitution: FISH_RESTITUTION,
      tangentRetention: FISH_TANGENT_RETENTION,
    })
    fishX = fallbackBody.x
    fishY = fallbackBody.y
    fishVelocityX = fallbackBody.velocityX
    fishVelocityY = fallbackBody.velocityY
    fishBallMesh.position.set(fishX, fishY, 0)
  }

  function updateFishVisual(deltaSeconds: number) {
    fishTiltNode.position.set(fishX, fishY, 0)
    // 燈略高於魚：光圈中心落在魚的前上方，往下潛的路才在光圈的亮邊上
    diveLight.position.set(fishX, fishY + DIVE_LIGHT_LIFT, DIVE_LIGHT_Z)

    // 面向跟著橫向速度走，帶遲滯才不會原地左右狂翻
    if (fishVelocityX > FISH_HEADING_SWITCH_SPEED) {
      fishHeading = 1
    }
    else if (fishVelocityX < -FISH_HEADING_SWITCH_SPEED) {
      fishHeading = -1
    }
    fishYaw = damp(fishYaw, fishHeading * Math.PI / 2, 6, deltaSeconds)
    codModel.rootNode.rotation.y = fishYaw

    // 俯衝角：往下潛越快頭壓得越低；面向左時鏡像
    const speed = Math.hypot(fishVelocityX, fishVelocityY)
    const targetTilt = speed > 0.6
      ? fishHeading * clamp(
        Math.atan2(fishVelocityY, Math.max(Math.abs(fishVelocityX), 0.6)),
        -FISH_DIVE_TILT_LIMIT,
        FISH_RISE_TILT_LIMIT,
      )
      : 0
    fishTilt = damp(fishTilt, targetTilt, 9, deltaSeconds)
    fishTiltNode.rotation.z = fishTilt

    codModel.update({
      deltaSeconds,
      isMoving: speed > 1.5,
      gazeTarget: null,
    })
  }

  function updateHazardVisual(deltaSeconds: number) {
    for (const segment of activeCanyonSegmentList) {
      for (const unit of segment.hazardUnitList) {
        if (unit.form === 'urchin') {
          // 轉速帶緩慢波動：等速自轉是馬達，忽快忽慢才像被水流推著轉
          const spinScale = 1 + sampleOrganicSway(elapsedSeconds * 0.4, unit.spinPhase) * 0.25
          unit.urchinMesh.rotation.z += unit.spinSpeed * spinScale * deltaSeconds
        }
      }
    }
  }

  function start() {
    // 側視取景：alpha = -π/2 讓相機落在 -Z、看向 +Z，beta 只留一點俯角保住立體感
    camera.alpha = -Math.PI / 2
    camera.beta = Math.PI / 2 - 0.07
    camera.radius = CAMERA_RADIUS

    for (let index = 0; index < WALL_POOL_SIZE; index++) {
      // 池子對半分給左右牆：一段峽谷各用一面，兩側的形狀庫互不重疊
      wallUnitPool.push(createWallUnit(index, index % 2 === 0 ? -1 : 1))
    }
    for (let index = 0; index < SHELF_POOL_SIZE; index++) {
      shelfUnitPool.push(createShelfUnit(index))
    }
    for (let index = 0; index < HAZARD_POOL_SIZE; index++) {
      hazardUnitPool.push(createHazardUnit(index))
    }
    for (let index = 0; index < CRAYON_POOL_SIZE; index++) {
      crayonUnitPool.push(createCrayonUnit(index))
    }

    buildInkGauge()
    layoutInkGauge()
    // update() 要等說明卡關閉才會跑，這裡先擺一次滿量姿勢，
    // 不然說明卡背後的第一幀預覽會看到蠟筆停在建構時的原始位置，跟底板對不齊
    updateInkGauge()

    // 箱庭燈組本身就是半球光＋主光＋補光＋反彈光四盞，加上潛水燈剛好超過
    // StandardMaterial 預設的同時光源上限 4——不拉高的話，第五盞會被靜靜擠掉，
    // 潛水燈等於沒開。材質全部建好之後統一設定，池單元與魚的材質才都吃得到
    for (const material of scene.materials) {
      if ('maxSimultaneousLights' in material) {
        (material as StandardMaterial).maxSimultaneousLights = 6
      }
    }

    buildCanyonBelow(FISH_START_Y)
    placeFishAt(0, FISH_START_Y)
    camera.target.copyFromFloats(cameraTargetX, cameraTargetY, 0)

    if (hasPhysics) {
      enableFishPhysics()
    }

    setupShadowFrustum()
    updateShadowFocus(cameraTargetX, cameraTargetY)
    // 只投影魚與層架主體。蠟筆線與刺這類薄小件在跟著鏡頭走的陰影框裡
    // 會因貼圖取樣游移而閃爍，而且畫面上一堆細碎陰影只會顯得髒
    lighting.addShadowCaster(...codModel.meshList)
    for (const unit of shelfUnitPool) {
      lighting.addShadowCaster(unit.mesh)
    }

    context.reportScore(0)
  }

  function update(deltaSeconds: number) {
    if (isDisposed || isGameOver) {
      return
    }
    // host 在說明卡關閉前不會呼叫 update()，這裡第一次跑到就代表玩家已經開始
    if (!hasReleasedGravity) {
      hasReleasedGravity = true
      fishAggregate?.body.setGravityFactor(1)
    }
    elapsedSeconds += deltaSeconds

    buildCanyonBelow(fishY)
    recycleCanyonAbove(fishY + TERRAIN_RECYCLE_ABOVE)
    recycleCrayonAbove(fishY + TERRAIN_RECYCLE_ABOVE)
    refreshColliderList()

    stepFish(deltaSeconds)
    ink.refill(deltaSeconds)

    updateCamera(deltaSeconds)
    updateFishVisual(deltaSeconds)
    updateHazardVisual(deltaSeconds)
    updateInkGauge()

    // 致命判定在運動之後：用的是本幀最終位置，兩條物理路徑口徑一致
    const hitHazard = findHazardContact(
      { x: fishX, y: fishY, radius: FISH_RADIUS },
      activeHazardSpecList,
    )
    if (hitHazard) {
      isGameOver = true
      // 講清楚死因：沒有這句，玩家會以為是判定出錯
      context.reportToast(hitHazard.kind === 'urchin' ? '撞到海膽了！(╥ω╥`)' : '撞到牆刺了！(╥ω╥`)')
      context.reportGameOver()
      return
    }

    if (nearMissWatcher.update({
      fishX,
      fishY,
      fishRadius: FISH_RADIUS,
      hazardList: activeHazardSpecList,
    })) {
      context.reportToast('好險！Σ(ˊДˋ;)')
    }

    const frame = depthTracker.update({
      deltaSeconds,
      fishY,
      hasRecentInput: elapsedSeconds - lastPointerSeconds < 1.5,
    })

    // 卡住先警告再判死：停滯導致的結束若無預告，玩家會誤以為是碰撞誤判
    if (frame.stallSeconds < 0.1) {
      stallWarningShown = false
    }
    else if (frame.stallSeconds >= STALL_WARNING_SECONDS && !stallWarningShown) {
      stallWarningShown = true
      context.reportToast('卡住了！畫條斜坡讓魚滑走')
    }

    if (frame.hasScoreChanged) {
      const milestone = findCrossedMilestone(lastReportedScore, frame.score, TOAST_MILESTONE_STEP)
      lastReportedScore = frame.score
      context.reportScore(frame.score)
      if (milestone !== null) {
        context.reportToast(`下潛 ${milestone} 公尺！=͟͟͞͞( •̀д•́)`)
      }
    }

    if (frame.endReason) {
      isGameOver = true
      context.reportToast('卡住太久了…( ´•̥̥̥ ω •̥̥̥` )')
      context.reportGameOver()
    }
  }

  function handlePointer(event: GamePointerEvent) {
    if (isDisposed || isGameOver) {
      return
    }
    lastPointerSeconds = elapsedSeconds
    if (event.type === 'down') {
      pointerDownXRatio = event.xRatio
      pointerDownYRatio = event.yRatio
      pointerDownSeconds = elapsedSeconds
      hasPointerDragged = false
      beginStroke(event)
    }
    else if (event.type === 'move') {
      if (
        Math.hypot(event.xRatio - pointerDownXRatio, event.yRatio - pointerDownYRatio)
        > ERASE_TAP_MOVE_TOLERANCE
      ) {
        hasPointerDragged = true
      }
      extendStroke(event)
    }
    else {
      // 快速點一下（沒拖曳）不是畫線，是擦掉點到的那筆
      if (
        event.type === 'up'
        && !hasPointerDragged
        && elapsedSeconds - pointerDownSeconds <= ERASE_TAP_MAX_SECONDS
      ) {
        eraseStrokeAt(event)
      }
      finishStroke()
    }
  }

  return {
    start,
    update,
    handlePointer,
    resize() {
      layoutInkGauge()
    },
    dispose() {
      // 網格、材質與物理剛體都掛在 host 的 Scene 上，由 scene.dispose() 統一收；
      // 這裡只需擋掉銷毀後仍可能進來的指標事件與更新
      isDisposed = true
      isDrawing = false
    },
  }
}
