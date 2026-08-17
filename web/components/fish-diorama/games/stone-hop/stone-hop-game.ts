/** 靈感溯源：按住蓄力、放開起跳，沿著無盡的溪流往上游。
 *
 * 場景層只負責「把邏輯層算出來的數字畫出來」：石陣生成、蓄力曲線、落點評價、
 * 荷葉下沉與浮木漂移全在 stone-hop-logic.ts，這裡處理建模、取景與演出。
 *
 * 座標慣例：溪流沿 +Z 往上游延伸，水面為 y = 0，落腳點頂面在 PLATFORM_TOP_Y。
 */
import type { Scene } from '@babylonjs/core/scene'
import type { MiniGameFactory, MiniGameInstance } from '../game-contract'
import type { HopArc, LandingGrade, PlatformKind, PlatformSpec } from './stone-hop-logic'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Plane } from '@babylonjs/core/Maths/math.plane'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { COD_LYING_LIFT, createCodModel } from '../../cod-model'
import { applyHeightGradient, createBeveledBox } from '../../geometry-utils'
import {
  clampRatio,
  computeDecayingWobble,
  easeInCubic,
  easeOutCubic,
  easeOutExpo,
  sampleOrganicSway,
} from '../../shared/easing'
import { LOW_POLY_PALETTE } from '../../shared/low-poly-palette'
import {
  applyInstanceVariation,
  applyVertexJitter,
  createClusteredAngleList,
  createSeedFrom,
  finishLowPolyMesh,
} from '../../shared/mesh-detail'
import { clamp, createRandomGenerator, damp, randomBetween } from '../../shared/random-generator'
import {
  advanceChargePower,
  appendPlatform,
  createHopArc,
  createSquashSpring,
  evaluateLandingGrade,
  getCrouchSquashTarget,
  getHopDistance,
  getLilyPadSinkDepth,
  getMossSlideOffset,
  getNextCombo,
  getPlatformCenterX,
  hasLandedOnPlatform,
  INITIAL_CHARGE_STATE,
  isLilyPadSunk,
  LANDING_IMPULSE,
  MAX_HOP_DISTANCE,
  sampleHopArc,
  START_PLATFORM,
  STRETCH_IMPULSE,
} from './stone-hop-logic'
import { attachUnderwaterShadowRipple, attachWaterRipple, setWaterRippleTime } from './water-ripple-plugin'

// --- low poly箱庭配色 ---
const PAPER_WHITE = LOW_POLY_PALETTE.bone
/** 水底的沙。刻意不用岸上那階飽和的暖沙（`soilLight`）：
 * 沙床整片是水色最大的混色對象，暖黃透過半透明的藍就是綠——水面偏綠的真正來源。
 * 往骨白退四分之三，讀起來仍是淺沙、彩度卻低到不會把水拉綠；
 * 泡在水裡的沉積物本來就會褪色，這個偏移同時也是對的
 */
const SAND_COLOR = Color3.Lerp(
  Color3.FromHexString(LOW_POLY_PALETTE.soilLight),
  Color3.FromHexString(LOW_POLY_PALETTE.bone),
  0.75,
).toHexString()
const MOSS_GREEN = LOW_POLY_PALETTE.leaf
/** 水色：深潭與中階水藍的中間值。
 *
 * 水面偏綠的成因不在這個色票本身，而在半透明的藍疊在暖沙床上——藍加黃就是綠，
 * 水色再怎麼換都擰不過底下透上來的沙。所以偏綠是三處一起解：
 * 色票往深潭靠一階（這裡）、沙床退掉彩度（`SAND_COLOR`）、
 * 水面頂點色再往藍偏一手（見 `createWaterSurface`）。
 * 水的透明度刻意留著不動，水底的沙與石頭要看得見
 */
const WATER_BLUE = Color3.Lerp(
  Color3.FromHexString(LOW_POLY_PALETTE.waterDeep),
  Color3.FromHexString(LOW_POLY_PALETTE.water),
  0.45,
).toHexString()
const INK_BLUE = LOW_POLY_PALETTE.ink
const WAX_YELLOW = LOW_POLY_PALETTE.gold
const STONE_GRAY = '#9a958b'
/** 苔石本體：比苔斑更深更濕，一整顆綠得下去 */
const DEEP_MOSS = '#5f8159'
/** 削開的木頭：大鉛筆筆尖那截露出來的木色，比漆面亮才讀得出是削出來的 */
const WHITTLED_WOOD = '#d9b184'
const LILY_GREEN = '#8fb464'
const LILY_STEM = '#6d8f4c'

// --- 寫作主題小件的配色 ---
/** 這款是從箱庭的打字機走進來的，岸邊的文具與空中的稿紙是那條敘事線的延伸。
 * 用色一律比落腳點低對比，也避開預測環那種會發光的亮黃，
 * 玩家的注意力要留給「下一顆踩哪裡」
 */
const INK_GLASS = LOW_POLY_PALETTE.inkDeep
const INK_LINE = LOW_POLY_PALETTE.ink
const CORK_TAN = LOW_POLY_PALETTE.woodLight
/** 鉛筆漆面以暗焦橘為主，亮黃只有少數幾支，不與預測環搶眼 */
const PENCIL_PAINT = LOW_POLY_PALETTE.goldDeep
const PENCIL_PAINT_LIGHT = LOW_POLY_PALETTE.gold
const PENCIL_WOOD = LOW_POLY_PALETTE.wood
const PAPER_SHEET = LOW_POLY_PALETTE.bone
const PAPER_SHEET_LIGHT = LOW_POLY_PALETTE.boneLight
/** 大鉛筆的金屬箍：偏冷的藍灰，與暖灰的溪石拉開，一眼認得出是金屬 */
const FERRULE_METAL = LOW_POLY_PALETTE.stoneLight
/** 橡皮擦。整支筆唯一的暖紅，尾端因此有個記憶點 */
const ERASER_CORAL = LOW_POLY_PALETTE.coral
/** 壓住稿紙的小石：冷灰壓在骨白的紙上才有明度差 */
const PAPER_WEIGHT_STONE = LOW_POLY_PALETTE.stone

// --- 尺度 ---
const FISH_SCALE = 0.6
/** 鱈魚側躺，繞長軸轉 90° 才是站姿。與箱庭同一套姿態組裝方式 */
const LYING_ROLL = -Math.PI / 2
/** 落腳點頂面高度，全部落腳點一致，跳躍弧線才不必逐顆補正 */
const PLATFORM_TOP_Y = 0.24
/** 落腳點的建模原點就是「站得住的那個面」，根節點直接擺在 PLATFORM_TOP_Y。
 * 水面因此落在本地座標的這個高度，濕痕以它為基準
 */
const WATERLINE_LOCAL_Y = -PLATFORM_TOP_Y
const STREAM_BED_Y = -1.3

// --- 水面網格 ---
const WATER_CELL_SIZE = 2.2
const WATER_COLUMN_COUNT = 8
const WATER_ROW_COUNT = 30
const WATER_HALF_WIDTH = (WATER_COLUMN_COUNT * WATER_CELL_SIZE) / 2
/** 碎浪白點：沿溪散落的碎片，跟著波形起伏並在身後回收再往前放 */
const FOAM_FLECK_COUNT = 18
const FOAM_SPAN = 44
const FOAM_BEHIND_MARGIN = 12

// --- 落腳點物件池 ---
/** 相機看得到的範圍：身後留兩顆當視覺參照，身前八顆供玩家預判路線。
 * 池子大小直接由這兩個數決定，往前再多也只是白養網格
 */
const VISIBLE_BEHIND_COUNT = 2
const VISIBLE_AHEAD_COUNT = 8
const PLATFORM_POOL_SIZE = VISIBLE_BEHIND_COUNT + 1 + VISIBLE_AHEAD_COUNT
/** 落腳點建模的基準半徑，實際半徑靠縮放貼合 */
const PLATFORM_BASE_RADIUS = 1

// --- 兩岸 ---
const BANK_CHUNK_PER_SIDE = 10
const BANK_CHUNK_SPACING = 6
const BANK_SPAN = BANK_CHUNK_PER_SIDE * BANK_CHUNK_SPACING
const BANK_BEHIND_MARGIN = 20

// --- 岸邊寫作靜物 ---
/** 溪邊散落著寫到一半的東西：墨水瓶、鉛筆、一小疊稿紙。
 *
 * 三種造型共用同一條紅線——**只擺在陸地上，且尺寸不到落腳點的四分之一**。
 * 荷葉已經教會玩家「水面上的扁平物可以踩」，水裡再放任何一片紙都是會摔死人的誤讀，
 * 所以連溪心兩側的淺灘都不放
 */
/** 靜物落在岸地的平均高度上。岸地本身帶 ±0.05 的起伏，
 * 寧可略埋也不要浮起來——小件浮空比陷進土裡難看得多
 */
const WRITING_PROP_GROUND_Y = -0.13
/** 靜物離溪心的距離：橫式的可見半寬在目標平面上約 8.8，
 * 擺到 WATER_HALF_WIDTH + 1.8 就整批掉到畫框外了，所以一路貼到水邊。
 * 跳躍走廊最寬也只到 |x| ≈ 4.6，兩者之間仍隔著一整條溪
 */
const WRITING_PROP_MIN_ABS_X = WATER_HALF_WIDTH + 0.1
const WRITING_PROP_MAX_ABS_X = WATER_HALF_WIDTH + 0.9
/** 稿紙疊攤開的面積最大，最容易踩進淺灘，另外多退這半步。
 * 「水裡一片紙都不放」那條紅線得靠這個補回來——貼水邊的是瓶子與筆，不是紙
 */
const PAPER_STACK_EXTRA_ABS_X = 0.55
/** 整體放大倍率。原本鉛筆全長才 0.73，在 13.5 的取景半徑下小到讀不出形狀；
 * 放大後最寬的稿紙疊也還不到落腳點的三分之一
 */
const WRITING_PROP_SCALE = 1.6
/** 同一叢內的前後散開量。放大後件與件更容易疊在一起，散開量跟著加大，
 * 但仍待在岩壁（每 6 單位一塊）之間的空檔裡
 */
const WRITING_PROP_CLUSTER_SPREAD = 1

// --- 空中飄頁 ---
/** 稿紙順流而去、魚逆流而上，兩個相反的方向是這款的主題對比。
 *
 * 直式取景只看得到 |x| ≤ 3 的溪心，飄頁要讀得出來就得長在玩家真的在看的地方：
 * 高度壓到剛好在跳躍弧頂之上、橫向收進溪心上方，
 * 但讓開正中那條落點主道——玩家唯一要判斷的東西不能被糊掉
 */
const DRIFTING_PAGE_COUNT = 10
/** 跳躍弧頂為 PLATFORM_TOP_Y + HOP_MAX_HEIGHT ≈ 2.74，
 * 減去搖曳振幅後最低仍有 3.0，淨空看得出來也讀得出「紙在頭上飄」
 */
const DRIFTING_PAGE_MIN_Y = 3.3
const DRIFTING_PAGE_MAX_Y = 4.4
/** 上下浮沉的振幅。與最低高度一起決定淨空，兩個數要一起改 */
const DRIFTING_PAGE_SWAY_HEIGHT = 0.3
/** 橫向散布：內緣讓開落點主道，外緣收到直式（可見半寬約 3）也還看得到的範圍 */
const DRIFTING_PAGE_MIN_ABS_X = 1.2
const DRIFTING_PAGE_MAX_ABS_X = 4.2
/** 單張的長邊尺寸範圍。各張不同，十張才不像同一批印出來的 */
const DRIFTING_PAGE_MIN_WIDTH = 0.55
const DRIFTING_PAGE_MAX_WIDTH = 0.85
/** 順流速度（往 -Z）。比魚推進得慢，紙頁才是飄過去而不是射過去 */
const DRIFTING_PAGE_MIN_SPEED = 1
const DRIFTING_PAGE_MAX_SPEED = 1.8
/** 生成距離貼著取景前緣。全丟到遠方等於整批都在畫面外飄 */
const DRIFTING_PAGE_AHEAD_MIN = 10
const DRIFTING_PAGE_AHEAD_MAX = 22
const DRIFTING_PAGE_BEHIND_MARGIN = 12

// --- 起點的打字機 ---
/** 這款是從箱庭的打字機互動點進來的，起點對岸擺一台當「故事從這裡開始」的錨點。
 * 只有一台、不回收，往上游跑遠了就留在身後，正好是起點的記號。
 * 擺在遠岸——相機在近岸側的斜後方，遠岸的東西只會出現在背景，不擋前路
 */
/** 放大後外接半徑約 0.78，水面外緣在 8.8，兩者相加就是這台能站的最內側。
 * 再往內就會有一角泡進淺灘，那是岸邊靜物一律不碰的線
 */
const TYPEWRITER_POSITION_X = -9.58
const TYPEWRITER_POSITION_Z = 1.2
/** 放大倍率。原尺寸在 13.5 的取景半徑下只剩一小塊剪影，認不出是打字機 */
const TYPEWRITER_SCALE = 1.5

// --- 相機 ---
/** 橫式俯角 55°、直式拉到 66°：直式畫面窄，俯角拉高才塞得下前方的石陣 */
const LANDSCAPE_BETA = Math.PI / 2 - 0.96
const PORTRAIT_BETA = Math.PI / 2 - 1.15
const LANDSCAPE_RADIUS = 13.5
const PORTRAIT_RADIUS = 16.5
/** 略偏一側的斜後方視角，正後方會被魚身擋住前路 */
const CAMERA_ALPHA = -Math.PI / 2 + 0.3
/** 相機看向魚的前方一點，玩家視線自然落在下一顆石頭 */
const CAMERA_LOOK_AHEAD = 2.4
const CAMERA_FOLLOW_RATE = 5
/** 蓄力時推近的最大量，張力靠鏡頭壓迫感 */
const CHARGE_ZOOM_IN = 1.6

// --- 水花 ---
const SPLASH_POOL_SIZE = 18
const SPLASH_GRAVITY = 14
/** 水珠壽命逐顆隨機，同一批才不會排練好似地同時消失 */
const SPLASH_LIFETIME_MIN = 0.45
const SPLASH_LIFETIME_MAX = 0.85
/** 每批水花的前幾顆當主水珠：更大、更久、噴更高，畫面才有主從。
 * 總顆數壓到個位數後只留一顆——兩顆主角在四五顆裡就佔一半，反而分不出主從
 */
const SPLASH_MAIN_DROPLET_COUNT = 1
/** 入水漣漪：落水時一次性往外擴的圓環 */
const SPLASH_RIPPLE_POOL_SIZE = 4
const SPLASH_RIPPLE_LIFETIME = 0.6

// --- 演出 ---
/** 踉蹌搖晃時長（踩到邊緣） */
const STUMBLE_DURATION = 0.5
/** 落水到回報結束的緩衝，讓玩家看清楚自己怎麼掉下去的 */
const FALL_REPORT_DELAY = 0.95
const FALL_GRAVITY = 12
/** 落地入水瞬間的翻滾角速度，之後被水拖住逐漸失速 */
const FALL_ROLL_SPEED = 7
/** 落地鏡頭下沉回彈：時間極短、振幅極小，只補重量感。
 * 不做 hitstop——落地太頻繁，停格會讀成卡頓
 */
const LANDING_DIP_DURATION = 0.22
const LANDING_DIP_DEPTH = 0.09

type GamePhase = 'ready' | 'charging' | 'hopping' | 'falling'

interface PlatformView {
  rootNode: TransformNode;
  /** 各型別的外觀節點，依 kind 切換顯示，避免逐幀重建幾何 */
  kindNodeMap: Record<PlatformKind, TransformNode>;
  /** 目前綁定的落腳點序號，-1 為未綁定 */
  boundIndex: number;
}

interface SplashFlake {
  mesh: Mesh;
  /** 噴發原點。水平位移是從這裡用 easeOutExpo 推出去的，不是逐幀積分速度 */
  originX: number;
  originZ: number;
  /** 散射方向（單位向量）與這一顆的最終水平距離 */
  directionX: number;
  directionZ: number;
  spreadDistance: number;
  /** 垂直仍走真實拋物線：重力積分的弧線比曲線硬湊的好看 */
  velocityY: number;
  elapsed: number;
  /** 壽命逐顆隨機，主水珠比碎沫活得久 */
  lifetime: number;
  /** 出生時的大小，縮小曲線以此為基準 */
  baseScale: number;
  isActive: boolean;
}

interface SplashRipple {
  mesh: Mesh;
  elapsed: number;
  /** 擴張終點大小，隨入水強度變化 */
  baseScale: number;
  isActive: boolean;
}

interface WaterSurface {
  mesh: Mesh;
  update: (timeSeconds: number, centerZ: number) => void;
}

type WritingPropKind = 'inkBottle' | 'pencil' | 'paperStack'

interface WritingPropClusterSpec {
  /** -1 為左岸、1 為右岸 */
  side: number;
  /** 這一叢的成員。兩岸的組成與件數刻意不同，不做鏡像 */
  kindList: WritingPropKind[];
  /** 沿溪位置。刻意擠成兩處群聚再留一段長空白，而不是沿岸均勻散布；
   * 數值一律落在岩壁（每 6 單位一塊）的正中間空檔，靜物才不會插進岩板裡
   */
  centerZ: number;
}

/** 整條溪一共七件，靠回收沿岸重複出現。再多就從「有人在這裡寫東西」
 * 變成雜物堆，主角是溪石不是文具。
 * 左岸四件分兩叢再加一個孤點、右岸三件擠成一處，兩岸不對稱也不等量
 */
const WRITING_PROP_CLUSTER_LIST: WritingPropClusterSpec[] = [
  { side: -1, kindList: ['inkBottle', 'paperStack'], centerZ: -11 },
  { side: -1, kindList: ['pencil'], centerZ: -5 },
  { side: 1, kindList: ['pencil', 'inkBottle'], centerZ: 13 },
  { side: 1, kindList: ['paperStack'], centerZ: 19 },
  { side: -1, kindList: ['paperStack'], centerZ: 25 },
]

