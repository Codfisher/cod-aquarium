import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  getNoisyDistance,
  placeBonsaiPine,
  placeStoneLantern,
  setDecoration,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import {
  ALPINE_CENTER,
  ALPINE_POND_LIST,
  ALPINE_PORTAL_POINT,
  ALPINE_SLOW_RADIUS,
  CLOUD_SEA_Y,
  CREST_Y,
  measureCliffOvershoot,
  measureRidgeCoordinate,
  PEAK_START_ALONG,
  PEAK_TOP_Y,
  PORTAL_TERRACE,
  PORTAL_TERRACE_Y,
  SNOWFIELD_Y,
  toRidgeWorldPoint,
} from './alpine-layout'
import { ALPINE_REALM } from './alpine-realm'

/**
 * 雪稜的地形
 *
 * 只有地形 worker 用。整座山照雪稜丘（buildAlpineGarden）放大：
 * 雪稜丘是一道從西北往東南隆起的岩稜，兩側陡落，高處積雪、低處露岩，
 * 雪線底下撒一層薄雪；山腳一窪凍住的融雪池（外圈壓實的冰、中間半透明的冰），
 * 三株被風壓歪的矮松，雪上零星的石生植物與枯灌叢，兩盞石燈籠。
 * 這裡把那道岩稜放大成走得上去的山稜，其餘一樣一樣照搬，只是多擺幾份；
 * 雪稜丘沒有的東西（大樹、小屋、路）一樣都不加。
 *
 * 先算整張高度圖再放方塊：哪裡露岩、哪裡補半格雪，都要看四周的高低差
 */

/** 每一格柱的地形資訊，先算好再放方塊 */
interface ColumnInfo {
  /** 頂面那一格的高度；崖外（雲海上）是 -1 */
  topY: number;
  /** 稜頂那一道岩脊：頂面是岩，不是雪 */
  isRib: boolean;
  /** 融雪池：頂面是冰 */
  pond: 'none' | 'ice' | 'packed-ice';
  /** 雪台與門前：不補半格雪、不撒花草 */
  isTerrace: boolean;
  /** 四捨五入之前的連續頂面高度（格柱座標，與 topY 同一把尺），積雪的坡拿它補出小於一格的高度 */
  rawY: number;
  /**
   * 頂面還是自然地形算出來的原樣：可以用薄雪把整數的階補成緩坡
   *
   * 雪台、門外的雪坡、融雪池與池岸都被另外整平過，topY 已經不是 rawY 四捨五入的結果，
   * 這些地方的高度是刻意訂的，不再補
   */
  isSmoothable: boolean;
}

/** 門外往下的雪坡有多長（格），見 createColumnMap */
const PORTAL_APRON_LENGTH = 14

/** 落差大於等於這個數的那一側是岩壁，頂面露岩不積雪 */
const ROCK_DROP = 2

/**
 * 兩座岩峰的峰頂在稜線上離中心幾格
 *
 * 峰的外側照 SUMMIT_SLOPE 落回雪原，落到底時（離中心約五十七格）還在崖邊之內，
 * 不會從峰上一路滑出崖外
 */
const SUMMIT_ALONG = 46
/** 岩峰每往外一格矮幾格：兩格一階，跳不上去 */
const SUMMIT_SLOPE = 2

/** 融雪池，見 alpine-layout 的 ALPINE_POND_LIST */
const POND_POINT_LIST = ALPINE_POND_LIST

/**
 * 稜頂的岩脊
 *
 * 雪稜丘的岩稜頂上是雪、山腰露岩；放大之後稜頂若整條都是一道岩牆，
 * 人就只能在兩側的雪坡上走，走不到稜上。所以岩脊斷斷續續：
 * 一段一段冒出一兩格的岩，中間是積雪的鞍部，從鞍部走得上稜、也翻得過去
 */
function measureRibHeight(x: number, z: number, along: number, across: number): number {
  if (Math.abs(along) > PEAK_START_ALONG)
    return 0
  const ribWidth = 1.4 + fbm2D(along * 0.2 + 9, 2.1, 2, 0.5) * 0.9
  if (Math.abs(across) > ribWidth)
    return 0
  if (fbm2D(along * 0.075 + 2.3, 1.3, 2, 0.5) < -0.12)
    return 0
  return 1 + Math.round((fbm2D(x * 0.4, z * 0.4, 2, 0.5) + 0.55) * 1.6)
}

