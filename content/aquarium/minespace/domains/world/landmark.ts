import type { GardenDefinition } from '../garden/garden-layout'
import type { GardenGate } from '../realm/garden-gate'
import type { LocalizedText } from '../soundscape/type'
import { GARDEN_LIST } from '../garden/garden-layout'
import { HUB_GATE_LIST } from '../realm/realm-list'

export interface Landmark {
  id: string;
  title: LocalizedText;
  /** 聲音性質的一句話，選單上列在標題底下 */
  timbre: LocalizedText;
  icon: string;
  x: number;
  z: number;
  /** 落地後面向哪裡（偏航，弧度），不給就維持原本的朝向 */
  yaw?: number;
}

/**
 * 有傳送門的箱庭，快速前往落在門前幾格
 *
 * 門搬進箱庭、立在中央附近之後，落點若還是箱庭中心，人一落地就站在門口，
 * 甚至直接落進觸發範圍被送走。退到門前六格、面朝門：
 * 一落地看到的是門與整座箱庭，要不要穿過去由人自己決定
 */
const GATE_TRAVEL_DISTANCE = 6

function findGardenGate(garden: GardenDefinition): GardenGate | undefined {
  return HUB_GATE_LIST.find(({ portal }) => (
    Math.abs(portal.x - garden.center.x) <= garden.halfSize
    && Math.abs(portal.z - garden.center.z) <= garden.halfSize
  ))
}

/** 沿著「門 → 門前落點」那個方向退到 GATE_TRAVEL_DISTANCE，朝向沿用落點的（面朝門） */
function getGateTravelPoint(gate: GardenGate): { x: number; z: number; yaw: number } {
  const { portal, landingSpawn } = gate
  const deltaX = landingSpawn.x - portal.x
  const deltaZ = landingSpawn.z - portal.z
  const length = Math.hypot(deltaX, deltaZ) || 1

  return {
    x: Math.round(portal.x + (deltaX / length) * GATE_TRAVEL_DISTANCE),
    z: Math.round(portal.z + (deltaZ / length) * GATE_TRAVEL_DISTANCE),
    yaw: landingSpawn.yaw,
  }
}

/**
 * 地標清單
 *
 * 十八座箱庭散在兩百五十格見方的沙地上，全靠走的太累，
 * 選單裡提供直接跳過去的捷徑。落點預設是箱庭中心，
 * 中央被東西佔住的那幾座另外指定，有傳送門的那幾座落在門前（見 GATE_TRAVEL_DISTANCE）。
 * 實際高度由 findSafeStandingPosition 決定
 */
export const LANDMARK_LIST: Landmark[] = GARDEN_LIST.map((garden) => {
  const gate = findGardenGate(garden)

  return {
    id: garden.id,
    title: garden.title,
    timbre: garden.timbre,
    icon: garden.icon,
    ...(gate?.travelSpawn ?? (gate ? getGateTravelPoint(gate) : (garden.travelPoint ?? garden.center))),
  }
})
