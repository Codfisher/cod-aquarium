import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 石殿遺址的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 石殿遺址是石廊跡的放大版。石廊跡是一方石板木座：一圈八根高矮參差的斷柱圍著中央一塊刻紋石碑，
 * 高的幾根頂上架著半磚橫樑，藤蔓從斷口垂下來，石板縫裡長出青苔圓石與草，
 * 地上躺著幾塊倒下的青苔石，角落一盞石燈籠；沒有屋頂也沒有樹，花草只有石生植物、高草與灌叢。
 * 這裡把它放大成一整座荒廢的石殿：一條兩排石柱夾著的長廊從回程門往北走，穿過一座塌了一半的拱門，
 * 進到一座沒了屋頂的大殿（正中照石廊跡擺那一圈斷柱與石碑），大殿北端還有一間屋頂完好的石室，
 * 聲音進去繞好幾圈才出來。殿外是一片長著石生植物的荒地，四周緩緩隆起成一圈亂石坡
 */

/** 遺址的中心，也是遠景的中心 */
export const RUINS_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 殿外荒地那一層草的高度 */
export const RUINS_GROUND_Y = 9

/**
 * 殿基那一層石板的高度
 *
 * 比荒地高一格，是石廊跡木座的那一格：石殿是蓋在一座石台上的
 */
export const RUINS_TERRACE_Y = RUINS_GROUND_Y + 1

/** 站在殿基石板上的腳底高度 */
export const RUINS_FOOT_Y = RUINS_TERRACE_Y + 1

/** 一塊長方形的範圍（含兩端） */
export interface RuinsRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 長廊：從回程門往北，兩排石柱夾著七格寬的石板路
 *
 * 石柱立在 COLONNADE_COLUMN_X 兩條線上、每四格一根
 */
export const COLONNADE_RECT: RuinsRect = {
  minX: RUINS_CENTER.x - 8,
  maxX: RUINS_CENTER.x + 8,
  minZ: RUINS_CENTER.z + 8,
  maxZ: RUINS_CENTER.z + 44,
}
export const COLONNADE_COLUMN_X_LIST = [RUINS_CENTER.x - 6, RUINS_CENTER.x + 6] as const
/** 長廊的石柱從哪一排排到哪一排（每四格一根） */
export const COLONNADE_COLUMN_Z_FROM = RUINS_CENTER.z + 12
export const COLONNADE_COLUMN_Z_TO = RUINS_CENTER.z + 40

/** 長廊走進大殿那一口的拱門，兩座方墩各兩格見方 */
export const ARCH_Z = RUINS_CENTER.z + 9

/**
 * 沒了屋頂的大殿
 *
 * 四面的牆塌得高高低低，有的地方只剩牆基；殿裡兩排石柱，正中是石廊跡那一圈斷柱與石碑
 */
export const HALL_RECT: RuinsRect = {
  minX: RUINS_CENTER.x - 22,
  maxX: RUINS_CENTER.x + 22,
  minZ: RUINS_CENTER.z - 36,
  maxZ: RUINS_CENTER.z + 8,
}

/** 大殿正中的石碑，石廊跡那一圈八根斷柱（半徑五格）圍著它 */
export const HALL_STELE_POINT = { x: RUINS_CENTER.x, z: RUINS_CENTER.z - 12 }
export const STELE_RING_RADIUS = 5

/**
 * 大殿北端那間屋頂完好的石室
 *
 * 門開在南牆正中，從大殿走進去；牆六格高、屋頂一層石磚，
 * 裡面兩盞石燈籠、北牆前一塊石碑，牆縫滲下來的水積在地上一窪
 */
export const CHAMBER_RECT: RuinsRect = {
  minX: RUINS_CENTER.x - 8,
  maxX: RUINS_CENTER.x + 8,
  minZ: RUINS_CENTER.z - 48,
  maxZ: RUINS_CENTER.z - 36,
}
export const CHAMBER_WALL_HEIGHT = 6

/** 石室裡牆縫滲水的那一處（北牆內側，偏西） */
export const CHAMBER_SEEP_POINT = { x: RUINS_CENTER.x - 5, z: CHAMBER_RECT.minZ + 1 }

/**
 * 回程門
 *
 * 大廳那座門立在石廊跡那一圈斷柱裡面、石碑南邊兩格，門洞朝南，人往北穿過去，
 * 一穿過去就是石碑；這裡的門立在長廊的南端，門洞同樣朝南，人到了之後仍是往北走，
 * 兩排石柱夾著的長廊在正前方，盡頭是拱門與大殿
 */
export const RUINS_PORTAL_POINT = { x: RUINS_CENTER.x, z: COLONNADE_RECT.maxZ - 2 }

/** 殿外荒地往外多遠開始隆起成亂石坡、坡頂在哪一圈、坡頂高出荒地幾格 */
export const RUINS_RIM_START_RADIUS = 58
export const RUINS_RIM_RADIUS = 82
export const RUINS_RIM_HEIGHT = 9

/**
 * 邊界：走上亂石坡越走越慢，過了推回線被推回荒地
 *
 * 遺址最遠的角（長廊南端）離中心四十五格，減速線再往外，推回線在坡的半腰
 */
export const RUINS_SLOW_RADIUS = RUINS_RIM_START_RADIUS + 2
export const RUINS_PUSH_RADIUS = RUINS_SLOW_RADIUS + 12

/**
 * 細節小景的定點
 *
 * 地形 worker 照這幾個點蓋，神遊的特色主體也讀同一份
 */

/** 石碑四周那一圈馬賽克拼花的內外半徑（格），在八根斷柱外面 */
export const MOSAIC_RING_INNER_RADIUS = 6.3
export const MOSAIC_RING_OUTER_RADIUS = 9.3

/** 石室門前的兩尊石像：西邊那尊還站著，東邊那尊倒了，都在大殿裡、離北牆兩格 */
export const STATUE_Z = HALL_RECT.minZ + 2
export const STANDING_STATUE_POINT = { x: RUINS_CENTER.x - 5, z: STATUE_Z }
export const TOPPLED_STATUE_POINT = { x: RUINS_CENTER.x + 5, z: STATUE_Z }

/** 大殿東牆塌開的那個口（牆上三格寬），外面幾級長了草的石階往東通到蓄水池 */
export const EAST_BREACH_Z = HALL_STELE_POINT.z

/** 殿東的蓄水池殘跡（含兩端，外圈是池緣）：一圈斷了幾處的石緣圍著一池淺水 */
export const CISTERN_RECT: RuinsRect = {
  minX: HALL_RECT.maxX + 13,
  maxX: HALL_RECT.maxX + 21,
  minZ: EAST_BREACH_Z - 4,
  maxZ: EAST_BREACH_Z + 4,
}
