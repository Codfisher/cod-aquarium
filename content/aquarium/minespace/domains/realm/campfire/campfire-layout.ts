import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 拓荒原的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（火焰與煙、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 拓荒原是爐火壇的大場景，使用者要的是「類似西部拓荒的原野」、「要有拓荒感」，不要一座大營火。
 * 爐火壇留下來的是它的聲音：一堆幹活用的小火，低低地、一直劈啪著。
 * 這裡是一片乾草原：一圈走了一整天、停下來歇腳的篷車，篷車邊一堆煮飯的小火；
 * 東北一間蓋到一半的木屋、一架風車抽水機、剛犁出來的頭幾道溝；一條被車輪壓出車轍的路往西通向紅岩台地；
 * 遠處零星兩處外圍守夜人的小火，一座小丘上的墳。四周原野往下陷成一圈乾溝，溝外是爬不上去的紅岩壁
 */

/** 原野的中心，篷車圍成的那一圈就在這裡，也是遠景的中心 */
export const CAMP_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 原野那一層地面的高度 */
export const CAMP_GROUND_Y = 9

/** 站在原野上的腳底高度 */
export const CAMP_FOOT_Y = CAMP_GROUND_Y + 1

/** 一個平面上的點 */
export interface CampPoint {
  x: number;
  z: number;
}

