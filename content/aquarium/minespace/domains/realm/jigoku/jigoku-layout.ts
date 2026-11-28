import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 湯煙谷的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（蒸氣、熔岩瀑、遠火山、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 湯煙谷是地獄谷的放大版。地獄谷是一方燒過的木座：一道橫貫的熔岩裂縫、兩側烤黑的岩往上堆成谷壁，
 * 鳥居立在南岸、正對著裂縫，沒有橋（「這裡不能過，也不該過」），整座籠在一片入夜不暗的橘紅熱氣裡。
 *
 * 第一版把它放大成一道八十格長的熔岩縫與一圈木棧；使用者看過之後要「更壯觀的岩漿場景」，
 * 於是那道縫整個撐開成一座火口：
 *
 * - 火口底是一整片熔岩湖，北壁一道二十七格高的熔岩瀑直接落進湖裡，西北另一道小的，
 *   落下來在黑岩原上淌成兩道熔岩河；湖心一座柱狀玄武岩的島，東北一群玄武岩柱
 * - 南邊高出湖面十格的一彎台地是人待的地方：回程門、鳥居、熱泉、泥池、噴氣孔、足湯與蛋攤都在這裡，
 *   一條木棧沿著崖邊往東西兩臂各走到一座展望台
 * - 正中一道石階從到著台下到湖面，接一條貼著熔岩的玄武岩參道，走到湖裡一座祠台就是盡頭；
 *   再過去是立在熔岩裡的大鳥居、湖心島、熔岩瀑與火口外那座還在噴的遠火山，全在同一條軸線上。
 *   地獄谷那句話照樣成立：路只到這裡
 */

/** 世界中心：火口的中心，也是遠景與邊界的中心 */
export const JIGOKU_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 熔岩湖那一層方塊的高度（熔岩面比它的頂面矮八分之一格） */
export const LAKE_Y = 3

/** 熔岩面的世界高度 */
export const LAVA_SURFACE_Y = LAKE_Y + 0.5 - 0.125

/** 台地那一層方塊的高度：高出熔岩湖十格 */
export const TERRACE_Y = LAKE_Y + 10

/** 台地的地面與腳底高度，細節小景與神遊特色沿用這兩個名字 */
export const JIGOKU_FLOOR_Y = TERRACE_Y
export const JIGOKU_FOOT_Y = TERRACE_Y + 1

/**
 * 火口壁腳的橢圓（吃噪音）：裡面是台地與熔岩湖，外面是往上爬的火口壁
 *
 * 北壁腳離到著台一百一十幾格，東西兩頭各一百格
 */
export const CRATER_RADIUS_X = 100
export const CRATER_RADIUS_Z = 86

/**
 * 火口壁頂（稜線最矮的地方），稜線再吃零到三格的鋸齒
 *
 * 再往外是不畫的 LAKE_BED，頂面就在這一層：從火口裡任何地方往外看，視線先碰到稜線
 */
export const RIM_Y = 34

/** 火口壁每往外一格高兩格，爬不上去 */
export const WALL_STEP = 2

/**
 * 台地的內緣：熔岩湖的橢圓（吃噪音，靠近中軸的地方收成整齊的弧）
 *
 * 橢圓以外、ARM_END_Z 以南才是台地；以北橢圓外也是熔岩，一路淹到火口壁腳。
 * 台地因此是一彎朝北開口的新月，東西兩臂的尖端各是一座伸進熔岩上方的岬
 */
export const LAKE_CENTER = { x: JIGOKU_CENTER.x, z: JIGOKU_CENTER.z - 30 }
export const LAKE_RADIUS_X = 66
export const LAKE_RADIUS_Z = 58
export const ARM_END_Z = JIGOKU_CENTER.z - 26

/** 到著台的崖邊（台地在中軸上最北的那一排）：石階從這裡往下 */
export const OVERLOOK_EDGE_Z = LAKE_CENTER.z + LAKE_RADIUS_Z

/** 到著台：崖邊一塊鋪了石板的半圓，站在這裡整座熔岩湖都在腳下；石階口兩側各一盞石燈籠 */
export const OVERLOOK_PLAZA = { x: JIGOKU_CENTER.x, z: OVERLOOK_EDGE_Z + 3, radius: 9 }

/**
 * 石階：從崖邊往北，一格降半格（半磚與整格交錯），十八格降九格到參道
 *
 * 五格寬，兩側各一排柵欄；整道石階壓在一座伸進湖裡的玄武岩墩上
 */
export const STAIR_HALF_WIDTH = 2
export const STAIR_LENGTH = 18

/** 參道那一層方塊的高度：比熔岩面高一格多一點，熱氣就在腳邊 */
export const CAUSEWAY_Y = LAKE_Y + 1

