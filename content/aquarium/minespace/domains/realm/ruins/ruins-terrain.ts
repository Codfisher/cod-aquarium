import type { RuinsRect } from './ruins-layout'
import { createSeededRandom, fbm2D, smoothStep } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { fillBox, placeStandingStone, placeStoneLantern, plantWithStack, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import {
  ARCH_Z,
  CHAMBER_RECT,
  CHAMBER_SEEP_POINT,
  CHAMBER_WALL_HEIGHT,
  COLONNADE_COLUMN_X_LIST,
  COLONNADE_COLUMN_Z_FROM,
  COLONNADE_COLUMN_Z_TO,
  COLONNADE_RECT,
  HALL_RECT,
  HALL_STELE_POINT,
  RUINS_CENTER,
  RUINS_FOOT_Y,
  RUINS_GROUND_Y,
  RUINS_PORTAL_POINT,
  RUINS_RIM_HEIGHT,
  RUINS_RIM_RADIUS,
  RUINS_RIM_START_RADIUS,
  RUINS_TERRACE_Y,
  STELE_RING_RADIUS,
} from './ruins-layout'
import { RUINS_REALM } from './ruins-realm'

/**
 * 石殿遺址的地形
 *
 * 只有地形 worker 用。整座照石廊跡（buildRuinsGarden）放大：只有石頭——石板地、石磚柱與牆、
 * 刻紋石碑、半磚橫樑、青苔圓石、藤蔓、倒下的青苔石、石燈籠；花草只有石生植物、高草與灌叢，同一個比例。
 * 沒有樹，也沒有木頭（石廊跡一根都沒有）。
 *
 * 順序：地面與殿基 → 大殿的牆與柱 → 石廊跡那一圈 → 石室 → 長廊與拱門 → 積水 → 燈籠
 * → 殿外的亂石 → 花草 → 傳送門（門洞與木牌前的花草由它清掉）
 */

/** 石柱、牆用的石磚：三成是青苔圓石，照石廊跡 */
function pickWallBlock(random: () => number): BlockId {
  return random() < 0.3 ? BlockId.MOSSY_COBBLESTONE : BlockId.STONE_BRICKS
}

function isInsideRect(x: number, z: number, rect: RuinsRect, margin = 0): boolean {
  return x >= rect.minX - margin && x <= rect.maxX + margin && z >= rect.minZ - margin && z <= rect.maxZ + margin
}

/** 殿基：長廊、大殿與石室底下那一整塊石台 */
function isTerrace(x: number, z: number): boolean {
  return isInsideRect(x, z, COLONNADE_RECT) || isInsideRect(x, z, HALL_RECT, 1) || isInsideRect(x, z, CHAMBER_RECT, 1)
}

function measureDistance(x: number, z: number, point: { x: number; z: number }): number {
  return Math.hypot(x - point.x, z - point.z)
}

/** 這一格離遺址中心多遠（吃一層低頻噪音），亂石坡的邊才不是一個圓 */
function measureBasinRadius(x: number, z: number): number {
  return measureDistance(x, z, RUINS_CENTER) + fbm2D(x * 0.03 - 9, z * 0.03 + 31, 2, 0.5) * 7
}

/**
 * 亂石坡想要多高
 *
 * 荒地是平的；過了 RUINS_RIM_START_RADIUS 照平滑曲線往上抬，到坡頂剛好高出 RUINS_RIM_HEIGHT 格，
 * 再疊一層噪音，坡面是一塊一塊隆起的亂石，鬆弛之後仍一格一格走得上去
 */
function measureRimHeight(x: number, z: number, radius: number): number {
  if (radius <= RUINS_RIM_START_RADIUS)
    return 0
  if (radius > RUINS_RIM_RADIUS)
    return RUINS_RIM_HEIGHT
  const ratio = (radius - RUINS_RIM_START_RADIUS) / (RUINS_RIM_RADIUS - RUINS_RIM_START_RADIUS)
  const bump = fbm2D(x * 0.11 + 17, z * 0.11 - 3, 2, 0.5) * 2
  return Math.max(0, Math.min(RUINS_RIM_HEIGHT, Math.round(smoothStep(ratio) * RUINS_RIM_HEIGHT + bump)))
}

/** 鬆弛：任何一格都不比四鄰的最低那格高出一格以上，坡才走得上去（同營火谷） */
function relaxHeightMap(heightMap: Int8Array): void {
  for (let pass = 0; pass < RUINS_RIM_HEIGHT + 2; pass++) {
    for (let x = 1; x < WORLD_SIZE - 1; x++) {
      for (let z = 1; z < WORLD_SIZE - 1; z++) {
        const index = x * WORLD_SIZE + z
        const lowest = Math.min(
          heightMap[index + WORLD_SIZE]!,
          heightMap[index - WORLD_SIZE]!,
          heightMap[index + 1]!,
          heightMap[index - 1]!,
        )
        heightMap[index] = Math.min(heightMap[index]!, lowest + 1)
      }
    }
  }
}

/**
 * 坡面的材質
 *
 * 越高越是裸露的岩：低處還是草，往上一塊一塊的圓石與青苔圓石，坡頂一片灰岩
 */
function pickRimSurface(x: number, z: number, height: number): BlockId {
  const roll = fbm2D(x * 0.21 + 5, z * 0.21 + 9, 2, 0.5)
  if (height <= 1)
    return roll > 0.45 ? BlockId.MOSSY_COBBLESTONE : BlockId.GRASS
  if (height <= 4)
    return roll > 0.25 ? BlockId.COBBLESTONE : roll > -0.1 ? BlockId.MOSSY_COBBLESTONE : BlockId.GRASS
  return roll > 0.3 ? BlockId.COBBLESTONE : BlockId.STONE
}

/** 地面：荒地、亂石坡、坡頂外不畫的 LAKE_BED，以及殿基的石台；回傳每一格的地面頂面高度 */
function shapeTerrain(state: Uint8Array, random: () => number): Uint8Array {
  const heightMap = new Int8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      heightMap[x * WORLD_SIZE + z] = measureRimHeight(x, z, measureBasinRadius(x, z))
    }
  }
  relaxHeightMap(heightMap)

  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = x * WORLD_SIZE + z
      const height = heightMap[index]!
      const topY = RUINS_GROUND_Y + height

      /** 坡頂外面：碰撞照算、不畫，由布景那片鋪到地平線的岩地平面代替 */
      if (measureBasinRadius(x, z) > RUINS_RIM_RADIUS + 2) {
        for (let y = 1; y < topY; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, topY, z, BlockId.LAKE_BED)
        groundTopMap[index] = topY
        continue
      }

      if (isTerrace(x, z)) {
        for (let y = 1; y < RUINS_TERRACE_Y; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        /**
         * 石板縫裡長出青苔圓石與草，照石廊跡：四分之一的石板，六成青苔、四成草。
         * 殿基最外一圈是石磚砌的邊，從荒地看過去是一道一格高的台基
         */
        const isEdge = !isTerrace(x + 1, z) || !isTerrace(x - 1, z) || !isTerrace(x, z + 1) || !isTerrace(x, z - 1)
        let blockId: BlockId = isEdge ? BlockId.STONE_BRICKS : BlockId.STONE_TILE
        if (!isEdge && random() < 0.25) {
          blockId = random() < 0.6 ? BlockId.MOSSY_COBBLESTONE : BlockId.GRASS
        }
        setBlock(state, x, RUINS_TERRACE_Y, z, blockId)
        groundTopMap[index] = RUINS_TERRACE_Y
        continue
      }

      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = Math.max(1, topY - 2); y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, pickRimSurface(x, z, height))
      groundTopMap[index] = topY
    }
  }

  return groundTopMap
}

