import type { CampPoint, RockOutcrop } from './campfire-layout'
import { createSeededRandom, fbm2D, smoothStep } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { BLEACHED_LOG_SET, fillBox, placeDeadTree, plantWithStack } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import {
  CAMP_CENTER,
  CAMP_FOOT_Y,
  CAMP_GROUND_Y,
  COOK_FIRE_POINT,
  CREEK_POINT_LIST,
  FIELD_RECT,
  FOOTPATH_POINT_LIST,
  GRAVE_POINT,
  GULLY_DEPTH,
  HITCHING_POINT,
  HOMESTEAD_POINT,
  OUTCROP_LIST,
  OUTRIDER_CAMP_LIST,
  PRAIRIE_RADIUS,
  ROCK_WALL_HEIGHT,
  ROCK_WALL_RADIUS,
  TRAIL_MARKER_POINT,
  WAGON_LIST,
  WAGON_TRAIL_POINT_LIST,
  WINDMILL_POINT,
} from './campfire-layout'
import { CAMPFIRE_REALM } from './campfire-realm'

/**
 * 拓荒原的地形
 *
 * 只有地形 worker 用。一片乾草原：褐色的土與一塊一塊的紅土，滿地乾草、山艾（枯灌）與零星的仙人掌，
 * 幾株曬白的枯樹，北邊一道乾河床，幾座走得上去的紅岩丘；原野往外陷成一圈乾溝，溝外是兩格一階的紅岩壁。
 *
 * 人的痕跡：篷車圍成一圈、圈裡一堆煮飯的小火（爐火壇那一圈半磚石與沉進地面的餘燼，旁邊兩根掛鍋的柱子）、
 * 原木長凳、晾衣繩、桶與箱子、提燈柱；南邊拴馬的橫木與水槽；東北一間蓋到一半的木屋、木料堆、鋸木架、
 * 一排剛立起來的籬笆柱、一架風車抽水機與剛犁的田；一條車轍路從回程門穿過篷車圈往西通到乾溝邊，
 * 分岔處一根路標與一堆石；西南小丘上一座墳；外圍兩處守夜人的小火。
 *
 * 火只有三堆（每一格餘燼都是一盞真光），加上提燈與回程門的燈，整片原野十來盞。
 *
 * 順序：地面 → 路與河床 → 岩丘 → 人做的東西 → 枯樹與仙人掌 → 花草 → 傳送門
 */

/** 四個方向的單位向量：北是 -Z */
type CampSide = 'north' | 'south' | 'east' | 'west'

/** 矮凳在火的哪一側，就用靠背朝那一側的木階梯（照爐火壇） */
const STOOL_BLOCK_MAP = {
  north: BlockId.WOOD_STAIRS_NORTH,
  south: BlockId.WOOD_STAIRS_SOUTH,
  east: BlockId.WOOD_STAIRS_EAST,
  west: BlockId.WOOD_STAIRS_WEST,
} as const

const SIDE_VECTOR_MAP = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
} as const

function measureDistance(x: number, z: number, point: CampPoint): number {
  return Math.hypot(x - point.x, z - point.z)
}

/** 這一格離原野中心多遠（吃一層低頻噪音），乾溝與岩壁的邊才不是一個圓 */
function measurePlainRadius(x: number, z: number): number {
  return measureDistance(x, z, CAMP_CENTER) + fbm2D(x * 0.03 + 11, z * 0.03 - 29, 2, 0.5) * 5
}

/**
 * 一條折線兩側每一格離中心線多遠
 *
 * 只算折線附近 reach 格內，其餘當成很遠。折線每半格取一點，夠密了
 */
