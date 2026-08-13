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
  placeOakTree,
  placeRoofCap,
  placeStandingStone,
  placeStoneLantern,
  placeWaterBasin,
  scatterOnGround,
  setDecoration,
} from './garden-kit'
import { getDeckBlockY, getDeckGroundY } from './garden-layout'

/**
 * 中圈四座小箱庭
 *
 * 這四座是後來補的，主題全部從「現有音檔的新組合」推出來：
 * 手上只有三十幾個聲音，與其硬加新音源，
 * 不如把已經有的聲音重新分類——同一個貓頭鷹放進松籟林是「林子裡的一隻鳥」，
 * 抽出來與蟋蟀、蟾蜍擺在一起就變成「夜行性」這個類別
 */

const GRASS_SET = new Set([BlockId.GRASS])

/**
 * 雨聽堂
 *
 * 全庭唯一一座「從室內聽外面」的箱庭。
 *
 * 其他木座都是站在露天裡聽，這一座得走進屋子：三面牆圍起來、
 * 南面整片敞開，人坐在榻榻米上往外看。雨打在屋瓦、順著出簷滴下來，
 * 而你在乾的地方——「聽雨」與「淋雨」是兩件完全不同的事，
 * 聽雨亭給的是後者，這裡給的是前者。
 *
 * 造景全部繞著「水從屋簷落到地上」這條線：出簷比屋身寬一格，
 * 簷下沿著滴水線鋪一排卵石，卵石中間積著幾窪水
 */
export function buildRainhallGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-rainhall')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.STONE_TILE)

  /** 屋子的半寬，南面整片敞開，所以只有三面牆 */
  const hallHalf = 3
  const wallHeight = 4

  /** 屋內的地板：榻榻米，四周留一圈深色木當框 */
  fillBox(
    state,
    centerX - hallHalf,
    deckY,
    centerZ - hallHalf,
    centerX + hallHalf,
    deckY,
    centerZ + hallHalf,
    BlockId.DARK_PLANKS,
  )
  fillBox(
    state,
    centerX - hallHalf + 1,
    deckY,
    centerZ - hallHalf + 1,
    centerX + hallHalf - 1,
    deckY,
    centerZ + hallHalf - 1,
    BlockId.TATAMI,
  )

  /**
   * 三面牆
   *
   * 南面（offsetZ 為正的那一側）整排不砌，留成一道從地到頂的開口。
   * 坐在裡面往南看出去就是整片庭院與落下來的雨——
   * 屋子要有一面是完全開的，「在室內」才不會變成「被關起來」
   */
  for (let level = 0; level < wallHeight; level++) {
    for (let offsetX = -hallHalf; offsetX <= hallHalf; offsetX++) {
      for (let offsetZ = -hallHalf; offsetZ <= hallHalf; offsetZ++) {
        const isEdge = Math.abs(offsetX) === hallHalf || Math.abs(offsetZ) === hallHalf
        if (!isEdge || offsetZ === hallHalf)
          continue

        /** 側牆腰部開一排窗，雨聲從那裡透進來，光也是 */
        const isWindow = level === 2 && Math.abs(offsetX) === hallHalf && Math.abs(offsetZ) % 2 === 1
        setBlock(
          state,
          centerX + offsetX,
          groundY + level,
          centerZ + offsetZ,
          isWindow ? BlockId.GLASS_PANE : BlockId.DARK_PLANKS,
        )
      }
    }
  }

  /** 開口兩側各立一扇障子，框住那片景 */
  setBlock(state, centerX - hallHalf, groundY, centerZ + hallHalf, BlockId.PAPER_DOOR)
  setBlock(state, centerX + hallHalf, groundY, centerZ + hallHalf, BlockId.PAPER_DOOR)
  setBlock(state, centerX - hallHalf, groundY + 1, centerZ + hallHalf, BlockId.PAPER_DOOR)
  setBlock(state, centerX + hallHalf, groundY + 1, centerZ + hallHalf, BlockId.PAPER_DOOR)

  /**
   * 出簷比屋身寬一格
   *
   * 這一格是整座箱庭的重點：雨水沿著它落下來，
   * 在地上連成一條線。四邊各用一種朝向的階梯，
   * 靠背朝內、薄的那一側朝外，屋簷才是往外收薄的斜面
   */
  const eaveY = groundY + wallHeight
  const eaveHalf = hallHalf + 1
  for (let offsetX = -eaveHalf; offsetX <= eaveHalf; offsetX++) {
    for (let offsetZ = -eaveHalf; offsetZ <= eaveHalf; offsetZ++) {
      let blockId = BlockId.DARK_PLANKS
      if (offsetZ === -eaveHalf)
        blockId = BlockId.DARK_STAIRS_SOUTH
      else if (offsetZ === eaveHalf)
        blockId = BlockId.DARK_STAIRS_NORTH
      else if (offsetX === -eaveHalf)
        blockId = BlockId.DARK_STAIRS_EAST
      else if (offsetX === eaveHalf)
        blockId = BlockId.DARK_STAIRS_WEST

      setBlock(state, centerX + offsetX, eaveY, centerZ + offsetZ, blockId)
    }
  }

  /** 屋頂往上收兩層 */
  placeRoofCap(state, centerX, eaveY + 1, centerZ, hallHalf, BlockId.DARK_WOOD_SLAB, BlockId.DARK_PLANKS)
  placeRoofCap(state, centerX, eaveY + 2, centerZ, hallHalf - 1, BlockId.DARK_WOOD_SLAB, BlockId.DARK_PLANKS)

  /**
   * 滴水線
   *
   * 出簷正下方那一圈鋪卵石，這是日式庭園真的會做的事：
   * 屋簷落下來的水打在裸土上會濺泥，鋪一排石頭才不會。
   * 有了它，雨的路徑在地面上是看得見的
   */
  for (let offsetX = -eaveHalf; offsetX <= eaveHalf; offsetX++) {
    for (let offsetZ = -eaveHalf; offsetZ <= eaveHalf; offsetZ++) {
      const isDripLine = Math.abs(offsetX) === eaveHalf || Math.abs(offsetZ) === eaveHalf
      if (!isDripLine)
        continue

      setBlock(state, centerX + offsetX, deckY, centerZ + offsetZ, BlockId.GRAVEL)
    }
  }

  /** 滴水線上積起來的幾窪水，走過去會看到自己被雨打散的倒影 */
  for (const puddle of [{ x: -eaveHalf, z: 2 }, { x: eaveHalf, z: -1 }, { x: 1, z: eaveHalf }]) {
    carveWater(state, centerX + puddle.x, deckY, centerZ + puddle.z, 1, BlockId.GRAVEL)
  }

  /** 承簷水的手水缽，擺在屋子的東南角外 */
  placeWaterBasin(state, centerX + eaveHalf + 2, groundY, centerZ + eaveHalf - 1)

  /** 屋內一盞和紙燈，雨天的室內要有一點暖 */
  setBlock(state, centerX - hallHalf + 1, groundY, centerZ - hallHalf + 1, BlockId.PAPER_LAMP)

  /** 坐墊擺在朝南的開口前，那是這座箱庭真正的位置 */
  setBlock(state, centerX - 1, groundY, centerZ + hallHalf - 1, BlockId.CUSHION)
  setBlock(state, centerX + 1, groundY, centerZ + hallHalf - 1, BlockId.CUSHION)

  /** 屋外兩盞石燈籠，照著那條滴水線 */
  placeStoneLantern(state, centerX - eaveHalf - 2, groundY, centerZ + eaveHalf - 2)
  placeStoneLantern(state, centerX + eaveHalf + 2, groundY, centerZ - eaveHalf + 1)

  /** 濕氣重的地方長的東西：苔色的蕨與幾叢野草 */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.22, (pick) => (
    pick() < 0.6 ? BlockId.FERN : BlockId.CURLY_PLANT
  ), new Set([BlockId.STONE_TILE]))
}

