import { createSeededRandom, fbm2D, smoothStep } from '../../utils/noise'
import { BlockId, isPassableBlock, isWaterBlock } from '../block/block-constants'
import { BIOME_LIST, getBiomeWeightList, getIslandFalloff, SNOW_LINE } from './biome'
import { getBlock, getGroundY, getSurfaceY, setBlock } from './world-access'
import { SEA_LEVEL, WORLD_SIZE } from './world-constants'

/**
 * 林間營地（營火所在）
 *
 * 刻意排在雨谷影響範圍之外，營火才不會淋雨。
 * 島放大後往內陸挪了一點，免得營地落在往海岸下降的坡上，
 * 整平時得填出一面土牆
 */
export const CAMPFIRE_POSITION = { x: 72, z: 60 }
/** 瀑布下的水潭，也是山澗的源頭。位置要在山腳下坡處，才有足夠落差 */
export const WATERFALL_POSITION = { x: 120, z: 74 }
/** 村莊中心 */
export const VILLAGE_CENTER = { x: 140, z: 124 }
/**
 * 村莊的瞭望塔
 *
 * 原本的位置與西北那間木屋的地基疊在一起，塔身直接從屋頂長出來。
 * 往北挪四格，塔與屋子之間才留得下一條路
 */
export const WATCH_TOWER_POSITION = { x: 132, z: 112 }
/**
 * 石造遺跡，在村莊北邊的高地上
 *
 * 遺跡整地的範圍有十七格見方，擺在村邊會把麥田與東側那間木屋一起剷掉，
 * 所以退到村莊外圍
 */
export const RUINS_CENTER = { x: 154, z: 100 }
/** 草原上的蜂箱 */
export const APIARY_POSITION = { x: 92, z: 100 }
/** 雨谷中央的水潭，常年下雨的地方 */
export const RAINVALE_POND = { x: 44, z: 116 }
/** 南方沼澤的中心，終年罩著霧 */
export const SWAMP_CENTER = { x: 78, z: 148 }
/**
 * 村莊旁的牧場，羊群所在
 *
 * 往西退四格，柵欄才不會壓在村子西南那間木屋上
 */
export const PASTURE_CENTER = { x: 124, z: 134 }
/** 牧場的半邊長 */
export const PASTURE_HALF_SIZE = 8

/**
 * 島上的小湖泊
 *
 * 河與海之外，讓內陸也有幾處靜水：
 * 走在草原或林間會忽然遇上一窪水，睡蓮浮在上面，蛙鳴從那裡傳來
 */
export const POND_LIST = [
  /** 草原東側，往村莊去的路上 */
  { x: 126, z: 102, radius: 7 },
  /** 森林南緣的林間水窪 */
  { x: 64, z: 86, radius: 5.5 },
  /** 草原西側，森林與草原交界 */
  { x: 70, z: 92, radius: 6.5 },
  /** 雪山腳下的融雪池 */
  { x: 118, z: 40, radius: 5 },
]

/** 不生成植被的區域 */
const EXCLUSION_LIST: { x: number; z: number; radius: number }[] = [
  { ...CAMPFIRE_POSITION, radius: 9 },
  { ...WATERFALL_POSITION, radius: 18 },
  { ...VILLAGE_CENTER, radius: 20 },
  { ...WATCH_TOWER_POSITION, radius: 8 },
  { ...RUINS_CENTER, radius: 14 },
  { ...APIARY_POSITION, radius: 6 },
  { ...PASTURE_CENTER, radius: PASTURE_HALF_SIZE + 3 },
  { ...RAINVALE_POND, radius: 8 },
  /** 湖面上不該長出樹來 */
  ...POND_LIST.map((pond) => ({ x: pond.x, z: pond.z, radius: pond.radius + 3 })),
]

/**
 * 天然地表
 *
 * 整地只能動這些方塊。這一格若已經是別人的屋頂或牆，
 * 就完全不該碰，否則會把隔壁的房子當成地形填平
 */
const TERRAIN_BLOCK_SET = new Set<BlockId>([
  BlockId.GRASS,
  BlockId.DIRT,
  BlockId.SAND,
  BlockId.SANDSTONE,
  BlockId.GRAVEL,
  BlockId.CLAY,
  BlockId.STONE,
  BlockId.SNOW,
])

/**
 * 把一塊區域整平到指定高度，並清掉上方雜物
 *
 * blendSize 給的是外圈的緩衝寬度：核心整平到 targetY，
 * 外圈則一路過渡回原本的地形高度。
 * 沒有這一圈的話，蓋在坡上的東西會整塊像積木一樣浮在地形上，
 * 下坡側露出一面好幾格高的土牆
 */
function flattenArea(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  halfSize: number,
  targetY: number,
  groundBlock: BlockId,
  blendSize = 0,
): void {
  const outerSize = halfSize + blendSize

  /**
   * 原始地形高度要先量完再動工
   *
   * 邊改邊量的話，前一格填起來的土會被後一格當成原本的地形，
   * 緩衝圈會一格比一格高，最後還是一塊平台。
   * 地表不是天然方塊的格子直接記成 null，那是隔壁蓋好的房子，不能碰
   */
  const naturalHeightMap = new Map<string, number | null>()
  for (let x = centerX - outerSize; x <= centerX + outerSize; x++) {
    for (let z = centerZ - outerSize; z <= centerZ + outerSize; z++) {
      const surfaceY = getGroundY(state, x, z) - 1
      const isTerrain = TERRAIN_BLOCK_SET.has(getBlock(state, x, surfaceY, z))
      naturalHeightMap.set(`${x},${z}`, isTerrain ? surfaceY : null)
    }
  }

  for (let x = centerX - outerSize; x <= centerX + outerSize; x++) {
    for (let z = centerZ - outerSize; z <= centerZ + outerSize; z++) {
      /** 用棋盤距離，核心維持方形，與整平前的行為一致 */
      const distance = Math.max(Math.abs(x - centerX), Math.abs(z - centerZ))
      const ratio = blendSize <= 0 || distance <= halfSize
        ? 1
        : 1 - smoothStep((distance - halfSize) / blendSize)

      const naturalY = naturalHeightMap.get(`${x},${z}`)
      if (naturalY === null || naturalY === undefined)
        continue

      const levelY = Math.round(naturalY + (targetY - naturalY) * ratio)

      for (let y = 1; y < levelY; y++) {
        if (getBlock(state, x, y, z) === BlockId.AIR) {
          setBlock(state, x, y, z, BlockId.DIRT)
        }
      }

      const isCore = distance <= halfSize
      /** 緩衝圈維持草地，只有核心才鋪成人踩出來的地面 */
      setBlock(state, x, levelY, z, isCore ? groundBlock : BlockId.GRASS)

      /**
       * 核心要淨空到蓋得下房子，緩衝圈只清掉地面上的雜草
       *
       * 緩衝圈也清十二格的話，隔壁房子伸出來的屋簷會被一起削掉
       */
      const clearHeight = isCore ? 12 : 2
      for (let y = levelY + 1; y < levelY + clearHeight; y++) {
        setBlock(state, x, y, z, BlockId.AIR)
      }
    }
  }
}

