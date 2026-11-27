import type { HotPool } from './jigoku-layout'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  CHARRED_LOG_SET,
  fillBox,
  getNoisyDistance,
  placeDeadTree,
  placeStoneLantern,
  placeTorii,
  plantWithStack,
  setDecoration,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import {
  BOARDWALK_LOOP_POINT_LIST,
  HOT_POOL_LIST,
  JIGOKU_CENTER,
  JIGOKU_FLOOR_Y,
  JIGOKU_FOOT_Y,
  JIGOKU_PORTAL_POINT,
  JIGOKU_TORII_Z,
  measureRiftShape,
  RIFT_HALF_LENGTH,
  STEAM_VENT_LIST,
  VALLEY_RADIUS_X,
  VALLEY_RADIUS_Z,
  VALLEY_WALL_HEIGHT,
} from './jigoku-layout'
import { JIGOKU_REALM } from './jigoku-realm'

/**
 * 湯煙谷的地形
 *
 * 只有地形 worker 用。谷底照地獄谷（buildJigokuGarden）放大：熔岩縫挖兩格、底下墊一層黑曜石磚，
 * 兩側的黑曜石磚往上堆成岸（鬆弛到一格一階），地面由外往內是石板、圓石、黑曜石磚，
 * 縫的四周越近越多的餘燼；炭黑枯木在離縫最遠的地方，兩三塊白骨，只長枯灌、枯草與石生植物。
 * 鳥居、刻紋石碑與一對石燈籠擺在南邊進谷的那一段。
 *
 * 地獄谷沒有的、使用者要的地熱谷：熱泉（兩格深的清水、黏土底、池緣一圈硫磺黃）、泥池（一格深）、
 * 噴氣孔（圓石圍一個洞，四周染黃）、一條圍著柵欄的木棧繞著熔岩縫走一圈。
 * 木棧從不跨過熔岩縫：地獄谷拿掉那座橋的理由（「這裡不能過」）在這裡照樣成立，人只能繞著它看。
 *
 * 熔岩與餘燼都是光源，每一格都會變成一盞真光（熔岩四格見方留一盞、餘燼兩格見方留一盞），
 * 餘燼的密度比地獄谷低：縫拉長到八十格，照地獄谷的密度撒，光源會是禪庭的兩三倍。
 *
 * 順序：谷底與谷壁 → 熔岩縫與岸 → 木棧 → 熱泉、泥池、噴氣孔 → 餘燼 → 鳥居、石碑 → 枯木與白骨 → 花草 → 傳送門
 */

/** 熔岩縫兩側的岸最高幾格（地獄谷是四格，谷底大了，岸收矮一點，木棧上才看得到縫） */
const BANK_HEIGHT = 2

/** 熔岩往下填幾格，照地獄谷：兩格，底下墊一層黑曜石磚 */
const LAVA_DEPTH = 2

/** 谷壁每往外一格高幾格：兩格，跳不上去 */
const WALL_STEP = 2

/**
 * 餘燼的機率係數
 *
 * 地獄谷是 0.2 × (1 − 距離 ÷ 範圍)，越近越多。這裡的縫是地獄谷的七倍長，
 * 照同一個係數撒下去光源破百，收到三分之二，近縫那一帶仍然一格一格地泛著暗紅
 */
const EMBER_CHANCE = 0.13
const EMBER_REACH = 9

/** 木棧中心線兩側幾格內是木板（約三格寬），再往外一格是柵欄 */
const BOARDWALK_HALF_WIDTH = 1.05
const RAILING_HALF_WIDTH = 2.05

/**
 * 柵欄每隔多少格留一個口
 *
 * 地獄谷的柵欄是重點：這裡的水是滾的。但整圈封死人就下不了棧道，
 * 每三十來格留三格寬的口，想走近一點看噴氣孔的人自己決定要不要下去
 */
const RAILING_GAP_PERIOD = 32
const RAILING_GAP_LENGTH = 4

