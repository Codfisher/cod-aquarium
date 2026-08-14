import type { GardenDefinition } from './garden-layout'
import { fbm2D } from '../../utils/noise'
import { BlockId, isDecorationBlock, isPassableBlock } from '../block/block-constants'
import { getBlock, setBlock } from '../world/world-access'
import { SAND_LEVEL } from './garden-constants'
import { getDeckBlockY } from './garden-layout'

/**
 * 箱庭的共用零件
 *
 * 十七座箱庭的內容各不相同，但底下那套木工是一樣的：
 * 一圈墊腳石、幾層木頭、一片以半磚收邊的甲板。
 * 樹、石燈籠、鳥居這類反覆出現的東西也收在這裡
 */

/** 填一個長方體 */
export function fillBox(
  state: Uint8Array,
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  blockId: BlockId,
): void {
  for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); x++) {
    for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y++) {
      for (let z = Math.min(fromZ, toZ); z <= Math.max(fromZ, toZ); z++) {
        setBlock(state, x, y, z, blockId)
      }
    }
  }
}

/** 以中心點填一層正方形 */
export function fillSquare(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  halfSize: number,
  y: number,
  blockId: BlockId,
): void {
  fillBox(
    state,
    centerX - halfSize,
    y,
    centerZ - halfSize,
    centerX + halfSize,
    y,
    centerZ + halfSize,
    blockId,
  )
}

/**
 * 帶噪音擾動的「到中心的距離」
 *
 * 水池、山體、岸線這類自然的東西，用純粹的幾何算出來一眼就看得出是電腦畫的：
 * 圓是完美的圓、稜線是一條直線、岸線是一條正弦波。
 * 把距離加上一層分形噪音，邊界就會凹凸不定，
 * 而且同一個座標永遠得到同一個結果，地圖不會每次載入都不一樣。
 *
 * `frequency` 決定凹凸的疏密，`amplitude` 決定凹凸的深淺
 */
export function getNoisyDistance(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  frequency = 0.22,
  amplitude = 2.2,
): number {
  return Math.hypot(x - centerX, z - centerZ)
    + fbm2D(x * frequency, z * frequency, 3, 0.5) * amplitude
}

/** 以中心點填一層圓盤 */
export function fillDisc(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  radius: number,
  y: number,
  blockId: BlockId,
): void {
  const limit = Math.ceil(radius)

  for (let offsetX = -limit; offsetX <= limit; offsetX++) {
    for (let offsetZ = -limit; offsetZ <= limit; offsetZ++) {
      if (Math.hypot(offsetX, offsetZ) > radius)
        continue

      setBlock(state, centerX + offsetX, y, centerZ + offsetZ, blockId)
    }
  }
}

/**
 * 邊緣不規則的圓盤
 *
 * 與 {@link fillDisc} 的差別只在邊界吃了一層噪音。
 * 人工的東西（石板廣場、木造平台）用規則的圓，
 * 自然的東西（水池、沙洲、土丘）一律用這個
 */
export function fillNoisyDisc(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  radius: number,
  y: number,
  blockId: BlockId,
  amplitude = 2.2,
  frequency = 0.22,
): void {
  const limit = Math.ceil(radius + amplitude)

  for (let offsetX = -limit; offsetX <= limit; offsetX++) {
    for (let offsetZ = -limit; offsetZ <= limit; offsetZ++) {
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      if (getNoisyDistance(x, z, centerX, centerZ, frequency, amplitude) > radius)
        continue

      setBlock(state, x, y, z, blockId)
    }
  }
}

/** 只在原本是空氣的位置放方塊，用來擺不該蓋掉既有結構的裝飾 */
export function setDecoration(
  state: Uint8Array,
  x: number,
  y: number,
  z: number,
  blockId: BlockId,
): void {
  if (getBlock(state, x, y, z) !== BlockId.AIR)
    return

  setBlock(state, x, y, z, blockId)
}

/**
 * 木座
 *
 * 由下往上：貼在沙面上的白砂岩墊腳石、幾層木頭的座身、最後是甲板。
 * 甲板本身就佔一格，所以座身只需要疊 `pedestalHeight - 1` 層——
 * 這裡曾經把兩者分開算，結果設成「一格高」的木座從沙面看上去有兩格
 */