/** 橡樹 */
function placeOakTree(state: Uint8Array, x: number, groundY: number, z: number, trunkHeight: number): void {
  for (let offsetY = 0; offsetY < trunkHeight; offsetY++) {
    setBlock(state, x, groundY + offsetY, z, BlockId.OAK_LOG)
  }

  const crownY = groundY + trunkHeight
  for (let offsetY = -2; offsetY <= 1; offsetY++) {
    const radius = offsetY <= -1 ? 2 : 1
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
        const isCorner = Math.abs(offsetX) === radius && Math.abs(offsetZ) === radius
        if (isCorner && radius > 1)
          continue
        if (offsetX === 0 && offsetZ === 0 && offsetY < 0)
          continue

        setBlock(state, x + offsetX, crownY + offsetY, z + offsetZ, BlockId.OAK_LEAVES)
      }
    }
  }
}

/** 針葉樹 */
function placePineTree(state: Uint8Array, x: number, groundY: number, z: number, trunkHeight: number): void {
  for (let offsetY = 0; offsetY < trunkHeight; offsetY++) {
    setBlock(state, x, groundY + offsetY, z, BlockId.PINE_LOG)
  }

  const layerCount = Math.max(3, Math.floor(trunkHeight / 2))
  for (let layer = 0; layer < layerCount; layer++) {
    const layerY = groundY + trunkHeight - 1 - layer
    const radius = layer === 0 ? 0 : Math.min(2, Math.floor(layer / 2) + 1)

    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
        if (Math.abs(offsetX) + Math.abs(offsetZ) > radius + 1)
          continue
        if (offsetX === 0 && offsetZ === 0 && layer !== 0)
          continue

        setBlock(state, x + offsetX, layerY, z + offsetZ, BlockId.PINE_LEAVES)
      }
    }
  }
  setBlock(state, x, groundY + trunkHeight, z, BlockId.PINE_LEAVES)
}

/**
 * 落葉林的白楊
 *
 * 樹幹細直，樹冠比橡樹高一層也窄一點，一片林子站在一起才會像白楊林。
 * 葉子的顏色由呼叫端決定，琥珀與金黃兩種混著長，秋色才不會是一片死板的橘
 */
function placeAspenTree(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  trunkHeight: number,
  leafBlock: BlockId,
): void {
  for (let offsetY = 0; offsetY < trunkHeight; offsetY++) {
    setBlock(state, x, groundY + offsetY, z, BlockId.ASPEN_LOG)
  }

  const crownY = groundY + trunkHeight
  for (let offsetY = -3; offsetY <= 1; offsetY++) {
    const radius = offsetY <= -2 ? 2 : offsetY <= 0 ? 2 : 1
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
        /** 角落挖掉，樹冠才是圓的而不是一個方塊 */
        const isCorner = Math.abs(offsetX) === radius && Math.abs(offsetZ) === radius
        if (isCorner && radius > 1)
          continue
        /** 樹幹那一柱只有最上面才長葉子 */
        if (offsetX === 0 && offsetZ === 0 && offsetY < 0)
          continue

        setBlock(state, x + offsetX, crownY + offsetY, z + offsetZ, leafBlock)
      }
    }
  }
}

/** 沼澤枯木 */
function placeDeadTree(state: Uint8Array, x: number, groundY: number, z: number, trunkHeight: number): void {
  for (let offsetY = 0; offsetY < trunkHeight; offsetY++) {
    setBlock(state, x, groundY + offsetY, z, BlockId.DEAD_LOG)
  }
  setBlock(state, x + 1, groundY + trunkHeight - 1, z, BlockId.DEAD_LOG)
  setBlock(state, x, groundY + trunkHeight - 2, z - 1, BlockId.DEAD_LOG)
}

/** 林間營地：石圈營火、四張木階梯座椅與兩頂木棚 */
function placeCamp(state: Uint8Array): void {
  const { x, z } = CAMPFIRE_POSITION
  const groundY = getGroundY(state, x, z)

  /**
   * 只有火堆四周踩成泥地，外圈一路過渡回原本的林地
   *
   * 整片鋪成十一格見方的泥地，遠看就是林子裡挖出一塊土黃色的方框
   */
  flattenArea(state, x, z, 3, groundY - 1, BlockId.DIRT, 5)

  /**
   * 營火
   *
   * 一圈石頭鋪平了只會像地上畫了個方框。
   * 改成三層：地面挖成灰燼坑，外圈用半磚砌一圈矮石緣，
   * 火堆本身是餘燼加四根斜靠的柴薪，從側面看才有高低與體積
   */
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const isCorner = offsetX !== 0 && offsetZ !== 0
      /** 坑底：中央燒得最透，四角留一點焦石 */
      setBlock(
        state,
        x + offsetX,
        groundY - 2,
        z + offsetZ,
        isCorner ? BlockId.COBBLESTONE : BlockId.GRAVEL,
      )
    }
  }

  /** 石緣：距離兩格的一圈半磚，矮到看得過去又圍得住火 */
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      const distance = Math.hypot(offsetX, offsetZ)
      if (distance < 1.8 || distance > 2.6)
        continue
      setBlock(state, x + offsetX, groundY, z + offsetZ, BlockId.STONE_SLAB)
    }
  }

  /**
   * 柴薪與火
   *
   * 木柴橫躺在餘燼的四邊，四個角留空，從側面看才是「柴圍著火」而不是四個方塊。
   * 原木用橡木，枯木那張叢林木材質偏黃綠，擺成一圈會像四捆稻草。
   * 火焰本身交給粒子，堆一根發亮的方塊柱只會像地上插了盞燈
   */
  setBlock(state, x, groundY - 1, z, BlockId.EMBER)
  for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    setBlock(state, x + step[0]!, groundY - 1, z + step[1]!, BlockId.OAK_LOG)
  }

  /**
   * 座椅
   *
   * 四面各擺一張木階梯，靠背朝外、人面向火。
   * 原木躺在那裡只是一根木頭，階梯有座面也有靠背，一看就知道是給人坐的
   */
  const seatList = [
    { x: x - 3, z, blockId: BlockId.WOOD_STAIRS_WEST },
    { x: x + 3, z, blockId: BlockId.WOOD_STAIRS_EAST },
    { x, z: z - 3, blockId: BlockId.WOOD_STAIRS_NORTH },
    { x, z: z + 3, blockId: BlockId.WOOD_STAIRS_SOUTH },
  ]
  for (const seat of seatList) {
    setBlock(state, seat.x, groundY, seat.z, seat.blockId)
  }

  /**
   * 木棚
   *
   * 棚柱從自己腳下的地面長到屋頂：棚子落在整平的緩衝圈上，
   * 地面高度未必與營火同高，寫死兩格高的話柱子不是懸空就是只露出一截。
   * 柱腳要在鋪屋頂之前先量，屋頂一蓋上去，那幾格的地面高度就變成屋頂了
   */
  const roofY = groundY + 2
  const postList = [{ x: x + 4, z: z + 2 }, { x: x + 6, z: z + 4 }]
    .map((post) => ({ ...post, baseY: getGroundY(state, post.x, post.z) }))

  for (let offsetX = 0; offsetX < 3; offsetX++) {
    for (let offsetZ = 0; offsetZ < 3; offsetZ++) {
      setBlock(state, x + 4 + offsetX, roofY, z + 2 + offsetZ, BlockId.DARK_PLANKS)
    }
  }

  for (const post of postList) {
    for (let y = post.baseY; y < roofY; y++) {
      setBlock(state, post.x, y, post.z, BlockId.PLANKS)
    }
  }
}

