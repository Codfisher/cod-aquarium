import { fbm2D, smoothStep } from '../../../utils/noise'
import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 風露原的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 風露苑是草苑與蟲聲叢併成的一座：白天是風，入夜換成蟲。這裡把兩座的大場景（野花原與蟲鳴夜原）
 * 也併成一片：野花原那一座接一座的圓丘當地形，丘頂偶爾一棵孤樹與一張長凳；
 * 蟲鳴夜原的幾種草原地帶鋪在丘上（花色一帶一帶不同），丘間的谷底是曬得到太陽的乾土窪地，
 * 草裡散著埋了半截的枯木樁與圓石堆。白天看得很遠、風從丘頂掠過，
 * 入夜蟋蟀與螽斯從每一道草縫裡出來，螢火比別處多得多
 */

/** 原野的中心，也是遠景與邊界的中心 */
export const MEADOW_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 最低那一層草的高度，丘從這裡往上隆起 */
export const MEADOW_GROUND_Y = 8

/**
 * 回程門
 *
 * 大廳那座門立在風露苑中央偏東，門洞朝西，人從西邊走過來、往東穿過去；
 * 這裡的門立在原野西半邊一塊拉平的草地上，門洞朝西，人到了之後仍是往東走。
 * 落在一條往東延伸的低谷口：南北兩側是圓丘，正前方一路是低緩的草地，一條踩出來的小徑從腳下鑽進草裡
 */
export const MEADOW_PORTAL_POINT = { x: MEADOW_CENTER.x - 22, z: MEADOW_CENTER.z + 6 }

/**
 * 大廳那座門離風露苑中心的偏移
 *
 * 風露苑西北角是孤樹與樹下那張長凳，其餘三角是蟲的家（枯木樁、圓石、乾土）。門立在中央偏東兩格、偏南一格，
 * 門洞朝西：坐在長凳上往前看就是那道門，人從西邊的飛石順著小徑走進草叢，孤樹在左手邊，門在正前方
 */
export const MEADOW_HUB_GATE_OFFSET = { x: 2, z: 1 } as const

/**
 * 丘陵的剖面
 *
 * 裡面是一座接一座的圓丘（最高七格上下），到 RISE_START 開始整體往上抬，
 * 到 CREST 最高再高出十格，再往外落回最低那一層
 */
const RISE_START_RADIUS = 66
export const MEADOW_CREST_RADIUS = 98
const CREST_HEIGHT = 10
/** 超過這個半徑就是不畫的底層（LAKE_BED），由布景的地面平面代替 */
export const MEADOW_OUTER_RADIUS = 112

/**
 * 邊界：走上外圍的坡越走越慢，過了推回線被推回原野
 *
 * 推回線在坡的半腰，坡頂還在十幾格外，人永遠看不到坡後面
 */
export const MEADOW_SLOW_RADIUS = 70
export const MEADOW_PUSH_RADIUS = 84

/** 從 from 到 to 平滑地由零升到一 */
function smoothRange(value: number, from: number, to: number): number {
  return smoothStep((value - from) / (to - from))
}

/** 外圍坡用的半徑，吃一層低頻噪音，坡腳不是一個正圓 */
export function measureMeadowRadius(x: number, z: number): number {
  return Math.hypot(x - MEADOW_CENTER.x, z - MEADOW_CENTER.z)
    + fbm2D(x * 0.03 + 23, z * 0.03 - 9, 2, 0.5) * 9
}

/**
 * 沒有拉平門前之前的高度（可以是小數）
 *
 * 圓丘是兩層噪音：一層三十來格一個起伏的大丘，一層十幾格的小丘疊在上面，
 * 只取正的那一半再開根號，丘頂圓、丘間平，像一個一個鼓起來的饅頭，不是一道一道的稜
 */
function measureRawHeight(x: number, z: number): number {
  const radius = measureMeadowRadius(x, z)
  if (radius >= MEADOW_OUTER_RADIUS)
    return 0

  const knoll = Math.sqrt(Math.max(0, fbm2D(x * 0.032 - 5, z * 0.032 + 14, 3, 0.45) + 0.15)) * 6.5
  const hummock = Math.max(0, fbm2D(x * 0.075 + 9, z * 0.075 - 2, 2, 0.5)) * 2
  const innerFade = 1 - smoothRange(radius, MEADOW_CREST_RADIUS - 6, MEADOW_OUTER_RADIUS)
  const rise = Math.min(
    smoothRange(radius, RISE_START_RADIUS, MEADOW_CREST_RADIUS),
    1 - smoothRange(radius, MEADOW_CREST_RADIUS + 2, MEADOW_OUTER_RADIUS),
  )
  return Math.max(0, (knoll + hummock) * innerFade + CREST_HEIGHT * rise)
}

/** 回程門那一小塊平地高出最低那一層幾格 */
export const MEADOW_PORTAL_LEVEL = Math.round(measureRawHeight(MEADOW_PORTAL_POINT.x, MEADOW_PORTAL_POINT.z))

/** 地面在這一格高出最低那一層幾格（零以上的整數）；回程門四周拉平到門的那一層 */
export function measureMeadowHeight(x: number, z: number): number {
  const raw = measureRawHeight(x, z)
  const portalDistance = Math.hypot(x - MEADOW_PORTAL_POINT.x, z - MEADOW_PORTAL_POINT.z)
  const flatten = 1 - smoothRange(portalDistance, 5, 11)
  return Math.round(raw + (MEADOW_PORTAL_LEVEL - raw) * flatten)
}

/**
 * 踩出來的小徑
 *
 * 從回程門往東走一段（一落地就看得到它鑽進草裡），左右彎幾次，走到原野正中那一片月見草。
 * 原野沒有別的路：小徑以外全是高到膝蓋的草
 */
