import type { GardenDefinition } from './garden-layout'
import { createSeededRandom, fbm2D } from '../../utils/noise'
import { BlockId, isPassableBlock } from '../block/block-constants'
import { getBlock, setBlock } from '../world/world-access'
import {
  carveWater,
  DECK_MARGIN,
  fillBox,
  fillDisc,
  fillNoisyDisc,
  fillSquare,
  getNoisyDistance,
  paveDeck,
  pickOne,
  placeAcaciaTree,
  placeAspenTree,
  placeBonsaiPine,
  placeDeadTree,
  placeOakTree,
  placePineTree,
  placeRoofCap,
  placeStoneLantern,
  placeTorii,
  plantWithStack,
  rakeRipple,
  scatterOnGround,
  setDecoration,
} from './garden-kit'
import {
  CAVE_CHAMBER,
  CAVE_MOUTH,
  CAVE_TUNNEL,
  getDeckBlockY,
  getDeckGroundY,
  WATERFALL_POINT,
} from './garden-layout'

/**
 * 大箱庭的內容
 *
 * 每一座都是一整套聲音的視覺對應：聽起來像什麼，看起來就該像什麼。
 * 風聲那座得看得見會被吹動的東西，滴水那座得有一個把聲音關起來的空間。
 *
 * 高度的規矩全庭一致：
 * `deckY` 是甲板那一層方塊，頂面在 deckY + 0.5，也就是人站的高度；
 * `groundY` 是甲板上那一格空氣，所有立在甲板上的東西都從這裡往上長。
 * 要做水面就把 deckY 那一層換成水、deckY - 1 換成底床，
 * 水面才會與甲板齊平，而不是浮在上面一格
 */

const GRASS_SET = new Set([BlockId.GRASS])
const SAND_SET = new Set([BlockId.SAND])
const SNOW_SET = new Set([BlockId.SNOW])
const SOIL_SET = new Set([BlockId.GRASS, BlockId.DIRT, BlockId.CLAY])

/**
 * 枯山水
 *
 * 全庭最安靜的一座，也是唯一沒有植物當主角的一座。
 * 一片耙好的白沙、三組立石、角落一株修過的松，
 * 以及埋在石板底下的水琴窟——整座庭園只有那一滴水在響
 */
export function buildWheatGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-wheat')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.DIRT)

  /**
   * 麥子照壟種
   *
   * 隨機撒一片看起來是野地，不是田。田之所以是田，
   * 在於那些一行一行的壟——人來過、翻過土、照著間距把種子放下去。
   *
   * 壟沿著 X 走，每三格留一格空當作走道；
   * 邊界再用噪聲推一點，田埂才不會像用尺畫出來的
   */
  for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
    const isPath = ((offsetZ + inner) % 4) === 0
    if (isPath)
      continue

    for (let offsetX = -inner; offsetX <= inner; offsetX++) {
      const edgeNoise = getNoisyDistance(
        centerX + offsetX,
        centerZ + offsetZ,
        centerX,
        centerZ,
        0.22,
        1.6,
      )
      if (edgeNoise > inner - 0.5)
        continue

      const x = centerX + offsetX
      const z = centerZ + offsetZ
      if (getBlock(state, x, deckY, z) !== BlockId.DIRT)
        continue

      /** 兩成的麥抽了穗，高度與顏色都深一階，整片才不會像印出來的 */
      setBlock(state, x, groundY, z, random() < 0.2 ? BlockId.WHEAT_TALL : BlockId.WHEAT)
    }
  }

  /**
   * 穿過田的那條路
   *
   * 一條土路從南走到北，人得沿著它走進麥田中央。
   * 沒有這條路的話，整座木座只是一塊沒有入口的田
   */
  for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      setBlock(state, x, groundY, z, BlockId.AIR)
      setBlock(state, x, deckY, z, BlockId.GRAVEL)
    }
  }

  /**
   * 稻草人
   *
   * 一根柱子、一根橫桿、一顆草束當頭。
   * 麥田裡總得有一個站著的東西，眼睛才有地方落
   */
  const scarecrowX = centerX + 5
  const scarecrowZ = centerZ - 4
  for (let level = 0; level < 3; level++) {
    setBlock(state, scarecrowX, groundY + level, scarecrowZ, BlockId.BAMBOO_BLOCK)
  }
  setBlock(state, scarecrowX - 1, groundY + 2, scarecrowZ, BlockId.BAMBOO_BLOCK)
  setBlock(state, scarecrowX + 1, groundY + 2, scarecrowZ, BlockId.BAMBOO_BLOCK)
  setBlock(state, scarecrowX, groundY + 3, scarecrowZ, BlockId.HAY)

  /** 收割過後堆起來的幾捆草束，散在田邊 */
  for (const bale of [{ x: -7, z: 5 }, { x: -6, z: 7 }, { x: 7, z: 6 }]) {
    const x = centerX + bale.x
    const z = centerZ + bale.z
    setBlock(state, x, groundY, z, BlockId.AIR)
    setBlock(state, x, groundY, z, BlockId.HAY)
    if (random() < 0.6) {
      setBlock(state, x, groundY + 1, z, BlockId.HAY)
    }
  }

  /** 田邊立一盞燈，夜裡那片金色才不會整個沉進黑裡 */
  placeStoneLantern(state, centerX - 3, groundY, centerZ - 8)
  placeStoneLantern(state, centerX + 3, groundY, centerZ + 8)

  /** 麥田裡冒出來的野花，收割時被留下來的那幾株 */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.06, (pick) => (
    pick() < 0.5 ? BlockId.FLOWER_DANDELION : BlockId.FLOWER_VIOLA
  ), new Set([BlockId.DIRT]))
}

/**
 * 松籟林
 *
 * 風穿過針葉是一種連綿不斷的寬頻噪音，沒有起點也沒有終點。
 * 所以這一座要把樹種到密，讓人站在中間看不到對岸的木框，
 * 一時之間忘記自己只是站在一個三十三格見方的台子上
 */