/**
 * 一根石柱
 *
 * 整根的柱頂壓一片半磚當柱頭；斷了的那幾根參差地停在半途，藤蔓從斷口垂下來（照石廊跡：六成）
 */
function placeColumn(state: Uint8Array, x: number, z: number, height: number, isIntact: boolean, random: () => number): void {
  for (let level = 0; level < height; level++) {
    setBlock(state, x, RUINS_FOOT_Y + level, z, pickWallBlock(random))
  }
  if (isIntact) {
    setBlock(state, x, RUINS_FOOT_Y + height, z, BlockId.STONE_SLAB)
  }
  if (random() < 0.6) {
    const side = random() < 0.5 ? 1 : -1
    if (random() < 0.5)
      setDecoration(state, x + side, RUINS_FOOT_Y + height - 1, z, BlockId.IVY)
    else
      setDecoration(state, x, RUINS_FOOT_Y + height - 1, z + side, BlockId.IVY)
  }
}

/**
 * 倒在地上的一截石柱
 *
 * 從柱腳往 direction 那一側躺下去，三到四格長；碰到已經有東西的格子就停
 */
function placeFallenColumn(
  state: Uint8Array,
  x: number,
  z: number,
  direction: { x: number; z: number },
  length: number,
  random: () => number,
): void {
  for (let step = 1; step <= length; step++) {
    const cellX = x + direction.x * step
    const cellZ = z + direction.z * step
    if (getBlock(state, cellX, RUINS_FOOT_Y, cellZ) !== BlockId.AIR)
      return
    setBlock(state, cellX, RUINS_FOOT_Y, cellZ, pickWallBlock(random))
  }
}

