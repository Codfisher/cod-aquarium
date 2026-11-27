import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isPassableBlock, isWaterBlock } from '../../block/block-constants'
import {
  getNoisyDistance,
  placeOakTree,
  placeStoneLantern,
  plantWithStack,
  setDecoration,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_HEIGHT, WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { isWaterSurface } from '../realm-terrain-kit'
import {
  CASCADE_X,
  HIDDEN_TOP_Y,
  measureStreamHalfWidth,
  measureStreamZ,
  measureValleyCenterZ,
  measureValleyHalfWidth,
  PLUNGE_POOL,
  RIM_MAX_Y,
  RIM_MIN_Y,
  RIVER_PORTAL_POINT,
  STRAND_ROCK_LIST,
  UPPER_FLOOR_Y,
  VALLEY_END_X,
  VALLEY_FLOOR_Y,
  VALLEY_HEAD_X,
  WALL_SLOPE,
  WATERFALL_HALF_WIDTH,
  WATERFALL_POINT,
  WATERFALL_TOP_Y,
} from './river-layout'
import { RIVER_REALM } from './river-realm'

/**
 * 溪谷的地形
 *
 * 只有地形 worker 用。整道溪谷照遣水（buildRiverGarden）放大：
 * 遣水是一道噪音彎出來的水道，兩側礫石灘，上游一座岩丘，水從岩頂的池子翻下來落進水潭；
 * 水道上一座兩排半磚、兩側立欄杆的木橋，一座鹿威；草地上蕨、高草、紙莎草、捲葉草與堇，
 * 水面撒睡蓮，兩棵橡樹、一盞石燈籠。岩丘是圓石與青苔圓石混著疊的。
 * 這裡把岩丘放大成圍住溪谷的谷壁，把水道放大成一條走得到盡頭的溪，其餘一樣一樣照搬，只是多擺幾份；
 * 遣水沒有的東西（松、竹林、小屋）一樣都不加。
 *
 * 谷壁頂上那一圈稜線以外看不到，全換成不畫的 LAKE_BED：
 * 谷壁是好幾萬格的實心岩，照方塊畫的話三角形會多好幾倍
 */

/** 每一格柱是谷底、谷邊的土坎、谷壁，還是稜線外看不到的地方 */
type ColumnKind = 'floor' | 'bank' | 'wall' | 'hidden'

interface ColumnInfo {
  kind: ColumnKind;
  /** 頂面那一格的高度；hidden 是 HIDDEN_TOP_Y */
  topY: number;
  /** 這一格柱的谷底高度（上游高一格），谷壁從這裡往上算 */
  floorY: number;
}

/**
 * 瀑布那面崖：崖腳往西這麼多排、溪心左右這麼寬是直上直下的，水才落得下來
 *
 * 左右各十二格：主瀑布、旁邊那一道兩段的小瀑布與兩條細流都落在這一面崖上
 */
const WATERFALL_CLIFF_DEPTH = 10
const WATERFALL_CLIFF_HALF_WIDTH = 12
/** 主瀑布的水幕寬九格（被兩塊突出的岩分成三股，見 STRAND_ROCK_LIST），崖頂的缺口往崖裡挖六排 */
const WATERFALL_NOTCH_DEPTH = 6

/**
 * 旁邊那一道小瀑布：從崖縫湧出來，落在一塊突出的岩台上積成一小池，再從岩台邊翻下去
 *
 * offsetZ 是離主瀑布溪心幾格，crackLevel 與 ledgeLevel 以上游谷底起算
 */
const SIDE_FALL = { offsetZ: 7, crackLevel: 18, ledgeLevel: 9 } as const

/** 兩條細流：崖縫裡滲出來，一條細細的水一路滑到崖腳。offsetZ 是負的：與小瀑布分在主瀑布兩側 */
const TRICKLE_LIST = [
  { offsetZ: -7, fromLevel: 14 },
  { offsetZ: -10, fromLevel: 9 },
] as const

/**
 * 兩處寬一點、深一點的水潭，溪水在這裡慢下來，睡蓮與水鳥都在這裡
 *
 * 遣水的睡蓮撒在整條水道上；放大之後整條溪都撒會像浮萍，收進兩個潭
 */
const CALM_POOL_LIST = [
  { x: 110, radius: 5.5 },
  { x: 150, radius: 5 },
] as const

/** 木橋的位置：下游那一段，從谷底的中段跨過溪 */
const BRIDGE_X = 158

/**
 * 飛石：瀑布潭出口往下游幾步，一顆一顆跨過溪
 *
 * 站在飛石上正好是看瀑布最好的位置：整道水幕、旁邊兩段的小瀑布與潭都在眼前
 */
const STEPPING_STONE_X = VALLEY_HEAD_X + PLUNGE_POOL.offsetX + PLUNGE_POOL.radius + 4

/** 世界頂下一格：瀑布那面崖最高到這裡 */
const PEAK_Y = WORLD_HEIGHT - 1

function getColumn(columnList: ColumnInfo[], x: number, z: number): ColumnInfo {
  return columnList[x * WORLD_SIZE + z]!
}

/** 跌水那道坎在這一列的哪一排：坎以西是上游，高一格 */
function measureCascadeX(z: number): number {
  return CASCADE_X + Math.round(fbm2D(z * 0.1 + 6, 1.1, 2, 0.5) * 2)
}

/** 稜線的高度，沿著谷緩緩起伏 */
function measureRimY(x: number, z: number): number {
  const ratio = fbm2D(x * 0.04 + 2, z * 0.04 - 5, 2, 0.5) * 0.7 + 0.5
  return Math.round(RIM_MIN_Y + (RIM_MAX_Y - RIM_MIN_Y) * Math.max(0, Math.min(1, ratio)))
}

/** 是不是瀑布那面直上直下的崖 */
function isWaterfallCliff(x: number, z: number): boolean {
  return x < VALLEY_HEAD_X
    && x >= VALLEY_HEAD_X - WATERFALL_CLIFF_DEPTH
    && Math.abs(z - WATERFALL_POINT.z) <= WATERFALL_CLIFF_HALF_WIDTH
}

/**
 * 某一格柱在谷底外面多遠（零以下是谷底）
 *
 * 南北看離谷底中線的距離減掉半寬，東西看離崖腳與窄峽盡頭多遠，取最大的那個
 */
function measureOutsideDistance(x: number, z: number): number {
  const across = Math.abs(z - measureValleyCenterZ(x)) - measureValleyHalfWidth(x)
  return Math.max(across, VALLEY_HEAD_X - x, x - VALLEY_END_X)
}

/** 整張高度圖 */
function createColumnMap(): ColumnInfo[] {
  const columnList: ColumnInfo[] = []

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const floorY = x < measureCascadeX(z) ? UPPER_FLOOR_Y : VALLEY_FLOOR_Y
      const outside = measureOutsideDistance(x, z)

      if (outside <= 0) {
        columnList.push({ kind: 'floor', topY: floorY, floorY })
        continue
      }

      /** 谷邊先一兩格的土坎，再往外才是谷壁 */
      if (outside <= 2 && !isWaterfallCliff(x, z)) {
        columnList.push({ kind: 'bank', topY: floorY + Math.ceil(outside), floorY })
        continue
      }

      let rimY = measureRimY(x, z)
      if (isWaterfallCliff(x, z)) {
        /** 瀑布那面崖要比水落下來的那一層再高幾格，缺口才夾在崖頂中間 */
        /** 崖面的凹凸、岩階與突出的岩台在 shapeWaterfallCliff 裡做，這裡先立一整面 */
        rimY = Math.min(PEAK_Y, Math.max(rimY, WATERFALL_TOP_Y + 3))
        columnList.push({ kind: 'wall', topY: rimY, floorY })
        continue
      }

      const slopeY = floorY + 2 + (outside - 2) * WALL_SLOPE + fbm2D(x * 0.12, z * 0.12, 2, 0.5) * 3
      /** 稜線再往外三排還是稜線，再往外就看不到了 */
      const capDistance = 2 + (rimY - floorY - 2) / WALL_SLOPE + 3
      if (outside > capDistance + 3) {
        columnList.push({ kind: 'hidden', topY: HIDDEN_TOP_Y, floorY })
        continue
      }
      columnList.push({ kind: 'wall', topY: Math.round(Math.min(rimY, slopeY)), floorY })
    }
  }

  return columnList
}