export function buildForestGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-forest')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /** 一條石板小徑穿過林子，從木階口一路彎到對面 */
  for (let offset = -inner; offset <= inner; offset++) {
    const pathX = centerX + Math.round(Math.sin(offset * 0.18) * 3)
    setBlock(state, pathX, deckY, centerZ + offset, BlockId.STONE_TILE)
    setBlock(state, pathX + 1, deckY, centerZ + offset, BlockId.STONE_TILE)
  }

  /** 針葉樹：中間密、邊緣疏，林緣才會自然散開 */
  for (let attempt = 0; attempt < 110; attempt++) {
    const offsetX = Math.round((random() * 2 - 1) * inner)
    const offsetZ = Math.round((random() * 2 - 1) * inner)
    const distance = Math.hypot(offsetX, offsetZ)
    if (distance > inner - 1)
      continue
    if (random() < (distance / inner) * 0.8)
      continue

    placePineTree(state, centerX + offsetX, groundY, centerZ + offsetZ, 5 + Math.floor(random() * 5))
  }

  /** 幾棵闊葉樹混進去，一整片針葉會太整齊 */
  for (const spot of [{ x: -9, z: 6 }, { x: 8, z: -8 }, { x: 3, z: 11 }]) {
    placeOakTree(state, centerX + spot.x, groundY, centerZ + spot.z, 4 + Math.floor(random() * 3))
  }

  /** 兩根倒木，林子才有時間感。躺著的木頭要用對應朝向的方塊，年輪才在兩端 */
  for (let step = 0; step < 5; step++) {
    setDecoration(state, centerX - 11 + step, groundY, centerZ - 3, BlockId.DEAD_LOG_X)
  }
  for (let step = 0; step < 4; step++) {
    setDecoration(state, centerX + 9, groundY, centerZ + 4 + step, BlockId.DEAD_LOG_Z)
  }

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.34, (pick) => {
    const roll = pick()
    if (roll < 0.42)
      return BlockId.FOREST_LITTER
    if (roll < 0.66)
      return BlockId.FERN
    if (roll < 0.84)
      return BlockId.TALL_GRASS
    if (roll < 0.9)
      return BlockId.BUSH
    if (roll < 0.95)
      return BlockId.MUSHROOM
    return BlockId.BROWN_MUSHROOM
  }, GRASS_SET)

  placeStoneLantern(state, centerX - 5, groundY, centerZ + 13)
  placeStoneLantern(state, centerX + 6, groundY, centerZ - 12)
  placeTorii(state, centerX, groundY, centerZ + garden.halfSize - 1, true)
}

/**
 * 金葉苑
 *
 * 落葉的沙沙聲是乾的、粗的，跟針葉林那種濕潤的風聲完全不同。
 * 所以這一座刻意把樹種疏、地面鋪滿落葉，
 * 讓人看得出聲音是從一地的乾葉子上來的，而不是從樹梢
 */
export function buildAutumnGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-autumn')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /** 白楊種成疏林，兩種葉色交錯，秋色才不會是死板的一片橘 */
  for (let attempt = 0; attempt < 44; attempt++) {
    const offsetX = Math.round((random() * 2 - 1) * inner)
    const offsetZ = Math.round((random() * 2 - 1) * inner)
    if (Math.hypot(offsetX, offsetZ) > inner - 2)
      continue
    if (random() < 0.55)
      continue

    placeAspenTree(
      state,
      centerX + offsetX,
      groundY,
      centerZ + offsetZ,
      6 + Math.floor(random() * 4),
      random() < 0.5 ? BlockId.GOLD_LEAVES : BlockId.AMBER_LEAVES,
    )
  }

  /** 林間一小片耙好的白沙。滿眼金黃裡留一塊白，顏色才收得住 */
  fillNoisyDisc(state, centerX + 6, centerZ + 7, 4.4, deckY, BlockId.GARDEN_SAND, 1.2)
  rakeRipple(state, centerX + 6, centerZ + 7, deckY, 2, 4)

  /** 沙庭旁擺一張長凳與一盞紙燈，是專門坐下來聽落葉的地方 */
  for (let offset = -1; offset <= 1; offset++) {
    setBlock(state, centerX + 1, groundY, centerZ + 7 + offset, BlockId.WOOD_STAIRS_WEST)
  }
  setBlock(state, centerX + 1, groundY, centerZ + 10, BlockId.DARK_PLANKS)
  setBlock(state, centerX + 1, groundY + 1, centerZ + 10, BlockId.PAPER_LAMP)

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.5, (pick) => {
    const roll = pick()
    if (roll < 0.62)
      return BlockId.FALLEN_LEAVES
    if (roll < 0.78)
      return BlockId.DRY_GRASS
    if (roll < 0.9)
      return BlockId.DRY_SHRUB
    return BlockId.TALL_GRASS
  }, GRASS_SET)

  placeStoneLantern(state, centerX - 8, groundY, centerZ + 12)
  placeTorii(state, centerX - garden.halfSize + 1, groundY, centerZ, false)
}

/**
 * 雪稜丘
 *
 * 高處的風聽起來遠，是因為沒有東西可以反射它。
 * 所以這一座要把東西做少：一道岩稜、一窪凍住的水、兩三株貼著石頭長的矮松，
 * 剩下的全部留給雪
 */
export function buildAlpineGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-alpine')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.SNOW)

  /**
   * 岩稜
   *
   * 順著一條從西北往東南的斜線隆起，兩側陡落。
   * 對稱的錐體看起來是一座假山，有走向的稜線才像真的山
   */
  for (let offsetX = -inner; offsetX <= inner; offsetX++) {
    for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      /**
       * 稜線本身也要蜿蜒
       *
       * 只用「到直線的距離」算出來的是一道筆直的屋脊，一眼就看得出是公式。
       * 讓稜線的位置沿路被噪音推移，山才有轉折；
       * 高度再疊一層更細的噪音，坡面才不會是光滑的斜面
       */
      const ridgeShift = fbm2D(x * 0.09, z * 0.09, 3, 0.5) * 3.2
      const alongRidge = (offsetX + offsetZ) / Math.SQRT2
      const acrossRidge = Math.abs((offsetX - offsetZ) / Math.SQRT2 - ridgeShift)
      const height = Math.round(
        9 - acrossRidge * 1.5 - Math.abs(alongRidge) * 0.32
        + fbm2D(x * 0.28, z * 0.28, 3, 0.5) * 1.6,
      )
      if (height <= 0)
        continue

      for (let level = 1; level <= height; level++) {
        setBlock(state, x, deckY + level, z, BlockId.STONE)
      }
      /** 高處積雪、低處露出岩，一座山才有兩種顏色。雪線也帶一點抖動 */
      const snowLine = 4 + fbm2D(x * 0.4, z * 0.4, 2, 0.5) * 1.2
      setBlock(state, x, deckY + height, z, height >= snowLine ? BlockId.SNOW : BlockId.COBBLESTONE)

      /**
       * 雪線底下那一帶撒薄雪
       *
       * 整格的雪與裸岩直接相接，會在山腰上切出一條看得見的界線——
       * 而真正的雪線是一段，不是一條。雪線以下兩格內鋪一層薄雪，
       * 岩石的顏色從邊緣透出來，那一段就化開了。
       *
       * 用噪聲決定哪一格有而不是抽亂數：抽亂數會挪動這座箱庭
       * 後面所有的隨機序列，矮松與碎石會跟著全部重排
       */
      const isDusted = height < snowLine
        && height > snowLine - 2.4
        && fbm2D(x * 0.55, z * 0.55, 2, 0.5) > 0.42
      if (isDusted) {
        setBlock(state, x, deckY + height + 1, z, BlockId.SNOW_LAYER)
      }
    }
  }

  /** 山腳下一窪凍住的融雪池，中間的冰還是半透明的 */
  fillNoisyDisc(state, centerX - 9, centerZ + 9, 3.6, deckY, BlockId.PACKED_ICE, 1.4)
  fillNoisyDisc(state, centerX - 9, centerZ + 9, 2.2, deckY, BlockId.ICE, 1)

  /** 貼著岩石長的矮松，被風壓得全部歪向同一邊 */
  placeBonsaiPine(state, centerX - 12, groundY, centerZ - 4, 1, 0)
  placeBonsaiPine(state, centerX + 4, groundY, centerZ + 13, 0, 1)
  placeBonsaiPine(state, centerX + 13, groundY, centerZ - 9, -1, 0)

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.08, (pick) => (
    pick() < 0.6 ? BlockId.STONE_PLANT : BlockId.DRY_SHRUB
  ), SNOW_SET)

  placeStoneLantern(state, centerX - 13, groundY, centerZ + 13)
  placeStoneLantern(state, centerX - 13, groundY, centerZ - 13)
}