/**
 * 大殿的四面牆
 *
 * 牆的殘高由低頻噪音決定，零到七格：有的地方塌到只剩牆基，有的還有一層樓高，
 * 剩到三格以上的頂上偶爾留一片半磚的簷。南牆正中讓給長廊，北牆是石室的南牆（另外砌）
 */
function placeHallWallList(state: Uint8Array, random: () => number): void {
  const { minX, maxX, minZ, maxZ } = HALL_RECT
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const isWall = x === minX || x === maxX || z === minZ || z === maxZ
      if (!isWall)
        continue
      /** 北牆在石室那一段是石室的牆，南牆正中是長廊走進來的口 */
      if (z === minZ && x >= CHAMBER_RECT.minX && x <= CHAMBER_RECT.maxX)
        continue
      if (z === maxZ && x >= COLONNADE_RECT.minX && x <= COLONNADE_RECT.maxX)
        continue

      const height = Math.max(0, Math.min(7, Math.round(2.5 + fbm2D(x * 0.13 + 2, z * 0.13 - 7, 2, 0.5) * 5 + (random() - 0.5) * 1.5)))
      for (let level = 0; level < height; level++) {
        setBlock(state, x, RUINS_FOOT_Y + level, z, pickWallBlock(random))
      }
      if (height >= 3 && random() < 0.3) {
        setBlock(state, x, RUINS_FOOT_Y + height, z, BlockId.STONE_SLAB)
      }
      /** 藤蔓爬在牆的內側 */
      if (height >= 2 && random() < 0.16) {
        const inwardX = x === minX ? 1 : x === maxX ? -1 : 0
        const inwardZ = z === minZ ? 1 : z === maxZ ? -1 : 0
        setDecoration(state, x + inwardX, RUINS_FOOT_Y + height - 1 - Math.floor(random() * 2), z + inwardZ, BlockId.IVY)
      }
    }
  }
}

/**
 * 殿裡兩排石柱
 *
 * 每六格一根，一半還立著（七格高、柱頭一片半磚），相鄰兩根都立著的，頂上架著半磚的樑；
 * 另一半斷在二到四格，有的往殿中央倒下去一截。樑也斷了幾段：只架到一半就沒了
 */
