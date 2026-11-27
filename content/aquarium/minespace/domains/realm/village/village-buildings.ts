import { BlockId } from '../../block/block-constants'
import { carveWater, fillBox, pickOne, placeStoneLantern, placeTorii, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'

/**
 * 村落的建築工具（只有地形 worker 用）
 *
 * 市井坊只有三間同一個模子的小屋（placeHut）。整座村子都用那一個模子，
 * 一條街看過去就是同一間屋子排十次。這裡把屋子拆成幾個可以各自挑的部分：
 * 面寬進深、一到三層、牆（木板、深色木、白壁配木骨、石砌腳）、窗（玻璃或障子）、
 * 屋頂（四坡、沿 X 或沿 Z 的兩坡）、出簷、門開在哪一面、門廊、二樓的露台、煙囪、
 * 側邊的小棚與屋後的小院，每一塊地各自挑，隔壁兩間不會長得一樣。
 * 另外幾座有自己輪廓的建築（旅籠、神社、水車小屋、鍛冶屋、高倉、市場棚、望樓、湯屋、
 * 陶房、街口的屋根門）各寫一支。
 *
 * 材料都在市井坊與禪庭已經用過的方塊裡：木板、深色木、榻榻米、紙門、障子、玻璃窗、
 * 白砂岩（當白壁）、圓石與石磚（石砌腳）、紅磚（煙囪與窯）、籬笆、木樁、稻草、桶與箱
 */

export type Side = 'north' | 'south' | 'east' | 'west'

/** 各面往外的單位向量：北是 -Z */
const SIDE_STEP_MAP = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
} as const

/** 屋頂的一套材料：出簷那一圈的階梯（依朝外的方向）、屋面與屋脊 */
interface RoofKit {
  stairs: Record<Side, BlockId>;
  plank: BlockId;
  slab: BlockId;
}

/** 階梯的靠背朝內、薄的那一側朝外，屋簷才是往外收薄的斜面（與 placeHut 同一個收法） */
export const DARK_ROOF: RoofKit = {
  stairs: {
    north: BlockId.DARK_STAIRS_SOUTH,
    south: BlockId.DARK_STAIRS_NORTH,
    west: BlockId.DARK_STAIRS_EAST,
    east: BlockId.DARK_STAIRS_WEST,
  },
  plank: BlockId.DARK_PLANKS,
  slab: BlockId.DARK_WOOD_SLAB,
}

export const LIGHT_ROOF: RoofKit = {
  stairs: {
    north: BlockId.WOOD_STAIRS_SOUTH,
    south: BlockId.WOOD_STAIRS_NORTH,
    west: BlockId.WOOD_STAIRS_EAST,
    east: BlockId.WOOD_STAIRS_WEST,
  },
  plank: BlockId.PLANKS,
  slab: BlockId.WOOD_SLAB,
}

/** 牆的樣式 */
export type WallStyle = 'planks' | 'dark' | 'timber' | 'plaster' | 'stone'

export type RoofStyle = 'hip' | 'gableX' | 'gableZ'

export interface HouseSpec {
  /** 屋子中心（世界座標） */
  x: number;
  z: number;
  /** 地板上那一格空氣的高度，牆從這裡往上長 */
  groundY: number;
  halfWidth: number;
  halfDepth: number;
  storeyCount: number;
  wall: WallStyle;
  /** 一樓最下面一排砌石頭 */
  hasStoneBase: boolean;
  window: 'glass' | 'shoji';
  roof: RoofStyle;
  roofKit: RoofKit;
  /** 出簷幾格（0 或 1） */
  eave: number;
  doorSide: Side;
  hasPorch: boolean;
  hasBalcony: boolean;
  hasChimney: boolean;
  /** 側邊的小棚，給 null 就沒有 */
  shedSide: Side | null;
  /** 屋後一方用籬笆圍起來的小院 */
  hasYard: boolean;
}

/** 一樓幾格高、樓上每層幾格高 */
const GROUND_STOREY_HEIGHT = 4
const UPPER_STOREY_HEIGHT = 3

/** 某一層的牆，第 level 格（從地板上那一格算起）是第幾層、在那一層的第幾格 */
function measureStorey(level: number): { storey: number; inStorey: number } {
  if (level < GROUND_STOREY_HEIGHT)
    return { storey: 0, inStorey: level }
  const upper = level - GROUND_STOREY_HEIGHT
  return { storey: 1 + Math.floor(upper / UPPER_STOREY_HEIGHT), inStorey: upper % UPPER_STOREY_HEIGHT }
}

export function measureWallHeight(storeyCount: number): number {
  return GROUND_STOREY_HEIGHT + (storeyCount - 1) * UPPER_STOREY_HEIGHT
}

/**
 * 牆上這一格是什麼
 *
 * 木骨白壁：四角與每一層的樓板線是深色木，其餘是白壁；
 * 石砌：一樓整層是圓石，樓上木板；白壁：四角木板、其餘白壁
 */