/**
 * 遣水
 *
 * 水聲是這座禪庭裡唯一沒有縫的聲音：不像鳥叫有起訖，也不像蛙鳴會停。
 * 所以水道要貫穿整座木座，從一頭進、另一頭出，
 * 讓人走到哪裡都逃不掉那個聲音
 */
export function buildRiverGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-river')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /** 一道彎的水道，貫穿南北 */
  /**
   * 水道的蜿蜒
   *
   * 正弦波的彎是等距等幅的，看久了會發現它在重複。
   * 改用噪音之後，這一段彎得急、下一段幾乎是直的，才像天然的河
   */
  const getChannelX = (offsetZ: number) => (
    centerX + Math.round(fbm2D(centerX * 0.05, (centerZ + offsetZ) * 0.09, 3, 0.5) * 6)
  )

  for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
    const channelX = getChannelX(offsetZ)
    for (let width = -2; width <= 2; width++) {
      const x = channelX + width
      const z = centerZ + offsetZ

      if (Math.abs(width) === 2) {
        /** 兩側的礫石灘，水與草之間得有一段過渡 */
        setBlock(state, x, deckY, z, BlockId.GRAVEL)
        continue
      }

      carveWater(state, x, deckY, z, 1, BlockId.GRAVEL)
    }
  }

  /**
   * 瀑布
   *
   * 落差是水聲唯一能拉開層次的方式：平流是嘶嘶，落下才是轟。
   * 所以水道的上游要墊起一段岩壁，讓水從上面翻下來
   */
  const fallX = WATERFALL_POINT.x
  const fallZ = WATERFALL_POINT.z
  const fallHeight = 6

  /**
   * 岩體
   *
   * 原本是一個 fillBox 疊出來的長方體，六個面全是直角，
   * 遠看就是一塊立在草地上的黑磚。
   * 改成從瀑布口往外遞減的丘體，輪廓與高度都吃噪音：
   * 靠水口的地方最高，往兩側與背面自然塌下去
   */
  for (let offsetX = -5; offsetX <= 5; offsetX++) {
    for (let offsetZ = -6; offsetZ <= 1; offsetZ++) {
      const x = fallX + offsetX
      const z = fallZ + offsetZ
      const distance = getNoisyDistance(x, z, fallX, fallZ - 2, 0.19, 1.9)
      const ratio = Math.max(0, distance) / 5.4
      const height = Math.round(
        fallHeight * (1 - ratio * ratio) + fbm2D(x * 0.3, z * 0.3, 3, 0.5) * 1.5,
      )
      if (height <= 0)
        continue

      for (let level = 1; level <= height; level++) {
        setBlock(
          state,
          x,
          deckY + level,
          z,
          random() < 0.22 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE,
        )
      }
    }
  }

  /**
   * 水口
   *
   * 從岩體正面挖一道槽讓水翻下來。槽要挖到底，
   * 否則水會卡在半空中的某一格，看起來像從石頭裡滲出來
   */
  for (let level = 1; level <= fallHeight; level++) {
    fillBox(state, fallX - 1, deckY + level, fallZ - 1, fallX + 1, deckY + level, fallZ + 1, BlockId.AIR)
    fillBox(state, fallX - 1, deckY + level, fallZ, fallX + 1, deckY + level, fallZ, BlockId.FLOWING_WATER)
  }
  /**
   * 岩體頂上的蓄水池，水從這裡溢進水口
   *
   * 這一段不能直接鋪一片水就算了。岩體的高度是吃噪音的，
   * 每一柱高低不一；水面卻是一個固定的高度，
   * 於是低於水面的那幾柱，水就浮在半空中，底下什麼都沒有。
   *
   * 所以要真的「挖一個池子」：池底墊到水面下一格、池壁補到水面高度，
   * 兩者都是逐柱處理的，岩體再怎麼起伏都接得住
   */
  const basinX = fallX
  const basinZ = fallZ - 2
  const basinTopY = deckY + fallHeight
  const basinRadius = 2.6
  /** 池壁往外再算一圈，水才不會從缺口流出去 */
  const wallRadius = basinRadius + 1.6

  for (let offsetX = -4; offsetX <= 4; offsetX++) {
    for (let offsetZ = -4; offsetZ <= 4; offsetZ++) {
      const x = basinX + offsetX
      const z = basinZ + offsetZ
      const distance = getNoisyDistance(x, z, basinX, basinZ, 0.34, 0.8)
      if (distance > wallRadius)
        continue

      /** 水口那一道槽要留著，池水正是從那裡翻下去的 */
      const isSpout = Math.abs(x - fallX) <= 1 && z >= fallZ - 1
      if (isSpout)
        continue

      const isBasin = distance <= basinRadius
      /** 池底比水面矮一格，池壁與水面齊高 */
      const solidTopY = isBasin ? basinTopY - 1 : basinTopY

      for (let y = deckY + 1; y <= solidTopY; y++) {
        if (getBlock(state, x, y, z) !== BlockId.AIR)
          continue

        setBlock(state, x, y, z, random() < 0.22 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE)
      }

      if (isBasin) {
        /** 池子上方要淨空，否則水會被岩石壓在底下 */
        for (let y = basinTopY; y <= basinTopY + 3; y++) {
          setBlock(state, x, y, z, BlockId.AIR)
        }
        setBlock(state, x, basinTopY, z, BlockId.WATER)
      }
    }
  }

  /** 瀑布底下的水潭，直接接進水道 */
  fillNoisyDisc(state, fallX, fallZ + 3, 3.4, deckY - 1, BlockId.GRAVEL, 1.2)
  fillNoisyDisc(state, fallX, fallZ + 3, 3.4, deckY, BlockId.WATER, 1.2)

  /**
   * 木橋
   *
   * 橋面用半磚，比水面高半格，走上去只是輕輕一階。
   * 欄杆不能直接架在半磚上——半磚只佔下半格，欄杆會浮著半格；
   * 也不能懸在水道上方，底下什麼都沒有。
   * 所以兩側各先立一排實心的橋樑，欄杆再站上去
   */
  const bridgeZ = centerZ + 4
  const bridgeX = getChannelX(4)
  for (let offset = -4; offset <= 4; offset++) {
    setBlock(state, bridgeX + offset, deckY + 1, bridgeZ, BlockId.WOOD_SLAB)
    setBlock(state, bridgeX + offset, deckY + 1, bridgeZ + 1, BlockId.WOOD_SLAB)

    for (const railZ of [bridgeZ - 1, bridgeZ + 2]) {
      setBlock(state, bridgeX + offset, deckY + 1, railZ, BlockId.PLANKS)
      setBlock(state, bridgeX + offset, deckY + 2, railZ, BlockId.FENCE)
    }
  }

  /**
   * 鹿威（添水）
   *
   * 竹管盛滿水就翻下去敲在石頭上，那一聲「叩」是日式庭園的招牌。
   * 這裡只做出它的樣子，聲音交給音景
   */
  setBlock(state, centerX + 10, groundY, centerZ - 6, BlockId.STONE_TILE)
  setBlock(state, centerX + 10, groundY + 1, centerZ - 6, BlockId.BAMBOO_BLOCK)
  setBlock(state, centerX + 10, groundY + 2, centerZ - 6, BlockId.BAMBOO_BLOCK)
  setBlock(state, centerX + 11, groundY + 2, centerZ - 6, BlockId.BAMBOO_BLOCK)

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.28, (pick) => {
    const roll = pick()
    if (roll < 0.4)
      return BlockId.FERN
    if (roll < 0.68)
      return BlockId.TALL_GRASS
    if (roll < 0.84)
      return BlockId.PAPYRUS
    if (roll < 0.94)
      return BlockId.CURLY_PLANT
    return BlockId.FLOWER_VIOLA
  }, GRASS_SET)

  /** 水面上撒幾片睡蓮 */
  for (let attempt = 0; attempt < 26; attempt++) {
    const offsetZ = Math.round((random() * 2 - 1) * inner)
    setDecoration(
      state,
      getChannelX(offsetZ) + Math.round(random() * 2 - 1),
      groundY,
      centerZ + offsetZ,
      BlockId.LILY_PAD,
    )
  }

  placeOakTree(state, centerX + 12, groundY, centerZ + 9, 5)
  placeOakTree(state, centerX - 13, groundY, centerZ + 11, 4)
  placeStoneLantern(state, centerX + 9, groundY, centerZ + 12)
}

