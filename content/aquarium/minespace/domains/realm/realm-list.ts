import type { GardenGate } from './garden-gate'
import type { RealmDefinition, RealmId } from './realm-definition'
import { getGarden, SPAWN_POSITION } from '../garden/garden-layout'
import { ALPINE_HUB_GATE, ALPINE_REALM } from './alpine/alpine-realm'
import { APIARY_HUB_GATE, APIARY_REALM } from './apiary/apiary-realm'
import { AUTUMN_HUB_GATE, AUTUMN_REALM } from './autumn/autumn-realm'
import { BLIZZARD_HUB_GATE, BLIZZARD_REALM } from './blizzard/blizzard-realm'
import { CAMPFIRE_HUB_GATE, CAMPFIRE_REALM } from './campfire/campfire-realm'
import { CAVE_HUB_GATE, CAVE_REALM } from './cave/cave-realm'
import { CICADA_HUB_GATE, CICADA_REALM } from './cicada/cicada-realm'
import { COAST_HUB_GATE, COAST_REALM } from './coast/coast-realm'
import { FOREST_HUB_GATE, FOREST_REALM } from './forest/forest-realm'
import { INSECT_HUB_GATE, INSECT_REALM } from './insect/insect-realm'
import { JIGOKU_HUB_GATE, JIGOKU_REALM } from './jigoku/jigoku-realm'
import { LAKE_HUB_GATE, LAKE_REALM } from './lake/lake-realm'
import { MEADOW_HUB_GATE, MEADOW_REALM } from './meadow/meadow-realm'
import { PASTURE_HUB_GATE, PASTURE_REALM } from './pasture/pasture-realm'
import { RAINHALL_HUB_GATE, RAINHALL_REALM } from './rainhall/rainhall-realm'
import { RAINVALE_HUB_GATE, RAINVALE_REALM } from './rainvale/rainvale-realm'
import { RIVER_HUB_GATE, RIVER_REALM } from './river/river-realm'
import { RUINS_HUB_GATE, RUINS_REALM } from './ruins/ruins-realm'
import { SONGBIRD_HUB_GATE, SONGBIRD_REALM } from './songbird/songbird-realm'
import { SWAMP_HUB_GATE, SWAMP_REALM } from './swamp/swamp-realm'
import { VILLAGE_HUB_GATE, VILLAGE_REALM } from './village/village-realm'
import { WHEATFIELD_HUB_GATE, WHEATFIELD_REALM } from './wheatfield/wheatfield-realm'

const COAST_GARDEN = getGarden('coast')

/**
 * 大場景清單
 *
 * 每一座大場景住在自己的資料夾（domains/realm/<id>/），定義與大廳那一頭的門（createGardenGate）放在一起。
 * 新增一座就在這裡加一行：大廳的傳送門、場景清單與換場景鍵都從這份清單長出來
 */
const REALM_ENTRY_LIST: { realm: RealmDefinition; hubGate: GardenGate }[] = [
  { realm: LAKE_REALM, hubGate: LAKE_HUB_GATE },
  { realm: COAST_REALM, hubGate: COAST_HUB_GATE },
  { realm: FOREST_REALM, hubGate: FOREST_HUB_GATE },
  { realm: AUTUMN_REALM, hubGate: AUTUMN_HUB_GATE },
  { realm: SWAMP_REALM, hubGate: SWAMP_HUB_GATE },
  { realm: VILLAGE_REALM, hubGate: VILLAGE_HUB_GATE },
  { realm: CAVE_REALM, hubGate: CAVE_HUB_GATE },
  { realm: ALPINE_REALM, hubGate: ALPINE_HUB_GATE },
  { realm: RIVER_REALM, hubGate: RIVER_HUB_GATE },
  { realm: WHEATFIELD_REALM, hubGate: WHEATFIELD_HUB_GATE },
  { realm: MEADOW_REALM, hubGate: MEADOW_HUB_GATE },
  { realm: PASTURE_REALM, hubGate: PASTURE_HUB_GATE },
  { realm: RAINVALE_REALM, hubGate: RAINVALE_HUB_GATE },
  { realm: RAINHALL_REALM, hubGate: RAINHALL_HUB_GATE },
  { realm: BLIZZARD_REALM, hubGate: BLIZZARD_HUB_GATE },
  { realm: CAMPFIRE_REALM, hubGate: CAMPFIRE_HUB_GATE },
  { realm: RUINS_REALM, hubGate: RUINS_HUB_GATE },
  { realm: JIGOKU_REALM, hubGate: JIGOKU_HUB_GATE },
  { realm: APIARY_REALM, hubGate: APIARY_HUB_GATE },
  { realm: INSECT_REALM, hubGate: INSECT_HUB_GATE },
  { realm: SONGBIRD_REALM, hubGate: SONGBIRD_HUB_GATE },
  { realm: CICADA_REALM, hubGate: CICADA_HUB_GATE },
]