/**
 * 谷壁的石頭
 *
 * 遣水的岩丘是圓石裡摻兩成青苔圓石。谷壁照這個比例，再加一點原石；
 * 越低、越靠瀑布，青苔越多：水氣都積在谷底與潭邊
 */
function pickWallBlock(x: number, y: number, floorY: number, random: () => number): BlockId {
  const lowRatio = Math.max(0, 1 - (y - floorY) / 12)
  const sprayRatio = Math.max(0, 1 - Math.hypot(x - WATERFALL_POINT.x, (y - floorY) * 0.5) / 26)
  const roll = random()
  if (roll < 0.3 + lowRatio * 0.25 + sprayRatio * 0.35)
    return BlockId.MOSSY_COBBLESTONE
  if (roll < 0.62)
    return BlockId.COBBLESTONE
  return BlockId.STONE
}

/** 放方塊：谷底、土坎、谷壁，稜線外面那一大片是不畫的 LAKE_BED */
function placeColumnList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('river-wall')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const column = getColumn(columnList, x, z)
      setBlock(state, x, 0, z, BlockId.BEDROCK)

      if (column.kind === 'hidden') {
        for (let y = 1; y <= HIDDEN_TOP_Y; y++) {
          setBlock(state, x, y, z, BlockId.LAKE_BED)
        }
        continue
      }

      if (column.kind === 'floor' || column.kind === 'bank') {
        for (let y = 1; y < column.floorY - 2; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        for (let y = column.floorY - 2; y < column.topY; y++) {
          setBlock(state, x, y, z, BlockId.DIRT)
        }
        setBlock(state, x, column.topY, z, BlockId.GRASS)
        continue
      }

      for (let y = 1; y < column.floorY; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = column.floorY; y < column.topY; y++) {
        setBlock(state, x, y, z, pickWallBlock(x, y, column.floorY, random))
      }
      /** 稜線與矮的岩階上長草，高處的岩階露石 */
      const isLedge = column.topY - column.floorY < 6 || column.topY >= RIM_MIN_Y
      setBlock(state, x, column.topY, z, isLedge ? BlockId.GRASS : pickWallBlock(x, column.topY, column.floorY, random))
    }
  }
}

