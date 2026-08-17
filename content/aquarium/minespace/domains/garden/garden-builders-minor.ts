import type { GardenDefinition } from './garden-layout'
import { createSeededRandom } from '../../utils/noise'
import { BlockId } from '../block/block-constants'
import { setBlock } from '../world/world-access'
import {
  carveWater,
  DECK_MARGIN,
  fillBox,
  fillNoisyDisc,
  fillSquare,
  getNoisyDistance,
  paveDeck,
  placeBonsaiPine,
  placeOakTree,
  placeRoofCap,
  placeStandingStone,
  placeStoneLantern,
  scatterOnGround,
  setDecoration,
} from './garden-kit'
import { getDeckBlockY, getDeckGroundY } from './garden-layout'

/**
 * 小箱庭的內容
 *
 * 內圈這八座只有十五格見方，塞不下一整片風景，
 * 所以每一座只做一件事：一堆火、一口池、一叢草。
 * 東西少反而聽得清楚——那正是把它們做小的理由
 */

const GRASS_SET = new Set([BlockId.GRASS])

/**
 * 爐火壇
 *
 * 火的聲音是一團持續的低頻劈啪，沒有方向感，
 * 所以座位要圍成一圈：不管坐哪一邊，聽起來都一樣近
 */
export function buildCampfireGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-campfire')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)
  fillNoisyDisc(state, centerX, centerZ, 4.5, deckY, BlockId.DIRT, 1.3)

  /**
   * 石圈與火堆
   *
   * 圍著火的石頭用半磚。整格的石頭跟人的膝蓋一樣高，
   * 圍成一圈就成了一道牆，坐在外面根本看不到火；
   * 半磚只到腳踝，才像隨手撿來擋風的石頭
   */
  for (let step = 0; step < 12; step++) {
    const angle = (step / 12) * Math.PI * 2
    setBlock(
      state,
      centerX + Math.round(Math.cos(angle) * 2),
      groundY,
      centerZ + Math.round(Math.sin(angle) * 2),
      BlockId.STONE_SLAB,
    )
  }
  /**
   * 餘燼要沉進地面，不是墊在地面上
   *
   * 擺在 groundY 的話餘燼整格凸出來，火焰再疊上去，
   * 整團火就有兩格多高，站在旁邊像對著一支火把。
   * 沉到甲板那一層與地面齊平，才是「地上挖出來的一個火塘」
   */
  setBlock(state, centerX, deckY, centerZ, BlockId.EMBER)
  /**
   * 火塘旁邊不放柴
   *
   * 這裡原本橫著擺兩根木頭當架在火上的柴。整格的原木與餘燼一樣高，
   * 緊貼在火的兩側，從外面看是三個並排的方塊而不是一堆火——
   * 而且它們會把火焰立板切掉一角。
   * 留一個乾淨的火塘，柴堆交給棚子那邊那幾根
   */

  /** 四張木階梯當矮凳，靠背朝外、人面向火 */
  setBlock(state, centerX, groundY, centerZ - 4, BlockId.WOOD_STAIRS_NORTH)
  setBlock(state, centerX, groundY, centerZ + 4, BlockId.WOOD_STAIRS_SOUTH)
  setBlock(state, centerX - 4, groundY, centerZ, BlockId.WOOD_STAIRS_WEST)
  setBlock(state, centerX + 4, groundY, centerZ, BlockId.WOOD_STAIRS_EAST)

  /**
   * 一頂木棚
   *
   * 位置有兩個條件：柱腳要落在實心的甲板上（最外圈是半磚，踩上去會浮半格），
   * 而且整座棚子不能壓到火堆——棚頂比火還低，切過去會把火焰削掉一半
   */
  const shelterX = centerX - 3
  const shelterZ = centerZ + 4
  for (const corner of [{ x: -2, z: -1 }, { x: 2, z: -1 }, { x: -2, z: 2 }, { x: 2, z: 2 }]) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, shelterX + corner.x, groundY + level, shelterZ + corner.z, BlockId.FENCE)
    }
  }
  fillBox(state, shelterX - 2, groundY + 3, shelterZ - 1, shelterX + 2, groundY + 3, shelterZ + 2, BlockId.WOOD_SLAB)

  /** 柴堆與雜物 */
  setBlock(state, shelterX, groundY, shelterZ + 1, BlockId.CRATE)
  setBlock(state, shelterX + 1, groundY, shelterZ + 1, BlockId.BARREL)
  setBlock(state, shelterX - 1, groundY, shelterZ, BlockId.OAK_LOG)
  setBlock(state, shelterX - 1, groundY + 1, shelterZ, BlockId.OAK_LOG)
  setBlock(state, centerX + 5, groundY, centerZ - 4, BlockId.HAY)

  placeOakTree(state, centerX + 5, groundY, centerZ + 5, 4)
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.24, (pick) => (
    pick() < 0.5 ? BlockId.FERN : BlockId.TALL_GRASS
  ), GRASS_SET)
}