function placeHallColumnList(state: Uint8Array, random: () => number): void {
  const columnXList = [HALL_RECT.minX + 10, HALL_RECT.maxX - 10]
  for (const columnX of columnXList) {
    const inward = columnX < RUINS_CENTER.x ? 1 : -1
    let previousIntactZ: number | null = null
    for (let z = HALL_RECT.minZ + 6; z <= HALL_RECT.maxZ - 6; z += 6) {
      const isIntact = random() < 0.5
      const height = isIntact ? 7 : 2 + Math.floor(random() * 3)
      placeColumn(state, columnX, z, height, isIntact, random)

      if (isIntact && previousIntactZ !== null && random() < 0.75) {
        /** 樑架在柱頭那一層，斷的那一段只從這一頭伸出去一半 */
        const reach = random() < 0.35 ? 3 : z - previousIntactZ - 1
        for (let step = 1; step <= reach; step++) {
          setBlock(state, columnX, RUINS_FOOT_Y + 7, z - step, BlockId.STONE_SLAB)
        }
      }
      if (!isIntact && random() < 0.5) {
        placeFallenColumn(state, columnX, z, { x: inward, z: 0 }, 3 + Math.floor(random() * 2), random)
      }
      previousIntactZ = isIntact ? z : null
    }
  }
}

/**
 * 大殿正中：石廊跡本身
 *
 * 一圈八根斷柱、中央的刻紋石碑、三塊倒下的青苔石與一盞石燈籠，位置、高矮、藤蔓與橫樑全照 buildRuinsGarden
 */
function placeSteleRing(state: Uint8Array, random: () => number): void {
  const { x: centerX, z: centerZ } = HALL_STELE_POINT
  for (let step = 0; step < 8; step++) {
    const angle = (step / 8) * Math.PI * 2
    const pillarX = centerX + Math.round(Math.cos(angle) * STELE_RING_RADIUS)
    const pillarZ = centerZ + Math.round(Math.sin(angle) * STELE_RING_RADIUS)
    const height = 2 + Math.floor(random() * 4)

    for (let level = 0; level < height; level++) {
      setBlock(state, pillarX, RUINS_FOOT_Y + level, pillarZ, pickWallBlock(random))
    }
    if (random() < 0.6) {
      setDecoration(state, pillarX + 1, RUINS_FOOT_Y + height - 1, pillarZ, BlockId.IVY)
    }
    if (height >= 4 && step % 2 === 0) {
      setDecoration(state, pillarX, RUINS_FOOT_Y + height, pillarZ, BlockId.STONE_SLAB)
    }
  }

  setBlock(state, centerX, RUINS_FOOT_Y, centerZ, BlockId.STONE_BRICKS)
  setBlock(state, centerX, RUINS_FOOT_Y + 1, centerZ, BlockId.RUNE_STONE)
  setBlock(state, centerX, RUINS_FOOT_Y + 2, centerZ, BlockId.STONE_SLAB)

  for (const spot of [{ x: -3, z: 3 }, { x: 4, z: -2 }, { x: -5, z: -4 }]) {
    placeStandingStone(state, centerX + spot.x, RUINS_FOOT_Y, centerZ + spot.z, 1, BlockId.MOSSY_COBBLESTONE)
  }
  placeStoneLantern(state, centerX - 5, RUINS_FOOT_Y, centerZ + 5)
}

/**
 * 屋頂完好的石室
 *
 * 六格高的石牆、一層石磚屋頂，簷口一圈半磚；門開在南牆正中，三格寬三格高。
 * 裡面兩盞石燈籠夾著門、北牆前一塊石碑；西北角的牆縫有水滲下來，一道細細的水沿著牆面流到地上，積成一窪
 */
