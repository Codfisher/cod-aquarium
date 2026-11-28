import { WORLD_SIZE } from '../../world/world-constants'
import { createSideIslandShape } from '../island-shape'

/**
 * 金葉林的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源、落葉）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 金葉林是金葉苑的放大版：金葉苑是一方高一格的木座，上面鋪草、疏疏種幾棵白楊，
 * 地面整片落葉，林間一小片耙好的白沙、一張長凳與一盞紙燈，角落一盞石燈籠，入口一座鳥居。
 * 這裡把木座換成一塊高起來的林地：林地上一樣疏、一樣滿地落葉，
 * 林地邊緣一圈往下的緩坡長滿落了葉的白楊，再往下是看不到邊的低林
 */

/** 林地中心，也是遠景山稜環的中心 */
export const AUTUMN_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 林地那一層草地方塊的高度
 *
 * 外圍的低林比它矮五格。站在林地邊上往外看，低林的樹冠大約在眼睛的高度，
 * 遠山從樹冠上面露出來
 */
export const GROVE_GROUND_Y = 13

/**
 * 林地外緣往外那一圈「唇」有幾格寬
 *
 * 比林地矮一格，就是箱庭木座最外圈那道深色木半磚：
 * 林地是被「端起來」的，邊上先收一階，再往下才是緩坡
 */
export const GROVE_RIM_WIDTH = 2

/**
 * 林地的半徑（含唇，格）
 *
 * 直徑八十多格。岸線（林地的邊）吃兩層噪音，實際會在正負四格之間起伏
 */
export const GROVE_RADIUS = 42

/** 外圍低林的地面高度，這一層是不畫的 LAKE_BED，由布景的地面平面代替 */
export const LOWLAND_Y = GROVE_GROUND_Y - 5

/**
 * 緩坡每往外幾格降一格
 *
 * 兩格半一階，跳得上去；唇外再降四格到低林，坡面寬十格上下
 */
export const SLOPE_RUN = 2.5

/**
 * 林地的形狀
 *
 * 回程門立在林地東緣草地的最外一排，門洞沿 Z 軸攤開、面朝東邊的緩坡。
 * 大廳那座門在金葉苑木座東緣、從木座外往西穿過去；到這裡時人在門的西側、
 * 面朝林地，等於一路往前走進林子裡。
 * 門前南北五格、往內兩排到唇外一排拉直，門框、北側三格的木牌與南側四格的石燈籠
 * 才會落在同一排草地上（見 island-shape 的 apron）
 */
const AUTUMN_GROVE = createSideIslandShape({
  center: AUTUMN_CENTER,
  radius: GROVE_RADIUS,
  beachWidth: GROVE_RIM_WIDTH,
  noiseList: [
    { frequency: 0.05, octaveCount: 3, amplitude: 5, offset: 57 },
    { frequency: 0.12, octaveCount: 2, amplitude: 1.4, offset: 57 },
  ],
  portalSide: 'east',
  apron: { halfWidth: 5, inlandDepth: 2, blend: 3 },
})

/** 回程的傳送門，見 AUTUMN_GROVE */
export const AUTUMN_PORTAL_POINT = AUTUMN_GROVE.portalPoint

/**
 * 某一點離林地中心的「林緣距離」
 *
 * 小於 GROVE_RADIUS − GROVE_RIM_WIDTH 是林地，再往外 GROVE_RIM_WIDTH 格是矮一格的唇，
 * 再往外是緩坡與低林
 */
export const measureGroveDistance = AUTUMN_GROVE.measureShoreDistance

/**
 * 林間的耙沙
 *
 * 金葉苑那片在木座中心往東南 (6, 7)、半徑四格多，旁邊一張朝西的長凳與一盞紙燈。
 * 這裡照樣擺一大一小兩片：大的在林地中央偏東南，從回程門往西走進來第一眼就看到；
 * 小的在西北，是走了半座林子才找到的那一片。座標相對林地中心
 */
export const SAND_CLEARING_LIST = [
  { offsetX: 6, offsetZ: 8, radius: 6.5, rippleFrom: 2, rippleTo: 6 },
  { offsetX: -15, offsetZ: -14, radius: 4.4, rippleFrom: 2, rippleTo: 4 },
] as const

/**
 * 邊界
 *
 * 從唇開始走不快，走到坡腳附近被輕輕推回林地。
 * 坡上與坡腳是一整圈密密的白楊（落了葉的那種），不是空地上一道看不見的牆
 */
