import type { LocalizedText } from '../soundscape/type'
import { WORLD_SIZE } from '../world/world-constants'
import { SAND_LEVEL } from './garden-constants'

/**
 * 箱庭代號
 *
 * 分組的依據不是「地理上的生態區」，而是「聲音的性質」：
 * 連續的寬頻風聲、有週期的水聲、稀疏的瞬態、密集的高頻顆粒⋯⋯
 * 同一種質地的聲音收進同一座箱庭，走一趟就是一場聽覺的分類練習
 */
export type GardenId =
  /** 枯山水，全庭最安靜的地方，只有一滴水 */
  | 'wheatfield'
  // ── 外圈八座大箱庭 ──
  /** 連續寬頻的風穿樹梢，配上高頻的鳥囀 */
  | 'forest'
  /** 乾燥、粗糙的沙沙聲 */
  | 'autumn'
  /** 高處的嘯風，稀薄而遠 */
  | 'alpine'
  /** 沒有起伏的白噪：溪流與瀑布 */
  | 'river'
  /** 有呼吸週期的水聲：拍岸的浪 */
  | 'coast'
  /** 低頻、斷續、彼此答話的蛙鳴 */
  | 'swamp'
  /** 人造的聲音：人聲、鐘、家畜 */
  | 'village'
  /** 稀疏的瞬態配上長殘響：洞頂的滴水 */
  | 'cave'
  // ── 內圈八座小箱庭 ──
  /** 一團持續的低頻劈啪 */
  | 'campfire'
  /** 石室的迴響，聲音進去繞好幾圈才出來 */
  | 'ruins'
  /** 開闊而柔的風，沒有東西可以反射 */
  | 'meadow'
  /** 家畜零星的叫聲 */
  | 'pasture'
  /** 一整團密集的中頻嗡鳴 */
  | 'apiary'
  /** 靜水面上的點狀聲響 */
  | 'pond'
  /** 雨打在葉子上，密集而柔軟 */
  | 'rainvale'
  /** 高頻、顆粒感、成片的蟲鳴 */
  | 'insect'
  // ── 中圈四座小箱庭 ──
  /** 只在黑暗中出現的聲音 */
  | 'rainhall'
  /** 不摻任何風聲水聲的純旋律 */
  | 'songbird'
  /** 盛夏的蟬，密到分不出是幾隻，而且一隻都看不見 */
  | 'cicada'
  /** 只剩一種聲音的地方：風把別的全部吹走了 */
  | 'blizzard'
  /** 從地底下上來的低頻，黏稠而緩慢 */
  | 'jigoku'

export interface GardenDefinition {
  id: GardenId;
  title: LocalizedText;
  /** 聲音性質的一句話，說明頁與選單都拿來當副標 */
  timbre: LocalizedText;
  icon: string;
  center: { x: number; z: number };
  /**
   * 木座半邊長
   *
   * 木座是 (halfSize × 2 + 1) 見方的正方形
   */
  halfSize: number;
  /**
   * 木座從沙面算起的總高度，含甲板那一層
   *
   * 全部只有一格。木座是用來「把庭園端起來」的，不是一座高台：
   * 疊厚了會變成擋在庭園前面的一堵牆，
   * 一格剛好看得出厚度，又不會擋住裡面的東西。
   *
   * 甲板本身就佔一格，所以這個數字要含它在內——
   * 否則設成一會做出兩格高的台子
   */
  pedestalHeight: number;
  /**
   * 快速前往的落點
   *
   * 預設是木座正中央。但岩響窟的正中央是那座山的山頂，
   * 傳過去會直接站在岩體上，還得自己想辦法繞下來找洞口，
   * 所以那一座另外指定落點
   */
  travelPoint?: { x: number; z: number };
}

/** 禪庭的正中心，也是循環空間的中心 */
export const GARDEN_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 外圈大箱庭的排列半徑
 *
 * 這個數字被兩頭夾住：再往外一點，最外側的木座就會離循環邊界太近，
 * 玩家跨過邊界時會看見景物瞬間跳掉；再往內一點，
 * 內外兩圈就擠在一起，霧裡看過去會變成一整片而不是一座一座
 */
const OUTER_RING_RADIUS = 82
/** 內圈小箱庭的排列半徑 */
const INNER_RING_RADIUS = 36
/**
 * 中圈小箱庭的排列半徑
 *
 * 夾在內外兩圈之間那段空白。角度刻意與內圈的四座對齊，
 * 從中心往外走會是「小、小、大」三段，而不是走幾步就撞到一座
 */
