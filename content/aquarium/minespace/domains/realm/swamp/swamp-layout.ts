import { LIQUID_SURFACE_DROP } from '../../block/block-constants'
import { WORLD_SIZE } from '../../world/world-constants'
import { createSideIslandShape } from '../island-shape'

/**
 * 千蛙沼的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源、霧片）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 千蛙沼是蛙聲澤的放大版：蛙聲澤是一方泥地木座，大半挖成一格深的淺水，
 * 零星幾塊泥灘露出水面，枯木從水裡站起來，水面鋪著睡蓮，
 * 一條單側有扶手的半磚木棧橫穿過去，中段一座歇腳的平台與一盞紙燈。
 * 這裡把木座換成一大片沼澤：水與泥灘交錯，木棧彎彎曲曲走過整片水面，
 * 沼澤外圍的水越來越深，再往外是看不到邊的水與遠處低矮的林線
 */

/** 沼澤中心，也是遠景林線環的中心 */
export const SWAMP_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 水面那一層方塊的高度，泥灘也在這一層
 *
 * 與蛙聲澤一樣，泥灘與水面齊平：水是往泥地裡挖下去的，不是浮在上面。
 * 底下留得出五格深的外圍
 */
export const SWAMP_WATER_Y = 10

/** 水面的世界高度，布景的水面要與方塊的水面齊平 */
export const SWAMP_WATER_SURFACE_Y = SWAMP_WATER_Y + 0.5 - LIQUID_SURFACE_DROP

/**
 * 沼澤的半徑（格）
 *
 * 直徑九十多格，邊緣吃兩層噪音。這個範圍裡是泥灘與淺水交錯，
 * 外面是一圈一圈越來越深的水
 */
export const MARSH_RADIUS = 46

/**
 * 沼澤邊上那一圈有幾格寬
 *
 * 這一圈只剩一格深的淺水與零星的泥點，泥灘到這裡就散了；
 * 回程門那一排泥岸正好是這一圈裡面的最後一排
 */
export const MARSH_RIM_WIDTH = 4

/** 外圍深水的水底高度，水深五格；這一層是不畫的 LAKE_BED，由布景的水底平面代替 */
export const SWAMP_DEEP_FLOOR_Y = SWAMP_WATER_Y - 5

/**
 * 沼澤的形狀
 *
 * 回程門立在沼澤西緣泥岸的最外一排，門洞沿 Z 軸攤開、面朝西邊的水。
 * 大廳那座門在蛙聲澤木座西緣、木棧道的起點，從木座外往東穿過去就踏上木棧；
 * 到這裡時人在門的東側、站在木棧的起點上，面朝東邊整片沼澤，等於一路往前走上木棧。
 * 門前南北五格、往內兩排到外圈一排拉直，門框、北側三格的木牌與南側四格的紙燈
 * 才會落在同一排泥岸上（見 island-shape 的 apron）
 */
const SWAMP_MARSH = createSideIslandShape({
  center: SWAMP_CENTER,
  radius: MARSH_RADIUS,
  beachWidth: MARSH_RIM_WIDTH,
  noiseList: [
    { frequency: 0.045, octaveCount: 3, amplitude: 6, offset: 83 },
    { frequency: 0.13, octaveCount: 2, amplitude: 1.6, offset: 83 },
  ],
  portalSide: 'west',
  apron: { halfWidth: 5, inlandDepth: 3, blend: 3 },
})

/** 回程的傳送門，見 SWAMP_MARSH */
export const SWAMP_PORTAL_POINT = SWAMP_MARSH.portalPoint

/**
 * 某一點離沼澤中心的「沼澤距離」
 *
 * 小於 MARSH_RADIUS − MARSH_RIM_WIDTH 是泥灘與淺水交錯的沼澤，
 * 再往外 MARSH_RIM_WIDTH 格是只剩淺水的邊，再往外越來越深
 */
export const measureMarshDistance = SWAMP_MARSH.measureShoreDistance

/**
 * 木棧的轉折點（相對沼澤中心）
 *
 * 蛙聲澤那條是一條直線橫過木座；放大了直直一條走到底就太單調，
 * 改成一段一段的直線、在泥灘之間轉彎，沿途三座歇腳的平台。
 * 第一段從回程門東側一格起（座標由地形那邊接上），之後每兩點之間只走一個軸
 */
export const BOARDWALK_POINT_LIST = [
  { offsetX: -28, offsetZ: 0 },
  { offsetX: -28, offsetZ: -11 },
  { offsetX: -8, offsetZ: -11 },
  { offsetX: -8, offsetZ: 13 },
  { offsetX: 16, offsetZ: 13 },
  { offsetX: 16, offsetZ: -2 },
  { offsetX: 31, offsetZ: -2 },
] as const

/**
 * 歇腳的平台
 *
 * 照蛙聲澤那座：五格寬、四五格深的半磚平台，盡頭一排先打木樁再架欄杆，
 * 旁邊一根木樁頂紙燈。三座分別掛在木棧的第三、五、七個轉折點旁：
 * 北邊一座、南邊一座、最東邊的盡頭一座。座標相對沼澤中心，含兩端
 */
export const PLATFORM_LIST = [
  { minX: -10, maxX: -6, minZ: -16, maxZ: -12, railing: 'north', lampX: -5, lampZ: -14 },
  { minX: 14, maxX: 18, minZ: 15, maxZ: 19, railing: 'south', lampX: 19, lampZ: 17 },
  { minX: 32, maxX: 36, minZ: -4, maxZ: 1, railing: 'east', lampX: 34, lampZ: -5 },
] as const

/**
 * 邊界
 *
 * 沼澤邊上再幾格開始游不快，過了推回線就被輕輕推回沼澤。
 * 外圍是越來越深的水，不是空地上一道看不見的牆
 */
export const SWAMP_SLOW_RADIUS = MARSH_RADIUS + 4
export const SWAMP_PUSH_RADIUS = MARSH_RADIUS + 20

/**
 * 大廳那座門在蛙聲澤裡的位置（相對箱庭中心）
 *
 * 蛙聲澤中段那座歇腳的平台（木棧南側）放寬、用一條短棧接上木棧，墊高成整格木板，
 * 門就立在平台中央，門洞朝北：人沿著木棧走到中段、轉進短棧，直直走進門裡。
 * 見 buildSwampGarden 的平台那一段
 */
export const SWAMP_HUB_GATE_OFFSET = { x: 0, z: 6 } as const

/**
 * 細節那一層的定點（見 swamp-detail）
 *
 * 放在這裡而不是 swamp-detail：神遊的特色清單也要讀，而 swamp-detail 引用場景定義，
 * 特色清單再引用它會繞成一圈
 */

/** 東北那塊大泥灘上的草寮：四根木樁撐一片木頂，底下木桶、坐墊與竹簍，是捕蛙人歇腳的地方 */
export const SWAMP_HUT_POINT = { x: SWAMP_CENTER.x + 25, z: SWAMP_CENTER.z - 13 }

/** 南側平台東邊水面上的小舟：木棧走不到的泥灘，就靠它 */
export const SWAMP_BOAT_POINT = { x: SWAMP_CENTER.x + 22, z: SWAMP_CENTER.z + 16 }