/** 這一格在谷底的橢圓裡多深：零是谷心，一是谷壁腳；吃一層噪音，谷壁才不是一條平滑的線 */
function measureValleyRatio(x: number, z: number): number {
  const ratioX = (x - JIGOKU_CENTER.x) / VALLEY_RADIUS_X
  const ratioZ = (z - JIGOKU_CENTER.z) / VALLEY_RADIUS_Z
  return Math.hypot(ratioX, ratioZ) + fbm2D(x * 0.06 + 3, z * 0.06 - 41, 2, 0.5) * 0.07
}

/** 這一格往外離谷壁腳幾格（谷底是零以下），粗估：沿著短軸那個尺度換算 */
function measureWallDistance(x: number, z: number): number {
  return (measureValleyRatio(x, z) - 1) * VALLEY_RADIUS_Z
}

/** 這一格離熔岩縫的邊多遠（縫裡是負的）；縫的兩端以外回傳很大 */
function measureRiftDistance(x: number, z: number): number {
  const offsetX = x - JIGOKU_CENTER.x
  if (Math.abs(offsetX) > RIFT_HALF_LENGTH)
    return Number.POSITIVE_INFINITY
  const { center, halfWidth } = measureRiftShape(offsetX)
  if (halfWidth <= 0)
    return Number.POSITIVE_INFINITY
  return Math.abs(z - center) - halfWidth
}

/**
 * 木棧中心線上的點
 *
 * 一圈 Catmull-Rom 閉合曲線，加上回程門往北接上這一圈的那一小段直線
 */
function sampleBoardwalk(): { x: number; z: number }[] {
  const pointList = BOARDWALK_LOOP_POINT_LIST
  const count = pointList.length
  const sampleList: { x: number; z: number }[] = []
  const SAMPLE_PER_SEGMENT = 24

  for (let index = 0; index < count; index++) {
    const previous = pointList[(index - 1 + count) % count]!
    const from = pointList[index]!
    const to = pointList[(index + 1) % count]!
    const next = pointList[(index + 2) % count]!
    for (let step = 0; step < SAMPLE_PER_SEGMENT; step++) {
      const ratio = step / SAMPLE_PER_SEGMENT
      const ratio2 = ratio * ratio
      const ratio3 = ratio2 * ratio
      const blend = (a: number, b: number, c: number, d: number) => 0.5 * (
        2 * b
        + (-a + c) * ratio
        + (2 * a - 5 * b + 4 * c - d) * ratio2
        + (-a + 3 * b - 3 * c + d) * ratio3
      )
      sampleList.push({
        x: blend(previous.x, from.x, to.x, next.x),
        z: blend(previous.z, from.z, to.z, next.z),
      })
    }
  }

  /** 回程門往北到這一圈的那一段 */
  const spurFromZ = JIGOKU_PORTAL_POINT.z - 1
  const spurToZ = pointList[0]!.z
  for (let z = spurFromZ; z >= spurToZ; z -= 0.5) {
    sampleList.push({ x: JIGOKU_PORTAL_POINT.x, z })
  }
  return sampleList
}

/** 每一格離木棧中心線多遠，以及它對應到中心線上第幾點（柵欄留口用） */
function createBoardwalkMap(): { distanceMap: Float32Array; indexMap: Int32Array } {
  const distanceMap = new Float32Array(WORLD_SIZE * WORLD_SIZE).fill(Number.POSITIVE_INFINITY)
  const indexMap = new Int32Array(WORLD_SIZE * WORLD_SIZE).fill(-1)
  const sampleList = sampleBoardwalk()
  const reach = 4
  for (const [sampleIndex, point] of sampleList.entries()) {
    for (let x = Math.floor(point.x - reach); x <= Math.ceil(point.x + reach); x++) {
      for (let z = Math.floor(point.z - reach); z <= Math.ceil(point.z + reach); z++) {
        const index = x * WORLD_SIZE + z
        const distance = Math.hypot(x - point.x, z - point.z)
        if (distance < distanceMap[index]!) {
          distanceMap[index] = distance
          indexMap[index] = sampleIndex
        }
      }
    }
  }
  return { distanceMap, indexMap }
}

/**
 * 谷底的地面材質，照地獄谷由外往內三層：石板、烤過的圓石、最靠近縫的黑曜石磚
 *
 * 交界吃噪音，不規則
 */