/**
 * 指定範圍內既有的水域寬度，用來避開河道與海岸
 *
 * 回傳的是有水的柱數：路邊一兩格的小水窪不算數，
 * 只有河道、海這種成片的水才需要閃開
 */
function countWaterColumn(state: Uint8Array, centerX: number, centerZ: number, radius: number): number {
  const bound = Math.ceil(radius)
  let count = 0

  for (let offsetX = -bound; offsetX <= bound; offsetX++) {
    for (let offsetZ = -bound; offsetZ <= bound; offsetZ++) {
      if (Math.hypot(offsetX, offsetZ) > radius)
        continue

      const x = centerX + offsetX
      const z = centerZ + offsetZ
      if (getSurfaceY(state, x, z) > getGroundY(state, x, z))
        count++
    }
  }

  return count
}

/** 成片的水要多寬才算得上是河或海 */
const POND_CONFLICT_COLUMN_COUNT = 6

/**
 * 內陸的小湖泊
 *
 * 先把湖岸整成一圈同高的地，再往下挖一個碗，注水到岸邊低一格的高度。
 * 邊界用噪音推開，才不會是一個用圓規畫出來的池子
 */
function placePondList(state: Uint8Array): void {
  const random = createSeededRandom('minespace-pond')

  for (const pond of POND_LIST) {
    /**
     * 碰到既有水域就整個放棄這一窪
     *
     * 湖面的高度是照湖心的地面算的，跟河道的水位不會一樣。
     * 兩者一重疊，河會被削掉一段，接縫處還會立起一片懸空的水牆。
     * 位置沒選好時寧可不生成，也不要把河切斷
     */
    if (countWaterColumn(state, pond.x, pond.z, pond.radius + 4) > POND_CONFLICT_COLUMN_COUNT)
      continue

    const shoreY = getGroundY(state, pond.x, pond.z)
    /** 水面比岸邊低一格，站在岸上才看得出這是一窪凹下去的水 */
    const waterY = shoreY - 2
    const bound = Math.ceil(pond.radius) + 3

    for (let offsetX = -bound; offsetX <= bound; offsetX++) {
      for (let offsetZ = -bound; offsetZ <= bound; offsetZ++) {
        const x = pond.x + offsetX
        const z = pond.z + offsetZ
        /**
         * 邊界推開一點噪音，湖岸才不會是完美的圓
         *
         * 噪音的頻率要比湖小得多。頻率取 0.16 的話一個起伏就有六格寬，
         * 整座湖剛好落在同一個波峰上，等於把半徑整體加減兩格，
         * 湖不是被吹大就是整個消失，而不是邊緣變得不規則
         */
        const wobble = fbm2D(x * 0.42, z * 0.42, 2, 0.5) * 1.3
        const distance = Math.hypot(offsetX, offsetZ) + wobble

        if (distance > pond.radius + 2)
          continue

        /**
         * 外圈整成一圈同高的岸
         *
         * 只鋪一層會在斜坡上留下懸空的草皮，
         * 低於岸高的部分要往下填實，高過的部分要削掉
         */
        if (distance > pond.radius) {
          for (let y = shoreY; y < shoreY + 8; y++) {
            if (!isPassableBlock(getBlock(state, x, y, z)))
              setBlock(state, x, y, z, BlockId.AIR)
          }
          setBlock(state, x, shoreY - 1, z, BlockId.GRASS)
          for (let y = shoreY - 2; y > shoreY - 8; y--) {
            if (!isPassableBlock(getBlock(state, x, y, z)))
              break
            setBlock(state, x, y, z, BlockId.DIRT)
          }
          continue
        }

        /** 湖底越靠中心越深，鏟出一個碗 */
        const depth = distance < pond.radius * 0.45 ? 3 : 2
        const bedY = waterY - depth + 1

        for (let y = bedY; y < shoreY + 8; y++) {
          setBlock(state, x, y, z, BlockId.AIR)
        }
        /** 湖底也要往下填實，免得挖穿到底下的空洞 */
        for (let y = bedY - 1; y > bedY - 6; y--) {
          if (!isPassableBlock(getBlock(state, x, y, z)))
            break
          setBlock(state, x, y, z, BlockId.DIRT)
        }

        const isEdge = distance > pond.radius - 1.4
        setBlock(
          state,
          x,
          bedY - 1,
          z,
          isEdge ? BlockId.SAND : (random() < 0.35 ? BlockId.CLAY : BlockId.GRAVEL),
        )

        for (let y = bedY; y <= waterY; y++) {
          setBlock(state, x, y, z, BlockId.WATER)
        }
      }
    }

    /** 湖面上撒幾片睡蓮 */
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = random() * Math.PI * 2
      const spread = Math.sqrt(random()) * (pond.radius - 1)
      const x = Math.round(pond.x + Math.cos(angle) * spread)
      const z = Math.round(pond.z + Math.sin(angle) * spread)

      if (getBlock(state, x, waterY, z) !== BlockId.WATER)
        continue
      if (getBlock(state, x, waterY + 1, z) !== BlockId.AIR)
        continue

      setBlock(state, x, waterY + 1, z, BlockId.LILY_PAD)
    }

    /** 岸邊的蘆葦叢 */
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = random() * Math.PI * 2
      const spread = pond.radius + random() * 2.5
      const x = Math.round(pond.x + Math.cos(angle) * spread)
      const z = Math.round(pond.z + Math.sin(angle) * spread)
      const groundY = getGroundY(state, x, z)

      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      if (getBlock(state, x, groundY - 1, z) !== BlockId.GRASS)
        continue

      setBlock(state, x, groundY, z, random() < 0.6 ? BlockId.TALL_GRASS : BlockId.FERN)
    }
  }
}