function pickWallBlock(spec: HouseSpec, level: number, isCorner: boolean): BlockId {
  const { storey, inStorey } = measureStorey(level)
  if (spec.hasStoneBase && level === 0)
    return BlockId.STONE_BRICKS

  switch (spec.wall) {
    case 'planks':
      return isCorner ? BlockId.DARK_PLANKS : BlockId.PLANKS
    case 'dark':
      return isCorner ? BlockId.PLANKS : BlockId.DARK_PLANKS
    case 'timber':
      return isCorner || (storey > 0 && inStorey === 0) ? BlockId.DARK_PLANKS : BlockId.WHITE_SANDSTONE
    case 'plaster':
      return isCorner ? BlockId.PLANKS : BlockId.WHITE_SANDSTONE
    case 'stone':
      return storey === 0 ? BlockId.COBBLESTONE : (isCorner ? BlockId.DARK_PLANKS : BlockId.PLANKS)
  }
}

/** 這一面朝哪 */
function getFaceSide(offsetX: number, offsetZ: number, spec: HouseSpec): Side {
  if (offsetZ === -spec.halfDepth)
    return 'north'
  if (offsetZ === spec.halfDepth)
    return 'south'
  return offsetX < 0 ? 'west' : 'east'
}

/** 這一格是不是門那一面正中的門洞（寬的屋子門洞三格，窄的一格） */
function isDoorCell(spec: HouseSpec, offsetX: number, offsetZ: number): boolean {
  const step = SIDE_STEP_MAP[spec.doorSide]
  const isOnDoorFace = step.x !== 0 ? offsetX === step.x * spec.halfWidth : offsetZ === step.z * spec.halfDepth
  if (!isOnDoorFace)
    return false
  const along = step.x !== 0 ? Math.abs(offsetZ) : Math.abs(offsetX)
  const halfOpening = (step.x !== 0 ? spec.halfDepth : spec.halfWidth) >= 4 ? 1 : 0
  return along <= halfOpening
}

/** 窗：每一層的第二格、隔一格開一扇 */
function isWindowCell(spec: HouseSpec, level: number, along: number): boolean {
  const { inStorey } = measureStorey(level)
  return inStorey === (level < GROUND_STOREY_HEIGHT ? 2 : 1) && Math.abs(along) % 2 === 0
}

/** 屋頂：四坡（與 placeHut 同一種一層一層往內收）或兩坡 */
function placeRoof(state: Uint8Array, spec: HouseSpec, wallTopY: number): void {
  const { x, z, halfWidth, halfDepth, eave, roofKit } = spec
  const outerWidth = halfWidth + eave
  const outerDepth = halfDepth + eave

  if (spec.roof === 'hip') {
    for (let level = 0; level <= Math.min(outerWidth, outerDepth); level++) {
      const width = outerWidth - level
      const depth = outerDepth - level
      for (let offsetX = -width; offsetX <= width; offsetX++) {
        for (let offsetZ = -depth; offsetZ <= depth; offsetZ++) {
          let blockId = roofKit.plank
          if (offsetZ === -depth)
            blockId = roofKit.stairs.north
          else if (offsetZ === depth)
            blockId = roofKit.stairs.south
          else if (offsetX === -width)
            blockId = roofKit.stairs.west
          else if (offsetX === width)
            blockId = roofKit.stairs.east
          if (width === 0 || depth === 0)
            blockId = roofKit.slab
          setBlock(state, x + offsetX, wallTopY + level, z + offsetZ, blockId)
        }
      }
    }
    return
  }

  /**
   * 兩坡：屋脊沿著 ridgeAxis，兩側一層一層往上收，兩端的山牆用牆的材料補滿那個三角形
   */
  const isRidgeAlongX = spec.roof === 'gableX'
  const slopeHalf = isRidgeAlongX ? outerDepth : outerWidth
  const ridgeHalf = isRidgeAlongX ? outerWidth : outerDepth
  for (let level = 0; level <= slopeHalf; level++) {
    const across = slopeHalf - level
    for (let along = -ridgeHalf; along <= ridgeHalf; along++) {
      for (const sign of across === 0 ? [0] : [-1, 1]) {
        const offsetAcross = sign * across
        const offsetX = isRidgeAlongX ? along : offsetAcross
        const offsetZ = isRidgeAlongX ? offsetAcross : along
        let blockId = roofKit.slab
        if (sign !== 0) {
          const side: Side = isRidgeAlongX ? (sign < 0 ? 'north' : 'south') : (sign < 0 ? 'west' : 'east')
          blockId = roofKit.stairs[side]
        }
        setBlock(state, x + offsetX, wallTopY + level, z + offsetZ, blockId)
      }
    }
    /** 山牆：兩端牆面那一格，斜面以內補牆 */
    for (const end of [-1, 1]) {
      for (let offsetAcross = -(across - 1); offsetAcross <= across - 1; offsetAcross++) {
        const offsetX = isRidgeAlongX ? end * halfWidth : offsetAcross
        const offsetZ = isRidgeAlongX ? offsetAcross : end * halfDepth
        if (Math.abs(isRidgeAlongX ? offsetZ : offsetX) > (isRidgeAlongX ? halfDepth : halfWidth))
          continue
        setBlock(state, x + offsetX, wallTopY + level, z + offsetZ, pickWallBlock(spec, measureWallHeight(spec.storeyCount) + 1, false))
      }
    }
  }
}

/**
 * 一間屋子
 *
 * 地板（深色木框、榻榻米）、牆、窗、門、屋頂，再加上挑到的門廊、露台、煙囪、小棚與小院。
 * 屋裡一盞紙燈，從門口望進去看得到有人住（與 placeHut 一樣）
 */
