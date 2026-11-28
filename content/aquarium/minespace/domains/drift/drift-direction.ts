import type { DriftFeature, DriftFeatureKind } from '../realm/realm-definition'
import { getDayPhase } from '../weather/day-night'

/**
 * 神遊的「導演」：什麼時候拍什麼、一次造訪怎麼拍、拍過的記下來
 *
 * drift-shot 管的是一個鏡位怎麼擺，這裡管的是鏡位之間的安排——全部是資料表：
 *
 * - 時段（DaySlot）：把一天分成五段，每一種特色主體在每一段各有權重（光源留給夜裡、遠景留給日出日落、
 *   正午去拍樹蔭與水），路線的目的地與視線的看點都乘上它；節奏也隨時段變（夜裡走得慢、停得久）
 * - 造訪計畫（VisitPlan）：鏡頭走到一個主體的觀賞站位之後怎麼拍——開場的一個運動（仰搖、繞弧、升降、沿線橫搖、定格），
 *   接一段鎖定構圖的細看（可以帶極慢的推近）。每一種主體有自己的候選清單，瀑布從潭面搖到頂、遠景升起來揭露、
 *   建物繞半圈、鳥居置中對稱
 * - 涵蓋紀錄（CoverageLedger）：哪個主體、從哪個方位、用哪種計畫拍過，是什麼時候。
 *   沒拍過的主體與沒拍過的方位加權，剛拍過的降權，同一個主體不連續用同一種計畫；
 *   一場三十到六十分鐘的神遊，每個主體都會從兩個以上的角度出現
 *
 * 這個檔案只有資料與純函式，不碰場景物件，Node 端的驗證腳本可以直接讀
 */

/** 一天的五個時段：白天（上午與下午）、正午、日出日落、晨昏的藍調、夜 */
export type DaySlot = 'day' | 'noon' | 'golden' | 'blue' | 'night'

/**
 * 晨昏的雲還燒著的時段（時刻零到一），整段都算日出日落
 *
 * 日夜的時段（getDayPhase）把日落切在 0.78、日出從 0.24 起算，那是照太陽本體訂的。
 * 但火燒雲的高峰在太陽下去之後：積雲燒到 0.778，高積雲到 0.79，卷雲最後一絲紅在 0.8 前後
 * （清晨對稱，從 0.2 開始；見 weather/twilight）。照原本的切法，最紅的那十幾秒鏡頭已經回到一般節奏、
 * 轉頭去看月亮了。這裡把日出日落的節奏與構圖延到雲熄掉為止
 */
const TWILIGHT_GOLDEN_RANGE_LIST: readonly (readonly [number, number])[] = [
  [0.2, 0.3],
  [0.71, 0.8],
]

/**
 * 燃燒強度多少以上，鏡頭開始多留一會兒、多看天；到多少是滿的
 *
 * 一般的晚霞（零點六五以下）照原本的日出日落拍；好看的傍晚才加碼
 */
const BURN_EMPHASIS_RANGE: readonly [number, number] = [0.5, 0.85]

/** 燃燒強度換成「加碼幾成」，零到一 */
export function getBurnEmphasis(burnIntensity: number): number {
  const [from, to] = BURN_EMPHASIS_RANGE
  const ratio = Math.min(1, Math.max(0, (burnIntensity - from) / (to - from)))
  return ratio * ratio * (3 - 2 * ratio)
}

/** 時刻（零到一）落在哪個時段 */
export function getDaySlot(timeOfDay: number): DaySlot {
  const time = ((timeOfDay % 1) + 1) % 1
  if (TWILIGHT_GOLDEN_RANGE_LIST.some(([from, to]) => time >= from && time < to))
    return 'golden'

  switch (getDayPhase(timeOfDay)) {
    case 'sunrise':
    case 'sunset':
      return 'golden'
    case 'dawn':
    case 'dusk':
      return 'blue'
    case 'night':
    case 'midnight':
      return 'night'
    case 'noon':
      return 'noon'
    default:
      return 'day'
  }
}

/** 一個時段的節奏：散步與飛行的巡航速度倍率、停留時間倍率 */
export interface DayPace {
  speedScale: number;
  lingerScale: number;
}