/** 參道從石階腳往北走到祠台 */
export const CAUSEWAY_START_Z = OVERLOOK_EDGE_Z - STAIR_LENGTH - 1
export const CAUSEWAY_END_Z = CAUSEWAY_START_Z - 16

/** 祠台：參道盡頭一座削了角的方台，四周柵欄，北緣一塊刻紋石碑與一對石燈籠 */
export const SHRINE_PLATFORM = { x: JIGOKU_CENTER.x, z: CAUSEWAY_END_Z - 8, halfSize: 7 }

/** 立在熔岩裡的大鳥居：祠台北緣外四格，框住湖心島與熔岩瀑 */
export const LAVA_TORII = { x: JIGOKU_CENTER.x, z: SHRINE_PLATFORM.z - SHRINE_PLATFORM.halfSize - 4, halfWidth: 3, height: 6 }

/** 一道熔岩瀑 */
export interface LavaFall {
  /** 落點：火口壁腳上的一點 */
  x: number;
  z: number;
  /** 瀑身的半寬（沿著壁面量） */
  halfWidth: number;
  /** 瀑頂那一層熔岩的高度 */
  topY: number;
  /** 落點四周這麼遠以內的火口壁是直立的崖，瀑布才是掛下來的，不是沿著斜坡淌下來的 */
  cliffRadius: number;
}

/**
 * 熔岩的真光併成幾盞（場景定義的 areaLightLimit）
 *
 * 加上四盞石燈籠與回程門的三盞燈，全場十六盞。九盞鋪在一百三十格寬的湖上，每盞照三十六格，
 * 到著台、參道、祠台與西展望台都在兩盞以上的範圍裡
 */
export const LAVA_AREA_LIGHT_LIMIT = 9

/** 主瀑：正北，十三格寬、二十七格高，從稜線的缺口直接落進湖裡 */
export const MAIN_FALL: LavaFall = { x: JIGOKU_CENTER.x, z: JIGOKU_CENTER.z - CRATER_RADIUS_Z, halfWidth: 6, topY: 30, cliffRadius: 30 }

/** 西瀑：西北壁上小一號的一道，落下來在黑岩原上淌成兩道熔岩河 */
export const WEST_FALL: LavaFall = { x: 61, z: 88, halfWidth: 3, topY: 24, cliffRadius: 15 }

export const LAVA_FALL_LIST: LavaFall[] = [MAIN_FALL, WEST_FALL]

/**
 * 熔岩河的骨架：從西瀑的落潭出發，穿過黑岩原流進湖裡
 *
 * 黑岩原（冷卻的繩狀熔岩）比熔岩面高一格，河在裡面切出兩道發亮的溝。
 * 西展望台就在它的正南邊，往下看是整片河網
 */
export const LAVA_RIVER_LIST: { x: number; z: number }[][] = [
  [{ x: 63, z: 90 }, { x: 70, z: 97 }, { x: 80, z: 94 }, { x: 89, z: 102 }, { x: 99, z: 104 }, { x: 110, z: 109 }],
  [{ x: 70, z: 97 }, { x: 75, z: 86 }, { x: 86, z: 79 }, { x: 98, z: 81 }, { x: 108, z: 74 }],
]

/** 黑岩原從河的中心線往兩側鋪多遠（格，吃噪音） */
export const LAVA_FIELD_REACH = 10

/** 一叢柱狀玄武岩：中間最高，往外一圈一圈矮下去 */
export interface BasaltStack {
  x: number;
  z: number;
  radius: number;
  /** 中間最高的柱子高出熔岩面幾格 */
  height: number;
}

/** 湖心島：軸線上的那一座，從祠台望過去正好在熔岩瀑前面 */
export const LAKE_ISLAND: BasaltStack = { x: JIGOKU_CENTER.x, z: 92, radius: 9, height: 13 }

/** 湖心島之外的玄武岩柱：東北灣裡一群，湖面上零星幾叢 */
export const BASALT_STACK_LIST: BasaltStack[] = [
  LAKE_ISLAND,
  { x: 197, z: 86, radius: 6.5, height: 11 },
  { x: 209, z: 99, radius: 5, height: 8 },
  { x: 184, z: 73, radius: 4.5, height: 12 },
  { x: 216, z: 86, radius: 3.5, height: 6 },
  { x: 175, z: 92, radius: 3, height: 5 },
  { x: 117, z: 84, radius: 3.5, height: 7 },
  { x: 163, z: 108, radius: 2.5, height: 4 },
  { x: 106, z: 126, radius: 2.5, height: 4 },
  { x: 178, z: 132, radius: 3, height: 5 },
]

/** 東西兩座展望台：台地兩臂的尖端，往外挑出去的一塊石板台，三面柵欄 */
export interface Lookout {
  x: number;
  z: number;
  halfWidth: number;
  /** 往南（台地這一側）與往北（懸在熔岩上那一側）各幾格 */
  southReach: number;
  northReach: number;
}