/**
 * 某一格柱原本的頂面高度（還沒整平雪台、還沒挖池）
 *
 * 稜線的高度沿路起伏，兩側照一定的坡度往外落，落到雪原那一層就攤平；
 * 稜線走到兩頭拔成岩峰，坡度陡到一步一格半以上，爬不上去。
 * 雪原外圈零星幾塊冒出雪面的岩，崖邊才不是一條光滑的弧
 */
function measureNaturalTopY(x: number, z: number): { topY: number; rawY: number; isRib: boolean } {
  const { along, across } = measureRidgeCoordinate(x, z)

  const crestY = CREST_Y + fbm2D(along * 0.035 + 5, 3.7, 2, 0.5) * 2.5
  const slopeRatio = 0.27 + fbm2D(x * 0.05, z * 0.05, 2, 0.5) * 0.05
  const flankY = crestY - Math.abs(across) * slopeRatio
  const fieldY = SNOWFIELD_Y + fbm2D(x * 0.07 + 3, z * 0.07 - 9, 2, 0.5) * 1.6
  let topY = Math.max(flankY, fieldY)

  /**
   * 兩頭的岩峰
   *
   * 稜線過了 PEAK_START_ALONG 先往上爬一段（一步一格，跳得上去），
   * 盡頭是一座尖的岩峰，每往峰頂一格高兩格，一階就是兩格，跳不上去。
   * 只用一路往上的斜坡的話，坡頂會頂到世界頂、削成一大片平台
   */
  const peakAlong = Math.abs(along) - PEAK_START_ALONG
  if (peakAlong > 0) {
    const spread = Math.max(0, 1 - Math.abs(across) / 30)
    /** 爬到峰腳為止；過了峰頂往外照峰的坡度落回去，不再往上爬 */
    const beyondSummit = Math.max(0, Math.abs(along) - SUMMIT_ALONG)
    topY += Math.max(0, Math.min(peakAlong, SUMMIT_ALONG - PEAK_START_ALONG) - beyondSummit * SUMMIT_SLOPE) * spread
  }
  const summitDistance = Math.hypot(Math.abs(along) - SUMMIT_ALONG, across)
  const summitY = PEAK_TOP_Y - summitDistance * SUMMIT_SLOPE + fbm2D(x * 0.18 + 4, z * 0.18, 2, 0.5) * 3
  topY = Math.max(topY, summitY)

  /**
   * 雪原外圈冒出雪面的岩：只在崖邊那一圈，推回線以內的雪原保持平整
   *
   * 低頻、矮而寬的一塊一塊，像是被風吹掉雪露出來的岩盤；
   * 頻率高、拔得高的話會變成一根一根方煙囪
   */
  const overshoot = measureCliffOvershoot(x, z)
  if (overshoot > -9) {
    const knob = fbm2D(x * 0.065 - 13, z * 0.065 + 6, 2, 0.5)
    if (knob > 0.22) {
      topY += Math.min(4, (knob - 0.22) * 16)
    }
  }

  const ribHeight = measureRibHeight(x, z, along, across)
  const rawY = Math.min(PEAK_TOP_Y, topY + ribHeight)
  topY = Math.round(topY) + ribHeight

  return { topY: Math.min(PEAK_TOP_Y, topY), rawY, isRib: ribHeight > 0 }
}

/**
 * 雪台佔多少（零到一）
 *
 * 門那一排往東（往山裡）PORTAL_TERRACE.inlandDepth 排、左右各 halfWidth 格整平，
 * 再往外 blend 格與原本的坡混著接起來。門那一排往西是雪台的邊，比雪台矮一格
 */
function measureTerraceWeight(x: number, z: number): number {
  const along = Math.abs(z - ALPINE_PORTAL_POINT.z) - PORTAL_TERRACE.halfWidth
  const inland = x - ALPINE_PORTAL_POINT.x
  const across = inland >= 0 ? inland - PORTAL_TERRACE.inlandDepth : -inland
  const overshoot = Math.max(along, across, 0)
  return Math.max(0, 1 - overshoot / PORTAL_TERRACE.blend)
}

