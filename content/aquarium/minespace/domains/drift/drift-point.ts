import type { RealmDefinition } from '../realm/realm-definition'
import type { SoundEmitterDefinition } from '../soundscape/type'
import type { DriftGrid } from './drift-grid'
import type { DriftCellRef } from './drift-path'
import { isWaterBlock } from '../block/block-constants'
import { readBlock } from '../player/collision'
import { REALM_EMITTER_MAP } from '../soundscape/realm-emitter-map'
import { getWaterlineY } from '../world/world-access'
import { WORLD_HEIGHT, WORLD_SIZE } from '../world/world-constants'
import { getDriftRegion } from './drift-flight-config'
import { isCellReachable } from './drift-path'
import { itemAt } from './drift-util'

/**
 * 神遊的停留點（POI）
 *
 * 每次進神遊從現有資料推出來，不需要逐場景設定：
 * 音源（水聲、鳥、蟲，本來就是該停下來聽的地方）、傳送門與抵達點、
 * 從地形找出的開闊空地與水邊，再加場景自己補的觀景點。
 * 每個點都是「走得到的站立面」，走不到的（隔著深水的對岸、牆後、低矮通道裡）一律不收
 */

export type DriftPointKind = 'emitter' | 'portal' | 'arrival' | 'viewpoint' | 'waterside' | 'clearing'

export interface DriftPoint {
  id: string;
  kind: DriftPointKind;
  blockX: number;
  blockZ: number;
  blockY: number;
  /** 站立面高度（世界座標，腳底） */
  footY: number;
  /** 頭上沒有東西遮著，無人機只在這種點起降 */
  isOpenSky: boolean;
  /** 停下來時偏向看哪裡，沒有就看音源或隨意環顧 */
  lookX?: number;
  lookZ?: number;
}

/** 同名音源最多取幾個代表點 */
const EMITTER_PER_TITLE_MAX = 2
/** 找落腳點時，離原本座標最多往外找幾格 */
const SPOT_SEARCH_RADIUS = 8
/** 兩個停留點至少隔幾格，太近的後來者不收 */
const POINT_SPACING_MIN = 16
/** 從地形找停留點的取樣間距（格） */
const TERRAIN_SAMPLE_STEP = 8
/** 空地要多開闊：內外兩圈各八個方向都站得住的比例 */
const CLEARING_RING_RADIUS_LIST = [4, 8]
const CLEARING_PASS_RATIO = 0.85
/** 水邊：離水幾格內 */
const WATERSIDE_RADIUS = 3
/** 從地形找出的兩種點各最多留幾個 */
const TERRAIN_POINT_MAX = 6
/** 傳送門前停留的距離 */
const PORTAL_FRONT_DISTANCE = 6

const RING_DIRECTION_LIST = Array.from({ length: 8 }, (_, index) => ({
  dx: Math.cos((index / 8) * Math.PI * 2),
  dz: Math.sin((index / 8) * Math.PI * 2),
}))

/** 這座場景的音源資料（各大場景的資料夾各給一份） */
function listEmitterDefinition(realm: RealmDefinition): SoundEmitterDefinition[] {
  return REALM_EMITTER_MAP[realm.id] ?? []
}

/** 一個音源在神遊裡要用的欄位，估計響度時用 */
export interface DriftEmitter {
  x: number;
  z: number;
  volume: number;
  minDistance: number;
  maxDistance: number;
  activeAt?: 'day' | 'night';
}

/**
 * 這座場景的音源清單
 *
 * 音景在主執行緒，渲染端拿不到「此刻聽到什麼、多大聲」。這裡直接讀音源資料，
 * 用與音景同一條線性衰減（見 spatial-soundscape）估一個響度，夠用來挑一個偏向的方向
 */
export function listDriftEmitter(realm: RealmDefinition): DriftEmitter[] {
  return listEmitterDefinition(realm).map((definition) => ({
    x: definition.x,
    z: definition.z,
    volume: definition.volume,
    minDistance: definition.minDistance,
    maxDistance: definition.maxDistance,
    activeAt: definition.activeAt,
  }))
}