export function placeHouse(state: Uint8Array, spec: HouseSpec, random: () => number): void {
  const { x, z, groundY, halfWidth, halfDepth } = spec
  const wallHeight = measureWallHeight(spec.storeyCount)

  fillBox(state, x - halfWidth, groundY - 1, z - halfDepth, x + halfWidth, groundY - 1, z + halfDepth, BlockId.DARK_PLANKS)
  fillBox(state, x - halfWidth + 1, groundY - 1, z - halfDepth + 1, x + halfWidth - 1, groundY - 1, z + halfDepth - 1, random() < 0.5 ? BlockId.TATAMI : BlockId.PLANKS)
  /** 屋裡清空：蓋在花草或石板上時，裡面不能留著東西 */
  fillBox(state, x - halfWidth + 1, groundY, z - halfDepth + 1, x + halfWidth - 1, groundY + wallHeight - 1, z + halfDepth - 1, BlockId.AIR)

  for (let level = 0; level < wallHeight; level++) {
    for (let offsetX = -halfWidth; offsetX <= halfWidth; offsetX++) {
      for (let offsetZ = -halfDepth; offsetZ <= halfDepth; offsetZ++) {
        const isEdgeX = Math.abs(offsetX) === halfWidth
        const isEdgeZ = Math.abs(offsetZ) === halfDepth
        if (!isEdgeX && !isEdgeZ)
          continue

        const isCorner = isEdgeX && isEdgeZ
        if (!isCorner && level < 3 && isDoorCell(spec, offsetX, offsetZ)) {
          setBlock(state, x + offsetX, groundY + level, z + offsetZ, BlockId.AIR)
          continue
        }

        const side = getFaceSide(offsetX, offsetZ, spec)
        const along = side === 'north' || side === 'south' ? offsetX : offsetZ
        let blockId = pickWallBlock(spec, level, isCorner)
        if (!isCorner && Math.abs(along) < (side === 'north' || side === 'south' ? halfWidth : halfDepth) && isWindowCell(spec, level, along)) {
          if (spec.window === 'glass')
            blockId = BlockId.GLASS_PANE
          else
            blockId = side === 'north' || side === 'south' ? BlockId.SHOJI_PANEL_X : BlockId.SHOJI_PANEL_Z
        }
        setBlock(state, x + offsetX, groundY + level, z + offsetZ, blockId)
      }
    }
  }

  /** 紙門立在門口內側；燈與書架擺在門的對面 */
  const doorStep = SIDE_STEP_MAP[spec.doorSide]
  const innerX = x + doorStep.x * (halfWidth - 1)
  const innerZ = z + doorStep.z * (halfDepth - 1)
  setBlock(state, innerX, groundY, innerZ, BlockId.PAPER_DOOR)
  const backX = x - doorStep.x * (halfWidth - 1) + (doorStep.x === 0 ? halfWidth - 1 : 0)
  const backZ = z - doorStep.z * (halfDepth - 1) + (doorStep.z === 0 ? halfDepth - 1 : 0)
  setBlock(state, backX, groundY + 2, backZ, BlockId.PAPER_LAMP)

  const wallTopY = groundY + wallHeight
  placeRoof(state, spec, wallTopY)

  if (spec.hasChimney) {
    const chimneyX = x + (halfWidth - 1) * (random() < 0.5 ? -1 : 1)
    const chimneyZ = z - doorStep.z * (halfDepth - 1)
    for (let y = wallTopY; y <= wallTopY + Math.min(halfWidth, halfDepth) + 1; y++) {
      setBlock(state, chimneyX, y, chimneyZ, BlockId.BRICKS)
    }
  }

  /** 門廊：門前一排深色半磚的雨庇，兩端各一根籬笆柱撐著 */
  if (spec.hasPorch) {
    const isAlongX = doorStep.z !== 0
    const halfSpan = Math.min(2, (isAlongX ? halfWidth : halfDepth) - 1)
    const faceX = x + doorStep.x * (halfWidth + 1)
    const faceZ = z + doorStep.z * (halfDepth + 1)
    for (let along = -halfSpan; along <= halfSpan; along++) {
      const px = faceX + (isAlongX ? along : 0)
      const pz = faceZ + (isAlongX ? 0 : along)
      setBlock(state, px, groundY + 2, pz, spec.roofKit.slab)
      if (Math.abs(along) === halfSpan) {
        setDecoration(state, px, groundY, pz, BlockId.FENCE)
        setDecoration(state, px, groundY + 1, pz, BlockId.FENCE)
      }
    }
  }

  /** 二樓的露台：門那一面往外一格的木地板，外緣一排欄杆，正中一扇紙門通進屋裡 */
  if (spec.hasBalcony && spec.storeyCount >= 2) {
    const isAlongX = doorStep.z !== 0
    const halfSpan = (isAlongX ? halfWidth : halfDepth) - 1
    const floorY = groundY + GROUND_STOREY_HEIGHT - 1
    for (let along = -halfSpan; along <= halfSpan; along++) {
      const px = x + doorStep.x * (halfWidth + 1) + (isAlongX ? along : 0)
      const pz = z + doorStep.z * (halfDepth + 1) + (isAlongX ? 0 : along)
      setBlock(state, px, floorY, pz, BlockId.WOOD_SLAB)
      setBlock(state, px, floorY + 1, pz, BlockId.FENCE)
    }
    setBlock(state, x + doorStep.x * halfWidth, floorY + 1, z + doorStep.z * halfDepth, BlockId.PAPER_DOOR)
    setBlock(state, x + doorStep.x * halfWidth, floorY + 2, z + doorStep.z * halfDepth, BlockId.AIR)
  }

  if (spec.shedSide) {
    placeShed(state, spec, spec.shedSide, random)
  }
  if (spec.hasYard) {
    placeYard(state, spec, random)
  }
}