/**
 * 溪
 *
 * 與遣水的水道同一個做法：往下挖、礫石鋪底，水面與草地齊平；溪心深兩格、溪邊一格，
 * 兩側一圈礫石灘。兩個水潭寬一點、深三格
 */
function carveStream(state: Uint8Array, columnList: ColumnInfo[]): void {
  for (let x = VALLEY_HEAD_X; x <= VALLEY_END_X; x++) {
    const streamZ = measureStreamZ(x)
    const calmPool = CALM_POOL_LIST.find((pool) => Math.abs(x - pool.x) <= pool.radius)
    const poolBulge = calmPool ? Math.sqrt(1 - ((x - calmPool.x) / calmPool.radius) ** 2) * 2.5 : 0
    const halfWidth = measureStreamHalfWidth(x) + poolBulge

    for (let z = Math.floor(streamZ - halfWidth - 3); z <= Math.ceil(streamZ + halfWidth + 3); z++) {
      const column = getColumn(columnList, x, z)
      if (column.kind !== 'floor')
        continue

      const across = Math.abs(z - streamZ)
      if (across <= halfWidth) {
        const depth = poolBulge > 1 && across < halfWidth - 1.5
          ? 3
          : (across < halfWidth - 1 ? 2 : 1)
        setBlock(state, x, column.floorY - depth, z, BlockId.GRAVEL)
        for (let y = column.floorY - depth + 1; y <= column.floorY; y++) {
          setBlock(state, x, y, z, BlockId.WATER)
        }
        continue
      }
      if (across <= halfWidth + 1.6) {
        /** 礫石灘，水與草之間得有一段過渡 */
        setBlock(state, x, column.floorY, z, BlockId.GRAVEL)
      }
    }
  }

  placeCascade(state, columnList)
}

/**
 * 跌水
 *
 * 上游谷底高一格，溪水在那道坎上落一格。只有兩層水面一高一低的話，
 * 從岸上看是一階不動的水，音景卻在那裡放了一顆「跌水」：
 * 坎下第一排的水面上疊一格流水，與瀑布、遣水的水口同一種做法，水是翻下來的
 */
function placeCascade(state: Uint8Array, columnList: ColumnInfo[]): void {
  for (let x = VALLEY_HEAD_X + 1; x <= VALLEY_END_X; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const column = getColumn(columnList, x, z)
      const upstream = getColumn(columnList, x - 1, z)
      if (column.kind !== 'floor' || upstream.kind !== 'floor')
        continue
      if (column.floorY !== VALLEY_FLOOR_Y || upstream.floorY !== UPPER_FLOOR_Y)
        continue
      if (!isWaterSurface(state, x, VALLEY_FLOOR_Y, z) || getBlock(state, x - 1, UPPER_FLOOR_Y, z) !== BlockId.WATER)
        continue
      setBlock(state, x, UPPER_FLOOR_Y, z, BlockId.FLOWING_WATER)
    }
  }
}

/** 主瀑布溪心往南（+1）還是往北（-1）離谷底中線比較遠：旁邊的小瀑布擺在寬的那一側 */
function measureSideSign(): 1 | -1 {
  return WATERFALL_POINT.z > measureValleyCenterZ(VALLEY_HEAD_X) ? -1 : 1
}

/** 某一格是不是空氣（花草也算）：水與岩都不算 */
function isOpenCell(state: Uint8Array, x: number, y: number, z: number): boolean {
  const blockId = getBlock(state, x, y, z)
  return blockId === BlockId.AIR || (isPassableBlock(blockId) && !isWaterBlock(blockId))
}

/** 瀑布周圍的岩：圓石與青苔圓石，水氣重，青苔多一點 */
function pickWetRock(random: () => number): BlockId {
  return random() < 0.6 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE
}

/**
 * 瀑布那面崖的凹凸
 *
 * 直上直下的一整面崖是一堵牆。崖面吃二維噪音往裡缺一兩格，缺口上面的岩懸在半空就是一道簷；
 * 三層高度上零星往外突出一格的岩階（岩層），階上長蕨與高草，簷下垂著藤。
 * 水幕、小瀑布與細流的那幾排不動，水要貼著崖落
 */
