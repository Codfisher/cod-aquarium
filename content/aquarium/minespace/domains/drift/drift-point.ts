import type { DriftFeature, RealmDefinition } from '../realm/realm-definition'
import type { SoundEmitterDefinition } from '../soundscape/type'
import type { DriftGrid } from './drift-grid'
import type { DriftSteps } from './drift-job'
import type { ReachedSet } from './drift-path'
import { BlockId } from '../block/block-constants'
import { REALM_EMITTER_MAP } from '../soundscape/realm-emitter-map'
import { getWaterlineY } from '../world/world-access'
import { WORLD_HEIGHT, WORLD_SIZE } from '../world/world-constants'
import { getDriftRegion } from './drift-flight-config'
import { isSightlineClear3D } from './drift-framing'
import { runStepsSync } from './drift-job'
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
  /** 這個停留點是為了欣賞哪個特色主體而設的（站在能看到它、距離合適的地方），路線偏好它、運鏡看它 */
  feature?: { name: string; x: number; y: number; z: number; weight: number };
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

/** 這一格柱上有沒有水（直接讀方塊陣列：這個函式一次取樣要問幾十柱） */
function hasWaterColumn(worldState: Uint8Array, blockX: number, blockZ: number): boolean {
  if (blockX < 0 || blockX >= WORLD_SIZE || blockZ < 0 || blockZ >= WORLD_SIZE)
    return false

  const base = blockX * WORLD_HEIGHT * WORLD_SIZE + blockZ
  for (let blockY = WORLD_HEIGHT - 1; blockY >= 1; blockY--) {
    const blockId = worldState[base + blockY * WORLD_SIZE]
    if (blockId === BlockId.WATER || blockId === BlockId.FLOWING_WATER)
      return true
  }
  return false
}

interface CollectParam {
  realm: RealmDefinition;
  worldState: Uint8Array;
  grid: DriftGrid;
  reachedSet: ReachedSet;
}