function createPolylineDistanceMap(pointList: CampPoint[], reach: number): Float32Array {
  const distanceMap = new Float32Array(WORLD_SIZE * WORLD_SIZE).fill(Number.POSITIVE_INFINITY)
  for (let index = 0; index < pointList.length - 1; index++) {
    const from = pointList[index]!
    const to = pointList[index + 1]!
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    for (let step = 0; step <= length * 2; step++) {
      const ratio = step / (length * 2)
      const pointX = from.x + (to.x - from.x) * ratio
      const pointZ = from.z + (to.z - from.z) * ratio
      for (let x = Math.floor(pointX - reach); x <= Math.ceil(pointX + reach); x++) {
        for (let z = Math.floor(pointZ - reach); z <= Math.ceil(pointZ + reach); z++) {
          if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE)
            continue
          const cellIndex = x * WORLD_SIZE + z
          distanceMap[cellIndex] = Math.min(distanceMap[cellIndex]!, Math.hypot(x - pointX, z - pointZ))
        }
      }
    }
  }
  return distanceMap
}

/** 原野、路、河床與田各自的範圍，地面、花草與起伏都要問 */
interface PlainMap {
  trailDistanceMap: Float32Array;
  footpathDistanceMap: Float32Array;
  creekDistanceMap: Float32Array;
}

function isInsideField(x: number, z: number, margin = 0): boolean {
  return x >= FIELD_RECT.minX - margin && x <= FIELD_RECT.maxX + margin
    && z >= FIELD_RECT.minZ - margin && z <= FIELD_RECT.maxZ + margin
}

/** 人住的地方：篷車圈、木屋與田、拴馬處，這幾塊地是平的，也少長東西 */
function isSettledGround(x: number, z: number): boolean {
  return measureDistance(x, z, CAMP_CENTER) < 17
    || (Math.abs(x - HOMESTEAD_POINT.x) <= 9 && Math.abs(z - HOMESTEAD_POINT.z) <= 9)
    || measureDistance(x, z, WINDMILL_POINT) < 4
    || isInsideField(x, z, 2)
    || measureDistance(x, z, HITCHING_POINT) < 5
    || OUTRIDER_CAMP_LIST.some((camp) => measureDistance(x, z, camp) < 5)
}

/**
 * 原野上這一格的地面高度（相對原野那一層）
 *
 * 原野零星一格高的緩丘；過了 PRAIRIE_RADIUS 往下陷成乾溝，溝底四格深；
 * 過了 ROCK_WALL_RADIUS 是紅岩壁，從溝底每往外一格高兩格（跳不上去），到高出原野八格為止。
 * 西南那座墳在一個兩格高的小丘上
 */
function measureGroundLevel(x: number, z: number, plainMap: PlainMap): number {
  const radius = measurePlainRadius(x, z)
  if (radius >= ROCK_WALL_RADIUS) {
    const rise = (Math.floor(radius - ROCK_WALL_RADIUS) + 1) * 2
    return Math.min(ROCK_WALL_HEIGHT, -GULLY_DEPTH + rise)
  }
  if (radius >= PRAIRIE_RADIUS)
    return -Math.round(smoothStep((radius - PRAIRIE_RADIUS) / 6) * GULLY_DEPTH)

  const index = x * WORLD_SIZE + z
  if (plainMap.creekDistanceMap[index]! < 1.5)
    return -1

  const graveDistance = measureDistance(x, z, GRAVE_POINT)
  if (graveDistance < 2.6)
    return 2
  if (graveDistance < 5)
    return 1

  if (isSettledGround(x, z) || plainMap.trailDistanceMap[index]! < 3 || plainMap.footpathDistanceMap[index]! < 2)
    return 0
  return fbm2D(x * 0.08 - 3, z * 0.08 + 17, 2, 0.5) > 0.42 ? 1 : 0
}

/**
 * 原野的地面材質
 *
 * 褐色的土是底，低頻噪音挑出一塊一塊的紅土；車轍路是紅土、兩道轍是壓實的土；
 * 河床底是礫石與沙，兩岸一圈紅土；乾溝底是礫石與紅土
 */