function shapeWaterfallCliff(state: Uint8Array, columnList: ColumnInfo[], isWaterLane: (offsetZ: number) => boolean): void {
  const random = createSeededRandom('river-cliff-face')
  const fallZ = WATERFALL_POINT.z
  const faceX = VALLEY_HEAD_X - 1

  for (let offsetZ = -WATERFALL_CLIFF_HALF_WIDTH; offsetZ <= WATERFALL_CLIFF_HALF_WIDTH; offsetZ++) {
    if (isWaterLane(offsetZ))
      continue
    const z = fallZ + offsetZ
    const topY = getColumn(columnList, faceX, z).topY

    for (let y = UPPER_FLOOR_Y + 1; y <= topY - 2; y++) {
      const recess = fbm2D(z * 0.31 + 5, y * 0.27 - 3, 2, 0.5)
      if (recess > 0.16) {
        setBlock(state, faceX, y, z, BlockId.AIR)
        if (recess > 0.36) {
          setBlock(state, faceX - 1, y, z, BlockId.AIR)
        }
      }
    }

    /** 簷下的藤：凹進去的那一格頭上還是岩，就垂一串下來 */
    for (let y = UPPER_FLOOR_Y + 2; y <= topY - 3; y++) {
      const isUnderEave = getBlock(state, faceX, y, z) === BlockId.AIR
        && !isOpenCell(state, faceX, y + 1, z)
      if (isUnderEave && random() < 0.4) {
        setBlock(state, faceX, y, z, BlockId.IVY)
        if (getBlock(state, faceX, y - 1, z) === BlockId.AIR && random() < 0.5) {
          setBlock(state, faceX, y - 1, z, BlockId.IVY)
        }
      }
    }

    /** 往外突出的岩層，階上長蕨 */
    for (const level of [6, 12, 18]) {
      const y = UPPER_FLOOR_Y + level
      if (fbm2D(z * 0.4 + level, level * 0.7, 2, 0.5) < -0.05)
        continue
      if (isOpenCell(state, faceX, y, z) || !isOpenCell(state, VALLEY_HEAD_X, y, z))
        continue
      setBlock(state, VALLEY_HEAD_X, y, z, pickWetRock(random))
      if (getBlock(state, VALLEY_HEAD_X, y + 1, z) === BlockId.AIR) {
        const roll = random()
        if (roll < 0.5)
          setBlock(state, VALLEY_HEAD_X, y + 1, z, BlockId.FERN)
        else if (roll < 0.7)
          setBlock(state, VALLEY_HEAD_X, y + 1, z, BlockId.TALL_GRASS)
      }
    }
  }
}

/**
 * 水潭
 *
 * 圓心在崖腳往東幾格，邊緣吃噪音；中心深四格，往外兩圈各淺一格，外面一圈礫石灘。
 * 灘上一圈青苔大石，崖的那一側不擺（水幕落在那裡），下游的出水口也不擋
 */
function carvePlungePool(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('river-plunge-pool')
  const fallZ = WATERFALL_POINT.z
  const poolX = VALLEY_HEAD_X + PLUNGE_POOL.offsetX
  const reach = PLUNGE_POOL.radius + 3

  for (let x = poolX - reach; x <= poolX + reach; x++) {
    for (let z = fallZ - reach; z <= fallZ + reach; z++) {
      const column = getColumn(columnList, x, z)
      if (column.kind !== 'floor')
        continue
      const distance = getNoisyDistance(x, z, poolX, fallZ, 0.22, 1.6)
      if (distance > PLUNGE_POOL.radius) {
        if (distance <= PLUNGE_POOL.radius + 1.5) {
          setBlock(state, x, column.floorY, z, BlockId.GRAVEL)
        }
        continue
      }
      let depth = 2
      if (distance < PLUNGE_POOL.radius - 4)
        depth = PLUNGE_POOL.depth
      else if (distance < PLUNGE_POOL.radius - 2)
        depth = PLUNGE_POOL.depth - 1
      setBlock(state, x, column.floorY - depth, z, BlockId.GRAVEL)
      for (let y = column.floorY - depth + 1; y <= column.floorY; y++) {
        setBlock(state, x, y, z, BlockId.WATER)
      }
    }
  }

  /** 潭邊一圈大石：從潭心往外量到礫石灘上，一兩格高 */
  for (let degree = -80; degree <= 80; degree += 22) {
    const radian = (degree / 180) * Math.PI
    const radius = PLUNGE_POOL.radius + 1 + random() * 1.5
    const x = Math.round(poolX + Math.cos(radian) * radius)
    const z = Math.round(fallZ + Math.sin(radian) * radius)
    const column = getColumn(columnList, x, z)
    if (column.kind !== 'floor' || getBlock(state, x, column.floorY, z) !== BlockId.GRAVEL)
      continue
    if (Math.abs(z - measureStreamZ(x)) < measureStreamHalfWidth(x) + 1)
      continue
    const height = 1 + Math.floor(random() * 2)
    for (let level = 1; level <= height; level++) {
      setBlock(state, x, column.floorY + level, z, pickWetRock(random))
    }
    if (random() < 0.5) {
      setBlock(state, x + (random() < 0.5 ? 1 : -1), column.floorY + 1, z, pickWetRock(random))
    }
  }
}