interface DriftingPage {
  mesh: Mesh;
  /** 順流速度，各張不同，十張才不會排成一列前進 */
  driftSpeedZ: number;
  driftSpeedX: number;
  swaySpeed: number;
  /** 各自的搖曳相位，翻面時機因此完全錯開 */
  swayPhase: number;
  baseY: number;
  baseYaw: number;
}

/** 水面波形。以世界座標取樣，水面網格跟著魚捲動時波紋不會跟著滑動；
 * 三組不同頻率與方向的正弦疊加，讀起來才像水而不是規律的布料。
 *
 * 調性是平靜的湖面：振幅壓到剛好讀得出水面在起伏、時間跑得慢，
 * 不做激流那種明顯的推進感。倒影與水下陰影的抖動另外由
 * water-ripple-plugin 在像素上做（幾何再怎麼起伏都擰不動那兩者，見該檔說明）
 */
function getWaveHeight(worldX: number, worldZ: number, timeSeconds: number): number {
  return 0.055 * Math.sin(worldX * 0.55 + timeSeconds * 0.85)
    + 0.04 * Math.sin(worldZ * 0.42 + timeSeconds * 1.15)
    + 0.03 * Math.sin((worldX + worldZ) * 0.31 + timeSeconds * 0.6)
    // 高頻細波：低頻大浪只會讓整片水面一起上下，切面之間的明暗差要靠這兩層撐出來
    + 0.016 * Math.sin(worldX * 1.7 - timeSeconds * 1.8)
    + 0.012 * Math.sin(worldZ * 2.1 + timeSeconds * 1.45)
}

/** 半透明流動水面。每格拆成兩個不共用頂點的三角形，flat shading 天生成立，
 * 逐幀只改 y 再重算法線即可產生低多邊的波光
 */
function createWaterSurface(scene: Scene, material: StandardMaterial): WaterSurface {
  const positionList: number[] = []
  const indexList: number[] = []
  const colorList: number[] = []
  const halfDepth = (WATER_ROW_COUNT * WATER_CELL_SIZE) / 2

  for (let column = 0; column < WATER_COLUMN_COUNT; column++) {
    for (let row = 0; row < WATER_ROW_COUNT; row++) {
      const minX = -WATER_HALF_WIDTH + column * WATER_CELL_SIZE
      const maxX = minX + WATER_CELL_SIZE
      const minZ = -halfDepth + row * WATER_CELL_SIZE
      const maxZ = minZ + WATER_CELL_SIZE
      // 繞向 (minX,minZ) → (maxX,minZ) → (maxX,maxZ) 讓法線朝上（Babylon 左手座標系）
      const cornerList: [number, number][] = [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
      ]
      for (const [x, z] of cornerList) {
        indexList.push(positionList.length / 3)
        positionList.push(x, 0, z)
        // 越靠岸越淺越亮，中央深槽偏暗，純色水面才有深淺層次。
        // 三個通道不等比：頂點色順便當偏色濾鏡把水往藍推，
        // 抵掉水底暖沙透上來的黃（藍加黃就是綠，那正是水面看起來偏綠的來源）
        const shallowRatio = clamp(Math.abs(x) / WATER_HALF_WIDTH, 0, 1)
        const shade = 0.82 + 0.24 * shallowRatio
        colorList.push(shade * 0.88, shade * 0.96, Math.min(1, shade * 1.12), 1)
      }
    }
  }

  const mesh = new Mesh('stoneHopWater', scene)
  const vertexData = new VertexData()
  const normalList: number[] = []
  VertexData.ComputeNormals(positionList, indexList, normalList)
  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.normals = normalList
  vertexData.colors = colorList
  vertexData.applyToMesh(mesh, true)
  mesh.material = material
  mesh.isPickable = false

  const positionBuffer = Float32Array.from(positionList)
  const normalBuffer = new Float32Array(normalList.length)
  const vertexCount = positionBuffer.length / 3

  return {
    mesh,
    update(timeSeconds, centerZ) {
      // 以整格對齊捲動，網格接縫永遠落在同一個波相位上，看不出跳動
      const offsetZ = Math.round(centerZ / WATER_CELL_SIZE) * WATER_CELL_SIZE
      mesh.position.z = offsetZ
      for (let index = 0; index < vertexCount; index++) {
        const worldX = positionBuffer[index * 3] ?? 0
        const worldZ = (positionBuffer[index * 3 + 2] ?? 0) + offsetZ
        positionBuffer[index * 3 + 1] = getWaveHeight(worldX, worldZ, timeSeconds)
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, positionBuffer)
      VertexData.ComputeNormals(positionBuffer, indexList, normalBuffer)
      mesh.updateVerticesData(VertexBuffer.NormalKind, normalBuffer)
    },
  }
}

interface SolidRingSpec {
  /** 環心高度 */
  y: number;
  /** 各角度的半徑，長度須與同一顆立體的其他環一致 */
  radiusList: number[];
  /** 各角度的額外高度偏移。頂面要「平得站得住又有起伏」就靠這個 */
  yOffsetList?: number[];
}

/** 輪廓頂點方位的不等分參數。半徑再怎麼亂，
 * 方位等分照樣讀得出正多邊形骨架——那是「塑膠積木感」的另一半來源
 */
interface RingAngleOptions {
  /** 同種子同輪廓，與半徑清單共用種子即可 */
  seed: number;
  /** 間隔不均勻度，0 = 等分 */
  unevenness?: number;
  /** 輪廓一側留白缺口的比例 */
  gapRatio?: number;
}

/** 由上而下數個環堆成的封閉立體，是四種落腳點共用的骨架。
 *
 * 相鄰環的半徑各自獨立，側面才會崩出稜角而不是規則錐台；
 * 頂點方位依種子不等分，且各環共用同一組角度，側壁才接得起來——
 * 不等分只重排方位，半徑範圍仍由各自的不規則半徑清單決定，
 * 落腳判定的視覺對應不因此縮水。
 * 三角繞向沿用 Babylon 左手座標系的順時針正面規則（與 createBeveledBox 同一套）。
 */
function createRingedSolidMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  ringList: SolidRingSpec[],
  topCenterY: number,
  bottomCenterY: number,
  angleOptions: RingAngleOptions,
): Mesh {
  const sideCount = ringList[0]?.radiusList.length ?? 3
  const angleList = createClusteredAngleList({
    seed: angleOptions.seed,
    count: sideCount,
    unevenness: angleOptions.unevenness ?? 0.35,
    gapRatio: angleOptions.gapRatio ?? 0,
  })
  const positionList: number[] = []
  const indexList: number[] = []

  function pushVertex(x: number, y: number, z: number): number {
    const vertexIndex = positionList.length / 3
    positionList.push(x, y, z)
    return vertexIndex
  }

  const ringVertexList = ringList.map((ring) => {
    const rowList: number[] = []
    for (let side = 0; side < sideCount; side++) {
      const angle = angleList[side] ?? (side / sideCount) * Math.PI * 2
      const radius = ring.radiusList[side] ?? 1
      rowList.push(pushVertex(
        Math.sin(angle) * radius,
        ring.y + (ring.yOffsetList?.[side] ?? 0),
        Math.cos(angle) * radius,
      ))
    }
    return rowList
  })

  for (let ringIndex = 0; ringIndex < ringVertexList.length - 1; ringIndex++) {
    const upperRow = ringVertexList[ringIndex]!
    const lowerRow = ringVertexList[ringIndex + 1]!
    for (let side = 0; side < sideCount; side++) {
      const nextSide = (side + 1) % sideCount
      indexList.push(upperRow[side]!, upperRow[nextSide]!, lowerRow[nextSide]!)
      indexList.push(upperRow[side]!, lowerRow[nextSide]!, lowerRow[side]!)
    }
  }

  const topRow = ringVertexList[0]!
  const topCenterIndex = pushVertex(0, topCenterY, 0)
  for (let side = 0; side < sideCount; side++) {
    indexList.push(topCenterIndex, topRow[(side + 1) % sideCount]!, topRow[side]!)
  }

  const bottomRow = ringVertexList[ringVertexList.length - 1]!
  const bottomCenterIndex = pushVertex(0, bottomCenterY, 0)
  for (let side = 0; side < sideCount; side++) {
    indexList.push(bottomCenterIndex, bottomRow[side]!, bottomRow[(side + 1) % sideCount]!)
  }

  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
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

/** 一圈各角度互不相同的半徑倍率。正多邊形那種等距輪廓正是「像塑膠積木」的根源 */
function createIrregularRadiusList(
  sideCount: number,
  random: () => number,
  minRatio: number,
  maxRatio: number,
): number[] {
  const ratioList: number[] = []
  for (let side = 0; side < sideCount; side++) {
    ratioList.push(randomBetween(random, minRatio, maxRatio))
  }
  return ratioList
}

/** 水線以下壓暗偏冷。少了這道濕痕，落腳點看起來會像懸在水面上的模型而不是插在水裡 */
function applyWaterlineShading(mesh: Mesh, waterY: number, bandHeight: number) {
  const positionList = mesh.getVerticesData(VertexBuffer.PositionKind)
  const colorList = mesh.getVerticesData(VertexBuffer.ColorKind)
  if (!positionList || !colorList) {
    return
  }
  for (let colorIndex = 0; colorIndex < colorList.length; colorIndex += 4) {
    const y = positionList[(colorIndex / 4) * 3 + 1] ?? 0
    const wetRatio = clamp((waterY + bandHeight - y) / bandHeight, 0, 1)
    const shade = 1 - 0.36 * wetRatio
    colorList[colorIndex] = (colorList[colorIndex] ?? 1) * shade * 0.95
    colorList[colorIndex + 1] = (colorList[colorIndex + 1] ?? 1) * shade
    colorList[colorIndex + 2] = Math.min(1, (colorList[colorIndex + 2] ?? 1) * shade * 1.12)
  }
  mesh.updateVerticesData(VertexBuffer.ColorKind, colorList)
}

/** 合併前把各零件的頂點屬性補成同一組。
 *
 * MergeMeshes 要求所有來源具備完全相同的屬性集合，否則直接拋錯。
 * 零件混了兩種來源：createRingedSolidMesh / createBeveledBox 是手刻 VertexData
 * （有頂點色、沒有 UV），CreateCylinder 這類內建產生器則相反。
 * 缺什麼補什麼，補的值都是中性的，不會改變外觀——
 * 頂點色補白（相乘後等於原色）、UV 補零（材質是平塗不取樣）。
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

/** 把同材質的零件併成一顆網格。
 * 落腳點有 11 份實例，苔絮、殘枝、苔斑不合併的話光是石陣就上百個 draw call
 */
function mergePartList(name: string, partList: Mesh[]): Mesh {
  normalizeMergeAttributeList(partList)
  const merged = Mesh.MergeMeshes(partList, true, true)
  if (!merged) {
    return partList[0]!
  }
  merged.name = name
  merged.isPickable = false
  return merged
}

// --- 溪石 ---
const STONE_SIDE_COUNT = 9
const STONE_BODY_HEIGHT = 1.62

/** 不規則溪石：頂面高低起伏、水線處鼓出一圈、側面兩段各自崩開，底部收窄埋進溪床。
 * 同一顆種子永遠長出同一塊石頭
 */
function createStreamStoneMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  seed: number,
): Mesh {
  const random = createRandomGenerator(seed)
  const topRatioList = createIrregularRadiusList(STONE_SIDE_COUNT, random, 0.9, 1.02)
  // 各環半徑獨立浮動，側面才會出現一段內凹一段外凸的崩裂感
  const waistRatioList = topRatioList.map((ratio) => ratio * randomBetween(random, 1, 1.08))
  const bellyRatioList = topRatioList.map((ratio) => ratio * randomBetween(random, 0.8, 1.04))
  const footRatioList = topRatioList.map((ratio) => ratio * randomBetween(random, 0.48, 0.72))
  const topOffsetList = topRatioList.map(() => randomBetween(random, -0.015, 0.012))

  const mesh = createRingedSolidMesh(
    name,
    scene,
    material,
    [
      { y: 0, radiusList: topRatioList.map((ratio) => ratio * PLATFORM_BASE_RADIUS), yOffsetList: topOffsetList },
      { y: WATERLINE_LOCAL_Y, radiusList: waistRatioList.map((ratio) => ratio * PLATFORM_BASE_RADIUS) },
      { y: -STONE_BODY_HEIGHT * 0.55, radiusList: bellyRatioList.map((ratio) => ratio * PLATFORM_BASE_RADIUS) },
      { y: -STONE_BODY_HEIGHT, radiusList: footRatioList.map((ratio) => ratio * PLATFORM_BASE_RADIUS) },
    ],
    0.03,
    -STONE_BODY_HEIGHT - 0.08,
    { seed, unevenness: 0.35 },
  )

  // 垂直抖動壓到極小：魚固定站在 PLATFORM_TOP_Y，
  // 頂面起伏加上抖動的最壞情況必須遠小於魚身厚度，否則會懸空或陷進石頭
  finishLowPolyMesh(mesh, {
    seed,
    amount: 0.119,
    axisScale: { y: 0.18 },
    flatBottomBelowY: -STONE_BODY_HEIGHT + 0.04,
    darkenBottom: 0.3,
  })
  applyWaterlineShading(mesh, WATERLINE_LOCAL_Y, 0.34)
  return mesh
}

/** 頂面邊緣的苔綠斑塊。石頭與苔石的差別就靠「零星幾片」與「整顆包覆」拉開 */
function createMossPatchMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  seed: number,
): Mesh {
  const random = createRandomGenerator(seed ^ 0x5BF03635)
  const patchList: Mesh[] = []
  for (let patchIndex = 0; patchIndex < 3; patchIndex++) {
    const patchRadius = randomBetween(random, 0.16, 0.3)
    const rimRatioList = createIrregularRadiusList(5, random, 0.66, 1)
    const patch = createRingedSolidMesh(
      `${name}Part${patchIndex}`,
      scene,
      material,
      [
        { y: 0, radiusList: rimRatioList.map((ratio) => ratio * patchRadius) },
        { y: -0.06, radiusList: rimRatioList.map((ratio) => ratio * patchRadius * 0.78) },
      ],
      0.022,
      -0.08,
      { seed: seed + patchIndex * 977, unevenness: 0.5 },
    )
    finishLowPolyMesh(patch, { seed: seed + patchIndex * 977, amount: 0.051, axisScale: { y: 0.4 } })
    const angle = randomBetween(random, 0, Math.PI * 2)
    const distance = randomBetween(random, 0.44, 0.7)
    patch.position.set(Math.sin(angle) * distance, 0.015, Math.cos(angle) * distance)
    patch.rotation.y = randomBetween(random, 0, Math.PI)
    patchList.push(patch)
  }
  const merged = mergePartList(name, patchList)
  // 這幾塊苔癬是貼在石頭表面的貼花，幾乎與母體共平面。卡通描邊的實作是
  // 放大一圈的背面外殼，貼花描邊會整個溢到石面上變成一圈突兀的深紫邊，
  // 所以標記跳過（見 game-host 的 applySceneCraft）
  merged.metadata = { ...(merged.metadata as object | null), skipOutline: true }
  return merged
}

/** 邊緣垂下的苔絮數。八撮是「毛」與「流蘇」的分界：再少讀得出等距骨架，
 * 再多在這個鏡頭距離下只是把輪廓糊成一圈綠邊
 */
const MOSS_TUFT_COUNT = 8
/** 邊緣立起的短苔芽數。與苔絮方向相反（一個往下垂、一個往上冒），
 * 輪廓上下緣都碎掉才是毛茸茸
 */
const MOSS_SPROUT_COUNT = 7

/** 苔石的厚苔層：蓬鬆的苔蓋、一圈垂下來的苔絮，加一圈立起來的短苔芽。
 * 輪廓毛毛的、綠得徹底，玩家才會在起跳前就認出「這顆會滑」
 */
function createMossFuzzMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  seed: number,
): Mesh {
  const random = createRandomGenerator(seed ^ 0x27D4EB2D)
  const partList: Mesh[] = []

  const capRatioList = createIrregularRadiusList(11, random, 0.92, 1.05)
  const cap = createRingedSolidMesh(
    `${name}Cap`,
    scene,
    material,
    [
      {
        // 苔面壓在站立面之下一點，魚才是「陷進厚苔」而不是被苔埋掉
        y: -0.03,
        radiusList: capRatioList.map((ratio) => ratio * PLATFORM_BASE_RADIUS * 0.84),
        yOffsetList: capRatioList.map(() => randomBetween(random, -0.03, 0.04)),
      },
      { y: -0.08, radiusList: capRatioList.map((ratio) => ratio * PLATFORM_BASE_RADIUS) },
      { y: -0.32, radiusList: capRatioList.map((ratio) => ratio * PLATFORM_BASE_RADIUS * 0.94) },
    ],
    0.02,
    -0.4,
    { seed, unevenness: 0.6 },
  )
  partList.push(cap)

  // 苔絮的方位不等分並留一側偏疏：等距四叢加擾動仍讀得出十字骨架。
  // 數量從四叢加到八叢——毛茸茸讀的是輪廓：俯視鏡頭下苔石的「毛」全在邊緣那一圈，
  // 頂面中央再怎麼加東西都只是一片綠。八叢長短胖瘦各異，邊緣才碎得起來
  const tuftAngleList = createClusteredAngleList({
    seed: seed ^ 0x711A9C4F,
    count: MOSS_TUFT_COUNT,
    unevenness: 0.75,
    gapRatio: 0.15,
  })
  for (let tuftIndex = 0; tuftIndex < MOSS_TUFT_COUNT; tuftIndex++) {
    // 短而鈍：長度收斂、末端留寬成截頭錐，才不會抖出細長尖針。
    // 長短差距拉開到兩倍，一圈長度一致會讀成裙襬而不是苔
    const tuftLength = randomBetween(random, 0.15, 0.32)
    // 各叢胖瘦不同，一樣粗會像同一支模具翻出來的
    const tuftScale = randomBetween(random, 0.6, 1.3)
    const tuftRatioList = createIrregularRadiusList(4, random, 0.7, 1)
    const tuft = createRingedSolidMesh(
      `${name}Tuft${tuftIndex}`,
      scene,
      material,
      [
        { y: 0, radiusList: tuftRatioList.map((ratio) => ratio * 0.14 * tuftScale) },
        { y: -tuftLength, radiusList: tuftRatioList.map((ratio) => ratio * 0.1 * tuftScale) },
      ],
      0.03,
      -tuftLength - 0.05,
      { seed: seed + tuftIndex * 131, unevenness: 0.5 },
    )
    const angle = tuftAngleList[tuftIndex] ?? 0
    const distance = randomBetween(random, 0.8, 0.96) * PLATFORM_BASE_RADIUS
    tuft.position.set(Math.sin(angle) * distance, -0.05, Math.cos(angle) * distance)
    // 順著邊緣往外倒，苔絮才像垂掛而不是插在頂上的釘子。
    // 外倒的角度各叢不同，一致的傾角會讀成一圈整齊的流蘇
    const tuftLean = randomBetween(random, 0.22, 0.46)
    tuft.rotation.set(Math.cos(angle) * tuftLean, 0, -Math.sin(angle) * tuftLean)
    partList.push(tuft)
  }

  // 邊緣立起來的短苔芽：苔絮是往下垂的，只有垂的會讀成裙襬；
  // 立起來的這幾撮從輪廓上緣冒出去，才有「毛」的感覺。
  // 高度壓在 0.05 以內——魚站在 y = 0、稿紙在 0.056，苔芽不能戳穿它們
  const sproutAngleList = createClusteredAngleList({
    seed: seed ^ 0x2545F491,
    count: MOSS_SPROUT_COUNT,
    unevenness: 0.85,
    gapRatio: 0.25,
  })
  for (let sproutIndex = 0; sproutIndex < MOSS_SPROUT_COUNT; sproutIndex++) {
    const sproutTopY = randomBetween(random, 0.005, 0.035)
    // 苔芽要比整體抖動量（0.06）粗得多，否則末端會被抖成破碎的尖刺
    const sproutRadius = randomBetween(random, 0.1, 0.16)
    const sproutRatioList = createIrregularRadiusList(4, random, 0.65, 1)
    const sprout = createRingedSolidMesh(
      `${name}Sprout${sproutIndex}`,
      scene,
      material,
      [
        // 上細下粗的截頭錐，下半截整個埋在苔蓋裡，看得到的只有冒出來那一點
        { y: sproutTopY, radiusList: sproutRatioList.map((ratio) => ratio * sproutRadius * 0.72) },
        { y: -0.14, radiusList: sproutRatioList.map((ratio) => ratio * sproutRadius) },
      ],
      sproutTopY + 0.015,
      -0.24,
      { seed: seed + sproutIndex * 613, unevenness: 0.6 },
    )
    const angle = sproutAngleList[sproutIndex] ?? 0
    // 只長在邊緣那一圈：中央是魚的落腳處，也是俯視下最看不出毛的位置
    const distance = randomBetween(random, 0.52, 0.86) * PLATFORM_BASE_RADIUS
    sprout.position.set(Math.sin(angle) * distance, 0, Math.cos(angle) * distance)
    const sproutLean = randomBetween(random, -0.3, 0.3)
    sprout.rotation.set(Math.cos(angle) * sproutLean, 0, -Math.sin(angle) * sproutLean)
    partList.push(sprout)
  }

  // 依模型準則「合併 → 攤平法線 → 整體抖動」一次收尾，
  // 零件各抖各的會在接縫處讀出拼裝痕。抖動量仍取保守值——毛茸茸靠的是
  // 苔絮與苔芽的數量與長短差，不是把抖動開大；抖動一旦逼近苔絮末端的半徑，
  // 末端就不是毛而是破洞
  const merged = mergePartList(name, partList)
  merged.convertToFlatShadedMesh()
  applyVertexJitter(merged, { seed, amount: 0.06, axisScale: { y: 0.6 } })
  applyHeightGradient(merged, 0.26)
  return merged
}

// --- 荷葉 ---
const LILY_SECTOR_COUNT = 14

/** 荷葉：放射狀葉脈、中央微凹的碗狀、邊緣一道朝葉心收的三角形缺口。
 *
 * 缺口是荷葉最好認的特徵，所以做成真的楔形（尖端收到 0.36 倍半徑），
 * 不是淺淺一個凹。代價是判定圓仍是整個圓，缺口那一楔會出現
 * 「看起來是缺口、踩上去卻站得住」——但缺口只佔十四分之三的角度，
 * 而且是視覺辨識度換來的：認不出是荷葉，玩家連它會沉都不知道
 */
function createLilyPadMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  seed: number,
): Mesh {
  const random = createRandomGenerator(seed ^ 0x165667B1)
  const positionList: number[] = []
  const indexList: number[] = []

  function pushVertex(x: number, y: number, z: number): number {
    const vertexIndex = positionList.length / 3
    positionList.push(x, y, z)
    return vertexIndex
  }

  const notchSector = Math.floor(random() * LILY_SECTOR_COUNT)
  // 扇形輕微不等分、外加一道小裂縫（角度缺口）：荷葉的放射脈絡本就疏密不一。
  // 缺口只動角度不動半徑，判定圓照舊，視覺輪廓不會縮進可站範圍
  const sectorAngleList = createClusteredAngleList({
    seed: seed ^ 0x7F4A7C15,
    count: LILY_SECTOR_COUNT,
    unevenness: 0.25,
    gapRatio: 0.06,
  })
  const topCenterIndex = pushVertex(0, -0.07, 0)
  const bottomCenterIndex = pushVertex(0, -0.17, 0)
  const innerRowList: number[] = []
  const topRimRowList: number[] = []
  const bottomRimRowList: number[] = []

  for (let sector = 0; sector < LILY_SECTOR_COUNT; sector++) {
    const angle = sectorAngleList[sector] ?? (sector / LILY_SECTOR_COUNT) * Math.PI * 2
    const sinAngle = Math.sin(angle)
    const cosAngle = Math.cos(angle)
    const gapStep = Math.abs(sector - notchSector)
    const notchDistance = Math.min(gapStep, LILY_SECTOR_COUNT - gapStep)

    let rimRadius = randomBetween(random, 0.94, 1) * PLATFORM_BASE_RADIUS
    let rimY = 0.02
    if (notchDistance === 0) {
      // 缺口尖端收到 0.36 倍半徑：荷葉的缺口是一道朝葉心收的楔形，
      // 淺淺一個凹只會讀成「輪廓抖歪了」。內圈頂點跟著 rimRadius 等比內收
      // （見下方 innerRowList），所以葉面本身就凹進去一塊，不只是邊緣缺一角
      rimRadius *= 0.36
      rimY = -0.03
    }
    else if (notchDistance === 1) {
      // 缺口兩側是楔形的兩道斜邊，半徑取尖端與整圓的中間值，V 才是直的；
      // 葉緣順勢捲起來，一眼看得出這是裂開的口子而不是模型破洞
      rimRadius *= 0.7
      rimY = 0.12
    }

    // 葉脈：相間的高低讓每個扇形各自傾斜，flat shading 後成為一道道淺凹槽
    const veinLift = sector % 2 === 0 ? 0.024 : -0.016
    innerRowList.push(pushVertex(sinAngle * rimRadius * 0.48, -0.032 + veinLift, cosAngle * rimRadius * 0.48))
    topRimRowList.push(pushVertex(sinAngle * rimRadius, rimY, cosAngle * rimRadius))
    bottomRimRowList.push(pushVertex(sinAngle * rimRadius * 0.97, rimY - 0.08, cosAngle * rimRadius * 0.97))
  }

  for (let sector = 0; sector < LILY_SECTOR_COUNT; sector++) {
    const nextSector = (sector + 1) % LILY_SECTOR_COUNT
    indexList.push(topCenterIndex, innerRowList[nextSector]!, innerRowList[sector]!)
    indexList.push(innerRowList[sector]!, innerRowList[nextSector]!, topRimRowList[nextSector]!)
    indexList.push(innerRowList[sector]!, topRimRowList[nextSector]!, topRimRowList[sector]!)
    indexList.push(topRimRowList[sector]!, topRimRowList[nextSector]!, bottomRimRowList[nextSector]!)
    indexList.push(topRimRowList[sector]!, bottomRimRowList[nextSector]!, bottomRimRowList[sector]!)
    indexList.push(bottomCenterIndex, bottomRimRowList[sector]!, bottomRimRowList[nextSector]!)
  }

  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
  const normalList: number[] = []
  VertexData.ComputeNormals(positionList, indexList, normalList)
  vertexData.positions = positionList
  vertexData.indices = indexList
  vertexData.normals = normalList
  vertexData.applyToMesh(mesh)
  mesh.material = material
  mesh.isPickable = false

  // 抖動壓得很小：葉脈與缺口是刻意造的形，抖過頭會把它們糊掉
  finishLowPolyMesh(mesh, { seed, amount: 0.0476, axisScale: { y: 0.5 }, darkenBottom: 0.3 })
  return mesh
}

/** 葉柄：從葉背伸進水裡，末端略偏一側，荷葉才像連在水下而不是漂著的塑膠片 */
function createLilyStemMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  seed: number,
): Mesh {
  const random = createRandomGenerator(seed ^ 0x3B9ACA07)
  const stemRatioList = createIrregularRadiusList(5, random, 0.8, 1)
  const stem = createRingedSolidMesh(
    name,
    scene,
    material,
    [
      // 短而鈍：柄長收斂、末端留寬，水下看不到的長度不必冒細針風險
      { y: -0.1, radiusList: stemRatioList.map((ratio) => ratio * 0.06) },
      { y: -0.5, radiusList: stemRatioList.map((ratio) => ratio * 0.045) },
    ],
    -0.08,
    -0.56,
    { seed, unevenness: 0.3 },
  )
  finishLowPolyMesh(stem, { seed, amount: 0.034 })
  stem.rotation.z = randomBetween(random, 0.12, 0.26)
  stem.rotation.y = randomBetween(random, 0, Math.PI * 2)
  return stem
}

// --- 浮木平台：一支泡在溪裡的大鉛筆 ---
/** 四種落腳點裡只有浮木是長條狀，本來就是根長圓桿——改成鉛筆是零成本的主題整合，
 * 而且它就是落腳點，永遠在畫面正中央，玩家非看到不可。
 *
 * 外框一個數字都沒動：長度、側寬、上下厚度與原本的浮木完全相同，
 * 換掉的只有沿長軸的分段與配色，落腳判定與可站範圍因此原封不動。
 */
const LOG_HALF_LENGTH = 1.35
/** 側向寬度撐到接近判定圓：圓形判定套長條視覺，側緣太窄會讓玩家往側邊踩空 */
const LOG_HALF_WIDTH = 1.02
/** 斷面壓扁：整根桿子滾在水裡只露一小截，壓扁後才有「浮著」的比例 */
const LOG_HALF_HEIGHT = 0.42
const PENCIL_SIDE_COUNT = 6
/** 六角斷面的外接半高。乘上 cos(30°) 後恰好等於 LOG_HALF_HEIGHT，
 * 朝上那一整面因此正好落在 y = 0——也就是魚站的那個面。
 * 浮木時期頂端只是一條稜線，改成平面之後可站面反而更好讀
 */
const PENCIL_CROSS_HALF_HEIGHT = LOG_HALF_HEIGHT / Math.cos(Math.PI / 6)
/** 六角桿的起訖。落腳判定是世界半徑 spec.radius 的圓，而視覺統一外擴 12%，
 * 換算回建模座標就是半徑 1 / 1.12 ≈ 0.89 的固定圓；
 * 桿身一路撐滿 ±0.95 把整個判定圈蓋住，削尖與橡皮擦全落在圈外，
 * 可站範圍與視覺輪廓的對應關係跟浮木時期一致
 */
const PENCIL_BARREL_NEAR_Z = -0.96
const PENCIL_BARREL_FAR_Z = 0.95
/** 兩端最外側的斷面。再加上封口那 0.02，整支的總長與原本的浮木一模一樣 */
const PENCIL_END_Z = LOG_HALF_LENGTH + 0.01

interface PencilSectionSpec {
  /** 沿長軸的位置（本地 z）。-z 是橡皮擦端、+z 是筆尖端 */
  z: number;
  /** 相對六角基準斷面的半徑倍率 */
  ratio: number;
}

/** 把數個六角斷面沿長軸串成一段封閉的桿子，是大鉛筆五個分段共用的骨架。
 *
 * 六個方位的不規則倍率由呼叫端共用，段與段的稜線才對得齊；
 * 三角繞向沿用 Babylon 左手座標系的順時針正面規則（與其他落腳點同一套）。
 */
function createPencilBarMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  sideRatioList: number[],
  sectionList: PencilSectionSpec[],
): Mesh {
  const positionList: number[] = []
  const indexList: number[] = []

  function pushVertex(x: number, y: number, z: number): number {
    const vertexIndex = positionList.length / 3
    positionList.push(x, y, z)
    return vertexIndex
  }

  const sectionRowList = sectionList.map((section) => {
    const rowList: number[] = []
    for (let side = 0; side < PENCIL_SIDE_COUNT; side++) {
      // 半角偏移讓一整面朝上：頂端是平面而不是一條稜線，魚才站得像站在桌上
      const angle = ((side + 0.5) / PENCIL_SIDE_COUNT) * Math.PI * 2
      const ratio = (sideRatioList[side] ?? 1) * section.ratio
      rowList.push(pushVertex(
        Math.sin(angle) * ratio * LOG_HALF_WIDTH,
        Math.cos(angle) * ratio * PENCIL_CROSS_HALF_HEIGHT - LOG_HALF_HEIGHT,
        section.z,
      ))
    }
    return rowList
  })

  for (let sectionIndex = 0; sectionIndex < sectionRowList.length - 1; sectionIndex++) {
    const nearRow = sectionRowList[sectionIndex]!
    const farRow = sectionRowList[sectionIndex + 1]!
    for (let side = 0; side < PENCIL_SIDE_COUNT; side++) {
      const nextSide = (side + 1) % PENCIL_SIDE_COUNT
      indexList.push(nearRow[side]!, nearRow[nextSide]!, farRow[nextSide]!)
      indexList.push(nearRow[side]!, farRow[nextSide]!, farRow[side]!)
    }
  }

  // 每段自己封口。段與段刻意重疊一小截，接縫的封口面藏在鄰段肚子裡看不到
  const nearRow = sectionRowList[0]!
  const farRow = sectionRowList[sectionRowList.length - 1]!
  const nearCenterIndex = pushVertex(0, -LOG_HALF_HEIGHT, (sectionList[0]?.z ?? 0) - 0.02)
  const farCenterIndex = pushVertex(
    0,
    -LOG_HALF_HEIGHT,
    (sectionList[sectionList.length - 1]?.z ?? 0) + 0.02,
  )
  for (let side = 0; side < PENCIL_SIDE_COUNT; side++) {
    const nextSide = (side + 1) % PENCIL_SIDE_COUNT
    indexList.push(nearCenterIndex, nearRow[nextSide]!, nearRow[side]!)
    indexList.push(farCenterIndex, farRow[side]!, farRow[nextSide]!)
  }

  const mesh = new Mesh(name, scene)
  const vertexData = new VertexData()
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

interface PencilPlatformMaterials {
  paintMaterial: StandardMaterial;
  woodMaterial: StandardMaterial;
  graphiteMaterial: StandardMaterial;
  ferruleMaterial: StandardMaterial;
  eraserMaterial: StandardMaterial;
}

interface PencilPlatformParts {
  /** 六角漆面桿身。整支筆唯一夠大、值得投影的一段 */
  barrelMesh: Mesh;
  /** 金屬箍、橡皮擦、木頭錐、石墨尖。都短小，投影只會在水面上多出雜訊 */
  trimMeshList: Mesh[];
}

/** 建出一整支大鉛筆。五段各吃一種材質，因此不合併，
 * 但幾何一樣在建立期一次做完進物件池，遊玩中只動 transform 與 visibility。
 *
 * 六角是人造物刻意的等分，只給一點點不規則保留手作味——
 * 這是反樣板原則裡少數該讓步的地方，抖過頭反而讀不出是支筆。
 */
function createPencilPlatformParts(
  name: string,
  scene: Scene,
  materials: PencilPlatformMaterials,
  seed: number,
): PencilPlatformParts {
  const random = createRandomGenerator(seed ^ 0x9E3779B9)
  // 六個方位共用同一組倍率，五段的稜線才接得起來
  const sideRatioList = createIrregularRadiusList(PENCIL_SIDE_COUNT, random, 0.96, 1.02)

  const barrelMesh = createPencilBarMesh(
    `${name}Barrel`,
    scene,
    materials.paintMaterial,
    sideRatioList,
    [
      { z: PENCIL_BARREL_NEAR_Z, ratio: 1 },
      { z: randomBetween(random, -0.46, -0.28), ratio: randomBetween(random, 0.985, 1.005) },
      { z: randomBetween(random, 0.28, 0.46), ratio: randomBetween(random, 0.985, 1.005) },
      { z: PENCIL_BARREL_FAR_Z, ratio: 1 },
    ],
  )
  // 抖動壓在半高的 6% 以內：頂面是可站面，抖過頭魚會看起來浮著或陷進去；
  // 沿長軸再壓一次，六道稜線才不會扭成麻花
  finishLowPolyMesh(barrelMesh, {
    seed,
    amount: 0.06,
    axisScale: { y: 0.45, z: 0.3 },
    darkenBottom: 0.3,
  })

  // 金屬箍：中段鼓出漆面、兩端各收一階。
  // 靠橡皮擦那端比橡皮擦寬（箍住它），靠桿身那端縮進漆面底下，接縫才不會互相穿插
  const ferruleMesh = createPencilBarMesh(
    `${name}Ferrule`,
    scene,
    materials.ferruleMaterial,
    sideRatioList,
    [
      { z: -1.16, ratio: 1 },
      { z: -1.1, ratio: 1.05 },
      { z: -0.99, ratio: 1.05 },
      { z: -0.94, ratio: 0.96 },
    ],
  )
  finishLowPolyMesh(ferruleMesh, {
    seed: seed + 149,
    amount: 0.03,
    axisScale: { y: 0.45, z: 0.25 },
    darkenBottom: 0.26,
  })

  // 橡皮擦：末端收成短鈍的圓頭，用光的程度每支不同
  const eraserWearRatio = randomBetween(random, 0.66, 0.8)
  const eraserMesh = createPencilBarMesh(
    `${name}Eraser`,
    scene,
    materials.eraserMaterial,
    sideRatioList,
    [
      { z: -PENCIL_END_Z, ratio: eraserWearRatio },
      { z: -1.3, ratio: 0.9 },
      { z: -1.12, ratio: 0.97 },
    ],
  )
  finishLowPolyMesh(eraserMesh, {
    seed: seed + 293,
    amount: 0.045,
    axisScale: { y: 0.45, z: 0.3 },
    darkenBottom: 0.28,
  })

  // 削出來的木頭錐：直線收窄，末端仍留寬才包得住石墨那一小截。
  // 起點略窄於漆面，六角桿的封口面因此露成一圈漆邊——真的削過的鉛筆就是這道邊
  const coneMesh = createPencilBarMesh(
    `${name}Cone`,
    scene,
    materials.woodMaterial,
    sideRatioList,
    [
      { z: 0.93, ratio: 0.99 },
      { z: 1.06, ratio: 0.72 },
      { z: 1.2, ratio: 0.4 },
    ],
  )
  finishLowPolyMesh(coneMesh, {
    seed: seed + 431,
    amount: 0.04,
    axisScale: { y: 0.45, z: 0.3 },
    darkenBottom: 0.24,
  })

  // 石墨尖：短鈍收尾，末端半寬仍有 0.19，寫過幾次的鈍頭而不是一根針
  const graphiteMesh = createPencilBarMesh(
    `${name}Graphite`,
    scene,
    materials.graphiteMaterial,
    sideRatioList,
    [
      { z: 1.18, ratio: 0.38 },
      { z: 1.28, ratio: 0.28 },
      { z: PENCIL_END_Z, ratio: randomBetween(random, 0.17, 0.23) },
    ],
  )
  finishLowPolyMesh(graphiteMesh, {
    seed: seed + 577,
    amount: 0.022,
    axisScale: { y: 0.4, z: 0.3 },
    darkenBottom: 0.2,
  })

  return {
    barrelMesh,
    trimMeshList: [ferruleMesh, eraserMesh, coneMesh, graphiteMesh],
  }
}

// --- 墨水瓶 ---
const INK_BOTTLE_RADIUS = 0.2

/** 瓶身：矮胖的多面柱，肩部收一道、瓶唇略外翻。
 * 深藍玻璃不打高光，質感全靠深色與硬切面
 */
function createInkBottleBodyMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  seed: number,
): Mesh {
  const random = createRandomGenerator(seed ^ 0x6C8E9CF5)
  const bellyRatioList = createIrregularRadiusList(7, random, 0.92, 1.04)
  const shoulderRatioList = bellyRatioList.map((ratio) => ratio * randomBetween(random, 0.8, 0.9))
  const neckRatioList = bellyRatioList.map((ratio) => ratio * randomBetween(random, 0.44, 0.52))

  const mesh = createRingedSolidMesh(
    name,
    scene,
    material,
    [
      { y: 0.3, radiusList: neckRatioList.map((ratio) => ratio * INK_BOTTLE_RADIUS * 1.1) },
      { y: 0.24, radiusList: neckRatioList.map((ratio) => ratio * INK_BOTTLE_RADIUS) },
      { y: 0.17, radiusList: shoulderRatioList.map((ratio) => ratio * INK_BOTTLE_RADIUS) },
      { y: 0.04, radiusList: bellyRatioList.map((ratio) => ratio * INK_BOTTLE_RADIUS) },
    ],
    0.31,
    0,
    { seed, unevenness: 0.3 },
  )
  // 瓶身只有二十公分高，抖動量跟著壓到兩公分以內，
  // 否則玻璃輪廓會抖成一顆小碎石；底圈釘住，瓶子才不會歪著站
  finishLowPolyMesh(mesh, {
    seed,
    amount: 0.018,
    axisScale: { y: 0.4 },
    flatBottomBelowY: 0.05,
    darkenBottom: 0.34,
  })
  return mesh
}

