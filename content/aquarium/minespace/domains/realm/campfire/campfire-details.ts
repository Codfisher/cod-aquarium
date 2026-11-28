import type { CampPoint } from './campfire-layout'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { clearPlantArea, findFreeSite, isFreeGround, putProp } from '../realm-prop-kit'
import {
  ABANDONED_CARGO_POINT,
  CAMP_CENTER,
  CAMP_FOOT_Y,
  CAMP_GROUND_Y,
  CAMP_PORTAL_POINT,
  CAMP_SLOW_RADIUS,
  FIELD_RECT,
  GRAVE_POINT,
  HOMESTEAD_POINT,
  OUTCROP_LIST,
  PROSPECTOR_CAMP_POINT,
  TELEGRAPH_POLE_LIST,
  WAGON_LIST,
  WATER_TOWER_POINT,
} from './campfire-layout'

/**
 * 拓荒原的細節小景
 *
 * 只有地形 worker 用，排在乾草之後、傳送門之前。
 * 原野上原本是篷車圈、木屋工地、風車、墳與幾座紅岩丘，中間隔著大片只有乾草與仙人掌的地。
 * 這一輪補的是拓荒路上會看到的東西：沿車轍路往西排過去的電報線桿、木腿撐起來的水塔、
 * 乾河床邊淘金人的小營地、路邊被丟下的行李與牛骨、岩丘腰上一道白砂岩的層理與丘腳崩落的碎石，
 * 以及篷車旁邊的水桶與補給、木屋邊的劈柴墩、田邊的種子簍、小丘上多出來的兩座墳。
 *
 * 不加火也不加燈：這裡的光源只有三堆小火與幾盞提燈，夜裡整片原野要是黑的
 */

/** 原野上長得出東西、也擺得下東西的地面 */
const PLAIN_SET = new Set([BlockId.DIRT, BlockId.RED_SAND, BlockId.GRASS, BlockId.GRAVEL])

/** 電報線桿的高度（格），桿頂再橫一道木半磚當橫擔 */
const TELEGRAPH_POLE_HEIGHT = 5

/** 岩丘腳下的碎石散到離丘多遠（格） */
const TALUS_REACH = 4

/** 岩丘那一道白砂岩夾在離原野幾格高的地方 */
const OUTCROP_PALE_BAND_LEVEL = 5

function readFootY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/** 這一格是空地就擺，各自落在自己那一格的地面上 */
function putOnGround(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number, blockId: BlockId): boolean {
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeGround(state, x, footY, z, PLAIN_SET))
    return false
  return putProp(state, x, footY, z, blockId)
}

/**
 * 電報線桿
 *
 * 五格高的木樁，桿頂一道三格寬的木半磚橫擔，與路垂直。線就不拉了：方塊拉不出垂下來的線，
 * 一根一根等距排過去，已經看得出它們是連著的
 */
function placeTelegraphPoleList(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const pole of TELEGRAPH_POLE_LIST) {
    const site = findFreeSite(state, groundTopMap, pole, 0, 0, PLAIN_SET, 2)
    if (!site)
      continue
    clearPlantArea(state, site.x, site.z, site.x, site.z, site.footY)
    for (let level = 0; level < TELEGRAPH_POLE_HEIGHT; level++) {
      setBlock(state, site.x, site.footY + level, site.z, BlockId.WOOD_POST)
    }
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, site.x, site.footY + TELEGRAPH_POLE_HEIGHT, site.z + offsetZ, BlockId.WOOD_SLAB)
    }
    putOnGround(state, groundTopMap, site.x + 1, site.z, BlockId.SMALL_ROCK)
  }
}

/**
 * 水塔
 *
 * 四根四格高的木腿、三格見方的木板平台、兩層木桶箍成的水櫃、深色木半磚的頂；
 * 平台東邊伸出一根出水的桿子，底下一個接水的木桶與一口鍋。站在篷車圈裡往東南看，它是原野上最高的東西
 */