const MIDDLE_RING_RADIUS = 58

/** 大箱庭與小箱庭的尺寸 */
const LARGE_HALF_SIZE = 16
const SMALL_HALF_SIZE = 7

/**
 * 依角度取得環上的座標
 *
 * 角度以正東為零、順時針遞增，剛好對得上 x / z 都往正向增加的世界座標
 */
function getRingPosition(radius: number, degree: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI

  return {
    x: Math.round(GARDEN_CENTER.x + Math.cos(radian) * radius),
    z: Math.round(GARDEN_CENTER.z + Math.sin(radian) * radius),
  }
}

/**
 * 箱庭佈局
 *
 * 外圈八座大的排在正方位與四隅，內圈八座小的插在兩者之間的角度上，
 * 正中央留給枯山水。整體是一個同心的排列，
 * 但每一座的內容各自偏心，走起來不會像在逛棋盤。
 *
 * 半徑選得剛好讓相鄰兩座的距離接近霧氣的終點：
 * 站在一座箱庭上時，隔壁那座正在霧裡若隱若現，
 * 走過去的路上前面的浮出來、後面的沉回去，看起來就沒有盡頭
 */
export const GARDEN_LIST: GardenDefinition[] = [
  {
    id: 'wheatfield',
    title: { 'zh-hant': '麥浪田', 'en': 'Wheat Field' },
    timbre: { 'zh-hant': '風行處，金浪低伏', 'en': 'Wind sweeps past; golden waves bow low' },
    icon: 'i-material-symbols:grass',
    center: GARDEN_CENTER,
    halfSize: 11,
    pedestalHeight: 1,
  },

  // ── 外圈：八座大箱庭，人走得進去 ──
  {
    id: 'forest',
    title: { 'zh-hant': '松籟林', 'en': 'Pine Grove' },
    timbre: { 'zh-hant': '松梢風不歇，幽鳥自高鳴', 'en': 'Wind lingers in pines; distant birds call high' },
    icon: 'i-material-symbols:forest',
    center: getRingPosition(OUTER_RING_RADIUS, 270),
    halfSize: LARGE_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'autumn',
    title: { 'zh-hant': '金葉苑', 'en': 'Golden Court' },
    timbre: { 'zh-hant': '枯葉翻風，一觸成響', 'en': 'Dry leaves turn, crisp upon the breeze' },
    icon: 'i-material-symbols:park',
    center: getRingPosition(OUTER_RING_RADIUS, 315),
    halfSize: LARGE_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'alpine',
    title: { 'zh-hant': '雪稜丘', 'en': 'Snow Ridge' },
    timbre: { 'zh-hant': '孤稜風咽，餘聲落遠山', 'en': 'Wind skirts the ridge, echoed far beyond' },
    icon: 'i-material-symbols:landscape',
    center: getRingPosition(OUTER_RING_RADIUS, 0),
    halfSize: LARGE_HALF_SIZE,
    pedestalHeight: 1,
    /** 正中央是岩稜的稜線，落在山腳的雪地上才站得住 */
    travelPoint: {
      x: getRingPosition(OUTER_RING_RADIUS, 0).x + -12,
      z: getRingPosition(OUTER_RING_RADIUS, 0).z + 10,
    },
  },
  {
    id: 'village',
    title: { 'zh-hant': '市井坊', 'en': 'Market Quarter' },
    timbre: { 'zh-hant': '萬籟皆寂，獨此聞人聲', 'en': 'All rests quiet, save the hum of life' },
    icon: 'i-material-symbols:home-work',
    center: getRingPosition(OUTER_RING_RADIUS, 45),
    halfSize: LARGE_HALF_SIZE,
    pedestalHeight: 1,
    /** 正中央是那口井，落在旁邊的石板廣場上 */
    travelPoint: {
      x: getRingPosition(OUTER_RING_RADIUS, 45).x + 0,
      z: getRingPosition(OUTER_RING_RADIUS, 45).z + 5,
    },
  },
  {
    id: 'swamp',
    title: { 'zh-hant': '蛙聲澤', 'en': 'Frog Marsh' },
    timbre: { 'zh-hant': '一蛙初啼，群澤齊應', 'en': 'One frog calls; the marsh awakes in chorus' },
    icon: 'i-material-symbols:water-drop',
    center: getRingPosition(OUTER_RING_RADIUS, 90),
    halfSize: LARGE_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'coast',
    title: { 'zh-hant': '潮汐磯', 'en': 'Tidal Rocks' },
    timbre: { 'zh-hant': '潮汐往復，吞吐海之息', 'en': 'Waves ebb and swell, the ocean breathes' },
    icon: 'i-material-symbols:waves',
    center: getRingPosition(OUTER_RING_RADIUS, 135),
    halfSize: LARGE_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'river',
    title: { 'zh-hant': '遣水', 'en': 'Garden Stream' },
    timbre: { 'zh-hant': '潺湲無始，流響亦無終', 'en': 'Flowing without start, sounding without end' },
    icon: 'i-material-symbols:water',
    center: getRingPosition(OUTER_RING_RADIUS, 180),
    halfSize: LARGE_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'cave',
    title: { 'zh-hant': '岩響窟', 'en': 'Echo Cavern' },
    timbre: { 'zh-hant': '幽穴一滴，空谷久迴響', 'en': 'A single drop falls; the hollow keeps its echo' },
    icon: 'i-material-symbols:dark-mode',
    center: getRingPosition(OUTER_RING_RADIUS, 225),
    halfSize: LARGE_HALF_SIZE,
    pedestalHeight: 1,
    /** 落在洞口外兩步，一抬頭就看得到那個黑漆漆的入口 */
    travelPoint: {
      x: getRingPosition(OUTER_RING_RADIUS, 225).x + 14,
      z: getRingPosition(OUTER_RING_RADIUS, 225).z + 14,
    },
  },

  // ── 內圈：八座小箱庭，插在大箱庭之間 ──
  {
    id: 'campfire',
    title: { 'zh-hant': '爐火壇', 'en': 'Fire Pit' },
    timbre: { 'zh-hant': '薪火微吟，時迸清脆', 'en': 'Embers softly hum, bursting with sudden sparks' },
    icon: 'i-material-symbols:local-fire-department',
    center: getRingPosition(INNER_RING_RADIUS, 247.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'ruins',
    title: { 'zh-hant': '石廊跡', 'en': 'Stone Colonnade' },
    timbre: { 'zh-hant': '殘廊鎖風，餘音逡巡難去', 'en': 'Colonnades catch the wind; echoes wander and stay' },
    icon: 'i-material-symbols:temple-buddhist',
    center: getRingPosition(INNER_RING_RADIUS, 292.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'meadow',
    title: { 'zh-hant': '草苑', 'en': 'Meadow Court' },
    timbre: { 'zh-hant': '原野無界，風過不留痕', 'en': 'A boundless meadow where sound finds nothing to strike' },
    icon: 'i-material-symbols:grass',
    center: getRingPosition(INNER_RING_RADIUS, 337.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'pasture',
    title: { 'zh-hant': '牧野', 'en': 'Pasture' },
    timbre: { 'zh-hant': '羊鳴隨風轉，蹄踏草色新', 'en': 'A wandering bleat drifts across grazing grass' },
    icon: 'i-material-symbols:pets',
    center: getRingPosition(INNER_RING_RADIUS, 22.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'apiary',
    title: { 'zh-hant': '蜂巢圃', 'en': 'Bee Yard' },
    timbre: { 'zh-hant': '萬翼同振，織作一聲', 'en': 'A thousand wings weave a single hum' },
    icon: 'i-material-symbols:hive',
    center: getRingPosition(INNER_RING_RADIUS, 67.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
    /** 正中央疊著蜂箱，落在它前面的花叢裡 */
    travelPoint: {
      x: getRingPosition(INNER_RING_RADIUS, 67.5).x,
      z: getRingPosition(INNER_RING_RADIUS, 67.5).z + 4,
    },
  },
  {
    id: 'pond',
    title: { 'zh-hant': '水鏡池', 'en': 'Mirror Pond' },
    timbre: { 'zh-hant': '鏡水涵虛，偶落微波響', 'en': 'Glass-still water, stirred by fleeting ripples' },
    icon: 'i-material-symbols:water-lux',
    center: getRingPosition(INNER_RING_RADIUS, 112.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'rainvale',
    title: { 'zh-hant': '聽雨亭', 'en': 'Rain Pavilion' },
    timbre: { 'zh-hant': '翠葉沾雨，碎玉聲甚柔', 'en': 'Rain taps the leaves, soft as falling jade' },
    icon: 'i-material-symbols:rainy',
    center: getRingPosition(INNER_RING_RADIUS, 157.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'insect',
    title: { 'zh-hant': '蟲聲叢', 'en': 'Insect Thicket' },
    timbre: { 'zh-hant': '微茫夜草，碎吟遍野深', 'en': 'Faint whispers rustle through the night grass' },
    icon: 'i-material-symbols:emoji-nature',
    center: getRingPosition(INNER_RING_RADIUS, 202.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },

  // ── 中圈：四座小箱庭，插在內外兩圈之間 ──
  {
    id: 'rainhall',
    title: { 'zh-hant': '雨聽堂', 'en': 'Rain Hall' },
    timbre: { 'zh-hant': '深堂晏坐，晴內聽滂沱', 'en': 'Sheltered inside, listening to the torrent' },
    icon: 'i-material-symbols:cottage',
    center: getRingPosition(MIDDLE_RING_RADIUS, 22.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'songbird',
    title: { 'zh-hant': '鳴禽庭', 'en': 'Songbird Court' },
    timbre: { 'zh-hant': '風泉俱寂，唯留清羽囀', 'en': 'Wind and stream quiet; pure song fills the air' },
    icon: 'i-material-symbols:raven',
    center: getRingPosition(MIDDLE_RING_RADIUS, 202.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
  },
  {
    id: 'cicada',
    title: { 'zh-hant': '蟬時雨', 'en': 'Cicada Shower' },
    timbre: { 'zh-hant': '濃蔭蔽日，蟬雨落無痕', 'en': 'Shaded boughs roar, a shower unseen' },
    icon: 'i-material-symbols:sunny',
    center: getRingPosition(MIDDLE_RING_RADIUS, 292.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
    travelPoint: {
      x: getRingPosition(MIDDLE_RING_RADIUS, 292.5).x,
      z: getRingPosition(MIDDLE_RING_RADIUS, 292.5).z + 4,
    },
  },
  {
    id: 'blizzard',
    title: { 'zh-hant': '吹雪野', 'en': 'Whiteout Field' },
    timbre: { 'zh-hant': '朔風吞萬籟，天地唯蒼茫', 'en': 'Fierce winds swallow all sound into white silence' },
    icon: 'i-material-symbols:weather-snowy',
    center: getRingPosition(MIDDLE_RING_RADIUS, 112.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
    travelPoint: {
      x: getRingPosition(MIDDLE_RING_RADIUS, 112.5).x,
      z: getRingPosition(MIDDLE_RING_RADIUS, 112.5).z + 6,
    },
  },
  {
    id: 'jigoku',
    title: { 'zh-hant': '地獄谷', 'en': 'Hell Valley' },
    timbre: { 'zh-hant': '地脈暗湧，底處慢沸鳴', 'en': 'Earth stirs below, thick and slowly boiling' },
    icon: 'i-material-symbols:volcano',
    center: getRingPosition(MIDDLE_RING_RADIUS, 247.5),
    halfSize: SMALL_HALF_SIZE,
    pedestalHeight: 1,
    travelPoint: {
      x: getRingPosition(MIDDLE_RING_RADIUS, 247.5).x,
      z: getRingPosition(MIDDLE_RING_RADIUS, 247.5).z + 6,
    },
  },
]

const GARDEN_MAP = new Map(GARDEN_LIST.map((garden) => [garden.id, garden]))

/** 依代號取得箱庭，代號來自同一份清單，取不到就是寫錯了 */
export function getGarden(id: GardenId): GardenDefinition {
  const garden = GARDEN_MAP.get(id)
  if (!garden) {
    throw new Error(`[Garden] 找不到箱庭：${id}`)
  }

  return garden
}

/** 木座甲板那一層方塊的高度，也就是木座最上面那一格 */
export function getDeckBlockY(garden: GardenDefinition): number {
  return SAND_LEVEL + garden.pedestalHeight
}

/** 站在木座甲板上的腳底整數高度 */
export function getDeckGroundY(garden: GardenDefinition): number {
  return getDeckBlockY(garden) + 1
}

/**
 * 座標落在哪一座箱庭上
 *
 * 用棋盤距離判斷，因為木座是正方形的。
 * 判定範圍比木座本身寬一點，站在木階上或剛走下來的那幾步
 * 還是算在這座箱庭裡，HUD 才不會一直閃
 */
const ZONE_PADDING = 4

export function getGardenAt(x: number, z: number): GardenDefinition | null {
  for (const garden of GARDEN_LIST) {
    const distance = Math.max(
      Math.abs(x - garden.center.x),
      Math.abs(z - garden.center.z),
    )
    if (distance <= garden.halfSize + ZONE_PADDING) {
      return garden
    }
  }

  return null
}

/**
 * 出生點
 *
 * 站在枯山水南緣外的白沙上，面朝北。
 * 睜眼第一件事是看見那片耙好的沙與幾塊立石，
 * 其他箱庭全埋在霧裡，得自己走出去找
 */
export const SPAWN_POSITION = {
  x: GARDEN_CENTER.x,
  z: GARDEN_CENTER.z + 20,
}

// ── 各箱庭裡需要被外部引用的定點 ──

const CAVE_GARDEN = getGarden('cave')
const RIVER_GARDEN = getGarden('river')

/** 岩響窟的洞口，朝向禪庭中心那一側 */
export const CAVE_MOUTH = {
  x: CAVE_GARDEN.center.x + 11,
  y: getDeckGroundY(CAVE_GARDEN) + 1,
  z: CAVE_GARDEN.center.z + 11,
}
/** 通道中段，滴水聲擺在這裡 */
export const CAVE_TUNNEL = {
  x: CAVE_GARDEN.center.x + 4,
  y: getDeckGroundY(CAVE_GARDEN) + 1,
  z: CAVE_GARDEN.center.z + 4,
}
/**
 * 洞室，地底湖所在
 *
 * 位置要夠靠近岩體中心。漫遊控制器是數「頭頂疊了幾層實心方塊」
 * 來判斷有沒有進洞的，偏得太外面，洞室上方的岩就薄到不足以讓世界暗下來
 */
export const CAVE_CHAMBER = {
  /**
   * 往山心再挪兩格
   *
   * 原本在 -5,-5，離山體中心七格；洞室半徑六格，最外緣因此貼到山腳，
   * 而山的高度是往外遞減的——那裡的岩根本不夠厚，洞頂直接破出去，
   * 站在地底湖邊抬頭看得到藍天。
   *
   * 挪到 -3,-3 之後最外緣離山心十格，上面還壓著十幾格的岩
   */
  x: CAVE_GARDEN.center.x - 3,
  y: getDeckGroundY(CAVE_GARDEN) + 1,
  z: CAVE_GARDEN.center.z - 3,
}

/** 遣水的瀑布，水從岩壁上落進水道 */
export const WATERFALL_POINT = {
  x: RIVER_GARDEN.center.x - 10,
  z: RIVER_GARDEN.center.z - 4,
}

/** 爐火壇的火堆，火焰與煙的粒子掛在這裡 */
export const CAMPFIRE_POINT = getGarden('campfire').center

/** 牧野的柵欄範圍，羊群在裡面來回 */
export const PASTURE_CENTER = getGarden('pasture').center
export const PASTURE_HALF_SIZE = getGarden('pasture').halfSize - 2

/** 枯山水的水琴窟，埋在石板底下的那一甕水 */
export const SUIKINKUTSU_POINT = {
  x: GARDEN_CENTER.x + 5,
  z: GARDEN_CENTER.z - 5,
}

/**
 * 散在白沙上的孤石
 *
 * 兩圈箱庭之間那一大片空白，全空著會像還沒做完。
 * 每隔一段擺一塊立石、周圍耙上幾圈紋路，
 * 走在霧裡時它們會一顆一顆浮出來又沉回去
 */
export const SOLITARY_STONE_LIST = [
  /**
   * 中圈沒被箱庭佔走的那幾個角度
   *
   * 原本是四個等距的角度，247.5 那一格後來讓給了地獄谷。
   * 剩下三個不再等距，但那反而好：中圈本來就已經有五座箱庭，
   * 孤石只是拿來填空白的，排得太整齊會看起來像另一圈建築
   */
  ...[67.5, 157.5, 337.5].map((degree, index) => ({
    ...getRingPosition(MIDDLE_RING_RADIUS, degree),
    height: 2 + (index % 3),
  })),
  /** 最外圈與循環邊界之間那一大片空白，也擺幾顆免得太空 */
  ...Array.from({ length: 4 }, (_, index) => ({
    ...getRingPosition(112, 22.5 + index * 90),
    height: 1 + (index % 3),
  })),
]