export function placePedestal(state: Uint8Array, garden: GardenDefinition): void {
  const { center, halfSize, pedestalHeight } = garden
  const deckY = getDeckBlockY(garden)

  /** 墊腳石與沙面齊平，木頭才不像直接插進沙裡 */
  fillSquare(state, center.x, center.z, halfSize + 1, SAND_LEVEL, BlockId.WHITE_SANDSTONE)

  /**
   * 木座底下換成岩
   *
   * 整個世界的地表以下都是白砂岩，那是給沙地用的填充料，
   * 本來永遠不會被看到——直到有哪一座箱庭往下挖。
   * 地獄谷的裂谷、岩響窟的下坡通道都挖穿過甲板，
   * 露出來的是一整片慘白的沙，比不挖還糟。
   *
   * 與其在每一座箱庭裡各自補一次，不如在這裡一次換掉：
   * 木座底下本來就不該是沙，那是一座庭園立著的地方。
   * 之後任何一座要往下挖幾格都不必再想這件事
   */
  for (let y = 1; y <= SAND_LEVEL; y++) {
    fillSquare(state, center.x, center.z, halfSize + 1, y, BlockId.STONE)
  }

  /**
   * 座身
   *
   * 外緣一圈用深色木，中間用淺色木。
   * 整座都同一種木材的話，遠看只是一塊懸空的色塊，
   * 有了深色的邊才看得出這是一個「有厚度的台子」
   */
  for (let level = 0; level < pedestalHeight - 1; level++) {
    const y = SAND_LEVEL + 1 + level

    for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
      for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
        const isEdge = Math.abs(offsetX) === halfSize || Math.abs(offsetZ) === halfSize
        setBlock(
          state,
          center.x + offsetX,
          y,
          center.z + offsetZ,
          isEdge ? BlockId.DARK_PLANKS : BlockId.PLANKS,
        )
      }
    }
  }

  /**
   * 甲板
   *
   * 最外一圈用深色木半磚收邊。整格的木框在一格高的木座上顯得太厚，
   * 半磚只佔下半格，邊緣就變成一道薄薄的唇，
   * 從外面看是「一只端著庭園的淺盤」而不是「一個木箱」。
   * 順帶一個好處：唇比沙面只高半格，從任何一邊都跨得上去
   */
  for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
    for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
      const isEdge = Math.abs(offsetX) === halfSize || Math.abs(offsetZ) === halfSize
      setBlock(
        state,
        center.x + offsetX,
        deckY,
        center.z + offsetZ,
        isEdge ? BlockId.DARK_WOOD_SLAB : BlockId.WOOD_TILE,
      )
    }
  }
}

/**
 * 木座甲板上鋪自己的地表
 *
 * 邊緣留兩圈不動：最外圈是深色木的框，往內一圈是拼花木地板。
 * 草地若一路鋪到框邊，看起來會像一塊草皮被硬塞進木框裡；
 * 中間留一道木頭，「這是一座擺在台子上的庭園」才讀得出來
 */
export const DECK_MARGIN = 2

export function paveDeck(state: Uint8Array, garden: GardenDefinition, blockId: BlockId): void {
  fillSquare(
    state,
    garden.center.x,
    garden.center.z,
    garden.halfSize - DECK_MARGIN,
    getDeckBlockY(garden),
    blockId,
  )
}

/**
 * 把一格挖成與甲板齊平的水面
 *
 * 直覺會想「在甲板上放一層水」，但那樣水面會比地面高出一整格，
 * 看起來像一塊浮在草地上的果凍。
 * 水要往下挖：底床沉到甲板底下，水填回來剛好與甲板同高
 */
export function carveWater(
  state: Uint8Array,
  x: number,
  deckY: number,
  z: number,
  depth: number,
  bedBlock: BlockId,
): void {
  const bedY = deckY - depth
  setBlock(state, x, bedY, z, bedBlock)
  for (let y = bedY + 1; y <= deckY; y++) {
    setBlock(state, x, y, z, BlockId.WATER)
  }
}

/**
 * 屋頂的收頭
 *
 * 外圈用半磚出簷、裡面用實心方塊當屋脊。
 * 順序不能顛倒：半磚只佔下半格，屋脊若疊在半磚上就會浮著半格，
 * 從側面看是一條穿過屋頂的縫
 */