function placeWaterTower(state: Uint8Array, groundTopMap: Uint8Array): void {
  const site = findFreeSite(state, groundTopMap, WATER_TOWER_POINT, 2, 2, PLAIN_SET, 4)
  if (!site)
    return
  const { x, z, footY } = site
  clearPlantArea(state, x - 2, z - 2, x + 2, z + 2, footY)

  for (const offsetX of [-1, 1]) {
    for (const offsetZ of [-1, 1]) {
      for (let level = 0; level < 4; level++) {
        setBlock(state, x + offsetX, footY + level, z + offsetZ, BlockId.WOOD_POST)
      }
    }
  }
  /** 平台底下的橫撐，用圍籬的橫桿把相鄰兩根腿連起來；貼著平台放（離地三格），人從塔下穿過去不會擦到頭 */
  for (const [offsetX, offsetZ] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    setBlock(state, x + offsetX, footY + 3, z + offsetZ, BlockId.FENCE)
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, x + offsetX, footY + 4, z + offsetZ, BlockId.PLANKS)
      setBlock(state, x + offsetX, footY + 5, z + offsetZ, BlockId.BARREL)
      setBlock(state, x + offsetX, footY + 6, z + offsetZ, BlockId.BARREL)
      setBlock(state, x + offsetX, footY + 7, z + offsetZ, BlockId.DARK_WOOD_SLAB)
    }
  }
  setBlock(state, x, footY + 7, z, BlockId.DARK_PLANKS)
  setBlock(state, x, footY + 8, z, BlockId.DARK_WOOD_SLAB)
  setBlock(state, x + 2, footY + 4, z, BlockId.FENCE)
  setBlock(state, x + 2, footY, z, BlockId.BARREL)
  setBlock(state, x + 2, footY, z + 1, BlockId.CAULDRON)
}

/**
 * 淘金人的營地
 *
 * 一頂三格長的小帳（兩側各一排篷布、頂上一道脊）、帳口一圈熄了的石頭、
 * 岸邊一座架在腿上的洗礦槽、一口淘金的鍋、一把鎬與兩個箱子；
 * 河床裡挖了一小窪，是這條乾河最後剩下的水
 */
function placeProspectorCamp(state: Uint8Array, groundTopMap: Uint8Array): void {
  const site = findFreeSite(state, groundTopMap, PROSPECTOR_CAMP_POINT, 3, 2, PLAIN_SET, 5)
  if (!site)
    return
  const { x, z, footY } = site
  clearPlantArea(state, x - 3, z - 2, x + 3, z + 2, footY)

  /** 小帳：沿 X 三格長，朝東敞開 */
  for (let offsetX = -3; offsetX <= -1; offsetX++) {
    setBlock(state, x + offsetX, footY, z - 1, BlockId.CANVAS)
    setBlock(state, x + offsetX, footY, z + 1, BlockId.CANVAS)
    setBlock(state, x + offsetX, footY + 1, z, BlockId.CANVAS)
  }
  setBlock(state, x - 3, footY, z, BlockId.CANVAS)
  setBlock(state, x - 2, footY, z, BlockId.CUSHION)

  /** 熄了的火圈、洗礦槽與工具 */
  for (const [offsetX, offsetZ] of [[1, -1], [2, 0], [1, 1]] as const) {
    setBlock(state, x + offsetX, footY, z + offsetZ, BlockId.STONE_SLAB)
  }
  setBlock(state, x + 3, footY, z - 2, BlockId.FENCE)
  setBlock(state, x + 2, footY, z - 2, BlockId.FENCE)
  setBlock(state, x + 3, footY + 1, z - 2, BlockId.WOOD_SLAB)
  setBlock(state, x + 2, footY + 1, z - 2, BlockId.WOOD_SLAB)
  setBlock(state, x + 1, footY, z - 2, BlockId.CAULDRON)
  setBlock(state, x, footY, z + 2, BlockId.CRATE)
  setBlock(state, x + 1, footY, z + 2, BlockId.BARREL)
  setBlock(state, x + 3, footY, z + 2, BlockId.TOOL_PICKAXE)
  setBlock(state, x + 3, footY, z + 1, BlockId.BASKET)

  /** 河床裡最後一窪水：營地北邊最近的那幾格河床（比原野低一格的沙與礫） */
  let poolCount = 0
  for (let offsetZ = -3; offsetZ >= -9 && poolCount < 5; offsetZ--) {
    for (let offsetX = -1; offsetX <= 2 && poolCount < 5; offsetX++) {
      const cellX = x + offsetX
      const cellZ = z + offsetZ
      const topY = groundTopMap[cellX * WORLD_SIZE + cellZ]!
      const blockId = getBlock(state, cellX, topY, cellZ)
      if (topY !== CAMP_GROUND_Y - 1 || (blockId !== BlockId.GRAVEL && blockId !== BlockId.SAND))
        continue
      if (getBlock(state, cellX, topY + 1, cellZ) !== BlockId.AIR)
        continue
      setBlock(state, cellX, topY, cellZ, BlockId.WATER)
      setBlock(state, cellX, topY - 1, cellZ, BlockId.CLAY)
      poolCount++
    }
  }
}