/**
 * 瀑布
 *
 * 遣水的瀑布是從岩丘正面挖一道槽、水從岩頂的池子翻下來落進水潭。
 * 這裡的崖高二十五格上下：
 *
 * - 崖頂一道往崖裡挖六排的缺口，溪水從上游流到缺口邊翻下來；缺口兩邊低一格，水口是歪的
 * - 主瀑布九格寬、落二十二格，中間兩塊突出的岩把水幕分成寬窄不一的三股，岩底下又匯回來
 * - 旁邊一道兩段的小瀑布：崖縫湧出來，落在突出的岩台上積成一小池，再從岩台邊翻進潭裡
 * - 另一側兩條細流貼著崖滑下來
 * - 崖面凹凸、岩層突出、簷下垂藤，潭邊一圈青苔大石
 */
function buildWaterfall(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('river-waterfall')
  const fallZ = WATERFALL_POINT.z
  const sideSign = measureSideSign()
  const sideOffsetList = [SIDE_FALL.offsetZ, SIDE_FALL.offsetZ + 1].map((offset) => offset * sideSign)
  /** 細流擺在小瀑布的另一側 */
  const trickleOffsetList = TRICKLE_LIST.map((trickle) => trickle.offsetZ * sideSign)

  /** 水會經過的那幾排，崖面不挖也不擺岩階 */
  const isWaterLane = (offsetZ: number) => Math.abs(offsetZ) <= WATERFALL_HALF_WIDTH + 1
    || (offsetZ * sideSign >= SIDE_FALL.offsetZ - 1 && offsetZ * sideSign <= SIDE_FALL.offsetZ + 2)
    || trickleOffsetList.includes(offsetZ)

  shapeWaterfallCliff(state, columnList, isWaterLane)
  carvePlungePool(state, columnList)

  /** 崖頂的缺口：往崖裡挖幾排，水面比崖頂矮；兩邊那一排的水口低一格 */
  for (let x = VALLEY_HEAD_X - WATERFALL_NOTCH_DEPTH; x < VALLEY_HEAD_X; x++) {
    for (let offsetZ = -WATERFALL_HALF_WIDTH; offsetZ <= WATERFALL_HALF_WIDTH; offsetZ++) {
      const z = fallZ + offsetZ
      const column = getColumn(columnList, x, z)
      const isLowLip = Math.abs(offsetZ) === WATERFALL_HALF_WIDTH && x === VALLEY_HEAD_X - 1
      const waterY = isLowLip ? WATERFALL_TOP_Y - 1 : WATERFALL_TOP_Y
      for (let y = waterY + 1; y <= column.topY; y++) {
        setBlock(state, x, y, z, BlockId.AIR)
      }
      setBlock(state, x, waterY, z, BlockId.WATER)
    }
  }

  /** 主瀑布：崖腳前那一排從水口一路疊流水到潭面上一格，突出的岩那一段換成岩 */
  for (let offsetZ = -WATERFALL_HALF_WIDTH; offsetZ <= WATERFALL_HALF_WIDTH; offsetZ++) {
    const z = fallZ + offsetZ
    const topY = Math.abs(offsetZ) === WATERFALL_HALF_WIDTH ? WATERFALL_TOP_Y - 1 : WATERFALL_TOP_Y
    const rock = STRAND_ROCK_LIST.find((item) => item.offsetZ === offsetZ)
    for (let y = UPPER_FLOOR_Y + 1; y <= topY; y++) {
      const isRock = rock !== undefined
        && y >= UPPER_FLOOR_Y + rock.fromLevel
        && y <= UPPER_FLOOR_Y + rock.toLevel
      setBlock(state, VALLEY_HEAD_X, y, z, isRock ? pickWetRock(random) : BlockId.FLOWING_WATER)
    }
  }

  /**
   * 旁邊那一道小瀑布
   *
   * 岩台是三格厚、四格深、四格寬的一塊，貼在崖上；台頂中間兩排挖成一小池，
   * 水從崖縫湧出來落進池裡，再從岩台外緣翻下去
   */
  const ledgeY = UPPER_FLOOR_Y + SIDE_FALL.ledgeLevel
  const crackY = UPPER_FLOOR_Y + SIDE_FALL.crackLevel
  for (let depth = 0; depth <= 3; depth++) {
    for (let offset = SIDE_FALL.offsetZ - 1; offset <= SIDE_FALL.offsetZ + 2; offset++) {
      const z = fallZ + offset * sideSign
      for (let y = ledgeY - 2; y <= ledgeY; y++) {
        setBlock(state, VALLEY_HEAD_X + depth, y, z, pickWetRock(random))
      }
    }
  }
  for (const offsetZ of sideOffsetList) {
    const z = fallZ + offsetZ
    for (let depth = 0; depth <= 3; depth++) {
      setBlock(state, VALLEY_HEAD_X + depth, ledgeY, z, BlockId.WATER)
    }
    /** 崖縫：挖開兩格，下面那格是湧出來的水 */
    setBlock(state, VALLEY_HEAD_X - 1, crackY + 1, z, BlockId.AIR)
    setBlock(state, VALLEY_HEAD_X - 1, crackY, z, BlockId.WATER)
    for (let y = ledgeY + 1; y <= crackY; y++) {
      setBlock(state, VALLEY_HEAD_X, y, z, BlockId.FLOWING_WATER)
    }
    /** 從岩台外緣翻下去，落到潭面（或地面）為止 */
    for (let y = ledgeY; y > UPPER_FLOOR_Y && isOpenCell(state, VALLEY_HEAD_X + 4, y, z); y--) {
      setBlock(state, VALLEY_HEAD_X + 4, y, z, BlockId.FLOWING_WATER)
    }
  }

  /** 細流：一格寬，從崖縫貼著崖面滑到碰到東西為止 */
  for (const [index, trickle] of TRICKLE_LIST.entries()) {
    const z = fallZ + trickleOffsetList[index]!
    const fromY = UPPER_FLOOR_Y + trickle.fromLevel
    if (isOpenCell(state, VALLEY_HEAD_X - 1, fromY, z))
      continue
    setBlock(state, VALLEY_HEAD_X - 1, fromY, z, BlockId.WATER)
    for (let y = fromY; y > 0 && isOpenCell(state, VALLEY_HEAD_X, y, z); y--) {
      setBlock(state, VALLEY_HEAD_X, y, z, BlockId.FLOWING_WATER)
    }
  }
}