/** 某一格是不是融雪池，見 POND_LIST */
function measurePond(x: number, z: number): ColumnInfo['pond'] {
  for (const pond of POND_POINT_LIST) {
    const distance = getNoisyDistance(x, z, pond.x, pond.z, 0.3, 1.2)
    if (distance <= pond.radius * 0.6)
      return 'ice'
    if (distance <= pond.radius)
      return 'packed-ice'
  }
  return 'none'
}

/** 整張高度圖 */
function createColumnMap(): ColumnInfo[] {
  const columnList: ColumnInfo[] = []

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureCliffOvershoot(x, z) > 0) {
        columnList.push({ topY: -1, isRib: false, pond: 'none', isTerrace: false, rawY: -1, isSmoothable: false })
        continue
      }

      const natural = measureNaturalTopY(x, z)
      let topY = natural.topY
      let isRib = natural.isRib

      const terraceWeight = measureTerraceWeight(x, z)
      const isTerrace = terraceWeight > 0
      if (isTerrace) {
        topY = Math.round(topY + (PORTAL_TERRACE_Y - topY) * terraceWeight)
        isRib = false
      }
      /**
       * 門外（西邊）一路往下的雪坡
       *
       * 雪台的邊比雪台矮一格，再往西每三格矮一格，落到雪原。
       * 只往下削、不往上填：這一帶的坡吃噪音，門外偶爾隆起一塊比雪台還高，
       * 不削的話門洞望出去是一堵岩，看不到雲海
       */
      const westDistance = ALPINE_PORTAL_POINT.x - x
      let isTerraceEdge = false
      if (westDistance > 0 && westDistance <= PORTAL_APRON_LENGTH) {
        const beside = Math.abs(z - ALPINE_PORTAL_POINT.z) - PORTAL_TERRACE.halfWidth
        const sideWeight = Math.max(0, Math.min(1, 1 - beside / PORTAL_TERRACE.blend))
        const endWeight = Math.max(0, Math.min(1, (PORTAL_APRON_LENGTH - westDistance) / PORTAL_TERRACE.blend))
        const apronY = PORTAL_TERRACE_Y - 1 - Math.floor((westDistance - 1) / 3)
        if (apronY < topY) {
          topY = Math.round(topY + (apronY - topY) * sideWeight * endWeight)
          isRib = false
        }
        isTerraceEdge = westDistance <= 2 && beside <= 0
      }

      const pond = measurePond(x, z)
      columnList.push({
        topY,
        isRib,
        pond,
        isTerrace: isTerrace || isTerraceEdge,
        rawY: natural.rawY,
        isSmoothable: topY === natural.topY && !isRib && !isTerrace && !isTerraceEdge && pond === 'none',
      })
    }
  }

  /** 融雪池整平成同一個高度：池裡最低的那一格，池水才不會一階一階 */
  for (const pond of POND_POINT_LIST) {
    const reach = Math.ceil(pond.radius + 3)
    let pondY = Number.POSITIVE_INFINITY
    for (let x = pond.x - reach; x <= pond.x + reach; x++) {
      for (let z = pond.z - reach; z <= pond.z + reach; z++) {
        const column = columnList[x * WORLD_SIZE + z]!
        if (column.pond !== 'none') {
          pondY = Math.min(pondY, column.topY)
        }
      }
    }
    for (let x = pond.x - reach; x <= pond.x + reach; x++) {
      for (let z = pond.z - reach; z <= pond.z + reach; z++) {
        const column = columnList[x * WORLD_SIZE + z]!
        if (column.pond !== 'none') {
          column.topY = pondY
          column.isRib = false
          column.isSmoothable = false
          continue
        }
        /** 池岸一圈收到比池面高最多一格，冰才像是積在窪地裡，不是嵌在坡上 */
        if (getNoisyDistance(x, z, pond.x, pond.z, 0.3, 1.2) <= pond.radius + 2) {
          column.topY = Math.min(column.topY, pondY + 1)
          column.isSmoothable = false
        }
      }
    }
  }

  return columnList
}