function pickSurfaceBlock(x: number, z: number, level: number, plainMap: PlainMap): BlockId {
  const index = x * WORLD_SIZE + z
  const roll = fbm2D(x * 0.23 + 7, z * 0.23 - 5, 2, 0.5)
  if (level < 0) {
    if (plainMap.creekDistanceMap[index]! < 1.5)
      return roll > 0 ? BlockId.GRAVEL : BlockId.SAND
    return roll > 0.1 ? BlockId.GRAVEL : BlockId.RED_SAND
  }

  const trailDistance = plainMap.trailDistanceMap[index]!
  if (trailDistance < 1.7)
    return Math.abs(trailDistance - 1) < 0.4 ? BlockId.DIRT : BlockId.RED_SAND
  if (plainMap.footpathDistanceMap[index]! < 0.9 || plainMap.creekDistanceMap[index]! < 2.6)
    return BlockId.RED_SAND

  const patch = fbm2D(x * 0.06 + 31, z * 0.06 + 3, 3, 0.5)
  if (patch > 0.2)
    return BlockId.RED_SAND
  if (patch < -0.55)
    return BlockId.GRASS
  return BlockId.DIRT
}

/**
 * 紅岩壁的岩，一層一層的：每三格夾一層砂岩，遠看是台地的層理
 */
function pickRockBlock(y: number): BlockId {
  return (y - CAMP_GROUND_Y) % 3 === 0 ? BlockId.SANDSTONE : BlockId.RED_ROCK
}

/** 地面：原野、河床、乾溝、紅岩壁與壁頂外不畫的 LAKE_BED；回傳每一格地面頂面的高度 */
function shapeTerrain(state: Uint8Array, plainMap: PlainMap): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const level = measureGroundLevel(x, z, plainMap)
      const topY = CAMP_GROUND_Y + level
      groundTopMap[x * WORLD_SIZE + z] = topY
      const radius = measurePlainRadius(x, z)

      /** 壁頂再往外兩格：碰撞照算、不畫，由布景那片鋪到地平線的紅土平面代替 */
      if (radius > ROCK_WALL_RADIUS + ROCK_WALL_HEIGHT / 2 + 4) {
        for (let y = 1; y < topY; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, topY, z, BlockId.LAKE_BED)
        continue
      }

      if (radius >= ROCK_WALL_RADIUS) {
        for (let y = 1; y < CAMP_GROUND_Y - GULLY_DEPTH; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        for (let y = CAMP_GROUND_Y - GULLY_DEPTH; y <= topY; y++) {
          setBlock(state, x, y, z, pickRockBlock(y))
        }
        continue
      }

      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, pickSurfaceBlock(x, z, level, plainMap))
    }
  }

  return groundTopMap
}

/**
 * 走得上去的紅岩丘
 *
 * 平頂、四周陡（每往內一格高一格半上下），一層一層夾著砂岩；從原野往上爬得到頂，
 * 站上去看得到整片原野與篷車圈
 */
function placeOutcrop(state: Uint8Array, groundTopMap: Uint8Array, outcrop: RockOutcrop): void {
  const reach = outcrop.radius + 3
  for (let x = outcrop.x - reach; x <= outcrop.x + reach; x++) {
    for (let z = outcrop.z - reach; z <= outcrop.z + reach; z++) {
      const distance = measureDistance(x, z, outcrop) + fbm2D(x * 0.3, z * 0.3, 2, 0.5) * 1.4
      const level = Math.min(outcrop.height, Math.ceil((outcrop.radius - distance) * 1.6))
      if (level <= 0)
        continue
      const index = x * WORLD_SIZE + z
      const baseY = groundTopMap[index]!
      for (let y = baseY + 1; y <= baseY + level; y++) {
        setBlock(state, x, y, z, pickRockBlock(y))
      }
      groundTopMap[index] = baseY + level
    }
  }
}

/** 一圈半磚石頭，照爐火壇：只到腳踝，坐在外面看得到火 */
function placeStoneRing(state: Uint8Array, point: CampPoint): void {
  for (let step = 0; step < 12; step++) {
    const angle = (step / 12) * Math.PI * 2
    setBlock(state, point.x + Math.round(Math.cos(angle) * 2), CAMP_FOOT_Y, point.z + Math.round(Math.sin(angle) * 2), BlockId.STONE_SLAB)
  }
}

/**
 * 一輛篷車
 *
 * 沿著圓周的切線停：四個輪子是橫著放的原木（圓的那一面朝外，看起來就是車輪），
 * 輪子上一層木板車斗，斗上三格見方、四格長的白色篷布，頂上一格收圓；
 * 前面一格是駕座（木階梯），再往前兩格是車轅（籬笆）。hasLantern 的那一輛在駕座旁掛一盞提燈
 */