/**
 * 窄峽盡頭的岩縫
 *
 * 溪水鑽進谷壁底下：水面上一格就是岩，人擠不進去，從峽裡看是一道黑黑的縫
 */
function carveGorgeSlot(state: Uint8Array): void {
  const slotZ = Math.round(measureStreamZ(VALLEY_END_X))
  for (let x = VALLEY_END_X + 1; x <= VALLEY_END_X + 3; x++) {
    for (let z = slotZ - 1; z <= slotZ + 1; z++) {
      setBlock(state, x, VALLEY_FLOOR_Y - 1, z, BlockId.GRAVEL)
      setBlock(state, x, VALLEY_FLOOR_Y, z, BlockId.WATER)
    }
  }
}

/**
 * 木橋
 *
 * 照遣水那座：橋面兩排半磚、比水面高半格；兩側各一排實心的橋樑，欄杆站在樑上。
 * 遣水的水道南北走、橋東西跨；這裡的溪東西走，橋就南北跨
 */
function buildBridge(state: Uint8Array, columnList: ColumnInfo[]): void {
  const streamZ = measureStreamZ(BRIDGE_X)
  const halfLength = Math.ceil(measureStreamHalfWidth(BRIDGE_X)) + 3
  const deckY = VALLEY_FLOOR_Y + 1

  for (let z = Math.round(streamZ) - halfLength; z <= Math.round(streamZ) + halfLength; z++) {
    if (getColumn(columnList, BRIDGE_X, z).kind !== 'floor')
      continue
    setBlock(state, BRIDGE_X, deckY, z, BlockId.WOOD_SLAB)
    setBlock(state, BRIDGE_X + 1, deckY, z, BlockId.WOOD_SLAB)
    for (const railX of [BRIDGE_X - 1, BRIDGE_X + 2]) {
      setBlock(state, railX, deckY, z, BlockId.PLANKS)
      setBlock(state, railX, deckY + 1, z, BlockId.FENCE)
    }
  }
}

/**
 * 飛石
 *
 * 遣水的禪庭外面有飛石，水道上沒有；溪寬了，橋只有一座，
 * 上游這一段在溪裡擺一排青苔圓石，一顆一顆踩過去。一格一顆、左右錯開，不排成一條直線
 */
function placeSteppingStoneList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const streamZ = measureStreamZ(STEPPING_STONE_X)
  const halfWidth = measureStreamHalfWidth(STEPPING_STONE_X)
  let index = 0
  for (let z = Math.floor(streamZ - halfWidth); z <= Math.ceil(streamZ + halfWidth); z++) {
    const x = STEPPING_STONE_X + (index % 2)
    index++
    const column = getColumn(columnList, x, z)
    if (column.kind !== 'floor' || !isWaterSurface(state, x, column.floorY, z))
      continue
    setBlock(state, x, column.floorY, z, BlockId.MOSSY_COBBLESTONE)
  }
}