/** 某個位置此刻最響的音源，沒有聽得到的就是 null */
export function findLoudestEmitter(emitterList: DriftEmitter[], x: number, z: number, isDay: boolean): DriftEmitter | null {
  let loudest: DriftEmitter | null = null
  let loudestLevel = 0

  for (const emitter of emitterList) {
    if (emitter.activeAt === 'day' && !isDay)
      continue
    if (emitter.activeAt === 'night' && isDay)
      continue

    const distance = Math.hypot(emitter.x - x, emitter.z - z)
    const span = Math.max(0.001, emitter.maxDistance - emitter.minDistance)
    const level = emitter.volume * Math.min(1, Math.max(0, (emitter.maxDistance - distance) / span))
    if (level > loudestLevel) {
      loudestLevel = level
      loudest = emitter
    }
  }

  return loudest
}

/** 這一格柱上有沒有水 */
function hasWaterColumn(worldState: Uint8Array, blockX: number, blockZ: number): boolean {
  for (let blockY = WORLD_HEIGHT - 1; blockY >= 1; blockY--) {
    if (isWaterBlock(readBlock(worldState, blockX, blockY, blockZ)))
      return true
  }
  return false
}

interface CollectParam {
  realm: RealmDefinition;
  worldState: Uint8Array;
  grid: DriftGrid;
  reachedSet: Set<number>;
}

/** 從一個座標往外一圈一圈找走得到的乾地站立面，高度取最接近的那層 */
export function findReachableSpot(
  { grid, reachedSet }: Pick<CollectParam, 'grid' | 'reachedSet'>,
  x: number,
  z: number,
  height: number,
  maxRadius: number,
): DriftPoint | null {
  const centerX = Math.round(x)
  const centerZ = Math.round(z)

  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetZ)) !== radius)
          continue

        const blockX = centerX + offsetX
        const blockZ = centerZ + offsetZ
        const cell = grid.getCellAtHeight(blockX, blockZ, height)
        if (!cell || cell.waterDepth > 0)
          continue

        const ref: DriftCellRef = { blockX, blockZ, blockY: cell.blockY }
        if (!isCellReachable(reachedSet, ref))
          continue

        return {
          id: `${blockX},${blockZ}`,
          kind: 'clearing',
          blockX,
          blockZ,
          blockY: cell.blockY,
          footY: cell.footY,
          isOpenSky: cell.isOpenSky,
        }
      }
    }
  }

  return null
}