/** 四方相鄰格柱的頂面裡，比自己低最多幾格 */
function measureDrop(columnList: ColumnInfo[], x: number, z: number, topY: number): number {
  let drop = 0
  for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const neighbourX = x + offsetX
    const neighbourZ = z + offsetZ
    if (neighbourX < 0 || neighbourX >= WORLD_SIZE || neighbourZ < 0 || neighbourZ >= WORLD_SIZE)
      continue
    const neighbourTopY = columnList[neighbourX * WORLD_SIZE + neighbourZ]!.topY
    drop = Math.max(drop, topY - Math.max(neighbourTopY, CLOUD_SEA_Y - 1))
  }
  return drop
}

/** 頂面那一格放什麼：岩脊與陡處露岩，其餘積雪；池子是冰 */
function pickTopBlock(column: ColumnInfo, drop: number, x: number, z: number): BlockId {
  if (column.pond === 'ice')
    return BlockId.ICE
  if (column.pond === 'packed-ice')
    return BlockId.PACKED_ICE
  if (column.isRib || drop >= ROCK_DROP) {
    return fbm2D(x * 0.5 + 7, z * 0.5, 2, 0.5) > 0 ? BlockId.COBBLESTONE : BlockId.STONE
  }
  return BlockId.SNOW_BLOCK
}

/**
 * 放方塊
 *
 * 雲面以下那一層全是不畫的 LAKE_BED：崖外是一片接住萬一掉下去的人的地，
 * 崖內是山腳，與上面的岩相接、不露出切口；再往下什麼都不放，沒有人看得到
 */
function placeColumnList(state: Uint8Array, columnList: ColumnInfo[]): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      setBlock(state, x, CLOUD_SEA_Y - 1, z, BlockId.LAKE_BED)

      const column = columnList[x * WORLD_SIZE + z]!
      if (column.topY < 0)
        continue

      for (let y = CLOUD_SEA_Y; y < column.topY; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      const drop = measureDrop(columnList, x, z, column.topY)
      setBlock(state, x, column.topY, z, pickTopBlock(column, drop, x, z))
    }
  }
}

/**
 * 雪面的高度記成「八分之一格」的整數
 *
 * 第 F 層雪塊的頂面是 F + 0.5 格，所以頂面的八分數是 8F + 4；
 * 雪塊上再疊 rem 個八分之一格的薄雪，就是 8F + 4 + rem。
 * 薄雪只有 1（SNOW_LAYER）、2（SNOW_LAYER_QUARTER）、4（SNOW_SLAB）三種，
 * 8 就是下一整層雪塊，所以每一層雪塊上能疊出的高度是 0、1、2、4 個八分之一
 */
const SNOW_BASE_EIGHTH = 4
/** 每層雪塊上疊得出來的薄雪厚度（八分數） */
const SNOW_REM_LIST = [0, 1, 2, 4] as const
/** 薄雪厚度對應的方塊 */
const SNOW_LAYER_BLOCK_MAP: Record<number, BlockId> = {
  1: BlockId.SNOW_LAYER,
  2: BlockId.SNOW_LAYER_QUARTER,
  4: BlockId.SNOW_SLAB,
}
/** 相鄰兩格的雪面最多差幾個八分之一：半格，走得上去不必跳（自動跨階的高度是 0.55 格） */
const SNOW_STEP_EIGHTH_MAX = 4
/** 連續高度差超過這麼多（一格半）的是雪崖，補不平也不該補，不限制落差 */
const SNOW_CLIFF_EIGHTH = 12
/** 每超出容許的落差一個八分之一要扣多少分，比「離連續高度遠一個八分之一」重得多 */
const SNOW_GAP_PENALTY = 20
/** 在連續高度附近找候選高度的範圍（八分數） */
const SNOW_CANDIDATE_RANGE_EIGHTH = 10
/** 雪面最多比連續高度高幾個八分之一（八分數） */
const SNOW_OVERSHOOT_EIGHTH = 3
/** 最多往上墊幾層整格雪塊（為了讓坡接得上，不是為了把山堆高） */
const SNOW_RAISE_BLOCK_MAX = 1

/** 這一格柱的頂面是不是裸岩（不含冰、雪） */
function isRockColumn(state: Uint8Array, columnList: ColumnInfo[], x: number, z: number): boolean {
  if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE)
    return false
  const column = columnList[x * WORLD_SIZE + z]!
  if (column.topY < 0)
    return false
  const blockId = getBlock(state, x, column.topY, z)
  return blockId === BlockId.COBBLESTONE || blockId === BlockId.STONE
}