/**
 * 潮汐磯
 *
 * 浪聲跟溪流最大的差別在於它有呼吸：漲一次、退一次。
 * 一片靜止的水做不出那個感覺，所以這一座把重點放在「岸」——
 * 一道從水裡一路乾到腳邊的沙灘，讓人看得出潮水來過又退了
 */
export function buildCoastGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-coast')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.SAND)

  /**
   * 水槽
   *
   * 木座的南半邊挖成水池，岸線是彎的——
   * 直的岸線一看就是切出來的
   */
  for (let offsetX = -inner; offsetX <= inner; offsetX++) {
    /**
     * 岸線
     *
     * 原本用一條正弦波，週期一眼就看得出來，像用尺畫的波浪。
     * 換成分形噪音之後有寬有窄、有凸有凹，才像被潮水磨出來的
     */
    const shoreLine = 3 + fbm2D((centerX + offsetX) * 0.13, centerZ * 0.13, 4, 0.5) * 4.5

    for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
      if (offsetZ < shoreLine)
        continue

      /**
       * 深度只到一格
       *
       * 世界的地面是一片鋪在 y = 6.5 的網格，比甲板低一格。
       * 池子若挖到兩格深，池底會沉到那片地面底下，
       * 隔著水看到的就不是沙底而是那片地面，池子看起來反而變淺了
       */
      const isDeep = offsetZ - shoreLine > 4
      const isCoral = isDeep && random() < 0.32
      carveWater(
        state,
        centerX + offsetX,
        deckY,
        centerZ + offsetZ,
        1,
        isCoral
          ? pickOne(random, [BlockId.CORAL_ORANGE, BlockId.CORAL_BROWN, BlockId.CORAL_SKELETON])
          : BlockId.SAND,
      )
    }
  }

  /** 被海風壓扁的相思樹，樹冠攤成一片 */
  placeAcaciaTree(state, centerX - 9, groundY, centerZ - 9, 4)
  placeAcaciaTree(state, centerX + 7, groundY, centerZ - 11, 5)

  /** 沙灘上的漂流木，順著岸線躺著 */
  for (let step = 0; step < 6; step++) {
    setDecoration(state, centerX - 4 + step, groundY, centerZ - 6, BlockId.DEAD_LOG_X)
  }

  /**
   * 一艘擱淺的小舟
   *
   * 船身挖空之後，中央那一格變成空氣——桅杆原本就立在那裡，
   * 底下沒有東西撐著，於是浮在船艙上方。
   * 挖空之後要把桅杆座那一格補回去，杆子才踩得到甲板
   */
  fillBox(state, centerX + 8, groundY, centerZ - 3, centerX + 12, groundY, centerZ - 1, BlockId.DARK_PLANKS)
  fillBox(state, centerX + 9, groundY, centerZ - 2, centerX + 11, groundY, centerZ - 2, BlockId.AIR)
  setBlock(state, centerX + 10, groundY, centerZ - 2, BlockId.DARK_PLANKS)
  setBlock(state, centerX + 10, groundY + 1, centerZ - 2, BlockId.FENCE)
  setBlock(state, centerX + 10, groundY + 2, centerZ - 2, BlockId.FENCE)

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.14, (pick) => {
    const roll = pick()
    if (roll < 0.45)
      return BlockId.DRY_SHRUB
    if (roll < 0.7)
      return BlockId.DRY_GRASS
    if (roll < 0.88)
      return BlockId.PAPYRUS
    return BlockId.STONE_PLANT
  }, SAND_SET)

  placeStoneLantern(state, centerX - 12, groundY, centerZ - 12)
  placeTorii(state, centerX, groundY, centerZ - 13, true, 3, 5)
}

