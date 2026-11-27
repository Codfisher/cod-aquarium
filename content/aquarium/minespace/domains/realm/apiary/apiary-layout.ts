import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 萬花蜂台的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 蜂巢圃是一方草地木座：正中三個蜂箱架在木板上、高度錯開，北側一道竹籬，
 * 旁邊擺著收成的蜂蜜與木桶，四周種滿花（大花三成、玫瑰兩成、鬱金香、蒲公英、堇，
 * 一成不到的高草）。它要的是「聲音的來源看起來也是一團」。
 * 這裡把木座放大成一座圍成碗狀的花谷：谷底正中一大疊蜂箱，
 * 四面一層一層往上收的花台，每一層都種滿同一組花，花台上散著一組一組的蜂箱。
 * 站在谷底往四周看，嗡嗡聲是從整片花海裡湧上來的
 */

/** 谷底的中心，也是遠景的中心 */
export const APIARY_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 谷底草地頂面的高度，與林海同一層 */
export const APIARY_FLOOR_Y = 10

/** 谷底平地的半徑（吃噪音，正負四格上下） */
export const APIARY_FLOOR_RADIUS = 15

/**
 * 一層花台多寬、有幾層走得上去
 *
 * 每一層高一格，邊上一格的落差得跳（或走木階），
 * 六格寬剛好排得下一組蜂箱與前後兩排花
 */
export const TERRACE_WIDTH = 6
export const TERRACE_COUNT = 5

/**
 * 最上面那層花台的外緣
 *
 * 再往外是一圈兩格一階的花坡，跳不上去，一路墊高到稜線，從谷裡看出去只看得到花坡與天
 */
export const APIARY_RIM_RADIUS = APIARY_FLOOR_RADIUS + TERRACE_WIDTH * TERRACE_COUNT

/** 花坡兩格一階，每一階多寬 */
export const RIM_STEP_WIDTH = 4
/**
 * 花坡最多墊高幾格（從最上層花台算）
 *
 * 兩階就夠：站在最上層，眼前是兩道比頭還高的花坡，翻不過去也看不到後面。
 * 再墊高的話整座谷變成一口井，從谷底往外看連遠處那一圈圓丘都被花坡擋掉
 */
export const RIM_RISE_MAX = 4

/**
 * 花坡的外緣：再往外是不畫的 LAKE_BED，高度與稜線齊平
 *
 * 這一座沒有布景的地面平面：平面是整片鋪的，比谷底高的話會變成蓋在谷上的一片天花板。
 * 從谷裡任何一處都看不到稜線後面（視線被花坡擋住），那裡畫不畫都一樣
 */
export const APIARY_EDGE_RADIUS = 62

/** 稜線那一層的高度，遠景山稜的山腳插在這裡 */
export const APIARY_RIDGE_Y = APIARY_FLOOR_Y + TERRACE_COUNT + RIM_RISE_MAX

/**
 * 回程門
 *
 * 大廳那座門嵌在蜂巢圃北側的竹籬上，人從北邊走過來、往南穿過門；
 * 這裡的門立在谷底北緣，門洞朝北，人到了之後仍是往南走，
 * 那一大疊蜂箱就在正前方，背後是一層層往上收的花台
 */
export const APIARY_PORTAL_POINT = { x: APIARY_CENTER.x, z: APIARY_CENTER.z - 11 }

/**
 * 大廳那座門：門洞中心離蜂巢圃中心的偏移
 *
 * 嵌在蜂箱北側那道竹籬正中（竹籬在中心往北三格那一排），竹籬讓出門的寬度、兩側各留兩格當作門邊的籬。
 * 蜂巢圃的造景（buildApiaryGarden）與大廳的門（APIARY_HUB_GATE）都讀這個點
 */
export const APIARY_HUB_GATE_OFFSET = { x: 0, z: -3 }

/**
 * 花台上一組一組的蜂箱
 *
 * 每一組照蜂巢圃的擺法：三個蜂箱高度錯開、一道竹籬圍在上坡那一側、
 * 旁邊一格蜂蜜一格木桶。四層花台各三到四組，方位錯開，
 * 從谷底看上去每個方向都有一組。北邊第一層讓給回程門後面那一眼，不擺
 */
export interface HiveYard {
  x: number;
  z: number;
  /** 第幾層花台 */
  level: number;
  /** 竹籬朝哪一邊（上坡那一側，也就是離谷底遠的那一邊） */
  fenceSide: 'north' | 'south' | 'east' | 'west';
}

/** 往外的方向換成最接近的正方位：北是 -Z */
function toCardinal(degree: number): HiveYard['fenceSide'] {
  const normalized = ((degree % 360) + 360) % 360
  if (normalized >= 45 && normalized < 135)
    return 'south'
  if (normalized >= 135 && normalized < 225)
    return 'west'
  if (normalized >= 225 && normalized < 315)
    return 'north'
  return 'east'
}

function createHiveYardList(): HiveYard[] {
  const yardList: HiveYard[] = []
  /** 每一層幾組、從哪個方位起排 */
  const ringList = [
    { level: 1, count: 4, startDegree: 0 },
    { level: 2, count: 4, startDegree: 70 },
    { level: 3, count: 4, startDegree: 15 },
    { level: 4, count: 3, startDegree: 95 },
  ]
  for (const { level, count, startDegree } of ringList) {
    const radius = APIARY_FLOOR_RADIUS + (level - 0.5) * TERRACE_WIDTH
    for (let index = 0; index < count; index++) {
      const degree = startDegree + (index * 360) / count
      /** 北邊（270 度）第一層正好在回程門背後，讓開 */
      const northGap = Math.abs(((degree - 270 + 540) % 360) - 180)
      if (level === 1 && northGap < 40)
        continue
      const radian = (degree / 180) * Math.PI
      yardList.push({
        x: APIARY_CENTER.x + Math.round(Math.cos(radian) * radius),
        z: APIARY_CENTER.z + Math.round(Math.sin(radian) * radius),
        level,
        fenceSide: toCardinal(degree),
      })
    }
  }
  return yardList
}

export const HIVE_YARD_LIST: HiveYard[] = createHiveYardList()

/** 一組蜂箱佔多大（半徑），這一圈裡的花台高度一律跟著中心那一格，不會有一格落差穿過蜂箱 */
export const HIVE_YARD_RADIUS = 4

/**
 * 上下花台的木階
 *
 * 四道放射狀的小徑從谷底一路走到最上層，每一道落差前面墊一片木半磚，
 * 自動跨得上去。方位錯開回程門（北）與谷底的蜂箱，四個斜角各一道
 */
export const STAIR_DEGREE_LIST = [45, 135, 225, 315] as const

/**
 * 邊界：走上最上層花台就走不快，過了推回線被推回谷裡
 *
 * 花坡兩格一階本來就跳不上去，這只是保險
 */
export const APIARY_SLOW_RADIUS = APIARY_RIM_RADIUS - 3
export const APIARY_PUSH_RADIUS = APIARY_RIM_RADIUS + 6
