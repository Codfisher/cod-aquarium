import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 白矇雪原的尺寸與定點
 *
 * 地形 worker 與渲染端都讀這一份，所以只放純資料。
 *
 * 吹雪野的用意：造景的規矩與別座相反，不是「擺什麼進去」，是「留下多少」。
 * 能見度只有幾格，站在中央看不到任何一道邊，於是感覺不出自己站在一個台子上——暴風雪沒有邊界。
 * 東西要少而且疏，讓人一次只看得見一樣：走幾步遇上一盞燈籠，再走幾步一棵被壓彎的松從白裡浮出來。
 * 這裡把木座拿掉，同一套規矩鋪成一整片雪原：風把雪吹成一道一道的雪丘，
 * 半埋的燈籠與一排木樁是白裡僅有的方向；正中央是吹雪野那一小方（三盞燈、三株松、兩塊石）
 */

export const BLIZZARD_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 雪地那一層的頂面高度（雪丘從這裡往上堆） */
export const BLIZZARD_GROUND_Y = 10

/**
 * 雪勢起落的範圍（場景定義的 weather.snow 用它）
 *
 * 放在這裡是因為音源也要讀：風雪聲的音量跟著雪勢走，得知道這場雪最小到多少、最大到多少
 */
export const BLIZZARD_SNOW_LEVEL = { min: 0.72, max: 1 } as const

/**
 * 回程門
 *
 * 大廳那座門立在吹雪野正中偏北一格、門洞朝北，人往南穿過去；
 * 這裡的門立在雪原北邊一小片吹平的雪地上，門洞朝北，人到了之後仍是往南走，
 * 一排半埋的木樁從門前往南伸進白裡，順著它走就到雪原正中
 */
export const BLIZZARD_PORTAL_POINT = { x: BLIZZARD_CENTER.x, z: BLIZZARD_CENTER.z - 30 }

/** 門四周吹平、不堆雪丘的半徑 */
export const PORTAL_FLAT_RADIUS = 6

/** 雪原正中吹雪野那一小方，四周吹平的半徑 */
export const HEART_FLAT_RADIUS = 7

/**
 * 木樁從門前往南走到雪原正中的骨架（相對中心）
 *
 * 微微左右擺，不是一條拉直的線：雪原上的路是一根一根樁子插出來的，
 * 插的人也看不到下一根在哪
 */
export const POST_TRAIL_POINT_LIST = [
  { x: 0, z: -26 },
  { x: 2, z: -22 },
  { x: 3, z: -18 },
  { x: 1, z: -14 },
  { x: -2, z: -10 },
]

/**
 * 雪丘在哪裡開始一路堆高（離中心的格數）
 *
 * 這一圈以外風把雪堆成越來越高的雪丘，走上去越走越慢；
 * 白矇裡看不到它，只覺得腳下越來越難走，然後被風推回來
 */
export const DRIFT_WALL_START_RADIUS = 44

/** 雪原的外緣：這一圈以外不堆雪，地面換成不畫的 LAKE_BED，由布景的雪面代替 */
export const BLIZZARD_EDGE_RADIUS = 58

export const BLIZZARD_SLOW_RADIUS = DRIFT_WALL_START_RADIUS
export const BLIZZARD_PUSH_RADIUS = DRIFT_WALL_START_RADIUS + 8

/**
 * 大廳那座門在吹雪野裡的位置（相對箱庭中心）
 *
 * 吹雪野沒有主景，只有三盞燈籠、三株松與兩塊石散在白裡。門立在正中偏北一格，
 * 門洞朝北：從禪庭中心過來的人由北邊踏上木座，白裡先看到的是門上那三盞燈的暈，走近才看出是一道門
 */
export const BLIZZARD_HUB_GATE_OFFSET = { x: 0, z: -1 } as const

/**
 * 細節小景的定點
 *
 * 地形 worker 照這幾個點蓋，神遊的特色主體也讀同一份
 */

/** 避難小屋：雪原東南，三面木板牆、朝北敞開，屋裡一盞提燈 */
export const SHELTER_HUT_POINT = { x: BLIZZARD_CENTER.x + 13, z: BLIZZARD_CENTER.z + 26 }

/** 從雪原正中往東南到小屋的那一串疊石路標（相對中心） */
export const CAIRN_TRAIL_POINT_LIST = [
  { x: 2, z: 9 },
  { x: 5, z: 14 },
  { x: 9, z: 18 },
  { x: 13, z: 22 },
]

/** 結冰的池：雪原西北一片被風掃乾淨的冰面，東岸一道伸到冰上的木棧 */
export const FROZEN_POND = { x: BLIZZARD_CENTER.x - 26, z: BLIZZARD_CENTER.z - 12, radius: 6 }

/** 半埋的雪橇：木樁那條路東邊幾格，被人留在雪裡 */
export const BURIED_SLED_POINT = { x: BLIZZARD_CENTER.x + 13, z: BLIZZARD_CENTER.z - 17 }

/** 雪埋的柵欄：雪原西南一道斷斷續續露出雪面的舊柵欄的骨架 */
export const BURIED_FENCE_POINT_LIST = [
  { x: BLIZZARD_CENTER.x - 32, z: BLIZZARD_CENTER.z + 10 },
  { x: BLIZZARD_CENTER.x - 20, z: BLIZZARD_CENTER.z + 16 },
  { x: BLIZZARD_CENTER.x - 6, z: BLIZZARD_CENTER.z + 15 },
]