export const MEADOW_PATH_CONTROL_POINT_LIST = [
  { x: MEADOW_PORTAL_POINT.x + 1, z: MEADOW_PORTAL_POINT.z },
  { x: MEADOW_CENTER.x - 14, z: MEADOW_CENTER.z + 6 },
  { x: MEADOW_CENTER.x - 8, z: MEADOW_CENTER.z + 1 },
  { x: MEADOW_CENTER.x - 1, z: MEADOW_CENTER.z + 3 },
  { x: MEADOW_CENTER.x + 6, z: MEADOW_CENTER.z - 3 },
] as const

/**
 * 草原的幾種地帶
 *
 * 蟲鳴夜原的分區照搬：整片照下面這幾個中心分區（邊界吃噪音、交界處兩邊的草混著長），
 * 每一區有自己的一組草與花、自己的疏密。落腳那一區（court）是風露苑那一組，
 * 從大廳過來第一眼看到的就是那座箱庭；thicket 是蟲聲叢原本那一叢
 */
export type MeadowZoneKind = 'court' | 'thicket' | 'moon' | 'golden' | 'violet' | 'fern' | 'ember'

export interface MeadowZone {
  kind: MeadowZoneKind;
  x: number;
  z: number;
}

export const MEADOW_ZONE_LIST: MeadowZone[] = [
  /** 風露苑那一組：草苑的花與蟲聲叢的草各一半，落腳那一片 */
  { kind: 'court', x: MEADOW_CENTER.x - 20, z: MEADOW_CENTER.z + 6 },
  /** 月見草原：原野正中一大片月白的花，夜裡最亮的地方 */
  { kind: 'moon', x: MEADOW_CENTER.x + 2, z: MEADOW_CENTER.z - 4 },
  /** 蟲聲叢原本那一叢：高草、乾草、蕨、捲葉草、火焰花，東邊那一片 */
  { kind: 'thicket', x: MEADOW_CENTER.x + 34, z: MEADOW_CENTER.z + 4 },
  /** 金芒原：南邊一片又密又乾的高草，抽穗的草梢一片金 */
  { kind: 'golden', x: MEADOW_CENTER.x + 10, z: MEADOW_CENTER.z + 36 },
  /** 堇色坡：西南一片紫 */
  { kind: 'violet', x: MEADOW_CENTER.x - 32, z: MEADOW_CENTER.z + 32 },
  /** 蕨窪：西北一片濕的低地，蕨、捲葉草與菇 */
  { kind: 'fern', x: MEADOW_CENTER.x - 26, z: MEADOW_CENTER.z - 34 },
  /** 火燒坡：東北的緩丘上紅的橘的野花 */
  { kind: 'ember', x: MEADOW_CENTER.x + 28, z: MEADOW_CENTER.z - 32 },
]

/**
 * 乾土窪地：蟲聲叢角落那片曬得到太陽的乾土，放大成幾處，都在丘間的谷底
 *
 * 地形是噪音長出來的，谷底在哪要量：每六格取一點，比四周七格內都低（或一樣低）、
 * 而且附近夠平的就算谷底，由低到高挑，彼此隔二十四格以上。
 * 量的是拉平前的高度，與地形 worker 填階之後差不到一格，窪地本來就是平的那一片。
 * 音源（窪地裡的獨奏）與地形都要讀，所以在這裡算一次
 */
export interface SandPatch {
  x: number;
  z: number;
  radius: number;
}

const HOLLOW_COUNT_MAX = 6
const HOLLOW_SPACING = 24

function findHollowList(): SandPatch[] {
  const candidateList: { x: number; z: number; height: number }[] = []
  const searchRadius = 7

  for (let x = MEADOW_CENTER.x - 60; x <= MEADOW_CENTER.x + 60; x += 6) {
    for (let z = MEADOW_CENTER.z - 60; z <= MEADOW_CENTER.z + 60; z += 6) {
      if (Math.hypot(x - MEADOW_CENTER.x, z - MEADOW_CENTER.z) > MEADOW_SLOW_RADIUS - 12)
        continue
      if (Math.hypot(x - MEADOW_PORTAL_POINT.x, z - MEADOW_PORTAL_POINT.z) < 14)
        continue

      const height = measureRawHeight(x, z)
      let isValley = true
      let highest = height
      for (let offsetX = -searchRadius; offsetX <= searchRadius && isValley; offsetX += 2) {
        for (let offsetZ = -searchRadius; offsetZ <= searchRadius; offsetZ += 2) {
          const neighbour = measureRawHeight(x + offsetX, z + offsetZ)
          if (neighbour < height - 0.01) {
            isValley = false
            break
          }
          if (Math.abs(offsetX) <= 4 && Math.abs(offsetZ) <= 4)
            highest = Math.max(highest, neighbour)
        }
      }
      /** 窪地本身要平：中心四格內起伏不到一格半，沙才鋪得成一片 */
      if (isValley && highest - height < 1.5) {
        candidateList.push({ x, z, height })
      }
    }
  }

  candidateList.sort((a, b) => a.height - b.height)
  const hollowList: SandPatch[] = []
  for (const candidate of candidateList) {
    if (hollowList.length >= HOLLOW_COUNT_MAX)
      break
    if (hollowList.every((hollow) => Math.hypot(hollow.x - candidate.x, hollow.z - candidate.z) >= HOLLOW_SPACING)) {
      /** 第一處最大，其餘三格上下 */
      hollowList.push({ x: candidate.x, z: candidate.z, radius: hollowList.length === 0 ? 5 : 3 + (hollowList.length % 2) * 0.5 })
    }
  }
  return hollowList
}

export const MEADOW_HOLLOW_LIST: SandPatch[] = findHollowList()