/**
 * 蛙聲澤
 *
 * 蛙鳴是這座禪庭裡唯一會「對話」的聲音：一隻叫完換另一隻。
 * 所以水面要夠寬、夠散，讓聲音有辦法從左邊傳到右邊，
 * 中間再架一條木棧道，人才有辦法站進去聽
 */
export function buildSwampGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-swamp')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.DIRT)

  /** 大半是淺水，零星幾塊泥灘露出水面 */
  for (let offsetX = -inner; offsetX <= inner; offsetX++) {
    for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
      /**
       * 泥灘的邊界
       *
       * 原本用兩道正弦相乘，結果是一張規則的棋盤，泥灘一塊一塊等距排開。
       * 分形噪音才會有大有小、有連有斷
       */
      const landRatio = fbm2D((centerX + offsetX) * 0.15, (centerZ + offsetZ) * 0.15, 4, 0.5)
      if (landRatio > 0.18)
        continue

      carveWater(state, centerX + offsetX, deckY, centerZ + offsetZ, 1, BlockId.CLAY)
    }
  }

  /**
   * 木棧道
   *
   * 扶手只做一側，另一側才看得出水有多寬。
   * 欄杆底下要先打一根木樁：直接站在水面上會整根浮著，
   * 疊在半磚的橋面上則會浮半格
   */
  for (let offset = -inner; offset <= inner; offset++) {
    setBlock(state, centerX + offset, deckY + 1, centerZ, BlockId.WOOD_SLAB)
    setBlock(state, centerX + offset, deckY + 1, centerZ + 1, BlockId.WOOD_SLAB)
    if (offset % 3 === 0) {
      setBlock(state, centerX + offset, deckY + 1, centerZ - 1, BlockId.PLANKS)
      setBlock(state, centerX + offset, deckY + 2, centerZ - 1, BlockId.FENCE)
    }
  }

  /** 棧道中段一座歇腳的平台，站在水中央聽四面的蛙 */
  fillBox(state, centerX - 2, deckY + 1, centerZ + 4, centerX + 2, deckY + 1, centerZ + 7, BlockId.WOOD_SLAB)
  /** 平台盡頭的欄杆與燈，一樣先打一排實心的木樁 */
  for (let offset = -2; offset <= 2; offset++) {
    setBlock(state, centerX + offset, deckY + 1, centerZ + 8, BlockId.PLANKS)
    setBlock(state, centerX + offset, deckY + 2, centerZ + 8, BlockId.FENCE)
  }
  setBlock(state, centerX + 3, deckY + 1, centerZ + 6, BlockId.PLANKS)
  setBlock(state, centerX + 3, deckY + 2, centerZ + 6, BlockId.PAPER_LAMP)

  /** 枯木從水裡直接站起來，是沼澤唯一的立面 */
  for (let attempt = 0; attempt < 16; attempt++) {
    const treeX = centerX + Math.round((random() * 2 - 1) * inner)
    const treeZ = centerZ + Math.round((random() * 2 - 1) * inner)
    /** 棧道那兩排不要種，會擋路 */
    if (Math.abs(treeZ - centerZ) < 3)
      continue

    placeDeadTree(state, treeX, groundY, treeZ, 4 + Math.floor(random() * 4))
  }

  /** 睡蓮與蘆葦鋪滿水面 */
  for (let attempt = 0; attempt < 220; attempt++) {
    const x = centerX + Math.round((random() * 2 - 1) * inner)
    const z = centerZ + Math.round((random() * 2 - 1) * inner)
    if (getBlock(state, x, deckY, z) !== BlockId.WATER)
      continue

    /** 睡蓮貼著水面就好，蘆葦則要從水裡抽高出來 */
    if (random() < 0.62) {
      setDecoration(state, x, groundY, z, BlockId.LILY_PAD)
      continue
    }

    plantWithStack(state, x, groundY, z, BlockId.PAPYRUS, random)
  }

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.3, (pick) => {
    const roll = pick()
    if (roll < 0.4)
      return BlockId.JUNGLE_GRASS
    if (roll < 0.7)
      return BlockId.PAPYRUS
    if (roll < 0.86)
      return BlockId.BROWN_MUSHROOM
    return BlockId.CURLY_PLANT
  }, SOIL_SET)
}

/**
 * 市井坊
 *
 * 整座禪庭只有這裡聽得到人。市集的嗡嗡、遠處的鐘、家畜偶爾一聲，
 * 三種聲音的共同點是「有意圖」——那是這一座跟其他十六座真正的差別
 */
