import { LIQUID_SURFACE_DROP } from '../../block/block-constants'
import { WORLD_SIZE } from '../../world/world-constants'
import { createIslandShape } from '../island-shape'

/**
 * 海中沙島的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 海中沙島是潮汐磯的放大版：潮汐磯是一方沙地木座，南半邊挖成一池淺海，
 * 岸線被潮水磨成彎的，水底是沙與珊瑚；沙上有被海風壓扁的相思樹、漂流木、擱淺的小舟、
 * 耐旱的矮草與一座鳥居。這裡把木座換成大海中央一座小沙島，
 * 四面都是那一池淺海放大出去的樣子，再往外是看不到邊的深海
 */

/** 島心，也是遠景的中心 */
export const COAST_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 海面那一層方塊的高度，與湖中島同一個：底下留得出七格深的海 */
export const SEA_WATER_Y = 10

/** 海面的世界高度，布景的海面要與方塊的水面齊平 */
export const SEA_WATER_SURFACE_Y = SEA_WATER_Y + 0.5 - LIQUID_SURFACE_DROP

/**
 * 島的半徑（岸線，格）
 *
 * 南北壓扁（見 COAST_ISLAND 的 stretch），實際約三十四格長、二十七格寬，
 * 比湖中島小一號：潮汐磯本來就是一座小箱庭裡的一角沙灘
 */
export const SAND_ISLAND_RADIUS = 16

/**
 * 岸線往內幾格是與海面齊平的灘
 *
 * 潮水一天漲退兩次，這一圈時乾時濕：沙比裡面的平，偶爾留著一窪潮池
 */
export const TIDAL_FLAT_WIDTH = 3

/** 灘以內的沙地那一層方塊的高度，比海面高一格，沙丘再高一兩格 */
export const DUNE_GROUND_Y = SEA_WATER_Y + 1

/**
 * 珊瑚淺海延伸到岸線外多遠
 *
 * 一格深的沙底、兩格深開始有零星珊瑚、三四格深整叢的珊瑚，
 * 都在這一圈裡，清澈的水底看得到
 */
export const REEF_WIDTH = 16

/** 深海的海底高度，水深七格；這一層是不畫的 LAKE_BED，由布景的沙底平面代替 */
export const SEA_FLOOR_Y = 3

/**
 * 島形
 *
 * 沙洲多半被潮流拉長，所以東西長、南北短；岸線吃兩層噪音，灣與岬比湖中島碎一點，
 * 是被浪一口一口啃出來的樣子。
 *
 * 回程門立在島北緣沙地的最外一排，門洞沿 X 軸攤開、面朝北邊的海。
 * 大廳那座門在潮汐磯沙地正中、人往南穿過去；
 * 到這裡時人在門的南側、面朝島上，等於一路往前走上島
 */
const COAST_ISLAND = createIslandShape({
  center: COAST_CENTER,
  radius: SAND_ISLAND_RADIUS,
  beachWidth: TIDAL_FLAT_WIDTH,
  stretchX: 1,
  stretchZ: 1.2,
  noiseList: [
    { frequency: 0.07, octaveCount: 3, amplitude: 4.5, offset: 31 },
    { frequency: 0.16, octaveCount: 2, amplitude: 1.6, offset: 31 },
  ],
  portalSide: 'north',
  apron: { halfWidth: 5, inlandDepth: 2, blend: 2 },
})

/** 回程的傳送門，見 COAST_ISLAND */
export const COAST_PORTAL_POINT = COAST_ISLAND.portalPoint

/**
 * 某一點離島心的「岸線距離」
 *
 * 小於 SAND_ISLAND_RADIUS 是島，再減掉 TIDAL_FLAT_WIDTH 以內是乾的沙地
 */
export const measureCoastShoreDistance = COAST_ISLAND.measureShoreDistance

/**
 * 淺海裡的鳥居
 *
 * 潮汐磯的鳥居立在木座北緣，是走進那座箱庭的門面；這裡立在島南岸外的淺海裡，
 * 從回程門往南看，越過整座島就是它，漲潮時柱腳泡在水裡
 */
export const SEA_TORII_POINT = {
  x: COAST_CENTER.x,
  z: COAST_ISLAND.findEdgeZ(SAND_ISLAND_RADIUS, 'south') + 6,
}

/**
 * 邊界
 *
 * 珊瑚淺海外緣再往外幾格開始游不快，過了推回線就被輕輕推回島邊。
 * 推回線離世界邊界還有八十格，世界外海面的接縫總在幾十格之外
 */
export const COAST_SLOW_RADIUS = SAND_ISLAND_RADIUS + REEF_WIDTH + 4
export const COAST_PUSH_RADIUS = COAST_SLOW_RADIUS + 20