/** 路邊被丟下的行李：兩個疊著的箱子、一個桶、一截車軸，旁邊一副曬白的牛骨 */
function placeAbandonedCargo(state: Uint8Array, groundTopMap: Uint8Array): void {
  const site = findFreeSite(state, groundTopMap, ABANDONED_CARGO_POINT, 2, 1, PLAIN_SET, 4)
  if (!site)
    return
  const { x, z, footY } = site
  clearPlantArea(state, x - 2, z - 1, x + 2, z + 1, footY)
  setBlock(state, x - 1, footY, z, BlockId.CRATE)
  setBlock(state, x - 1, footY + 1, z, BlockId.CRATE)
  setBlock(state, x, footY, z, BlockId.CHEST)
  setBlock(state, x + 1, footY, z + 1, BlockId.BARREL)
  setBlock(state, x + 2, footY, z - 1, BlockId.OAK_LOG_X)
  setBlock(state, x - 2, footY, z - 1, BlockId.BONES)
  setBlock(state, x, footY, z - 1, BlockId.PEBBLES)
}

/**
 * 篷車旁邊的東西
 *
 * 每一輛車朝圈外那一側綁一個水桶，隔一輛多一個箱子或一捆乾草。
 * 圈外那一側離營地中間的走道最遠，不擋路
 */
function placeWagonGear(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const [index, wagon] of WAGON_LIST.entries()) {
    const radian = (wagon.degree / 180) * Math.PI
    const isAlongX = Math.abs(Math.sin(radian)) >= Math.abs(Math.cos(radian))
    /** 車身沿哪一軸、朝圈外是另一軸的哪一邊 */
    const outward = isAlongX ? Math.sign(wagon.z - CAMP_CENTER.z) : Math.sign(wagon.x - CAMP_CENTER.x)
    const toWorld = (along: number): CampPoint => isAlongX
      ? { x: wagon.x + along, z: wagon.z + outward * 2 }
      : { x: wagon.x + outward * 2, z: wagon.z + along }

    const barrel = toWorld(-1)
    putOnGround(state, groundTopMap, barrel.x, barrel.z, BlockId.BARREL)
    const extra = toWorld(1)
    if (index % 2 === 0)
      putOnGround(state, groundTopMap, extra.x, extra.z, index % 4 === 0 ? BlockId.HAY : BlockId.CRATE)
  }

  /** 圈裡的一張擱板桌（兩根樁撐一塊板）與桌邊的竹簍，煮飯那一堆火的南邊 */
  const tableX = CAMP_CENTER.x + 2
  const tableZ = CAMP_CENTER.z + 3
  if (isFreeGround(state, tableX, CAMP_FOOT_Y, tableZ, PLAIN_SET) && isFreeGround(state, tableX + 1, CAMP_FOOT_Y, tableZ, PLAIN_SET)) {
    putProp(state, tableX, CAMP_FOOT_Y, tableZ, BlockId.FENCE)
    putProp(state, tableX + 1, CAMP_FOOT_Y, tableZ, BlockId.FENCE)
    setBlock(state, tableX, CAMP_FOOT_Y + 1, tableZ, BlockId.WOOD_SLAB)
    setBlock(state, tableX + 1, CAMP_FOOT_Y + 1, tableZ, BlockId.WOOD_SLAB)
    putOnGround(state, groundTopMap, tableX - 1, tableZ, BlockId.BASKET)
  }
}

