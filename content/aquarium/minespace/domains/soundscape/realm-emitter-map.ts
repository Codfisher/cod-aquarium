import type { RealmId } from '../realm/realm-definition'
import type { SoundEmitterDefinition } from './type'
import { ALPINE_EMITTER_DEFINITION_LIST } from '../realm/alpine/alpine-sounds'
import { AUTUMN_EMITTER_DEFINITION_LIST } from '../realm/autumn/autumn-sounds'
import { CAVE_EMITTER_DEFINITION_LIST } from '../realm/cave/cave-sounds'
import { COAST_EMITTER_DEFINITION_LIST } from '../realm/coast/coast-sounds'
import { FOREST_EMITTER_DEFINITION_LIST } from '../realm/forest/forest-sounds'
import { LAKE_EMITTER_DEFINITION_LIST } from '../realm/lake/lake-sounds'
import { MEADOW_EMITTER_DEFINITION_LIST } from '../realm/meadow/meadow-sounds'
import { PASTURE_EMITTER_DEFINITION_LIST } from '../realm/pasture/pasture-sounds'
import { RIVER_EMITTER_DEFINITION_LIST } from '../realm/river/river-sounds'
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
  wheatfield: WHEATFIELD_EMITTER_DEFINITION_LIST,
  meadow: MEADOW_EMITTER_DEFINITION_LIST,
  pasture: PASTURE_EMITTER_DEFINITION_LIST,
}