/**
 * 鹿威（添水）
 *
 * 照遣水那座：石板座、兩節豎著的竹、頂上一節橫出去。擺在回程門西南邊的草地上，
 * 從門走進溪谷第一眼就看得到它，與遣水木座上的那一座是同一個招呼
 */
function placeDeerScarer(state: Uint8Array, columnList: ColumnInfo[]): void {
  const x = RIVER_PORTAL_POINT.x - 6
  const z = RIVER_PORTAL_POINT.z + 4
  const groundY = getColumn(columnList, x, z).topY + 1
  setBlock(state, x, groundY, z, BlockId.STONE_TILE)
  setBlock(state, x, groundY + 1, z, BlockId.BAMBOO_BLOCK)
  setBlock(state, x, groundY + 2, z, BlockId.BAMBOO_BLOCK)
  setBlock(state, x + 1, groundY + 2, z, BlockId.BAMBOO_BLOCK)
}

/** 這一格柱是不是可以擺東西的草地：谷底或土坎、頂面是草、頭上是空的 */
function isOpenGrass(state: Uint8Array, columnList: ColumnInfo[], x: number, z: number): boolean {
  const column = getColumn(columnList, x, z)
  if (column.kind !== 'floor' && column.kind !== 'bank')
    return false
  return getBlock(state, x, column.topY, z) === BlockId.GRASS
    && getBlock(state, x, column.topY + 1, z) === BlockId.AIR
}

/** 離門、橋、飛石、潭太近的地方不擺樹與石頭，留出走路的地方 */
function isKeepClear(x: number, z: number): boolean {
  if (Math.hypot(x - RIVER_PORTAL_POINT.x, z - RIVER_PORTAL_POINT.z) < 8)
    return true
  if (Math.abs(x - BRIDGE_X) < 4 || Math.abs(x - STEPPING_STONE_X) < 3)
    return true
  return Math.hypot(x - VALLEY_HEAD_X - PLUNGE_POOL.offsetX, z - WATERFALL_POINT.z) < PLUNGE_POOL.radius + 3
}

/**
 * 橡樹
 *
 * 遣水的兩棵橡樹在木座的角上。谷底多種幾棵，散在離溪有點距離的草地上；
 * 稜線上也零星幾棵，從谷底往上看，稜線才是一排樹的剪影而不是一道光禿的牆
 */
function placeOakList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('river-oak')

  let floorCount = 0
  for (let attempt = 0; attempt < 600 && floorCount < 9; attempt++) {
    const x = Math.round(VALLEY_HEAD_X + 14 + random() * (VALLEY_END_X - VALLEY_HEAD_X - 40))
    const z = Math.round(measureValleyCenterZ(x) + (random() * 2 - 1) * measureValleyHalfWidth(x))
    if (isKeepClear(x, z) || Math.abs(z - measureStreamZ(x)) < measureStreamHalfWidth(x) + 5)
      continue
    if (!isOpenGrass(state, columnList, x, z))
      continue
    placeOakTree(state, x, getColumn(columnList, x, z).topY + 1, z, 4 + Math.floor(random() * 2))
    floorCount++
  }

  let rimCount = 0
  for (let attempt = 0; attempt < 2000 && rimCount < 14; attempt++) {
    const x = Math.round(VALLEY_HEAD_X - 12 + random() * (VALLEY_END_X - VALLEY_HEAD_X + 24))
    const side = random() < 0.5 ? -1 : 1
    const z = Math.round(measureValleyCenterZ(x) + side * (measureValleyHalfWidth(x) + 9 + random() * 6))
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE)
      continue
    const column = getColumn(columnList, x, z)
    if (column.kind !== 'wall' || column.topY < RIM_MIN_Y)
      continue
    if (getBlock(state, x, column.topY, z) !== BlockId.GRASS || column.topY + 7 >= 40)
      continue
    placeOakTree(state, x, column.topY + 1, z, 2 + Math.floor(random() * 2))
    rimCount++
  }
}

/**
 * 青苔大石
 *
 * 遣水岩丘的石頭散到溪邊與谷壁腳下：兩三格的一團，青苔圓石摻圓石
 */