function placeChamber(state: Uint8Array, random: () => number): void {
  const { minX, maxX, minZ, maxZ } = CHAMBER_RECT
  const topY = RUINS_FOOT_Y + CHAMBER_WALL_HEIGHT

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const isWall = x === minX || x === maxX || z === minZ || z === maxZ
      if (isWall) {
        for (let y = RUINS_FOOT_Y; y < topY; y++) {
          setBlock(state, x, y, z, random() < 0.15 ? BlockId.MOSSY_COBBLESTONE : BlockId.STONE_BRICKS)
        }
      }
      setBlock(state, x, topY, z, BlockId.STONE_BRICKS)
      if (isWall) {
        setBlock(state, x, topY + 1, z, BlockId.STONE_SLAB)
      }
    }
  }

  /** 南牆正中的門，門楣是一塊刻紋石 */
  const doorX = RUINS_CENTER.x
  for (let offset = -1; offset <= 1; offset++) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, doorX + offset, RUINS_FOOT_Y + level, maxZ, BlockId.AIR)
    }
  }
  setBlock(state, doorX, RUINS_FOOT_Y + 3, maxZ, BlockId.RUNE_STONE)

  placeStoneLantern(state, doorX - 4, RUINS_FOOT_Y, maxZ - 2)
  placeStoneLantern(state, doorX + 4, RUINS_FOOT_Y, maxZ - 2)

  /** 北牆前的石碑，與大殿正中那塊同一種疊法 */
  setBlock(state, doorX, RUINS_FOOT_Y, minZ + 2, BlockId.STONE_BRICKS)
  setBlock(state, doorX, RUINS_FOOT_Y + 1, minZ + 2, BlockId.RUNE_STONE)
  setBlock(state, doorX, RUINS_FOOT_Y + 2, minZ + 2, BlockId.STONE_SLAB)

  /** 牆縫滲水：一道一格寬的細流貼著北牆落下來，地上積一窪，四周一圈青苔 */
  const { x: seepX, z: seepZ } = CHAMBER_SEEP_POINT
  for (let y = RUINS_FOOT_Y; y < topY - 1; y++) {
    setBlock(state, seepX, y, seepZ, BlockId.FLOWING_WATER)
  }
  setBlock(state, seepX, topY - 2, seepZ - 1, BlockId.MOSSY_COBBLESTONE)
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = 0; offsetZ <= 2; offsetZ++) {
      setBlock(state, seepX + offsetX, RUINS_TERRACE_Y - 1, seepZ + offsetZ, BlockId.MOSSY_COBBLESTONE)
      setBlock(state, seepX + offsetX, RUINS_TERRACE_Y, seepZ + offsetZ, BlockId.WATER)
    }
  }
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 3; offsetZ++) {
      const cellX = seepX + offsetX
      const cellZ = seepZ + offsetZ
      if (getBlock(state, cellX, RUINS_TERRACE_Y, cellZ) === BlockId.STONE_TILE)
        setBlock(state, cellX, RUINS_TERRACE_Y, cellZ, BlockId.MOSSY_COBBLESTONE)
    }
  }
}

/**
 * 長廊與拱門
 *
 * 兩排石柱夾著石板路，每四格一根：還立著的六格高、柱頭一片半磚，兩根相鄰都立著的頂上架樑；
 * 斷了的停在一到三格，有的往路外倒下去（不擋路）。
 * 走到大殿那一口是一座拱門：兩座兩格見方的方墩撐著一道石磚門楣，東半邊塌了，
 * 東墩只剩四格，門楣的那幾塊掉在墩腳
 */