function placeWagon(state: Uint8Array, wagon: CampPoint & { degree: number }, hasLantern: boolean): void {
  const radian = (wagon.degree / 180) * Math.PI
  const tangentX = -Math.sin(radian)
  const tangentZ = Math.cos(radian)
  const isAlongX = Math.abs(tangentX) >= Math.abs(tangentZ)
  const forward = isAlongX ? Math.sign(tangentX) : Math.sign(tangentZ)

  const toWorld = (along: number, across: number): CampPoint => isAlongX
    ? { x: wagon.x + along * forward, z: wagon.z + across }
    : { x: wagon.x + across, z: wagon.z + along * forward }
  const put = (along: number, across: number, level: number, blockId: BlockId) => {
    const cell = toWorld(along, across)
    setBlock(state, cell.x, CAMP_FOOT_Y + level, cell.z, blockId)
  }

  const wheel = isAlongX ? BlockId.OAK_LOG_Z : BlockId.OAK_LOG_X
  for (const along of [-2, 2]) {
    for (const across of [-1, 1]) {
      put(along, across, 0, wheel)
    }
  }
  for (let along = -2; along <= 2; along++) {
    for (let across = -1; across <= 1; across++) {
      put(along, across, 1, BlockId.PLANKS)
    }
  }
  for (let along = -2; along <= 1; along++) {
    for (const across of [-1, 1]) {
      put(along, across, 2, BlockId.CANVAS)
      put(along, across, 3, BlockId.CANVAS)
    }
    put(along, 0, 4, BlockId.CANVAS)
  }
  /** 後面那一頭封起來，前面敞著 */
  put(-2, 0, 2, BlockId.CANVAS)
  put(-2, 0, 3, BlockId.CANVAS)

  /** 駕座：人面朝前，靠背朝篷布 */
  const backSide: CampSide = isAlongX
    ? (forward > 0 ? 'west' : 'east')
    : (forward > 0 ? 'north' : 'south')
  put(2, 0, 2, STOOL_BLOCK_MAP[backSide])
  put(3, 0, 0, BlockId.FENCE)
  put(4, 0, 0, BlockId.FENCE)
  if (hasLantern) {
    put(2, 1, 2, BlockId.LANTERN)
  }
}

/** 提燈柱：一根兩格高的木樁頂一盞提燈 */
function placeLanternPost(state: Uint8Array, point: CampPoint): void {
  setBlock(state, point.x, CAMP_FOOT_Y, point.z, BlockId.WOOD_POST)
  setBlock(state, point.x, CAMP_FOOT_Y + 1, point.z, BlockId.WOOD_POST)
  setBlock(state, point.x, CAMP_FOOT_Y + 2, point.z, BlockId.LANTERN)
}

/**
 * 篷車圈裡的營地
 *
 * 煮飯的小火照爐火壇：一圈半磚石、沉進地面的餘燼；火的兩側各一根掛鍋的柱子（籬笆），
 * 鍋子（大鍋）擱在石圈外，一個木箱上擺著咖啡壺（小陶罐）；火的南邊一根原木長凳、西邊一張矮凳。
 * 圈裡還有晾衣繩、幾個水桶與木箱、一根提燈柱
 */