/** 取一座場景全部的停留點，由重要到次要，間距太近的後來者不收 */
export function collectDriftPoint(param: CollectParam): DriftPoint[] {
  const { realm, worldState, grid } = param
  const pointList: DriftPoint[] = []

  function addPoint(point: DriftPoint | null, kind: DriftPointKind, id: string, look?: { x: number; z: number }): boolean {
    if (!point)
      return false

    for (const existing of pointList) {
      if (Math.hypot(existing.blockX - point.blockX, existing.blockZ - point.blockZ) < POINT_SPACING_MIN)
        return false
    }
    pointList.push({ ...point, kind, id, lookX: look?.x, lookZ: look?.z })
    return true
  }

  /** 觀景點：場景作者挑的，最優先 */
  realm.driftViewpointList?.forEach((viewpoint, index) => {
    const height = getWaterlineY(worldState, viewpoint.x, viewpoint.z) - 0.5
    const spot = findReachableSpot(param, viewpoint.x, viewpoint.z, height, 3)
    const look = viewpoint.lookX !== undefined && viewpoint.lookZ !== undefined
      ? { x: viewpoint.lookX, z: viewpoint.lookZ }
      : undefined
    addPoint(spot, 'viewpoint', `viewpoint-${index}`, look)
  })

  /** 傳送門前與抵達點 */
  realm.portalList.forEach((portal, index) => {
    const sideList = portal.spanAxis === 'x'
      ? [{ x: portal.x, z: portal.z + PORTAL_FRONT_DISTANCE }, { x: portal.x, z: portal.z - PORTAL_FRONT_DISTANCE }]
      : [{ x: portal.x + PORTAL_FRONT_DISTANCE, z: portal.z }, { x: portal.x - PORTAL_FRONT_DISTANCE, z: portal.z }]
    for (const side of sideList) {
      const spot = findReachableSpot(param, side.x, side.z, portal.y, 3)
      if (addPoint(spot, 'portal', `portal-${index}`, { x: portal.x, z: portal.z }))
        break
    }
  })
  const spawn = realm.spawn
  addPoint(
    findReachableSpot(param, spawn.x, spawn.z, getWaterlineY(worldState, spawn.x, spawn.z) - 0.5, 4),
    'arrival',
    'arrival',
    { x: spawn.x + Math.sin(spawn.yaw) * 12, z: spawn.z + Math.cos(spawn.yaw) * 12 },
  )

  /** 音源：以標題去重，同名的取幾個彼此離得遠的代表點 */
  const titleMap = new Map<string, SoundEmitterDefinition[]>()
  for (const definition of listEmitterDefinition(realm)) {
    const key = definition.title['zh-hant']
    const group = titleMap.get(key) ?? []
    group.push(definition)
    titleMap.set(key, group)
  }
  for (const [title, group] of titleMap) {
    const representativeList: SoundEmitterDefinition[] = [itemAt(group, 0)]
    if (EMITTER_PER_TITLE_MAX > 1 && group.length > 1) {
      let farthest = itemAt(group, 0)
      for (const definition of group) {
        if (Math.hypot(definition.x - itemAt(group, 0).x, definition.z - itemAt(group, 0).z) > Math.hypot(farthest.x - itemAt(group, 0).x, farthest.z - itemAt(group, 0).z))
          farthest = definition
      }
      if (farthest !== itemAt(group, 0))
        representativeList.push(farthest)
    }

    representativeList.forEach((definition, index) => {
      const height = getWaterlineY(worldState, definition.x, definition.z) - 0.5
      const spot = findReachableSpot(param, definition.x, definition.z, height, SPOT_SEARCH_RADIUS)
      addPoint(spot, 'emitter', `emitter-${title}-${index}`, { x: definition.x, z: definition.z })
    })
  }

  /** 從地形找：水邊與空地，各取幾個彼此離得遠的 */
  const center = getDriftRegion(realm) ?? { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2, radius: WORLD_SIZE / 2 - 16 }
  const watersideList: DriftPoint[] = []
  const clearingList: DriftPoint[] = []

  for (let offsetX = -center.radius; offsetX <= center.radius; offsetX += TERRAIN_SAMPLE_STEP) {
    for (let offsetZ = -center.radius; offsetZ <= center.radius; offsetZ += TERRAIN_SAMPLE_STEP) {
      const blockX = Math.round(center.x + offsetX + (Math.random() - 0.5) * 4)
      const blockZ = Math.round(center.z + offsetZ + (Math.random() - 0.5) * 4)
      const cell = realm.isUnderground ? grid.getCellAtHeight(blockX, blockZ, 0) : grid.getTopCell(blockX, blockZ)
      if (!cell || cell.waterDepth > 0)
        continue
      if (!isCellReachable(param.reachedSet, { blockX, blockZ, blockY: cell.blockY }))
        continue

      const point: DriftPoint = {
        id: '',
        kind: 'clearing',
        blockX,
        blockZ,
        blockY: cell.blockY,
        footY: cell.footY,
        isOpenSky: cell.isOpenSky,
      }

      const isWaterside = RING_DIRECTION_LIST.some(({ dx, dz }) =>
        hasWaterColumn(worldState, Math.round(blockX + dx * WATERSIDE_RADIUS), Math.round(blockZ + dz * WATERSIDE_RADIUS)))
      if (isWaterside) {
        watersideList.push({ ...point, kind: 'waterside' })
        continue
      }

      if (cell.isOpenSky && isClearing(grid, blockX, blockZ, cell.footY))
        clearingList.push(point)
    }
  }

  /** 打散順序，免得每次進來都偏向地圖的同一角 */
  for (const [list, kind] of [[watersideList, 'waterside'], [clearingList, 'clearing']] as const) {
    shuffle(list)
    let taken = 0
    for (const point of list) {
      if (taken >= TERRAIN_POINT_MAX)
        break
      if (addPoint(point, kind, `${kind}-${point.blockX},${point.blockZ}`))
        taken++
    }
  }

  return pointList
}

function shuffle<T>(list: T[]): void {
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    const held = itemAt(list, index)
    list[index] = itemAt(list, other)
    list[other] = held
  }
}

/** 周圍兩圈各八個方向都站得住、頭上也開闊，才算空地 */
function isClearing(grid: DriftGrid, blockX: number, blockZ: number, footY: number): boolean {
  let passCount = 0
  let totalCount = 0
  for (const radius of CLEARING_RING_RADIUS_LIST) {
    for (const { dx, dz } of RING_DIRECTION_LIST) {
      totalCount++
      const cell = grid.getCellAtHeight(Math.round(blockX + dx * radius), Math.round(blockZ + dz * radius), footY)
      if (cell && cell.isOpenSky && cell.waterDepth === 0 && Math.abs(cell.footY - footY) <= 3)
        passCount++
    }
  }
  return passCount / totalCount >= CLEARING_PASS_RATIO
}