/**
 * 鳴禽庭
 *
 * 烏鶇與交嘴雀，兩種真正在「唱」的聲音。
 * 這一座刻意什麼別的都不放——沒有風、沒有水、沒有蟲，
 * 底噪愈乾淨，那兩段旋律才愈聽得出是旋律
 */
export function buildSongbirdGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-songbird')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.GRASS)

  /** 三株結著果的矮樹，鳥就是為了這個才來的 */
  for (const spot of [{ x: -4, z: -3 }, { x: 4, z: -4 }, { x: -3, z: 4 }]) {
    placeOakTree(state, centerX + spot.x, groundY, centerZ + spot.z, 4 + Math.floor(random() * 2))
  }

  /**
   * 鳥屋
   *
   * 一根柱子頂著一個小木盒，盒子正面開一個洞。
   * 這是全庭唯一「為了別的生物蓋的東西」
   */
  const houseX = centerX + 4
  const houseZ = centerZ + 4
  for (let level = 0; level < 3; level++) {
    setBlock(state, houseX, groundY + level, houseZ, BlockId.FENCE)
  }
  setBlock(state, houseX, groundY + 3, houseZ, BlockId.PLANKS)
  setBlock(state, houseX, groundY + 4, houseZ, BlockId.HIVE)
  setBlock(state, houseX, groundY + 5, houseZ, BlockId.DARK_WOOD_SLAB)

  /** 一只淺淺的飲水盤 */
  fillSquare(state, centerX, centerZ + 1, 1, deckY, BlockId.STONE_TILE)
  carveWater(state, centerX, deckY, centerZ + 1, 1, BlockId.STONE_TILE)

  /** 開滿花的草地，把鳥引來的理由要看得見 */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.66, (pick) => {
    const roll = pick()
    if (roll < 0.3)
      return BlockId.WILD_GRASS
    if (roll < 0.46)
      return BlockId.TALL_GRASS
    if (roll < 0.6)
      return BlockId.BIG_FLOWER
    if (roll < 0.72)
      return BlockId.FLOWER_ROSE
    if (roll < 0.84)
      return BlockId.FLOWER_VIOLA
    if (roll < 0.94)
      return BlockId.FLOWER_DANDELION
    return BlockId.FLOWER_TULIP
  }, GRASS_SET)
}