export function placeRoofCap(
  state: Uint8Array,
  centerX: number,
  y: number,
  centerZ: number,
  halfSize: number,
  slabBlock: BlockId,
  coreBlock: BlockId,
): void {
  for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
    for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
      const isEdge = Math.abs(offsetX) === halfSize || Math.abs(offsetZ) === halfSize
      setBlock(state, centerX + offsetX, y, centerZ + offsetZ, isEdge ? slabBlock : coreBlock)
    }
  }
}

/** 繞著一個點在白沙上耙出幾圈同心的紋路 */
export function rakeRipple(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  y: number,
  fromRing: number,
  toRing: number,
): void {
  for (let ring = fromRing; ring <= toRing; ring++) {
    const stepCount = ring * 8
    for (let step = 0; step < stepCount; step++) {
      const angle = (step / stepCount) * Math.PI * 2
      const x = centerX + Math.round(Math.cos(angle) * ring)
      const z = centerZ + Math.round(Math.sin(angle) * ring)
      if (getBlock(state, x, y, z) !== BlockId.GARDEN_SAND)
        continue

      setBlock(state, x, y, z, BlockId.RAKED_SAND)
    }
  }
}

/**
 * 耙紋
 *
 * 枯山水的沙紋是繞著石頭一圈一圈耙出來的。
 * 這裡只在木座外圍幾圈畫，遠處維持一片乾淨的白：
 * 整片鋪滿紋路的話，走到哪裡都一樣，反而看不出中心在哪
 */
export function rakeAround(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  halfSize: number,
  ringCount = 3,
  ringGap = 3,
): void {
  for (let ring = 1; ring <= ringCount; ring++) {
    const distance = halfSize + 1 + ring * ringGap

    for (let offset = -distance; offset <= distance; offset++) {
      const pointList = [
        { x: centerX + offset, z: centerZ - distance },
        { x: centerX + offset, z: centerZ + distance },
        { x: centerX - distance, z: centerZ + offset },
        { x: centerX + distance, z: centerZ + offset },
      ]

      for (const point of pointList) {
        /** 只改乾淨的沙，蓋到別人的木階或墊腳石就跳過 */
        if (getBlock(state, point.x, SAND_LEVEL, point.z) !== BlockId.WHITE_SAND)
          continue

        setBlock(state, point.x, SAND_LEVEL, point.z, BlockId.RAKED_SAND)
      }
    }
  }
}

/** 針葉樹 */
export function placePineTree(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  trunkHeight: number,
): void {
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

        setDecoration(state, x + offsetX, layerY, z + offsetZ, BlockId.PINE_LEAVES)
      }
    }
  }
  setDecoration(state, x, groundY + trunkHeight, z, BlockId.PINE_LEAVES)
}

/** 橡樹 */
export function placeOakTree(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  trunkHeight: number,
  leafBlock: BlockId = BlockId.OAK_LEAVES,
): void {
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

        setDecoration(state, x + offsetX, crownY + offsetY, z + offsetZ, leafBlock)
      }
    }
  }
}

/** 白楊，樹幹細直、樹冠窄而高，葉色由呼叫端決定 */
export function placeAspenTree(
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
    const radius = offsetY <= 0 ? 2 : 1
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
        const isCorner = Math.abs(offsetX) === radius && Math.abs(offsetZ) === radius
        if (isCorner && radius > 1)
          continue
        if (offsetX === 0 && offsetZ === 0 && offsetY < 0)
          continue

        setDecoration(state, x + offsetX, crownY + offsetY, z + offsetZ, leafBlock)
      }
    }
  }
}

/**
 * 相思樹
 *
 * 樹冠是攤平的一片，不是一顆球。
 * 海風一直吹的地方，樹會長成這個樣子
 */
export function placeAcaciaTree(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  trunkHeight: number,
): void {
  for (let offsetY = 0; offsetY < trunkHeight; offsetY++) {
    setBlock(state, x, groundY + offsetY, z, BlockId.ACACIA_LOG)
  }

  const crownY = groundY + trunkHeight
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
      const distance = Math.abs(offsetX) + Math.abs(offsetZ)
      if (distance > 4)
        continue

      setDecoration(state, x + offsetX, crownY, z + offsetZ, BlockId.ACACIA_LEAVES)
      if (distance <= 2) {
        setDecoration(state, x + offsetX, crownY + 1, z + offsetZ, BlockId.ACACIA_LEAVES)
      }
    }
  }
}

