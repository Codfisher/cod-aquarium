import type { GardenDefinition } from './garden-layout'
import { createSeededRandom, fbm2D } from '../../utils/noise'
import { BlockId } from '../block/block-constants'
import { setBlock } from '../world/world-access'
import {
  carveWater,
  CHARRED_LOG_SET,
  DECK_MARGIN,
  fillBox,
  fillNoisyDisc,
  fillSquare,
  getNoisyDistance,
  paveDeck,
  placeDeadTree,
  placeOakTree,
  placeRoofCap,
  placeStoneLantern,
  placeTorii,
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

  /**
   * 開口兩側各立一扇障子，框住那片景
   *
   * 用薄板而不是整格的紙門。整格的紙門是一堵糊了紙的牆，
   * 而障子是一扇門——它薄、它站在柱子之間、它後面還有空間。
   * 這一格的厚度差別在正面看不太出來，一走到側面就全是它
   */
  for (const side of [-hallHalf, hallHalf]) {
    for (let level = 0; level < 2; level++) {
      setBlock(state, centerX + side, groundY + level, centerZ + hallHalf, BlockId.SHOJI_PANEL_X)
    }
  }

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

  /**
   * 天花板中央再吊一盞
   *
   * 地上那盞照的是角落，坐在開口前的人背後是暗的。
   * 吊燈貼著天花板垂下來，光從頭頂散開——
   * 而且它讓人抬頭時看得見「這裡有屋頂」
   */
  setBlock(state, centerX, groundY + wallHeight - 1, centerZ, BlockId.HANGING_LAMP)

  /**
   * 東南簷角的風鈴
   *
   * 掛在出簷伸出去的那一格底下。這座箱庭聽的是雨，
   * 但雨停了它還在響——風鈴是那個「雨停之後」的聲音
   */
  setBlock(state, centerX + eaveHalf, groundY + wallHeight - 1, centerZ + eaveHalf - 1, BlockId.WIND_CHIME)

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
 * 蟬時雨
 *
 * 盛夏正午的一片櫸樹下。整座箱庭的重點是「聲音很大，但看不到來源」——
 * 蟬藏在葉子裡，抬頭只看得到樹冠，聽起來卻像整片天空都在響。
 *
 * 所以造景全部繞著「密不透光的樹冠」做：四棵樹擠在一起、
 * 樹冠彼此交疊成一整片蓋子，底下是一塊被陰影蓋滿的空地。
 * 眼睛在這裡幾乎沒有東西可看——那正是要的效果，
 * 沒得看的時候人才會開始聽。
 *
 * 地面上只留兩樣人待過的痕跡：一道朝南的緣廊，
 * 以及廊邊那個手水缽。夏天的日式庭園就是這樣避暑的
 */
export function buildCicadaGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-cicada')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  /** 樹底下的地是曬不到太陽的土與苔，不是修整過的草皮 */
  paveDeck(state, garden, BlockId.GRASS)
  fillNoisyDisc(state, centerX, centerZ, 4, deckY, BlockId.DIRT, 1.3)

  /**
   * 四棵樹擠在一起
   *
   * 間距刻意抓得比樹冠的半徑還小，四片樹冠因此會互相疊進對方裡，
   * 合成一整片沒有縫的蓋子。分開種的話中間會漏出天空，
   * 那一塊天空會立刻變成視線的去處——而這座箱庭要的是無處可看
   */
  const trunkSpotList = [
    { x: -3, z: -3 },
    { x: 3, z: -2 },
    { x: -2, z: 3 },
    { x: 4, z: 3 },
  ]
  for (const spot of trunkSpotList) {
    placeOakTree(state, centerX + spot.x, groundY, centerZ + spot.z, 6 + Math.floor(random() * 2))
  }

  /**
   * 樹冠再補一層
   *
   * 每棵樹自己的樹冠只到那個高度，四棵疊起來仍然會有幾個透光的洞。
   * 在最高處補一整片葉子把洞蓋掉——躺在下面往上看是一片綠，
   * 陽光只從葉縫裡漏下幾個亮點
   */
  const canopyY = groundY + 8
  for (let offsetX = -inner; offsetX <= inner; offsetX++) {
    for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
      if (getNoisyDistance(centerX + offsetX, centerZ + offsetZ, centerX, centerZ, 0.35, 1.6) > inner)
        continue
      /** 留幾個洞，全部蓋滿就成了天花板而不是樹 */
      if (random() < 0.18)
        continue

      setDecoration(state, centerX + offsetX, canopyY, centerZ + offsetZ, BlockId.OAK_LEAVES)
    }
  }

  /**
   * 朝南的緣廊
   *
   * 一道架高半格的木台，坐上去正對著樹下那片空地。
   * 這是整座箱庭唯一「人待著」的地方，也是聽蟬最好的位置：
   * 背後是屋子的陰影，前面是滿樹的聲音
   */
  const verandaZ = centerZ + inner - 1
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    setBlock(state, centerX + offsetX, deckY, verandaZ, BlockId.PLANKS)
    setBlock(state, centerX + offsetX, groundY, verandaZ, BlockId.WOOD_SLAB)
  }
  /** 廊的兩端各立一根柱子，撐起後面那道短簷 */
  for (const offsetX of [-3, 3]) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, centerX + offsetX, groundY + level, verandaZ + 1, BlockId.OAK_LOG)
    }
    setBlock(state, centerX + offsetX, groundY + 3, verandaZ + 1, BlockId.DARK_PLANKS)
  }
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    setBlock(state, centerX + offsetX, groundY + 3, verandaZ + 1, BlockId.DARK_PLANKS)
    setBlock(state, centerX + offsetX, groundY + 3, verandaZ, BlockId.DARK_STAIRS_NORTH)
  }

  /** 廊上的坐墊與一盞紙燈，夏天的午後就是在這裡待過去的 */
  setDecoration(state, centerX - 1, groundY + 1, verandaZ, BlockId.CUSHION)
  setDecoration(state, centerX + 2, groundY + 1, verandaZ, BlockId.PAPER_LAMP)

  /** 廊邊的手水缽，夏天走過去先掬一瓢水 */
  placeWaterBasin(state, centerX - 5, groundY, verandaZ - 2)

  /** 樹下的石燈籠，白天不亮，但它是這片陰影裡唯一的直線 */
  placeStoneLantern(state, centerX + 5, groundY, centerZ - 4)

  /**
   * 落在土上的枯葉與林下的蕨
   *
   * 盛夏的樹下不是光禿禿的，是一層積了半年的落葉。
   * 開花的東西一律不放：那些會把視線拉回地面，
   * 而這座箱庭希望人一直抬著頭
   */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.34, (pick) => {
    const roll = pick()
    if (roll < 0.34)
      return BlockId.FERN
    if (roll < 0.6)
      return BlockId.FOREST_LITTER
    if (roll < 0.82)
      return BlockId.TALL_GRASS
    return BlockId.STONE_PLANT
  }, new Set([BlockId.GRASS, BlockId.DIRT]))
}