/**
 * 小木屋
 *
 * 一個木頭盒子加一片平屋頂，遠看只是四方形的木塊。
 * 這裡照著真的房子拆成幾件事做：
 * 石砌基座撐住屋身、四角立原木柱、牆頂壓一道橫樑、
 * 屋頂改成有屋脊與屋簷的斜頂。
 * 這些線條會把一大片木牆切開，房子才有輪廓可看
 */
function placeHouse(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
): void {
  const groundY = getGroundY(state, centerX, centerZ)
  const floorY = groundY - 1

  /** 外圈留一圈緩衝，房子才不會連著一塊方形土台一起浮在草地上 */
  flattenArea(state, centerX, centerZ, Math.max(halfWidth, halfDepth) + 1, floorY, BlockId.DIRT, 3)

  const wallHeight = 4
  /** 屋脊沿著長邊走，短邊那側才是屋簷落下的方向 */
  const isRidgeAlongX = halfWidth >= halfDepth
  const slopeHalfSize = isRidgeAlongX ? halfDepth : halfWidth

  for (let offsetX = -halfWidth; offsetX <= halfWidth; offsetX++) {
    for (let offsetZ = -halfDepth; offsetZ <= halfDepth; offsetZ++) {
      const isEdge = Math.abs(offsetX) === halfWidth || Math.abs(offsetZ) === halfDepth
      const isCorner = Math.abs(offsetX) === halfWidth && Math.abs(offsetZ) === halfDepth
      setBlock(state, centerX + offsetX, floorY, centerZ + offsetZ, BlockId.PLANKS)

      if (!isEdge)
        continue

      /** 基座：牆腳墊一圈石頭，屋身才像坐在地上 */
      setBlock(state, centerX + offsetX, floorY + 1, centerZ + offsetZ, BlockId.COBBLESTONE)

      for (let offsetY = 2; offsetY <= wallHeight; offsetY++) {
        /**
         * 窗開在牆的正中央，兩側各留一格牆當窗框
         *
         * 原本用座標取餘數決定，開出來的窗會偏在一邊，
         * 相鄰兩面牆還可能各開各的，看起來像牆破了幾個洞
         */
        const alongWall = Math.abs(offsetX) === halfWidth ? offsetZ : offsetX
        const wallHalfSize = Math.abs(offsetX) === halfWidth ? halfDepth : halfWidth
        const isWindow = !isCorner
          && offsetY === 3
          && alongWall === 0
          && wallHalfSize >= 2

        setBlock(
          state,
          centerX + offsetX,
          floorY + offsetY,
          centerZ + offsetZ,
          isCorner
            ? BlockId.OAK_LOG
            : isWindow ? BlockId.GLASS_PANE : BlockId.PLANKS,
        )
      }

      /** 牆頂壓一道深色橫樑，屋身與屋頂之間才有一條分界 */
      setBlock(state, centerX + offsetX, floorY + wallHeight + 1, centerZ + offsetZ, BlockId.DARK_PLANKS)
    }
  }

  placeGableRoof(state, {
    centerX,
    centerZ,
    halfWidth,
    halfDepth,
    baseY: floorY + wallHeight + 1,
    isRidgeAlongX,
  })

  /**
   * 山牆
   *
   * 斜屋頂在沒有坡度的那兩側會留下三角形的缺口，
   * 不補起來會直接看穿屋內
   */
  for (let level = 1; level <= slopeHalfSize; level++) {
    const gableHalfSize = slopeHalfSize - level
    for (let offset = -gableHalfSize; offset <= gableHalfSize; offset++) {
      for (const side of [-1, 1]) {
        const x = isRidgeAlongX ? centerX + side * halfWidth : centerX + offset
        const z = isRidgeAlongX ? centerZ + offset : centerZ + side * halfDepth
        setBlock(state, x, floorY + wallHeight + 1 + level, z, BlockId.PLANKS)
      }
    }
  }

  /** 門口，門楣壓一根原木 */
  setBlock(state, centerX, floorY + 1, centerZ + halfDepth, BlockId.AIR)
  setBlock(state, centerX, floorY + 2, centerZ + halfDepth, BlockId.AIR)
  setBlock(state, centerX, floorY + 3, centerZ + halfDepth, BlockId.OAK_LOG)
  /** 門邊掛一盞燈，夜裡看得出哪一面是正面 */
  setBlock(state, centerX + 1, floorY + 3, centerZ + halfDepth, BlockId.LANTERN)

  /** 屋內擺設 */
  setBlock(state, centerX - halfWidth + 1, floorY + 1, centerZ - halfDepth + 1, BlockId.BOOKSHELF)
  setBlock(state, centerX + halfWidth - 1, floorY + 1, centerZ - halfDepth + 1, BlockId.LANTERN)

  /** 門口兩側擺花盆 */
  setBlock(state, centerX - 1, floorY + 1, centerZ + halfDepth + 1, BlockId.FLOWER_POT)
  setBlock(state, centerX + 1, floorY + 1, centerZ + halfDepth + 1, BlockId.FLOWER_POT)
}

interface GableRoofParams {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
  /** 屋簷那一層的高度 */
  baseY: number;
  isRidgeAlongX: boolean;
}

/**
 * 斜屋頂
 *
 * 每往屋脊靠近一格就升高一格，坡度剛好是階梯方塊的形狀。
 * 屋簷往外多出一格，屋頂才會蓋過牆面，而不是與牆切齊像個蓋子
 */
function placeGableRoof(state: Uint8Array, params: GableRoofParams): void {
  const { centerX, centerZ, halfWidth, halfDepth, baseY, isRidgeAlongX } = params

  /** 沿著屋脊方向的半長，與垂直屋脊方向的半長 */
  const ridgeHalfSize = isRidgeAlongX ? halfWidth : halfDepth
  const slopeHalfSize = isRidgeAlongX ? halfDepth : halfWidth

  for (let slope = -(slopeHalfSize + 1); slope <= slopeHalfSize + 1; slope++) {
    /** 屋簷在最外圈，越往屋脊每格升高一級 */
    const level = baseY + (slopeHalfSize + 1 - Math.abs(slope))
    const isRidge = slope === 0

    for (let along = -(ridgeHalfSize + 1); along <= ridgeHalfSize + 1; along++) {
      const x = isRidgeAlongX ? centerX + along : centerX + slope
      const z = isRidgeAlongX ? centerZ + slope : centerZ + along

      if (isRidge) {
        setBlock(state, x, level, z, BlockId.DARK_PLANKS)
        continue
      }

      /** 靠背朝屋脊那一側，斜面才是往上收 */
      const blockId = isRidgeAlongX
        ? (slope < 0 ? BlockId.DARK_STAIRS_SOUTH : BlockId.DARK_STAIRS_NORTH)
        : (slope < 0 ? BlockId.DARK_STAIRS_EAST : BlockId.DARK_STAIRS_WEST)
      setBlock(state, x, level, z, blockId)
    }
  }
}