function placeColonnade(state: Uint8Array, random: () => number): void {
  for (const columnX of COLONNADE_COLUMN_X_LIST) {
    const outward = columnX < RUINS_CENTER.x ? -1 : 1
    let previousIntactZ: number | null = null
    for (let z = COLONNADE_COLUMN_Z_FROM; z <= COLONNADE_COLUMN_Z_TO; z += 4) {
      const isIntact = random() < 0.55
      const height = isIntact ? 6 : 1 + Math.floor(random() * 3)
      placeColumn(state, columnX, z, height, isIntact, random)
      if (isIntact && previousIntactZ !== null) {
        for (let step = 1; step < z - previousIntactZ; step++) {
          setBlock(state, columnX, RUINS_FOOT_Y + 6, z - step, BlockId.STONE_SLAB)
        }
      }
      if (!isIntact && random() < 0.6) {
        placeFallenColumn(state, columnX, z, { x: outward, z: 0 }, 3 + Math.floor(random() * 2), random)
      }
      previousIntactZ = isIntact ? z : null
    }
  }

  /** 拱門的兩座方墩 */
  const pierHeight = 7
  for (const { fromX, height } of [{ fromX: RUINS_CENTER.x - 5, height: pierHeight }, { fromX: RUINS_CENTER.x + 4, height: 4 }]) {
    for (let x = fromX; x <= fromX + 1; x++) {
      for (let z = ARCH_Z; z <= ARCH_Z + 1; z++) {
        for (let level = 0; level < height; level++) {
          setBlock(state, x, RUINS_FOOT_Y + level, z, pickWallBlock(random))
        }
      }
    }
  }
  /** 門楣只剩西半邊，伸出西墩到路中央 */
  const lintelY = RUINS_FOOT_Y + pierHeight
  for (let x = RUINS_CENTER.x - 5; x <= RUINS_CENTER.x + 1; x++) {
    for (let z = ARCH_Z; z <= ARCH_Z + 1; z++) {
      setBlock(state, x, lintelY, z, BlockId.STONE_BRICKS)
    }
  }
  for (let x = RUINS_CENTER.x - 5; x <= RUINS_CENTER.x; x++) {
    setBlock(state, x, lintelY + 1, ARCH_Z, BlockId.STONE_SLAB)
  }
  /** 掉下來的門楣，躺在東墩外側（路外） */
  placeStandingStone(state, RUINS_CENTER.x + 8, RUINS_FOOT_Y, ARCH_Z + 2, 1, BlockId.STONE_BRICKS)
  setBlock(state, RUINS_CENTER.x + 7, RUINS_FOOT_Y + 1, ARCH_Z + 2, BlockId.MOSSY_COBBLESTONE)
}

/**
 * 大殿地上的積水
 *
 * 石板塌陷的低處積著滲下來的水，四周一圈青苔。只挑沒有東西壓著的石板
 */
function placePuddleList(state: Uint8Array): void {
  const { minX, maxX, minZ, maxZ } = HALL_RECT
  for (let x = minX + 2; x <= maxX - 2; x++) {
    for (let z = minZ + 2; z <= maxZ - 2; z++) {
      if (measureDistance(x, z, HALL_STELE_POINT) < STELE_RING_RADIUS + 2)
        continue
      if (fbm2D(x * 0.19 + 61, z * 0.19 - 13, 2, 0.5) < 0.42)
        continue
      if (getBlock(state, x, RUINS_FOOT_Y, z) !== BlockId.AIR)
        continue
      setBlock(state, x, RUINS_TERRACE_Y - 1, z, BlockId.MOSSY_COBBLESTONE)
      setBlock(state, x, RUINS_TERRACE_Y, z, BlockId.WATER)
    }
  }
  /** 水窪旁邊那一圈石板換成青苔 */
  for (let x = minX + 1; x <= maxX - 1; x++) {
    for (let z = minZ + 1; z <= maxZ - 1; z++) {
      if (getBlock(state, x, RUINS_TERRACE_Y, z) !== BlockId.STONE_TILE)
        continue
      const isNextToPuddle = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetZ]) =>
        getBlock(state, x + offsetX!, RUINS_TERRACE_Y, z + offsetZ!) === BlockId.WATER)
      if (isNextToPuddle)
        setBlock(state, x, RUINS_TERRACE_Y, z, BlockId.MOSSY_COBBLESTONE)
    }
  }
}

/**
 * 石燈籠
 *
 * 石廊跡只有一盞（大殿正中那一圈裡的那一盞照搬），這裡沿路多擺幾盞：
 * 回程門東側一盞（回頭找門靠它）、拱門內兩盞、大殿四角各一盞
 */