function placeCampYard(state: Uint8Array): void {
  const fire = COOK_FIRE_POINT
  placeStoneRing(state, fire)
  setBlock(state, fire.x, CAMP_GROUND_Y, fire.z, BlockId.EMBER)
  setBlock(state, fire.x - 1, CAMP_FOOT_Y, fire.z, BlockId.FENCE)
  setBlock(state, fire.x + 1, CAMP_FOOT_Y, fire.z, BlockId.FENCE)
  setBlock(state, fire.x, CAMP_FOOT_Y, fire.z - 3, BlockId.CAULDRON)
  setBlock(state, fire.x + 3, CAMP_FOOT_Y, fire.z - 2, BlockId.CRATE)
  setBlock(state, fire.x + 3, CAMP_FOOT_Y + 1, fire.z - 2, BlockId.FLOWER_POT)
  for (let offset = -1; offset <= 1; offset++) {
    setBlock(state, fire.x + offset, CAMP_FOOT_Y, fire.z + 4, BlockId.OAK_LOG_X)
  }
  setBlock(state, fire.x - 4, CAMP_FOOT_Y, fire.z, BlockId.WOOD_STAIRS_WEST)

  /** 晾衣繩：兩根三格高的木樁，頂上一道橫桿，掛兩塊布 */
  const lineZ = CAMP_CENTER.z + 6
  for (const postX of [CAMP_CENTER.x - 7, CAMP_CENTER.x - 2]) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, postX, CAMP_FOOT_Y + level, lineZ, BlockId.WOOD_POST)
    }
  }
  for (let x = CAMP_CENTER.x - 6; x <= CAMP_CENTER.x - 3; x++) {
    setBlock(state, x, CAMP_FOOT_Y + 2, lineZ, BlockId.FENCE)
  }
  setBlock(state, CAMP_CENTER.x - 5, CAMP_FOOT_Y + 1, lineZ, BlockId.CANVAS)
  setBlock(state, CAMP_CENTER.x - 3, CAMP_FOOT_Y + 1, lineZ, BlockId.CANVAS)

  /** 水桶與補給 */
  for (const [offsetX, offsetZ, blockId] of [
    [5, 4, BlockId.BARREL],
    [6, 4, BlockId.BARREL],
    [5, 5, BlockId.CRATE],
    [-7, 3, BlockId.CRATE],
    [-7, 4, BlockId.CRATE],
    [-6, 4, BlockId.BARREL],
  ] as const) {
    setBlock(state, CAMP_CENTER.x + offsetX, CAMP_FOOT_Y, CAMP_CENTER.z + offsetZ, blockId)
  }
  setBlock(state, CAMP_CENTER.x - 7, CAMP_FOOT_Y + 1, CAMP_CENTER.z + 3, BlockId.CRATE)

  placeLanternPost(state, { x: CAMP_CENTER.x + 5, z: CAMP_CENTER.z - 4 })
}

/**
 * 拴馬處：兩根木樁架一道橫木、一個水槽、兩捆乾草
 */
function placeHitchingRail(state: Uint8Array): void {
  const { x, z } = HITCHING_POINT
  for (const offset of [-3, 3]) {
    setBlock(state, x + offset, CAMP_FOOT_Y, z, BlockId.WOOD_POST)
    setBlock(state, x + offset, CAMP_FOOT_Y + 1, z, BlockId.WOOD_POST)
  }
  for (let offset = -2; offset <= 2; offset++) {
    setBlock(state, x + offset, CAMP_FOOT_Y + 1, z, BlockId.FENCE)
  }
  /** 水槽：木板圍一圈，中間一格深的水 */
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = 2; offsetZ <= 4; offsetZ++) {
      const isRim = Math.abs(offsetX) === 2 || offsetZ !== 3
      setBlock(state, x + offsetX, CAMP_GROUND_Y, z + offsetZ, isRim ? BlockId.PLANKS : BlockId.WATER)
    }
  }
  setBlock(state, x + 5, CAMP_FOOT_Y, z + 1, BlockId.HAY)
  setBlock(state, x + 5, CAMP_FOOT_Y, z + 2, BlockId.HAY)
}

/**
 * 蓋到一半的木屋
 *
 * 木板地基已經鋪好，四角的原木柱立起來了；北牆疊滿三層原木，西牆兩層，南牆門的兩側一高一低，
 * 東牆只放了一層；兩根山牆柱撐著一根屋脊，還沒有屋頂。西牆外的煙囪砌到一半。
 * 屋子外面：一疊木板、一堆原木、一架鋸木架、一排剛立起來的籬笆柱（只連上前兩段）
 */