function pickFloorBlock(x: number, z: number, riftDistance: number): BlockId {
  const wobble = fbm2D(x * 0.17 - 11, z * 0.17 + 5, 2, 0.5) * 2.4
  if (riftDistance + wobble < 3.5)
    return BlockId.OBSIDIAN_BRICKS
  if (riftDistance + wobble < 11)
    return BlockId.COBBLESTONE
  return BlockId.STONE_TILE
}

/**
 * 谷壁的岩
 *
 * 下半截是烤黑的黑曜石磚與圓石，往上換成一般的石；
 * 夾著幾道硫磺的黃（砂岩），是從噴氣孔一路往上染出來的
 */
function pickWallBlock(x: number, y: number, z: number): BlockId {
  const streak = fbm2D(x * 0.09 + y * 0.05, z * 0.09 - 23, 2, 0.5)
  if (streak > 0.42)
    return BlockId.SANDSTONE
  const level = y - JIGOKU_FLOOR_Y
  const roll = fbm2D(x * 0.23 + 7, z * 0.23 + y * 0.31, 2, 0.5)
  if (level <= 4)
    return roll > 0.1 ? BlockId.OBSIDIAN_BRICKS : BlockId.COBBLESTONE
  if (level <= 9)
    return roll > 0.2 ? BlockId.COBBLESTONE : BlockId.STONE
  return roll > -0.2 ? BlockId.STONE : BlockId.COBBLESTONE
}

/**
 * 谷底與谷壁
 *
 * 谷壁每往外一格高兩格，高過 VALLEY_WALL_HEIGHT 之後那一圈以外是不畫的 LAKE_BED，
 * 布景那片地面平面在同一個高度代替它
 */
function shapeTerrain(state: Uint8Array): void {
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const wallDistance = measureWallDistance(x, z)

      if (wallDistance <= 0) {
        for (let y = 1; y < JIGOKU_FLOOR_Y; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, JIGOKU_FLOOR_Y, z, pickFloorBlock(x, z, measureRiftDistance(x, z)))
        continue
      }

      const rise = Math.ceil(wallDistance) * WALL_STEP
      const topY = JIGOKU_FLOOR_Y + Math.min(VALLEY_WALL_HEIGHT, rise)

      /** 谷壁頂再往外兩格：碰撞照算、不畫 */
      if (rise > VALLEY_WALL_HEIGHT + WALL_STEP * 2) {
        for (let y = 1; y < topY; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, topY, z, BlockId.LAKE_BED)
        continue
      }

      for (let y = 1; y < JIGOKU_FLOOR_Y; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = JIGOKU_FLOOR_Y; y <= topY; y++) {
        setBlock(state, x, y, z, pickWallBlock(x, y, z))
      }
    }
  }
}

/**
 * 熔岩縫與兩側的岸，照地獄谷
 *
 * 岸的高度先算成一張圖、鬆弛到一格一階再堆：離縫越遠越高，乘一層低頻噪音讓岩脊忽高忽低，
 * 再往外漸漸收回谷底的高度。熔岩面與谷底齊平，挖兩格，底下明寫一層黑曜石磚
 */
