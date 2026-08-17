import type { LocalizedText } from '../soundscape/type'
import { GARDEN_LIST } from '../garden/garden-layout'

export interface Landmark {
  id: string;
  title: LocalizedText;
  /** 聲音性質的一句話，選單上列在標題底下 */
  timbre: LocalizedText;
  icon: string;
  x: number;
  z: number;
}

/**
 * 地標清單
 *
 * 十七座箱庭散在兩百五十格見方的沙地上，全靠走的太累，
 * 選單裡提供直接跳過去的捷徑。落點預設是箱庭中心，
 * 中央被東西佔住的那幾座另外指定，實際高度由 findSafeStandingPosition 決定
 */
export const LANDMARK_LIST: Landmark[] = GARDEN_LIST.map((garden) => ({
  id: garden.id,
  title: garden.title,
  timbre: garden.timbre,
  icon: garden.icon,
  ...(garden.travelPoint ?? garden.center),
}))