/** 側邊的小棚：三格見方，籬笆柱撐一片木半磚，底下堆著乾草、桶與箱 */
function placeShed(state: Uint8Array, spec: HouseSpec, side: Side, random: () => number): void {
  const step = SIDE_STEP_MAP[side]
  const centerX = spec.x + step.x * (spec.halfWidth + 2)
  const centerZ = spec.z + step.z * (spec.halfDepth + 2)
  const { groundY } = spec
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const px = centerX + offsetX
      const pz = centerZ + offsetZ
      const isPost = Math.abs(offsetX) === 1 && Math.abs(offsetZ) === 1
      /** 只有外側那兩角立柱，貼著屋牆那一側由牆撐著 */
      if (isPost && (offsetX === step.x || offsetZ === step.z)) {
        setBlock(state, px, groundY, pz, BlockId.FENCE)
        setBlock(state, px, groundY + 1, pz, BlockId.FENCE)
      }
      setBlock(state, px, groundY + 2, pz, BlockId.WOOD_SLAB)
    }
  }
  setDecoration(state, centerX, groundY, centerZ, pickOne(random, [BlockId.HAY, BlockId.BARREL, BlockId.CRATE]))
  setDecoration(state, centerX - step.z, groundY, centerZ - step.x, pickOne(random, [BlockId.HAY, BlockId.CRATE]))
}

/** 屋後的小院：一圈一格高的籬笆（正中留口），裡面種花、放一捆乾草 */
function placeYard(state: Uint8Array, spec: HouseSpec, random: () => number): void {
  const back = SIDE_STEP_MAP[spec.doorSide]
  const isAlongX = back.z !== 0
  const halfSpan = (isAlongX ? spec.halfWidth : spec.halfDepth) - 1
  const depth = 3
  for (let row = 1; row <= depth; row++) {
    for (let along = -halfSpan; along <= halfSpan; along++) {
      const px = spec.x - back.x * (spec.halfWidth + row) + (isAlongX ? along : 0)
      const pz = spec.z - back.z * (spec.halfDepth + row) + (isAlongX ? 0 : along)
      const isFence = row === depth || Math.abs(along) === halfSpan
      if (isFence) {
        if (along !== 0)
          setDecoration(state, px, spec.groundY, pz, BlockId.FENCE)
        continue
      }
      if (random() < 0.45) {
        setDecoration(state, px, spec.groundY, pz, pickOne(random, [BlockId.FLOWER_TULIP, BlockId.FLOWER_DANDELION, BlockId.FLOWER_VIOLA, BlockId.TALL_GRASS]))
      }
    }
  }
}

/** 一根掛提燈的柱子：木樁三格，頂上一片深色半磚，底下吊一盞和紙提燈 */
function placeHangingLampPost(state: Uint8Array, x: number, groundY: number, z: number): void {
  for (let level = 0; level < 3; level++) {
    setBlock(state, x, groundY + level, z, BlockId.WOOD_POST)
  }
  setBlock(state, x, groundY + 3, z, BlockId.DARK_WOOD_SLAB)
}

/**
 * 旅籠（茶屋兼旅店）
 *
 * 全村最大的屋子：兩層、木骨白壁、四坡深色屋頂，二樓沿街一排露台，
 * 簷下吊兩盞和紙提燈，門前一張長凳（半磚）與幾個桶
 */
export function placeInn(state: Uint8Array, x: number, groundY: number, z: number, random: () => number): void {
  const spec: HouseSpec = {
    x,
    z,
    groundY,
    halfWidth: 6,
    halfDepth: 5,
    storeyCount: 2,
    wall: 'timber',
    hasStoneBase: true,
    window: 'shoji',
    roof: 'hip',
    roofKit: DARK_ROOF,
    eave: 1,
    doorSide: 'south',
    hasPorch: false,
    hasBalcony: true,
    hasChimney: true,
    shedSide: null,
    hasYard: false,
  }
  placeHouse(state, spec, random)

  /** 露台底下（一樓門的兩側）吊提燈：露台的木地板就是吊燈的那一片頂 */
  const lampZ = z + spec.halfDepth + 1
  for (const offsetX of [-3, 3]) {
    setBlock(state, x + offsetX, groundY + 2, lampZ, BlockId.HANGING_LAMP)
  }
  /** 門前的長凳與酒桶 */
  setDecoration(state, x - 5, groundY, lampZ + 1, BlockId.WOOD_SLAB)
  setDecoration(state, x - 4, groundY, lampZ + 1, BlockId.WOOD_SLAB)
  setDecoration(state, x + 5, groundY, lampZ + 1, BlockId.BARREL)
  setDecoration(state, x + 4, groundY, lampZ + 1, BlockId.BARREL)
}

/**
 * 神社
 *
 * 村子北邊一塊高起兩格的石壇：前面石階上去，鳥居跨在階前，壇上一間深色木的小社殿，
 * 四坡屋頂；壇前兩盞石燈籠，壇邊一方神池，池裡幾片睡蓮
 */
