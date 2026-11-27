import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 林海的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 林海是松籟林的放大版：松籟林是一方草地木座，種滿中間密、邊緣疏的針葉樹，
 * 混幾棵闊葉樹，一條兩格寬的石板小徑彎彎地穿過去，地上鋪滿落葉、蕨、高草與菇，
 * 兩根倒木、兩盞石燈籠、一座鳥居。那一座要的是「站在中間看不到對岸的木框」；
 * 這裡把木座拿掉，讓林子往四面一直長下去，真的看不到盡頭
 */

/** 林子的中心，也是遠景林稜的中心 */
export const FOREST_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 平地那一層草的高度
 *
 * 與湖中島、海中沙島的水面同一個高度，底下留幾格土與石，上面有二十多格給樹
 */
export const FOREST_GROUND_Y = 10

/**
 * 回程門
 *
 * 大廳那座門在松籟林木座北緣、小徑的盡頭，人順著小徑往北穿過去；
 * 這裡的門立在落腳那片林間空地的南緣，門洞朝南，人到了之後仍是往北走，
 * 空地與小徑在正前方，身後是越來越密的林子
 */
export const FOREST_PORTAL_POINT = { x: FOREST_CENTER.x, z: FOREST_CENTER.z + 32 }

/** 林間空地：落腳的那一片（門在它的南緣）與小徑盡頭的那一片 */
export interface ForestClearing {
  x: number;
  z: number;
  radius: number;
}

/** 落腳的空地，門在它的南緣 */
export const ARRIVAL_CLEARING: ForestClearing = {
  x: FOREST_PORTAL_POINT.x,
  z: FOREST_PORTAL_POINT.z - 8,
  radius: 9,
}

/**
 * 小徑盡頭的空地
 *
 * 一座鳥居跨在小徑入口，兩盞石燈籠守著一棵老橡樹，四周一圈蕨與菇。
 * 松籟林裡的鳥居、石燈籠與幾棵闊葉樹都收到這裡
 */
export const SHRINE_CLEARING: ForestClearing = {
  x: FOREST_CENTER.x - 9,
  z: FOREST_CENTER.z - 30,
  radius: 8,
}

/**
 * 石板小徑的骨架
 *
 * 從回程門往北，穿過落腳的空地，在林子裡左右繞兩個彎，最後走進小徑盡頭的空地。
 * 中間用平滑曲線串起來（見 sampleForestPath），兩格寬，與松籟林那條一樣
 */
const PATH_CONTROL_POINT_LIST = [
  { x: FOREST_PORTAL_POINT.x, z: FOREST_PORTAL_POINT.z - 1 },
  { x: FOREST_CENTER.x, z: FOREST_CENTER.z + 20 },
  { x: FOREST_CENTER.x + 6, z: FOREST_CENTER.z + 9 },
  { x: FOREST_CENTER.x + 4, z: FOREST_CENTER.z - 2 },
  { x: FOREST_CENTER.x - 3, z: FOREST_CENTER.z - 12 },
  { x: FOREST_CENTER.x - 8, z: FOREST_CENTER.z - 21 },
  { x: SHRINE_CLEARING.x, z: SHRINE_CLEARING.z + 2 },
] as const

/** 每兩個骨架點之間取幾點：一段十來格，取二十點，相鄰兩點不到一格 */
const PATH_SAMPLE_PER_SEGMENT = 20

/**
 * 沿著骨架取點（Catmull-Rom）
 *
 * 兩端各複製一次端點，曲線才會真的穿過第一個與最後一個骨架點
 */
function sampleForestPath(): { x: number; z: number }[] {
  const controlList = [PATH_CONTROL_POINT_LIST[0], ...PATH_CONTROL_POINT_LIST, PATH_CONTROL_POINT_LIST.at(-1)!]
  const sampleList: { x: number; z: number }[] = []

  for (let index = 1; index < controlList.length - 2; index++) {
    const previous = controlList[index - 1]!
    const from = controlList[index]!
    const to = controlList[index + 1]!
    const next = controlList[index + 2]!

    for (let step = 0; step < PATH_SAMPLE_PER_SEGMENT; step++) {
      const ratio = step / PATH_SAMPLE_PER_SEGMENT
      const ratio2 = ratio * ratio
      const ratio3 = ratio2 * ratio
      const blend = (a: number, b: number, c: number, d: number) => 0.5 * (
        2 * b
        + (-a + c) * ratio
        + (2 * a - 5 * b + 4 * c - d) * ratio2
        + (-a + 3 * b - 3 * c + d) * ratio3
      )
      sampleList.push({
        x: blend(previous.x, from.x, to.x, next.x),
        z: blend(previous.z, from.z, to.z, next.z),
      })
    }
  }
  sampleList.push({ ...PATH_CONTROL_POINT_LIST.at(-1)! })
  return sampleList
}

/** 小徑中心線上一點一點的座標，從回程門走到小徑盡頭的空地 */
export const FOREST_PATH_POINT_LIST = sampleForestPath()

/**
 * 林子在哪裡開始變成一堵牆（離中心的格數）
 *
 * 這一圈以外樹越種越密、地面一路隆起成丘，枝葉壓到人的高度，
 * 從裡面看出去是一整片樹幹與灌叢，看不到盡頭
 */
export const THICKET_START_RADIUS = 42

/**
 * 林子的外緣：這一圈以外不種樹，地面換成不畫的 LAKE_BED
 *
 * 從裡面看過來，十幾格厚的密林早就擋住視線；
 * 外面那一圈只剩布景的地面平面與林稜，從林子的縫隙望出去是霧裡的一片綠
 */
export const FOREST_EDGE_RADIUS = 60

/**
 * 邊界：鑽進密林越走越慢，過了推回線被推回林子裡
 *
 * 減速線在密林開始那一圈再往外兩格，推回線再十格，
 * 人最遠到得了五十幾格，外面還有十格的樹擋著
 */
export const FOREST_SLOW_RADIUS = THICKET_START_RADIUS + 2
export const FOREST_PUSH_RADIUS = FOREST_SLOW_RADIUS + 10