/**
 * 節奏隨一天變化
 *
 * 夜裡畫面暗、能看的是燈火與星空，鏡頭走得慢一些、停得久一些；晨昏介於兩者之間。
 * 日出日落的停留另有自己的長度（見 use-drift 的 LINGER_GOLDEN_*），這裡不再放大
 */
export const DAY_PACE_MAP: Record<DaySlot, DayPace> = {
  day: { speedScale: 1, lingerScale: 1 },
  noon: { speedScale: 1, lingerScale: 1 },
  golden: { speedScale: 0.95, lingerScale: 1 },
  blue: { speedScale: 0.9, lingerScale: 1.15 },
  night: { speedScale: 0.85, lingerScale: 1.3 },
}

/**
 * 造訪計畫：站在主體的觀賞站位時，開場做哪一個運動
 *
 * - tiltUp：視線從主體的底部慢慢搖到頂部（瀑布從潭面到瀑頂、老樹從樹幹到樹冠）
 * - orbit：沿著離主體固定距離的弧走一段，主體留在畫面裡，背景與前景慢慢錯開
 * - crane：鏡頭升高幾格再降回來，視線鎖在主體上（遠景升得高一些，越過近處的樹梢與岩稜）
 * - panAlong：沿著線狀的主體（溪、木棧、長廊）慢慢橫搖
 * - pushIn：定格，視野極慢地收窄（推近）
 * - hold：定格
 */
export type VisitPlanId = 'tiltUp' | 'orbit' | 'crane' | 'panAlong' | 'pushIn' | 'hold'

export interface VisitPlanChoice {
  id: VisitPlanId;
  weight: number;
}

export interface FeatureDirection {
  /** 各時段的權重倍率：路線的目的地與視線的看點都乘上它 */
  slotWeightMap: Record<DaySlot, number>;
  /** 造訪計畫的候選與權重；做不到的（沒有弧可走、頭上不露天、主體不夠高）由呼叫端剔除 */
  planList: VisitPlanChoice[];
  /** 軸線對稱的主體（鳥居、門）：置中構圖，不放三分線 */
  isCentered: boolean;
  /** 細看時視野收窄的幅度（零到一，零是不推近）：零點一是視野角度縮一成 */
  zoomDepth: number;
  /** 升降鏡位升高幾格（範圍） */
  craneHeightRange: readonly [number, number];
  /** 可以讓無人機繞著飛一圈（地標、建物、大樹；遠景與門不繞） */
  canAerialOrbit: boolean;
}

const CRANE_HEIGHT_DEFAULT: readonly [number, number] = [2.5, 4]
/** 遠景升得高一些：要越過近處的樹梢、岩稜，遠方才展得開 */
const CRANE_HEIGHT_VISTA: readonly [number, number] = [4, 6.5]

/**
 * 每一種特色主體怎麼拍
 *
 * 時段權重的想法（攝影的時間分配）：
 * - 日出日落：逆光的剪影與遠景最好看，遠景、地標、建物加權
 * - 晨昏與夜：能看的是光——燈、營火、岩漿、螢光大幅加權，白天它們只是一個不起眼的小東西；樹與瀑布在暗處沒有細節，降權
 * - 正午：頂光把開闊的地方壓平，改去樹蔭、水邊（樹、水、瀑布加權，遠景降權）
 */