export function placeShrine(state: Uint8Array, x: number, groundY: number, z: number): void {
  const terraceHalfWidth = 5
  const terraceFront = z + 2
  const terraceBack = z - 4
  const terraceTopY = groundY + 1

  /** 石壇：兩格高，外緣石磚、頂面石板 */
  for (let px = x - terraceHalfWidth; px <= x + terraceHalfWidth; px++) {
    for (let pz = terraceBack; pz <= terraceFront; pz++) {
      fillBox(state, px, groundY, pz, px, terraceTopY, pz, BlockId.STONE_BRICKS)
      setBlock(state, px, terraceTopY, pz, BlockId.STONE_TILE)
    }
  }
  /** 石階：三格寬，兩階 */
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    setBlock(state, x + offsetX, groundY, terraceFront + 1, BlockId.STONE_SLAB)
    setBlock(state, x + offsetX, groundY, terraceFront, BlockId.STONE_BRICKS)
    setBlock(state, x + offsetX, terraceTopY, terraceFront, BlockId.STONE_SLAB)
  }

  /** 社殿 */
  const hall: HouseSpec = {
    x,
    z: z - 2,
    groundY: terraceTopY + 1,
    halfWidth: 3,
    halfDepth: 2,
    storeyCount: 1,
    wall: 'dark',
    hasStoneBase: false,
    window: 'shoji',
    roof: 'gableX',
    roofKit: DARK_ROOF,
    eave: 1,
    doorSide: 'south',
    hasPorch: false,
    hasBalcony: false,
    hasChimney: false,
    shedSide: null,
    hasYard: false,
  }
  placeHouse(state, hall, () => 0.3)

  /** 鳥居跨在石階前面 */
  placeTorii(state, x, groundY, terraceFront + 2, true, 2, 4)

  /** 石燈籠：壇上、社殿前的兩側 */
  placeStoneLantern(state, x - 3, terraceTopY + 1, terraceFront - 1)
  placeStoneLantern(state, x + 3, terraceTopY + 1, terraceFront - 1)

  /** 神池：壇的西邊 */
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      if (Math.hypot(offsetX, offsetZ) > 2.3)
        continue
      const px = x - terraceHalfWidth - 4 + offsetX
      const pz = z - 1 + offsetZ
      carveWater(state, px, groundY - 1, pz, 2, BlockId.CLAY)
      if ((offsetX + offsetZ) % 3 === 0)
        setDecoration(state, px, groundY, pz, BlockId.LILY_PAD)
    }
  }
}

/**
 * 鍛冶屋
 *
 * 臨街一面整個敞開：四根粗柱撐一片兩坡屋頂，裡面一座石砌的爐（爐子、紅磚與一格餘燼），
 * 旁邊鐵砧（半磚疊在石磚上）、水桶（鍋）與一箱鐵料。餘燼點一盞真光，夜裡街上看得到爐火
 */
export function placeSmithy(state: Uint8Array, x: number, groundY: number, z: number, faceSide: 'north' | 'south'): void {
  const halfWidth = 4
  const halfDepth = 3
  const face = faceSide === 'south' ? 1 : -1

  fillBox(state, x - halfWidth, groundY - 1, z - halfDepth, x + halfWidth, groundY - 1, z + halfDepth, BlockId.COBBLESTONE)
  /** 背牆與兩側半牆是石砌的，臨街那一面敞開 */
  for (let level = 0; level < 4; level++) {
    for (let offsetX = -halfWidth; offsetX <= halfWidth; offsetX++) {
      setBlock(state, x + offsetX, groundY + level, z - face * halfDepth, level === 0 ? BlockId.STONE_BRICKS : BlockId.COBBLESTONE)
    }
    for (let offsetZ = -halfDepth; offsetZ <= halfDepth; offsetZ++) {
      const isOpen = offsetZ * face > 0
      for (const sideX of [-halfWidth, halfWidth]) {
        setBlock(state, x + sideX, groundY + level, z + offsetZ, isOpen ? (offsetZ * face === halfDepth ? BlockId.DARK_PLANKS : BlockId.AIR) : BlockId.COBBLESTONE)
      }
    }
  }
  placeRoof(state, {
    x,
    z,
    groundY,
    halfWidth,
    halfDepth,
    storeyCount: 1,
    wall: 'stone',
    hasStoneBase: false,
    window: 'glass',
    roof: 'gableX',
    roofKit: DARK_ROOF,
    eave: 1,
    doorSide: faceSide,
    hasPorch: false,
    hasBalcony: false,
    hasChimney: false,
    shedSide: null,
    hasYard: false,
  }, groundY + 4)

  /** 爐：靠背牆，石磚圍著一格餘燼，上面一根紅磚煙囪穿出屋頂 */
  const forgeX = x - 2
  const forgeZ = z - face * (halfDepth - 1)
  setBlock(state, forgeX, groundY, forgeZ, BlockId.EMBER)
  setBlock(state, forgeX - 1, groundY, forgeZ, BlockId.STONE_BRICKS)
  setBlock(state, forgeX + 1, groundY, forgeZ, BlockId.FURNACE)
  for (let y = groundY + 1; y <= groundY + 8; y++) {
    setBlock(state, forgeX, y, forgeZ - face, BlockId.BRICKS)
  }
  /** 鐵砧、水桶、鐵料 */
  setBlock(state, x + 1, groundY, z, BlockId.STONE_BRICKS)
  setBlock(state, x + 1, groundY + 1, z, BlockId.STONE_SLAB)
  setBlock(state, x + 2, groundY, z - face, BlockId.CAULDRON)
  setBlock(state, x + 3, groundY, z - face * 2, BlockId.CHEST)
  setBlock(state, x - 3, groundY, z + face, BlockId.WORKBENCH)
}