function carveRift(state: Uint8Array): void {
  const fromX = JIGOKU_CENTER.x - RIFT_HALF_LENGTH - 2
  const toX = JIGOKU_CENTER.x + RIFT_HALF_LENGTH + 2
  const fromZ = JIGOKU_CENTER.z - 20
  const toZ = JIGOKU_CENTER.z + 20
  const sizeX = toX - fromX + 1
  const sizeZ = toZ - fromZ + 1
  const heightList = new Int8Array(sizeX * sizeZ)
  const lavaList = new Uint8Array(sizeX * sizeZ)
  const indexAt = (x: number, z: number) => (x - fromX) * sizeZ + (z - fromZ)

  for (let x = fromX; x <= toX; x++) {
    for (let z = fromZ; z <= toZ; z++) {
      const distance = measureRiftDistance(x, z)
      const index = indexAt(x, z)
      if (distance <= 0) {
        lavaList[index] = 1
        continue
      }
      if (distance > 5)
        continue
      const ridge = fbm2D(x * 0.13, z * 0.13, 2, 0.5)
      const rise = Math.round(distance * 0.8 * (0.4 + ridge * 1.4))
      /** 過了三格往回收，岸是縫兩側一道隆起的唇，不是一路堆上去的牆 */
      const fall = Math.max(0, Math.ceil(distance - 3))
      heightList[index] = Math.max(0, Math.min(BANK_HEIGHT, rise, BANK_HEIGHT - fall))
    }
  }

  /** 鬆弛：熔岩面與範圍外都算高度零，岸在水際與外緣自然收攏 */
  for (let pass = 0; pass < BANK_HEIGHT + 2; pass++) {
    for (let x = fromX + 1; x < toX; x++) {
      for (let z = fromZ + 1; z < toZ; z++) {
        const index = indexAt(x, z)
        if (lavaList[index])
          continue
        let lowest = BANK_HEIGHT
        for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const neighbour = indexAt(x + offsetX, z + offsetZ)
          lowest = Math.min(lowest, lavaList[neighbour] ? 0 : heightList[neighbour]!)
        }
        heightList[index] = Math.min(heightList[index]!, lowest + 1)
      }
    }
  }

  for (let x = fromX; x <= toX; x++) {
    for (let z = fromZ; z <= toZ; z++) {
      const index = indexAt(x, z)
      if (lavaList[index]) {
        for (let depth = 0; depth < LAVA_DEPTH; depth++) {
          setBlock(state, x, JIGOKU_FLOOR_Y - depth, z, BlockId.LAVA)
        }
        setBlock(state, x, JIGOKU_FLOOR_Y - LAVA_DEPTH, z, BlockId.OBSIDIAN_BRICKS)
        continue
      }
      for (let level = 0; level < heightList[index]!; level++) {
        setBlock(state, x, JIGOKU_FOOT_Y + level, z, BlockId.OBSIDIAN_BRICKS)
      }
    }
  }
}

/**
 * 木棧與柵欄
 *
 * 約三格寬的半磚木板，比谷底高半格，從回程門往北接上繞著熔岩縫的那一圈；
 * 兩側一排柵欄，每隔一段留一個口。鳥居與回程門那一段不圍（柵欄會撞上鳥居的柱子）
 */
function placeBoardwalk(state: Uint8Array, distanceMap: Float32Array, indexMap: Int32Array): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = x * WORLD_SIZE + z
      const distance = distanceMap[index]!
      if (distance > RAILING_HALF_WIDTH)
        continue
      if (getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
        continue
      if (distance <= BOARDWALK_HALF_WIDTH) {
        setBlock(state, x, JIGOKU_FOOT_Y, z, BlockId.WOOD_SLAB)
        continue
      }

      const isSpur = Math.abs(x - JIGOKU_PORTAL_POINT.x) <= 3 && z > JIGOKU_TORII_Z - 3
      const isGap = indexMap[index]! % RAILING_GAP_PERIOD < RAILING_GAP_LENGTH
      if (isSpur || isGap)
        continue
      setBlock(state, x, JIGOKU_FOOT_Y, z, BlockId.FENCE)
    }
  }
}

/**
 * 一池熱泉或泥池
 *
 * 熱泉：兩格深的水、黏土底與池壁，池緣一圈硫磺黃的砂岩；
 * 泥池：一格深，水底就是灰泥，池緣也是灰泥，看起來是一池混濁的泥湯
 */
function placeHotPool(state: Uint8Array, pool: HotPool): void {
  const depth = pool.kind === 'spring' ? 2 : 1
  const limit = Math.ceil(pool.radius + 3)
  for (let offsetX = -limit; offsetX <= limit; offsetX++) {
    for (let offsetZ = -limit; offsetZ <= limit; offsetZ++) {
      const x = pool.x + offsetX
      const z = pool.z + offsetZ
      const distance = getNoisyDistance(x, z, pool.x, pool.z, 0.3, 1.2)
      if (distance <= pool.radius) {
        for (let level = 0; level < depth; level++) {
          setBlock(state, x, JIGOKU_FLOOR_Y - level, z, BlockId.WATER)
        }
        setBlock(state, x, JIGOKU_FLOOR_Y - depth, z, BlockId.CLAY)
        continue
      }
      if (distance <= pool.radius + 1) {
        setBlock(state, x, JIGOKU_FLOOR_Y, z, BlockId.CLAY)
        continue
      }
      if (pool.kind === 'spring' && distance <= pool.radius + 2.6 && getBlock(state, x, JIGOKU_FOOT_Y, z) === BlockId.AIR) {
        setBlock(state, x, JIGOKU_FLOOR_Y, z, BlockId.SANDSTONE)
      }
    }
  }
}