/**
 * 石廊跡
 *
 * 迴響需要平行的硬面。所以這一座只有石頭：
 * 幾根斷了一半的柱子圍成一圈，中間立一塊碑。
 * 沒有屋頂也沒有樹，聲音進去就在那幾面石壁之間繞
 */
export function buildRuinsGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-ruins')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.STONE_TILE)

  /** 石板縫裡長出草，看得出這裡荒廢很久了 */
  for (let attempt = 0; attempt < 60; attempt++) {
    setBlock(
      state,
      centerX + Math.round((random() * 2 - 1) * inner),
      deckY,
      centerZ + Math.round((random() * 2 - 1) * inner),
      random() < 0.6 ? BlockId.MOSSY_COBBLESTONE : BlockId.GRASS,
    )
  }

  /** 一圈斷柱，高度刻意參差 */
  for (let step = 0; step < 8; step++) {
    const angle = (step / 8) * Math.PI * 2
    const pillarX = centerX + Math.round(Math.cos(angle) * 5)
    const pillarZ = centerZ + Math.round(Math.sin(angle) * 5)
    const height = 2 + Math.floor(random() * 4)

    for (let level = 0; level < height; level++) {
      setBlock(
        state,
        pillarX,
        groundY + level,
        pillarZ,
        random() < 0.3 ? BlockId.MOSSY_COBBLESTONE : BlockId.STONE_BRICKS,
      )
    }
    /** 藤蔓從斷口爬下來 */
    if (random() < 0.6) {
      setDecoration(state, pillarX + 1, groundY + height - 1, pillarZ, BlockId.IVY)
    }
    /** 高的那幾根之間還架著橫樑 */
    if (height >= 4 && step % 2 === 0) {
      setDecoration(state, pillarX, groundY + height, pillarZ, BlockId.STONE_SLAB)
    }
  }

  /** 中央的石碑 */
  setBlock(state, centerX, groundY, centerZ, BlockId.STONE_BRICKS)
  setBlock(state, centerX, groundY + 1, centerZ, BlockId.RUNE_STONE)
  setBlock(state, centerX, groundY + 2, centerZ, BlockId.STONE_SLAB)

  /** 幾塊倒下來的石頭散在地上 */
  for (const spot of [{ x: -3, z: 3 }, { x: 4, z: -2 }, { x: -5, z: -4 }]) {
    placeStandingStone(state, centerX + spot.x, groundY, centerZ + spot.z, 1, BlockId.MOSSY_COBBLESTONE)
  }

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.3, (pick) => {
    const roll = pick()
    if (roll < 0.45)
      return BlockId.STONE_PLANT
    if (roll < 0.75)
      return BlockId.TALL_GRASS
    return BlockId.BUSH
  }, new Set([BlockId.GRASS, BlockId.MOSSY_COBBLESTONE]))

  placeStoneLantern(state, centerX - 5, groundY, centerZ + 5)
}

/**
 * 草苑
 *
 * 草原的風之所以柔，是因為沒有任何東西反射它。
 * 所以這一座什麼都不能有：一片草、滿地花、角落一棵孤零零的樹，
 * 剩下的就是空
 */
export function buildMeadowGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-meadow')
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /** 唯一的一棵樹，站在角落，讓風有一個看得見的去處 */
  placeOakTree(state, centerX - 4, groundY, centerZ - 4, 6)

  /** 樹下一張長凳 */
  for (let offset = -1; offset <= 1; offset++) {
    setBlock(state, centerX - 1, groundY, centerZ - 3 + offset, BlockId.WOOD_STAIRS_WEST)
  }

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.62, (pick) => {
    const roll = pick()
    if (roll < 0.46)
      return BlockId.TALL_GRASS
    if (roll < 0.62)
      return BlockId.FLOWER_DANDELION
    if (roll < 0.74)
      return BlockId.FLOWER_TULIP
    if (roll < 0.84)
      return BlockId.FLOWER_VIOLA
    if (roll < 0.92)
      return BlockId.BIG_FLOWER
    return BlockId.FLOWER_WHITE_DANDELION
  }, GRASS_SET)
}

/**
 * 牧野
 *
 * 羊叫是唯一位置一直在動的聲音。
 * 所以這一座要留出空地讓羊走得開，柵欄圍一圈，
 * 從外面看得見裡面，聲音才會跟著那幾隻白色的影子移動
 */