/**
 * 水井
 *
 * 井口一圈石頭只是地上的一個洞，走過去不會發現那是井。
 * 補上四根立柱與一片小屋頂，遠遠就看得出村子中央有口井
 */
function placeWell(state: Uint8Array, centerX: number, centerZ: number): void {
  const groundY = getGroundY(state, centerX, centerZ)

  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, centerX + offsetX, groundY, centerZ + offsetZ, BlockId.COBBLESTONE)
    }
  }
  setBlock(state, centerX, groundY, centerZ, BlockId.WATER)
  setBlock(state, centerX, groundY - 1, centerZ, BlockId.WATER)
  setBlock(state, centerX, groundY - 2, centerZ, BlockId.WATER)

  /** 四角立柱撐起井棚 */
  const roofY = groundY + 3
  for (const corner of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    for (let y = groundY + 1; y < roofY; y++) {
      setBlock(state, centerX + corner[0]!, y, centerZ + corner[1]!, BlockId.FENCE)
    }
  }

  /** 井棚：三乘三的深色木板，中央壓一塊，看起來像個小尖頂 */
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, centerX + offsetX, roofY, centerZ + offsetZ, BlockId.DARK_PLANKS)
    }
  }
  setBlock(state, centerX, roofY + 1, centerZ, BlockId.DARK_PLANKS)
  /** 吊在井口正上方的燈 */
  setBlock(state, centerX, roofY - 1, centerZ, BlockId.LANTERN)
}

/** 瞭望塔 */
function placeWatchTower(state: Uint8Array): void {
  const { x, z } = WATCH_TOWER_POSITION
  const groundY = getGroundY(state, x, z)
  const height = 9

  /**
   * 只整平塔基那五格見方
   *
   * 整平會把上方十二格一併清空，範圍再大一點就會削掉旁邊木屋的屋頂
   */
  flattenArea(state, x, z, 2, groundY - 1, BlockId.COBBLESTONE)

  for (let offsetY = 0; offsetY < height; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const isEdge = offsetX !== 0 || offsetZ !== 0
        if (!isEdge)
          continue

        const isCorner = offsetX !== 0 && offsetZ !== 0
        /** 四角立原木柱，一整根從頭貫到尾，塔身才不是一根光溜溜的石管 */
        if (isCorner) {
          setBlock(state, x + offsetX, groundY + offsetY, z + offsetZ, BlockId.PINE_LOG)
          continue
        }

        /** 四面各留一道瞭望口 */
        const isLookout = offsetY === height - 3
        setBlock(
          state,
          x + offsetX,
          groundY + offsetY,
          z + offsetZ,
          isLookout ? BlockId.GLASS_PANE : BlockId.STONE_BRICKS,
        )
      }
    }
  }

  /** 塔頂：外挑一圈的平台，邊緣圍上木欄杆 */
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      setBlock(state, x + offsetX, groundY + height, z + offsetZ, BlockId.DARK_PLANKS)

      const isRail = Math.abs(offsetX) === 2 || Math.abs(offsetZ) === 2
      if (isRail) {
        setBlock(state, x + offsetX, groundY + height + 1, z + offsetZ, BlockId.FENCE)
      }
    }
  }
  setBlock(state, x, groundY + height - 1, z, BlockId.LANTERN)
}

/** 村莊：幾間木屋、水井、田地與瞭望塔 */
function placeVillage(state: Uint8Array): void {
  const { x, z } = VILLAGE_CENTER

  placeHouse(state, x - 6, z - 5, 3, 3)
  placeHouse(state, x + 5, z - 4, 3, 2)
  placeHouse(state, x - 4, z + 6, 2, 3)
  placeHouse(state, x + 6, z + 6, 3, 3)
  placeWell(state, x, z)
  placeWatchTower(state)

  /** 石板路：從水井往四個方向鋪出去 */
  const pathDirectionList = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ]
  /**
   * 只鋪在裸露的地面上
   *
   * 光看「上面是不是空的」會連屋頂都算數：
   * 屋簷上方同樣是空氣，路就會沿著屋頂鋪過去
   */
  const pavePath = (pathX: number, pathZ: number): void => {
    const pathY = getGroundY(state, pathX, pathZ)
    const surfaceBlock = getBlock(state, pathX, pathY - 1, pathZ)

    if (getBlock(state, pathX, pathY, pathZ) !== BlockId.AIR)
      return
    if (surfaceBlock !== BlockId.GRASS && surfaceBlock !== BlockId.DIRT)
      return

    setBlock(state, pathX, pathY, pathZ, BlockId.STONE_SLAB)
  }

  for (const direction of pathDirectionList) {
    for (let step = 2; step <= 10; step++) {
      const pathX = x + direction.x * step
      const pathZ = z + direction.z * step

      pavePath(pathX, pathZ)
      /** 路寬兩格，看起來才像走出來的路 */
      pavePath(pathX + direction.z, pathZ + direction.x)
    }
  }

  /** 田地與旁邊的圍籬 */
  const fieldY = getGroundY(state, x - 1, z - 12) - 1
  for (let offsetX = -4; offsetX <= 4; offsetX++) {
    for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
      setBlock(state, x + offsetX, fieldY, z - 12 + offsetZ, BlockId.HAY)
    }
  }
  for (let offsetX = -5; offsetX <= 5; offsetX++) {
    setBlock(state, x + offsetX, fieldY + 1, z - 16, BlockId.FENCE)
  }
}

/** 石造遺跡：斷柱與苔石地板 */
function placeRuins(state: Uint8Array): void {
  const { x, z } = RUINS_CENTER
  const groundY = getGroundY(state, x, z)
  const random = createSeededRandom('minespace-ruins')

  flattenArea(state, x, z, 8, groundY - 1, BlockId.MOSSY_COBBLESTONE)

  for (let offsetX = -6; offsetX <= 6; offsetX += 4) {
    for (let offsetZ = -6; offsetZ <= 6; offsetZ += 4) {
      const columnHeight = 2 + Math.floor(random() * 5)
      for (let offsetY = 0; offsetY < columnHeight; offsetY++) {
        setBlock(state, x + offsetX, groundY + offsetY, z + offsetZ, BlockId.STONE_BRICKS)
      }
      if (columnHeight >= 5) {
        setBlock(state, x + offsetX, groundY + columnHeight, z + offsetZ, BlockId.MOSSY_COBBLESTONE)
      }
    }
  }

  /** 殘破的牆 */
  for (let offsetX = -7; offsetX <= 7; offsetX++) {
    const wallHeight = 1 + Math.floor(random() * 3)
    for (let offsetY = 0; offsetY < wallHeight; offsetY++) {
      setBlock(state, x + offsetX, groundY + offsetY, z - 8, BlockId.STONE_BRICKS)
    }
  }
}