/**
 * 高倉（穀倉）
 *
 * 四根木樁把整間倉撐離地面兩格（防潮也防鼠），木板牆、兩坡茅草色的屋頂，
 * 前面一道梯子；樁腳下堆著乾草
 */
export function placeGranary(state: Uint8Array, x: number, groundY: number, z: number): void {
  const halfSize = 2
  const stiltHeight = 2
  for (const offsetX of [-halfSize, halfSize]) {
    for (const offsetZ of [-halfSize, halfSize]) {
      for (let level = 0; level < stiltHeight; level++) {
        setBlock(state, x + offsetX, groundY + level, z + offsetZ, BlockId.WOOD_POST)
      }
    }
  }
  const floorY = groundY + stiltHeight
  fillBox(state, x - halfSize, floorY, z - halfSize, x + halfSize, floorY, z + halfSize, BlockId.PLANKS)
  for (let level = 1; level <= 3; level++) {
    for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
      for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
        if (Math.abs(offsetX) !== halfSize && Math.abs(offsetZ) !== halfSize)
          continue
        const isCorner = Math.abs(offsetX) === halfSize && Math.abs(offsetZ) === halfSize
        setBlock(state, x + offsetX, floorY + level, z + offsetZ, isCorner ? BlockId.DARK_PLANKS : BlockId.PLANKS)
      }
    }
  }
  /** 屋頂：稻草疊成的兩坡，屋脊一排深色半磚 */
  for (let level = 0; level <= halfSize + 1; level++) {
    const across = halfSize + 1 - level
    for (let offsetX = -halfSize - 1; offsetX <= halfSize + 1; offsetX++) {
      for (const sign of across === 0 ? [0] : [-1, 1]) {
        setBlock(state, x + offsetX, floorY + 4 + level, z + sign * across, across === 0 ? BlockId.DARK_WOOD_SLAB : BlockId.HAY)
      }
    }
    for (const end of [-halfSize, halfSize]) {
      for (let offsetZ = -(across - 1); offsetZ <= across - 1; offsetZ++) {
        if (Math.abs(offsetZ) <= halfSize)
          setBlock(state, x + end, floorY + 4 + level, z + offsetZ, BlockId.PLANKS)
      }
    }
  }
  /** 梯子：南面正中，從地上爬到倉門 */
  for (let level = 0; level <= stiltHeight + 1; level++) {
    setBlock(state, x, groundY + level, z + halfSize + 1, BlockId.LADDER)
  }
  setBlock(state, x, floorY + 1, z + halfSize, BlockId.AIR)
  setBlock(state, x, floorY + 2, z + halfSize, BlockId.AIR)
  setDecoration(state, x - 1, groundY, z, BlockId.HAY)
  setDecoration(state, x + 1, groundY, z - 1, BlockId.HAY)
  setDecoration(state, x + 1, groundY + 1, z - 1, BlockId.HAY)
}

/**
 * 市場棚
 *
 * 一座四面敞開的大棚：一圈木樁、四坡淺色木的屋頂，底下排三列攤位（箱、桶、工作台、稻草、花盆），
 * 人從四面都走得進去
 */
export function placeMarketHall(state: Uint8Array, x: number, groundY: number, z: number, random: () => number): void {
  const halfWidth = 6
  const halfDepth = 4
  fillBox(state, x - halfWidth, groundY - 1, z - halfDepth, x + halfWidth, groundY - 1, z + halfDepth, BlockId.WOOD_TILE)
  fillBox(state, x - halfWidth, groundY, z - halfDepth, x + halfWidth, groundY + 3, z + halfDepth, BlockId.AIR)
  for (let offsetX = -halfWidth; offsetX <= halfWidth; offsetX += 3) {
    for (const offsetZ of [-halfDepth, halfDepth]) {
      for (let level = 0; level < 4; level++) {
        setBlock(state, x + offsetX, groundY + level, z + offsetZ, BlockId.WOOD_POST)
      }
    }
  }
  placeRoof(state, {
    x,
    z,
    groundY,
    halfWidth,
    halfDepth,
    storeyCount: 1,
    wall: 'planks',
    hasStoneBase: false,
    window: 'glass',
    roof: 'hip',
    roofKit: LIGHT_ROOF,
    eave: 1,
    doorSide: 'north',
    hasPorch: false,
    hasBalcony: false,
    hasChimney: false,
    shedSide: null,
    hasYard: false,
  }, groundY + 4)

  /** 三列攤位，列與列之間留兩格走道 */
  for (const offsetZ of [-2, 1]) {
    for (let offsetX = -4; offsetX <= 4; offsetX++) {
      if (offsetX === 0)
        continue
      const blockId = pickOne(random, [BlockId.CRATE, BlockId.BARREL, BlockId.WORKBENCH, BlockId.CHEST, BlockId.HAY, BlockId.CRATE])
      setBlock(state, x + offsetX, groundY, z + offsetZ, blockId)
      if (random() < 0.35)
        setDecoration(state, x + offsetX, groundY + 1, z + offsetZ, BlockId.FLOWER_POT)
    }
  }
  /** 棚下中間吊兩盞提燈 */
  setBlock(state, x - 3, groundY + 3, z, BlockId.HANGING_LAMP)
  setBlock(state, x + 3, groundY + 3, z, BlockId.HANGING_LAMP)
}

