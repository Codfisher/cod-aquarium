import type { GardenDefinition } from './garden-layout'
import { createSeededRandom, fbm2D } from '../../utils/noise'
import { BlockId } from '../block/block-constants'
import { CICADA_HUB_GATE_OFFSET } from '../realm/cicada/cicada-layout'
import { SONGBIRD_HUB_GATE_OFFSET } from '../realm/songbird/songbird-layout'
import { setBlock } from '../world/world-access'
import {
  capWithSnow,
  carveWater,
  CHARRED_LOG_SET,
  DECK_MARGIN,
  fillNoisyDisc,
  fillSquare,
  getNoisyDistance,
  paveDeck,
  placeBonsaiPine,
  placeDeadTree,
  placeOakTree,
  placeStandingStone,
  placeStoneLantern,
  placeTorii,
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

  /**
   * 門前那幾步
   *
   * 通往百囀林苑的門緊挨著飲水盤東邊（SONGBIRD_HUB_GATE_OFFSET）、門洞朝東，
   * 從木座東緣到門前這一段的花草拔掉，看得出門是從那一頭走過來的。
   * 花照樣撒完才拔，亂數的順序不變，其他格子的花一株不差
   */
  for (let offsetX = SONGBIRD_HUB_GATE_OFFSET.x + 2; offsetX <= inner; offsetX++) {
    setBlock(state, centerX + offsetX, groundY, centerZ + SONGBIRD_HUB_GATE_OFFSET.z, BlockId.AIR)
  }
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
 * 地面上只留一樣人待過的痕跡：一道朝南的緣廊。
 * 夏天的日式庭園就是這樣避暑的
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
    /**
     * 樹幹一律七格
     *
     * 原本六到七格隨機。四棵樹圍住的那片陰影正中立著通往蟬雨深林的門（CICADA_HUB_GATE_OFFSET），
     * 笠木在門腳以上四格，六格高的樹最下層樹冠也在那個高度，東北那棵的葉子會插進笠木。
     * 亂數照樣抽，其他造景的位置不變
     */
    const trunkHeight = Math.max(7, 6 + Math.floor(random() * 2))
    placeOakTree(state, centerX + spot.x, groundY, centerZ + spot.z, trunkHeight)
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
  }
  /**
   * 廊的兩端各立一根柱子，撐起後面那道短簷
   *
   * 用圍籬而不是整格的原木。原木佔滿一整格，兩根立在只有七格寬的廊兩端
   * 像兩堵牆，人坐在中間是被夾著的；圍籬是立在格子中央的細柱，
   * 同樣撐得住那道簷，卻讓視線穿得過去。
   *
   * 圍籬會朝旁邊的實心方塊長橫桿，但這兩根不會：
   * 廊上那幾個坐墊是半磚（非 cube 一律算裝飾），
   * 前後左右其餘幾格都是空的
   */
  for (const offsetX of [-3, 3]) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, centerX + offsetX, groundY + level, verandaZ + 1, BlockId.FENCE)
    }
    setBlock(state, centerX + offsetX, groundY + 3, verandaZ + 1, BlockId.DARK_PLANKS)
  }
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    setBlock(state, centerX + offsetX, groundY + 3, verandaZ + 1, BlockId.DARK_PLANKS)
    setBlock(state, centerX + offsetX, groundY + 3, verandaZ, BlockId.DARK_STAIRS_NORTH)
  }

  /**
   * 廊上的坐墊，夏天的午後就是在這裡待過去的
   *
   * 隔一格擺一個。連著排會變成一條紅色的帶子，
   * 中間空出來的木板才讓人看得出「這裡可以坐幾個人」。
   *
   * 高度取 groundY——廊板在 deckY，坐墊就落在它正上方那一格。
   * 這一格原本填著木半磚，坐墊疊上去會浮在半格高的地方，
   * 所以那排半磚整個拿掉了，廊面直接就是那層木板
   */
  for (const offsetX of [-3, -1, 1, 3]) {
    setBlock(state, centerX + offsetX, groundY, verandaZ, BlockId.CUSHION)
  }

  /**
   * 簷下的吊燈
   *
   * 原本是一格和紙燈箱擺在廊板上方一格的位置，下面沒有東西托著它，
   * 看起來就是一顆浮在半空中的發光方塊。
   *
   * 廊的正上方 groundY + 3 就是那道短簷，所以換成吊燈、往上挪一格，
   * 它就貼著簷板垂下來了——同一張貼圖、同一個色調，
   * 差別只在它現在有了來處
   */
  setBlock(state, centerX + 2, groundY + 2, verandaZ, BlockId.HANGING_LAMP)

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

  /**
   * 緣廊到門前那幾步
   *
   * 門立在樹下陰影正中（CICADA_HUB_GATE_OFFSET）、門洞朝南對著緣廊，
   * 從廊板往北到門前這一段的草拔掉，坐在廊上看得出那是一條走過去的路
   */
  for (let offsetZ = CICADA_HUB_GATE_OFFSET.z + 2; offsetZ < verandaZ - centerZ; offsetZ++) {
    setBlock(state, centerX + CICADA_HUB_GATE_OFFSET.x, groundY, centerZ + offsetZ, BlockId.AIR)
  }
}

/**
 * 雪聽庭
 *
 * 這一座的造景規矩與別座相反：不是「擺什麼進去」，是「留下多少」。
 *
 * 能見度只有十七格，而木座是三十一格見方——
 * 站在中央看不到任何一道邊，於是這裡感覺不出自己站在一個台子上。
 * 那正是要的效果：暴風雪沒有邊界。
 *
 * 所以東西要少而且要疏，讓人一次只看得見一樣：
 * 走幾步遇上一盞燈籠，再走幾步一棵被壓彎的松從白裡浮出來，
 * 最後才看到那間小屋。全部同時看得見的話，這座箱庭就變小了
 */