export const FEATURE_DIRECTION_MAP: Record<DriftFeatureKind, FeatureDirection> = {
  water: {
    slotWeightMap: { day: 1, noon: 1.3, golden: 1.2, blue: 1, night: 0.8 },
    planList: [{ id: 'panAlong', weight: 3 }, { id: 'orbit', weight: 2 }, { id: 'pushIn', weight: 1.5 }, { id: 'crane', weight: 1 }, { id: 'hold', weight: 1 }],
    isCentered: false,
    zoomDepth: 0.08,
    craneHeightRange: CRANE_HEIGHT_DEFAULT,
    canAerialOrbit: true,
  },
  waterfall: {
    slotWeightMap: { day: 1, noon: 1.3, golden: 1, blue: 0.9, night: 0.6 },
    planList: [{ id: 'tiltUp', weight: 4 }, { id: 'orbit', weight: 1.5 }, { id: 'pushIn', weight: 1.5 }, { id: 'hold', weight: 0.5 }],
    isCentered: false,
    zoomDepth: 0.1,
    craneHeightRange: CRANE_HEIGHT_DEFAULT,
    canAerialOrbit: true,
  },
  structure: {
    slotWeightMap: { day: 1, noon: 0.9, golden: 1.2, blue: 1, night: 0.7 },
    planList: [{ id: 'orbit', weight: 3 }, { id: 'pushIn', weight: 2 }, { id: 'crane', weight: 1.5 }, { id: 'tiltUp', weight: 1.5 }, { id: 'panAlong', weight: 2 }, { id: 'hold', weight: 1 }],
    isCentered: false,
    zoomDepth: 0.1,
    craneHeightRange: CRANE_HEIGHT_DEFAULT,
    canAerialOrbit: true,
  },
  landmark: {
    slotWeightMap: { day: 1, noon: 0.9, golden: 1.3, blue: 1, night: 0.7 },
    planList: [{ id: 'orbit', weight: 3 }, { id: 'tiltUp', weight: 2 }, { id: 'crane', weight: 2 }, { id: 'pushIn', weight: 2 }, { id: 'hold', weight: 1 }],
    isCentered: false,
    zoomDepth: 0.1,
    craneHeightRange: CRANE_HEIGHT_DEFAULT,
    canAerialOrbit: true,
  },
  tree: {
    slotWeightMap: { day: 1, noon: 1.4, golden: 1.1, blue: 0.8, night: 0.5 },
    planList: [{ id: 'tiltUp', weight: 3 }, { id: 'orbit', weight: 3 }, { id: 'pushIn', weight: 1 }, { id: 'hold', weight: 1 }],
    isCentered: false,
    zoomDepth: 0.06,
    craneHeightRange: CRANE_HEIGHT_DEFAULT,
    canAerialOrbit: true,
  },
  vista: {
    slotWeightMap: { day: 1, noon: 0.7, golden: 1.8, blue: 1.4, night: 1 },
    planList: [{ id: 'crane', weight: 4 }, { id: 'pushIn', weight: 2 }, { id: 'hold', weight: 2 }],
    isCentered: false,
    zoomDepth: 0.12,
    craneHeightRange: CRANE_HEIGHT_VISTA,
    canAerialOrbit: false,
  },
  gate: {
    slotWeightMap: { day: 1, noon: 1, golden: 1, blue: 1, night: 0.8 },
    planList: [{ id: 'pushIn', weight: 4 }, { id: 'hold', weight: 2 }, { id: 'crane', weight: 1 }],
    isCentered: true,
    zoomDepth: 0.12,
    craneHeightRange: CRANE_HEIGHT_DEFAULT,
    canAerialOrbit: false,
  },
  light: {
    slotWeightMap: { day: 0.25, noon: 0.2, golden: 0.8, blue: 2.2, night: 3 },
    planList: [{ id: 'pushIn', weight: 3 }, { id: 'orbit', weight: 2.5 }, { id: 'hold', weight: 2 }],
    isCentered: false,
    zoomDepth: 0.12,
    craneHeightRange: CRANE_HEIGHT_DEFAULT,
    canAerialOrbit: true,
  },
}

/**
 * 這個主體此刻有沒有在「演出」
 *
 * 主體可以選填 activeAt（只在白天或只在夜裡才有看頭：夜裡才亮的燈、白天才有的光束）；
 * 沒填就是整天都在。認不得的值當成整天都在，資料那一側先加新值也不會出錯
 */
export function isFeatureActive(feature: DriftFeature, isDay: boolean): boolean {
  const { activeAt } = feature
  if (activeAt === 'day')
    return isDay
  if (activeAt === 'night')
    return !isDay
  return true
}

/** 一個主體在這個時段的權重倍率；不在演出的時段是零 */
export function getFeatureSlotWeight(feature: DriftFeature, slot: DaySlot, isDay: boolean): number {
  if (!isFeatureActive(feature, isDay))
    return 0
  return FEATURE_DIRECTION_MAP[feature.kind].slotWeightMap[slot]
}

/* ───────────────────────── 涵蓋紀錄 ───────────────────────── */

