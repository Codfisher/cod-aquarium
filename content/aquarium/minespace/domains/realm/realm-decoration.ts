import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../weather/atmosphere'
import type { BlockLightSource } from '../world/light-source'
import type { RealmId } from './realm-definition'
import { createAlpineAurora } from './alpine/alpine-aurora'
import { createAutumnGeese } from './autumn/autumn-geese'
import { createBlizzardLightPillars } from './blizzard/blizzard-light-pillars'
import { createCampfireComet } from './campfire/campfire-comet'
import { createCampfireFires } from './campfire/campfire-fires'
import { createCaveGlow } from './cave/cave-glow'
import { createCicadaCloudTower } from './cicada/cicada-cloud-tower'
import { createCoastSeaSparkle } from './coast/coast-sea-sparkle'
import { createForestFoxProcession } from './forest/forest-fox-procession'
import { createJigokuSkyGlow } from './jigoku/jigoku-sky-glow'
import { createJigokuSteam } from './jigoku/jigoku-steam'
import { createLakeMoonPath } from './lake/lake-moon-path'
import { createMeadowMeteors } from './meadow/meadow-meteors'
import { createRainvaleSheetLightning } from './rainvale/rainvale-sheet-lightning'
import { combineDecorationList } from './realm-signature-kit'
import { createWaterfallRainbow } from './river/waterfall-rainbow'
import { createRuinsColossi } from './ruins/ruins-colossi'
import { createRuinsRingedMoon } from './ruins/ruins-ringed-moon'
import { createSongbirdMurmuration } from './songbird/songbird-murmuration'
import { createSwampMoonHalo } from './swamp/swamp-moon-halo'
import { createVillageSkyLanterns } from './village/village-sky-lanterns'
import { createWheatfieldGalaxy } from './wheatfield/wheatfield-galaxy'

/**
 * 各大場景自己的渲染端裝飾（屬於世界層，換場景時跟著拆）
 *
 * 方塊畫不出來、又只屬於某一個場景的東西放這裡，例如地底湖窟洞頂幾千顆螢光蟲、石殿遺址遠處的巨像。
 * 新增一個就加一行；回傳的 dispose 由 createWorldLayer 登記收尾
 */
interface RealmDecorationParam {
  scene: Scene;
  worldState: Uint8Array;
  /** 此刻的天色，遠景那一類的裝飾（石殿遺址的巨像）要跟著日夜與霧色走 */
  atmosphere: AtmosphereState;
  /** 世界上的燈火（世界層已經掃過一次），白矇雪原的光柱要立在每一盞燈上方 */
  lightSourceList: BlockLightSource[];
}

const REALM_DECORATION_MAP: Partial<Record<RealmId, (param: RealmDecorationParam) => { dispose: () => void }>> = {
  alpine: createAlpineAurora,
  cave: createCaveGlow,
  campfire: createCampfireFires,
  jigoku: createJigokuSteam,
  ruins: createRuinsColossi,
}

/**
 * 各大場景的招牌景象：某個時段、某種天氣才出現的大景，每座場景一個（見 realm-signature-kit 與設計文件的「招牌景象」一節）
 *
 * 雪稜的極光與地底湖窟的螢光蟲洞頂是最早的兩個，登記在上面那張表；其餘的在這裡。
 * 與上面那張表分開，是因為有的場景兩邊都有（湯煙谷的蒸氣加火映、石殿遺址的巨像加環月）
 */
const REALM_SIGNATURE_MAP: Partial<Record<RealmId, (param: RealmDecorationParam) => { dispose: () => void }>> = {
  lake: createLakeMoonPath,
  coast: createCoastSeaSparkle,
  forest: createForestFoxProcession,
  autumn: createAutumnGeese,
  swamp: createSwampMoonHalo,
  village: createVillageSkyLanterns,
  river: createWaterfallRainbow,
  wheatfield: createWheatfieldGalaxy,
  meadow: createMeadowMeteors,
  campfire: createCampfireComet,
  ruins: createRuinsRingedMoon,
  jigoku: createJigokuSkyGlow,
  songbird: createSongbirdMurmuration,
  cicada: createCicadaCloudTower,
  rainvale: createRainvaleSheetLightning,
  blizzard: createBlizzardLightPillars,
}

export function createRealmDecoration(realmId: RealmId, param: RealmDecorationParam): { dispose: () => void } | null {
  const decorationList = [REALM_DECORATION_MAP[realmId], REALM_SIGNATURE_MAP[realmId]]
    .filter((create) => create !== undefined)
    .map((create) => create(param))
  return decorationList.length > 0 ? combineDecorationList(decorationList) : null
}