function placeHomestead(state: Uint8Array): void {
  const { x, z } = HOMESTEAD_POINT
  for (let offsetX = -4; offsetX <= 4; offsetX++) {
    for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
      setBlock(state, x + offsetX, CAMP_GROUND_Y, z + offsetZ, BlockId.PLANKS)
    }
  }
  for (const offsetX of [-4, 4]) {
    for (const offsetZ of [-3, 3]) {
      for (let level = 0; level < 4; level++) {
        setBlock(state, x + offsetX, CAMP_FOOT_Y + level, z + offsetZ, BlockId.OAK_LOG)
      }
    }
  }
  const course = (fromX: number, toX: number, wallZ: number, height: number) => {
    for (let offsetX = fromX; offsetX <= toX; offsetX++) {
      for (let level = 0; level < height; level++) {
        setBlock(state, x + offsetX, CAMP_FOOT_Y + level, z + wallZ, BlockId.OAK_LOG_X)
      }
    }
  }
  const courseZ = (wallX: number, height: number) => {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      for (let level = 0; level < height; level++) {
        setBlock(state, x + wallX, CAMP_FOOT_Y + level, z + offsetZ, BlockId.OAK_LOG_Z)
      }
    }
  }
  course(-3, 3, -3, 3)
  courseZ(-4, 2)
  courseZ(4, 1)
  course(-3, -1, 3, 2)
  course(3, 3, 3, 1)
  /** 山牆柱與屋脊：門開在南牆的 +1、+2 那兩格，山牆柱立在正中 */
  for (const offsetZ of [-3, 3]) {
    for (let level = 0; level < 5; level++) {
      setBlock(state, x, CAMP_FOOT_Y + level, z + offsetZ, BlockId.OAK_LOG)
    }
  }
  for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
    setBlock(state, x, CAMP_FOOT_Y + 5, z + offsetZ, BlockId.OAK_LOG_Z)
  }
  for (let level = 0; level < 3; level++) {
    setBlock(state, x - 5, CAMP_FOOT_Y + level, z, BlockId.COBBLESTONE)
  }

  /** 木料堆與鋸木架 */
  fillBox(state, x + 5, CAMP_FOOT_Y, z + 5, x + 6, CAMP_FOOT_Y + 1, z + 7, BlockId.PLANKS)
  for (let offsetX = -3; offsetX <= 0; offsetX++) {
    setBlock(state, x + offsetX, CAMP_FOOT_Y, z + 6, BlockId.OAK_LOG_X)
    if (offsetX > -3)
      setBlock(state, x + offsetX, CAMP_FOOT_Y + 1, z + 6, BlockId.OAK_LOG_X)
  }
  setBlock(state, x + 2, CAMP_FOOT_Y, z + 8, BlockId.FENCE)
  setBlock(state, x + 3, CAMP_FOOT_Y, z + 8, BlockId.FENCE)
  setBlock(state, x + 2, CAMP_FOOT_Y + 1, z + 8, BlockId.WOOD_SLAB)
  setBlock(state, x + 3, CAMP_FOOT_Y + 1, z + 8, BlockId.WOOD_SLAB)

  /** 一排剛立起來的籬笆柱：每三格一根，只有前兩段接上橫桿 */
  const fenceZ = FIELD_RECT.maxZ + 3
  for (let fenceX = FIELD_RECT.minX - 2; fenceX <= FIELD_RECT.maxX + 2; fenceX += 3) {
    setBlock(state, fenceX, CAMP_FOOT_Y, fenceZ, BlockId.FENCE)
    if (fenceX < FIELD_RECT.minX + 4) {
      setBlock(state, fenceX + 1, CAMP_FOOT_Y, fenceZ, BlockId.FENCE)
      setBlock(state, fenceX + 2, CAMP_FOOT_Y, fenceZ, BlockId.FENCE)
    }
  }
  placeLanternPost(state, { x: x + 5, z: z + 3 })
}

/**
 * 風車抽水機
 *
 * 一根七格高的木樁頂著輪轂，四片木板葉片立在朝南那一面，後面一片尾舵；
 * 腳下一個水槽，抽上來的水積在裡面
 */