/**
 * 瀑布
 *
 * 不蓋任何石塊，而是往山裡「挖」：
 * 先在山腳挖出一個半圓形的水潭凹地，讓上坡側自然形成一面崖壁，
 * 再從崖壁上的岩洞口把水放出來，水就順著崖面落進水潭。
 */
function placeWaterfall(state: Uint8Array): void {
  const pool = WATERFALL_POSITION
  const waterY = getSurfaceY(state, pool.x, pool.z) - 1

  const alpine = BIOME_LIST.find((biome) => biome.id === 'alpine')!
  const towardMountainX = alpine.center.x - pool.x
  const towardMountainZ = alpine.center.z - pool.z
  const mountainLength = Math.hypot(towardMountainX, towardMountainZ)
  const directionX = towardMountainX / mountainLength
  const directionZ = towardMountainZ / mountainLength

  /**
   * 沿著上坡方向找第一處夠高的山壁，當作出水口
   *
   * 取最近的一處，挖出來的水潭凹地才不會大到像被隕石砸過
   */
  const MIN_FALL_HEIGHT = 7
  let mouthDistance = 0
  let mouthY = 0

  for (let distance = 4; distance <= 20; distance++) {
    const sampleX = Math.round(pool.x + directionX * distance)
    const sampleZ = Math.round(pool.z + directionZ * distance)
    const height = getGroundY(state, sampleX, sampleZ) - 1

    if (height >= waterY + MIN_FALL_HEIGHT) {
      mouthDistance = distance
      mouthY = height
      break
    }
  }

  /** 山坡不夠陡就不硬做，寧可沒有瀑布也不要一座假山 */
  if (mouthDistance === 0)
    return

  const basinRadius = mouthDistance - 1

  /** 挖出水潭凹地，半徑帶點噪音，邊緣才不會像用圓規畫的 */
  for (let offsetX = -basinRadius - 2; offsetX <= basinRadius + 2; offsetX++) {
    for (let offsetZ = -basinRadius - 2; offsetZ <= basinRadius + 2; offsetZ++) {
      const blockX = pool.x + offsetX
      const blockZ = pool.z + offsetZ
      const wobble = fbm2D(blockX * 0.16, blockZ * 0.16, 2, 0.5) * 1.6
      const distance = Math.hypot(offsetX, offsetZ) + wobble

      if (distance > basinRadius)
        continue

      /** 潭面以上一路挖到崖頂，落水才看得見 */
      for (let y = waterY + 1; y <= mouthY + 3; y++) {
        setBlock(state, blockX, y, blockZ, BlockId.AIR)
      }

      /** 潭底：中央較深，越靠岸越淺 */
      const depth = distance < basinRadius * 0.6 ? 4 : 2
      for (let y = waterY - depth + 1; y <= waterY; y++) {
        setBlock(state, blockX, y, blockZ, BlockId.WATER)
      }
      setBlock(state, blockX, waterY - depth, blockZ, BlockId.GRAVEL)
    }
  }

  /** 落水：從岩洞口一路掛到潭面 */
  const fallX = Math.round(pool.x + directionX * basinRadius)
  const fallZ = Math.round(pool.z + directionZ * basinRadius)
  const perpendicularX = -directionZ
  const perpendicularZ = directionX

  for (let side = -1; side <= 1; side++) {
    const columnX = Math.round(fallX + perpendicularX * side)
    const columnZ = Math.round(fallZ + perpendicularZ * side)

    for (let y = waterY; y <= mouthY - 1; y++) {
      setBlock(state, columnX, y, columnZ, BlockId.WATER)
    }
  }

  /**
   * 岩洞：從出水口往山裡鑽一段
   *
   * 上坡處地形只會越來越高，通道自然埋在岩層裡，
   * 玩家看到的就是「水從山壁的洞裡流出來」
   */
  const TUNNEL_LENGTH = 12
  for (let distance = 0; distance <= TUNNEL_LENGTH; distance++) {
    const centerX = Math.round(pool.x + directionX * (basinRadius + distance))
    const centerZ = Math.round(pool.z + directionZ * (basinRadius + distance))
    const floorY = mouthY - 1 + Math.floor(distance / 5)

    for (let side = -1; side <= 1; side++) {
      const columnX = Math.round(centerX + perpendicularX * side)
      const columnZ = Math.round(centerZ + perpendicularZ * side)

      setBlock(state, columnX, floorY, columnZ, BlockId.WATER)
      for (let height = 1; height <= 2; height++) {
        setBlock(state, columnX, floorY + height, columnZ, BlockId.AIR)
      }
    }
  }
}

/** 蜂場：草原上的幾座蜂箱 */
function placeApiary(state: Uint8Array): void {
  const { x, z } = APIARY_POSITION
  const groundY = getGroundY(state, x, z)

  flattenArea(state, x, z, 3, groundY - 1, BlockId.GRASS)

  const hiveSpotList = [
    { x: x - 2, z: z - 1 },
    { x, z: z + 1 },
    { x: x + 2, z: z - 1 },
  ]
  for (const spot of hiveSpotList) {
    setBlock(state, spot.x, groundY, spot.z, BlockId.OAK_LOG)
    setBlock(state, spot.x, groundY + 1, spot.z, BlockId.HIVE)
  }
}

/**
 * 牧場：柵欄圍起來的草地，羊群在裡面吃草
 *
 * 柵欄用原木柱表示，方塊世界裡看起來剛好像圍籬
 */
function placePasture(state: Uint8Array): void {
  const { x, z } = PASTURE_CENTER
  const groundY = getGroundY(state, x, z)

  flattenArea(state, x, z, PASTURE_HALF_SIZE, groundY - 1, BlockId.GRASS)

  for (let offset = -PASTURE_HALF_SIZE; offset <= PASTURE_HALF_SIZE; offset++) {
    /** 北面正中央留一個缺口當作出入口 */
    const isGate = offset === 0

    if (!isGate) {
      setBlock(state, x + offset, groundY, z - PASTURE_HALF_SIZE, BlockId.FENCE)
    }
    setBlock(state, x + offset, groundY, z + PASTURE_HALF_SIZE, BlockId.FENCE)
    setBlock(state, x - PASTURE_HALF_SIZE, groundY, z + offset, BlockId.FENCE)
    setBlock(state, x + PASTURE_HALF_SIZE, groundY, z + offset, BlockId.FENCE)
  }

  /** 角落堆點乾草 */
  setBlock(state, x - PASTURE_HALF_SIZE + 2, groundY, z - PASTURE_HALF_SIZE + 2, BlockId.HAY)
  setBlock(state, x - PASTURE_HALF_SIZE + 3, groundY, z - PASTURE_HALF_SIZE + 2, BlockId.HAY)
  setBlock(state, x - PASTURE_HALF_SIZE + 2, groundY + 1, z - PASTURE_HALF_SIZE + 2, BlockId.HAY)
}

/**
 * 雨谷：水潭、苔石與滿地水窪
 *
 * 這裡常年下雨，地貌要看得出來被雨水泡久了
 */