/**
 * 望樓
 *
 * 村子角落一座細高的木架：四根柱子十格高、兩道斜撐的橫樑，頂上一圈欄杆的平台，
 * 平台上一盞燈籠；一道梯子從地面爬上去
 */
export function placeWatchTower(state: Uint8Array, x: number, groundY: number, z: number): void {
  const height = 10
  for (const offsetX of [-1, 1]) {
    for (const offsetZ of [-1, 1]) {
      for (let level = 0; level < height; level++) {
        setBlock(state, x + offsetX, groundY + level, z + offsetZ, BlockId.DARK_PLANKS)
      }
    }
  }
  /** 半腰一圈橫樑，架子才不像四根竹竿 */
  for (const level of [4, 7]) {
    for (let offset = -1; offset <= 1; offset++) {
      for (const edge of [-1, 1]) {
        setBlock(state, x + offset, groundY + level, z + edge, BlockId.DARK_PLANKS)
        setBlock(state, x + edge, groundY + level, z + offset, BlockId.DARK_PLANKS)
      }
    }
  }
  const deckY = groundY + height
  fillBox(state, x - 2, deckY, z - 2, x + 2, deckY, z + 2, BlockId.PLANKS)
  for (let offset = -2; offset <= 2; offset++) {
    for (const edge of [-2, 2]) {
      setBlock(state, x + offset, deckY + 1, z + edge, BlockId.FENCE)
      setBlock(state, x + edge, deckY + 1, z + offset, BlockId.FENCE)
    }
  }
  /** 平台四角的柱子再往上撐一片小屋頂 */
  for (const offsetX of [-2, 2]) {
    for (const offsetZ of [-2, 2]) {
      setBlock(state, x + offsetX, deckY + 2, z + offsetZ, BlockId.FENCE)
    }
  }
  placeRoof(state, {
    x,
    z,
    groundY: deckY + 1,
    halfWidth: 2,
    halfDepth: 2,
    storeyCount: 1,
    wall: 'dark',
    hasStoneBase: false,
    window: 'glass',
    roof: 'hip',
    roofKit: DARK_ROOF,
    eave: 1,
    doorSide: 'south',
    hasPorch: false,
    hasBalcony: false,
    hasChimney: false,
    shedSide: null,
    hasYard: false,
  }, deckY + 3)
  setBlock(state, x, deckY + 1, z, BlockId.LANTERN)
  for (let level = 0; level <= height; level++) {
    setBlock(state, x, groundY + level, z + 2, BlockId.LADDER)
  }
  setBlock(state, x, deckY + 1, z + 2, BlockId.AIR)
}

/**
 * 湯屋
 *
 * 石砌腳、白壁、兩坡深色屋頂的一間澡堂，屋旁一方用石頭圍起來的露天湯池，
 * 池邊一道竹籬似的木籬遮著；煙囪在屋後
 */
export function placeBathhouse(state: Uint8Array, x: number, groundY: number, z: number, random: () => number): void {
  const spec: HouseSpec = {
    x,
    z,
    groundY,
    halfWidth: 5,
    halfDepth: 3,
    storeyCount: 1,
    wall: 'plaster',
    hasStoneBase: true,
    window: 'shoji',
    roof: 'gableX',
    roofKit: DARK_ROOF,
    eave: 1,
    doorSide: 'north',
    hasPorch: true,
    hasBalcony: false,
    hasChimney: true,
    shedSide: null,
    hasYard: false,
  }
  placeHouse(state, spec, random)

  /** 露天湯池：屋子東邊，圓石圍一圈，水與地面齊平 */
  const poolX = x + spec.halfWidth + 4
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      const px = poolX + offsetX
      const pz = z + offsetZ
      const isRim = Math.abs(offsetX) === 2 || Math.abs(offsetZ) === 2
      if (isRim) {
        setBlock(state, px, groundY - 1, pz, BlockId.STONE_BRICKS)
        setBlock(state, px, groundY, pz, BlockId.STONE_SLAB)
      }
      else {
        carveWater(state, px, groundY - 1, pz, 2, BlockId.STONE_BRICKS)
        setBlock(state, px, groundY, pz, BlockId.AIR)
      }
    }
  }
  /** 遮池的木籬：池的南與東兩面，兩格高 */
  for (let offset = -3; offset <= 3; offset++) {
    for (let level = 0; level < 2; level++) {
      setDecoration(state, poolX + offset, groundY + level, z + 3, BlockId.FENCE)
      setDecoration(state, poolX + 3, groundY + level, z + offset, BlockId.FENCE)
    }
  }
}

/**
 * 陶房
 *
 * 一間矮的木板工房，門前曬著一排排花盆（剛拉好的坯），屋旁一座紅磚的窯，
 * 窯口一格爐子
 */