/** 木屋邊的劈柴墩與斧頭、田邊的種子簍與鋤頭 */
function placeHomesteadGear(state: Uint8Array, groundTopMap: Uint8Array): void {
  const { x, z } = HOMESTEAD_POINT
  if (putOnGround(state, groundTopMap, x - 6, z + 4, BlockId.OAK_LOG))
    putOnGround(state, groundTopMap, x - 7, z + 4, BlockId.TOOL_AXE)
  putOnGround(state, groundTopMap, x - 6, z + 5, BlockId.TWIGS)

  putOnGround(state, groundTopMap, FIELD_RECT.minX - 1, FIELD_RECT.minZ + 1, BlockId.BASKET)
  putOnGround(state, groundTopMap, FIELD_RECT.minX - 1, FIELD_RECT.minZ + 2, BlockId.BASKET)
  putOnGround(state, groundTopMap, FIELD_RECT.minX - 1, FIELD_RECT.minZ + 4, BlockId.TOOL_HOE)
}

/**
 * 小丘上多出來的兩座墳
 *
 * 原本只有丘頂一座。坡上再立兩個小一號的十字（一根樁、頂上一塊橫板），腳邊各一塊石，
 * 一座墳是一個人，三座就是這條路的代價
 */
function placeExtraGraveList(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const [offsetX, offsetZ] of [[-3, 1], [3, -1]] as const) {
    const x = GRAVE_POINT.x + offsetX
    const z = GRAVE_POINT.z + offsetZ
    const footY = readFootY(groundTopMap, x, z)
    if (!isFreeGround(state, x, footY, z, PLAIN_SET))
      continue
    putProp(state, x, footY, z, BlockId.WOOD_POST)
    setBlock(state, x, footY + 1, z, BlockId.WOOD_SLAB)
    putOnGround(state, groundTopMap, x, z + 1, BlockId.SMALL_ROCK)
  }
}

/**
 * 岩丘腳下的碎石
 *
 * 紅岩丘原本從平地直接拔起來。丘腳四格內散一圈崩落的東西：整塊的紅岩、小石與碎石，
 * 越靠近丘越多；坡面上凡是踩得到的階也偶爾留一顆小石
 */
function scatterTalus(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  for (const outcrop of OUTCROP_LIST) {
    const reach = outcrop.radius + TALUS_REACH
    for (let x = outcrop.x - reach; x <= outcrop.x + reach; x++) {
      for (let z = outcrop.z - reach; z <= outcrop.z + reach; z++) {
        const roll = random()
        const distance = Math.hypot(x - outcrop.x, z - outcrop.z)
        if (distance > reach)
          continue
        const topY = groundTopMap[x * WORLD_SIZE + z]!
        const ground = getBlock(state, x, topY, z)
        const isOnRock = ground === BlockId.RED_ROCK || ground === BlockId.SANDSTONE || ground === BlockId.WHITE_SANDSTONE
        if (isOnRock) {
          if (roll < 0.06 && getBlock(state, x, topY + 1, z) === BlockId.AIR)
            setBlock(state, x, topY + 1, z, roll < 0.03 ? BlockId.SMALL_ROCK : BlockId.PEBBLES)
          continue
        }
        const chance = 0.34 * (1 - (distance - outcrop.radius) / (TALUS_REACH + 1))
        if (roll > chance || !isFreeGround(state, x, topY + 1, z, PLAIN_SET))
          continue
        const kind = roll / chance
        putProp(state, x, topY + 1, z, kind < 0.2 ? BlockId.RED_ROCK : kind < 0.55 ? BlockId.SMALL_ROCK : BlockId.PEBBLES)
      }
    }
  }
}