export function buildPastureGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-pasture')
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN
  const fenceHalf = garden.halfSize - 2

  paveDeck(state, garden, BlockId.GRASS)

  /** 柵欄圍一圈，朝中心那一側留一道門 */
  for (let offset = -fenceHalf; offset <= fenceHalf; offset++) {
    const isGate = Math.abs(offset) <= 1
    if (!isGate) {
      setBlock(state, centerX + offset, groundY, centerZ - fenceHalf, BlockId.FENCE)
    }
    setBlock(state, centerX + offset, groundY, centerZ + fenceHalf, BlockId.FENCE)
    setBlock(state, centerX - fenceHalf, groundY, centerZ + offset, BlockId.FENCE)
    setBlock(state, centerX + fenceHalf, groundY, centerZ + offset, BlockId.FENCE)
  }

  /** 乾草堆與飲水槽 */
  setBlock(state, centerX - fenceHalf + 2, groundY, centerZ - fenceHalf + 2, BlockId.HAY)
  setBlock(state, centerX - fenceHalf + 3, groundY, centerZ - fenceHalf + 2, BlockId.HAY)
  setBlock(state, centerX - fenceHalf + 2, groundY + 1, centerZ - fenceHalf + 2, BlockId.HAY)

  const troughX = centerX + fenceHalf - 2
  const troughZ = centerZ + fenceHalf - 2
  fillSquare(state, troughX, troughZ, 1, groundY, BlockId.PLANKS)
  carveWater(state, troughX, getDeckBlockY(garden), troughZ, 1, BlockId.PLANKS)

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.3, (pick) => (
    pick() < 0.7 ? BlockId.TALL_GRASS : BlockId.FLOWER_DANDELION
  ), GRASS_SET)
}

/**
 * 蜂巢圃
 *
 * 蜂群是一整團密集的中頻嗡鳴，聽起來像一個會呼吸的物體。
 * 所以蜂箱要疊在一起，四周種滿開花的東西，
 * 讓聲音的來源看起來也是一團
 */
export function buildApiaryGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-apiary')
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /** 三個蜂箱架在木台上，高度錯開 */
  const hiveSpotList = [
    { x: 0, z: 0, height: 2 },
    { x: 2, z: 1, height: 1 },
    { x: -2, z: 2, height: 1 },
  ]
  for (const spot of hiveSpotList) {
    const hiveX = centerX + spot.x
    const hiveZ = centerZ + spot.z
    setBlock(state, hiveX, groundY, hiveZ, BlockId.PLANKS)
    for (let level = 1; level <= spot.height; level++) {
      setBlock(state, hiveX, groundY + level, hiveZ, BlockId.HIVE)
    }
    setBlock(state, hiveX, groundY + spot.height + 1, hiveZ, BlockId.WOOD_SLAB)
  }

  /** 收成的蜜擺在旁邊 */
  setBlock(state, centerX + 4, groundY, centerZ - 1, BlockId.HONEY_BLOCK)
  setBlock(state, centerX + 4, groundY, centerZ - 2, BlockId.BARREL)

  /** 竹籬圍住蜂箱那一側，人得繞路才靠得近 */
  for (let offset = -3; offset <= 3; offset++) {
    setBlock(state, centerX + offset, groundY, centerZ - 3, BlockId.BAMBOO_FENCE)
  }

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.6, (pick) => {
    const roll = pick()
    if (roll < 0.3)
      return BlockId.BIG_FLOWER
    if (roll < 0.5)
      return BlockId.FLOWER_ROSE
    if (roll < 0.66)
      return BlockId.FLOWER_TULIP
    if (roll < 0.8)
      return BlockId.FLOWER_DANDELION
    if (roll < 0.92)
      return BlockId.FLOWER_VIOLA
    return BlockId.TALL_GRASS
  }, GRASS_SET)
}

/**
 * 水鏡池
 *
 * 靜水上的聲音是一個一個點：一聲蛙、一聲水鳥，中間全是空白。
 * 所以這一座要盡量安靜——一整池不動的水，一塊挑出水面的木板，
 * 讓人坐在那裡等下一聲
 */