export function buildVillageGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-village')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /** 中央一塊石板廣場，人聲從這裡出來 */
  fillDisc(state, centerX, centerZ, 7.5, deckY, BlockId.STONE_TILE)

  /** 三間小屋圍著廣場，門都朝內 */
  placeHut(state, centerX - 10, groundY, centerZ - 8, 5, 4)
  placeHut(state, centerX + 8, groundY, centerZ - 9, 4, 4)
  placeHut(state, centerX + 9, groundY, centerZ + 8, 5, 5)

  /** 一口井，廣場的中心 */
  fillSquare(state, centerX, centerZ, 1, groundY, BlockId.COBBLESTONE)
  carveWater(state, centerX, deckY, centerZ, 1, BlockId.COBBLESTONE)
  setBlock(state, centerX, groundY, centerZ, BlockId.AIR)
  /**
   * 井上的頂棚
   *
   * 兩根柱子要一路頂到屋頂，屋頂才有東西撐著。
   * 原本柱子只到 groundY + 2、屋頂卻擺在 groundY + 3 的正中央，
   * 位置既高了一格、水平方向又跟柱子錯開，於是整片浮在半空
   */
  for (const corner of [{ x: -1, z: -1 }, { x: 1, z: 1 }]) {
    for (let level = 1; level <= 3; level++) {
      setBlock(state, centerX + corner.x, groundY + level, centerZ + corner.z, BlockId.FENCE)
    }
  }
  fillSquare(state, centerX, centerZ, 1, groundY + 4, BlockId.DARK_WOOD_SLAB)
  /** 從頂棚垂下來的一段繩子 */
  setBlock(state, centerX, groundY + 3, centerZ, BlockId.FENCE)

  /**
   * 鐘樓
   *
   * 鐘聲要傳得遠，樓就得比屋頂高。
   * 四根柱子撐一片頂，中間吊一口鐘
   */
  const towerX = centerX - 9
  const towerZ = centerZ + 9
  for (const corner of [{ x: -1, z: -1 }, { x: -1, z: 1 }, { x: 1, z: -1 }, { x: 1, z: 1 }]) {
    for (let level = 0; level < 7; level++) {
      setBlock(state, towerX + corner.x, groundY + level, towerZ + corner.z, BlockId.DARK_PLANKS)
    }
  }
  placeRoofCap(state, towerX, groundY + 7, towerZ, 2, BlockId.DARK_WOOD_SLAB, BlockId.DARK_PLANKS)
  fillSquare(state, towerX, towerZ, 1, groundY + 8, BlockId.DARK_PLANKS)
  setBlock(state, towerX, groundY + 5, towerZ, BlockId.BRICKS)
  setBlock(state, towerX, groundY + 4, towerZ, BlockId.BRICKS)

  /** 市集的攤子與雜物。人住過的地方才會亂 */
  const propList: { x: number; z: number; blockId: BlockId }[] = [
    { x: -4, z: 3, blockId: BlockId.BARREL },
    { x: -3, z: 4, blockId: BlockId.CRATE },
    { x: -4, z: 5, blockId: BlockId.CRATE },
    { x: 4, z: -3, blockId: BlockId.WORKBENCH },
    { x: 5, z: -3, blockId: BlockId.CHEST },
    { x: 5, z: 4, blockId: BlockId.FURNACE },
    { x: 6, z: 4, blockId: BlockId.CAULDRON },
    { x: -6, z: -3, blockId: BlockId.HAY },
    { x: -6, z: -4, blockId: BlockId.HAY },
    { x: 3, z: 6, blockId: BlockId.BARREL },
  ]
  for (const prop of propList) {
    setBlock(state, centerX + prop.x, groundY, centerZ + prop.z, prop.blockId)
  }

  /** 一圈掛著紙燈的柱子，繞著廣場站一輪 */
  for (let step = 0; step < 8; step++) {
    const angle = (step / 8) * Math.PI * 2
    const lampX = centerX + Math.round(Math.cos(angle) * 10)
    const lampZ = centerZ + Math.round(Math.sin(angle) * 10)
    setDecoration(state, lampX, groundY, lampZ, BlockId.DARK_PLANKS)
    setDecoration(state, lampX, groundY + 1, lampZ, BlockId.DARK_PLANKS)
    setDecoration(state, lampX, groundY + 2, lampZ, BlockId.PAPER_LAMP)
  }

  /** 屋邊的花盆 */
  for (const spot of [{ x: -8, z: -3 }, { x: 6, z: -6 }, { x: 12, z: 5 }]) {
    setDecoration(state, centerX + spot.x, groundY, centerZ + spot.z, BlockId.FLOWER_POT)
  }

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.16, (pick) => {
    const roll = pick()
    if (roll < 0.4)
      return BlockId.TALL_GRASS
    if (roll < 0.65)
      return BlockId.FLOWER_TULIP
    if (roll < 0.85)
      return BlockId.FLOWER_DANDELION
    return BlockId.FLOWER_VIOLA
  }, GRASS_SET)
}

/**
 * 一間小屋
 *
 * 木牆、玻璃窗、榻榻米地板，屋頂一層比一層小疊上去。
 * 門開在南面，人走得進去
 */
function placeHut(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
): void {
  const wallHeight = 4

  /** 地板鋪榻榻米，四周留一圈深色木當框 */
  fillBox(state, x - halfWidth, groundY - 1, z - halfDepth, x + halfWidth, groundY - 1, z + halfDepth, BlockId.DARK_PLANKS)
  fillBox(state, x - halfWidth + 1, groundY - 1, z - halfDepth + 1, x + halfWidth - 1, groundY - 1, z + halfDepth - 1, BlockId.TATAMI)

  for (let level = 0; level < wallHeight; level++) {
    for (let offsetX = -halfWidth; offsetX <= halfWidth; offsetX++) {
      for (let offsetZ = -halfDepth; offsetZ <= halfDepth; offsetZ++) {
        if (Math.abs(offsetX) !== halfWidth && Math.abs(offsetZ) !== halfDepth)
          continue

        /** 南面正中央挖出一道門 */
        if (offsetZ === halfDepth && Math.abs(offsetX) <= 1 && level < 3) {
          setBlock(state, x + offsetX, groundY + level, z + offsetZ, BlockId.AIR)
          continue
        }

        /** 腰部開一排窗，屋子才不會像個木箱 */
        const isWindow = level === 2 && Math.abs(offsetX) % 2 === 0 && Math.abs(offsetZ) % 2 === 0
        setBlock(
          state,
          x + offsetX,
          groundY + level,
          z + offsetZ,
          isWindow ? BlockId.GLASS_PANE : BlockId.PLANKS,
        )
      }
    }
  }

  /** 障子門立在門口內側，看得出這是一間和式的屋子 */
  setBlock(state, x, groundY, z + halfDepth - 1, BlockId.PAPER_DOOR)

  /**
   * 出簷比屋身寬一格
   *
   * 四邊各用一種朝向的階梯：靠背朝內、薄的那一側朝外，
   * 屋簷才會是往外收薄的斜面，而不是一圈平板
   */
  const eaveY = groundY + wallHeight
  for (let offsetX = -halfWidth - 1; offsetX <= halfWidth + 1; offsetX++) {
    for (let offsetZ = -halfDepth - 1; offsetZ <= halfDepth + 1; offsetZ++) {
      const isNorthEdge = offsetZ === -halfDepth - 1
      const isSouthEdge = offsetZ === halfDepth + 1
      const isWestEdge = offsetX === -halfWidth - 1
      const isEastEdge = offsetX === halfWidth + 1

      let blockId = BlockId.DARK_PLANKS
      if (isNorthEdge)
        blockId = BlockId.DARK_STAIRS_SOUTH
      else if (isSouthEdge)
        blockId = BlockId.DARK_STAIRS_NORTH
      else if (isWestEdge)
        blockId = BlockId.DARK_STAIRS_EAST
      else if (isEastEdge)
        blockId = BlockId.DARK_STAIRS_WEST

      setBlock(state, x + offsetX, eaveY, z + offsetZ, blockId)
    }
  }
  for (let level = 0; level <= Math.min(halfWidth, halfDepth); level++) {
    const width = halfWidth - level
    const depth = halfDepth - level
    if (width < 0 || depth < 0)
      break

    fillBox(
      state,
      x - width,
      groundY + wallHeight + level + 1,
      z - depth,
      x + width,
      groundY + wallHeight + level + 1,
      z + depth,
      BlockId.DARK_PLANKS,
    )
  }

  /** 屋裡點一盞燈，從門口望進去看得到有人住 */
  setBlock(state, x - halfWidth + 1, groundY + 2, z - halfDepth + 1, BlockId.PAPER_LAMP)
  setBlock(state, x + halfWidth - 1, groundY, z - halfDepth + 1, BlockId.BOOKSHELF)
}