/**
 * 岩丘的層理
 *
 * 岩丘原本只有「每三格一層砂岩」一種節奏，與外圍的岩壁一模一樣。走得上去的這幾座在第五格高的地方多夾一道白砂岩，
 * 站在丘腳看是一圈淺色的腰帶，爬到那一階時腳下的顏色也跟著換；矮的那一座不到五格，沒有這一道
 */
function bandOutcropStrata(state: Uint8Array, groundTopMap: Uint8Array): void {
  const bandY = CAMP_GROUND_Y + OUTCROP_PALE_BAND_LEVEL
  for (const outcrop of OUTCROP_LIST) {
    const reach = outcrop.radius + 3
    for (let x = outcrop.x - reach; x <= outcrop.x + reach; x++) {
      for (let z = outcrop.z - reach; z <= outcrop.z + reach; z++) {
        if (groundTopMap[x * WORLD_SIZE + z]! < bandY)
          continue
        const blockId = getBlock(state, x, bandY, z)
        if (blockId === BlockId.RED_ROCK || blockId === BlockId.SANDSTONE)
          setBlock(state, x, bandY, z, BlockId.WHITE_SANDSTONE)
      }
    }
  }
}

/**
 * 散在原野上的白骨與路邊的碎石
 *
 * 牛骨六副，都在離營地遠的紅土上；車轍兩側被輪子擠出去的碎石沿路零星幾顆
 */
function scatterBoneAndPebble(state: Uint8Array, groundTopMap: Uint8Array, trailDistanceMap: Float32Array, random: () => number): void {
  let boneCount = 0
  for (let attempt = 0; attempt < 200 && boneCount < 6; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 26 + random() * (CAMP_SLOW_RADIUS - 30)
    const x = Math.round(CAMP_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(CAMP_CENTER.z + Math.sin(angle) * radius)
    const topY = groundTopMap[x * WORLD_SIZE + z]!
    if (getBlock(state, x, topY, z) !== BlockId.RED_SAND || Math.hypot(x - CAMP_PORTAL_POINT.x, z - CAMP_PORTAL_POINT.z) < 8)
      continue
    if (!isFreeGround(state, x, topY + 1, z, PLAIN_SET))
      continue
    putProp(state, x, topY + 1, z, BlockId.BONES)
    boneCount++
  }

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const roll = random()
      const distance = trailDistanceMap[x * WORLD_SIZE + z]!
      if (distance < 2.2 || distance > 3.4 || roll > 0.07)
        continue
      if (Math.hypot(x - CAMP_CENTER.x, z - CAMP_CENTER.z) > CAMP_SLOW_RADIUS || Math.hypot(x - CAMP_PORTAL_POINT.x, z - CAMP_PORTAL_POINT.z) < 6)
        continue
      putOnGround(state, groundTopMap, x, z, roll < 0.02 ? BlockId.SMALL_ROCK : BlockId.PEBBLES)
    }
  }
}

/** 補上拓荒原的細節小景 */
export function decorateCampfire(state: Uint8Array, groundTopMap: Uint8Array, trailDistanceMap: Float32Array): void {
  const random = createSeededRandom('frontier-detail')

  placeWaterTower(state, groundTopMap)
  placeProspectorCamp(state, groundTopMap)
  placeTelegraphPoleList(state, groundTopMap)
  placeAbandonedCargo(state, groundTopMap)
  placeWagonGear(state, groundTopMap)
  placeHomesteadGear(state, groundTopMap)
  placeExtraGraveList(state, groundTopMap)
  bandOutcropStrata(state, groundTopMap)
  scatterTalus(state, groundTopMap, random)
  scatterBoneAndPebble(state, groundTopMap, trailDistanceMap, random)
}
