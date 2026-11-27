import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { fillBox, placeOakTree, plantWithStack } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { fillHeightStep } from '../realm-terrain-kit'
import {
  MEADOW_CENTER,
  MEADOW_GROUND_Y,
  MEADOW_OUTER_RADIUS,
  MEADOW_PORTAL_POINT,
  MEADOW_SLOW_RADIUS,
  measureMeadowHeight,
  measureMeadowRadius,
} from './meadow-layout'
import { MEADOW_REALM } from './meadow-realm'

/**
 * 野花原的地形
 *
 * 只有地形 worker 用。整片照草苑（buildMeadowGarden）放大：草地上撒滿高草與五種花，
 * 機率與比例都照草苑；孤樹與樹下的長凳也照草苑的擺法，只是一座丘頂一棵、彼此隔得很遠。
 * 草苑「什麼都不能有」，這裡也一樣：沒有路、沒有燈、沒有房子，只有草、花、丘與幾棵樹。
 *
 * 順序：地面 → 孤樹與長凳 → 花草 → 傳送門（門洞前後與木牌前面的花草由它清掉）
 */

/** 草苑撒花草的機率，整片照用 */
const PLANT_CHANCE = 0.62

/**
 * 草苑的花草比例（高草、蒲公英、鬱金香、堇、大花、白蒲公英）
 *
 * 寫成累積的門檻，與 buildMeadowGarden 那一串 if 同一組數字
 */
const PLANT_THRESHOLD_LIST: { threshold: number; blockId: BlockId }[] = [
  { threshold: 0.46, blockId: BlockId.TALL_GRASS },
  { threshold: 0.62, blockId: BlockId.FLOWER_DANDELION },
  { threshold: 0.74, blockId: BlockId.FLOWER_TULIP },
  { threshold: 0.84, blockId: BlockId.FLOWER_VIOLA },
  { threshold: 0.92, blockId: BlockId.BIG_FLOWER },
  { threshold: 1, blockId: BlockId.FLOWER_WHITE_DANDELION },
]

/** 五種花，花叢的主角從這裡挑 */
const FLOWER_LIST = PLANT_THRESHOLD_LIST.slice(1).map((entry) => entry.blockId)

/**
 * 花開成一叢一叢的比例
 *
 * 草苑只有十一格見方，五種花均勻撒著就很好看；攤到幾萬格上會變成一片均勻的雜色。
 * 所以一半的花跟著所在那一帶的「主角」開，一帶是蒲公英的黃、一帶是鬱金香的紅，
 * 另一半照草苑的比例混著撒。高草的份量不變
 */
const PATCH_FLOWER_SHARE = 0.5

/** 孤樹最多幾棵，以及兩棵之間至少隔幾格 */
const LONE_TREE_COUNT_MAX = 6
const LONE_TREE_SPACING = 30

/** 地面，回傳每一格的地表高度 */
function shapeTerrain(state: Uint8Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  /** 先算整張高度圖，填成相鄰兩格最多差一格，人才走得上每一道坡 */
  const heightMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      heightMap[x * WORLD_SIZE + z] = measureMeadowHeight(x, z)
    }
  }
  fillHeightStep(heightMap)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      /** 外圍坡的後面：碰撞照算、不畫，由布景的地面平面代替 */
      if (measureMeadowRadius(x, z) >= MEADOW_OUTER_RADIUS) {
        for (let y = 1; y < MEADOW_GROUND_Y; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, MEADOW_GROUND_Y, z, BlockId.LAKE_BED)
        groundTopMap[x * WORLD_SIZE + z] = MEADOW_GROUND_Y
        continue
      }

      const topY = MEADOW_GROUND_Y + heightMap[x * WORLD_SIZE + z]!
      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, BlockId.GRASS)
      groundTopMap[x * WORLD_SIZE + z] = topY
    }
  }

  return groundTopMap
}

/** 長凳擺在樹的哪一側，以及那一側要用哪一種階梯（靠背朝著樹） */
const BENCH_SIDE_LIST = [
  { x: 1, z: 0, blockId: BlockId.WOOD_STAIRS_WEST },
  { x: 0, z: 1, blockId: BlockId.WOOD_STAIRS_NORTH },
  { x: -1, z: 0, blockId: BlockId.WOOD_STAIRS_EAST },
  { x: 0, z: -1, blockId: BlockId.WOOD_STAIRS_SOUTH },
] as const

/**
 * 找丘頂
 *
 * 每六格取一點，比四周七格內都高（或一樣高）就算丘頂；
 * 由高到低挑，彼此隔三十格以上，太靠外圍或離回程門太近的不要。
 * 孤樹要站在丘頂：站在丘間的話，從別的丘上看過去只露出一截樹冠
 */