function placeWindmill(state: Uint8Array): void {
  const { x, z } = WINDMILL_POINT
  for (let level = 0; level < 7; level++) {
    setBlock(state, x, CAMP_FOOT_Y + level, z, BlockId.WOOD_POST)
  }
  const hubY = CAMP_FOOT_Y + 7
  setBlock(state, x, hubY, z, BlockId.PLANKS)
  for (const [offsetX, offsetY] of [[1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [0, -2]] as const) {
    setBlock(state, x + offsetX, hubY + offsetY, z + 1, BlockId.PLANKS)
  }
  setBlock(state, x, hubY, z - 1, BlockId.WOOD_SLAB)
  setBlock(state, x, hubY, z - 2, BlockId.PLANKS)
  for (let offsetX = 1; offsetX <= 3; offsetX++) {
    setBlock(state, x + offsetX, CAMP_GROUND_Y, z + 2, BlockId.WATER)
    setBlock(state, x + offsetX, CAMP_GROUND_Y - 1, z + 2, BlockId.PLANKS)
  }
}

/**
 * 剛犁的田：一壟一壟，壟上是翻起來的土，壟溝往下一格
 */
function plowField(state: Uint8Array): void {
  for (let x = FIELD_RECT.minX; x <= FIELD_RECT.maxX; x++) {
    for (let z = FIELD_RECT.minZ; z <= FIELD_RECT.maxZ; z++) {
      const isFurrow = (z - FIELD_RECT.minZ) % 2 === 1
      setBlock(state, x, CAMP_GROUND_Y, z, isFurrow ? BlockId.AIR : BlockId.DIRT)
      setBlock(state, x, CAMP_GROUND_Y - 1, z, BlockId.DIRT)
    }
  }
}

/**
 * 小丘上的墳：一根木樁、頂上一道橫桿做成的十字，腳邊一圈石頭
 */
function placeGrave(state: Uint8Array): void {
  const { x, z } = GRAVE_POINT
  const footY = CAMP_FOOT_Y + 2
  setBlock(state, x, footY, z, BlockId.WOOD_POST)
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    setBlock(state, x + offsetX, footY + 1, z, BlockId.FENCE)
  }
  for (const [offsetX, offsetZ] of [[-1, 1], [0, 1], [1, 1], [0, 2]] as const) {
    setBlock(state, x + offsetX, footY, z + offsetZ, BlockId.COBBLESTONE)
  }
}

/** 路標：一堆石頭，旁邊一根木樁，樁頂伸出一塊木板指著西邊的台地 */
function placeTrailMarker(state: Uint8Array): void {
  const { x, z } = TRAIL_MARKER_POINT
  setBlock(state, x, CAMP_FOOT_Y, z, BlockId.COBBLESTONE)
  setBlock(state, x + 1, CAMP_FOOT_Y, z, BlockId.MOSSY_COBBLESTONE)
  setBlock(state, x, CAMP_FOOT_Y + 1, z, BlockId.COBBLESTONE)
  for (let level = 0; level < 3; level++) {
    setBlock(state, x + 2, CAMP_FOOT_Y + level, z - 1, BlockId.WOOD_POST)
  }
  setBlock(state, x + 1, CAMP_FOOT_Y + 2, z - 1, BlockId.PLANKS)
}

/**
 * 外圍守夜人的小火：一座爐火壇（石圈、餘燼、兩張矮凳），一捲鋪蓋、一個木箱
 */
function placeOutriderCamp(state: Uint8Array, camp: CampPoint): void {
  placeStoneRing(state, camp)
  setBlock(state, camp.x, CAMP_GROUND_Y, camp.z, BlockId.EMBER)
  for (const side of ['north', 'west'] as const) {
    const vector = SIDE_VECTOR_MAP[side]
    setBlock(state, camp.x + vector.x * 4, CAMP_FOOT_Y, camp.z + vector.z * 4, STOOL_BLOCK_MAP[side])
  }
  setBlock(state, camp.x + 3, CAMP_FOOT_Y, camp.z + 2, BlockId.CUSHION)
  setBlock(state, camp.x + 3, CAMP_FOOT_Y, camp.z + 3, BlockId.CUSHION)
  setBlock(state, camp.x - 3, CAMP_FOOT_Y, camp.z + 3, BlockId.CRATE)
}