/** 軟木塞：短鈍的截頭錐。插在瓶口上略歪一邊，讀起來像隨手蓋上而不是壓到底 */
function createInkBottleCorkMesh(
  name: string,
  scene: Scene,
  material: StandardMaterial,
  seed: number,
): Mesh {
  const random = createRandomGenerator(seed ^ 0x1D2C6FE3)
  const corkRatioList = createIrregularRadiusList(6, random, 0.86, 1)
  const mesh = createRingedSolidMesh(
    name,
    scene,
    material,
    [
      { y: 0.11, radiusList: corkRatioList.map((ratio) => ratio * 0.09) },
      { y: 0, radiusList: corkRatioList.map((ratio) => ratio * 0.075) },
    ],
    0.13,
    -0.01,
    { seed, unevenness: 0.35 },
  )
  finishLowPolyMesh(mesh, { seed, amount: 0.012, axisScale: { y: 0.5 }, darkenBottom: 0.24 })
  return mesh
}

function createInkBottleNode(
  name: string,
  scene: Scene,
  glassMaterial: StandardMaterial,
  corkMaterial: StandardMaterial,
  seed: number,
): TransformNode {
  const random = createRandomGenerator(seed ^ 0x45D9F3B3)
  const node = new TransformNode(name, scene)

  const bodyMesh = createInkBottleBodyMesh(`${name}Body`, scene, glassMaterial, seed)
  bodyMesh.parent = node

  const corkMesh = createInkBottleCorkMesh(`${name}Cork`, scene, corkMaterial, seed)
  // 塞子的旋轉軸就在它的底面，歪的是塞子而不是整個瓶口，接縫因此不會裂開
  corkMesh.position.set(0, 0.26, 0)
  corkMesh.rotation.set(
    randomBetween(random, -0.12, 0.24),
    randomBetween(random, 0, Math.PI),
    randomBetween(random, 0.1, 0.3),
  )
  corkMesh.parent = node

  return node
}

// --- 岸上的鉛筆靜物 ---
/** 岸上這支與落腳點那支鉛筆是同一種東西，只差大小與位置，所以分辨全靠位置：
 * 靜物恆在 |x| ≥ 8.9 的乾地上，跳躍走廊最寬只到 |x| ≈ 4.6，中間隔著一整條溪。
 * 尺寸不是保險——放大 1.6 倍後全長約落腳點鉛筆的一半，已經不夠拉開，
 * 所以這支絕對不能挪進水邊以內
 */
const PENCIL_HALF_LENGTH = 0.3
const PENCIL_RADIUS = 0.046

/** 鉛筆：六角桿加削尖的木頭錐與筆芯，躺在岸上。
 *
 * 六角是人造物刻意的等分，只給一點點不等分保留手作味——
 * 這是反樣板原則裡少數該讓步的地方，抖過頭反而讀不出是支筆
 */
function createPencilNode(
  name: string,
  scene: Scene,
  paintMaterialList: StandardMaterial[],
  woodMaterial: StandardMaterial,
  leadMaterial: StandardMaterial,
  seed: number,
): TransformNode {
  const random = createRandomGenerator(seed ^ 0x7A3B1D5F)
  const node = new TransformNode(name, scene)
  // 漆面由種子挑，同一叢裡不會出現兩支一模一樣的筆
  const paintMaterial = paintMaterialList[Math.floor(random() * paintMaterialList.length)]
    ?? paintMaterialList[0]!

  const shaftRatioList = createIrregularRadiusList(6, random, 0.94, 1.02)
  const shaftMesh = createRingedSolidMesh(
    `${name}Shaft`,
    scene,
    paintMaterial,
    [
      { y: PENCIL_HALF_LENGTH, radiusList: shaftRatioList.map((ratio) => ratio * PENCIL_RADIUS * 0.98) },
      { y: 0, radiusList: shaftRatioList.map((ratio) => ratio * PENCIL_RADIUS) },
      { y: -PENCIL_HALF_LENGTH, radiusList: shaftRatioList.map((ratio) => ratio * PENCIL_RADIUS * 0.99) },
    ],
    PENCIL_HALF_LENGTH + 0.012,
    -PENCIL_HALF_LENGTH - 0.012,
    { seed, unevenness: 0.18 },
  )
  // 桿身細，抖動壓到半徑的四分之一以內才不會把六角抖成麻花；
  // 筆躺下後高度漸層落在長軸上，暗部量跟著調小，只當筆桿自身的明暗
  finishLowPolyMesh(shaftMesh, { seed, amount: 0.01, axisScale: { y: 0.5 }, darkenBottom: 0.16 })
  shaftMesh.rotation.x = Math.PI / 2
  shaftMesh.position.set(0, PENCIL_RADIUS, 0)
  shaftMesh.parent = node

  // 削出來的木頭錐：末端留寬（短鈍），削面才不是一根針
  const coneRatioList = createIrregularRadiusList(6, random, 0.92, 1.02)
  const coneMesh = createRingedSolidMesh(
    `${name}Cone`,
    scene,
    woodMaterial,
    [
      { y: 0.1, radiusList: coneRatioList.map((ratio) => ratio * PENCIL_RADIUS * 0.44) },
      { y: 0, radiusList: coneRatioList.map((ratio) => ratio * PENCIL_RADIUS * 0.99) },
    ],
    0.105,
    -0.006,
    { seed: seed + 311, unevenness: 0.2 },
  )
  finishLowPolyMesh(coneMesh, { seed: seed + 311, amount: 0.007, darkenBottom: 0.18 })
  coneMesh.rotation.x = Math.PI / 2
  coneMesh.position.set(0, PENCIL_RADIUS, PENCIL_HALF_LENGTH - 0.006)
  coneMesh.parent = node

  const leadRatioList = createIrregularRadiusList(5, random, 0.9, 1)
  const leadMesh = createRingedSolidMesh(
    `${name}Lead`,
    scene,
    leadMaterial,
    [
      { y: 0.036, radiusList: leadRatioList.map((ratio) => ratio * 0.013) },
      { y: 0, radiusList: leadRatioList.map((ratio) => ratio * 0.021) },
    ],
    0.04,
    -0.004,
    { seed: seed + 577, unevenness: 0.25 },
  )
  finishLowPolyMesh(leadMesh, { seed: seed + 577, amount: 0.004, darkenBottom: 0.2 })
  leadMesh.rotation.x = Math.PI / 2
  leadMesh.position.set(0, PENCIL_RADIUS, PENCIL_HALF_LENGTH + 0.09)
  leadMesh.parent = node

  return node
}

// --- 稿紙 ---
/** 單張厚度。整疊也才六公分高、四十公分寬，不到荷葉的五分之一 */
const PAPER_SHEET_THICKNESS = 0.018

/** 一小疊稿紙：三到四張各自歪一個角度、微微錯開地疊著，
 * 最上面那張用兩三條 ink 薄片暗示文字行（不用貼圖，箱庭一律走幾何）
 */
function createPaperStackNode(
  name: string,
  scene: Scene,
  sheetMaterial: StandardMaterial,
  topSheetMaterial: StandardMaterial,
  lineMaterial: StandardMaterial,
  seed: number,
): TransformNode {
  const random = createRandomGenerator(seed ^ 0x2E1A7C9D)
  const node = new TransformNode(name, scene)
  const sheetCount = 3 + Math.floor(random() * 2)
  // 疊起來的每張只露出一點點，層距刻意小於紙厚
  const layerStep = PAPER_SHEET_THICKNESS * 0.85

  const lowerSheetList: Mesh[] = []
  for (let sheetIndex = 0; sheetIndex < sheetCount - 1; sheetIndex++) {
    const sheetWidth = randomBetween(random, 0.34, 0.42)
    const sheetMesh = createBeveledBox(
      `${name}Sheet${sheetIndex}`,
      scene,
      {
        width: sheetWidth,
        height: PAPER_SHEET_THICKNESS,
        depth: sheetWidth * randomBetween(random, 0.68, 0.8),
        bevel: 0.012,
      },
      sheetMaterial,
    )
    sheetMesh.position.set(
      randomBetween(random, -0.035, 0.035),
      sheetIndex * layerStep + PAPER_SHEET_THICKNESS / 2,
      randomBetween(random, -0.035, 0.035),
    )
    // 每張各歪一個角度，疊起來的邊緣才會參差
    sheetMesh.rotation.y = randomBetween(random, -0.34, 0.34)
    lowerSheetList.push(sheetMesh)
  }
  const lowerStackMesh = mergePartList(`${name}Sheets`, lowerSheetList)
  // 紙很薄，抖動只給水平方向一點點，垂直軸幾乎鎖死才不會抖到翻面
  applyVertexJitter(lowerStackMesh, {
    seed,
    amount: 0.009,
    axisScale: { y: 0.12 },
    flatBottomBelowY: 0.004,
  })
  applyHeightGradient(lowerStackMesh, 0.22)
  lowerStackMesh.parent = node

  // 最上面那張連同文字行掛在同一個節點下，寫的字才會跟著紙一起歪
  const topSheetNode = new TransformNode(`${name}TopSheetNode`, scene)
  topSheetNode.position.set(
    randomBetween(random, -0.03, 0.03),
    (sheetCount - 1) * layerStep,
    randomBetween(random, -0.03, 0.03),
  )
  topSheetNode.rotation.y = randomBetween(random, -0.4, 0.4)
  topSheetNode.parent = node

  const topSheetWidth = randomBetween(random, 0.36, 0.42)
  const topSheetDepth = topSheetWidth * randomBetween(random, 0.7, 0.8)
  const topSheetMesh = createBeveledBox(
    `${name}TopSheet`,
    scene,
    {
      width: topSheetWidth,
      height: PAPER_SHEET_THICKNESS,
      depth: topSheetDepth,
      bevel: 0.012,
    },
    topSheetMaterial,
  )
  topSheetMesh.position.y = PAPER_SHEET_THICKNESS / 2
  topSheetMesh.parent = topSheetNode

  // 文字行：兩三條長短不一的細片，行距不等、整體偏上，下半張留白
  const lineList: Mesh[] = []
  const lineCount = 2 + Math.floor(random() * 2)
  let lineOffsetZ = -topSheetDepth * 0.26
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
    const lineMesh = createBeveledBox(
      `${name}Line${lineIndex}`,
      scene,
      {
        width: topSheetWidth * randomBetween(random, 0.46, 0.76),
        height: 0.005,
        depth: 0.016,
        bevel: 0.004,
      },
      lineMaterial,
    )
    lineMesh.position.set(
      randomBetween(random, -0.03, 0.02),
      PAPER_SHEET_THICKNESS + 0.002,
      lineOffsetZ,
    )
    lineOffsetZ += randomBetween(random, 0.05, 0.085)
    lineList.push(lineMesh)
  }
  // 字行只有五公釐厚，再抖就散了，直接沿用倒角盒自身的平面感
  const lineStackMesh = mergePartList(`${name}Lines`, lineList)
  lineStackMesh.parent = topSheetNode

  return node
}

// --- 石頭頂面的稿紙 ---
/** 岸上放什麼直式都看不到，主題只能長在玩家真正盯著的東西上——落腳點本身。
 * 約三分之一的石頭頂著一兩張稿紙，機率吃該落腳點自己的種子，
 * index % N 那種固定節奏遠遠就讀得出來
 */
const STONE_PAPER_CHANCE = 0.34
/** 稿紙離石心的最遠距離。石頭頂圈的最短半徑約 0.78（倍率下限 0.9 再扣掉抖動）、
 * 苔石的苔蓋更小只剩約 0.71，取後者的一半當紅線。
 *
 * 紙一旦突出落腳點的輪廓就會讀成「浮在水面的扁平物」——
 * 荷葉早就教會玩家那種形狀踩得上去，害人誤判落點的代價遠大於多一點裝飾
 */
const STONE_PAPER_MAX_RADIUS = 0.34
/** 紙面偏心量上限。與半對角線相加不得超過紅線 */
const STONE_PAPER_MAX_OFFSET = 0.08
/** 單張紙的半對角線上限，由紅線扣掉偏心量回推 */
const STONE_PAPER_MAX_HALF_DIAGONAL = STONE_PAPER_MAX_RADIUS - STONE_PAPER_MAX_OFFSET
/** 稿紙貼在石頭頂面的高度。頂面帶起伏又抖過，最高約到 0.05；
 * 寧可略浮也不能陷下去——只有 0.018 厚的紙埋進石頭就整張不見了
 */
const STONE_PAPER_LIFT = 0.042
/** 苔石的苔蓋比石面蓬，紙跟著往上挪一點 */
const MOSS_STONE_PAPER_LIFT = 0.056
/** 苔石的石胎下沉量。
 *
 * 石胎頂面（-0.036~0.051）與苔蓋頂面（-0.096~0.056）原本整片交錯，
 * 石胎的描邊外殼會從苔面下頂出來散成一片深紫楔形。沉到最壞情況下
 * 「石胎頂面＋外殼厚度」仍低於苔蓋最低點，兩層才徹底分開：
 * 0.051（石胎最高）+ 0.018（手機描邊最厚）- (-0.096)（苔蓋最低）≈ 0.165，
 * 取 0.2 留一點餘裕。水線濕痕是烤在頂點色上的，跟著沉同樣的量，
 * 但那道痕本身有 0.34 的漸層寬度，吃得下這點偏移
 */