/**
 * 湯屋
 *
 * 地底湖的水聲加上柴火的劈啪，兩個湊在一起就成了「正在加熱的水」——
 * 這是整套音景裡少數靠疊加而不是靠單一音源說故事的地方。
 * 所以視覺也要把兩件事同時擺出來：一池熱水，以及池底下那盆火
 */
export function buildOnsenGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-onsen')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.STONE_TILE)
  fillNoisyDisc(state, centerX, centerZ, 5, deckY, BlockId.COBBLESTONE, 1.4)

  /**
   * 岩池
   *
   * 池底鋪熔岩、上面壓一層石頭再灌水。
   * 熔岩不會直接碰到水（中間隔著石頭），但它的光透得上來，
   * 隔著半透明的水看下去池底泛著橘紅——那就是水為什麼是燙的
   */
  const poolRadius = 3.4
  for (let offsetX = -5; offsetX <= 5; offsetX++) {
    for (let offsetZ = -5; offsetZ <= 5; offsetZ++) {
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      if (getNoisyDistance(x, z, centerX, centerZ, 0.3, 1.2) > poolRadius)
        continue

      /** 熔岩就當池底：隔著半透明的水看下去，池底是橘紅的 */
      carveWater(state, x, deckY, z, 1, BlockId.LAVA)
    }
  }

  /**
   * 湯屋本體
   *
   * 只有半邊有牆，另外半邊敞著對著池子——
   * 泡在水裡抬頭看得到天，那才是露天風呂
   */
  const houseX = centerX - 5
  const houseZ = centerZ - 5
  fillBox(state, houseX - 2, deckY, houseZ - 2, houseX + 2, deckY, houseZ + 2, BlockId.TATAMI)
  for (let level = 0; level < 3; level++) {
    for (let offset = -2; offset <= 2; offset++) {
      setBlock(state, houseX + offset, groundY + level, houseZ - 2, BlockId.PAPER_DOOR)
      setBlock(state, houseX - 2, groundY + level, houseZ + offset, BlockId.PAPER_DOOR)
    }
  }
  for (const corner of [{ x: 2, z: 2 }, { x: -2, z: 2 }, { x: 2, z: -2 }]) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, houseX + corner.x, groundY + level, houseZ + corner.z, BlockId.DARK_PLANKS)
    }
  }
  placeRoofCap(state, houseX, groundY + 3, houseZ, 3, BlockId.DARK_WOOD_SLAB, BlockId.DARK_PLANKS)
  fillSquare(state, houseX, houseZ, 1, groundY + 4, BlockId.DARK_PLANKS)

  /** 屋裡的坐墊、一本攤開的書、一盞紙燈 */
  setBlock(state, houseX, groundY, houseZ, BlockId.CUSHION)
  setBlock(state, houseX + 1, groundY, houseZ + 1, BlockId.CUSHION)
  setDecoration(state, houseX - 1, groundY, houseZ + 1, BlockId.OPEN_BOOK)
  setBlock(state, houseX + 1, groundY, houseZ - 1, BlockId.PAPER_LAMP)

  /** 池邊的木桶與踏石 */
  setBlock(state, centerX + 5, groundY, centerZ - 1, BlockId.BARREL)
  setBlock(state, centerX + 5, groundY, centerZ + 1, BlockId.CRATE)
  for (const spot of [{ x: 4, z: 4 }, { x: -1, z: 5 }]) {
    placeStandingStone(state, centerX + spot.x, groundY, centerZ + spot.z, 1, BlockId.MOSSY_COBBLESTONE)
  }

  /** 熱氣養出來的濕生植物，只長在池邊那一圈 */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.3, (pick) => {
    const roll = pick()
    if (roll < 0.4)
      return BlockId.JUNGLE_GRASS
    if (roll < 0.68)
      return BlockId.JUNGLE_FLOWER
    if (roll < 0.86)
      return BlockId.FERN
    return BlockId.CURLY_PLANT
  }, new Set([BlockId.STONE_TILE, BlockId.COBBLESTONE]))
}