function placeRainvale(state: Uint8Array): void {
  const { x, z } = RAINVALE_POND
  const random = createSeededRandom('minespace-rainvale')

  const isInsidePond = (offsetX: number, offsetZ: number) => {
    const wobble = fbm2D((x + offsetX) * 0.14, (z + offsetZ) * 0.14, 2, 0.5) * 2
    return Math.hypot(offsetX, offsetZ) + wobble <= 6
  }

  /**
   * 水面要壓在整圈岸邊的最低點以下
   *
   * 直接拿中心點的高度當水位，遇到傾斜地形就會看到水面浮在岸上
   */
  let lowestGround = Number.POSITIVE_INFINITY
  for (let offsetX = -10; offsetX <= 10; offsetX++) {
    for (let offsetZ = -10; offsetZ <= 10; offsetZ++) {
      /** 連潭邊外圍一圈一起取樣，水面才不會高過岸邊 */
      if (Math.hypot(offsetX, offsetZ) > 9)
        continue
      lowestGround = Math.min(lowestGround, getGroundY(state, x + offsetX, z + offsetZ))
    }
  }

  const pondY = lowestGround - 1

  /** 中央水潭 */
  for (let offsetX = -8; offsetX <= 8; offsetX++) {
    for (let offsetZ = -8; offsetZ <= 8; offsetZ++) {
      if (!isInsidePond(offsetX, offsetZ))
        continue

      const distance = Math.hypot(offsetX, offsetZ)
      const depth = distance < 3.5 ? 3 : 2

      for (let y = pondY - depth + 1; y <= pondY; y++) {
        setBlock(state, x + offsetX, y, z + offsetZ, BlockId.WATER)
      }
      setBlock(state, x + offsetX, pondY - depth, z + offsetZ, BlockId.CLAY)
      for (let y = pondY + 1; y <= pondY + 6; y++) {
        setBlock(state, x + offsetX, y, z + offsetZ, BlockId.AIR)
      }
    }
  }

  /** 散落的苔石與小水窪 */
  for (let index = 0; index < 46; index++) {
    const offsetX = Math.round((random() * 2 - 1) * 18)
    const offsetZ = Math.round((random() * 2 - 1) * 18)
    const spotX = x + offsetX
    const spotZ = z + offsetZ
    const groundY = getGroundY(state, spotX, spotZ)

    if (getSurfaceY(state, spotX, spotZ) > groundY)
      continue

    if (random() < 0.55) {
      /** 苔石堆 */
      setBlock(state, spotX, groundY, spotZ, BlockId.MOSSY_COBBLESTONE)
      if (random() < 0.4) {
        setBlock(state, spotX, groundY + 1, spotZ, BlockId.MOSSY_COBBLESTONE)
        setBlock(state, spotX + 1, groundY, spotZ, BlockId.MOSSY_COBBLESTONE)
      }
      continue
    }

    /** 積水的小水窪，四周要夠平，不然水會掛在坡上 */
    const puddleSpotList = [
      { x: spotX, z: spotZ },
      { x: spotX + 1, z: spotZ },
      { x: spotX, z: spotZ + 1 },
    ]
    const isFlat = puddleSpotList.every(
      (spot) => getGroundY(state, spot.x, spot.z) === groundY,
    )
    if (!isFlat)
      continue

    for (const spot of puddleSpotList) {
      setBlock(state, spot.x, groundY - 1, spot.z, BlockId.WATER)
    }
  }
}

/** 是否落在禁建區內 */
function isExcluded(x: number, z: number): boolean {
  return EXCLUSION_LIST.some(
    (zone) => Math.hypot(x - zone.x, z - zone.z) <= zone.radius,
  )
}

/** 依生態區撒上植被 */
function scatterVegetation(state: Uint8Array): void {
  const random = createSeededRandom('minespace-vegetation')
  /** 記錄已種樹的位置，避免擠成一團 */
  const occupied = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  const hasNeighborTree = (x: number, z: number, spacing: number): boolean => {
    for (let offsetX = -spacing; offsetX <= spacing; offsetX++) {
      for (let offsetZ = -spacing; offsetZ <= spacing; offsetZ++) {
        const neighborX = x + offsetX
        const neighborZ = z + offsetZ
        if (neighborX < 0 || neighborX >= WORLD_SIZE || neighborZ < 0 || neighborZ >= WORLD_SIZE)
          continue
        if (occupied[neighborX * WORLD_SIZE + neighborZ])
          return true
      }
    }
    return false
  }

  for (let x = 2; x < WORLD_SIZE - 2; x++) {
    for (let z = 2; z < WORLD_SIZE - 2; z++) {
      if (isExcluded(x, z))
        continue

      const groundY = getGroundY(state, x, z)
      /** 泡在水裡或站在人造物上就不種 */
      if (getSurfaceY(state, x, z) > groundY)
        continue

      const surfaceBlock = getBlock(state, x, groundY - 1, z)
      if (surfaceBlock !== BlockId.GRASS && surfaceBlock !== BlockId.SNOW && surfaceBlock !== BlockId.CLAY)
        continue

      const weightMap = new Map(
        getBiomeWeightList(x, z).map(({ biome, weight }) => [biome.id, weight]),
      )
      const density = fbm2D(x * 0.09, z * 0.09, 3, 0.5)

      const forestWeight = weightMap.get('forest') ?? 0
      const alpineWeight = weightMap.get('alpine') ?? 0
      const meadowWeight = weightMap.get('meadow') ?? 0
      const swampWeight = weightMap.get('swamp') ?? 0
      const rainvaleWeight = weightMap.get('rainvale') ?? 0
      const autumnWeight = weightMap.get('autumn') ?? 0
      /** 海岸不是中心點式的生態區，改用島嶼衰減判斷 */
      const isCoast = getIslandFalloff(x, z) < 0.85

      let planted = false

      if (rainvaleWeight > 0.3 && random() < 0.3) {
        if (hasNeighborTree(x, z, 2))
          continue
        /** 雨谷是常年濕潤的針葉林，樹長得又高又密 */
        placePineTree(state, x, groundY, z, 7 + Math.floor(random() * 4))
        planted = true
      }
      else if (forestWeight > 0.28 && density > -0.15 && random() < 0.22) {
        if (hasNeighborTree(x, z, 2))
          continue
        if (fbm2D(x * 0.05, z * 0.05, 2, 0.5) > 0) {
          placePineTree(state, x, groundY, z, 6 + Math.floor(random() * 3))
        }
        else {
          placeOakTree(state, x, groundY, z, 4 + Math.floor(random() * 2))
        }
        planted = true
      }
      else if (alpineWeight > 0.22 && groundY < SNOW_LINE + 4 && random() < 0.1) {
        if (hasNeighborTree(x, z, 3))
          continue
        placePineTree(state, x, groundY, z, 5 + Math.floor(random() * 4))
        planted = true
      }
      else if (autumnWeight > 0.3 && density > -0.25 && random() < 0.13) {
        /**
         * 樹距拉得比針闊葉林寬
         *
         * 落葉林要看得到光穿過樹冠灑下來，樹擠在一起就成了一片密不透風的橘色天花板，
         * 底下的落葉與飄下來的葉子也全被擋住
         */
        if (hasNeighborTree(x, z, 4))
          continue
        /**
         * 兩種秋色以低頻噪音分片，再加一點隨機
         *
         * 純看噪音的話，一整片林子可能剛好落在同一個波峰上而全是同一色；
         * 摻進隨機值後，成片的色塊裡還是會混進幾棵另一種顏色的樹
         */
        const leafBlock = fbm2D(x * 0.05, z * 0.05, 2, 0.5) + (random() - 0.5) * 0.7 > 0
          ? BlockId.AMBER_LEAVES
          : BlockId.GOLD_LEAVES
        placeAspenTree(state, x, groundY, z, 6 + Math.floor(random() * 4), leafBlock)
        planted = true
      }
      else if (swampWeight > 0.25 && random() < 0.06) {
        if (hasNeighborTree(x, z, 3))
          continue
        placeDeadTree(state, x, groundY, z, 3 + Math.floor(random() * 3))
        planted = true
      }
      else if (meadowWeight > 0.5 && density > 0.3 && random() < 0.04) {
        if (hasNeighborTree(x, z, 6))
          continue
        placeOakTree(state, x, groundY, z, 4 + Math.floor(random() * 2))
        planted = true
      }
      else if (isCoast && groundY > SEA_LEVEL && random() < 0.01) {
        if (hasNeighborTree(x, z, 4))
          continue
        /** 沙灘上的漂流木 */
        setBlock(state, x, groundY, z, BlockId.DEAD_LOG)
        setBlock(state, x + 1, groundY, z, BlockId.DEAD_LOG)
        planted = true
      }

      if (planted) {
        occupied[x * WORLD_SIZE + z] = 1
      }
    }
  }
}