/** 西展望台：腳下是熔岩河與黑岩原，右前方是西瀑 */
export const WEST_LOOKOUT: Lookout = { x: 60, z: 116, halfWidth: 4, southReach: 4, northReach: 5 }

/** 東展望台：腳下是玄武岩柱群，正北的稜線上是遠火山 */
export const EAST_LOOKOUT: Lookout = { x: 220, z: 116, halfWidth: 4, southReach: 4, northReach: 5 }

export const LOOKOUT_LIST: Lookout[] = [WEST_LOOKOUT, EAST_LOOKOUT]

/** 一池熱泉或泥池 */
export interface HotPool {
  x: number;
  z: number;
  radius: number;
  /** 泥池只有一格深、滿是灰泥；熱泉兩格深、清的，池緣一圈硫磺 */
  kind: 'spring' | 'mud';
}

/**
 * 熱泉與泥池：都在台地上，離崖邊遠的那一側
 *
 * 位置手排，木棧從它們中間繞過去
 */
export const HOT_POOL_LIST: HotPool[] = [
  { x: 116, z: 191, radius: 5, kind: 'spring' },
  { x: 166, z: 193, radius: 4.5, kind: 'spring' },
  { x: 86, z: 180, radius: 5.5, kind: 'spring' },
  { x: 194, z: 180, radius: 4, kind: 'spring' },
  { x: 127, z: 183, radius: 2.5, kind: 'mud' },
  { x: 71, z: 158, radius: 3, kind: 'mud' },
  { x: 209, z: 159, radius: 2.5, kind: 'mud' },
  { x: 152, z: 207, radius: 2, kind: 'mud' },
]

/**
 * 湯瀧：崖邊一池小熱泉，水從缺口翻下崖，落在湖邊一塊岩棚上
 *
 * 水碰到熔岩的地方一大團蒸氣，是整座湖唯一冒白煙的地方
 */
export const SPILL_SPRING = { x: 172, z: 166, radius: 3 }

/**
 * 噴氣孔
 *
 * 一圈一格高的圓石圍著一個往下的洞，四周的岩被硫磺染黃，蒸氣一直從洞裡往上冒
 */
export const STEAM_VENT_LIST: { x: number; z: number }[] = [
  { x: 146, z: 182 },
  { x: 150, z: 185 },
  { x: 106, z: 183 },
  { x: 100, z: 198 },
  { x: 188, z: 193 },
  { x: 204, z: 172 },
  { x: 62, z: 146 },
  { x: 54, z: 131 },
  { x: 218, z: 143 },
  { x: 228, z: 131 },
  { x: 124, z: 207 },
  { x: 172, z: 208 },
  { x: 80, z: 197 },
  { x: 198, z: 199 },
]

/**
 * 回程門
 *
 * 大廳那座門立在地獄谷鳥居與熔岩縫之間，門洞朝南，人往北穿過去；
 * 這裡的門立在台地中軸的南段，門洞同樣朝南，人到了之後仍是往北走：
 * 先穿過鳥居，再走到崖邊，整座熔岩湖才在腳下攤開（地獄谷的走法：穿過那道門，然後才看見底下那條發光的縫）
 */
export const JIGOKU_PORTAL_POINT = { x: JIGOKU_CENTER.x, z: JIGOKU_CENTER.z + 58 }

/** 鳥居：跨在木棧上，回程門往北九格（落地點往前六格，一落地看到的是整座鳥居，不是貼在眼前的兩根柱子） */
export const JIGOKU_TORII_Z = JIGOKU_PORTAL_POINT.z - 9

/**
 * 木棧的骨架
 *
 * 回程門往北那一小段直走到到著台；到著台南邊往東西各分出一條，沿著崖邊繞到兩臂尖端的展望台。
 * 不成一圈：兩條都是走到頭、原路回來，沒有一條跨過熔岩
 */
export const BOARDWALK_SPUR_END_Z = OVERLOOK_PLAZA.z + 4
export const BOARDWALK_WEST_POINT_LIST = [
  { x: JIGOKU_CENTER.x, z: BOARDWALK_SPUR_END_Z },
  { x: 124, z: 177 },
  { x: 106, z: 173 },
  { x: 90, z: 161 },
  { x: 76, z: 145 },
  { x: 66, z: 131 },
  { x: WEST_LOOKOUT.x, z: WEST_LOOKOUT.z + WEST_LOOKOUT.southReach },
] as const
export const BOARDWALK_EAST_POINT_LIST = [
  { x: JIGOKU_CENTER.x, z: BOARDWALK_SPUR_END_Z },
  { x: 156, z: 177 },
  { x: 175, z: 175 },
  { x: 191, z: 162 },
  { x: 204, z: 145 },
  { x: 214, z: 131 },
  { x: EAST_LOOKOUT.x, z: EAST_LOOKOUT.z + EAST_LOOKOUT.southReach },
] as const