/**
 * 附近有比自己高的岩，雪至少該積到多高
 *
 * 風把雪吹到岩的背風面堆起來：緊貼岩的一圈（含斜角）積四分之一格，
 * 再外面一圈積八分之一格，雪與岩之間才是一段緩緩收上去的雪堆，不是一刀切的岩壁。
 * 用噪音把外圈挖出缺口，不要變成一圈整齊的環
 */
function measureDriftHeight(state: Uint8Array, columnList: ColumnInfo[], x: number, z: number, topY: number): number {
  let height = 0
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      const distance = Math.max(Math.abs(offsetX), Math.abs(offsetZ))
      if (distance === 0)
        continue
      const neighbourX = x + offsetX
      const neighbourZ = z + offsetZ
      if (!isRockColumn(state, columnList, neighbourX, neighbourZ))
        continue
      if (columnList[neighbourX * WORLD_SIZE + neighbourZ]!.topY <= topY)
        continue
      if (distance === 1) {
        return 0.25
      }
      if (fbm2D(x * 0.45 + 3, z * 0.45 - 5, 2, 0.5) > -0.1) {
        height = 0.125
      }
    }
  }
  return height
}

/**
 * 一格柱的雪面可以選的高度（八分數，由低到高）
 *
 * 範圍：連續高度附近，而且不低於「頂上那塊換成半格」（只在四周都是雪時）、
 * 不高於整層雪塊再墊一格；碰到岩壁的那幾格另外要求至少積到 minEighth
 */
function listSnowCandidate(rawEighth: number, topY: number, canLower: boolean, minEighth: number): number[] {
  const blockSurface = topY * 8 + SNOW_BASE_EIGHTH
  const lowest = Math.max(canLower ? blockSurface - 4 : blockSurface, minEighth)
  /** 高過連續高度太多的雪面不選：為了補平一道缺口把雪堆得比山還高，另一邊的階反而更陡 */
  const highest = Math.max(lowest, Math.min(blockSurface + SNOW_RAISE_BLOCK_MAX * 8, Math.floor(rawEighth) + SNOW_OVERSHOOT_EIGHTH))
  const candidateList: number[] = []
  const startLayer = Math.floor((rawEighth - SNOW_CANDIDATE_RANGE_EIGHTH - SNOW_BASE_EIGHTH) / 8)
  for (let layerY = startLayer; layerY * 8 + SNOW_BASE_EIGHTH <= rawEighth + SNOW_CANDIDATE_RANGE_EIGHTH; layerY++) {
    for (const rem of SNOW_REM_LIST) {
      const surface = layerY * 8 + SNOW_BASE_EIGHTH + rem
      if (surface >= lowest && surface <= highest && Math.abs(surface - rawEighth) <= SNOW_CANDIDATE_RANGE_EIGHTH) {
        candidateList.push(surface)
      }
    }
  }
  /** 範圍太窄選不出東西時（連續高度離整格的雪塊很遠），至少留原本的雪塊 */
  return candidateList.length > 0 ? candidateList : [Math.min(Math.max(blockSurface, lowest), highest)]
}

/**
 * 雪坡的雪面補成斜面
 *
 * 地形先照整數的高度放好（每一階一整格），這裡再回頭看每一格柱「連續的高度」，
 * 用八分之一、四分之一、半格的薄雪（與墊一層雪塊、或把頂上那塊換成半格）湊出最接近的雪面，
 * 一格的階拆成好幾個小階，遠看是一道斜面。
 *
 * 薄雪只有幾種高度，各格各選最接近的話，相鄰兩格偶爾差到四分之三格。所以不是各選各的：
 * 每一格在候選高度裡挑「離連續高度近、而且與四周鄰居的落差不超過半格」的那個，
 * 反覆掃幾輪到不再變動為止。連續高度本身就差過一格半的是雪崖，不限制落差，
 * 不會為了拉平而把崖墊成坡。
 *
 * - 降成半格只在四周都是雪時才做：旁邊是岩或冰就維持雪塊，保留原本的稜角
 * - 岩、冰、雪台、門外的坡與池岸不補：它們的高度是刻意訂的，視為固定的鄰居
 */