/** 這一格能不能長東西：原野上、地面是土、頭上是空的 */
function canPlant(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number): boolean {
  if (measurePlainRadius(x, z) > PRAIRIE_RADIUS + 3)
    return false
  const groundY = groundTopMap[x * WORLD_SIZE + z]!
  const ground = getBlock(state, x, groundY, z)
  if (ground !== BlockId.DIRT && ground !== BlockId.RED_SAND && ground !== BlockId.GRASS && ground !== BlockId.GRAVEL)
    return false
  return getBlock(state, x, groundY + 1, z) === BlockId.AIR
}

/** 枯樹與仙人掌：枯樹是曬白的那一種，仙人掌一到三格，都離人住的地方遠一點 */
function placeDeadTreeAndCactusList(state: Uint8Array, groundTopMap: Uint8Array, plainMap: PlainMap): void {
  const random = createSeededRandom('frontier-tree')
  let treeCount = 0
  let cactusCount = 0
  for (let attempt = 0; attempt < 900 && (treeCount < 11 || cactusCount < 50); attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 16 + random() * (PRAIRIE_RADIUS - 18)
    const x = Math.round(CAMP_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(CAMP_CENTER.z + Math.sin(angle) * radius)
    const isTree = random() < 0.2
    const height = 1 + Math.floor(random() * 3)
    const index = x * WORLD_SIZE + z
    if (isSettledGround(x, z) || plainMap.trailDistanceMap[index]! < 3 || plainMap.footpathDistanceMap[index]! < 2)
      continue
    if (!canPlant(state, groundTopMap, x, z))
      continue
    const groundY = groundTopMap[index]! + 1
    if (isTree && treeCount < 11) {
      placeDeadTree(state, x, groundY, z, 4 + height, BLEACHED_LOG_SET)
      treeCount++
    }
    else if (!isTree && cactusCount < 50) {
      for (let level = 0; level < height; level++) {
        setBlock(state, x, groundY + level, z, BlockId.CACTUS)
      }
      cactusCount++
    }
  }
}

/**
 * 乾草原的草
 *
 * 乾草最多，高的乾草、山艾（枯灌）次之，零星幾叢還綠著的野草；
 * 人住的地方與路上稀得多，車轍路上不長
 */
function scatterPrairieGrass(state: Uint8Array, groundTopMap: Uint8Array, plainMap: PlainMap): void {
  const random = createSeededRandom('frontier-grass')
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = x * WORLD_SIZE + z
      const roll = random()
      if (plainMap.trailDistanceMap[index]! < 2.2 || plainMap.footpathDistanceMap[index]! < 1.2)
        continue
      const chance = isSettledGround(x, z) ? 0.1 : 0.42
      if (roll > chance || !canPlant(state, groundTopMap, x, z))
        continue
      const kind = random()
      const blockId = kind < 0.6
        ? BlockId.DRY_GRASS
        : kind < 0.74 ? BlockId.WHEAT_TALL : kind < 0.92 ? BlockId.DRY_SHRUB : BlockId.WILD_GRASS
      plantWithStack(state, x, groundTopMap[index]! + 1, z, blockId, random)
    }
  }
}

/** 生成整片拓荒原 */
export function generateCampfireWorld(state: Uint8Array): void {
  const plainMap: PlainMap = {
    trailDistanceMap: createPolylineDistanceMap(WAGON_TRAIL_POINT_LIST, 4),
    footpathDistanceMap: createPolylineDistanceMap(FOOTPATH_POINT_LIST, 3),
    creekDistanceMap: createPolylineDistanceMap(CREEK_POINT_LIST, 4),
  }
  const groundTopMap = shapeTerrain(state, plainMap)
  for (const outcrop of OUTCROP_LIST) {
    placeOutcrop(state, groundTopMap, outcrop)
  }

  for (const [index, wagon] of WAGON_LIST.entries()) {
    placeWagon(state, wagon, index === 1)
  }
  placeCampYard(state)
  placeHitchingRail(state)
  plowField(state)
  placeHomestead(state)
  placeWindmill(state)
  placeGrave(state)
  placeTrailMarker(state)
  for (const camp of OUTRIDER_CAMP_LIST) {
    placeOutriderCamp(state, camp)
  }

  placeDeadTreeAndCactusList(state, groundTopMap, plainMap)
  scatterPrairieGrass(state, groundTopMap, plainMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of CAMPFIRE_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