/**
 * 湖面上的熱點：換成真的 LAVA 的那幾格
 *
 * 熔岩湖用的是不進光源清單的 LAVA_FIELD（見 block-constants）：光源清單四格見方留一顆，
 * 一萬格的湖全用 LAVA 就是六七百顆，每一顆都長一圈光暈、當一顆全局光的種子、被環境粒子當成錨點。
 * 人站得近的地方各換一格真的 LAVA：那裡才有光暈、火星與暑氣，烘進岩壁的暖光也是滿的十五級。
 *
 * 照亮場景的真光不看這份清單：所有露在外面的熔岩（兩種都算）由 light-source 的 collectPointLightList
 * 併成幾盞大的面光源，盞數是場景定義的 areaLightLimit（見 jigoku-realm）
 */
export const LAVA_LIGHT_POINT_LIST: { x: number; z: number }[] = [
  /** 參道兩側 */
  { x: JIGOKU_CENTER.x - 5, z: CAUSEWAY_START_Z - 8 },
  { x: JIGOKU_CENTER.x + 5, z: CAUSEWAY_START_Z - 8 },
  /** 大鳥居腳下（祠台自己有一對石燈籠） */
  { x: LAVA_TORII.x, z: LAVA_TORII.z + 1 },
  /** 到著台崖腳 */
  { x: JIGOKU_CENTER.x - 9, z: OVERLOOK_EDGE_Z - 7 },
  /** 主瀑與西瀑的落潭 */
  { x: MAIN_FALL.x, z: MAIN_FALL.z + 4 },
  { x: 65, z: 91 },
  /** 西展望台下的熔岩河、東展望台下的湖面 */
  { x: 81, z: 94 },
  { x: EAST_LOOKOUT.x, z: EAST_LOOKOUT.z - EAST_LOOKOUT.northReach - 5 },
]

/**
 * 湖面上往上噴的熔岩花：一顆一顆亮點拋起來又落回去（渲染端，見 jigoku-lava-falls）
 *
 * 兩道瀑布的落潭最旺，湖面上另有幾處冒泡的熱點
 */
export const LAVA_SPATTER_POINT_LIST: { x: number; z: number; radius: number; weight: number }[] = [
  { x: MAIN_FALL.x, z: MAIN_FALL.z + 3, radius: 4.5, weight: 5 },
  { x: 65, z: 91, radius: 2.5, weight: 2 },
  { x: 155, z: 118, radius: 2, weight: 1 },
  { x: 121, z: 138, radius: 2, weight: 1 },
  { x: 166, z: 146, radius: 2, weight: 1 },
  { x: 126, z: 104, radius: 2, weight: 1 },
  { x: 190, z: 112, radius: 2, weight: 1 },
]

/**
 * 遠火山：火口外正北偏東、走不到的一座火山錐（布景，見 jigoku-far-cone）
 *
 * 方位自北（−Z）往東量（弧度），距離從火口中心算。錐頂的火口一直在噴，一道熔岩順著朝這邊的山腰往下淌
 */
export const FAR_CONE = { azimuth: 0.2, distance: 232, baseRadius: 78, height: 96 }

/**
 * 邊界：火口壁本身就是屏障（兩格一階，爬不上去），這一圈只是保險
 *
 * 比台地最遠的一點（東西兩臂）還外面，人碰不到
 */
export const JIGOKU_SLOW_RADIUS = CRATER_RADIUS_X + 8
export const JIGOKU_PUSH_RADIUS = JIGOKU_SLOW_RADIUS + 8

/**
 * 細節小景的定點
 *
 * 地形 worker 照這幾個點蓋，神遊的特色主體也讀同一份
 */

/** 溫泉蛋的小攤：進谷那段木棧的西側、鳥居前面，一把朱紅的野點傘底下一口蒸鍋 */
export const EGG_STALL_POINT = { x: JIGOKU_PORTAL_POINT.x - 6, z: JIGOKU_PORTAL_POINT.z - 6 }

/** 足湯（含兩端，外圈是木板池緣）：西邊那池大熱泉的東邊，四根柱子撐一片木頂 */
export const FOOT_BATH_RECT = {
  minX: 96,
  maxX: 101,
  minZ: 186,
  maxZ: 188,
}

/** 賽之河原：東邊台地上、木棧南側的一片積石，正中一尊戴笠的石地藏 */
export const CAIRN_FIELD = { x: 180, z: 184, radius: 5 }

/** 硫磺階地：西南火口壁腳一層一層往上疊的黃色礦華，每一階積著一窪熱水 */
export const SULPHUR_TERRACE = { x: 103, z: 216, radius: 9, tierCount: 3 }