/**
 * 噴氣孔
 *
 * 一圈一格高的圓石圍著一個往下兩格的洞，洞底是礫石；四周兩格半的地被硫磺染成黃的砂岩。
 * 蒸氣由渲染端從洞口往上冒
 */
function placeSteamVent(state: Uint8Array, vent: { x: number; z: number }): void {
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
      const x = vent.x + offsetX
      const z = vent.z + offsetZ
      if (getNoisyDistance(x, z, vent.x, vent.z, 0.4, 1) > 2.6)
        continue
      if (getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
        continue
      setBlock(state, x, JIGOKU_FLOOR_Y, z, BlockId.SANDSTONE)
    }
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      if (offsetX === 0 && offsetZ === 0)
        continue
      setBlock(state, vent.x + offsetX, JIGOKU_FOOT_Y, vent.z + offsetZ, Math.abs(offsetX) + Math.abs(offsetZ) === 2 ? BlockId.SANDSTONE : BlockId.COBBLESTONE)
    }
  }
  setBlock(state, vent.x, JIGOKU_FLOOR_Y, vent.z, BlockId.AIR)
  setBlock(state, vent.x, JIGOKU_FLOOR_Y - 1, vent.z, BlockId.GRAVEL)
}

/**
 * 從裂縫往外散開的餘燼，照地獄谷：越靠近縫越多、越遠越稀，沉在地面那一層
 *
 * 只替換谷底的地面（石板、圓石、黑曜石磚），上面有東西（木棧、柵欄、岸）就跳過
 */
