import type { RealmId } from '../realm/realm-definition'
import type { SoundEmitterDefinition } from './type'
import { ALPINE_EMITTER_DEFINITION_LIST } from '../realm/alpine/alpine-sounds'
import { APIARY_EMITTER_DEFINITION_LIST } from '../realm/apiary/apiary-sounds'
import { AUTUMN_EMITTER_DEFINITION_LIST } from '../realm/autumn/autumn-sounds'
import { BLIZZARD_EMITTER_DEFINITION_LIST } from '../realm/blizzard/blizzard-sounds'
import { CAMPFIRE_EMITTER_DEFINITION_LIST } from '../realm/campfire/campfire-sounds'
import { CAVE_EMITTER_DEFINITION_LIST } from '../realm/cave/cave-sounds'
import { CICADA_EMITTER_DEFINITION_LIST } from '../realm/cicada/cicada-sounds'
import { COAST_EMITTER_DEFINITION_LIST } from '../realm/coast/coast-sounds'
import { FOREST_EMITTER_DEFINITION_LIST } from '../realm/forest/forest-sounds'
import { INSECT_EMITTER_DEFINITION_LIST } from '../realm/insect/insect-sounds'
import { JIGOKU_EMITTER_DEFINITION_LIST } from '../realm/jigoku/jigoku-sounds'
import { LAKE_EMITTER_DEFINITION_LIST } from '../realm/lake/lake-sounds'
import { MEADOW_EMITTER_DEFINITION_LIST } from '../realm/meadow/meadow-sounds'
import { PASTURE_EMITTER_DEFINITION_LIST } from '../realm/pasture/pasture-sounds'
import { RAINHALL_EMITTER_DEFINITION_LIST } from '../realm/rainhall/rainhall-sounds'
import { RAINVALE_EMITTER_DEFINITION_LIST } from '../realm/rainvale/rainvale-sounds'
import { RIVER_EMITTER_DEFINITION_LIST } from '../realm/river/river-sounds'
import { RUINS_EMITTER_DEFINITION_LIST } from '../realm/ruins/ruins-sounds'
import { SONGBIRD_EMITTER_DEFINITION_LIST } from '../realm/songbird/songbird-sounds'
import { SWAMP_EMITTER_DEFINITION_LIST } from '../realm/swamp/swamp-sounds'
import { VILLAGE_EMITTER_DEFINITION_LIST } from '../realm/village/village-sounds'
import { WHEATFIELD_EMITTER_DEFINITION_LIST } from '../realm/wheatfield/wheatfield-sounds'

/**
 * 各大場景的音源清單
 *
 * 清單本身放在各場景的資料夾（domains/realm/<id>/<id>-sounds.ts），這裡只負責對應。
 * 新增一座大場景就加一行；沒登記的場景（大廳）走禪庭那一大份 EMITTER_DEFINITION_LIST
 */
export const REALM_EMITTER_MAP: Partial<Record<RealmId, SoundEmitterDefinition[]>> = {
  lake: LAKE_EMITTER_DEFINITION_LIST,
  coast: COAST_EMITTER_DEFINITION_LIST,
  forest: FOREST_EMITTER_DEFINITION_LIST,
  autumn: AUTUMN_EMITTER_DEFINITION_LIST,
  swamp: SWAMP_EMITTER_DEFINITION_LIST,
  village: VILLAGE_EMITTER_DEFINITION_LIST,
  cave: CAVE_EMITTER_DEFINITION_LIST,
  alpine: ALPINE_EMITTER_DEFINITION_LIST,
  river: RIVER_EMITTER_DEFINITION_LIST,
  campfire: CAMPFIRE_EMITTER_DEFINITION_LIST,
  ruins: RUINS_EMITTER_DEFINITION_LIST,
  jigoku: JIGOKU_EMITTER_DEFINITION_LIST,
  wheatfield: WHEATFIELD_EMITTER_DEFINITION_LIST,
  meadow: MEADOW_EMITTER_DEFINITION_LIST,
  pasture: PASTURE_EMITTER_DEFINITION_LIST,
  rainvale: RAINVALE_EMITTER_DEFINITION_LIST,
  rainhall: RAINHALL_EMITTER_DEFINITION_LIST,
  blizzard: BLIZZARD_EMITTER_DEFINITION_LIST,
  apiary: APIARY_EMITTER_DEFINITION_LIST,
  insect: INSECT_EMITTER_DEFINITION_LIST,
  songbird: SONGBIRD_EMITTER_DEFINITION_LIST,
  cicada: CICADA_EMITTER_DEFINITION_LIST,
}