const MOSS_BODY_SINK = -0.2

/** 壓在石頭頂面的一兩張稿紙，一角用小石頭壓著。
 *
 * 尺寸與偏心全部由 STONE_PAPER_MAX_RADIUS 回推，每張都完整落在頂面輪廓之內。
 * 紙上的字行是純幾何的細片，箱庭一律不用貼圖
 */
function createStonePaperNode(
  name: string,
  scene: Scene,
  sheetMaterial: StandardMaterial,
  lineMaterial: StandardMaterial,
  weightMaterial: StandardMaterial,
  seed: number,
): TransformNode {
  const random = createRandomGenerator(seed ^ 0x4F1BBCDD)
  const node = new TransformNode(name, scene)
  // 石頭頂面本來就不平，整疊跟著側倒一點點，紙才不像燙金印上去的
  node.rotation.x = randomBetween(random, -0.06, 0.06)
  node.rotation.z = randomBetween(random, -0.06, 0.06)
  const sheetCount = 1 + Math.floor(random() * 2)

  const sheetList: Mesh[] = []
  let topSheetX = 0
  let topSheetZ = 0
  let topSheetYaw = 0
  let topSheetWidth = 0
  let topSheetDepth = 0
  let topSheetTopY = 0

  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
    const depthRatio = randomBetween(random, 0.72, 0.86)
    // 由紅線回推寬度上限：半對角線 = 寬 × hypot(0.5, 0.5 × 深寬比)
    const widthLimit = STONE_PAPER_MAX_HALF_DIAGONAL / Math.hypot(0.5, depthRatio * 0.5)
    const sheetWidth = randomBetween(random, widthLimit * 0.76, widthLimit)
    const sheetDepth = sheetWidth * depthRatio
    const offsetAngle = random() * Math.PI * 2
    const offsetDistance = randomBetween(random, 0.02, STONE_PAPER_MAX_OFFSET)
    const sheetYaw = randomBetween(random, -0.5, 0.5)
    const sheetBaseY = sheetIndex * PAPER_SHEET_THICKNESS * 0.9

    const sheetMesh = createBeveledBox(
      `${name}Sheet${sheetIndex}`,
      scene,
      {
        width: sheetWidth,
        height: PAPER_SHEET_THICKNESS,
        depth: sheetDepth,
        bevel: 0.012,
      },
      sheetMaterial,
    )
    sheetMesh.position.set(
      Math.sin(offsetAngle) * offsetDistance,
      sheetBaseY + PAPER_SHEET_THICKNESS / 2,
      Math.cos(offsetAngle) * offsetDistance,
    )
    // 每張各歪各的、位置也錯開，才像隨手擱著而不是對齊貼上去
    sheetMesh.rotation.y = sheetYaw
    sheetList.push(sheetMesh)

    topSheetX = sheetMesh.position.x
    topSheetZ = sheetMesh.position.z
    topSheetYaw = sheetYaw
    topSheetWidth = sheetWidth
    topSheetDepth = sheetDepth
    topSheetTopY = sheetBaseY + PAPER_SHEET_THICKNESS
  }
  const stackMesh = mergePartList(`${name}Sheets`, sheetList)
  // 紙薄，垂直軸幾乎鎖死才不會抖到翻面；水平抖動也只給一點點，直角邊仍讀得出是紙
  applyVertexJitter(stackMesh, { seed, amount: 0.008, axisScale: { y: 0.1 } })
  applyHeightGradient(stackMesh, 0.2)
  stackMesh.parent = node

  /** 把「以最上面那張紙為基準」的座標換算回整疊的座標。
   * 紙歪了字行與壓紙石也要跟著歪，先算好再合併就不必多開一層節點
   */
  function placeOnTopSheet(mesh: Mesh, localX: number, localZ: number, worldY: number) {
    mesh.rotation.y = topSheetYaw
    mesh.position.set(
      topSheetX + Math.cos(topSheetYaw) * localX + Math.sin(topSheetYaw) * localZ,
      worldY,
      topSheetZ - Math.sin(topSheetYaw) * localX + Math.cos(topSheetYaw) * localZ,
    )
  }

  // 字行：兩三條長短不一的細片，行距不等、整體偏上，下半張留白
  const lineList: Mesh[] = []
  const lineCount = 2 + Math.floor(random() * 2)
  let lineOffsetZ = -topSheetDepth * 0.28
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
    const lineMesh = createBeveledBox(
      `${name}Line${lineIndex}`,
      scene,
      {
        width: topSheetWidth * randomBetween(random, 0.4, 0.72),
        height: 0.005,
        depth: 0.018,
        bevel: 0.004,
      },
      lineMaterial,
    )
    placeOnTopSheet(
      lineMesh,
      randomBetween(random, -0.03, 0.02),
      lineOffsetZ,
      topSheetTopY + 0.003,
    )
    lineOffsetZ += randomBetween(random, 0.055, 0.095)
    lineList.push(lineMesh)
  }
  // 字行只有五公釐厚，再抖就散了，直接沿用倒角盒自身的平面感
  const lineStackMesh = mergePartList(`${name}Lines`, lineList)
  lineStackMesh.parent = node

  // 壓紙的小石：矮胖、壓在其中一角，紙才有「被風掀過所以拿東西壓著」的來由
  const weightRatioList = createIrregularRadiusList(5, random, 0.72, 1)
  const weightRadius = randomBetween(random, 0.055, 0.075)
  const weightMesh = createRingedSolidMesh(
    `${name}Weight`,
    scene,
    weightMaterial,
    [
      { y: 0.05, radiusList: weightRatioList.map((ratio) => ratio * weightRadius * 0.72) },
      { y: 0.02, radiusList: weightRatioList.map((ratio) => ratio * weightRadius) },
      { y: 0, radiusList: weightRatioList.map((ratio) => ratio * weightRadius * 0.9) },
    ],
    0.062,
    -0.01,
    { seed: seed + 733, unevenness: 0.55 },
  )
  finishLowPolyMesh(weightMesh, {
    seed: seed + 733,
    amount: 0.018,
    axisScale: { y: 0.4 },
    darkenBottom: 0.3,
  })
  // 壓在哪一角由種子挑，四個角不會每顆石頭都同一個
  placeOnTopSheet(
    weightMesh,
    topSheetWidth * (random() < 0.5 ? -0.34 : 0.34),
    topSheetDepth * (random() < 0.5 ? -0.3 : 0.3),
    topSheetTopY - 0.004,
  )
  weightMesh.parent = node

  return node
}

/** 打字機剪影：滾筒、鍵盤斜面與一張捲出來的紙。
 * 只求輪廓認得出來，細節一律省掉——它是背景的敘事錨點，不是主角
 */
function createTypewriterNode(
  name: string,
  scene: Scene,
  bodyMaterial: StandardMaterial,
  paperMaterial: StandardMaterial,
  seed: number,
): TransformNode {
  const random = createRandomGenerator(seed ^ 0x3C6EF372)
  const node = new TransformNode(name, scene)

  const bodyMesh = createBeveledBox(
    `${name}Body`,
    scene,
    { width: 0.86, height: 0.3, depth: 0.58, bevel: 0.07 },
    bodyMaterial,
  )
  bodyMesh.position.set(0, 0.15, 0)

  // 鍵盤往操作者那側倒，剪影才讀得出是打字機而不是一塊磚
  const keyboardMesh = createBeveledBox(
    `${name}Keyboard`,
    scene,
    { width: 0.74, height: 0.1, depth: 0.3, bevel: 0.04 },
    bodyMaterial,
  )
  keyboardMesh.position.set(0, 0.3, -0.2)
  keyboardMesh.rotation.x = -0.36

  // 滾筒：橫躺的多面柱，壓在機身後緣
  const platenRatioList = createIrregularRadiusList(8, random, 0.94, 1.04)
  const platenMesh = createRingedSolidMesh(
    `${name}Platen`,
    scene,
    bodyMaterial,
    [
      { y: 0.34, radiusList: platenRatioList.map((ratio) => ratio * 0.12) },
      { y: -0.34, radiusList: platenRatioList.map((ratio) => ratio * 0.12) },
    ],
    0.36,
    -0.36,
    { seed, unevenness: 0.25 },
  )
  platenMesh.rotation.z = Math.PI / 2
  platenMesh.position.set(0, 0.42, 0.18)

  // 三件同材質，合併後才攤平法線與抖動：剪影只留一顆網格，
  // 各抖各的會在機身與滾筒的接縫處裂開
  const silhouetteMesh = mergePartList(`${name}Silhouette`, [bodyMesh, keyboardMesh, platenMesh])
  silhouetteMesh.convertToFlatShadedMesh()
  applyVertexJitter(silhouetteMesh, {
    seed,
    amount: 0.028,
    axisScale: { y: 0.45 },
    flatBottomBelowY: 0.03,
  })
  applyHeightGradient(silhouetteMesh, 0.32)
  silhouetteMesh.parent = node

  // 捲出來的稿紙往後仰，像剛打完一段停在那裡
  const paperMesh = createBeveledBox(
    `${name}Paper`,
    scene,
    { width: 0.46, height: 0.34, depth: 0.018, bevel: 0.02 },
    paperMaterial,
  )
  paperMesh.position.set(randomBetween(random, -0.04, 0.04), 0.62, 0.26)
  paperMesh.rotation.set(0.34, randomBetween(random, -0.07, 0.07), 0)
  paperMesh.parent = node

  return node
}

