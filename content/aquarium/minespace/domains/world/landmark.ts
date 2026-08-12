import type { LocalizedText } from '../soundscape/type'
import { ISLAND_BEACH_RADIUS, ISLAND_CENTER, ISLAND_WATER_RADIUS } from './biome'
import {
  CAMPFIRE_POSITION,
  PASTURE_CENTER,
  RAINVALE_POND,
  RUINS_CENTER,
  VILLAGE_CENTER,
} from './structure-generator'
import { CAVE_ENTRANCE } from './world-generator'

export interface Landmark {
  id: string;
  title: LocalizedText;
  icon: string;
  x: number;
  z: number;
}

/**
 * 地標清單
 *
 * 島有 192 格寬，全靠走的太累，
 * 選單裡提供直接跳到各區域的捷徑。落點高度由 findSafeStandingPosition 決定。
 */
export const LANDMARK_LIST: Landmark[] = [
  {
    id: 'meadow',
    title: { 'zh-hant': '中央草原', 'en': 'Central Meadow' },
    icon: 'i-material-symbols:grass',
    x: 90,
    z: 92,
  },
  {
    id: 'camp',
    title: { 'zh-hant': '林間營地', 'en': 'Forest Camp' },
    icon: 'i-material-symbols:local-fire-department',
    /** 站在營火旁邊，不要站在火上 */
    x: CAMPFIRE_POSITION.x - 3,
    z: CAMPFIRE_POSITION.z + 3,
  },
  {
    id: 'alpine',
    title: { 'zh-hant': '雪稜高地', 'en': 'Snow Ridge' },
    icon: 'i-material-symbols:landscape',
    x: 140,
    z: 50,
  },
  {
    id: 'cave',
    title: { 'zh-hant': '洞窟入口', 'en': 'Cave Entrance' },
    icon: 'i-material-symbols:dark-mode',
    x: CAVE_ENTRANCE.x - 3,
    z: CAVE_ENTRANCE.z + 4,
  },
  {
    id: 'village',
    title: { 'zh-hant': '石橋村', 'en': 'Stonebridge Village' },
    icon: 'i-material-symbols:home-work',
    x: VILLAGE_CENTER.x,
    z: VILLAGE_CENTER.z + 10,
  },
  {
    id: 'pasture',
    title: { 'zh-hant': '村外牧場', 'en': 'Village Pasture' },
    icon: 'i-material-symbols:pets',
    ...PASTURE_CENTER,
  },
  {
    id: 'ruins',
    title: { 'zh-hant': '石造遺跡', 'en': 'Stone Ruins' },
    icon: 'i-material-symbols:temple-buddhist',
    ...RUINS_CENTER,
  },
  {
    id: 'rainvale',
    title: { 'zh-hant': '長雨谷', 'en': 'Everrain Vale' },
    icon: 'i-material-symbols:rainy',
    x: RAINVALE_POND.x + 12,
    z: RAINVALE_POND.z + 6,
  },
  {
    id: 'swamp',
    title: { 'zh-hant': '霧氣沼澤', 'en': 'Misty Swamp' },
    icon: 'i-material-symbols:water-drop',
    x: 78,
    z: 146,
  },
  {
    id: 'coast',
    title: { 'zh-hant': '南方海岸', 'en': 'Southern Coast' },
    icon: 'i-material-symbols:waves',
    /** 落在沙灘中段，往南幾步就是海 */
    x: ISLAND_CENTER.x,
    z: ISLAND_CENTER.z + (ISLAND_BEACH_RADIUS + ISLAND_WATER_RADIUS) / 2,
  },
]