/**
 * 藏書樓
 *
 * 一座文庫藏：日本寺院用來收經卷的那種厚牆倉庫，白灰牆、黑木框、
 * 開窗開得極少。這裡把它縮成一間，裡頭兩列書架夾出一條走道。
 *
 * 它的主題是「聲音的消失」。書是最好的吸音材——一整面架子的紙
 * 把殘響全部吃掉，房間於是死得徹底。石廊跡是這件事的另一端：
 * 同一句話在那裡繞好幾圈才出來，在這裡連一次回聲都沒有。
 *
 * 造景全部服務這件事：牆砌得厚、窗開得高而小、門只有一個，
 * 而且屋子四周種一圈竹——竹葉會把還沒進門的聲音先削掉一層。
 * 走進去的那一步，外面就被關在外面了
 */
export function buildLibraryGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-library')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.STONE_TILE)

  /**
   * 屋子的半寬
   *
   * 四格是被裡頭的東西決定的：兩列書架各佔一格、中間走道兩格、
   * 左右各留一格靠牆走。再窄一格就得把走道縮成一格寬，
   * 兩排書架會貼著人的肩膀，那是倉庫不是可以待著的地方
   */
  const hallHalf = 4
  const wallHeight = 5

  /** 屋內鋪深色木地板，比外面的石板暖一階 */
  fillBox(
    state,
    centerX - hallHalf + 1,
    deckY,
    centerZ - hallHalf + 1,
    centerX + hallHalf - 1,
    deckY,
    centerZ + hallHalf - 1,
    BlockId.DARK_PLANKS,
  )

  /**
   * 四面牆，只留南面一個門
   *
   * 牆是白灰的，四個角用深色木收邊——文庫藏的樣子就出在這個對比上。
   * 窗開在第四層，高過書架的頂：光斜斜地打進來落在天花板與走道上，
   * 而不是直接曬在書背上。真正的藏書樓就是這樣防日曬的
   */
  const doorX = centerX
  const sideDoorZ = centerZ - 1
  for (let level = 0; level < wallHeight; level++) {
    for (let offsetX = -hallHalf; offsetX <= hallHalf; offsetX++) {
      for (let offsetZ = -hallHalf; offsetZ <= hallHalf; offsetZ++) {
        const isEdge = Math.abs(offsetX) === hallHalf || Math.abs(offsetZ) === hallHalf
        if (!isEdge)
          continue

        const x = centerX + offsetX
        const z = centerZ + offsetZ

        /**
         * 南牆正中央那一格開成門，三格高
         *
         * 兩格高剛好等於人的高度，一點餘裕都沒有——
         * 門前只要有任何一格墊高的東西（哪怕只是半格的石階），
         * 踏上去頭就撞在門楣上，整座屋子於是進不去。
         * 開三格，門前擺什麼都還走得過去
         */
        /**
         * 兩個門，南面正門與東面側門
         *
         * 只有一個門的建築是倉庫，兩個門才是給人穿過去的。
         * 這件事在聽覺上也成立：腳步聲從一頭進來、另一頭出去，
         * 才會有「剛剛有人經過」的感覺；只有一個門的話，
         * 每個聲音都得原路折返，聽起來像有人在門口徘徊
         */
        const isFrontDoor = offsetZ === hallHalf && x === doorX && level < 3
        const isSideDoor = offsetX === hallHalf && z === sideDoorZ && level < 3
        const isDoorway = isFrontDoor || isSideDoor
        if (isDoorway) {
          setBlock(state, x, groundY + level, z, BlockId.AIR)
          continue
        }

        const isCorner = Math.abs(offsetX) === hallHalf && Math.abs(offsetZ) === hallHalf
        /** 高窗，開在書架頂上那一層，每隔兩格一扇 */
        const isWindow = level === 3 && !isCorner && (Math.abs(offsetX) + Math.abs(offsetZ)) % 3 === 0

        /**
         * 高窗用紙不用玻璃
         *
         * 這座屋子的設計理由本來就是「不讓陽光直接曬到書背」，
         * 而紙窗正是那件事的答案——它把光散開，不讓光成束。
         * 玻璃是相反的東西：它讓外面的一切原封不動地射進來。
         *
         * 薄板嵌在一格厚的牆上，兩側的牆會露出側面，
         * 於是窗是凹進去的——那正是窗框
         */
        const isAlongZ = Math.abs(offsetX) === hallHalf

        let blockId = BlockId.WHITE_SANDSTONE
        if (isCorner)
          blockId = BlockId.DARK_PLANKS
        else if (isWindow)
          blockId = isAlongZ ? BlockId.SHOJI_PANEL_Z : BlockId.SHOJI_PANEL_X

        setBlock(state, x, groundY + level, z, blockId)
      }
    }
  }

  /** 門楣，門洞上方那一道深色橫木 */
  setBlock(state, doorX, groundY + 3, centerZ + hallHalf, BlockId.DARK_PLANKS)
  setBlock(state, centerX + hallHalf, groundY + 3, sideDoorZ, BlockId.DARK_PLANKS)

  /**
   * 書架沿著西牆與北牆排，中央整個讓出來
   *
   * 原本是兩列書架夾出一條走道，那是倉庫的排法——
   * 走進去只能通過，沒有地方停。閱覽堂要的是相反的東西：
   * 書退到牆邊，中間空出來擺桌子，人才會在裡面坐下。
   *
   * 刻意留幾格空著：滿滿一牆的書看起來像貼上去的壁紙，
   * 缺了幾本才像有人真的來借過
   */
  for (let offsetZ = -hallHalf + 1; offsetZ <= hallHalf - 1; offsetZ++) {
    for (let level = 0; level < 3; level++) {
      if (random() < 0.12)
        continue

      setBlock(state, centerX - hallHalf + 1, groundY + level, centerZ + offsetZ, BlockId.BOOKSHELF)
    }
  }
  for (let offsetX = -hallHalf + 2; offsetX <= hallHalf - 1; offsetX++) {
    for (let level = 0; level < 3; level++) {
      if (random() < 0.12)
        continue

      setBlock(state, centerX + offsetX, groundY + level, centerZ - hallHalf + 1, BlockId.BOOKSHELF)
    }
  }

  /**
   * 中央兩張閱覽桌
   *
   * 這是整座箱庭最重要的一件家具。桌子代表「這裡是可以待的」——
   * 而有人待著，才會有翻頁聲、椅子拖動聲、書本闔上的聲音。
   * 一張桌子只是擺設，兩張才看得出這裡同時容得下好幾個人
   */

  /** 兩張桌子各配兩個座位，攤開的書留在其中幾個位子上 */
  for (const desk of [{ z: 0, book: 0 }, { z: 2, book: 2 }]) {
    for (let offsetX = -1; offsetX <= 2; offsetX++) {
      setBlock(state, centerX + offsetX, groundY, centerZ + desk.z, BlockId.DARK_WOOD_SLAB)
    }
    setDecoration(state, centerX + desk.book, groundY + 1, centerZ + desk.z, BlockId.OPEN_BOOK)
    setDecoration(state, centerX + desk.book, groundY, centerZ + desk.z - 1, BlockId.CUSHION)

    /**
     * 每張桌子頭頂各一盞吊燈
     *
     * 原本全屋只有櫃檯旁那一盞紙燈，桌上是暗的——
     * 而這間屋子存在的理由就是有人坐在那裡讀書。
     * 光該落在讀的地方，不是落在管理的地方
     */
    setBlock(state, centerX, groundY + wallHeight - 1, centerZ + desk.z, BlockId.HANGING_LAMP)
  }

  /**
   * 借還書的木櫃，擺在正門進來的第一眼
   *
   * 公共的建築要有一個「這裡有人管」的位置。
   * 沒有它，這間屋子看起來只是剛好放了很多書
   */
  setBlock(state, centerX + 2, groundY, centerZ + hallHalf - 1, BlockId.WORKBENCH)
  setDecoration(state, centerX + 2, groundY + 1, centerZ + hallHalf - 1, BlockId.OPEN_BOOK)

  /**
   * 屋裡唯一的光
   *
   * 一盞紙燈擺在櫃檯旁。滿屋子的紙不敢用明火，燈要小、要遠離書架
   */
  setBlock(state, centerX + 1, groundY, centerZ + hallHalf - 1, BlockId.PAPER_LAMP)

  /**
   * 西南角一塊席地而坐的位子
   *
   * 桌椅是「來查東西」的地方，坐在地上才是「留下來讀完」的地方。
   * 一疊榻榻米攤在木地板上、旁邊擺個坐墊，那一角就從走道變成角落——
   * 而人會在角落待得比在走道久
   */
  for (let offsetX = -3; offsetX <= -2; offsetX++) {
    for (let offsetZ = 1; offsetZ <= 3; offsetZ++) {
      setBlock(state, centerX + offsetX, groundY, centerZ + offsetZ, BlockId.TATAMI_MAT)
    }
  }
  /**
   * 坐墊擺在席子當中，不是疊在席子上面
   *
   * 薄層佔的仍然是一整格，所以「放在它上面」等於高一整格——
   * 坐墊會浮在半空中。與席子並排、同樣坐在地板那一格才對得起來
   */
  setBlock(state, centerX - 3, groundY, centerZ + 2, BlockId.CUSHION)

  /** 還沒歸架的書，堆在走道邊的木箱上 */
  setBlock(state, centerX - 2, groundY, centerZ + 3, BlockId.CRATE)
  setDecoration(state, centerX - 2, groundY + 1, centerZ + 3, BlockId.OPEN_BOOK)
  /**
   * 屋頂
   *
   * 出簷一格，四邊用階梯收薄，再往上疊兩層收頂。
   * 與雨聽堂同一種做法，因為兩者是同一個時代的屋子
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
  placeRoofCap(state, centerX, eaveY + 1, centerZ, hallHalf, BlockId.DARK_WOOD_SLAB, BlockId.DARK_PLANKS)
  placeRoofCap(state, centerX, eaveY + 2, centerZ, hallHalf - 2, BlockId.DARK_WOOD_SLAB, BlockId.DARK_PLANKS)

  /**
   * 門前的一對石燈籠
   *
   * 這裡原本還有一塊踏石，已經拿掉了：甲板是平的，本來就沒有高低差要跨，
   * 那塊石頭純粹是裝飾——而它剛好擋在唯一的入口上
   */
  placeStoneLantern(state, doorX - 2, groundY, centerZ + hallHalf + 1)
  placeStoneLantern(state, doorX + 2, groundY, centerZ + hallHalf + 1)

  /**
   * 繞著屋子的一圈竹
   *
   * 不只是造景。竹葉是這座箱庭的第一道吸音層——
   * 外面的鳥聲與風先在這裡被削掉一層，走進門的那一步才切得乾淨。
   * 種在木座的四個角上，正好把屋子與外界隔開
   */
  for (const corner of [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 1 }, { x: 1, z: 1 }]) {
    const bambooX = centerX + corner.x * (hallHalf + 2)
    const bambooZ = centerZ + corner.z * (hallHalf + 2)
    for (let level = 0; level < 4 + Math.floor(random() * 3); level++) {
      setBlock(state, bambooX, groundY + level, bambooZ, BlockId.BAMBOO_BLOCK)
    }
  }

  /** 牆根的青苔與蕨，背陰的那一面才長得起來 */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.22, (pick) => {
    return pick() < 0.6 ? BlockId.FERN : BlockId.STONE_PLANT
  }, new Set([BlockId.STONE_TILE]))
}