function atCampRing(degree: number, radius: number): CampPoint {
  const radian = (degree / 180) * Math.PI
  return {
    x: CAMP_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: CAMP_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/** 篷車圍成的那一圈的半徑 */
export const WAGON_CIRCLE_RADIUS = 11

/**
 * 篷車：一輛一輛沿著圓周停，車身與圓相切；東邊空著，那是車隊進來的口，也是回程門那條路
 *
 * degree 是它在圓上的方位（東為零、順時針，南為九十）
 */
export const WAGON_LIST: (CampPoint & { degree: number })[] = [50, 102, 154, 206, 258, 310].map((degree) => ({
  ...atCampRing(degree, WAGON_CIRCLE_RADIUS),
  degree,
}))

/**
 * 篷車圈裡那一堆煮飯的小火
 *
 * 偏在圈子北半邊：車轍路從東邊的口穿過圈子往西出去，火不能擋在路上
 */
export const COOK_FIRE_POINT: CampPoint = { x: CAMP_CENTER.x - 2, z: CAMP_CENTER.z - 6 }

/** 外圍守夜人的小火：一處在西北那座岩丘的背風處，一處在東南的草裡 */
export const OUTRIDER_CAMP_LIST: CampPoint[] = [
  { x: CAMP_CENTER.x - 26, z: CAMP_CENTER.z - 34 },
  { x: CAMP_CENTER.x + 48, z: CAMP_CENTER.z + 18 },
]

/** 一處火：篷車圈裡煮飯的那一堆，或外圍守夜的小火 */
export interface CampFire extends CampPoint {
  isCookFire: boolean;
}

/** 全部的火塘，渲染端的火焰與煙、音源都照這一份 */
export const CAMP_FIRE_LIST: CampFire[] = [
  { ...COOK_FIRE_POINT, isCookFire: true },
  ...OUTRIDER_CAMP_LIST.map((point) => ({ ...point, isCookFire: false })),
]

/** 拴馬的橫木與飲水槽，篷車圈南邊 */
export const HITCHING_POINT: CampPoint = { x: CAMP_CENTER.x + 3, z: CAMP_CENTER.z + 18 }

/**
 * 蓋到一半的木屋（東北）
 *
 * 屋子的中心；木屋朝南（門開在南牆），風車抽水機在它西邊，剛犁的田在它東邊
 */
export const HOMESTEAD_POINT: CampPoint = { x: CAMP_CENTER.x + 26, z: CAMP_CENTER.z - 24 }
export const WINDMILL_POINT: CampPoint = { x: HOMESTEAD_POINT.x - 10, z: HOMESTEAD_POINT.z + 1 }

/** 剛犁出來的那一塊田（含兩端） */
export const FIELD_RECT = {
  minX: HOMESTEAD_POINT.x + 8,
  maxX: HOMESTEAD_POINT.x + 19,
  minZ: HOMESTEAD_POINT.z - 6,
  maxZ: HOMESTEAD_POINT.z + 5,
}

/** 小丘上的那座墳（西南） */
export const GRAVE_POINT: CampPoint = { x: CAMP_CENTER.x - 32, z: CAMP_CENTER.z + 32 }

/** 路標與石堆：往西那條車轍路分岔的地方 */
export const TRAIL_MARKER_POINT: CampPoint = { x: CAMP_CENTER.x - 28, z: CAMP_CENTER.z + 2 }

/** 原野上走得上去的紅岩丘：中心、半徑、高度 */
export interface RockOutcrop extends CampPoint {
  radius: number;
  height: number;
}

export const OUTCROP_LIST: RockOutcrop[] = [
  { x: CAMP_CENTER.x - 36, z: CAMP_CENTER.z - 26, radius: 7, height: 7 },
  { x: CAMP_CENTER.x + 36, z: CAMP_CENTER.z + 40, radius: 5, height: 6 },
  { x: CAMP_CENTER.x - 8, z: CAMP_CENTER.z - 52, radius: 6, height: 8 },
  { x: CAMP_CENTER.x + 52, z: CAMP_CENTER.z + 2, radius: 4, height: 4 },
]

/**
 * 車轍路的骨架
 *
 * 從回程門往西進篷車圈的口，穿過圈子，再往西南走出去、一路通到乾溝邊，正對著遠處的台地。
 * 路上兩道被車輪壓出來的轍
 */
export const WAGON_TRAIL_POINT_LIST: CampPoint[] = [
  { x: CAMP_CENTER.x + 26, z: CAMP_CENTER.z },
  { x: CAMP_CENTER.x + 11, z: CAMP_CENTER.z },
  { x: CAMP_CENTER.x - 12, z: CAMP_CENTER.z + 1 },
  { x: CAMP_CENTER.x - 28, z: CAMP_CENTER.z + 4 },
  { x: CAMP_CENTER.x - 48, z: CAMP_CENTER.z + 8 },
  { x: CAMP_CENTER.x - 70, z: CAMP_CENTER.z + 11 },
]

/** 篷車圈到木屋那條踩出來的小徑 */
export const FOOTPATH_POINT_LIST: CampPoint[] = [
  { x: CAMP_CENTER.x + 8, z: CAMP_CENTER.z - 8 },
  { x: CAMP_CENTER.x + 17, z: CAMP_CENTER.z - 16 },
  { x: HOMESTEAD_POINT.x, z: HOMESTEAD_POINT.z + 5 },
]

/** 北邊那道乾掉的河床 */
export const CREEK_POINT_LIST: CampPoint[] = [
  { x: CAMP_CENTER.x - 62, z: CAMP_CENTER.z - 30 },
  { x: CAMP_CENTER.x - 34, z: CAMP_CENTER.z - 40 },
  { x: CAMP_CENTER.x - 4, z: CAMP_CENTER.z - 38 },
  { x: CAMP_CENTER.x + 18, z: CAMP_CENTER.z - 46 },
  { x: CAMP_CENTER.x + 52, z: CAMP_CENTER.z - 40 },
]

/**
 * 回程門
 *
 * 大廳那座門立在爐火壇火塘的正東，門洞朝東，人往西穿過去；
 * 這裡的門立在原野東邊、車轍路的起點，門洞同樣朝東，人到了之後仍是往西走，
 * 車轍路從腳下通進篷車圈的口
 */
export const CAMP_PORTAL_POINT: CampPoint = { x: CAMP_CENTER.x + 24, z: CAMP_CENTER.z }

/** 原野在哪一圈開始往下陷成乾溝、溝最深的地方、紅岩壁從哪裡拔起 */
export const PRAIRIE_RADIUS = 62
export const GULLY_DEPTH = 4
export const ROCK_WALL_RADIUS = 72

/** 紅岩壁高出原野幾格（兩格一階、爬不上去），壁頂外是不畫的 LAKE_BED */
export const ROCK_WALL_HEIGHT = 8

/**
 * 邊界：走進乾溝越走越慢，過了推回線被推回原野
 *
 * 推回線在溝底，再往外是爬不上去的紅岩壁，人永遠看不到壁頂後面
 */
export const CAMP_SLOW_RADIUS = PRAIRIE_RADIUS - 2
export const CAMP_PUSH_RADIUS = ROCK_WALL_RADIUS - 2

/**
 * 細節小景的定點
 *
 * 地形 worker 照這幾個點蓋，神遊的特色主體也讀同一份
 */

/** 水塔：篷車圈東南，木腿撐起一座木桶箍成的水櫃 */
export const WATER_TOWER_POINT: CampPoint = { x: CAMP_CENTER.x + 14, z: CAMP_CENTER.z + 18 }

/** 淘金人的營地：北邊乾河床的南岸，一頂小帳、一座洗礦槽，河床裡還剩一窪水 */
export const PROSPECTOR_CAMP_POINT: CampPoint = { x: CAMP_CENTER.x + 3, z: CAMP_CENTER.z - 34 }

/** 電報線桿：沿著車轍路的北側一根一根往西排到台地腳下，回程門旁邊一根 */
export const TELEGRAPH_POLE_LIST: CampPoint[] = [
  { x: CAMP_CENTER.x + 20, z: CAMP_CENTER.z - 5 },
  { x: CAMP_CENTER.x - 20, z: CAMP_CENTER.z - 3 },
  { x: CAMP_CENTER.x - 34, z: CAMP_CENTER.z },
  { x: CAMP_CENTER.x - 48, z: CAMP_CENTER.z + 3 },
  { x: CAMP_CENTER.x - 60, z: CAMP_CENTER.z + 5 },
]

/** 車轍路邊被丟下的行李：車隊減重時留在路邊的箱子、桶與一副牛骨 */
export const ABANDONED_CARGO_POINT: CampPoint = { x: CAMP_CENTER.x - 42, z: CAMP_CENTER.z + 12 }