export const createStoneHopGame: MiniGameFactory = (context): MiniGameInstance => {
  const { scene, camera, lighting } = context
  const decorationRandom = createRandomGenerator(20260803)

  // --- 材質 ---
  function createFlatMaterial(name: string, hex: string, alpha = 1): StandardMaterial {
    const material = new StandardMaterial(name, scene)
    material.diffuseColor = Color3.FromHexString(hex)
    // low poly質感不要鏡面高光，光影層次全部交給燈光與頂點漸層
    material.specularColor = Color3.Black()
    material.alpha = alpha
    return material
  }

  // 水要透得出溪底的沙地與石頭，所以 alpha 壓回原本那一階。
  // 「透了就變綠」改由沙床退彩度解決（見 SAND_COLOR），不靠遮住水底
  const waterMaterial = createFlatMaterial('stoneHopWaterMaterial', WATER_BLUE, 0.55)

  // --- 水面真反射 ---
  // MirrorTexture 會以水面為鏡把場景再渲染一次，等於每幀多一個 pass，
  // 所以解析度只給 512，renderList 也只放水面上方看得到的東西（見 start）。
  // 倒影的扭動不會自己發生：Babylon 的平面鏡取樣點是「該像素自己的螢幕位置」，
  // 水面頂點怎麼起伏，片元與取樣點都一起動，倒影是釘在螢幕上的完美鏡子。
  // 抖動一律交給 water-ripple-plugin 在取樣前推開螢幕 UV（見該檔說明）
  const waterMirror = new MirrorTexture('stoneHopWaterMirror', 512, scene, true)
  // 平面式 (0,-1,0,0)：法線朝下、通過 y = 0 的水面
  waterMirror.mirrorPlane = new Plane(0, -1, 0, 0)
  waterMirror.renderList = []
  waterMaterial.reflectionTexture = waterMirror
  // 倒影壓得很淡：這關是低多邊紙感，鏡面太實會變成寫實水面，跟整體調性打架。
  // 更要緊的是倒影是「加上去」的亮色，越強水面越不透明、越看不見水底，
  // 所以這個值同時也是「水的透明度」的一半——點到為止就好
  waterMirror.level = 0.2
  // 倒影的波紋擾動：外掛要在材質首次編譯前掛上，所以緊接著建材質做
  attachWaterRipple(waterMaterial)
  const streamBedMaterial = createFlatMaterial('stoneHopStreamBedMaterial', SAND_COLOR)
  // 落在溪床的影子是隔著水面看的，跟著同一片波場抖，水才不會像一層玻璃
  attachUnderwaterShadowRipple(streamBedMaterial)
  const bankGroundMaterial = createFlatMaterial('stoneHopBankGroundMaterial', MOSS_GREEN)
  const bankRockMaterial = createFlatMaterial('stoneHopBankRockMaterial', STONE_GRAY)
  const grassMaterial = createFlatMaterial('stoneHopGrassMaterial', '#6f9268')
  grassMaterial.backFaceCulling = false
  const stoneMaterial = createFlatMaterial('stoneHopStoneMaterial', STONE_GRAY)
  const mossPatchMaterial = createFlatMaterial('stoneHopMossPatchMaterial', MOSS_GREEN)
  const mossStoneMaterial = createFlatMaterial('stoneHopMossStoneMaterial', DEEP_MOSS)
  const lilyPadMaterial = createFlatMaterial('stoneHopLilyPadMaterial', LILY_GREEN)
  const lilyStemMaterial = createFlatMaterial('stoneHopLilyStemMaterial', LILY_STEM)
  // 浮木落腳點的實際造型是一支大鉛筆，五段各一種材質
  const pencilConeMaterial = createFlatMaterial('stoneHopPencilConeMaterial', WHITTLED_WOOD)
  const ferruleMaterial = createFlatMaterial('stoneHopFerruleMaterial', FERRULE_METAL)
  const eraserMaterial = createFlatMaterial('stoneHopEraserMaterial', ERASER_CORAL)
  // 寫作小件的材質。全部不打高光也不發光，亮度階差刻意做得比落腳點小，
  // 餘光掃過去只讀得到「岸上有東西」，不會把視線從溪心拉走
  const inkGlassMaterial = createFlatMaterial('stoneHopInkGlassMaterial', INK_GLASS)
  // 石墨與墨水共用同一階最深的藍黑：都是「寫出來的東西」的顏色
  const graphiteMaterial = createFlatMaterial('stoneHopGraphiteMaterial', INK_GLASS)
  const corkMaterial = createFlatMaterial('stoneHopCorkMaterial', CORK_TAN)
  const pencilPaintMaterial = createFlatMaterial('stoneHopPencilPaintMaterial', PENCIL_PAINT)
  const pencilPaintLightMaterial = createFlatMaterial(
    'stoneHopPencilPaintLightMaterial',
    PENCIL_PAINT_LIGHT,
  )
  const pencilWoodMaterial = createFlatMaterial('stoneHopPencilWoodMaterial', PENCIL_WOOD)
  const paperSheetMaterial = createFlatMaterial('stoneHopPaperSheetMaterial', PAPER_SHEET)
  const paperTopSheetMaterial = createFlatMaterial(
    'stoneHopPaperTopSheetMaterial',
    PAPER_SHEET_LIGHT,
  )
  const paperLineMaterial = createFlatMaterial('stoneHopPaperLineMaterial', INK_LINE)
  const paperWeightMaterial = createFlatMaterial('stoneHopPaperWeightMaterial', PAPER_WEIGHT_STONE)
  // 飄頁仍半透明，但不再淡到看不見：它在頭頂上飄，讀不出來就等於沒做
  const driftingPageMaterial = createFlatMaterial(
    'stoneHopDriftingPageMaterial',
    PAPER_SHEET_LIGHT,
    0.7,
  )

  const foamMaterial = createFlatMaterial('stoneHopFoamMaterial', PAPER_WHITE, 0.72)
  foamMaterial.emissiveColor = Color3.FromHexString(PAPER_WHITE).scale(0.16)
  const splashMaterial = createFlatMaterial('stoneHopSplashMaterial', PAPER_WHITE)
  splashMaterial.emissiveColor = Color3.FromHexString(PAPER_WHITE).scale(0.3)
  // 入水漣漪淡出靠 mesh.visibility，不動材質（同一份材質多顆共用）
  const splashRippleMaterial = createFlatMaterial('stoneHopSplashRippleMaterial', PAPER_WHITE, 0.55)
  const aimRingMaterial = createFlatMaterial('stoneHopAimRingMaterial', WAX_YELLOW, 0.85)
  aimRingMaterial.emissiveColor = Color3.FromHexString(WAX_YELLOW).scale(0.45)
  const gaugeTrackMaterial = createFlatMaterial('stoneHopGaugeTrackMaterial', INK_BLUE, 0.8)
  const gaugeFillMaterial = createFlatMaterial('stoneHopGaugeFillMaterial', WAX_YELLOW)
  gaugeFillMaterial.emissiveColor = Color3.FromHexString(WAX_YELLOW).scale(0.4)

  // --- 溪床與兩岸底 ---
  const streamBedMesh = CreateGround(
    'stoneHopStreamBed',
    { width: WATER_HALF_WIDTH * 2 + 4, height: WATER_ROW_COUNT * WATER_CELL_SIZE, subdivisions: 6 },
    scene,
  )
  // 大面積平面也要吃 low poly 收尾，透過水面看下去才不是一整片 CAD 板
  streamBedMesh.convertToFlatShadedMesh()
  applyVertexJitter(streamBedMesh, {
    seed: createSeedFrom(0),
    amount: 0.35,
    axisScale: { y: 0.12 },
  })
  applyHeightGradient(streamBedMesh, 0.2)
  streamBedMesh.position.y = STREAM_BED_Y
  streamBedMesh.material = streamBedMaterial
  streamBedMesh.isPickable = false
  streamBedMesh.receiveShadows = true

  // 兩側岸地各一片，中間留空讓半透明水面直接看到沙質溪床
  const bankGroundNodeList: Mesh[] = []
  for (const side of [-1, 1]) {
    const bankGround = CreateGround(
      `stoneHopBankGround${side > 0 ? 'Right' : 'Left'}`,
      { width: 26, height: WATER_ROW_COUNT * WATER_CELL_SIZE, subdivisions: 8 },
      scene,
    )
    // 岸地離相機近，抖動比溪床重一點；y 軸壓回，地面起伏才不會頂穿水面
    bankGround.convertToFlatShadedMesh()
    applyVertexJitter(bankGround, {
      seed: createSeedFrom(side),
      amount: 0.5,
      axisScale: { y: 0.1 },
    })
    applyHeightGradient(bankGround, 0.2)
    bankGround.position.set(side * (WATER_HALF_WIDTH - 0.8 + 13), -0.12, 0)
    bankGround.material = bankGroundMaterial
    bankGround.isPickable = false
    bankGround.receiveShadows = true
    bankGroundNodeList.push(bankGround)
  }

  const waterSurface = createWaterSurface(scene, waterMaterial)

  // --- 兩岸掠過的岩壁與草叢 ---
  const bankChunkList: TransformNode[] = []
  for (const side of [-1, 1]) {
    for (let chunkIndex = 0; chunkIndex < BANK_CHUNK_PER_SIDE; chunkIndex++) {
      const chunkNode = new TransformNode(
        `stoneHopBankChunk${side > 0 ? 'R' : 'L'}${chunkIndex}`,
        scene,
      )
      chunkNode.position.set(
        side * randomBetween(decorationRandom, WATER_HALF_WIDTH - 0.4, WATER_HALF_WIDTH + 2.4),
        0,
        chunkIndex * BANK_CHUNK_SPACING - BANK_BEHIND_MARGIN,
      )
      chunkNode.rotation.y = decorationRandom() * Math.PI * 2

      // 岩壁：三層由大到小的岩板錯開堆疊，形成沉積岩那樣的層層節理
      const slabList: Mesh[] = []
      const baseWidth = randomBetween(decorationRandom, 2.2, 3.2)
      const baseDepth = randomBetween(decorationRandom, 2, 3)
      let slabTopY = -1
      for (let slabIndex = 0; slabIndex < 3; slabIndex++) {
        const shrink = 1 - slabIndex * randomBetween(decorationRandom, 0.14, 0.26)
        const slabHeight = randomBetween(decorationRandom, 0.45, 0.95)
        const slabMesh = createBeveledBox(
          `${chunkNode.name}Slab${slabIndex}`,
          scene,
          {
            width: baseWidth * shrink,
            height: slabHeight,
            depth: baseDepth * shrink,
            bevel: 0.2,
          },
          bankRockMaterial,
        )
        // 每層各自偏移一點，節理縫才不會排成一條直線
        slabMesh.position.set(
          randomBetween(decorationRandom, -0.24, 0.24),
          slabTopY + slabHeight / 2,
          randomBetween(decorationRandom, -0.24, 0.24),
        )
        slabMesh.rotation.set(
          randomBetween(decorationRandom, -0.08, 0.08),
          decorationRandom() * Math.PI,
          randomBetween(decorationRandom, -0.07, 0.07),
        )
        slabTopY += slabHeight * randomBetween(decorationRandom, 0.72, 0.94)
        slabList.push(slabMesh)
      }
      const rockMesh = mergePartList(`${chunkNode.name}Rock`, slabList)
      // 合併後才整體抖動（createBeveledBox 產物已是 flat shaded，不必再攤平法線），
      // 各層各抖各的會在節理縫裂開；y 軸壓回讓層理保持水平走向
      applyVertexJitter(rockMesh, {
        seed: createSeedFrom(side, chunkIndex, 1),
        amount: 0.12,
        axisScale: { y: 0.35 },
      })
      applyHeightGradient(rockMesh, 0.3)
      // 整塊岩壁再做一次胖瘦與傾倒的浮動，相鄰兩塊才不會看起來同一個模子
      applyInstanceVariation(rockMesh, {
        seed: createSeedFrom(side, chunkIndex),
        scaleRange: 0.18,
        tiltRange: 0.07,
      })
      rockMesh.receiveShadows = true
      rockMesh.parent = chunkNode

      // 草叢：每叢的株數、高矮與散開程度都不同，掠過時才有疏密節奏
      const bladeList: Mesh[] = []
      const clusterCenterX = side * randomBetween(decorationRandom, 1, 2.4)
      const clusterCenterZ = randomBetween(decorationRandom, -1.6, 1.6)
      const clusterSpread = randomBetween(decorationRandom, 0.25, 0.9)
      const bladeCount = 2 + Math.floor(decorationRandom() * 3)
      for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex++) {
        const bladeHeight = randomBetween(decorationRandom, 0.45, 1.55)
        const bladeMesh = createBeveledBox(
          `${chunkNode.name}Grass${bladeIndex}`,
          scene,
          {
            width: randomBetween(decorationRandom, 0.14, 0.3),
            height: bladeHeight,
            // 厚度撐到抖動位移的兩倍以上，葉面才不會被抖到翻面
            depth: 0.09,
            bevel: 0.02,
          },
          grassMaterial,
        )
        bladeMesh.position.set(
          clusterCenterX + randomBetween(decorationRandom, -clusterSpread, clusterSpread),
          bladeHeight * 0.4,
          clusterCenterZ + randomBetween(decorationRandom, -clusterSpread, clusterSpread),
        )
        bladeMesh.rotation.set(
          randomBetween(decorationRandom, -0.32, 0.32),
          decorationRandom() * Math.PI,
          side * randomBetween(decorationRandom, 0.08, 0.5),
        )
        bladeList.push(bladeMesh)
      }
      const grassMesh = mergePartList(`${chunkNode.name}Grass`, bladeList)
      // 合併後才整體抖動，每片葉子帶點彎折又不會在根部裂開；
      // 葉片繞 Y 隨機轉向後薄的那一軸落在水平面上，水平抖動整體壓回、根部釘住
      applyVertexJitter(grassMesh, {
        seed: createSeedFrom(side, chunkIndex, 2),
        amount: 0.045,
        axisScale: { x: 0.6, z: 0.25 },
        flatBottomBelowY: 0.05,
      })
      applyHeightGradient(grassMesh, 0.3)
      grassMesh.parent = chunkNode

      bankChunkList.push(chunkNode)
    }
  }

  // --- 落腳點物件池 ---
  /** 建立一份池單元。所有幾何在這裡就抖好，之後只靠 setEnabled 與 scaling 切換，
   * 回收與取用完全不碰頂點資料
   */
  function createPlatformView(viewIndex: number): PlatformView {
    const rootNode = new TransformNode(`stoneHopPlatform${viewIndex}`, scene)
    // 池單元固定服務「序號 ≡ viewIndex (mod 池大小)」的那些落腳點，
    // 因此這顆種子等同於落腳點自己的種子：同一顆石頭每次載入都長一樣
    const viewSeed = createSeedFrom(viewIndex)
    const meshList: Mesh[] = []

    // 稿紙只長在約三分之一的石頭上。池單元固定服務同一批序號，
    // 這一擲等同於「這顆石頭有沒有紙」，回收時不會換來換去
    const stonePaperRandom = createRandomGenerator(viewSeed ^ 0x6D2B79F5)
    const hasStonePaper = stonePaperRandom() < STONE_PAPER_CHANCE
    const hasMossStonePaper = stonePaperRandom() < STONE_PAPER_CHANCE

    const stoneNode = new TransformNode(`${rootNode.name}Stone`, scene)
    stoneNode.parent = rootNode
    const stoneMesh = createStreamStoneMesh(`${rootNode.name}StoneMesh`, scene, stoneMaterial, viewSeed)
    stoneMesh.parent = stoneNode
    meshList.push(stoneMesh)
    // 苔斑是貼在頂面的薄片，不進陰影投射清單（薄小件不投影）
    const stoneMossMesh = createMossPatchMesh(`${rootNode.name}StoneMoss`, scene, mossPatchMaterial, viewSeed)
    stoneMossMesh.parent = stoneNode
    if (hasStonePaper) {
      // 稿紙同樣是薄小件，不投影
      const stonePaperNode = createStonePaperNode(
        `${rootNode.name}StonePaper`,
        scene,
        paperTopSheetMaterial,
        paperLineMaterial,
        paperWeightMaterial,
        viewSeed,
      )
      stonePaperNode.position.y = STONE_PAPER_LIFT
      stonePaperNode.parent = stoneNode
    }

    const mossStoneNode = new TransformNode(`${rootNode.name}MossStone`, scene)
    mossStoneNode.parent = rootNode
    // 苔石的石胎換成深苔色：厚苔是整顆包起來的，露不出灰石
    const mossBodyMesh = createStreamStoneMesh(
      `${rootNode.name}MossBodyMesh`,
      scene,
      mossStoneMaterial,
      viewSeed ^ 0x1B873593,
    )
    // 石胎整顆沉到苔蓋底下。兩者原本同高：石胎頂面在 -0.036~0.051、
    // 苔蓋頂面在 -0.096~0.056，整片交錯在一起。表面互穿本身只是兩層綠在打架，
    // 真正難看的是描邊——描邊的實作是放大一圈的深紫背面外殼，石胎的外殼
    // 就從苔面下頂出來，在頂面散出一片片深紫楔形。沉下去讓兩個面徹底分開，
    // 也才對得上「厚苔整顆包起來、露不出石胎」的原意
    mossBodyMesh.position.y = MOSS_BODY_SINK
    mossBodyMesh.parent = mossStoneNode
    meshList.push(mossBodyMesh)
    const mossFuzzMesh = createMossFuzzMesh(`${rootNode.name}MossFuzz`, scene, mossPatchMaterial, viewSeed)
    mossFuzzMesh.parent = mossStoneNode
    meshList.push(mossFuzzMesh)
    if (hasMossStonePaper) {
      const mossStonePaperNode = createStonePaperNode(
        `${rootNode.name}MossStonePaper`,
        scene,
        paperTopSheetMaterial,
        paperLineMaterial,
        paperWeightMaterial,
        viewSeed ^ 0x1B873593,
      )
      mossStonePaperNode.position.y = MOSS_STONE_PAPER_LIFT
      mossStonePaperNode.parent = mossStoneNode
    }

    const lilyPadNode = new TransformNode(`${rootNode.name}LilyPad`, scene)
    lilyPadNode.parent = rootNode
    const lilyPadMesh = createLilyPadMesh(`${rootNode.name}LilyPadMesh`, scene, lilyPadMaterial, viewSeed)
    lilyPadMesh.receiveShadows = true
    lilyPadMesh.parent = lilyPadNode
    meshList.push(lilyPadMesh)
    // 葉柄細瘦又泡在水裡，不投影
    const lilyStemMesh = createLilyStemMesh(`${rootNode.name}LilyStem`, scene, lilyStemMaterial, viewSeed)
    lilyStemMesh.parent = lilyPadNode

    // 邏輯層的落腳點種類仍叫 driftwood（純邏輯的 kind 代號不隨外觀走），
    // 但視覺換成了一支大鉛筆：長條狀的外框與落腳判定完全沿用浮木時期的數值
    const pencilNode = new TransformNode(`${rootNode.name}Pencil`, scene)
    pencilNode.parent = rootNode
    // 漆面由池單元的種子挑，亮黃只有少數幾支，不與預測環搶眼
    const barrelPaintRandom = createRandomGenerator(viewSeed ^ 0x1F123BB5)
    const pencilParts = createPencilPlatformParts(
      `${rootNode.name}Pencil`,
      scene,
      {
        paintMaterial: barrelPaintRandom() < 0.28 ? pencilPaintLightMaterial : pencilPaintMaterial,
        woodMaterial: pencilConeMaterial,
        graphiteMaterial,
        ferruleMaterial,
        eraserMaterial,
      },
      viewSeed,
    )
    // 濕痕照舊：五段吃同一條水線，泡在水裡的那半支一起變深
    for (const pencilMesh of [pencilParts.barrelMesh, ...pencilParts.trimMeshList]) {
      applyWaterlineShading(pencilMesh, WATERLINE_LOCAL_Y, 0.3)
      pencilMesh.parent = pencilNode
    }
    // 只有六角桿主體投影：其餘四段短小，投影只會在水面上多出雜訊
    pencilParts.barrelMesh.receiveShadows = true
    meshList.push(pencilParts.barrelMesh)
    // 這根躺在水流上難免歪一點，四種落腳點裡只有它是長條狀，歪斜特別讀得出來；
    // 歪斜量吃池單元種子，每支各歪各的而不是同一個角度
    const pencilTiltRandom = createRandomGenerator(viewSeed ^ 0x2545F491)
    pencilNode.rotation.z = randomBetween(pencilTiltRandom, -0.07, 0.07)

    // 落腳點不另外套常駐漣漪環：細管狀的環在俯視下讀成一圈描邊而非水紋，
    // 入水接觸交給水線以下的濕痕表達，濺起的水花才用得上會擴張的漣漪

    lighting.addShadowCaster(...meshList)

    return {
      rootNode,
      kindNodeMap: {
        stone: stoneNode,
        mossStone: mossStoneNode,
        lilyPad: lilyPadNode,
        driftwood: pencilNode,
      },
      boundIndex: -1,
    }
  }

  const platformViewList: PlatformView[] = []
  for (let viewIndex = 0; viewIndex < PLATFORM_POOL_SIZE; viewIndex++) {
    platformViewList.push(createPlatformView(viewIndex))
  }

  // --- 水花 ---
  const splashFlakeList: SplashFlake[] = []
  for (let flakeIndex = 0; flakeIndex < SPLASH_POOL_SIZE; flakeIndex++) {
    const flakeMesh = createBeveledBox(
      `stoneHopSplash${flakeIndex}`,
      scene,
      { width: 0.18, height: 0.18, depth: 0.18, bevel: 0.05 },
      splashMaterial,
    )
    // 每顆吃獨立種子的微量抖動，噴起來才不是十八顆一模一樣的小方塊
    applyVertexJitter(flakeMesh, { seed: createSeedFrom(flakeIndex), amount: 0.035 })
    flakeMesh.setEnabled(false)
    splashFlakeList.push({
      mesh: flakeMesh,
      originX: 0,
      originZ: 0,
      directionX: 0,
      directionZ: 0,
      spreadDistance: 0,
      velocityY: 0,
      elapsed: 0,
      lifetime: SPLASH_LIFETIME_MAX,
      baseScale: 1,
      isActive: false,
    })
  }

  // --- 入水漣漪 ---
  // 幾何一樣在建立期做完，遊玩中只動縮放與 visibility
  const splashRippleList: SplashRipple[] = []
  for (let rippleIndex = 0; rippleIndex < SPLASH_RIPPLE_POOL_SIZE; rippleIndex++) {
    const splashRippleMesh = CreateTorus(
      `stoneHopSplashRipple${rippleIndex}`,
      { diameter: 1, thickness: 0.05, tessellation: 14 },
      scene,
    )
    splashRippleMesh.convertToFlatShadedMesh()
    applyVertexJitter(splashRippleMesh, {
      seed: createSeedFrom(rippleIndex, 7),
      amount: 0.014,
      axisScale: { y: 0.25 },
    })
    splashRippleMesh.material = splashRippleMaterial
    splashRippleMesh.isPickable = false
    splashRippleMesh.setEnabled(false)
    splashRippleList.push({
      mesh: splashRippleMesh,
      elapsed: 0,
      baseScale: 1,
      isActive: false,
    })
  }

  // --- 碎浪白點 ---
  const foamFleckList: Mesh[] = []
  for (let fleckIndex = 0; fleckIndex < FOAM_FLECK_COUNT; fleckIndex++) {
    const fleckSize = randomBetween(decorationRandom, 0.1, 0.26)
    const fleckRatioList = createIrregularRadiusList(4, decorationRandom, 0.55, 1)
    const fleckMesh = createRingedSolidMesh(
      `stoneHopFoam${fleckIndex}`,
      scene,
      foamMaterial,
      [
        { y: 0.02, radiusList: fleckRatioList.map((ratio) => ratio * fleckSize) },
        { y: -0.02, radiusList: fleckRatioList.map((ratio) => ratio * fleckSize * 0.8) },
      ],
      0.03,
      -0.03,
      { seed: createSeedFrom(fleckIndex, fleckSize), unevenness: 0.6 },
    )
    finishLowPolyMesh(fleckMesh, {
      seed: createSeedFrom(fleckIndex, fleckSize),
      amount: 0.034,
      axisScale: { y: 0.3 },
    })
    fleckMesh.rotation.y = decorationRandom() * Math.PI
    fleckMesh.position.set(
      randomBetween(decorationRandom, -WATER_HALF_WIDTH + 0.6, WATER_HALF_WIDTH - 0.6),
      0.06,
      randomBetween(decorationRandom, -FOAM_BEHIND_MARGIN, FOAM_SPAN - FOAM_BEHIND_MARGIN),
    )
    foamFleckList.push(fleckMesh)
  }

  // --- 岸邊寫作靜物 ---
  function createWritingPropNode(
    kind: WritingPropKind,
    name: string,
    seed: number,
  ): TransformNode {
    if (kind === 'inkBottle') {
      return createInkBottleNode(name, scene, inkGlassMaterial, corkMaterial, seed)
    }
    if (kind === 'pencil') {
      return createPencilNode(
        name,
        scene,
        [pencilPaintMaterial, pencilPaintLightMaterial],
        pencilWoodMaterial,
        graphiteMaterial,
        seed,
      )
    }
    return createPaperStackNode(
      name,
      scene,
      paperSheetMaterial,
      paperTopSheetMaterial,
      paperLineMaterial,
      seed,
    )
  }

  /** 這一件離溪心多遠。全部貼著水邊擺才進得了橫式的取景，
   * 只有攤得最開的稿紙疊要多退半步，才不會有一角伸進淺灘
   */
  function getWritingPropAbsX(kind: WritingPropKind): number {
    const extraAbsX = kind === 'paperStack' ? PAPER_STACK_EXTRA_ABS_X : 0
    return randomBetween(
      decorationRandom,
      WRITING_PROP_MIN_ABS_X + extraAbsX,
      WRITING_PROP_MAX_ABS_X + extraAbsX,
    )
  }

  // 每一叢是一個節點，回收時整叢一起搬，叢內的相對位置永遠不變。
  // 節點不轉向，靜物的世界 x 因此完全由這裡決定——這是「絕不落在水面上」的保證
  const writingPropClusterNodeList: TransformNode[] = []
  for (let clusterIndex = 0; clusterIndex < WRITING_PROP_CLUSTER_LIST.length; clusterIndex++) {
    const clusterSpec = WRITING_PROP_CLUSTER_LIST[clusterIndex]!
    const clusterNode = new TransformNode(`stoneHopWritingProp${clusterIndex}`, scene)
    clusterNode.position.z = clusterSpec.centerZ

    for (let propIndex = 0; propIndex < clusterSpec.kindList.length; propIndex++) {
      const propKind = clusterSpec.kindList[propIndex]!
      const propSeed = createSeedFrom(clusterIndex, propIndex, 5)
      const propNode = createWritingPropNode(
        propKind,
        `stoneHopWritingProp${clusterIndex}_${propIndex}`,
        propSeed,
      )
      propNode.position.set(
        clusterSpec.side * getWritingPropAbsX(propKind),
        WRITING_PROP_GROUND_Y,
        randomBetween(decorationRandom, -WRITING_PROP_CLUSTER_SPREAD, WRITING_PROP_CLUSTER_SPREAD),
      )
      // 變化幅度依件別拉開：玻璃瓶是模具貨、抓得緊，隨手疊的紙可以差很多。
      // 各軸獨立縮放一律關掉——這幾件的零件都先轉過向，母體非等比縮放會把它們剪歪；
      // 胖瘦差異改由每件各自的種子在幾何階段做出來
      const isPaperStack = propKind === 'paperStack'
      applyInstanceVariation(propNode, {
        seed: propSeed,
        scaleRange: isPaperStack ? 0.16 : 0.07,
        tiltRange: isPaperStack ? 0.05 : 0.02,
        shouldVaryAxisScale: false,
      })
      // 放大擺在實例變化之後：applyInstanceVariation 是直接覆寫 scaling，
      // 先放大會被它整個蓋掉
      propNode.scaling.scaleInPlace(WRITING_PROP_SCALE)
      propNode.parent = clusterNode
    }

    writingPropClusterNodeList.push(clusterNode)
  }

  // --- 起點的打字機 ---
  const typewriterNode = createTypewriterNode(
    'stoneHopTypewriter',
    scene,
    inkGlassMaterial,
    paperTopSheetMaterial,
    createSeedFrom(31, 7),
  )
  typewriterNode.position.set(TYPEWRITER_POSITION_X, WRITING_PROP_GROUND_Y, TYPEWRITER_POSITION_Z)
  typewriterNode.scaling.setAll(TYPEWRITER_SCALE)
  // 略側身的四分之三角度：正對相機會像產品照，正對溪流又只看得到背面
  typewriterNode.rotation.y = -1.2

  // --- 空中飄頁 ---
  /** 把一張飄頁放到基準點前方並重抽一次飄法。
   * 基準點由呼叫端給：建立期用起點錯開排布，遊玩中用魚的位置
   */
  function respawnDriftingPage(page: DriftingPage, fromZ: number) {
    // 左右各半，且一律從主道外側起算：正中那條落點主道要留給玩家判斷落腳
    const sideSign = decorationRandom() < 0.5 ? -1 : 1
    page.mesh.position.set(
      sideSign * randomBetween(
        decorationRandom,
        DRIFTING_PAGE_MIN_ABS_X,
        DRIFTING_PAGE_MAX_ABS_X,
      ),
      randomBetween(decorationRandom, DRIFTING_PAGE_MIN_Y, DRIFTING_PAGE_MAX_Y),
      fromZ + randomBetween(decorationRandom, DRIFTING_PAGE_AHEAD_MIN, DRIFTING_PAGE_AHEAD_MAX),
    )
    page.baseY = page.mesh.position.y
    page.baseYaw = decorationRandom() * Math.PI * 2
    page.driftSpeedZ = randomBetween(
      decorationRandom,
      DRIFTING_PAGE_MIN_SPEED,
      DRIFTING_PAGE_MAX_SPEED,
    )
    // 側向漂移一律朝外且壓得很小：一張紙在鏡頭裡待上二十幾秒，
    // 只要允許往內漂遲早會蓋到正中的落點主道
    page.driftSpeedX = sideSign * randomBetween(decorationRandom, 0.005, 0.12)
    page.swaySpeed = randomBetween(decorationRandom, 0.5, 0.95)
    page.swayPhase = decorationRandom() * Math.PI * 2
  }

  const driftingPageList: DriftingPage[] = []
  for (let pageIndex = 0; pageIndex < DRIFTING_PAGE_COUNT; pageIndex++) {
    // 尺寸逐張隨機：整批一樣大會讀成同一個貼片複製了十份
    const pageWidth = randomBetween(
      decorationRandom,
      DRIFTING_PAGE_MIN_WIDTH,
      DRIFTING_PAGE_MAX_WIDTH,
    )
    const pageMesh = createBeveledBox(
      `stoneHopDriftingPage${pageIndex}`,
      scene,
      {
        width: pageWidth,
        height: 0.014,
        depth: pageWidth * randomBetween(decorationRandom, 0.7, 0.84),
        bevel: 0.03,
      },
      driftingPageMaterial,
    )
    // 每張各自的微量抖動，翻面時輪廓不會十張一模一樣
    applyVertexJitter(pageMesh, {
      seed: createSeedFrom(pageIndex, 11),
      amount: 0.02,
      axisScale: { y: 0.12 },
    })
    const page: DriftingPage = {
      mesh: pageMesh,
      driftSpeedZ: DRIFTING_PAGE_MIN_SPEED,
      driftSpeedX: 0,
      swaySpeed: 0.6,
      swayPhase: 0,
      baseY: DRIFTING_PAGE_MIN_Y,
      baseYaw: 0,
    }
    // 出生點沿整段行程往回錯開，開場才不是十張一起從同一處飄進來
    respawnDriftingPage(page, -22 + pageIndex * 2.2)
    driftingPageList.push(page)
  }

  // --- 落點預測環與力道條 ---
  // 這兩個是功能性 UI：預測環的位置與半徑是玩家判斷落點的唯一依據，
  // 一律不做頂點抖動，寧可看起來規整也不能有視覺誤差
  const aimRingMesh = CreateTorus(
    'stoneHopAimRing',
    { diameter: 1, thickness: 0.16, tessellation: 18 },
    scene,
  )
  aimRingMesh.convertToFlatShadedMesh()
  aimRingMesh.material = aimRingMaterial
  aimRingMesh.isPickable = false
  aimRingMesh.setEnabled(false)

  const powerGaugeNode = new TransformNode('stoneHopPowerGauge', scene)
  powerGaugeNode.setEnabled(false)
  const gaugeTrackMesh = createBeveledBox(
    'stoneHopGaugeTrack',
    scene,
    { width: 1.8, height: 0.06, depth: 0.24, bevel: 0.03 },
    gaugeTrackMaterial,
  )
  gaugeTrackMesh.parent = powerGaugeNode
  const gaugeFillMesh = createBeveledBox(
    'stoneHopGaugeFill',
    scene,
    { width: 1.8, height: 0.08, depth: 0.18, bevel: 0.03 },
    gaugeFillMaterial,
  )
  gaugeFillMesh.position.y = 0.03
  gaugeFillMesh.parent = powerGaugeNode

  // --- 鱈魚 ---
  // 俯視取景：瞳孔看向兩側才落在輪廓邊緣讀得出來，看正前方只剩一顆白球
  const codModel = createCodModel(scene, { pupilGazeMode: 'sideways' })
  codModel.lieNode.rotation.z = LYING_ROLL
  lighting.addShadowCaster(...codModel.meshList)

  // --- 遊戲狀態 ---
  const platformList: PlatformSpec[] = [START_PLATFORM]
  /** 各荷葉被踩後的累積時間，離開後仍持續下沉。離開視野時一併清掉不讓它長大 */
  const lilyPadStandElapsedMap = new Map<number, number>()

  const squashSpring = createSquashSpring()
  const gazeWorldPoint = new Vector3()

  let phase: GamePhase = 'ready'
  let elapsedSeconds = 0
  let chargeState = INITIAL_CHARGE_STATE
  let currentPlatformIndex = 0
  /** 站姿相對落腳點中心的偏移，鉛筆漂移時魚才會跟著走 */
  let standOffsetX = 0
  let standOffsetZ = 0
  let fishX = 0
  let fishY = PLATFORM_TOP_Y
  let fishZ = 0
  let fishHeading = 0
  let fishPitch = 0
  let fishRoll = 0
  let fishWavePhase = 0
  let hopArc: HopArc | null = null
  let hopElapsed = 0
  let hopRollSign = 1
  /** 苔石打滑：起滑時間與方向，位移用解析解算，與幀率無關 */
  let slideElapsed = Number.POSITIVE_INFINITY
  let slideDirectionX = 0
  let slideDirectionZ = 1
  let stumbleElapsed = Number.POSITIVE_INFINITY
  let fallElapsed = 0
  let fallVelocityY = 0
  let stepCount = 0
  let comboCount = 0
  let isPortrait = false
  let cameraRadius = LANDSCAPE_RADIUS
  /** 落地鏡頭下沉的計時與力度（跳越遠沉越深） */
  let landingDipElapsed = Number.POSITIVE_INFINITY
  let landingDipStrength = 0
  /** 注視點基準高度另外存，下沉偏移才不會回頭污染 damp 的收斂 */
  let cameraBaseTargetY = 0.6

  function findPlatform(index: number): PlatformSpec | undefined {
    const firstIndex = platformList[0]?.index ?? 0
    return platformList[index - firstIndex]
  }

  function getCurrentPlatform(): PlatformSpec {
    return findPlatform(currentPlatformIndex) ?? START_PLATFORM
  }

  function getPlatformSinkDepth(spec: PlatformSpec): number {
    if (spec.kind !== 'lilyPad') {
      return 0
    }
    const standElapsed = lilyPadStandElapsedMap.get(spec.index)
    return standElapsed === undefined ? 0 : getLilyPadSinkDepth(standElapsed)
  }

  /** 維持「身後兩顆、身前九顆」的滑動窗，前端長出新石頭、後端丟掉舊的，
   * 物件池才不會無限累積
   */
  function updatePlatformStream() {
    const firstWantedIndex = Math.max(0, currentPlatformIndex - VISIBLE_BEHIND_COUNT)
    while ((platformList[0]?.index ?? 0) < firstWantedIndex) {
      const removed = platformList.shift()
      if (removed) {
        lilyPadStandElapsedMap.delete(removed.index)
      }
    }
    const lastWantedIndex = currentPlatformIndex + VISIBLE_AHEAD_COUNT
    while ((platformList[platformList.length - 1]?.index ?? 0) < lastWantedIndex) {
      platformList.push(appendPlatform(platformList[platformList.length - 1]!))
    }
  }

  function applyPlatformAppearance(view: PlatformView, spec: PlatformSpec) {
    for (const kind of Object.keys(view.kindNodeMap) as PlatformKind[]) {
      view.kindNodeMap[kind].setEnabled(kind === spec.kind)
    }
    // 水平一律等比縮放，且視覺比判定半徑放大一圈（判定從寬）：
    // 各型別輪廓多半內縮於建模基準圓，外擴 12% 後視覺才處處不小於致命判定，
    // 玩家不會被看不見的邊界陰到；拉長壓扁仍然禁止，可站範圍不能變形
    const scale = (spec.radius * 1.12) / PLATFORM_BASE_RADIUS
    view.rootNode.scaling.set(scale, 1, scale)
    // 鉛筆順著水流躺平，只給一點歪斜；其餘轉個角度，同一份幾何看起來像不同石頭
    view.rootNode.rotation.y = spec.kind === 'driftwood'
      ? ((spec.index * 0.61) % 0.36) - 0.18
      : (spec.index * 1.37) % (Math.PI * 2)
    view.boundIndex = spec.index
  }

  function updatePlatformViewList() {
    for (const view of platformViewList) {
      view.rootNode.setEnabled(false)
    }
    for (const spec of platformList) {
      // 可視窗最多剛好裝滿池子，序號取餘數即為互不衝突的固定席位。
      // 同一顆落腳點因此永遠對到同一份幾何，靠近時不會突然換一副長相
      const view = platformViewList[spec.index % PLATFORM_POOL_SIZE]!
      view.rootNode.setEnabled(true)
      if (view.boundIndex !== spec.index) {
        applyPlatformAppearance(view, spec)
      }
      view.rootNode.position.set(
        getPlatformCenterX(spec, elapsedSeconds),
        PLATFORM_TOP_Y - getPlatformSinkDepth(spec),
        spec.centerZ,
      )
    }
  }

  function updateBankChunkList() {
    for (const chunkNode of bankChunkList) {
      if (chunkNode.position.z < fishZ - BANK_BEHIND_MARGIN) {
        chunkNode.position.z += BANK_SPAN
      }
    }
  }

  /** 碎浪白點跟著波形上下並在身後回收。位置只在越界時搬一次，其餘只寫 y */
  function updateFoamFleckList() {
    for (const fleckMesh of foamFleckList) {
      if (fleckMesh.position.z < fishZ - FOAM_BEHIND_MARGIN) {
        fleckMesh.position.z += FOAM_SPAN
      }
      fleckMesh.position.y = getWaveHeight(
        fleckMesh.position.x,
        fleckMesh.position.z,
        elapsedSeconds,
      ) + 0.05
    }
  }

  /** 岸邊靜物與岩壁共用一套回收：落到身後就整叢往前搬一個週期。
   * 只改 z，叢內的擺法與幾何完全不動
   */
  function updateWritingPropClusterList() {
    for (const clusterNode of writingPropClusterNodeList) {
      if (clusterNode.position.z < fishZ - BANK_BEHIND_MARGIN) {
        clusterNode.position.z += BANK_SPAN
      }
    }
  }

  /** 飄頁：順流往 -Z 去，與逆流而上的魚背道而馳。
   * 翻轉與浮沉全由 sampleOrganicSway 驅動，三個軸各取不同相位與速度，
   * 繞單一軸等速轉會讀成機械旋轉；飄出視野後回收再放到前方
   */
  function updateDriftingPageList(deltaSeconds: number) {
    for (const page of driftingPageList) {
      page.mesh.position.z -= page.driftSpeedZ * deltaSeconds
      page.mesh.position.x += page.driftSpeedX * deltaSeconds
      if (page.mesh.position.z < fishZ - DRIFTING_PAGE_BEHIND_MARGIN) {
        respawnDriftingPage(page, fishZ)
      }

      const swayTime = elapsedSeconds * page.swaySpeed
      const swirl = sampleOrganicSway(swayTime, page.swayPhase)
      page.mesh.position.y = page.baseY + swirl * DRIFTING_PAGE_SWAY_HEIGHT
      page.mesh.rotation.x = swirl * 0.85
      page.mesh.rotation.y = page.baseYaw
        + sampleOrganicSway(swayTime * 0.61, page.swayPhase + 2.4) * 1.1
      page.mesh.rotation.z = sampleOrganicSway(swayTime * 0.83, page.swayPhase + 4.7) * 0.7
    }
  }

  /** 濺起水花。hasWaterRipple 只在真的破水而入時給——
   * 漣漪的意思是「水面被打破了」，落在石頭、荷葉、漂流木上都是踩在東西「上面」，
   * 給漣漪會變成石頭上莫名其妙盪出水波
   */
  function spawnSplashBurst(x: number, z: number, strength: number, hasWaterRipple = false) {
    // 顆數刻意壓少：水花是落地的標點符號不是主角，噴一大把反而蓋住魚。
    // 改用 easeOutExpo 爆發式推開後，少少幾顆的力道就夠讀了
    const wantedCount = Math.round(2 + strength * 3)
    // 散射方位用不等分角度：等機率圓周灑出來像灑水器，
    // 疏密群聚加一側留白才像真的砸出一灘水
    const scatterAngleList = createClusteredAngleList({
      seed: createSeedFrom(x, z, elapsedSeconds),
      count: wantedCount,
      unevenness: 0.85,
      gapRatio: 0.12,
    })
    let spawnedCount = 0
    for (const flake of splashFlakeList) {
      if (spawnedCount >= wantedCount) {
        break
      }
      if (flake.isActive) {
        continue
      }
      // 前一兩顆當主水珠：更大、更久、噴更高，其餘是碎沫
      const isMainDroplet = spawnedCount < SPLASH_MAIN_DROPLET_COUNT
      const angle = scatterAngleList[spawnedCount] ?? decorationRandom() * Math.PI * 2
      const speed = randomBetween(decorationRandom, 1.1, 3.4) * strength
      flake.baseScale = isMainDroplet
        ? randomBetween(decorationRandom, 1.5, 1.8)
        : randomBetween(decorationRandom, 0.75, 1.15)
      flake.lifetime = isMainDroplet
        ? randomBetween(decorationRandom, 0.7, 0.95)
        : randomBetween(decorationRandom, SPLASH_LIFETIME_MIN, SPLASH_LIFETIME_MAX)
      flake.mesh.position.set(x, PLATFORM_TOP_Y * 0.4, z)
      flake.mesh.scaling.setAll(flake.baseScale)
      flake.mesh.setEnabled(true)
      flake.originX = x
      flake.originZ = z
      flake.directionX = Math.sin(angle)
      flake.directionZ = Math.cos(angle)
      // 最終水平距離＝原本的初速乘壽命，換算過去讓噴散範圍跟調整前相當，
      // 差別只在推出去的時間曲線變成爆發式的 easeOutExpo
      flake.spreadDistance = speed * flake.lifetime * 0.75
      flake.velocityY = (isMainDroplet
        ? randomBetween(decorationRandom, 3.8, 5.8)
        : randomBetween(decorationRandom, 2.6, 5.2)) * strength
      flake.elapsed = 0
      flake.isActive = true
      spawnedCount += 1
    }

    // 破水而入才配一圈往外擴的漣漪
    if (hasWaterRipple) {
      spawnWaterRipple(x, z, 1.1 + strength * 0.9)
    }
  }

  /** 水面盪出一圈往外擴的漣漪。spreadScale 是擴張終點大小。
   * 破水而入與踩上浮體都用這一圈，差別只在大小——後者是浮體被踩沉時
   * 把水往外推，力道本來就該小一號
   */
  function spawnWaterRipple(x: number, z: number, spreadScale: number) {
    for (const ripple of splashRippleList) {
      if (ripple.isActive) {
        continue
      }
      ripple.elapsed = 0
      ripple.baseScale = spreadScale
      ripple.mesh.position.set(x, 0.09, z)
      ripple.mesh.scaling.setAll(0.05)
      ripple.mesh.visibility = 1
      ripple.mesh.setEnabled(true)
      ripple.isActive = true
      break
    }
  }

  function updateSplashFlakeList(deltaSeconds: number) {
    for (const flake of splashFlakeList) {
      if (!flake.isActive) {
        continue
      }
      flake.elapsed += deltaSeconds
      if (flake.elapsed >= flake.lifetime) {
        flake.isActive = false
        flake.mesh.setEnabled(false)
        continue
      }
      const lifeRatio = flake.elapsed / flake.lifetime
      // 水平：easeOutExpo 一瞬間就衝到大半距離，之後幾乎停住——
      // 等速外飛看起來是「飄」，爆發式推出去才有被砸開的力道
      const spreadRatio = easeOutExpo(lifeRatio)
      flake.mesh.position.x = flake.originX + flake.directionX * flake.spreadDistance * spreadRatio
      flake.mesh.position.z = flake.originZ + flake.directionZ * flake.spreadDistance * spreadRatio
      // 垂直維持重力積分：拋物線的弧才是對的，硬套曲線反而假
      flake.velocityY -= SPLASH_GRAVITY * deltaSeconds
      flake.mesh.position.y += flake.velocityY * deltaSeconds
      // 前七成幾乎不縮、尾段 easeInCubic 快速收掉：
      // 線性縮小會讓整批水珠像排練好的齊步走
      const shrinkRatio = lifeRatio < 0.7
        ? (lifeRatio / 0.7) * 0.18
        : 0.18 + easeInCubic((lifeRatio - 0.7) / 0.3) * 0.82
      flake.mesh.scaling.setAll(Math.max(0.05, flake.baseScale * (1 - shrinkRatio)))
    }
  }

  /** 入水漣漪：快擴慢停、透明度同曲線收掉。等速擴張讀起來像雷達波 */
  function updateSplashRippleList(deltaSeconds: number) {
    for (const ripple of splashRippleList) {
      if (!ripple.isActive) {
        continue
      }
      ripple.elapsed += deltaSeconds
      const spreadRatio = ripple.elapsed / SPLASH_RIPPLE_LIFETIME
      if (spreadRatio >= 1) {
        ripple.isActive = false
        ripple.mesh.setEnabled(false)
        continue
      }
      const spread = easeOutCubic(spreadRatio)
      const rippleScale = ripple.baseScale * (0.2 + 0.8 * spread)
      ripple.mesh.scaling.set(rippleScale, 1, rippleScale)
      ripple.mesh.visibility = 1 - spread
    }
  }

  /** 目前瞄準的落腳點：永遠是下一顆。方向自動對準、距離交給玩家，
   * 單指才有辦法同時應付側向偏移的石陣
   */
  function getAimPoint(): { x: number; z: number } {
    const nextSpec = findPlatform(currentPlatformIndex + 1)
    if (!nextSpec) {
      return { x: fishX, z: fishZ + 1 }
    }
    return { x: getPlatformCenterX(nextSpec, elapsedSeconds), z: nextSpec.centerZ }
  }

  function startFalling() {
    phase = 'falling'
    fallElapsed = 0
    fallVelocityY = -1.2
    aimRingMesh.setEnabled(false)
    powerGaugeNode.setEnabled(false)
    // 這裡是真的掉進水裡，漣漪要有
    spawnSplashBurst(fishX, fishZ, 1.2, true)
  }

  function beginCharge() {
    if (phase !== 'ready') {
      return
    }
    phase = 'charging'
    chargeState = INITIAL_CHARGE_STATE
  }

  function releaseCharge() {
    if (phase !== 'charging') {
      return
    }
    const aimPoint = getAimPoint()
    const distance = getHopDistance(chargeState.power)
    hopArc = createHopArc(fishX, fishZ, aimPoint.x, aimPoint.z, distance)
    hopElapsed = 0
    hopRollSign *= -1
    phase = 'hopping'
    slideElapsed = Number.POSITIVE_INFINITY
    aimRingMesh.setEnabled(false)
    powerGaugeNode.setEnabled(false)
    // 蓄力放開：目標拉回原形，再補一次伸展衝擊，身體在離地前就開始往上長
    squashSpring.setTarget(1)
    squashSpring.applyImpulse(STRETCH_IMPULSE * (0.4 + chargeState.power))
  }

  /** 找落點最近的前方落腳點並評價。跳過中間的石頭也算數，步數一次加好幾步 */
  function resolveLanding(arc: HopArc) {
    let nearestSpec: PlatformSpec | undefined
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const spec of platformList) {
      if (spec.index <= currentPlatformIndex) {
        continue
      }
      const distance = Math.hypot(
        getPlatformCenterX(spec, elapsedSeconds) - arc.endX,
        spec.centerZ - arc.endZ,
      )
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestSpec = spec
      }
    }

    if (!nearestSpec) {
      startFalling()
      return
    }

    const grade: LandingGrade = evaluateLandingGrade(nearestDistance, nearestSpec.radius)
    if (!hasLandedOnPlatform(grade)) {
      startFalling()
      return
    }

    stepCount += nearestSpec.index - currentPlatformIndex
    currentPlatformIndex = nearestSpec.index
    standOffsetX = arc.endX - getPlatformCenterX(nearestSpec, elapsedSeconds)
    standOffsetZ = arc.endZ - nearestSpec.centerZ
    comboCount = getNextCombo(comboCount, grade)
    context.reportScore(stepCount)

    // 落地撞擊：跳越遠壓越深，回彈與收斂交給彈簧
    const impactStrength = clamp(arc.distance / MAX_HOP_DISTANCE, 0.4, 1)
    squashSpring.applyImpulse(-LANDING_IMPULSE * impactStrength)
    // 鏡頭跟著沉一下再彈回，著地才有重量
    landingDipElapsed = 0
    landingDipStrength = impactStrength

    if (grade === 'perfect') {
      spawnSplashBurst(arc.endX, arc.endZ, 1.3)
      context.reportToast(comboCount >= 2 ? `完美！連段 ×${comboCount}` : '完美！')
    }
    else if (grade === 'edge') {
      stumbleElapsed = 0
      spawnSplashBurst(arc.endX, arc.endZ, 0.5)
    }
    else {
      spawnSplashBurst(arc.endX, arc.endZ, 0.7)
    }

    // 踩上浮體：荷葉、漂流木被踩沉時會把水往外推，盪一圈漣漪。
    // 石頭是踩在實心的東西上，水面沒被動到，所以不給
    if (nearestSpec.kind === 'lilyPad' || nearestSpec.kind === 'driftwood') {
      spawnWaterRipple(arc.endX, arc.endZ, 1 + impactStrength * 0.7)
    }

    if (nearestSpec.kind === 'lilyPad') {
      lilyPadStandElapsedMap.set(nearestSpec.index, 0)
    }
    if (nearestSpec.kind === 'mossStone') {
      // 打滑沿著跳躍方向續走，可能把魚推出邊界，這是苔石的風險所在
      slideElapsed = 0
      slideDirectionX = Math.sin(arc.heading)
      slideDirectionZ = Math.cos(arc.heading)
    }

    phase = 'ready'
    hopArc = null
  }

  function updateGroundedFish(deltaSeconds: number) {
    const spec = getCurrentPlatform()

    if (slideElapsed !== Number.POSITIVE_INFINITY) {
      const previousOffset = getMossSlideOffset(slideElapsed)
      slideElapsed += deltaSeconds
      const slideStep = getMossSlideOffset(slideElapsed) - previousOffset
      standOffsetX += slideDirectionX * slideStep
      standOffsetZ += slideDirectionZ * slideStep
    }

    const sinkDepth = getPlatformSinkDepth(spec)
    fishX = getPlatformCenterX(spec, elapsedSeconds) + standOffsetX
    fishZ = spec.centerZ + standOffsetZ
    fishY = PLATFORM_TOP_Y - sinkDepth
    fishPitch = 0

    // 踉蹌：踩到邊緣時身體左右晃兩下再站穩，衰減震盪才有「越晃越小」的分量
    if (stumbleElapsed < STUMBLE_DURATION) {
      stumbleElapsed += deltaSeconds
      const stumbleRatio = clampRatio(stumbleElapsed / STUMBLE_DURATION)
      fishRoll = computeDecayingWobble(stumbleRatio, 3, 1.4) * 0.42
    }
    else {
      fishRoll = damp(fishRoll, 0, 8, deltaSeconds)
    }

    // 站著時朝向下一顆石頭，玩家看得出要往哪跳
    const aimPoint = getAimPoint()
    const targetHeading = Math.atan2(aimPoint.x - fishX, aimPoint.z - fishZ)
    fishHeading = damp(fishHeading, targetHeading, 8, deltaSeconds)

    // 滑出邊界或荷葉沉沒都算落水
    if (Math.hypot(standOffsetX, standOffsetZ) > spec.radius) {
      startFalling()
      return
    }
    if (isLilyPadSunk(sinkDepth)) {
      startFalling()
    }
  }

  function updateChargingVisual() {
    const aimPoint = getAimPoint()
    const previewArc = createHopArc(
      fishX,
      fishZ,
      aimPoint.x,
      aimPoint.z,
      getHopDistance(chargeState.power),
    )
    // 預測環：位置就是落點，環半徑再隨力道漲一點，餘光也讀得到蓄了多少
    const ringScale = 1.1 + 0.7 * chargeState.power
    aimRingMesh.setEnabled(true)
    aimRingMesh.position.set(previewArc.endX, PLATFORM_TOP_Y + 0.06, previewArc.endZ)
    aimRingMesh.scaling.set(ringScale, 1, ringScale)

    // 力道條平躺在魚後方的水面上，不擋住前方的路
    powerGaugeNode.setEnabled(true)
    powerGaugeNode.position.set(fishX, PLATFORM_TOP_Y + 0.1, fishZ - 1.15)
    gaugeFillMesh.scaling.x = Math.max(0.001, chargeState.power)
    gaugeFillMesh.position.x = -0.9 * (1 - chargeState.power)
  }

  function updateFishNode(deltaSeconds: number) {
    const squash = squashSpring.advance(deltaSeconds)
    // 體積守恆：壓扁時橫向撐開，看起來才有彈性而非單純變矮
    const horizontalScale = FISH_SCALE / Math.sqrt(squash)
    codModel.rootNode.position.set(fishX, fishY + COD_LYING_LIFT * FISH_SCALE, fishZ)
    codModel.rootNode.rotation.y = fishHeading
    // Babylon rotation.x 正值為低頭，pitch 正值為抬頭，故取負
    codModel.rootNode.rotation.x = -fishPitch
    codModel.lieNode.rotation.z = LYING_ROLL + fishRoll
    codModel.rootNode.scaling.set(horizontalScale, FISH_SCALE * squash, horizontalScale)

    const aimPoint = getAimPoint()
    gazeWorldPoint.set(aimPoint.x, PLATFORM_TOP_Y + 0.35, aimPoint.z)
    codModel.update({
      deltaSeconds,
      isMoving: phase === 'hopping' || phase === 'falling',
      wavePhase: phase === 'hopping' ? fishWavePhase : undefined,
      waveStrength: 1,
      gazeTarget: phase === 'falling' ? null : gazeWorldPoint,
    })
  }

  function applyCameraFraming() {
    isPortrait = context.getAspectRatio() < 0.9
    camera.beta = isPortrait ? PORTRAIT_BETA : LANDSCAPE_BETA
    cameraRadius = isPortrait ? PORTRAIT_RADIUS : LANDSCAPE_RADIUS
  }

  function updateCamera(deltaSeconds: number) {
    const chargePower = phase === 'charging' ? chargeState.power : 0
    const targetRadius = cameraRadius - CHARGE_ZOOM_IN * chargePower
    camera.radius = damp(camera.radius, targetRadius, 6, deltaSeconds)
    camera.alpha = CAMERA_ALPHA

    // 落地下沉回彈：注視點壓低再彈回，衰減震盪自帶收尾
    cameraBaseTargetY = damp(cameraBaseTargetY, 0.6, CAMERA_FOLLOW_RATE, deltaSeconds)
    let dipOffset = 0
    if (landingDipElapsed < LANDING_DIP_DURATION) {
      landingDipElapsed += deltaSeconds
      const dipRatio = clampRatio(landingDipElapsed / LANDING_DIP_DURATION)
      dipOffset = -computeDecayingWobble(dipRatio, 2, 1.3) * LANDING_DIP_DEPTH * landingDipStrength
    }

    camera.target.set(
      damp(camera.target.x, fishX * 0.5, CAMERA_FOLLOW_RATE, deltaSeconds),
      cameraBaseTargetY + dipOffset,
      damp(camera.target.z, fishZ + CAMERA_LOOK_AHEAD, CAMERA_FOLLOW_RATE, deltaSeconds),
    )
  }

  function update(deltaSeconds: number) {
    elapsedSeconds += deltaSeconds

    for (const [padIndex, standElapsed] of lilyPadStandElapsedMap) {
      lilyPadStandElapsedMap.set(padIndex, standElapsed + deltaSeconds)
    }

    if (phase === 'charging') {
      chargeState = advanceChargePower(chargeState, deltaSeconds)
      squashSpring.setTarget(getCrouchSquashTarget(chargeState.power))
      updateGroundedFish(deltaSeconds)
      if (phase === 'charging') {
        updateChargingVisual()
      }
    }
    else if (phase === 'ready') {
      squashSpring.setTarget(1)
      updateGroundedFish(deltaSeconds)
    }
    else if (phase === 'hopping' && hopArc) {
      hopElapsed += deltaSeconds
      const progress = clamp(hopElapsed / hopArc.duration, 0, 1)
      const sample = sampleHopArc(hopArc, progress, hopRollSign)
      fishX = sample.x
      fishZ = sample.z
      fishY = PLATFORM_TOP_Y + sample.y
      fishPitch = sample.pitch
      fishRoll = sample.roll
      fishWavePhase = sample.wavePhase
      fishHeading = hopArc.heading
      if (progress >= 1) {
        resolveLanding(hopArc)
      }
    }
    else if (phase === 'falling') {
      fallElapsed += deltaSeconds
      fallVelocityY -= FALL_GRAVITY * deltaSeconds
      fishY += fallVelocityY * deltaSeconds
      // 落水翻滾：入水瞬間轉最快，之後被水拖住失速。等速旋轉沒有阻力感
      const fallRatio = clampRatio(fallElapsed / FALL_REPORT_DELAY)
      fishRoll += deltaSeconds * FALL_ROLL_SPEED * (1 - easeOutCubic(fallRatio))
      fishPitch = damp(fishPitch, -0.5, 4, deltaSeconds)
      squashSpring.setTarget(1)
      if (fallElapsed >= FALL_REPORT_DELAY) {
        context.reportGameOver()
      }
    }

    updatePlatformStream()
    updatePlatformViewList()
    updateBankChunkList()
    updateWritingPropClusterList()
    updateFoamFleckList()
    updateDriftingPageList(deltaSeconds)
    updateSplashFlakeList(deltaSeconds)
    updateSplashRippleList(deltaSeconds)
    updateFishNode(deltaSeconds)
    waterSurface.update(elapsedSeconds, fishZ)
    setWaterRippleTime(elapsedSeconds)
    streamBedMesh.position.z = fishZ
    for (const bankGround of bankGroundNodeList) {
      bankGround.position.z = fishZ
    }
    updateCamera(deltaSeconds)
  }

  return {
    start() {
      applyCameraFraming()
      camera.alpha = CAMERA_ALPHA
      camera.radius = cameraRadius
      camera.target.set(0, 0.6, CAMERA_LOOK_AHEAD)
      squashSpring.reset()
      updatePlatformStream()
      updatePlatformViewList()
      // 倒影清單在世界建好後才收：這時石陣池、鱈魚、兩岸都在場上了。
      // 水面自己與水面下的東西一律排除——水底本來就照不出倒影，
      // 放進去只是白白多畫一次
      waterMirror.renderList = scene.meshes.filter((mesh) => (
        mesh !== waterSurface.mesh
        && mesh !== streamBedMesh
        && mesh.isEnabled()
      ))
      context.reportScore(0)
      update(0)
    },
    update,
    handlePointer(event) {
      if (event.type === 'down') {
        beginCharge()
      }
      else if (event.type === 'up' || event.type === 'cancel') {
        releaseCharge()
      }
    },
    handleKey(event) {
      // host 只轉發 keydown，因此空白鍵設計成「按一次開始蓄力、再按一次起跳」，
      // 鍵盤玩家同樣拿得到往復蓄力的節奏
      if (event.code !== 'Space' && event.key !== ' ') {
        return
      }
      if (phase === 'ready') {
        beginCharge()
      }
      else if (phase === 'charging') {
        releaseCharge()
      }
    },
    resize() {
      applyCameraFraming()
    },
    dispose() {
      // 網格、材質與相機都在 host 的 Scene 裡，由 scene.dispose() 統一回收；
      // 這款沒有 Blob URL、計時器或事件監聽，只需清掉自己持有的狀態表
      lilyPadStandElapsedMap.clear()
      platformList.length = 0
      // 倒影清單持有整場的網格參照，先清空再讓 scene.dispose() 收走貼圖，
      // 免得 render target 還抓著一堆已銷毀的網格
      waterMirror.renderList = []
    },
  }
}