function findHilltopList(groundTopMap: Uint8Array): { x: number; z: number }[] {
  const candidateList: { x: number; z: number; topY: number }[] = []
  const searchRadius = 7

  for (let x = searchRadius; x < WORLD_SIZE - searchRadius; x += 6) {
    for (let z = searchRadius; z < WORLD_SIZE - searchRadius; z += 6) {
      if (Math.hypot(x - MEADOW_CENTER.x, z - MEADOW_CENTER.z) > MEADOW_SLOW_RADIUS - 8)
        continue
      if (Math.hypot(x - MEADOW_PORTAL_POINT.x, z - MEADOW_PORTAL_POINT.z) < 14)
        continue

      const topY = groundTopMap[x * WORLD_SIZE + z]!
      if (topY < MEADOW_GROUND_Y + 3)
        continue

      let isPeak = true
      for (let offsetX = -searchRadius; offsetX <= searchRadius && isPeak; offsetX++) {
        for (let offsetZ = -searchRadius; offsetZ <= searchRadius; offsetZ++) {
          if (groundTopMap[(x + offsetX) * WORLD_SIZE + z + offsetZ]! > topY) {
            isPeak = false
            break
          }
        }
      }
      if (isPeak) {
        candidateList.push({ x, z, topY })
      }
    }
  }

  candidateList.sort((a, b) => b.topY - a.topY)
  const hilltopList: { x: number; z: number }[] = []
  for (const candidate of candidateList) {
    if (hilltopList.length >= LONE_TREE_COUNT_MAX)
      break
    if (hilltopList.every((hilltop) => Math.hypot(hilltop.x - candidate.x, hilltop.z - candidate.z) >= LONE_TREE_SPACING)) {
      hilltopList.push({ x: candidate.x, z: candidate.z })
    }
  }
  return hilltopList
}

/**
 * 丘頂的孤樹與樹下的長凳
 *
 * 草苑那棵橡樹六格高，長凳在樹幹旁三格、三格長、靠背朝著樹。
 * 這裡每一棵都照這個擺法，長凳挑一側三格都與樹腳同高的地方放；四側都不平就只種樹
 */
function placeLoneTreeList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('meadow-lone-tree')

  for (const hilltop of findHilltopList(groundTopMap)) {
    const groundY = groundTopMap[hilltop.x * WORLD_SIZE + hilltop.z]! + 1
    placeOakTree(state, hilltop.x, groundY, hilltop.z, 5 + Math.floor(random() * 3))

    const startIndex = Math.floor(random() * BENCH_SIDE_LIST.length)
    for (let attempt = 0; attempt < BENCH_SIDE_LIST.length; attempt++) {
      const side = BENCH_SIDE_LIST[(startIndex + attempt) % BENCH_SIDE_LIST.length]!
      const cellList = [-1, 0, 1].map((along) => ({
        x: hilltop.x + side.x * 3 + (side.x === 0 ? along : 0),
        z: hilltop.z + side.z * 3 + (side.z === 0 ? along : 0),
      }))
      const isFlat = cellList.every((cell) => (
        groundTopMap[cell.x * WORLD_SIZE + cell.z]! + 1 === groundY
        && getBlock(state, cell.x, groundY, cell.z) === BlockId.AIR
      ))
      if (!isFlat)
        continue
      for (const cell of cellList) {
        setBlock(state, cell.x, groundY, cell.z, side.blockId)
      }
      break
    }
  }
}

/** 這一帶的花叢主角：低頻噪音切成五塊，一塊一種花 */
function pickPatchFlower(x: number, z: number): BlockId {
  const patch = (fbm2D(x * 0.05 + 41, z * 0.05 - 27, 2, 0.5) + 1) / 2
  const index = Math.min(FLOWER_LIST.length - 1, Math.max(0, Math.floor(patch * FLOWER_LIST.length)))
  return FLOWER_LIST[index]!
}

/** 照草苑的比例挑一種 */
function pickMeadowPlant(roll: number): BlockId {
  return PLANT_THRESHOLD_LIST.find((entry) => roll < entry.threshold)?.blockId ?? BlockId.TALL_GRASS
}

/**
 * 滿地的高草與花
 *
 * 機率照草苑，高草的份量也照草苑；花有一半跟著那一帶的主角開，見 PATCH_FLOWER_SHARE
 */
function scatterPlantList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('meadow-plant')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (random() > PLANT_CHANCE)
        continue
      const roll = random()
      const isPatch = random() < PATCH_FLOWER_SHARE
      if (measureMeadowRadius(x, z) >= MEADOW_OUTER_RADIUS)
        continue

      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY - 1, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      const isFlower = roll >= PLANT_THRESHOLD_LIST[0]!.threshold
      const blockId = isFlower && isPatch ? pickPatchFlower(x, z) : pickMeadowPlant(roll)
      plantWithStack(state, x, groundY, z, blockId, random)
    }
  }
}

/** 生成整片野花原 */
export function generateMeadowWorld(state: Uint8Array): void {
  const groundTopMap = shapeTerrain(state)
  placeLoneTreeList(state, groundTopMap)
  scatterPlantList(state, groundTopMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of MEADOW_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