function smoothSnowSurface(state: Uint8Array, columnList: ColumnInfo[]): void {
  const columnCount = WORLD_SIZE * WORLD_SIZE
  /** 目前選的雪面（八分數），不是雪地是 -1 */
  const surfaceList = new Int16Array(columnCount).fill(-1)
  /** 連續高度（八分數），算落差容許多少用 */
  const rawEighthList = new Float32Array(columnCount)
  const candidateMap = new Map<number, number[]>()
  const directionList = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const index = x * WORLD_SIZE + z
      const column = columnList[index]!
      if (column.topY <= CLOUD_SEA_Y || getBlock(state, x, column.topY, z) !== BlockId.SNOW_BLOCK)
        continue

      const blockSurface = column.topY * 8 + SNOW_BASE_EIGHTH
      surfaceList[index] = blockSurface
      rawEighthList[index] = blockSurface
      if (!column.isSmoothable || getBlock(state, x, column.topY + 1, z) !== BlockId.AIR)
        continue

      /** 貼著岩的雪堆是「目標」不是下限：硬性規定的話，旁邊的雪補不上去，落差反而變大 */
      const driftEighth = Math.round(measureDriftHeight(state, columnList, x, z, column.topY) * 8)
      const rawEighth = Math.max(column.rawY * 8 + SNOW_BASE_EIGHTH, blockSurface + driftEighth)
      rawEighthList[index] = rawEighth
      const canLower = directionList.every(([offsetX, offsetZ]) => {
        const neighbour = columnList[(x + offsetX) * WORLD_SIZE + z + offsetZ]!
        return neighbour.topY < 0 || getBlock(state, x + offsetX, neighbour.topY, z + offsetZ) === BlockId.SNOW_BLOCK
      })
      let minEighth = blockSurface
      /** 旁邊有一塊雪剛好高一整格：至少補半格，一格的階拆成兩個半階（連續高度再怎麼說也不能比這差） */
      const hasHigherSnow = directionList.some(([offsetX, offsetZ]) => {
        const neighbour = columnList[(x + offsetX) * WORLD_SIZE + z + offsetZ]!
        return neighbour.topY === column.topY + 1
          && getBlock(state, x + offsetX, neighbour.topY, z + offsetZ) === BlockId.SNOW_BLOCK
      })
      if (hasHigherSnow) {
        minEighth = Math.max(minEighth, blockSurface + 4)
      }
      const candidateList = listSnowCandidate(rawEighth, column.topY, canLower, minEighth)
      candidateMap.set(index, candidateList)
      surfaceList[index] = candidateList.reduce((best, candidate) =>
        Math.abs(candidate - rawEighth) < Math.abs(best - rawEighth) ? candidate : best)
    }
  }

  /** 一格柱選這個高度的代價：離連續高度多遠，加上與鄰居的落差超出容許多少 */
  const measureCost = (index: number, surface: number): number => {
    let cost = Math.abs(surface - rawEighthList[index]!)
    for (const offset of [WORLD_SIZE, -WORLD_SIZE, 1, -1]) {
      const neighbourSurface = surfaceList[index + offset]!
      if (neighbourSurface < 0)
        continue
      const rawGap = Math.abs(rawEighthList[index]! - rawEighthList[index + offset]!)
      if (rawGap > SNOW_CLIFF_EIGHTH)
        continue
      cost += SNOW_GAP_PENALTY * Math.max(0, Math.abs(surface - neighbourSurface) - SNOW_STEP_EIGHTH_MAX)
    }
    return cost
  }

  for (let pass = 0; pass < 30; pass++) {
    let isChanged = false
    for (const [index, candidateList] of candidateMap) {
      let best = surfaceList[index]!
      let bestCost = measureCost(index, best)
      for (const candidate of candidateList) {
        const cost = measureCost(index, candidate)
        if (cost < bestCost) {
          best = candidate
          bestCost = cost
        }
      }
      if (best !== surfaceList[index]) {
        surfaceList[index] = best
        isChanged = true
      }
    }
    if (!isChanged)
      break
  }

  /** 照最後的雪面放方塊：先補整層的雪塊（或把頂上那塊換成半格），再疊薄雪 */
  for (const index of candidateMap.keys()) {
    const column = columnList[index]!
    const x = Math.floor(index / WORLD_SIZE)
    const z = index % WORLD_SIZE
    const surface = surfaceList[index]!
    const layerY = Math.floor((surface - SNOW_BASE_EIGHTH) / 8)
    const rem = surface - SNOW_BASE_EIGHTH - layerY * 8

    if (layerY < column.topY) {
      /** 降成半格：下面那一層墊雪塊，頂上換成半格 */
      setBlock(state, x, layerY, z, BlockId.SNOW_BLOCK)
      setBlock(state, x, column.topY, z, BlockId.SNOW_SLAB)
      continue
    }
    for (let y = column.topY + 1; y <= layerY; y++) {
      setBlock(state, x, y, z, BlockId.SNOW_BLOCK)
    }
    const layerBlock = SNOW_LAYER_BLOCK_MAP[rem]
    if (layerBlock !== undefined) {
      setBlock(state, x, layerY + 1, z, layerBlock)
    }
  }
}