/**
 * 岩響窟
 *
 * 滴水聲本身很小，真正在響的是那個空間。
 * 所以這一座的主角不是水，是「把聲音關起來的那塊岩」——
 * 木座上堆一座中空的山，人得低著頭走進去才聽得到裡面的迴響
 */
export function buildCaveGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-cave')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRAVEL)

  /**
   * 岩體
   *
   * 用拋物面當外形：中間高、邊緣自然收到零，
   * 不用另外處理山腳，也不會出現一圈突兀的斷崖。
   * 高度要夠——漫遊控制器是靠「頭頂疊了幾層實心方塊」判斷有沒有進洞的，
   * 岩層太薄，走到最裡面世界也不會暗下來
   */
  const rockRadius = 15
  const rockHeight = 22
  for (let offsetX = -inner; offsetX <= inner; offsetX++) {
    for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      /** 山腳的輪廓吃一層低頻噪音，山才不會是一顆規則的饅頭 */
      const distance = getNoisyDistance(x, z, centerX, centerZ, 0.11, 2.6)
      if (distance > rockRadius)
        continue

      const ratio = Math.max(0, distance) / rockRadius
      const height = Math.round(
        rockHeight * (1 - ratio * ratio) + fbm2D(x * 0.24, z * 0.24, 3, 0.5) * 2.2,
      )
      if (height <= 0)
        continue

      for (let level = 1; level <= height; level++) {
        setBlock(state, x, deckY + level, z, random() < 0.12 ? BlockId.COBBLESTONE : BlockId.STONE)
      }
      /** 表層長一點苔，岩才不會是一塊乾淨的灰 */
      if (random() < 0.2) {
        setBlock(state, x, deckY + height, z, BlockId.MOSSY_COBBLESTONE)
      }
    }
  }

  /**
   * 通道
   *
   * 從朝向禪庭中心那一側的洞口斜斜穿進山腹。
   * 淨高只有三格，得低著頭走；走到底空間忽然打開，那一下才是效果
   */
  /**
   * 通道的高低起伏，分成兩趟做
   *
   * 這件事先前失敗了兩次，兩次都是同一個原因：相鄰兩步挖的是重疊的 3×3，
   * 一邊算高度一邊挖的話，後一步的地板會填掉前一步剛挖開的空氣，
   * 一路下坡的路段就這樣被自己砌死。
   *
   * 所以拆成兩趟：第一趟只算出整條路徑的剖面（每一步的座標與地面高度），
   * 第二趟先把所有地板鋪完、再把所有空間挖完。
   * 挖是最後一道而且一次做完，沒有任何回填能蓋掉它
   */
  const pathPointList = [
    /**
     * 只往上，不往下
     *
     * 往下挖會穿過木座、露出底下那層白沙——與地獄谷同一個問題。
     * 那裡可以靠往上堆谷壁繞開，通道不行：通道是包在山體裡的，
     * 只能挖不能堆。
     *
     * 所以起伏全部往上長，最多一格。幅度雖小但夠用：
     * 看不見前面的時候，腳下抬起一格與踏平一格的差別是感覺得到的
     */
    { x: CAVE_MOUTH.x, z: CAVE_MOUTH.z, rise: 0 },
    { x: centerX + 7, z: centerZ + 7, rise: 1 },
    { x: CAVE_TUNNEL.x, z: CAVE_TUNNEL.z, rise: 0 },
    { x: centerX + 1, z: centerZ - 1, rise: 1 },
    { x: CAVE_CHAMBER.x, z: CAVE_CHAMBER.z, rise: 0 },
  ]

  /** 第一趟：算出剖面，落差夾在一格以內，走得通是結構上的保證 */
  const tunnelStepList: { x: number; z: number; floorY: number }[] = []
  /** 走過幾步，噪聲照這個取才會沿路徑連續 */
  let travelled = 0

  for (let index = 0; index < pathPointList.length - 1; index++) {
    const start = pathPointList[index]!
    const end = pathPointList[index + 1]!
    const stepCount = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.z - start.z)) * 2)

    for (let step = 0; step <= stepCount; step++) {
      const ratio = step / stepCount
      const x = Math.round(start.x + (end.x - start.x) * ratio)
      const z = Math.round(start.z + (end.z - start.z) * ratio)
      /**
       * 高度沿路徑取，不是沿座標取
       *
       * 照 x/z 取噪聲的話，相鄰兩步的座標可能同時差一格，
       * 取樣出來的值跳來跳去——夾成 0 與 1 之後，不是整條變平
       * 就是每兩格抖一次。兩種都不是「起伏」。
       *
       * 改成沿著走過的距離取：同一段路上的取樣點是連續的，
       * 抬起來的那幾格於是連成一段緩坡，而不是散在路上的門檻
       */
      travelled += 1
      const slope = start.rise + (end.rise - start.rise) * ratio
      const wave = fbm2D(travelled * 0.13, 0, 2, 0.5)
      /** 只往上一格。往下會挖穿木座露出白沙，那是通道唯一不能做的事 */
      const floorY = deckY + (slope + (wave - 0.5) * 1.6 > 0.5 ? 1 : 0)

      tunnelStepList.push({ x, z, floorY })
    }
  }

  /**
   * 第二趟：先把每一格 column 的高度定下來，再一次鋪、一次挖
   *
   * 不能照著步驟一格一格處理。相鄰兩步挖的是重疊的 3×3——
   * 抬高的那一步剛鋪好地板，隔壁那步（比較低）的挖掘就把它挖掉了，
   * 整條通道於是被壓回同一個高度。先前改成兩趟只解決了一半：
   * 填不會蓋掉挖，但挖會蓋掉填。
   *
   * 所以每一格 column 只能有一個高度，取覆蓋到它的所有步驟裡最高的那個。
   * 高度定死之後鋪與挖各做一次，兩者永遠對得起來
   */
  const tunnelFloorMap = new Map<string, number>()
  for (const tunnelStep of tunnelStepList) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const key = `${tunnelStep.x + offsetX},${tunnelStep.z + offsetZ}`
        tunnelFloorMap.set(key, Math.max(tunnelFloorMap.get(key) ?? 0, tunnelStep.floorY))
      }
    }
  }

  for (const [key, floorY] of tunnelFloorMap) {
    const [x, z] = key.split(',').map(Number) as [number, number]
    setBlock(state, x, floorY, z, BlockId.STONE)
  }
  for (const [key, floorY] of tunnelFloorMap) {
    const [x, z] = key.split(',').map(Number) as [number, number]
    fillBox(state, x, floorY + 1, z, x, floorY + 3, z, BlockId.AIR)
  }
  /** 洞室：走到底忽然開闊，頂上還有六格高 */
  for (let offsetX = -6; offsetX <= 6; offsetX++) {
    for (let offsetZ = -6; offsetZ <= 6; offsetZ++) {
      const distance = Math.hypot(offsetX, offsetZ)
      if (distance > 6)
        continue

      fillBox(
        state,
        CAVE_CHAMBER.x + offsetX,
        deckY + 1,
        CAVE_CHAMBER.z + offsetZ,
        CAVE_CHAMBER.x + offsetX,
        deckY + Math.round(6 - distance * 0.45),
        CAVE_CHAMBER.z + offsetZ,
        BlockId.AIR,
      )
    }
  }

  /** 洞室底下一池地底湖，水面與洞底齊平，滴水落進去才有那個殘響 */
  for (let offsetX = -4; offsetX <= 4; offsetX++) {
    for (let offsetZ = -4; offsetZ <= 4; offsetZ++) {
      if (Math.hypot(offsetX, offsetZ) > 3.6)
        continue

      carveWater(state, CAVE_CHAMBER.x + offsetX, deckY, CAVE_CHAMBER.z + offsetZ, 1, BlockId.STONE)
    }
  }

  /** 石筍從地上長起來 */
  for (let attempt = 0; attempt < 26; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 4 + random() * 2
    const x = CAVE_CHAMBER.x + Math.round(Math.cos(angle) * radius)
    const z = CAVE_CHAMBER.z + Math.round(Math.sin(angle) * radius)

    for (let level = 1; level <= 1 + Math.floor(random() * 3); level++) {
      setDecoration(state, x, deckY + level, z, BlockId.COBBLESTONE)
    }
  }

  /** 岩壁上的礦脈。越深越可能是好礦，鑽石只在最裡面 */
  const oreList = [BlockId.COAL_ORE, BlockId.IRON_ORE, BlockId.COPPER_ORE, BlockId.GOLD_ORE, BlockId.DIAMOND_ORE]
  for (let attempt = 0; attempt < 120; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 5 + random() * 4
    const x = CAVE_CHAMBER.x + Math.round(Math.cos(angle) * radius)
    const z = CAVE_CHAMBER.z + Math.round(Math.sin(angle) * radius)
    const y = deckY + 1 + Math.floor(random() * 6)
    if (getBlock(state, x, y, z) !== BlockId.STONE)
      continue

    const depthRatio = random() * random()
    setBlock(state, x, y, z, oreList[Math.floor(depthRatio * oreList.length)] ?? BlockId.COAL_ORE)
  }

  /**
   * 洞室最裡側嵌兩塊鑽石
   *
   * 交給機率的話它幾乎不會出現，那等於白做一種方塊。
   * 走到最深處抬頭看見兩點微光，是這座箱庭唯一的獎勵
   */
  let diamondCount = 0
  for (let attempt = 0; attempt < 200 && diamondCount < 2; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 4.5 + random() * 3
    const x = CAVE_CHAMBER.x + Math.round(Math.cos(angle) * radius)
    const z = CAVE_CHAMBER.z + Math.round(Math.sin(angle) * radius)
    const y = deckY + 1 + Math.floor(random() * 5)
    /** 一定要嵌在岩層裡：直接指定座標的話會落在已經挖空的洞室中央，浮在半空 */
    if (getBlock(state, x, y, z) !== BlockId.STONE)
      continue

    setBlock(state, x, y, z, BlockId.DIAMOND_ORE)
    diamondCount++
  }

  /**
   * 幾盞燈籠，摸黑走進去總得有東西指路
   *
   * 通道是沿著折線挖出來的，寬度不一定，
   * 固定往旁邊偏兩格有可能剛好落在挖空的地方——燈就浮在半空。
   * 所以要先確認腳下有岩可以擺
   */
  for (const point of [CAVE_MOUTH, CAVE_TUNNEL, CAVE_CHAMBER]) {
    for (const offset of [{ x: 2, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2 }, { x: 0, z: -2 }]) {
      const x = point.x + offset.x
      const z = point.z + offset.z
      /** 水也撐不住燈，洞室底下那一池就是水 */
      if (isPassableBlock(getBlock(state, x, deckY, z)))
        continue
      if (getBlock(state, x, deckY + 1, z) !== BlockId.AIR)
        continue

      setBlock(state, x, deckY + 1, z, BlockId.LANTERN)
      break
    }
  }

  /** 蛛網掛在洞頂，時間感全靠它 */
  for (let attempt = 0; attempt < 20; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = random() * 7
    setDecoration(
      state,
      CAVE_CHAMBER.x + Math.round(Math.cos(angle) * radius),
      deckY + 3 + Math.floor(random() * 3),
      CAVE_CHAMBER.z + Math.round(Math.sin(angle) * radius),
      BlockId.COBWEB,
    )
  }

  /** 山腳下幾株耐陰的草，把岩與木座接起來 */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.2, (pick) => (
    pick() < 0.5 ? BlockId.FERN : BlockId.STONE_PLANT
  ), new Set([BlockId.GRAVEL]))

  /**
   * 洞口兩側的石燈籠
   *
   * 通道是沿著對角線鑽進山腹的，所以「洞口的正前方」也在對角線上。
   * 原本一盞擺在 (+2, +2)，那正好是那條軸線往外延伸的位置——
   * 燈籠因此不是立在門邊，是立在門口正中央擋著路。
   *
   * 改成沿著通道的垂直方向各退一邊：兩盞連起來的那條線
   * 與人走進去的方向成直角，這才是「門的兩側」
   */
  placeStoneLantern(state, CAVE_MOUTH.x + 3, groundY, CAVE_MOUTH.z - 1)
  placeStoneLantern(state, CAVE_MOUTH.x - 1, groundY, CAVE_MOUTH.z + 3)
}
