import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 營火谷的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（火焰與煙、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 營火谷是爐火壇的放大版。爐火壇是一方草地木座：正中一個沉進地面的火塘（餘燼），
 * 一圈半磚石頭圍著，四張木階梯當矮凳圍成一圈，一頂籬笆柱撐起的木板棚子底下堆著柴、木箱與木桶，
 * 一捆乾草、一棵橡樹，草地上一半蕨一半高草。
 * 那一座只有一堆火；這裡是一片林緣的谷地，正中一座大篝火，四周散著幾處小營地，
 * 每一處都是一座爐火壇：石圈、火塘、矮凳，有的搭著棚子。外圍一圈橡樹林沿著谷坡長上去
 */

/** 谷地的中心，也是大篝火與遠景的中心 */
export const CAMP_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 谷底那一層草的高度
 *
 * 底下留幾格土與石，上面有二十多格給谷坡與樹
 */
export const CAMP_GROUND_Y = 9

/** 站在谷底草地上的腳底高度 */
export const CAMP_FOOT_Y = CAMP_GROUND_Y + 1

/**
 * 大篝火的石圈半徑
 *
 * 爐火壇的石圈半徑兩格、圍著一格火塘；這裡的火塘是五格的十字，石圈放到三格半
 */
export const BONFIRE_RING_RADIUS = 3.5

/** 一處營火：火塘的位置，以及它是不是正中那座大篝火 */
export interface CampFire {
  x: number;
  z: number;
  isBonfire: boolean;
}

/**
 * 散在谷地裡的小營地
 *
 * 每一處都是一座爐火壇：石圈、火塘、矮凳。shelterSide 給了就在那一側搭一頂棚子
 * （爐火壇的棚子在火的西南），堆柴、木箱與木桶；不給就只有火與矮凳，像有人路過生了一堆火。
 * 角度避開東邊：那是回程門與通往大篝火的那條路
 */
export interface CampSite {
  x: number;
  z: number;
  /** 棚子在火的哪一側，不給就沒有棚子 */
  shelterSide?: 'north' | 'south' | 'east' | 'west';
}

function atCampRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: CAMP_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: CAMP_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

export const CAMP_SITE_LIST: CampSite[] = [
  { ...atCampRing(60, 20), shelterSide: 'south' },
  { ...atCampRing(118, 24) },
  { ...atCampRing(165, 19), shelterSide: 'west' },
  { ...atCampRing(212, 26) },
  { ...atCampRing(258, 21), shelterSide: 'north' },
  { ...atCampRing(312, 27) },
]

/** 全部的火塘：正中的大篝火與每一處小營地，渲染端的火焰與煙、音源都照這一份 */
export const CAMP_FIRE_LIST: CampFire[] = [
  { ...CAMP_CENTER, isBonfire: true },
  ...CAMP_SITE_LIST.map((site) => ({ x: site.x, z: site.z, isBonfire: false })),
]

/**
 * 大篝火那五格十字火塘的位置（相對火塘中心）
 *
 * 渲染端在每一格上各立一組火焰，五組疊在一起才是一座比人高的篝火
 */
export const BONFIRE_EMBER_OFFSET_LIST = [
  { x: 0, z: 0 },
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
] as const

/**
 * 回程門
 *
 * 大廳那座門立在爐火壇火堆的東邊、原本那張東側矮凳的位置，門洞朝東，人往西穿過去；
 * 這裡的門立在谷地東側、大篝火正東二十四格，門洞同樣朝東，人到了之後仍是往西走，
 * 那條踩出來的土路從腳下通到正前方的大篝火，與大廳那一頭「門洞框住火堆」是同一個構圖
 */
export const CAMP_PORTAL_POINT = { x: CAMP_CENTER.x + 24, z: CAMP_CENTER.z }

/**
 * 谷地的邊：這一圈以外地面一路往上抬成谷坡，橡樹越種越密
 *
 * 谷底是一片開闊的草地，樹只零星長在營地之間；過了這一圈就是林緣
 */
export const CAMP_FOREST_EDGE_RADIUS = 34

/** 谷坡頂（稜線）在哪一圈，再往外是不畫的 LAKE_BED */
export const CAMP_RIDGE_RADIUS = 58

/** 谷坡最多高出谷底幾格 */
export const CAMP_RIDGE_HEIGHT = 8

/**
 * 邊界：走上谷坡、鑽進林子越走越慢，過了推回線被推回谷底
 *
 * 減速線在林緣往外四格，推回線再十格，人最遠到得了五十格，坡頂與後面的林子還擋著
 */
export const CAMP_SLOW_RADIUS = CAMP_FOREST_EDGE_RADIUS + 4
export const CAMP_PUSH_RADIUS = CAMP_SLOW_RADIUS + 10
