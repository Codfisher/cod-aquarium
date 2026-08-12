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
 * 中圈四座小箱庭
 *
 * 這四座是後來補的，主題全部從「現有音檔的新組合」推出來：
 * 手上只有三十幾個聲音，與其硬加新音源，
 * 不如把已經有的聲音重新分類——同一個貓頭鷹放進松籟林是「林子裡的一隻鳥」，
 * 抽出來與蟋蟀、蟾蜍擺在一起就變成「夜行性」這個類別
 */

const GRASS_SET = new Set([BlockId.GRASS])

/**
 * 月語庭
 *
 * 貓頭鷹、蟋蟀、蟾蜍——三種只在天黑之後才出現的聲音收在一起。
 * 但目前的世界永遠是午後，沒辦法真的把光關掉，
 * 所以改用顏色講這件事：整座庭只用銀白與墨黑兩色，
 * 白砂岩、黑曜磚、月見草、幾盞冷光的燈籠。
 * 之後若接上時間系統，這裡會是第一個活過來的地方
 */
export function buildNocturneGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-nocturne')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.OBSIDIAN_BRICKS)

  /** 一道銀白的沙從東北斜切到西南，是黑底上唯一的亮色 */
  for (let offset = -inner; offset <= inner; offset++) {
    const driftX = Math.round(getNoisyDistance(centerX + offset, centerZ, centerX, centerZ, 0.3, 1.4) * 0.3)
    for (let width = -1; width <= 1; width++) {
      setBlock(state, centerX + offset, deckY, centerZ + offset + width + driftX, BlockId.GARDEN_SAND)
    }
  }

  /** 一窪暗水，月亮照在上面 */
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
      const x = centerX + offsetX - 3
      const z = centerZ + offsetZ + 3
      if (getNoisyDistance(x, z, centerX - 3, centerZ + 3, 0.34, 1.1) > 2.4)
        continue

      carveWater(state, x, deckY, z, 1, BlockId.OBSIDIAN_BRICKS)
    }
  }

  /** 幾塊帶月紋的磚砌成的矮台，上面立一盞燈 */
  fillSquare(state, centerX + 3, centerZ - 3, 1, deckY, BlockId.MOON_BRICKS)
  setBlock(state, centerX + 3, groundY, centerZ - 3, BlockId.MOON_BRICKS)
  setBlock(state, centerX + 3, groundY + 1, centerZ - 3, BlockId.LANTERN)

  /** 一株姿態很開的老松，夜裡看是一片剪影 */
  placeBonsaiPine(state, centerX - 4, groundY, centerZ - 4, 1, 0)

  for (const corner of [{ x: -5, z: 5 }, { x: 5, z: 5 }, { x: 5, z: -5 }]) {
    placeStoneLantern(state, centerX + corner.x, groundY, centerZ + corner.z)
  }

  /** 只長白色的花，黑底上才看得見 */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.28, (pick) => (
    pick() < 0.62 ? BlockId.MOON_FLOWER : BlockId.FLOWER_WHITE_DANDELION
  ), new Set([BlockId.OBSIDIAN_BRICKS, BlockId.GARDEN_SAND]))
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