/**
 * 飛石
 *
 * 日本庭園裡最能一眼認出來的東西，而它的關鍵不在石頭本身，
 * 在於「它不是一條路」。鋪滿的石板是路：走哪裡都行，於是不必想。
 * 飛石是一顆一顆隔開的：只能踩在石頭上，於是每一步都得挑地方落腳，
 * 步伐因此慢下來——那正是它存在的理由，庭園要的就是那個慢。
 *
 * 所以間距與偏移都要不規則。等距排成直線的話，人眼會把它讀成
 * 一條虛線的路，那個「得挑地方落腳」的效果就整個沒了
 */
export function placeSteppingStones(
  state: Uint8Array,
  startX: number,
  startZ: number,
  stepX: number,
  stepZ: number,
  count: number,
  y: number,
  random: () => number,
): void {
  /** 側向偏移的方向：與前進方向垂直的那一軸 */
  const sideX = stepZ
  const sideZ = stepX

  let travelled = 0
  for (let index = 0; index < count; index++) {
    /** 一到兩格一顆，疏密不勻才不像虛線 */
    travelled += 1 + Math.floor(random() * 2)
    const side = Math.round(random() * 2 - 1)
    const x = startX + stepX * travelled + sideX * side
    const z = startZ + stepZ * travelled + sideZ * side

    /**
     * 只擺在乾淨的沙上
     *
     * 這條路是從外面走過來的，沿途可能會碰到孤石、鄰座的木座
     * 或另一條飛石。撞到就跳過那一顆，不要蓋掉別人的東西
     */
    if (getBlock(state, x, y - 1, z) !== BlockId.WHITE_SAND)
      continue
    if (getBlock(state, x, y, z) !== BlockId.AIR)
      continue

    setBlock(state, x, y, z, BlockId.STEPPING_STONE)
  }
}

/**
 * 替整片範圍蓋上一層積雪
 *
 * 逐格往下找到那一柱最上面的實心方塊，在它頭上放一片薄雪。
 *
 * 這件事必須最後做。雪是積在東西上面的，所以「東西」得先全部就位——
 * 先蓋雪再種樹的話，樹會從雪裡長出來，而不是雪落在樹上。
 *
 * 三種東西不蓋：交叉立板的花草（雪會浮在半空中，它們沒有頂面）、
 * 穿得過去的方塊，以及已經是雪的那些。
 * 樹葉照蓋——一片壓著雪的樹冠正是雪景最說得出話的地方
 */
export function capWithSnow(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  halfSize: number,
  fromY: number,
  toY: number,
): void {
  for (let offsetX = -halfSize; offsetX <= halfSize; offsetX++) {
    for (let offsetZ = -halfSize; offsetZ <= halfSize; offsetZ++) {
      const x = centerX + offsetX
      const z = centerZ + offsetZ

      for (let y = toY; y >= fromY; y--) {
        const blockId = getBlock(state, x, y, z)
        if (blockId === BlockId.AIR)
          continue

        /**
         * 花草與可穿越的東西不算頂面，但也不能就此停手
         *
         * 一株草長在雪地上，草底下那格才是真正該積雪的地方。
         * 這裡直接往下繼續找，雪就會鋪在草的腳邊而不是頭上
         */
        if (isDecorationBlock(blockId) || isPassableBlock(blockId))
          continue

        if (blockId !== BlockId.SNOW_LAYER && getBlock(state, x, y + 1, z) === BlockId.AIR) {
          setBlock(state, x, y + 1, z, BlockId.SNOW_LAYER)
        }
        break
      }
    }
  }
}

/** 枯木的三種朝向要成套換，只換直的那根會在岔枝上斷色 */
export interface DeadTreeLogSet {
  trunk: BlockId;
  branchX: BlockId;
  branchZ: BlockId;
}

/** 曬白的枯木：站在草原與雪地裡的那一種 */
export const BLEACHED_LOG_SET: DeadTreeLogSet = {
  trunk: BlockId.DEAD_LOG,
  branchX: BlockId.DEAD_LOG_X,
  branchZ: BlockId.DEAD_LOG_Z,
}