export function buildBlizzardGarden(state: Uint8Array, garden: GardenDefinition): void {
  const random = createSeededRandom('garden-blizzard')
  const groundY = getDeckGroundY(garden)
  const { x: centerX, z: centerZ } = garden.center
  const inner = garden.halfSize - DECK_MARGIN

  paveDeck(state, garden, BlockId.SNOW)

  /**
   * 積雪的深淺
   *
   * 整片一樣厚的雪是一塊白色的板子。用噪聲鋪一層薄雪上去，
   * 有的地方厚、有的地方露出底下那層——風把雪吹成一道一道的，
   * 那些起伏才是「這裡颳著風」唯一看得見的證據
   */
  for (let offsetX = -inner; offsetX <= inner; offsetX++) {
    for (let offsetZ = -inner; offsetZ <= inner; offsetZ++) {
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      /** 拉長成條狀：x 取得比 z 密，雪紋因此順著風向拖出去 */
      if (fbm2D(x * 0.32, z * 0.11, 3, 0.5) < 0.48)
        continue

      setBlock(state, x, groundY, z, BlockId.SNOW_LAYER)
    }
  }

  /**
   * 人造物只有石燈籠
   *
   * 這裡先後蓋過一間避雪小屋、立過兩組雪吊り，兩個都拿掉了。
   * 理由是同一個：能見度只有十一格，任何一件有體積的東西
   * 一出現就佔滿整個畫面，而暴風雪的重點是「什麼都看不到」——
   * 建築在這裡不是造景，是把主題擋住的東西。
   *
   * 石燈籠剛好：它細、它矮、它自己會發光。走在白裡時
   * 你先看到的是一團暈，走近三步才看得出那是一盞燈——
   * 而那正是暴風雪裡唯一會發生的事
   */
  placeStoneLantern(state, centerX - 4, groundY, centerZ + 4)
  placeStoneLantern(state, centerX + 4, groundY, centerZ - 3)
  placeStoneLantern(state, centerX + 1, groundY, centerZ + 5)

  /**
   * 被雪壓彎的松
   *
   * 全部歪向同一邊，因為風只有一個方向。
   * 松是長出來的不是蓋出來的，所以它們留著
   */
  placeBonsaiPine(state, centerX + 3, groundY, centerZ + 2, -1, 0)
  placeBonsaiPine(state, centerX - 3, groundY, centerZ - 3, -1, 0)
  placeBonsaiPine(state, centerX - 1, groundY, centerZ + 1, -1, 0)

  /**
   * 兩塊露出雪面的石頭，不能再多
   *
   * 原本撒了七塊，理由是「一片全白沒有東西可以定位」。
   * 但那個理由是反的：暴風雪本來就該讓人失去定位，
   * 石頭一多，這裡就變成一座擺著石頭的雪地，而不是一場暴風雪。
   *
   * 留兩塊，剛好夠讓人知道自己有在移動，不夠讓人知道自己在哪裡
   */
  placeStandingStone(state, centerX - 4, groundY, centerZ - 4, 1, BlockId.COBBLESTONE)
  placeStandingStone(state, centerX + 3, groundY, centerZ - 2, 2, BlockId.COBBLESTONE)

  /** 雪地裡活得下來的只有枯枝，而且是曬白的那一種 */
  scatterOnGround(state, centerX, centerZ, inner, groundY, random, 0.05, () => (
    BlockId.DRY_SHRUB
  ), new Set([BlockId.SNOW]))

  /**
   * 最後替所有東西蓋上一層雪
   *
   * 這一步必須擺在最末尾：雪是積在東西上面的，
   * 樹、石燈籠、石頭全部就位之後才輪到它。
   *
   * 少了這一步，這裡是「一片雪地上擺著幾樣沒沾到雪的東西」——
   * 那不是暴風雪，那是有人把雪掃乾淨了。
   * 掃過一遍之後，松樹的樹冠、燈籠的笠、石頭的頂面都各壓著一片白
   */
  capWithSnow(state, centerX, centerZ, inner, groundY, groundY + 10)
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

      /**
       * 鳥居與熔岩縫之間那一塊不堆岸
       *
       * 通往湯煙谷的門立在這裡（JIGOKU_GATE_OFFSET），旁邊是木牌、石碑與那一對石燈籠，
       * 岸堆上來的話門柱與燈籠會半截埋在黑曜石裡。整平成一小塊台地，像是人在縫前清出來的一塊地
       */
      if (Math.abs(offsetX) <= 4 && offsetZ >= 2)
        continue

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

  /**
   * 門後的石碑，刻著紋樣的那一種，以及一對石燈籠
   *
   * 石碑原本立在鳥居正後方兩格，那個位置讓給了通往湯煙谷的門（JIGOKU_GATE_OFFSET）：
   * 穿過鳥居先遇到的是這道門，門後兩步就是那條發光的縫。
   * 石碑往東挪四格、往南一格，站在縫的邊上；石燈籠從碑的兩側移到鳥居與門之間，夾著走道
   */
  const steleZ = centerZ + garden.halfSize - 3
  setBlock(state, centerX + 4, groundY, steleZ, BlockId.RUNE_STONE)
  setBlock(state, centerX + 4, groundY + 1, steleZ, BlockId.RUNE_STONE)
  setBlock(state, centerX + 4, groundY + 2, steleZ, BlockId.STONE_SLAB)
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