function scatterEmberList(state: Uint8Array, random: () => number): void {
  const floorSet = new Set([BlockId.STONE_TILE, BlockId.COBBLESTONE, BlockId.OBSIDIAN_BRICKS])
  for (let x = JIGOKU_CENTER.x - RIFT_HALF_LENGTH - EMBER_REACH; x <= JIGOKU_CENTER.x + RIFT_HALF_LENGTH + EMBER_REACH; x++) {
    for (let z = JIGOKU_CENTER.z - 24; z <= JIGOKU_CENTER.z + 24; z++) {
      const distance = measureRiftDistance(x, z)
      if (distance < 1.6 || distance > EMBER_REACH)
        continue
      if (random() > EMBER_CHANCE * (1 - distance / EMBER_REACH))
        continue
      if (!floorSet.has(getBlock(state, x, JIGOKU_FLOOR_Y, z)) || getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
        continue
      setBlock(state, x, JIGOKU_FLOOR_Y, z, BlockId.EMBER)
    }
  }
}

/**
 * 鳥居與石碑，照地獄谷
 *
 * 鳥居跨在回程門往北那一段木棧上，人一出門先穿過它；石碑立在木棧那一圈的北邊、正對熔岩縫，
 * 碑前一對石燈籠。走過鳥居、走上那一圈，抬頭就是碑與碑後那條發光的縫
 */
function placeShrine(state: Uint8Array): void {
  placeTorii(state, JIGOKU_PORTAL_POINT.x, JIGOKU_FOOT_Y, JIGOKU_TORII_Z, true)

  const steleX = JIGOKU_CENTER.x
  const steleZ = BOARDWALK_LOOP_POINT_LIST[0]!.z - 4
  setBlock(state, steleX, JIGOKU_FOOT_Y, steleZ, BlockId.RUNE_STONE)
  setBlock(state, steleX, JIGOKU_FOOT_Y + 1, steleZ, BlockId.RUNE_STONE)
  setBlock(state, steleX, JIGOKU_FOOT_Y + 2, steleZ, BlockId.STONE_SLAB)
  placeStoneLantern(state, steleX - 2, JIGOKU_FOOT_Y, steleZ)
  placeStoneLantern(state, steleX + 2, JIGOKU_FOOT_Y, steleZ)
}

/**
 * 站著死掉的炭黑枯木與白骨，照地獄谷
 *
 * 枯木全在離縫遠的地方（被熱氣慢慢烤死的，離縫越近死得越徹底），木棧與池子旁邊不放；
 * 白骨少而不明顯，只擺在谷壁腳的角落
 */
function placeDeadTreeList(state: Uint8Array, distanceMap: Float32Array, random: () => number): void {
  let treeCount = 0
  for (let attempt = 0; attempt < 400 && treeCount < 26; attempt++) {
    const x = Math.round(JIGOKU_CENTER.x + (random() * 2 - 1) * VALLEY_RADIUS_X)
    const z = Math.round(JIGOKU_CENTER.z + (random() * 2 - 1) * VALLEY_RADIUS_Z)
    const height = 3 + Math.floor(random() * 3)
    const wallDistance = measureWallDistance(x, z)
    if (wallDistance > -2 || measureRiftDistance(x, z) < 12)
      continue
    if (distanceMap[x * WORLD_SIZE + z]! < 4)
      continue
    if (!isClearFloor(state, x, z, 2))
      continue
    placeDeadTree(state, x, JIGOKU_FOOT_Y, z, height, CHARRED_LOG_SET)
    treeCount++
  }

  let boneCount = 0
  for (let attempt = 0; attempt < 300 && boneCount < 7; attempt++) {
    const x = Math.round(JIGOKU_CENTER.x + (random() * 2 - 1) * VALLEY_RADIUS_X)
    const z = Math.round(JIGOKU_CENTER.z + (random() * 2 - 1) * VALLEY_RADIUS_Z)
    const wallDistance = measureWallDistance(x, z)
    if (wallDistance > -0.5 || wallDistance < -3)
      continue
    if (!isClearFloor(state, x, z, 0))
      continue
    setDecoration(state, x, JIGOKU_FOOT_Y, z, BlockId.BONES)
    boneCount++
  }
}

/** 這一格四周 reach 格內是不是乾淨的谷底：地面是石，頭上是空的 */
function isClearFloor(state: Uint8Array, x: number, z: number, reach: number): boolean {
  for (let offsetX = -reach; offsetX <= reach; offsetX++) {
    for (let offsetZ = -reach; offsetZ <= reach; offsetZ++) {
      const ground = getBlock(state, x + offsetX, JIGOKU_FLOOR_Y, z + offsetZ)
      if (ground !== BlockId.STONE_TILE && ground !== BlockId.COBBLESTONE)
        return false
      if (getBlock(state, x + offsetX, JIGOKU_FOOT_Y, z + offsetZ) !== BlockId.AIR)
        return false
    }
  }
  return true
}

/**
 * 熱氣烤不死的那幾種，照地獄谷：枯灌五成、枯草三成、石生植物兩成，撒在兩成的石板與圓石上。
 * 一株開花的都沒有
 */
function scatterPlantList(state: Uint8Array): void {
  const random = createSeededRandom('jigoku-plant')
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (random() > 0.2)
        continue
      const ground = getBlock(state, x, JIGOKU_FLOOR_Y, z)
      if (ground !== BlockId.STONE_TILE && ground !== BlockId.COBBLESTONE)
        continue
      if (getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
        continue
      const roll = random()
      const blockId = roll < 0.5 ? BlockId.DRY_SHRUB : roll < 0.8 ? BlockId.DRY_GRASS : BlockId.STONE_PLANT
      plantWithStack(state, x, JIGOKU_FOOT_Y, z, blockId, random)
    }
  }
}

/** 生成整道湯煙谷 */
export function generateJigokuWorld(state: Uint8Array): void {
  const random = createSeededRandom('jigoku-valley')
  shapeTerrain(state)
  carveRift(state)
  const { distanceMap, indexMap } = createBoardwalkMap()
  for (const pool of HOT_POOL_LIST) {
    placeHotPool(state, pool)
  }
  for (const vent of STEAM_VENT_LIST) {
    placeSteamVent(state, vent)
  }
  placeBoardwalk(state, distanceMap, indexMap)
  scatterEmberList(state, random)
  placeShrine(state)
  placeDeadTreeList(state, distanceMap, random)
  scatterPlantList(state)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of JIGOKU_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