/** 燒焦的枯木：地獄谷那幾株是被熱氣烤死的，不是曬乾的 */
export const CHARRED_LOG_SET: DeadTreeLogSet = {
  trunk: BlockId.CHARRED_LOG,
  branchX: BlockId.CHARRED_LOG_X,
  branchZ: BlockId.CHARRED_LOG_Z,
}

/** 枯木，只剩幾根岔出去的枝 */
export function placeDeadTree(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  trunkHeight: number,
  logSet: DeadTreeLogSet = BLEACHED_LOG_SET,
): void {
  for (let offsetY = 0; offsetY < trunkHeight; offsetY++) {
    setBlock(state, x, groundY + offsetY, z, logSet.trunk)
  }
  /** 岔出去的兩根橫枝，各自用對應朝向的方塊 */
  setDecoration(state, x + 1, groundY + trunkHeight - 1, z, logSet.branchX)
  setDecoration(state, x, groundY + trunkHeight - 2, z - 1, logSet.branchZ)
}

/**
 * 盆景般的矮松
 *
 * 主幹只有三四格，往一側偏出去再往上翹，
 * 樹冠是幾片攤開的葉子。箱庭裡的主景樹都用這一種：
 * 尺度對得上木座，姿態又不對稱，看起來像有人修過
 */
export function placeBonsaiPine(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  leanX: number,
  leanZ: number,
): void {
  /**
   * 主幹要一格接一格
   *
   * 直覺的寫法是「長兩格、往旁邊偏一格再長兩格」，
   * 但那一步同時往上又往旁邊，兩塊木頭只在稜線相接，
   * 看起來就是斷成兩截、上半截浮在空中。
   * 偏斜與上升得拆成兩步：先平移、再往上，每一塊都與前一塊共面。
   *
   * 對角的偏斜（x 與 z 都非零）也是同樣的問題，這裡只取其中一軸
   */
  const stepX = leanX !== 0 ? Math.sign(leanX) : 0
  const stepZ = stepX === 0 ? Math.sign(leanZ) : 0

  const trunkPointList = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    /** 同高度往旁邊挪一格，與下面那塊共用一個面 */
    { x: stepX, y: 1, z: stepZ },
    { x: stepX, y: 2, z: stepZ },
    { x: stepX * 2, y: 2, z: stepZ * 2 },
    { x: stepX * 2, y: 3, z: stepZ * 2 },
  ]
  for (const point of trunkPointList) {
    setBlock(state, x + point.x, groundY + point.y, z + point.z, BlockId.PINE_LOG)
  }

  const crownX = x + stepX * 2
  const crownZ = z + stepZ * 2
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      if (Math.abs(offsetX) + Math.abs(offsetZ) > 2)
        continue

      setDecoration(state, crownX + offsetX, groundY + 4, crownZ + offsetZ, BlockId.PINE_LEAVES)
    }
  }
  /** 主幹半途岔出來的一片，樹形才不會像一支棒棒糖 */
  setDecoration(state, x - leanX, groundY + 2, z - leanZ, BlockId.PINE_LEAVES)
  setDecoration(state, x, groundY + 5, z, BlockId.PINE_LEAVES)
}

/**
 * 石燈籠
 *
 * 底座一塊石、柱身一節發光的石柱、頂上壓一片石半磚。
 * 每座箱庭的入口各擺一盞，走在霧裡時是唯一的方位參考
 */
export function placeStoneLantern(state: Uint8Array, x: number, groundY: number, z: number): void {
  setBlock(state, x, groundY, z, BlockId.WHITE_SANDSTONE)
  setBlock(state, x, groundY + 1, z, BlockId.LANTERN_BOX)
  setBlock(state, x, groundY + 2, z, BlockId.STONE_SLAB)
}

/**
 * 鳥居
 *
 * 兩根柱子加上兩道橫樑。擺在木階前面當作門，
 * 走過去就知道自己踏進了另一座箱庭
 */