/**
 * 撒上花草蕨類與睡蓮
 *
 * 全是不占空間的裝飾方塊，玩家可以直接走過去。
 * 地面光禿禿的時候整座島看起來就像色塊，有這些才像個地方
 */
function scatterGroundCover(state: Uint8Array): void {
  const random = createSeededRandom('minespace-ground-cover')

  for (let x = 2; x < WORLD_SIZE - 2; x++) {
    for (let z = 2; z < WORLD_SIZE - 2; z++) {
      const groundY = getGroundY(state, x, z)
      const surfaceY = getSurfaceY(state, x, z)
      const surfaceBlock = getBlock(state, x, groundY - 1, z)

      /**
       * 水面上鋪睡蓮
       *
       * 只挑內陸的淺水。海岸的沙灘同樣是一兩格深的水，
       * 光看深度會把整圈海岸都鋪滿睡蓮，
       * 所以再要求水面高過海平面——那是池塘與河道才有的條件
       */
      if (surfaceY > groundY) {
        const depth = surfaceY - groundY
        const isInlandWater = surfaceY - 1 > SEA_LEVEL
        const isShallowPond = depth <= 3
          && isInlandWater
          && isWaterBlock(getBlock(state, x, surfaceY - 1, z))
        /** 睡蓮擺在水面上方那一格，貼圖本身貼在該格底部，剛好浮在水面 */
        if (isShallowPond && random() < 0.06) {
          setBlock(state, x, surfaceY, z, BlockId.LILY_PAD)
        }
        continue
      }

      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      const weightMap = new Map(
        getBiomeWeightList(x, z).map(({ biome, weight }) => [biome.id, weight]),
      )
      const rainvaleWeight = weightMap.get('rainvale') ?? 0
      const forestWeight = weightMap.get('forest') ?? 0
      const swampWeight = weightMap.get('swamp') ?? 0
      const autumnWeight = weightMap.get('autumn') ?? 0

      if (surfaceBlock === BlockId.SAND) {
        /** 沙灘上偶爾長點乾枯的灌木 */
        if (random() < 0.014) {
          setBlock(state, x, groundY, z, BlockId.DRY_SHRUB)
        }
        continue
      }

      if (surfaceBlock === BlockId.STONE && random() < 0.01) {
        setBlock(state, x, groundY, z, BlockId.DRY_SHRUB)
        continue
      }

      if (surfaceBlock !== BlockId.GRASS && surfaceBlock !== BlockId.CLAY)
        continue

      /** 雨谷濕氣重，長的是蕨類與菇 */
      if (rainvaleWeight > 0.3) {
        if (random() < 0.46) {
          setBlock(state, x, groundY, z, random() < 0.7 ? BlockId.FERN : BlockId.MUSHROOM)
        }
        continue
      }

      if (swampWeight > 0.3) {
        if (random() < 0.26) {
          setBlock(state, x, groundY, z, random() < 0.5 ? BlockId.FERN : BlockId.TALL_GRASS)
        }
        continue
      }

      if (forestWeight > 0.25) {
        if (random() < 0.32) {
          setBlock(state, x, groundY, z, random() < 0.75 ? BlockId.TALL_GRASS : BlockId.FERN)
        }
        continue
      }

      /**
       * 落葉林：地上鋪一層落葉
       *
       * 抬頭是滿樹金黃、低頭卻是夏天的草地會很怪。
       * 越靠林子中央落得越厚，邊緣才慢慢變回草原
       */
      if (autumnWeight > 0.25) {
        const leafChance = 0.16 + autumnWeight * 0.5
        if (random() < leafChance) {
          setBlock(state, x, groundY, z, BlockId.FALLEN_LEAVES)
        }
        else if (random() < 0.2) {
          setBlock(state, x, groundY, z, BlockId.TALL_GRASS)
        }
        continue
      }

      /** 草原：大片長草，偶爾一叢花 */
      const density = fbm2D(x * 0.07, z * 0.07, 2, 0.5)
      if (density > -0.12 && random() < 0.36) {
        setBlock(state, x, groundY, z, BlockId.TALL_GRASS)
      }
      else if (random() < 0.045) {
        const flowerRoll = random()
        const flower = flowerRoll < 0.4
          ? BlockId.FLOWER_DANDELION
          : flowerRoll < 0.75 ? BlockId.FLOWER_TULIP : BlockId.FLOWER_ROSE
        setBlock(state, x, groundY, z, flower)
      }
    }
  }
}

/** 擺上所有人造物與植被 */
export function placeStructures(state: Uint8Array): void {
  placeWaterfall(state)
  placeRainvale(state)
  placePondList(state)
  placeCamp(state)
  placeVillage(state)
  placePasture(state)
  placeRuins(state)
  placeApiary(state)
  scatterVegetation(state)
  scatterGroundCover(state)
}