function placeBoulderList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('river-boulder')
  let placedCount = 0

  for (let attempt = 0; attempt < 600 && placedCount < 14; attempt++) {
    const x = Math.round(VALLEY_HEAD_X + 8 + random() * (VALLEY_END_X - VALLEY_HEAD_X - 16))
    const nearStream = random() < 0.5
    const streamZ = measureStreamZ(x)
    const z = nearStream
      ? Math.round(streamZ + (random() < 0.5 ? -1 : 1) * (measureStreamHalfWidth(x) + 2))
      : Math.round(measureValleyCenterZ(x) + (random() < 0.5 ? -1 : 1) * (measureValleyHalfWidth(x) - 1))
    /** 落在草地或礫石灘上才擺 */
    const isGravel = getBlock(state, x, getColumn(columnList, x, z).topY, z) === BlockId.GRAVEL
    if (isKeepClear(x, z) || (!isOpenGrass(state, columnList, x, z) && !isGravel))
      continue

    const groundY = getColumn(columnList, x, z).topY + 1
    const size = 1 + Math.floor(random() * 2)
    for (let offsetX = 0; offsetX <= size; offsetX++) {
      for (let offsetZ = 0; offsetZ <= size - 1; offsetZ++) {
        if (getColumn(columnList, x + offsetX, z + offsetZ).kind === 'hidden')
          continue
        const height = offsetX === 0 && offsetZ === 0 ? size : 1
        for (let level = 0; level < height; level++) {
          setBlock(state, x + offsetX, groundY + level, z + offsetZ, random() < 0.55 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE)
        }
      }
    }
    placedCount++
  }
}

/**
 * 石燈籠
 *
 * 遣水的一盞在橡樹旁。這裡一盞在回程門南側四格，一盞在木橋北頭，一盞在瀑布潭邊
 */
function placeLanternList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const bridgeNorthZ = Math.round(measureStreamZ(BRIDGE_X)) - Math.ceil(measureStreamHalfWidth(BRIDGE_X)) - 4
  const pointList = [
    { x: RIVER_PORTAL_POINT.x - 1, z: RIVER_PORTAL_POINT.z + 4 },
    { x: BRIDGE_X - 2, z: bridgeNorthZ },
    { x: VALLEY_HEAD_X + PLUNGE_POOL.offsetX + 2, z: WATERFALL_POINT.z - PLUNGE_POOL.radius - 3 },
  ]
  for (const point of pointList) {
    if (!isOpenGrass(state, columnList, point.x, point.z))
      continue
    placeStoneLantern(state, point.x, getColumn(columnList, point.x, point.z).topY + 1, point.z)
  }
}

/**
 * 花草
 *
 * 照遣水的配方：四成蕨、近三成高草、一成多紙莎草、一成捲葉草、零星的堇。
 * 紙莎草多半長在水邊，離水遠的草地上換成蕨
 */
function scatterPlantList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('river-plant')

  for (let x = VALLEY_HEAD_X - 2; x <= VALLEY_END_X + 2; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (!isOpenGrass(state, columnList, x, z))
        continue
      if (random() > 0.24)
        continue

      const column = getColumn(columnList, x, z)
      const isWaterside = Math.abs(z - measureStreamZ(x)) < measureStreamHalfWidth(x) + 4
      const roll = random()
      let blockId: BlockId = BlockId.FLOWER_VIOLA
      if (roll < 0.4)
        blockId = BlockId.FERN
      else if (roll < 0.68)
        blockId = BlockId.TALL_GRASS
      else if (roll < 0.84)
        blockId = isWaterside ? BlockId.PAPYRUS : BlockId.FERN
      else if (roll < 0.94)
        blockId = BlockId.CURLY_PLANT
      plantWithStack(state, x, column.topY + 1, z, blockId, random)
    }
  }
}

/** 睡蓮：只在兩個靜水潭與瀑布潭的邊上，成叢 */
function scatterLilyPadList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('river-lily')
  const centerList = [
    ...CALM_POOL_LIST.map((pool) => ({ x: pool.x, radius: pool.radius + 2 })),
  ]

  for (const center of centerList) {
    const streamZ = measureStreamZ(center.x)
    for (let x = Math.floor(center.x - center.radius); x <= Math.ceil(center.x + center.radius); x++) {
      for (let z = Math.floor(streamZ - 6); z <= Math.ceil(streamZ + 6); z++) {
        const column = getColumn(columnList, x, z)
        if (column.kind !== 'floor' || !isWaterSurface(state, x, column.floorY, z))
          continue
        const clump = fbm2D(x * 0.2 + 41, z * 0.2 - 13, 2, 0.5)
        if (clump > 0 && random() < 0.45) {
          setDecoration(state, x, column.floorY + 1, z, BlockId.LILY_PAD)
        }
      }
    }
  }
}

/** 生成整道溪谷 */
export function generateRiverWorld(state: Uint8Array): void {
  const columnList = createColumnMap()
  placeColumnList(state, columnList)
  carveStream(state, columnList)
  buildWaterfall(state, columnList)
  carveGorgeSlot(state)
  buildBridge(state, columnList)
  placeSteppingStoneList(state, columnList)
  placeDeerScarer(state, columnList)
  placeBoulderList(state, columnList)
  placeOakList(state, columnList)
  placeLanternList(state, columnList)
  scatterPlantList(state, columnList)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of RIVER_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  scatterLilyPadList(state, columnList)
}