/**
 * 岩上的薄雪
 *
 * 雪稜丘在雪線底下兩格撒一層薄雪，岩的顏色從邊緣透出來，雪線才是一段而不是一條。
 * 這裡的岩脊與陡坡也一樣：用噪音決定哪一格有，岩與雪之間就化開了
 */
function dustRockWithSnow(state: Uint8Array, columnList: ColumnInfo[]): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const column = columnList[x * WORLD_SIZE + z]!
      if (column.topY < 0)
        continue
      const topBlock = getBlock(state, x, column.topY, z)
      if (topBlock !== BlockId.COBBLESTONE && topBlock !== BlockId.STONE)
        continue
      if (fbm2D(x * 0.55, z * 0.55, 2, 0.5) > 0.12) {
        setDecoration(state, x, column.topY + 1, z, BlockId.SNOW_LAYER)
      }
    }
  }
}

/** 這一格柱是不是一片平的雪地：自己是雪、四周落差不超過一格 */
function isFlatSnow(state: Uint8Array, columnList: ColumnInfo[], x: number, z: number): boolean {
  const column = columnList[x * WORLD_SIZE + z]!
  if (column.topY < 0 || column.isTerrace || column.pond !== 'none')
    return false
  if (getBlock(state, x, column.topY, z) !== BlockId.SNOW_BLOCK)
    return false
  return measureDrop(columnList, x, z, column.topY) <= 1
}

/**
 * 被風壓歪的矮松
 *
 * 雪稜丘的三株貼著岩長、歪向同一邊。這裡多擺幾株，散在雪坡與雪原上，
 * 一律往東歪：風從西邊的雲海吹上來，樹冠是被它推過去的
 */
function placePineList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('alpine-pine')
  let placedCount = 0

  for (let attempt = 0; attempt < 400 && placedCount < 11; attempt++) {
    const angle = random() * Math.PI * 2
    const distance = 14 + random() * (ALPINE_SLOW_RADIUS - 18)
    const x = Math.round(ALPINE_CENTER.x + Math.cos(angle) * distance)
    const z = Math.round(ALPINE_CENTER.z + Math.sin(angle) * distance)

    if (Math.hypot(x - ALPINE_PORTAL_POINT.x, z - ALPINE_PORTAL_POINT.z) < 9)
      continue
    if (POND_POINT_LIST.some((pond) => Math.hypot(x - pond.x, z - pond.z) < pond.radius + 3))
      continue
    /** 樹冠往東伸兩格，那幾格也要是平的雪地 */
    if (!isFlatSnow(state, columnList, x, z) || !isFlatSnow(state, columnList, x + 2, z))
      continue

    const groundY = columnList[x * WORLD_SIZE + z]!.topY + 1
    if (getBlock(state, x, groundY, z) !== BlockId.AIR)
      continue

    placeBonsaiPine(state, x, groundY, z, 1, 0)
    placedCount++
  }
}

/**
 * 雪上的石生植物與枯灌叢
 *
 * 雪稜丘撒的密度是八分；這裡的雪地大了好幾十倍，照那個密度撒會變成一片草原，
 * 收到三分半，而且只撒在平的雪地上
 */