/**
 * 大廳：禪庭本身
 *
 * 氣氛設定整份留空，所有欄位都沿用原本的計算，外觀與沒有場景系統時一模一樣。
 *
 * 出生朝向與 createBabylonScene 的鏡頭一致：鏡頭擺在出生點上方三格、
 * 看向北邊二十格外低一格的地方，換算成俯仰是 atan(1 / 20)、偏航是 π（面向 -Z）。
 * 初次進場時不套用這組朝向（鏡頭建立時已經是這個方向），只有換場景回到大廳時才用
 */
export const HUB_REALM: RealmDefinition = {
  id: 'hub',
  title: { 'zh-hant': '禪庭', 'en': 'Zen Garden' },
  description: { 'zh-hant': '白沙上的一座座箱庭', 'en': 'Little gardens on white sand' },
  signCaption: { 'zh-hant': '回到白沙', 'en': 'Back to the sand' },
  icon: 'i-material-symbols:blur-on',
  spawn: {
    x: SPAWN_POSITION.x,
    z: SPAWN_POSITION.z,
    pitch: Math.atan2(1, 20),
    yaw: Math.PI,
  },
  isLooping: true,
  hasGardens: true,
  atmosphere: {},
  /** 回到大廳時是一陣帶著白沙氣味的暖白霧，夾著幾顆往上飄的細沙 */
  transition: {
    fogTint: [1, 0.99, 0.96],
    particleColor: [1, 0.96, 0.86],
    particleRise: 0.35,
    sound: 'wheat-wind',
  },
  /** 每座大場景所屬箱庭的木座邊上各一座門，見各場景的 hubGate */
  portalList: REALM_ENTRY_LIST.map((entry) => entry.hubGate.portal),
  swellArea: {
    centerX: COAST_GARDEN.center.x,
    centerZ: COAST_GARDEN.center.z,
    halfSize: COAST_GARDEN.halfSize,
  },
}

export const REALM_LIST: RealmDefinition[] = [HUB_REALM, ...REALM_ENTRY_LIST.map((entry) => entry.realm)]

/** 大廳裡的每一座門與它門前的落點，選單的快速前往要靠它避開門口 */
export const HUB_GATE_LIST: GardenGate[] = REALM_ENTRY_LIST.map((entry) => entry.hubGate)

const realmMap = new Map<RealmId, RealmDefinition>(REALM_LIST.map((realm) => [realm.id, realm]))

export function isRealmId(value: unknown): value is RealmId {
  return typeof value === 'string' && realmMap.has(value as RealmId)
}

/** 找不到就回大廳：交接資料裡可能留著已經拿掉的場景 */
export function getRealm(id: string | undefined): RealmDefinition {
  return (isRealmId(id) ? realmMap.get(id) : undefined) ?? HUB_REALM
}

/** 清單裡的下一個場景，開發用的換場景鍵靠它輪流切 */
export function getNextRealmId(id: RealmId): RealmId {
  const index = REALM_LIST.findIndex((realm) => realm.id === id)
  return REALM_LIST[(index + 1) % REALM_LIST.length]!.id
}