function placeLanternList(state: Uint8Array): void {
  const pointList = [
    { x: RUINS_PORTAL_POINT.x + 3, z: RUINS_PORTAL_POINT.z - 2 },
    { x: RUINS_CENTER.x - 3, z: ARCH_Z - 2 },
    { x: RUINS_CENTER.x + 3, z: ARCH_Z - 2 },
    { x: HALL_RECT.minX + 3, z: HALL_RECT.minZ + 3 },
    { x: HALL_RECT.maxX - 3, z: HALL_RECT.minZ + 3 },
    { x: HALL_RECT.minX + 3, z: HALL_RECT.maxZ - 3 },
    { x: HALL_RECT.maxX - 3, z: HALL_RECT.maxZ - 3 },
  ]
  for (const point of pointList) {
    if (getBlock(state, point.x, RUINS_FOOT_Y, point.z) !== BlockId.AIR)
      continue
    if (getBlock(state, point.x, RUINS_TERRACE_Y, point.z) === BlockId.WATER)
      continue
    placeStoneLantern(state, point.x, RUINS_FOOT_Y, point.z)
  }
}

/**
 * 殿外荒地與亂石坡上的石頭
 *
 * 石廊跡地上那幾塊倒下的青苔石，放到殿外是一片散落的亂石：一到三格高，大半是青苔石
 */
function placeBoulderList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('ruins-boulder')
  for (let attempt = 0; attempt < 70; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 30 + random() * (RUINS_RIM_RADIUS - 34)
    const x = Math.round(RUINS_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(RUINS_CENTER.z + Math.sin(angle) * radius)
    const height = 1 + Math.floor(random() * random() * 3)
    const blockId = random() < 0.6 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE
    if (isTerrace(x, z) || isTerrace(x + 2, z) || isTerrace(x - 2, z) || isTerrace(x, z + 2) || isTerrace(x, z - 2))
      continue
    const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
    if (getBlock(state, x, groundY, z) !== BlockId.AIR)
      continue
    placeStandingStone(state, x, groundY, z, height, blockId)
  }
}

/**
 * 花草，照石廊跡：石生植物四成五、高草三成、灌叢兩成五，只長在草與青苔圓石上
 *
 * 殿基上照石廊跡的三成；殿外荒地是一大片草，照三成會長成一片草原，收到一成四，
 * 亂石坡上再少一點，看得出這裡是石頭的地方
 */
function scatterPlantList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('ruins-plant')
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureBasinRadius(x, z)
      if (radius > RUINS_RIM_RADIUS)
        continue
      const chance = isTerrace(x, z) ? 0.3 : radius > RUINS_RIM_START_RADIUS ? 0.09 : 0.14
      if (random() > chance)
        continue
      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      const groundBlock = getBlock(state, x, groundY - 1, z)
      if ((groundBlock !== BlockId.GRASS && groundBlock !== BlockId.MOSSY_COBBLESTONE) || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      /** 石室裡沒有光，不長東西 */
      if (isInsideRect(x, z, CHAMBER_RECT))
        continue

      const roll = random()
      const blockId = roll < 0.45 ? BlockId.STONE_PLANT : roll < 0.75 ? BlockId.TALL_GRASS : BlockId.BUSH
      plantWithStack(state, x, groundY, z, blockId, random)
    }
  }
}

/** 生成整座石殿遺址 */
export function generateRuinsWorld(state: Uint8Array): void {
  const random = createSeededRandom('ruins-temple')
  const groundTopMap = shapeTerrain(state, random)
  placeHallWallList(state, random)
  placeHallColumnList(state, random)
  placeSteleRing(state, createSeededRandom('garden-ruins-ring'))
  placeChamber(state, random)
  placeColonnade(state, random)
  placePuddleList(state)
  placeLanternList(state)
  placeBoulderList(state, groundTopMap)
  scatterPlantList(state, groundTopMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of RUINS_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