export function buildPondGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-pond')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /**
   * 一池水
   *
   * 岸線與深淺都吃噪音：邊緣凹凸不定，深的地方也不是正中央的一個圓，
   * 而是偏在一側的一窪。規則的同心圓一看就是用公式畫出來的
   */
  for (let offsetX = -inner; offsetX <= inner; offsetX++) {
    for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      const distance = getNoisyDistance(x, z, centerX, centerZ, 0.3, 1.6)
      if (distance > 4.6)
        continue

      carveWater(state, x, deckY, z, 1, BlockId.CLAY)
    }
  }

  /** 一塊挑出水面的木板，站上去等下一聲 */
  for (let offset = 0; offset <= 4; offset++) {
    setBlock(state, centerX + offset, deckY + 1, centerZ + 5 - offset, BlockId.WOOD_SLAB)
    setBlock(state, centerX + offset, deckY + 1, centerZ + 4 - offset, BlockId.WOOD_SLAB)
  }
  /** 燈要立在實心的柱子上，直接擺在半磚棧道上會浮著半格 */
  setBlock(state, centerX + 4, deckY + 1, centerZ + 1, BlockId.PLANKS)
  setBlock(state, centerX + 4, deckY + 2, centerZ + 1, BlockId.PAPER_LAMP)

  /** 岸邊的石與松，倒影落在水裡 */
  placeStandingStone(state, centerX - 5, groundY, centerZ - 2, 2, BlockId.MOSSY_COBBLESTONE)
  placeBonsaiPine(state, centerX - 5, groundY, centerZ + 4, 1, 0)

  /** 睡蓮浮在水面 */
  for (let attempt = 0; attempt < 40; attempt++) {
    setDecoration(
      state,
      centerX + Math.round((random() * 2 - 1) * 4),
      groundY,
      centerZ + Math.round((random() * 2 - 1) * 4),
      BlockId.LILY_PAD,
    )
  }

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.34, (pick) => {
    const roll = pick()
    if (roll < 0.42)
      return BlockId.PAPYRUS
    if (roll < 0.7)
      return BlockId.TALL_GRASS
    if (roll < 0.88)
      return BlockId.FERN
    return BlockId.FLOWER_VIOLA
  }, GRASS_SET)

  placeStoneLantern(state, centerX + 5, groundY, centerZ - 4)
}

/**
 * 聽雨亭
 *
 * 雨聲的質地是由它打在什麼上面決定的。
 * 打在葉子上是柔的、打在木頭上是脆的、打在水面上是悶的——
 * 所以這一座要同時擺齊這三種東西，再蓋一座亭子讓人躲進去聽
 */
export function buildRainvaleGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-rainvale')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /**
   * 幾株濃綠的闊葉樹
   *
   * 樹冠有五格寬，這座甲板只有十一格見方。
   * 原本種四棵，樹冠整個接起來把地面封死，人根本走不進來——
   * 減到三棵、全部推到角落，中間才留得出站得下人的空隙
   */
  for (const spot of [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: -4, z: 4 }]) {
    placeOakTree(state, centerX + spot.x, groundY, centerZ + spot.z, 5 + Math.floor(random() * 3), BlockId.JUNGLE_LEAVES)
  }

  /** 一窪積水，雨打在水面上是悶的 */
  const puddleX = centerX + 1
  const puddleZ = centerZ - 1
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
      const x = puddleX + offsetX
      const z = puddleZ + offsetZ
      if (getNoisyDistance(x, z, puddleX, puddleZ, 0.36, 1.1) > 2.2)
        continue

      carveWater(state, x, deckY, z, 1, BlockId.CLAY)
    }
  }

  /**
   * 木亭
   *
   * 四根柱子撐一片木頂，雨打在上面是脆的。
   * 亭子刻意做小，只坐得下一個人
   */
  const pavilionX = centerX - 3
  const pavilionZ = centerZ + 1
  /**
   * 柱子用圍籬，不用整格的木頭
   *
   * 這座亭子只有五格見方，四根整格粗的柱子會把裡面塞得滿滿的，
   * 從外面看更像四堵牆而不是一座亭。
   * 圍籬只有中央一根細柱，碰撞也跟著細（見 collisionWidth），
   * 人在柱子之間走得過去，視線也穿得出去
   */
  for (const corner of [{ x: -1, z: -1 }, { x: -1, z: 1 }, { x: 1, z: -1 }, { x: 1, z: 1 }]) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, pavilionX + corner.x, groundY + level, pavilionZ + corner.z, BlockId.FENCE)
    }
  }
  /**
   * 地板鋪榻榻米
   *
   * 榻榻米是拿來鋪的，不是拿來擺的：單獨一格立在亭子中央只像個箱子，
   * 整片鋪滿柱子之間才看得出這是一個脫了鞋要坐上去的地方
   */
  fillSquare(state, pavilionX, pavilionZ, 1, deckY, BlockId.TATAMI)
  placeRoofCap(state, pavilionX, groundY + 3, pavilionZ, 2, BlockId.DARK_WOOD_SLAB, BlockId.DARK_PLANKS)
  fillSquare(state, pavilionX, pavilionZ, 1, groundY + 4, BlockId.DARK_PLANKS)
  /**
   * 亭子裡的椅子
   *
   * 原本鋪一格榻榻米當坐墊，但單獨一格擺在亭子正中央，
   * 看起來只是一個及腰的箱子，看不出是給人坐的。
   * 改用木階梯：座面只有半格高、後面帶一片靠背，
   * 一眼就知道該往哪個方向坐。
   * 靠背朝西，人面向東邊那窪積水——這座亭子本來就是為了聽雨才蓋的
   */
  setBlock(state, pavilionX, groundY, pavilionZ, BlockId.WOOD_STAIRS_WEST)
  /**
   * 燈改成吊的
   *
   * 原本是一格和紙燈箱浮在椅子旁邊的半空中，沒有東西托著它。
   * 頭頂剛好就是屋頂，換成吊燈之後它貼著屋頂垂下來——
   * 同一個位置、同一張貼圖，差別只在它現在有了來處
   */
  setBlock(state, pavilionX, groundY + 2, pavilionZ + 1, BlockId.HANGING_LAMP)

  /**
   * 簷角的風鈴
   *
   * 這座禪庭整座都在講聲音，卻一直沒有一個「因為風而響」的東西。
   * 只掛一個，掛在屋簷伸出去的那一角——不掛成一排，
   * 風鈴多了會變成裝飾，一個才是聲音
   */
  setBlock(state, pavilionX + 2, groundY + 2, pavilionZ - 2, BlockId.WIND_CHIME)

  /** 苔石與蕨，濕氣重的地方才長得出來 */
  placeStandingStone(state, centerX + 5, groundY, centerZ - 5, 2, BlockId.MOSSY_COBBLESTONE)

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.52, (pick) => {
    const roll = pick()
    if (roll < 0.36)
      return BlockId.FERN
    if (roll < 0.58)
      return BlockId.JUNGLE_GRASS
    if (roll < 0.74)
      return BlockId.CURLY_PLANT
    if (roll < 0.86)
      return BlockId.FOREST_LITTER
    if (roll < 0.94)
      return BlockId.BROWN_MUSHROOM
    return BlockId.MUSHROOM
  }, GRASS_SET)
}

