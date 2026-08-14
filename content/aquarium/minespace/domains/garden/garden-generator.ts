import type { GardenDefinition, GardenId } from './garden-layout'
import { createSeededRandom } from '../../utils/noise'
import { BlockId } from '../block/block-constants'
import { setBlock } from '../world/world-access'
import { WORLD_SIZE } from '../world/world-constants'
import {
  buildAlpineGarden,
  buildAutumnGarden,
  buildCaveGarden,
  buildCoastGarden,
  buildForestGarden,
  buildRiverGarden,
  buildSwampGarden,
  buildVillageGarden,
  buildWheatGarden,
} from './garden-builders-major'
import {
  buildBlizzardGarden,
  buildCicadaGarden,
  buildJigokuGarden,
  buildRainhallGarden,
  buildSongbirdGarden,
} from './garden-builders-middle'
import {
  buildApiaryGarden,
  buildCampfireGarden,
  buildInsectGarden,
  buildMeadowGarden,
  buildPastureGarden,
  buildPondGarden,
  buildRainvaleGarden,
  buildRuinsGarden,
} from './garden-builders-minor'
import { SAND_LEVEL } from './garden-constants'
import { fillBox, placePedestal, placeStandingStone, placeSteppingStones, rakeAround } from './garden-kit'
import { GARDEN_LIST, SOLITARY_STONE_LIST } from './garden-layout'

/** 每一座箱庭的內容生成器 */
const BUILDER_MAP: Record<GardenId, (state: Uint8Array, garden: GardenDefinition) => void> = {
  wheatfield: buildWheatGarden,
  forest: buildForestGarden,
  autumn: buildAutumnGarden,
  alpine: buildAlpineGarden,
  river: buildRiverGarden,
  coast: buildCoastGarden,
  swamp: buildSwampGarden,
  village: buildVillageGarden,
  cave: buildCaveGarden,
  campfire: buildCampfireGarden,
  ruins: buildRuinsGarden,
  meadow: buildMeadowGarden,
  pasture: buildPastureGarden,
  apiary: buildApiaryGarden,
  pond: buildPondGarden,
  rainvale: buildRainvaleGarden,
  insect: buildInsectGarden,
  rainhall: buildRainhallGarden,
  songbird: buildSongbirdGarden,
  cicada: buildCicadaGarden,
  blizzard: buildBlizzardGarden,
  jigoku: buildJigokuGarden,
}

/**
 * 鋪滿整個世界的白沙
 *
 * 地表以下只是為了讓地面是實心的，玩家永遠看不到，
 * 所以一律用白砂岩填掉，只有最上面那一層是白沙
 */
function paveSandField(state: Uint8Array): void {
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)
  fillBox(state, 0, 1, 0, WORLD_SIZE - 1, SAND_LEVEL - 1, WORLD_SIZE - 1, BlockId.WHITE_SANDSTONE)
  fillBox(state, 0, SAND_LEVEL, 0, WORLD_SIZE - 1, SAND_LEVEL, WORLD_SIZE - 1, BlockId.WHITE_SAND)
}

/**
 * 散在沙上的孤石
 *
 * 兩圈箱庭之間那一大片空白，全空著會像還沒做完。
 * 一塊立石、周圍幾圈耙紋，走在霧裡時會一顆一顆浮出來又沉回去
 */
function placeSolitaryStoneList(state: Uint8Array): void {
  for (const stone of SOLITARY_STONE_LIST) {
    /** 石頭底下墊一片白砂岩，看起來才像有人擺上去的，不是長出來的 */
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        setBlock(state, stone.x + offsetX, SAND_LEVEL, stone.z + offsetZ, BlockId.WHITE_SANDSTONE)
      }
    }

    placeStandingStone(state, stone.x, SAND_LEVEL + 1, stone.z, stone.height, BlockId.MOSSY_COBBLESTONE)
    rakeAround(state, stone.x, stone.z, 1, 3, 2)
  }
}

/**
 * 每一座箱庭外面那幾顆飛石
 *
 * 走向是「從世界中心往這座箱庭」的那一側——人是從中間往外逛的，
 * 飛石因此永遠迎著來的方向。取兩軸中比較長的那一個當方向，
 * 路才會垂直踩上木座的邊，而不是斜斜地擦過一角。
 *
 * 這件事集中做而不是每座箱庭各寫一次：二十二座的作法完全一樣，
 * 而它屬於「箱庭與箱庭之間」，本來就不歸任何一座管
 */
function placeApproachStoneList(state: Uint8Array): void {
  const worldCenter = WORLD_SIZE / 2

  for (const garden of GARDEN_LIST) {
    const towardCenterX = worldCenter - garden.center.x
    const towardCenterZ = worldCenter - garden.center.z
    const isAlongX = Math.abs(towardCenterX) >= Math.abs(towardCenterZ)
    const stepX = isAlongX ? Math.sign(towardCenterX) : 0
    const stepZ = isAlongX ? 0 : Math.sign(towardCenterZ)

    /** 每座各自一組亂數，換一座箱庭石頭就散得不一樣 */
    const random = createSeededRandom(`approach-${garden.id}`)

    placeSteppingStones(
      state,
      garden.center.x + stepX * (garden.halfSize + 1),
      garden.center.z + stepZ * (garden.halfSize + 1),
      stepX,
      stepZ,
      6,
      SAND_LEVEL + 1,
      random,
    )
  }
}

/**
 * 生成整座禪庭
 *
 * 順序不能換：先鋪沙、再搭木座、然後才放各自的內容，最後才耙沙紋。
 * 耙紋只改「還是乾淨白沙」的格子，放在最後才不會把墊腳石一起染掉
 */
export function generateWorld(state: Uint8Array): void {
  paveSandField(state)

  for (const garden of GARDEN_LIST) {
    placePedestal(state, garden)
  }

  for (const garden of GARDEN_LIST) {
    BUILDER_MAP[garden.id](state, garden)
  }

  /** 飛石排在孤石前面：撞在一起時該讓路的是飛石，孤石是地標 */
  placeApproachStoneList(state)
  placeSolitaryStoneList(state)

  /**
   * 耙紋要貼著木座，不能往外鋪太遠
   *
   * 最外圈的木座離循環邊界只有四十二格，而霧在三十四格就糊掉了。
   * 紋路一路耙出去的話，站在邊界上會看到幾道淡淡的線，
   * 走過去之後它們卻消失了——那是唯一會拆穿循環的破綻
   */
  for (const garden of GARDEN_LIST) {
    rakeAround(state, garden.center.x, garden.center.z, garden.halfSize, 2, 2)
  }
}