/**
 * 地獄谷
 *
 * 日本把冒著熱氣、寸草不生的火山窪地叫「地獄」。這一座照著那個樣子做：
 * 一池滾著的熔岩、燒黑的地、幾根站著死掉的枯木，以及一圈攔住人的柵欄。
 *
 * 造景只講一件事：這裡的熱是從底下來的。
 * 所以中央是往下挖的池而不是堆起來的山，池緣的黑石往外逐漸變回一般的岩，
 * 地面上零星幾格餘燼——那是地下的熱透出地表的地方。
 *
 * 柵欄是重點而不是配件。真正的別府地獄每一處都圍著欄杆，
 * 因為那水是滾的。圍起來這件事本身就在說「這東西是危險的」，
 * 而整座禪庭裡沒有第二個地方需要攔人
 */
export function buildJigokuGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-jigoku')
  const deckY = getDeckBlockY(garden)
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  /**
   * 地是燒過的
   *
   * 由外往內三層：一般的石板、被烤過的黑石、最靠近裂縫的黑曜石磚。
   * 一層一層鋪上去而不是一次畫好，交界才會是不規則的
   */
  paveDeck(state, garden, BlockId.STONE_TILE)
  fillNoisyDisc(state, centerX, centerZ, inner - 1, deckY, BlockId.COBBLESTONE, 1.6)
  fillNoisyDisc(state, centerX, centerZ, 4.2, deckY, BlockId.OBSIDIAN_BRICKS, 1.4)

  /**
   * 裂谷
   *
   * 一道橫貫整座木座的裂縫，而不是中央挖一個圓池。
   * 差別在於「地被扯開」與「地上有個洞」是兩件事：
   * 洞是有邊界的，看得到它到哪裡為止；裂縫兩端都伸出木座之外，
   * 看不出從哪裡來、到哪裡去——那才有大地裂開的感覺。
   *
   * 走向刻意不是直線。每一格的中心線跟著一道正弦擺，寬度也跟著變，
   * 於是它時寬時窄、微微彎曲。筆直的溝看起來是人挖的水道。
   *
   * 關鍵是「谷」不能用挖的。往下挖四格就穿過箱底，
   * 露出來的是整個世界的地底填充料——那不是岩層，換什麼材質都不對。
   * 改成熔岩留在甲板的高度、兩側的地往上堆：同樣是一道低於視線的縫，
   * 但整座箱庭沒有一格低於沙面，白沙從此無從露出來
   */
  /** 谷壁最高堆幾格 */
  const BANK_HEIGHT = 4
  /**
   * 熔岩往下填幾格
   *
   * 兩格是上限，不是隨手取的數字。人沉到池底時腳踩在 deckY - 2 的底面，
   * 眼睛在那之上一點六二格——再深一格，視線就會掉到白沙的水平線底下。
   *
   * 兩格已經夠了：踩得進去、沉得下去，而池底仍然高過沙面
   */
  const LAVA_DEPTH = 2
  /** 裂縫伸到離邊緣幾格為止，以及最後幾格用來收口 */
  const RIFT_REACH = garden.halfSize - 2
  const RIFT_TAPER = 3

  const measureRiftShape = (offsetX: number): { center: number; halfWidth: number } => {
    const fromEnd = RIFT_REACH - Math.abs(offsetX)
    const taper = Math.max(0, Math.min(1, fromEnd / RIFT_TAPER))

    return {
      center: Math.sin(offsetX * 0.42) * 1.9 + Math.sin(offsetX * 0.17) * 1.1,
      halfWidth: (1.1 + Math.sin(offsetX * 0.31 + 1.7) * 0.8) * taper,
    }
  }

  /**
   * 谷壁的高度先算成一張圖，鬆弛過再堆
   *
   * 逐格取噪聲決定高度是行不通的——噪聲相鄰兩格可以差很多，
   * 堆出來就是一整排斷崖，比等高的長牆更難走。
   *
   * 所以分成三步：先算出每一格「想要」多高，
   * 再跑幾輪鬆弛把落差壓到一格以內（誰比鄰居高超過一格就被削平），
   * 最後才堆。這樣起伏是自然的，而「走得上去」是算出來的保證，
   * 不是調參數調到剛好
   */
  const bankSize = garden.halfSize * 2 + 1
  const heightList = new Int8Array(bankSize * bankSize)
  const lavaList = new Uint8Array(bankSize * bankSize)
  const indexAt = (offsetX: number, offsetZ: number): number =>
    (offsetZ + garden.halfSize) * bankSize + (offsetX + garden.halfSize)

  for (let offsetX = -garden.halfSize; offsetX <= garden.halfSize; offsetX++) {
    const { center, halfWidth } = measureRiftShape(offsetX)

    for (let offsetZ = -garden.halfSize; offsetZ <= garden.halfSize; offsetZ++) {
      const index = indexAt(offsetX, offsetZ)
      const distance = Math.abs(offsetZ - center)

      if (distance <= halfWidth) {
        lavaList[index] = 1
        continue
      }

      /** 離裂縫越遠越高，再乘上一層低頻噪聲讓岩脊忽高忽低 */
      const ridge = fbm2D((centerX + offsetX) * 0.13, (centerZ + offsetZ) * 0.13, 2, 0.5)
      heightList[index] = Math.max(0, Math.min(
        BANK_HEIGHT,
        Math.round((distance - halfWidth) * 0.8 * (0.4 + ridge * 1.4)),
      ))
    }
  }

  /** 鬆弛：跑到沒有任何一格比鄰居高出一格以上為止 */
  for (let pass = 0; pass < BANK_HEIGHT + 2; pass++) {
    for (let offsetX = -garden.halfSize; offsetX <= garden.halfSize; offsetX++) {
      for (let offsetZ = -garden.halfSize; offsetZ <= garden.halfSize; offsetZ++) {
        const index = indexAt(offsetX, offsetZ)
        if (lavaList[index])
          continue

        let lowest = BANK_HEIGHT
        for (const side of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nextX = offsetX + side[0]!
          const nextZ = offsetZ + side[1]!
          /** 木座外面與熔岩面都算高度零，谷壁因此在邊緣與水際自然收攏 */
          const outside = Math.abs(nextX) > garden.halfSize || Math.abs(nextZ) > garden.halfSize
          const neighbour = outside || lavaList[indexAt(nextX, nextZ)]
            ? 0
            : heightList[indexAt(nextX, nextZ)]!
          lowest = Math.min(lowest, neighbour)
        }

        heightList[index] = Math.min(heightList[index]!, lowest + 1)
      }
    }
  }

  for (let offsetX = -garden.halfSize; offsetX <= garden.halfSize; offsetX++) {
    for (let offsetZ = -garden.halfSize; offsetZ <= garden.halfSize; offsetZ++) {
      const index = indexAt(offsetX, offsetZ)
      const x = centerX + offsetX
      const z = centerZ + offsetZ

      if (lavaList[index]) {
        /**
         * 熔岩要有深度，但底下一定要有石頭
         *
         * 只鋪一層的話那是一張貼在地上的橘色貼圖，踩進去踩不下去。
         * 但也不能一路往下填：填穿了人會沉到白沙的水平線底下。
         *
         * 所以是「挖兩格、墊一層」。池底那一格明寫成黑曜石磚，
         * 不靠木座的填充料剛好在那裡——那是別人的實作細節，
         * 哪天箱底的做法變了，這裡會靜靜地破一個洞
         */
        for (let depth = 0; depth < LAVA_DEPTH; depth++) {
          setBlock(state, x, deckY - depth, z, BlockId.LAVA)
        }
        setBlock(state, x, deckY - LAVA_DEPTH, z, BlockId.OBSIDIAN_BRICKS)
        continue
      }

      for (let level = 0; level < heightList[index]!; level++) {
        setBlock(state, x, groundY + level, z, BlockId.OBSIDIAN_BRICKS)
      }
    }
  }
  /**
   * 鳥居與石碑
   *
   * 原本這裡架了一座跨過裂縫的木橋。橋是錯的：橋的意思是「過得去」，
   * 而這座箱庭要說的是相反的事——這裡不能過，也不該過。
   *
   * 日本那些冒著熱氣、寸草不生的火山窪地，人蓋在旁邊的從來不是橋，
   * 是鳥居與石碑：一道門標出界線，一塊碑寫上這裡是什麼。
   * 那才是人面對這種地方真正會做的事——不是征服它，是給它一個名字。
   *
   * 鳥居立在南岸、正對著裂縫最寬的那一段。走過去會先穿過那道門，
   * 然後才看見底下那條發光的縫
   */
  placeTorii(state, centerX, groundY, centerZ + garden.halfSize - 2, true)

  /** 門後的石碑，刻著紋樣的那一種。碑前擺一對石燈籠 */
  const steleZ = centerZ + garden.halfSize - 4
  setBlock(state, centerX, groundY, steleZ, BlockId.RUNE_STONE)
  setBlock(state, centerX, groundY + 1, steleZ, BlockId.RUNE_STONE)
  setBlock(state, centerX, groundY + 2, steleZ, BlockId.STONE_SLAB)
  placeStoneLantern(state, centerX - 2, groundY, steleZ)
  placeStoneLantern(state, centerX + 2, groundY, steleZ)
  /**
   * 從裂縫往外散開的餘燼
   *
   * 越靠近縫越多、越遠越稀。這些格子自己會發光，
   * 夜裡整片地面因此泛著暗紅，而不是只有那道縫亮著
   */
  for (let offsetX = -inner; offsetX <= inner; offsetX++) {
    const { center, halfWidth } = measureRiftShape(offsetX)
    for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
      const distance = Math.abs(offsetZ - center) - halfWidth
      if (distance < 1.6 || distance > inner)
        continue
      if (random() > 0.2 * (1 - distance / inner))
        continue

      setBlock(state, centerX + offsetX, deckY, centerZ + offsetZ, BlockId.EMBER)
    }
  }

  /**
   * 站著死掉的枯木
   *
   * 不是倒下的木頭，是還立著但已經燒焦的。
   * 全部擺在遠離裂縫的兩端——它們是被熱氣慢慢烤死的，離縫越近死得越徹底。
   *
   * 用炭黑那一套而不是各處通用的曬白枯木：曬白的意思是「這裡很乾」，
   * 而這座箱庭要說的是「這裡很燙」。同一根木頭，兩種死法
   */
  for (const spot of [{ x: -5, z: -5 }, { x: 4, z: 5 }, { x: -4, z: 4 }]) {
    placeDeadTree(
      state,
      centerX + spot.x,
      groundY,
      centerZ + spot.z,
      3 + Math.floor(random() * 3),
      CHARRED_LOG_SET,
    )
  }

  /**
   * 幾塊白骨
   *
   * 地獄這個名字不是白叫的。但只擺兩塊、而且擺在角落——
   * 多了就變成佈景，少而不明顯才像是本來就在那裡
   */
  setDecoration(state, centerX + 5, groundY, centerZ - 5, BlockId.BONES)
  setDecoration(state, centerX - 6, groundY, centerZ + 5, BlockId.BONES)

  /**
   * 熱氣烤不死的那幾種
   *
   * 只剩枯草與礫石。開花的東西一株都沒有——
   * 這是整座禪庭唯一不長花的箱庭，那件事本身就是它的說明
   */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.2, (pick) => {
    const roll = pick()
    if (roll < 0.5)
      return BlockId.DRY_SHRUB
    if (roll < 0.8)
      return BlockId.DRY_GRASS
    return BlockId.STONE_PLANT
  }, new Set([BlockId.STONE_TILE, BlockId.COBBLESTONE]))
}