function scatterPlantList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const random = createSeededRandom('alpine-plant')

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      if (random() > 0.035)
        continue
      if (!isFlatSnow(state, columnList, x, z))
        continue

      const groundY = columnList[x * WORLD_SIZE + z]!.topY + 1
      setDecoration(state, x, groundY, z, random() < 0.6 ? BlockId.STONE_PLANT : BlockId.DRY_SHRUB)
    }
  }
}

/**
 * 石燈籠
 *
 * 雪稜丘的兩盞在木座的角上。這裡一盞在回程門南側四格（夜裡從山上望回來，門就在燈旁邊），
 * 一盞在稜線中段的鞍部，一盞在西南那窪融雪池邊
 */
function placeLanternList(state: Uint8Array, columnList: ColumnInfo[]): void {
  const westPond = POND_POINT_LIST[0]!
  const pointList = [
    { x: ALPINE_PORTAL_POINT.x + 1, z: ALPINE_PORTAL_POINT.z + 4 },
    { ...findSaddle(columnList) },
    { x: westPond.x + Math.ceil(westPond.radius) + 2, z: westPond.z - 2 },
  ]

  for (const point of pointList) {
    const column = columnList[point.x * WORLD_SIZE + point.z]!
    if (column.topY < 0 || column.pond !== 'none')
      continue
    const groundY = clearSnowLayer(state, point.x, column.topY, point.z) + 1
    placeStoneLantern(state, point.x, groundY, point.z)
  }
}

/**
 * 把這一格柱的薄雪清成一整格的雪面，回傳頂上那塊雪塊的 y
 *
 * 石燈籠要穩穩踩在整格的雪上：被降成半格的頂面換回雪塊、墊高的整層雪塊算進去，
 * 頂上的薄雪（八分之一、四分之一、半格）清掉
 */
function clearSnowLayer(state: Uint8Array, x: number, topY: number, z: number): number {
  if (getBlock(state, x, topY, z) === BlockId.SNOW_SLAB) {
    setBlock(state, x, topY, z, BlockId.SNOW_BLOCK)
  }
  let surfaceY = topY
  while (getBlock(state, x, surfaceY + 1, z) === BlockId.SNOW_BLOCK) {
    surfaceY++
  }
  const aboveId = getBlock(state, x, surfaceY + 1, z)
  if (aboveId === BlockId.SNOW_SLAB || aboveId === BlockId.SNOW_LAYER_QUARTER || aboveId === BlockId.SNOW_LAYER) {
    setBlock(state, x, surfaceY + 1, z, BlockId.AIR)
  }
  return surfaceY
}

/** 稜線中段最低的那個鞍部（岩脊斷開、積雪的地方），燈籠擺在它旁邊一格 */
function findSaddle(columnList: ColumnInfo[]): { x: number; z: number } {
  let best = { x: ALPINE_CENTER.x, z: ALPINE_CENTER.z }
  let bestY = Number.POSITIVE_INFINITY

  for (let along = -14; along <= 14; along++) {
    const point = toRidgeWorldPoint(along, 0)
    /** 稜線被噪音推移過，沿橫向找真正的稜頂 */
    let crest = point
    let crestY = -1
    for (let across = -10; across <= 10; across++) {
      const candidate = toRidgeWorldPoint(along, across)
      const column = columnList[candidate.x * WORLD_SIZE + candidate.z]!
      if (column.topY > crestY) {
        crestY = column.topY
        crest = candidate
      }
    }
    const crestColumn = columnList[crest.x * WORLD_SIZE + crest.z]!
    if (!crestColumn.isRib && crestY < bestY) {
      bestY = crestY
      best = { x: crest.x + 1, z: crest.z }
    }
  }
  return best
}

/** 生成整座雪稜 */
export function generateAlpineWorld(state: Uint8Array): void {
  const columnList = createColumnMap()
  placeColumnList(state, columnList)
  /** 薄雪排在樹與花草之前：補了薄雪的格柱，樹與花草自己會跳過（頂上不是空氣），才不會浮在薄雪上 */
  smoothSnowSurface(state, columnList)
  dustRockWithSnow(state, columnList)
  placePineList(state, columnList)
  scatterPlantList(state, columnList)
  placeLanternList(state, columnList)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of ALPINE_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