export function placeTorii(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  isAlongX: boolean,
  halfWidth = 2,
  height = 4,
): void {
  const stepX = isAlongX ? 1 : 0
  const stepZ = isAlongX ? 0 : 1

  const put = (offset: number, level: number, blockId: BlockId) => {
    setBlock(state, x + stepX * offset, groundY + level, z + stepZ * offset, blockId)
  }

  /**
   * 柱腳的石礎
   *
   * 木頭直接插進地裡看起來像被埋了半截。
   * 墊一塊與地面齊平的石板，柱子才是「立在上面」的
   */
  for (const side of [-halfWidth, halfWidth]) {
    put(side, -1, BlockId.STONE_TILE)
    for (let level = 0; level < height; level++) {
      put(side, level, BlockId.DARK_PLANKS)
    }
  }

  /**
   * 貫：穿過兩根柱子的橫木
   *
   * 這一道比其他橫樑細得多，所以用圍籬而不是整格的木頭——
   * 圍籬本來就是一根細柱加橫桿，而且會自動往兩側的柱子接上去。
   * 整座鳥居若全是整格方塊，就只是三根木頭排成一個「開」字，
   * 有粗有細才看得出這是一個有構造的東西
   */
  for (let offset = -halfWidth + 1; offset <= halfWidth - 1; offset++) {
    put(offset, height - 2, BlockId.FENCE)
  }

  /** 額束：貫與島木之間那根短柱，正中央一根 */
  put(0, height - 1, BlockId.FENCE)

  /** 島木：壓在柱頭上的主樑，與柱同寬 */
  for (let offset = -halfWidth; offset <= halfWidth; offset++) {
    put(offset, height, BlockId.DARK_PLANKS)
  }

  /**
   * 笠木：最上面那道，比島木再寬一格
   *
   * 用半磚收薄，才不會與底下的島木糊成一塊兩格厚的木頭；
   * 兩端改用階梯，斜口朝外，做出真鳥居那種往兩側翹起來收尾的感覺
   */
  for (let offset = -halfWidth; offset <= halfWidth; offset++) {
    put(offset, height + 1, BlockId.DARK_WOOD_SLAB)
  }
  put(-halfWidth - 1, height + 1, isAlongX ? BlockId.DARK_STAIRS_EAST : BlockId.DARK_STAIRS_SOUTH)
  put(halfWidth + 1, height + 1, isAlongX ? BlockId.DARK_STAIRS_WEST : BlockId.DARK_STAIRS_NORTH)
}

/**
 * 一顆立石
 *
 * 枯山水裡的石頭不是規則的方塊堆，底寬頂窄、還要歪一點。
 * 高度給幾格就長幾格，最上面那格往隨機一側偏出去
 */
export function placeStandingStone(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  height: number,
  blockId: BlockId = BlockId.STONE,
): void {
  for (let level = 0; level < height; level++) {
    const isBase = level === 0
    const radius = isBase ? 1 : 0

    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
        if (Math.abs(offsetX) === 1 && Math.abs(offsetZ) === 1)
          continue

        setBlock(state, x + offsetX, groundY + level, z + offsetZ, blockId)
      }
    }
  }
}

/**
 * 蹲踞（洗手缽）
 *
 * 一塊石頭挖出一窪水，旁邊擱著竹製的水杓。
 * 進茶室之前在這裡淨手，是日式庭園裡少數會出聲的東西
 */
export function placeWaterBasin(state: Uint8Array, x: number, groundY: number, z: number): void {
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, x + offsetX, groundY, z + offsetZ, BlockId.STONE_TILE)
      if (offsetX !== 0 || offsetZ !== 0) {
        setBlock(state, x + offsetX, groundY + 1, z + offsetZ, BlockId.STONE_TILE)
      }
    }
  }
  setBlock(state, x, groundY + 1, z, BlockId.WATER)
  /** 竹製的水杓，用實心方塊：圍籬會往旁邊的石頭長出橫桿 */
  setBlock(state, x + 2, groundY + 1, z, BlockId.BAMBOO_BLOCK)
}

/** 依機率在地面上撒一種裝飾，只落在指定的地表方塊上 */
export function scatterOnGround(
  state: Uint8Array,
  centerX: number,
  centerZ: number,
  halfSize: number,
  groundY: number,
  random: () => number,
  chance: number,
  pick: (random: () => number) => BlockId | null,
  groundSet: Set<BlockId>,
): void {
  for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
    for (let z = centerZ - halfSize; z <= centerZ + halfSize; z++) {
      if (random() > chance)
        continue
      if (!groundSet.has(getBlock(state, x, groundY - 1, z)))
        continue
      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      const blockId = pick(random)
      if (blockId === null)
        continue

      setBlock(state, x, groundY, z, blockId)
    }
  }
}

/** 從清單裡挑一個 */
export function pickOne<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)] ?? list[0]!
}