/** 方位分成幾份：鏡頭在主體的哪一側（八份，每份四十五度） */
export const COVERAGE_SECTOR_COUNT = 8
/** 沒拍過的主體、拍過但沒從這個方位拍過的主體，權重各乘多少 */
const NOVELTY_UNSEEN_FACTOR = 3
const NOVELTY_NEW_SECTOR_FACTOR = 1.6
/** 拍過的主體隔多久（秒）權重才完全回來，以及剛拍完時剩多少 */
const REVISIT_SECOND = 600
const REVISIT_WEIGHT_FLOOR = 0.12
/** 同一個主體上次用過的造訪計畫，這次的權重乘多少（幾乎不重複） */
const REPEAT_PLAN_FACTOR = 0.08

interface CoverageEntry {
  visitCount: number;
  lastVisitAt: number;
  /** 各方位拍過沒有 */
  sectorSeenList: boolean[];
  lastPlanId: string | null;
}

export interface CoverageLedger {
  /** 記一次造訪：哪個主體、鏡頭在它的哪個方位、用了哪種計畫（路上經過時看著它不算計畫，傳 null）、現在的時間（秒） */
  noteVisit: (feature: DriftFeature, sector: number, planId: string | null, now: number) => void;
  /** 這個主體從這個方位再拍一次有多新鮮：沒拍過最高，剛拍過最低，隔久了慢慢回到一 */
  getNovelty: (feature: DriftFeature, sector: number, now: number) => number;
  /** 這個計畫對這個主體的權重倍率：與上次相同就壓得很低 */
  getPlanFactor: (feature: DriftFeature, planId: string) => number;
  /** 除錯與驗證用：拍過幾個主體、其中幾個有兩個以上的方位 */
  summarize: () => { seenCount: number; multiAngleCount: number };
}

/** 鏡頭在主體的哪個方位（零到 COVERAGE_SECTOR_COUNT − 1） */
export function getCoverageSector(feature: { x: number; z: number }, cameraX: number, cameraZ: number): number {
  const angle = Math.atan2(cameraX - feature.x, cameraZ - feature.z)
  const turn = ((angle / (Math.PI * 2)) % 1 + 1) % 1
  return Math.floor(turn * COVERAGE_SECTOR_COUNT) % COVERAGE_SECTOR_COUNT
}

/**
 * 一場神遊的涵蓋紀錄
 *
 * 以主體物件本身當鍵（場景資料裡的那一個），所以同名的兩個主體不會混在一起；紀錄跟著這一場神遊結束
 */
export function createCoverageLedger(): CoverageLedger {
  const entryMap = new Map<DriftFeature, CoverageEntry>()

  function noteVisit(feature: DriftFeature, sector: number, planId: string | null, now: number) {
    const entry = entryMap.get(feature) ?? { visitCount: 0, lastVisitAt: now, sectorSeenList: Array.from({ length: COVERAGE_SECTOR_COUNT }, () => false), lastPlanId: null }
    entry.visitCount++
    entry.lastVisitAt = now
    entry.sectorSeenList[sector] = true
    if (planId !== null)
      entry.lastPlanId = planId
    entryMap.set(feature, entry)
  }

  function getNovelty(feature: DriftFeature, sector: number, now: number): number {
    const entry = entryMap.get(feature)
    if (!entry)
      return NOVELTY_UNSEEN_FACTOR

    const recovery = Math.min(1, Math.max(0, (now - entry.lastVisitAt) / REVISIT_SECOND))
    const recency = REVISIT_WEIGHT_FLOOR + (1 - REVISIT_WEIGHT_FLOOR) * recovery * recovery
    return recency * (entry.sectorSeenList[sector] ? 1 : NOVELTY_NEW_SECTOR_FACTOR)
  }

  function getPlanFactor(feature: DriftFeature, planId: string): number {
    return entryMap.get(feature)?.lastPlanId === planId ? REPEAT_PLAN_FACTOR : 1
  }

  function summarize(): { seenCount: number; multiAngleCount: number } {
    let multiAngleCount = 0
    for (const entry of entryMap.values()) {
      if (entry.sectorSeenList.filter(Boolean).length >= 2)
        multiAngleCount++
    }
    return { seenCount: entryMap.size, multiAngleCount }
  }

  return { noteVisit, getNovelty, getPlanFactor, summarize }
}