/**
 * 蟲聲叢
 *
 * 蟲鳴是高頻的、有顆粒感的，而且它從草叢的每一個縫隙裡出來，
 * 不是從某一個點。所以這一座要把草種到滿，
 * 高到看不見地面，人走進去就被聲音包住
 */
export function buildInsectGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-insect')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /** 一小片乾土，蟲最愛的曬得到太陽的角落 */
  fillNoisyDisc(state, centerX + 4, centerZ + 4, 3, deckY, BlockId.SAND, 1.1)

  /** 幾根埋了半截的木樁，蟲從縫裡叫出來 */
  for (const spot of [{ x: -4, z: -3 }, { x: -3, z: -1 }, { x: 2, z: -4 }]) {
    setBlock(state, centerX + spot.x, groundY, centerZ + spot.z, BlockId.DEAD_LOG)
    if (random() < 0.6) {
      setBlock(state, centerX + spot.x, groundY + 1, centerZ + spot.z, BlockId.DEAD_LOG)
    }
  }

  /** 一堆石，石縫是另一種蟲的家 */
  placeStandingStone(state, centerX - 5, groundY, centerZ + 4, 2, BlockId.COBBLESTONE)
  setDecoration(state, centerX - 4, groundY, centerZ + 4, BlockId.COBBLESTONE)

  /** 乾土上兩株仙人掌，是全庭最乾的地方 */
  setBlock(state, centerX + 4, groundY, centerZ + 4, BlockId.CACTUS)
  setBlock(state, centerX + 4, groundY + 1, centerZ + 4, BlockId.CACTUS)
  setBlock(state, centerX + 5, groundY, centerZ + 2, BlockId.CACTUS)

  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.78, (pick) => {
    const roll = pick()
    if (roll < 0.5)
      return BlockId.TALL_GRASS
    if (roll < 0.7)
      return BlockId.DRY_GRASS
    if (roll < 0.84)
      return BlockId.FERN
    if (roll < 0.92)
      return BlockId.CURLY_PLANT
    return BlockId.FIRE_FLOWER
  }, GRASS_SET)

  scatterOnGround(state, centerX + 4, centerZ + 4, 3, groundY, random, 0.3, () => BlockId.DRY_SHRUB, new Set([BlockId.SAND]))
}