export const AUTUMN_SLOW_RADIUS = GROVE_RADIUS + 1
export const AUTUMN_PUSH_RADIUS = GROVE_RADIUS + 15

/**
 * 大廳那座門在金葉苑裡的位置（相對箱庭中心）
 *
 * 門立在箱庭裡、靠近中央的一小塊空地上，門洞朝西：
 * 從西緣的鳥居走進來，踩著一地落葉走個十來步就是它。
 * 耙沙在東南（6, 7），門偏西北一點，兩者不搶。
 * 箱庭那一頭（buildAutumnGarden）種樹時讓出這一圈，見 AUTUMN_HUB_GATE_CLEAR_RADIUS
 */
export const AUTUMN_HUB_GATE_OFFSET = { x: -1, z: -2 } as const

/** 門四周幾格不種白楊：樹冠半徑兩格，再遠一點笠木與木牌才不會插進樹冠裡 */
export const AUTUMN_HUB_GATE_CLEAR_RADIUS = 6

/**
 * 細節那一層的定點（見 autumn-detail）
 *
 * 放在這裡而不是 autumn-detail：種樹（要避開）與神遊的特色清單都要讀，
 * 而 autumn-detail 引用場景定義，特色清單再引用它會繞成一圈
 */

/** 林地東北的刻紋石碑：一塊立在石板上的碑、兩盆供花，從踩出來的小徑岔過去 */
export const AUTUMN_STELE_POINT = { x: AUTUMN_CENTER.x + 17, z: AUTUMN_CENTER.z - 18 }

/** 大片耙沙東北緣的落葉堆與耙子：有人剛把沙上的葉子耙出來 */
export const AUTUMN_LEAF_PILE_POINT = { x: AUTUMN_CENTER.x + 12, z: AUTUMN_CENTER.z + 1 }

/** 林地北緣的見晴長椅：從林地往北走到草地快到邊的地方，坐著看北邊的秋色遠丘 */
function findLookoutPoint(): { x: number; z: number } {
  const x = AUTUMN_CENTER.x + 8
  let { z } = AUTUMN_CENTER
  const isGroundRow = (rowZ: number) => [-2, -1, 0, 1, 2, 3].every((offset) => measureGroveDistance(x + offset, rowZ) < GROVE_RADIUS - GROVE_RIM_WIDTH - 2)
  while (z > 0 && isGroundRow(z - 1)) {
    z -= 1
  }
  return { x, z }
}
export const AUTUMN_LOOKOUT_POINT = findLookoutPoint()

/**
 * 落葉裡踩出來的小徑
 *
 * 從回程門往西，繞過大片耙沙的南緣，經過石燈籠與小耙沙，走到西緣的鳥居。
 * 不是鋪的路：只是這一線的落葉被踩散、露出底下的土
 */
export const AUTUMN_TRAIL_CONTROL_LIST = [
  { x: AUTUMN_PORTAL_POINT.x - 2, z: AUTUMN_PORTAL_POINT.z },
  { x: AUTUMN_CENTER.x + 26, z: AUTUMN_CENTER.z + 3 },
  { x: AUTUMN_CENTER.x + 16, z: AUTUMN_CENTER.z + 13 },
  { x: AUTUMN_CENTER.x + 5, z: AUTUMN_CENTER.z + 18 },
  { x: AUTUMN_CENTER.x - 5, z: AUTUMN_CENTER.z + 14 },
  { x: AUTUMN_CENTER.x - 11, z: AUTUMN_CENTER.z + 3 },
  { x: AUTUMN_CENTER.x - 17, z: AUTUMN_CENTER.z - 7 },
  { x: AUTUMN_CENTER.x - 28, z: AUTUMN_CENTER.z - 3 },
  { x: AUTUMN_CENTER.x - 36, z: AUTUMN_CENTER.z },
] as const

/** 往石碑的岔路：從小徑離開門不遠的地方往北 */
export const AUTUMN_STELE_TRAIL_CONTROL_LIST = [
  { x: AUTUMN_CENTER.x + 26, z: AUTUMN_CENTER.z + 3 },
  { x: AUTUMN_CENTER.x + 22, z: AUTUMN_CENTER.z - 8 },
  { x: AUTUMN_STELE_POINT.x, z: AUTUMN_STELE_POINT.z + 3 },
] as const