/** 從一個座標往外一圈一圈找走得到的乾地站立面，高度取最接近的那層 */
export function findReachableSpot(
  { grid, reachedSet }: Pick<CollectParam, 'grid' | 'reachedSet'>,
  x: number,
  z: number,
  height: number,
  maxRadius: number,
  /** 只要頭上開闊的地方（從空中降落時用：正下方是樹冠的話，鏡頭會穿過樹葉落下去） */
  isOpenSkyRequired = false,
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
        if (isOpenSkyRequired && !cell.isOpenSky)
          continue

        if (!isCellReachable(reachedSet, cell))
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

/** 一個特色主體最多取幾個觀賞站位 */
const FEATURE_STAND_MAX = 2
/** 沒給 viewpointList 時，繞主體找站位：試幾個方向、距離最遠取到幾格 */
const FEATURE_RING_COUNT = 12
const FEATURE_STAND_DISTANCE_MAX = 70

/** 特色主體的觀賞站位候選：作者給的優先，沒有就在適合欣賞的距離上繞一圈，挑看得到主體的 */
function findFeatureStandList(param: Pick<CollectParam, 'worldState'>, feature: DriftFeature): { x: number; z: number }[] {
  /**
   * 作者給的站點要真的看得到主體才用：雪稜雪原邊緣的岩稜擋在站點與雲海之間，站在那裡只看到一面石頭；
   * 一個站點都看不到就退回自己繞圈找
   */
  if (feature.viewpointList && feature.viewpointList.length > 0) {
    const visibleList = feature.viewpointList.filter((point) =>
      isSightlineClear3D(param.worldState, point.x, getWaterlineY(param.worldState, point.x, point.z) + 1, point.z, feature.x, feature.y, feature.z, Math.max(2, feature.size / 2 + 1)))
    if (visibleList.length > 0)
      return visibleList.slice(0, FEATURE_STAND_MAX)
  }

  const distance = Math.min(FEATURE_STAND_DISTANCE_MAX, (feature.viewDistance[0] + feature.viewDistance[1]) / 2)
  const startAngle = Math.random() * Math.PI * 2
  const standList: { x: number; z: number }[] = []
  for (let step = 0; step < FEATURE_RING_COUNT && standList.length < FEATURE_STAND_MAX; step++) {
    const angle = startAngle + (step / FEATURE_RING_COUNT) * Math.PI * 2
    const x = feature.x + Math.sin(angle) * distance
    const z = feature.z + Math.cos(angle) * distance
    const eyeY = getWaterlineY(param.worldState, x, z) + 1
    /** 主體周圍的幾格不算擋住（建物自己的牆、樹自己的樹幹） */
    if (isSightlineClear3D(param.worldState, x, eyeY, z, feature.x, feature.y, feature.z, Math.max(2, feature.size / 2 + 1)))
      standList.push({ x, z })
  }
  return standList
}

/** 從地形取樣找水邊與空地時，每取樣幾個點就讓出一次 */
const TERRAIN_YIELD_INTERVAL = 3

/** 取一座場景全部的停留點，由重要到次要，間距太近的後來者不收（一口氣跑完，見 collectDriftPointSteps） */
export function collectDriftPoint(param: CollectParam): DriftPoint[] {
  return runStepsSync(collectDriftPointSteps(param))
}

/** 取一座場景全部的停留點（分段版：每個區段、每幾個地形取樣點之間都可以讓出一幀）；結果與一口氣跑完的版本相同 */
export function* collectDriftPointSteps(param: CollectParam): DriftSteps<DriftPoint[]> {
  const { realm, worldState, grid } = param
  const pointList: DriftPoint[] = []

  function addPoint(point: DriftPoint | null, kind: DriftPointKind, id: string, look?: { x: number; z: number }, feature?: DriftPoint['feature']): boolean {
    if (!point)
      return false

    for (const existing of pointList) {
      if (Math.hypot(existing.blockX - point.blockX, existing.blockZ - point.blockZ) < POINT_SPACING_MIN)
        return false
    }
    pointList.push({ ...point, kind, id, lookX: look?.x, lookZ: look?.z, feature })
    return true
  }

  /** 觀景點：場景作者挑的，最優先 */
  for (const [index, viewpoint] of (realm.driftViewpointList ?? []).entries()) {
    const height = getWaterlineY(worldState, viewpoint.x, viewpoint.z) - 0.5
    const spot = findReachableSpot(param, viewpoint.x, viewpoint.z, height, 3)
    const look = viewpoint.lookX !== undefined && viewpoint.lookZ !== undefined
      ? { x: viewpoint.lookX, z: viewpoint.lookZ }
      : undefined
    addPoint(spot, 'viewpoint', `viewpoint-${index}`, look)
    yield
  }

  /**
   * 特色主體（溪流、瀑布、建物、遠景…）的觀賞站位：路線最優先去的地方
   *
   * 作者給了 viewpointList 就直接用；沒給就繞著主體在適合欣賞的距離上找走得到、而且看得到它的地方
   */
  for (const [index, feature] of (realm.driftFeatureList ?? []).entries()) {
    for (const [order, stand] of findFeatureStandList(param, feature).entries()) {
      const height = getWaterlineY(worldState, stand.x, stand.z) - 0.5
      const spot = findReachableSpot(param, stand.x, stand.z, height, 3)
      yield
      if (!spot)
        continue
      addPoint(spot, 'viewpoint', `feature-${index}-${order}`, { x: feature.x, z: feature.z }, { name: feature.name, x: feature.x, y: feature.y, z: feature.z, weight: feature.weight })
    }
    yield
  }

  /** 傳送門前與抵達點 */
  for (const [index, portal] of realm.portalList.entries()) {
    const sideList = portal.spanAxis === 'x'
      ? [{ x: portal.x, z: portal.z + PORTAL_FRONT_DISTANCE }, { x: portal.x, z: portal.z - PORTAL_FRONT_DISTANCE }]
      : [{ x: portal.x + PORTAL_FRONT_DISTANCE, z: portal.z }, { x: portal.x - PORTAL_FRONT_DISTANCE, z: portal.z }]
    for (const side of sideList) {
      const spot = findReachableSpot(param, side.x, side.z, portal.y, 3)
      yield
      if (addPoint(spot, 'portal', `portal-${index}`, { x: portal.x, z: portal.z }))
        break
    }
    yield
  }
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

    for (const [index, definition] of representativeList.entries()) {
      const height = getWaterlineY(worldState, definition.x, definition.z) - 0.5
      const spot = findReachableSpot(param, definition.x, definition.z, height, SPOT_SEARCH_RADIUS)
      yield
      addPoint(spot, 'emitter', `emitter-${title}-${index}`, { x: definition.x, z: definition.z })
    }
    yield
  }

  /** 從地形找：水邊與空地，各取幾個彼此離得遠的 */
  const center = getDriftRegion(realm) ?? { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2, radius: WORLD_SIZE / 2 - 16 }
  const watersideList: DriftPoint[] = []
  const clearingList: DriftPoint[] = []

  let sampleCount = 0
  for (let offsetX = -center.radius; offsetX <= center.radius; offsetX += TERRAIN_SAMPLE_STEP) {
    for (let offsetZ = -center.radius; offsetZ <= center.radius; offsetZ += TERRAIN_SAMPLE_STEP) {
      if (++sampleCount % TERRAIN_YIELD_INTERVAL === 0)
        yield

      const blockX = Math.round(center.x + offsetX + (Math.random() - 0.5) * 4)
      const blockZ = Math.round(center.z + offsetZ + (Math.random() - 0.5) * 4)
      const cell = realm.isUnderground ? grid.getCellAtHeight(blockX, blockZ, 0) : grid.getTopCell(blockX, blockZ)
      if (!cell || cell.waterDepth > 0)
        continue
      if (!isCellReachable(param.reachedSet, cell))
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
