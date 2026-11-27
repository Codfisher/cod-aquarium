import type { RealmId } from './realm-definition'
import { generateWorld } from '../garden/garden-generator'
import { generateAlpineWorld } from './alpine/alpine-terrain'
import { generateApiaryWorld } from './apiary/apiary-terrain'
import { generateAutumnWorld } from './autumn/autumn-terrain'
import { generateBlizzardWorld } from './blizzard/blizzard-terrain'
import { generateCampfireWorld } from './campfire/campfire-terrain'
import { generateCaveWorld } from './cave/cave-terrain'
import { generateCicadaWorld } from './cicada/cicada-terrain'
import { generateCoastWorld } from './coast/coast-terrain'
import { generateForestWorld } from './forest/forest-terrain'
import { generateInsectWorld } from './insect/insect-terrain'
import { generateJigokuWorld } from './jigoku/jigoku-terrain'
import { generateLakeWorld } from './lake/lake-terrain'
import { generateMeadowWorld } from './meadow/meadow-terrain'
import { generatePastureWorld } from './pasture/pasture-terrain'
import { placePortalStructure } from './portal-terrain'
import { generateRainhallWorld } from './rainhall/rainhall-terrain'
import { generateRainvaleWorld } from './rainvale/rainvale-terrain'
import { HUB_REALM } from './realm-list'
import { generateRiverWorld } from './river/river-terrain'
import { generateRuinsWorld } from './ruins/ruins-terrain'
import { generateSongbirdWorld } from './songbird/songbird-terrain'
import { generateSwampWorld } from './swamp/swamp-terrain'
import { generateVillageWorld } from './village/village-terrain'
import { generateWheatfieldWorld } from './wheatfield/wheatfield-terrain'

/**
 * 大廳：原本的禪庭，再加上通往各個大場景的傳送門
 *
 * 門框排在整座禪庭生完之後，立在所屬箱庭木座邊上那一圈木地板上，
 * 那一圈本來就空著（花草與造景只在更裡面），不動箱庭的其他東西
 */
function generateHubWorld(state: Uint8Array): void {
  generateWorld(state)

  for (const portal of HUB_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}

/**
 * 各場景的地形生成器
 *
 * 只有地形 worker 引用這一支。設計文件把生成寫成 RealmDefinition 的 generate(state)，
 * 實作上拆了出來：各箱庭的造景程式有好幾千行，跟著定義一起被渲染端引用的話，
 * 整包會被打進渲染 worker，而渲染端從來不呼叫它。以場景 id 對應，效果相同
 */
const REALM_TERRAIN_MAP: Record<RealmId, (state: Uint8Array) => void> = {
  hub: generateHubWorld,
  lake: generateLakeWorld,
  coast: generateCoastWorld,
  forest: generateForestWorld,
  autumn: generateAutumnWorld,
  swamp: generateSwampWorld,
  village: generateVillageWorld,
  cave: generateCaveWorld,
  alpine: generateAlpineWorld,
  river: generateRiverWorld,
  wheatfield: generateWheatfieldWorld,
  meadow: generateMeadowWorld,
  pasture: generatePastureWorld,
  rainvale: generateRainvaleWorld,
  rainhall: generateRainhallWorld,
  blizzard: generateBlizzardWorld,
  campfire: generateCampfireWorld,
  ruins: generateRuinsWorld,
  jigoku: generateJigokuWorld,
  apiary: generateApiaryWorld,
  insect: generateInsectWorld,
  songbird: generateSongbirdWorld,
  cicada: generateCicadaWorld,
}

/** 往空白的方塊陣列填入該場景的地形 */
export function generateRealmTerrain(realmId: RealmId, state: Uint8Array): void {
  REALM_TERRAIN_MAP[realmId](state)
}