export function placePottery(state: Uint8Array, x: number, groundY: number, z: number, random: () => number): void {
  const spec: HouseSpec = {
    x,
    z,
    groundY,
    halfWidth: 4,
    halfDepth: 3,
    storeyCount: 1,
    wall: 'planks',
    hasStoneBase: true,
    window: 'glass',
    roof: 'gableZ',
    roofKit: LIGHT_ROOF,
    eave: 1,
    doorSide: 'south',
    hasPorch: true,
    hasBalcony: false,
    hasChimney: false,
    shedSide: null,
    hasYard: false,
  }
  placeHouse(state, spec, random)

  /** 窯：屋子東邊，三格見方兩格高的紅磚，頂上收成一格，正面一格爐子 */
  const kilnX = x + spec.halfWidth + 3
  fillBox(state, kilnX - 1, groundY, z - 1, kilnX + 1, groundY + 1, z + 1, BlockId.BRICKS)
  setBlock(state, kilnX, groundY + 2, z, BlockId.BRICKS)
  setBlock(state, kilnX, groundY + 3, z, BlockId.BRICKS)
  setBlock(state, kilnX, groundY, z + 1, BlockId.FURNACE)

  /** 曬坯的木架：門前兩排半磚，上面一排花盆 */
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    if (Math.abs(offsetX) <= 1)
      continue
    setDecoration(state, x + offsetX, groundY, z + spec.halfDepth + 3, BlockId.WOOD_SLAB)
    setDecoration(state, x + offsetX, groundY + 1, z + spec.halfDepth + 3, BlockId.FLOWER_POT)
  }
}

/**
 * 水車小屋
 *
 * 架在水道邊的一間深色木的磨坊，水道裡立一座直徑七格的水車（輪緣深色木、八根輪輻），
 * 一根橫軸從輪心穿進屋裡
 */
export function placeWatermill(state: Uint8Array, x: number, groundY: number, z: number, streamZ: number, random: () => number): void {
  const spec: HouseSpec = {
    x,
    z,
    groundY,
    halfWidth: 4,
    halfDepth: 3,
    storeyCount: 2,
    wall: 'dark',
    hasStoneBase: true,
    window: 'glass',
    roof: 'gableZ',
    roofKit: DARK_ROOF,
    eave: 1,
    doorSide: 'east',
    hasPorch: false,
    hasBalcony: false,
    hasChimney: false,
    shedSide: null,
    hasYard: false,
  }
  placeHouse(state, spec, random)

  /** 水車：輪面在 X–Y 平面上，立在水道裡，輪心比地面高一格 */
  const wheelZ = streamZ
  const centerY = groundY + 1
  const radius = 3
  for (let offsetX = -radius; offsetX <= radius; offsetX++) {
    for (let offsetY = -radius; offsetY <= radius; offsetY++) {
      const distance = Math.hypot(offsetX, offsetY)
      const isRim = distance > radius - 0.7 && distance <= radius + 0.3
      const isSpoke = distance <= radius && (offsetX === 0 || offsetY === 0 || Math.abs(offsetX) === Math.abs(offsetY))
      if (isRim || isSpoke)
        setBlock(state, x + offsetX, centerY + offsetY, wheelZ, isRim ? BlockId.DARK_PLANKS : BlockId.PLANKS)
    }
  }
  /** 橫軸：從輪心穿到屋牆 */
  for (let pz = wheelZ + 1; pz < z - spec.halfDepth; pz++) {
    setBlock(state, x, centerY, pz, BlockId.DARK_PLANKS)
  }
}

/**
 * 街口的屋根門
 *
 * 跨在市街東端的一道有屋頂的門：兩根粗柱、一道橫樑、上面一片兩坡的小屋頂。
 * 回程的傳送門在西端，這一道是村子的另一個出口
 */
export function placeCoveredGate(state: Uint8Array, x: number, groundY: number, z: number, halfSpan: number): void {
  for (const offsetZ of [-halfSpan, halfSpan]) {
    for (let level = 0; level < 4; level++) {
      setBlock(state, x, groundY + level, z + offsetZ, BlockId.DARK_PLANKS)
    }
  }
  for (let offsetZ = -halfSpan; offsetZ <= halfSpan; offsetZ++) {
    setBlock(state, x, groundY + 4, z + offsetZ, BlockId.DARK_PLANKS)
  }
  for (let offsetZ = -halfSpan - 1; offsetZ <= halfSpan + 1; offsetZ++) {
    setBlock(state, x - 1, groundY + 5, z + offsetZ, DARK_ROOF.stairs.west)
    setBlock(state, x + 1, groundY + 5, z + offsetZ, DARK_ROOF.stairs.east)
    setBlock(state, x, groundY + 5, z + offsetZ, BlockId.DARK_PLANKS)
    setBlock(state, x, groundY + 6, z + offsetZ, BlockId.DARK_WOOD_SLAB)
  }
  /** 門柱腳下一對提燈柱 */
  placeHangingLampPost(state, x - 2, groundY, z - halfSpan - 1)
  setBlock(state, x - 2, groundY + 2, z - halfSpan - 1, BlockId.WOOD_POST)
}

/** 這一格是不是空著（空氣或花草），蓋燈柱之類的東西前問一下 */
export function isOpenGround(state: Uint8Array, x: number, y: number, z: number): boolean {
  const blockId = getBlock(state, x, y, z)
  return blockId === BlockId.AIR || blockId === BlockId.TALL_GRASS
}
